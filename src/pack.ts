import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import clipboard from 'clipboardy'
import glob from 'fast-glob'
import ts from 'typescript'

export interface PackOptions {
  files: string[]
  simplifyFiles?: string[]
  goal?: string
  tree?: boolean
  diff?: boolean
  copy?: boolean
}

function getGitIgnoredPaths(paths: string[], cwd: string = process.cwd()): Set<string> {
  if (paths.length === 0) return new Set()
  try {
    const input = paths.join('\n')
    const stdout = execSync('git check-ignore --stdin', {
      cwd,
      input,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    })
    const ignoredList = stdout
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
    return new Set(ignoredList)
  } catch {
    return new Set()
  }
}

function isGitIgnored(targetPath: string, cwd: string = process.cwd()): boolean {
  try {
    execSync(`git check-ignore "${targetPath}"`, {
      cwd,
      stdio: 'ignore'
    })
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

    const matched = await glob(pattern, {
      onlyFiles: true,
      cwd
    })

    if (isSimplify) {
      rawSimplifyFiles.push(...matched)
    } else {
      rawNormalFiles.push(...matched)
    }
  }

  const allMatched = Array.from(new Set([...rawNormalFiles, ...rawSimplifyFiles]))
  const ignoredSet = getGitIgnoredPaths(allMatched, cwd)

  const normalFiles = Array.from(new Set(rawNormalFiles)).filter((file) => !ignoredSet.has(file))
  const simplifyFiles = Array.from(new Set(rawSimplifyFiles)).filter((file) => !ignoredSet.has(file))

  return { normalFiles, simplifyFiles }
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

      if (isGitIgnored(relativePath, absoluteRootDir)) {
        continue
      }

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

  return printer.printFile(ts.transform(sourceFile, [transformer as any]).transformed[0] as ts.SourceFile)
}

export function getGitDiffForFiles(files: string[]): string {
  if (!files || files.length === 0) return ''

  const validFiles = files.filter((f) => fs.existsSync(f))
  if (validFiles.length === 0) return ''

  try {
    const command = `git diff HEAD -- ${validFiles.map((f) => `"${f}"`).join(' ')}`
    return execSync(command, { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

export async function packContext(options: PackOptions): Promise<string> {
  const sections: string[] = []

  sections.push(
    `# System Instruction\n` +
      `你是一个极度严谨的编程助手。如果你有自带沙盒，不要进入，按照我们的约定来。在工作模式下，务必使用以下 DSL 格式，务必确定格式正确：\n` +
      `- 局部修改使用 \`### REPLACE: filepath\n<<<<<<< ORIGINAL\n原始内容\n=======\n修改内容\n>>>>>>> UPDATED\`\n` +
      `- 新建文件使用 \`### CREATE: filepath\` ... \`### END\`\n` +
      `- 删除文件使用 \`### DELETE: filepath\`\n` +
      `- 读取文件/目录使用 \`### READ: filepath_or_dirpath\`\n` +
      `- 建议终端命令使用 \`### COMMAND: command\`\n` +
      `工作模式下应在开头使用圆括号包裹"WORKACTION"（除掉引号），作为标记。并非所有时候都需工作模式，根据意图（如讨论、建议）判别该工作还是放松模式。放松模式为正常的内容响应格式交流。工作中需要什么请读取或要求，不要瞎猜。REPLACE时为准确与唯一性请就近多选择几行匹配且不要漏掉字符。修改AST简化文件时请先读取获取完整内容\n` +
      (fs.existsSync('AGENT.txt') ? `以下为用户PROMPT：\n${fs.readFileSync('AGENT.txt', 'utf-8')}` : '')
  )

  if (options.tree) sections.push(`## 项目文件结构\n\`\`\`text\n${generateTree()}\n\`\`\``)

  const simplifySet = new Set(options.simplifyFiles || [])
  const allFiles = Array.from(new Set([...(options.files || []), ...simplifySet]))

  if (allFiles.length > 0) {
    const fileBlocks: string[] = []

    for (const filePath of allFiles) {
      if (!fs.existsSync(filePath)) continue
      const rawContent = fs.readFileSync(filePath, 'utf-8')

      const shouldSimplify = simplifySet.has(filePath)
      const content = shouldSimplify ? extractSkeleton(rawContent, filePath) : rawContent

      const ext = path.extname(filePath).slice(1) || 'ts'
      const label = shouldSimplify ? `${filePath} (AST Simplified)` : filePath
      fileBlocks.push(`### File: \`${label}\`\n\`\`\`${ext}\n${content}\n\`\`\``)
    }

    if (fileBlocks.length > 0) {
      sections.push(`## 焦点文件上下文\n${fileBlocks.join('\n\n')}`)
    }
  }

  if (options.diff && allFiles.length > 0) {
    const diffText = getGitDiffForFiles(allFiles)
    if (diffText) sections.push(`## 焦点文件未提交变更 (Git Diff)\n\`\`\`diff\n${diffText}\n\`\`\``)
  }

  if (options.goal) sections.push(`## 当前任务目标\n${options.goal}`)
  const finalPrompt = sections.join('\n\n---\n\n')

  if (options.copy !== false) await clipboard.write(finalPrompt)

  return finalPrompt
}
