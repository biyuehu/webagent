import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import clipboard from 'clipboardy'
import { glob } from 'tinyglobby'
import ts from 'typescript'

export interface PackOptions {
  only?: boolean
  globs: string[]
  goal?: string
  tree?: boolean
  diff?: boolean
  plain?: boolean
}

function getGitIgnoredPaths(paths: string[], cwd: string = process.cwd()): Set<string> {
  if (paths.length === 0) return new Set()
  try {
    return new Set(
      execSync('git check-ignore --stdin', {
        cwd,
        input: paths.join('\n'),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      })
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    )
  } catch {
    return new Set()
  }
}

function isGitIgnored(targetPath: string, cwd: string = process.cwd()): boolean {
  try {
    execSync(`git check-ignore "${targetPath}"`, { cwd, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function collectPackedFiles(
  globs: string[],
  cwd: string = process.cwd()
): Promise<{ normalFiles: string[]; simplifyFiles: string[] }> {
  const rawNormalFiles: string[] = []
  const rawSimplifyFiles: string[] = []
  for (const rawGlob of globs) {
    const isSimplify = rawGlob.endsWith('#')
    const pattern = isSimplify ? rawGlob.slice(0, -1) : rawGlob
    const result = await glob(pattern, { onlyFiles: true, cwd })
    ;(isSimplify ? rawSimplifyFiles : rawNormalFiles).push(...result)
  }
  const ignoredSet = getGitIgnoredPaths(Array.from(new Set([...rawNormalFiles, ...rawSimplifyFiles])), cwd)
  return {
    normalFiles: Array.from(new Set(rawNormalFiles)).filter((file) => !ignoredSet.has(file)),
    simplifyFiles: Array.from(new Set(rawSimplifyFiles)).filter((file) => !ignoredSet.has(file))
  }
}

export function generateTree(dirPath: string = '.', depth: number = 3): string {
  const absoluteRootDir = path.resolve(dirPath)

  function walk(currentDir: string, currentDepth: number): string[] {
    if (currentDepth > depth) return []
    if (!fs.existsSync(currentDir)) return []

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    const lines: string[] = []

    for (const entry of entries) {
      if (entry.name === '.git') continue
      const fullPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(absoluteRootDir, fullPath)
      if (isGitIgnored(relativePath, absoluteRootDir)) continue
      const indent = '  '.repeat(currentDepth - 1)
      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`)
        lines.push(...walk(fullPath, currentDepth + 1))
      } else {
        lines.push(`${indent}${entry.name}`)
      }
    }
    return lines
  }

  return walk(absoluteRootDir, 1).join('\n')
}

export function extractSkeleton(code: string, fileName: string = 'file.ts'): string {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const printer = ts.createPrinter({ removeComments: false })

  function transformer<T extends ts.Node>(context: ts.TransformationContext) {
    return (rootNode: T) => {
      function visit(node: ts.Node): ts.Node | undefined {
        if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
          return node
        }

        if (ts.isFunctionDeclaration(node)) {
          return context.factory.updateFunctionDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            node.type,
            undefined
          )
        }

        if (ts.isClassDeclaration(node)) {
          const cleanedMembers = node.members.map((member) => {
            if (ts.isMethodDeclaration(member)) {
              return context.factory.updateMethodDeclaration(
                member,
                member.modifiers,
                member.asteriskToken,
                member.name,
                member.questionToken,
                member.typeParameters,
                member.parameters,
                member.type,
                undefined
              )
            }
            return member
          })
          return context.factory.updateClassDeclaration(
            node,
            node.modifiers,
            node.name,
            node.typeParameters,
            node.heritageClauses,
            cleanedMembers
          )
        }

        return ts.visitEachChild(node, visit, context)
      }
      return ts.visitNode(rootNode, visit)
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: *
  return printer.printFile(ts.transform(sourceFile, [transformer as any]).transformed[0] as ts.SourceFile)
}

export function getGitDiffForFiles(files: string[]): string {
  if (!files || files.length === 0) return ''

  const validFiles = files.filter((f) => fs.existsSync(f))
  if (validFiles.length === 0) return ''

  try {
    return execSync(`git diff HEAD -- ${validFiles.map((f) => `"${f}"`).join(' ')}`, { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

export async function packContext(options: PackOptions): Promise<void> {
  const { normalFiles, simplifyFiles } = await collectPackedFiles(options.globs, process.cwd())
  const sections: string[] = []

  if (!options.only) {
    sections.push(
      `# System Instruction\n` +
        `你是一个极度严谨的编程助手。如果你有自带沙盒，不要进入，按照我们的约定来。在工作模式下，务必使用以下 DSL 格式，务必确定格式` +
        (!options.plain
          ? `- 新建文件（文件必须不存在）使用 ### CREATE: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
            `- 新建文件夹（文件夹必须不存在）使用 ### CREATE: dirpath\n` +
            `- 覆盖写入文件（文件必须已存在）使用 ### WRITE: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
            `- 追加内容到文件末尾（文件必须已存在）使用 ### APPEND: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
            `- 插入内容到文件开头（文件必须已存在）使用 ### PREPEND: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
            `- 修改文件使用 ### REPLACE: filepath\n\`\`\`lang\n<<<<<<< ORIGINAL\n原始内容\n=======\n修改内容\n>>>>>>> UPDATED\n\`\`\`\n` +
            `- 删除文件或目录使用 ### DELETE: path\n` +
            `- 移动/重命名文件或目录（目标不能已存在）使用 ### MOVE: from -> to\n` +
            `- 复制文件或目录（目标不能已存在）使用 ### COPY: from -> to\n` +
            `- 读取文件或目录使用 ### READ: path\n` +
            `- 检查文件或目录是否存在使用 ### EXISTS: path\n` +
            `- 终端命令使用 ### COMMAND\n\`\`\`\ncommand1\ncommand2...\n\`\`\`\n`
          : `- 新建文件（文件必须不存在）使用 !CREATE: filepath\n...\n!END\n` +
            `- 新建文件夹（文件必须不存在）使用 !CREATE: dirpath\n` +
            `- 覆盖写入文件（文件必须已存在）使用 !WRITE: filepath\n...\n!END\n` +
            `- 追加内容到文件末尾（文件必须已存在）使用 !APPEND: filepath\n...\n!END\n` +
            `- 插入内容到文件开头（文件必须已存在）使用 !PREPEND: filepath\n...\n!END\n` +
            `- 修改文件使用 !REPLACE: filepath\n<<<<<<< ORIGINAL\n原始内容\n=======\n修改内容\n>>>>>>> UPDATED\n` +
            `- 删除文件或目录使用 !DELETE: path\n` +
            `- 移动/重命名使用 !MOVE: from -> to\n` +
            `- 复制文件或目录使用 !COPY: from -> to\n` +
            `- 读取文件或目录使用 !READ: path\n` +
            `- 检查文件或目录是否存在使用 !EXISTS: path\n` +
            `- 终端命令使用 !COMMAND: command（仅支持单行）\n`) +
        `工作模式下应在开头使用圆括号包裹"WORKACTION"（除掉引号），作为标记。并非所有时候都需工作模式，根据意图（如讨论、建议）判别该工作还是放松模式。放松模式为正常的内容响应格式交流。工作中需要什么请READ或COMMAND，不要瞎猜。REPLACE时为准确与唯一性请就近多选择几行匹配且不要漏掉字符，但是了应节约上下文除非是大改或有说明。修改AST简化文件时请先读取获取完整内容\n` +
        `修改任何文件前，确保你拥有正确的最新版内容（用户在你操作后可能会人工修改）否则先 READ 目标文件获取最新内容，确保 ORIGINAL 与文件实际内容逐字精确匹配。连续修改同一文件时可直接 REPLACE，切换文件或间隔较久未 READ 目标文件时，必须先 READ 获取最新内容再操作。工作模式下严格按 DSL 格式操作，不得添加非 DSL 内容；读取命令只用于请求，实际内容由系统或用户提供。当用户说"直接"或类似要求时，立即切换为放松模式，不再使用 DSL 或工作标记。每次回复前先确认是否直接回应用户需求，避免绕圈子或自行推测。\n` +
        `严格注意在REPLACE时，不要自作主张在改动面积很小时擅自整个替换，应当分为准确的多个部分进行多次替换。多次 REPLACE 同一文件时，后续的 original 必须基于前一次修改后的文件内容，否则会匹配失败。需要REPLACE整个文件时可直接使用WRITE\n` +
        `READ/EXISTS 操作必须严格与 REPLACE/CREATE/WRITE/APPEND/PREPEND/MOVE/COPY/DELETE 操作分离，严禁出现在同一次请求中，因为只读操作是在用户再次给出最新文件内容后才算请求成功才能进行下一步写入。` +
        (fs.existsSync('AGENT.txt') ? `以下为用户PROMPT：\n${fs.readFileSync('AGENT.txt', 'utf-8')}` : '')
    )
  }

  if (!options.only && options.tree) sections.push(`## 项目结构\n\`\`\`text\n${generateTree()}\n\`\`\``)

  const simplifySet = new Set(simplifyFiles)
  const allFiles = Array.from(new Set([...normalFiles, ...simplifySet]))
  const fileOps = allFiles
    .map((filePath) => {
      if (!fs.existsSync(filePath)) return ''
      const rawContent = fs.readFileSync(filePath, 'utf-8')
      const shouldSimplify = simplifySet.has(filePath)
      return `### \`${shouldSimplify ? `${filePath} (AST简化)` : filePath}\`\n\`\`\`${path.extname(filePath).slice(1) ?? 'ts'}\n${shouldSimplify ? extractSkeleton(rawContent, filePath) : rawContent}\n\`\`\``
    })
    .filter(Boolean)
    .join('\n\n')
  if (fileOps) sections.push(`## 焦点文件\n${fileOps}`)

  // if (options.diff && allFiles.length > 0) {
  //   const diffText = getGitDiffForFiles(allFiles)
  //   if (diffText) sections.push(`## 焦点文件未提交变更 (Git Diff)\n\`\`\`diff\n${diffText}\n\`\`\``)
  // }

  if (options.goal) sections.push(`## 当前任务目标\n${options.goal}`)
  const finalPrompt = sections.join('\n\n---\n\n')

  await clipboard.write(finalPrompt)
}
