import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import clipboard from 'clipboardy'
import { glob } from 'tinyglobby'
import ts from 'typescript'
import { buildSystemPrompt } from './prompt'

export interface PackOptions {
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

  sections.push(await buildSystemPrompt(options.plain))

  if (options.tree) sections.push(`## 项目结构\n\`\`\`text\n${generateTree()}\n\`\`\``)

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

  if (options.goal) sections.push(`## 当前任务目标\n${options.goal}`)
  const finalPrompt = sections.join('\n\n---\n\n')

  await clipboard.write(finalPrompt)
}
