import type { Code, Heading, Node, Root } from 'mdast'
import { remark } from 'remark'

export type DSLOpLabel = 'readonly' | 'mutating' | 'dangerous'

export type DSLOp = { type: string; label: DSLOpLabel } & Record<string, string | number | boolean>

const string: string = ''

export const DSLDef = [
  { type: 'REPLACE' as const, label: 'mutating', filePath: string, original: string, updated: string },
  { type: 'CREATE' as const, label: 'mutating', filePath: string, content: string },
  { type: 'DELETE' as const, label: 'dangerous', filePath: string },
  { type: 'READ' as const, label: 'readonly', filePath: string },
  { type: 'COMMAND' as const, label: 'dangerous', command: string }
] as const satisfies DSLOp[]

export type DSLDef = (typeof DSLDef)[number]

export interface ParseResult {
  ops: DSLDef[]
  rawText: string
  hasWork: boolean
  warnings: string[]
}

function cleanPath(pathStr: string): string {
  return pathStr.trim().replace(/^[`*]+|[`*]+$/g, '')
}

function getHeadingText(heading: Heading): string {
  return heading.children
    .map((c) => ('value' in c ? c.value : ''))
    .join('')
    .trim()
}

function findNextHeadingIndex(children: Node[], start: number): number {
  for (let i = start; i < children.length; i++) {
    const node = children[i]!
    if (node.type === 'heading' && (node as Heading).depth === 3) return i
  }
  return children.length
}

function findCodeOp(children: Node[], start: number, end: number): Code | null {
  for (let i = start; i < end; i++) {
    const node = children[i]!
    if (node.type === 'code') return node as Code
  }
  return null
}

export function parseDSL(input: string, plain: boolean = false): ParseResult {
  if (plain) {
    const ops: DSLDef[] = []
    const lines = input.split('\n')

    const warnings: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim()

      if (line.startsWith('!READ:')) {
        const filePath = cleanPath(line.slice('!READ:'.length))
        if (filePath) ops.push({ type: 'READ', label: 'readonly', filePath })
        else warnings.push('READ 块缺少文件路径')
      } else if (line.startsWith('!DELETE:')) {
        const filePath = cleanPath(line.slice('!DELETE:'.length))
        if (filePath) ops.push({ type: 'DELETE', label: 'dangerous', filePath })
        else warnings.push('DELETE 块缺少文件路径')
      } else if (line.startsWith('!COMMAND:')) {
        const command = line.slice('!COMMAND:'.length).trim()
        if (command) ops.push({ type: 'COMMAND', label: 'dangerous', command })
        else warnings.push('COMMAND 块缺少命令内容')
      } else if (line.startsWith('!CREATE:')) {
        const filePath = cleanPath(line.slice('!CREATE:'.length))
        const content: string[] = []

        while (++i < lines.length && lines[i]!.trim() !== '!END') content.push(lines[i]!)

        ops.push({ type: 'CREATE', label: 'mutating', filePath, content: content.join('\n') })
      } else if (line.startsWith('!REPLACE:')) {
        const filePath = cleanPath(line.slice('!REPLACE:'.length))
        const original: string[] = []
        const updated: string[] = []

        while (++i < lines.length && lines[i]!.trim() !== '<<<<<<< ORIGINAL');
        if (i === lines.length) {
          warnings.push(`REPLACE 块缺少有效冲突标记: ${filePath}`)
          continue
        }
        while (++i < lines.length && lines[i]!.trim() !== '=======') original.push(lines[i]!)
        if (i === lines.length) {
          warnings.push(`REPLACE 块缺少有效冲突标记: ${filePath}`)
          continue
        }
        while (++i < lines.length && lines[i]!.trim() !== '>>>>>>> UPDATED') updated.push(lines[i]!)
        if (i === lines.length) {
          warnings.push(`REPLACE 块缺少有效冲突标记: ${filePath}`)
          continue
        }

        ops.push({
          type: 'REPLACE',
          label: 'mutating',
          filePath,
          original: original.join('\n').trimEnd(),
          updated: updated.join('\n').trimEnd()
        })
      }
    }

    return { ops, rawText: input, hasWork: ops.length > 0, warnings }
  }

  const children = (remark().parse(input) as Root).children
  const ops: DSLDef[] = []
  const warnings: string[] = []

  let i = 0
  while (i < children.length) {
    const node = children[i]!
    if (node.type === 'heading' && (node as Heading).depth === 3) {
      const heading = node as Heading
      if (heading.depth !== 3) {
        i++
        continue
      }
      const content = getHeadingText(heading)
      const nextHeadingIndex = findNextHeadingIndex(children, i + 1)
      const codeNode = findCodeOp(children, i + 1, nextHeadingIndex)

      const colonIndex = content.indexOf(':')
      const typePart = (colonIndex === -1 ? content : content.slice(0, colonIndex)).trim().toUpperCase()
      const pathOrCommand = colonIndex === -1 ? '' : cleanPath(content.slice(colonIndex + 1).trim())

      if (typePart === 'REPLACE') {
        if (codeNode) {
          const codeText = codeNode.value
          const match = codeText.match(
            /^<<<<<<< ORIGINAL[ \t]*\r?\n([\s\S]*?)\r?\n^=======[ \t]*\r?\n([\s\S]*?)^>>>>>>> UPDATED[ \t]*$/m
          )
          if (match)
            ops.push({
              type: 'REPLACE',
              label: 'mutating',
              filePath: pathOrCommand,
              original: match[1]!.trimEnd(),
              updated: match[2]!.trimEnd()
            })
          else warnings.push(`REPLACE 块缺少有效冲突标记: ${pathOrCommand}`)
        } else warnings.push(`REPLACE 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'CREATE') {
        if (codeNode) ops.push({ type: 'CREATE', label: 'mutating', filePath: pathOrCommand, content: codeNode.value })
        else warnings.push(`CREATE 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'DELETE') {
        ops.push({ type: 'DELETE', label: 'dangerous', filePath: pathOrCommand })
      } else if (typePart === 'READ') {
        if (pathOrCommand) ops.push({ type: 'READ', label: 'readonly', filePath: pathOrCommand })
        else warnings.push('READ 块缺少文件路径')
      } else if (typePart === 'COMMAND') {
        if (pathOrCommand) ops.push({ type: 'COMMAND', label: 'dangerous', command: pathOrCommand })
        else if (codeNode) ops.push({ type: 'COMMAND', label: 'dangerous', command: codeNode.value.trimEnd() })
        else warnings.push('COMMAND 块缺少命令内容')
      } else {
        warnings.push(`未知 DSL 操作类型: ${typePart}`)
      }

      i = nextHeadingIndex
    } else {
      i++
    }
  }

  return { ops, rawText: input, hasWork: ops.length > 0, warnings }
}
