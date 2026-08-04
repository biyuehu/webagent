import type { Code, Heading, Node, Root } from 'mdast'
import { remark } from 'remark'

export type DSLOpLabel = 'readonly' | 'mutating' | 'dangerous'

// export type CreateDSLOp<Type extends string, Label extends DSLOpLabel, Data extends object> = {
//   type: Type
//   readonly label: Label
// } & Data

export type DSLOp = { type: string; label: DSLOpLabel } & Record<string, string | number | boolean>

// export type DSLDef =
//   | CreateDSLOp<'REPLACE', 'mutating', { filePath: string; original: string; updated: string }>
//   | CreateDSLOp<'CREATE', 'mutating', { filePath: string; content: string }>
//   | CreateDSLOp<'DELETE', 'dangerous', { filePath: string }>
//   | CreateDSLOp<'READ', 'readonly', { filePath: string }>
//   | CreateDSLOp<'COMMAND', 'dangerous', { command: string }>

export const DSLDef = [
  { type: 'REPLACE', label: 'mutating', filePath: '', original: '', updated: '' }
] satisfies DSLOp[]

export type DSLDef = (typeof DSLDef)[number]

export interface ParseResult {
  blocks: DSLDef[]
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

function findCodeBlock(children: Node[], start: number, end: number): Code | null {
  for (let i = start; i < end; i++) {
    const node = children[i]!
    if (node.type === 'code') return node as Code
  }
  return null
}

export function parseDSL(input: string, markdown: boolean = true): ParseResult {
  if (!markdown) {
    const blocks: DSLDef[] = []
    const lines = input.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim()

      if (line.startsWith('!READ:'))
        blocks.push({ type: 'READ', label: 'readonly', filePath: cleanPath(line.slice('!READ:'.length)) })
      else if (line.startsWith('!DELETE:'))
        blocks.push({ type: 'DELETE', label: 'dangerous', filePath: cleanPath(line.slice('!DELETE:'.length)) })
      else if (line.startsWith('!COMMAND:'))
        blocks.push({ type: 'COMMAND', label: 'dangerous', command: line.slice('!COMMAND:'.length).trim() })
      else if (line.startsWith('!CREATE:')) {
        const filePath = cleanPath(line.slice('!CREATE:'.length))
        const content: string[] = []

        while (++i < lines.length && lines[i]!.trim() !== '!END') content.push(lines[i]!)

        blocks.push({ type: 'CREATE', label: 'mutating', filePath, content: content.join('\n') })
      } else if (line.startsWith('!REPLACE:')) {
        const filePath = cleanPath(line.slice('!REPLACE:'.length))
        const original: string[] = []
        const updated: string[] = []

        while (++i < lines.length && lines[i] !== '<<<<<<< ORIGINAL');
        while (++i < lines.length && lines[i] !== '=======') original.push(lines[i]!)
        while (++i < lines.length && lines[i] !== '>>>>>>> UPDATED') updated.push(lines[i]!)

        blocks.push({
          type: 'REPLACE',
          label: 'mutating',
          filePath,
          original: original.join('\n').trimEnd(),
          updated: updated.join('\n').trimEnd()
        })
      }
    }

    return { blocks, rawText: input, hasWork: blocks.length > 0, warnings: [] }
  }

  const children = (remark().parse(input) as Root).children
  const blocks: DSLDef[] = []
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
      const codeNode = findCodeBlock(children, i + 1, nextHeadingIndex)

      const colonIndex = content.indexOf(':')
      const typePart = (colonIndex === -1 ? content : content.slice(0, colonIndex)).trim().toUpperCase()
      const pathOrCommand = colonIndex === -1 ? '' : cleanPath(content.slice(colonIndex + 1).trim())

      if (typePart === 'REPLACE') {
        if (codeNode) {
          const codeText = codeNode.value
          const match = codeText.match(/<<<<<<< ORIGINAL\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)>>>>>>> UPDATED/)
          if (match)
            blocks.push({
              type: 'REPLACE',
              label: 'mutating',
              filePath: pathOrCommand,
              original: match[1]!.trimEnd(),
              updated: match[2]!.trimEnd()
            })
          else warnings.push(`REPLACE 块缺少有效冲突标记: ${pathOrCommand}`)
        } else warnings.push(`REPLACE 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'CREATE') {
        if (codeNode)
          blocks.push({ type: 'CREATE', label: 'mutating', filePath: pathOrCommand, content: codeNode.value })
        else warnings.push(`CREATE 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'DELETE') {
        blocks.push({ type: 'DELETE', label: 'dangerous', filePath: pathOrCommand })
      } else if (typePart === 'READ') {
        if (pathOrCommand) blocks.push({ type: 'READ', label: 'readonly', filePath: pathOrCommand })
        else warnings.push('READ 块缺少文件路径')
      } else if (typePart === 'COMMAND') {
        if (pathOrCommand) blocks.push({ type: 'COMMAND', label: 'dangerous', command: pathOrCommand })
        else if (codeNode) blocks.push({ type: 'COMMAND', label: 'dangerous', command: codeNode.value.trimEnd() })
        else warnings.push('COMMAND 块缺少命令内容')
      } else {
        warnings.push(`未知 DSL 操作类型: ${typePart}`)
      }

      i = nextHeadingIndex
    } else {
      i++
    }
  }

  return { blocks, rawText: input, hasWork: blocks.length > 0, warnings }
}
