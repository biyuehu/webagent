import type { Code, Heading, Node, Root } from 'mdast'
import { remark } from 'remark'

export type DSLBlock =
  | { type: 'REPLACE'; filePath: string; original: string; updated: string }
  | { type: 'CREATE'; filePath: string; content: string }
  | { type: 'DELETE'; filePath: string }
  | { type: 'READ'; filePath: string }
  | { type: 'COMMAND'; command: string }

export interface ParseResult {
  blocks: DSLBlock[]
  rawText: string
  hasWork: boolean
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

export function parseDSL(input: string): ParseResult {
  const children = (remark().parse(input) as Root).children
  const blocks: DSLBlock[] = []

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
      const colonIndex = content.indexOf(':')
      if (colonIndex === -1) {
        i++
        continue
      }
      const typePart = content.slice(0, colonIndex).trim().toUpperCase()
      const pathOrCommand = cleanPath(content.slice(colonIndex + 1).trim())

      const nextHeadingIndex = findNextHeadingIndex(children, i + 1)
      const codeNode = findCodeBlock(children, i + 1, nextHeadingIndex)

      if (typePart === 'REPLACE') {
        if (codeNode) {
          const codeText = codeNode.value
          const match = codeText.match(/<<<<<<< ORIGINAL\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> UPDATED/)
          if (match) {
            blocks.push({
              type: 'REPLACE',
              filePath: pathOrCommand,
              original: match[1]!.trimEnd(),
              updated: match[2]!.trimEnd()
            })
          }
        }
      } else if (typePart === 'CREATE') {
        if (codeNode) blocks.push({ type: 'CREATE', filePath: pathOrCommand, content: codeNode.value })
      } else if (typePart === 'DELETE') {
        blocks.push({ type: 'DELETE', filePath: pathOrCommand })
      } else if (typePart === 'READ') {
        if (pathOrCommand) blocks.push({ type: 'READ', filePath: pathOrCommand })
      } else if (typePart === 'COMMAND') {
        if (pathOrCommand) blocks.push({ type: 'COMMAND', command: pathOrCommand })
      }

      i = nextHeadingIndex
    } else {
      i++
    }
  }

  return { blocks, rawText: input, hasWork: blocks.length > 0 }
}
