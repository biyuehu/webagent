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
  { type: 'COMMAND' as const, label: 'dangerous', command: string },
  { type: 'EXISTS' as const, label: 'readonly', filePath: string },
  { type: 'MOVE' as const, label: 'mutating', from: string, to: string },
  { type: 'COPY' as const, label: 'mutating', from: string, to: string },
  { type: 'WRITE' as const, label: 'mutating', filePath: string, content: string },
  { type: 'APPEND' as const, label: 'mutating', filePath: string, content: string },
  { type: 'PREPEND' as const, label: 'mutating', filePath: string, content: string }
] as const satisfies DSLOp[]

export type DSLDef = (typeof DSLDef)[number]

export interface ParseResult {
  ops: DSLDef[]
  rawText: string
  hasWork: boolean
  warnings: string[]
}

export const op = {
  create: (filePath: string, content: string = ''): Extract<DSLDef, { type: 'CREATE' }> => ({
    type: 'CREATE',
    label: 'mutating',
    filePath,
    content
  }),
  delete: (filePath: string): Extract<DSLDef, { type: 'DELETE' }> => ({
    type: 'DELETE',
    label: 'dangerous',
    filePath
  }),
  replace: (filePath: string, original: string, updated: string): Extract<DSLDef, { type: 'REPLACE' }> => ({
    type: 'REPLACE',
    label: 'mutating',
    filePath,
    original,
    updated
  }),
  read: (filePath: string): Extract<DSLDef, { type: 'READ' }> => ({
    type: 'READ',
    label: 'readonly',
    filePath
  }),
  command: (command: string): Extract<DSLDef, { type: 'COMMAND' }> => ({
    type: 'COMMAND',
    label: 'dangerous',
    command
  }),
  exists: (filePath: string): Extract<DSLDef, { type: 'EXISTS' }> => ({
    type: 'EXISTS',
    label: 'readonly',
    filePath
  }),
  move: (from: string, to: string): Extract<DSLDef, { type: 'MOVE' }> => ({
    type: 'MOVE',
    label: 'mutating',
    from,
    to
  }),
  copy: (from: string, to: string): Extract<DSLDef, { type: 'COPY' }> => ({
    type: 'COPY',
    label: 'mutating',
    from,
    to
  }),
  write: (filePath: string, content: string): Extract<DSLDef, { type: 'WRITE' }> => ({
    type: 'WRITE',
    label: 'mutating',
    filePath,
    content
  }),
  append: (filePath: string, content: string): Extract<DSLDef, { type: 'APPEND' }> => ({
    type: 'APPEND',
    label: 'mutating',
    filePath,
    content
  }),
  prepend: (filePath: string, content: string): Extract<DSLDef, { type: 'PREPEND' }> => ({
    type: 'PREPEND',
    label: 'mutating',
    filePath,
    content
  })
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

function parsePlainCreate(
  lines: string[],
  i: number,
  filePath: string,
  warnings: string[]
): { ops: DSLDef[]; i: number } {
  const content: string[] = []
  let j = i + 1
  while (j < lines.length && lines[j]!.trim() !== '!END') {
    content.push(lines[j]!)
    j++
  }
  if (j >= lines.length) warnings.push(`CREATE 块缺少 !END 标记: ${filePath}`)
  else j++
  return { ops: [op.create(filePath, content.join('\n'))], i: j - 1 }
}

function parsePlainWrite(
  lines: string[],
  i: number,
  filePath: string,
  warnings: string[]
): { ops: DSLDef[]; i: number } {
  const content: string[] = []
  let j = i + 1
  while (j < lines.length && lines[j]!.trim() !== '!END') {
    content.push(lines[j]!)
    j++
  }
  if (j >= lines.length) warnings.push(`WRITE 块缺少 !END 标记: ${filePath}`)
  else j++
  return { ops: [op.write(filePath, content.join('\n'))], i: j - 1 }
}

function parsePlainAppend(
  lines: string[],
  i: number,
  filePath: string,
  warnings: string[]
): { ops: DSLDef[]; i: number } {
  const content: string[] = []
  let j = i + 1
  while (j < lines.length && lines[j]!.trim() !== '!END') {
    content.push(lines[j]!)
    j++
  }
  if (j >= lines.length) warnings.push(`APPEND 块缺少 !END 标记: ${filePath}`)
  else j++
  return { ops: [op.append(filePath, content.join('\n'))], i: j - 1 }
}

function parsePlainPrepend(
  lines: string[],
  i: number,
  filePath: string,
  warnings: string[]
): { ops: DSLDef[]; i: number } {
  const content: string[] = []
  let j = i + 1
  while (j < lines.length && lines[j]!.trim() !== '!END') {
    content.push(lines[j]!)
    j++
  }
  if (j >= lines.length) warnings.push(`PREPEND 块缺少 !END 标记: ${filePath}`)
  else j++
  return { ops: [op.prepend(filePath, content.join('\n'))], i: j - 1 }
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
        if (filePath) ops.push(op.read(filePath))
        else warnings.push('READ 块缺少文件路径')
      } else if (line.startsWith('!DELETE:')) {
        const filePath = cleanPath(line.slice('!DELETE:'.length))
        if (filePath) ops.push(op.delete(filePath))
        else warnings.push('DELETE 块缺少文件路径')
      } else if (line.startsWith('!EXISTS:')) {
        const filePath = cleanPath(line.slice('!EXISTS:'.length))
        if (filePath) ops.push(op.exists(filePath))
        else warnings.push('EXISTS 块缺少文件路径')
      } else if (line.startsWith('!COMMAND:')) {
        const command = line.slice('!COMMAND:'.length).trim()
        if (command) ops.push(op.command(command))
        else warnings.push('COMMAND 块缺少命令内容')
      } else if (line.startsWith('!CREATE:')) {
        const filePath = cleanPath(line.slice('!CREATE:'.length))
        const result = parsePlainCreate(lines, i, filePath, warnings)
        ops.push(...result.ops)
        i = result.i
      } else if (line.startsWith('!WRITE:')) {
        const filePath = cleanPath(line.slice('!WRITE:'.length))
        const result = parsePlainWrite(lines, i, filePath, warnings)
        ops.push(...result.ops)
        i = result.i
      } else if (line.startsWith('!APPEND:')) {
        const filePath = cleanPath(line.slice('!APPEND:'.length))
        const result = parsePlainAppend(lines, i, filePath, warnings)
        ops.push(...result.ops)
        i = result.i
      } else if (line.startsWith('!PREPEND:')) {
        const filePath = cleanPath(line.slice('!PREPEND:'.length))
        const result = parsePlainPrepend(lines, i, filePath, warnings)
        ops.push(...result.ops)
        i = result.i
      } else if (line.startsWith('!MOVE:')) {
        const rest = line.slice('!MOVE:'.length).trim()
        const sep = rest.indexOf(' -> ')
        if (sep === -1) warnings.push('MOVE 块格式错误，应为 !MOVE: from -> to')
        else {
          const from = cleanPath(rest.slice(0, sep))
          const to = cleanPath(rest.slice(sep + 4))
          if (from && to) ops.push(op.move(from, to))
          else warnings.push('MOVE 块缺少有效路径')
        }
      } else if (line.startsWith('!COPY:')) {
        const rest = line.slice('!COPY:'.length).trim()
        const sep = rest.indexOf(' -> ')
        if (sep === -1) warnings.push('COPY 块格式错误，应为 !COPY: from -> to')
        else {
          const from = cleanPath(rest.slice(0, sep))
          const to = cleanPath(rest.slice(sep + 4))
          if (from && to) ops.push(op.copy(from, to))
          else warnings.push('COPY 块缺少有效路径')
        }
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

        ops.push(op.replace(filePath, original.join('\n').trimEnd(), updated.join('\n').trimEnd()))
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
          if (match) ops.push(op.replace(pathOrCommand, match[1]!.trimEnd(), match[2]!.trimEnd()))
          else warnings.push(`REPLACE 块缺少有效冲突标记: ${pathOrCommand}`)
        } else warnings.push(`REPLACE 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'CREATE') {
        ops.push(op.create(pathOrCommand, codeNode?.value ?? ''))
      } else if (typePart === 'WRITE') {
        if (codeNode) ops.push(op.write(pathOrCommand, codeNode.value))
        else warnings.push(`WRITE 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'APPEND') {
        if (codeNode) ops.push(op.append(pathOrCommand, codeNode.value))
        else warnings.push(`APPEND 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'PREPEND') {
        if (codeNode) ops.push(op.prepend(pathOrCommand, codeNode.value))
        else warnings.push(`PREPEND 块缺少代码块: ${pathOrCommand}`)
      } else if (typePart === 'DELETE') {
        ops.push(op.delete(pathOrCommand))
      } else if (typePart === 'READ') {
        if (pathOrCommand) ops.push(op.read(pathOrCommand))
        else warnings.push('READ 块缺少文件路径')
      } else if (typePart === 'EXISTS') {
        if (pathOrCommand) ops.push(op.exists(pathOrCommand))
        else warnings.push('EXISTS 块缺少文件路径')
      } else if (typePart === 'COMMAND') {
        if (pathOrCommand) ops.push(op.command(pathOrCommand))
        else if (codeNode) ops.push(op.command(codeNode.value.trimEnd()))
        else warnings.push('COMMAND 块缺少命令内容')
      } else if (typePart === 'MOVE') {
        const sep = pathOrCommand.indexOf(' -> ')
        if (sep === -1) warnings.push('MOVE 块格式错误，应为 MOVE: from -> to')
        else {
          const from = cleanPath(pathOrCommand.slice(0, sep))
          const to = cleanPath(pathOrCommand.slice(sep + 4))
          if (from && to) ops.push(op.move(from, to))
          else warnings.push('MOVE 块缺少有效路径')
        }
      } else if (typePart === 'COPY') {
        const sep = pathOrCommand.indexOf(' -> ')
        if (sep === -1) warnings.push('COPY 块格式错误，应为 COPY: from -> to')
        else {
          const from = cleanPath(pathOrCommand.slice(0, sep))
          const to = cleanPath(pathOrCommand.slice(sep + 4))
          if (from && to) ops.push(op.copy(from, to))
          else warnings.push('COPY 块缺少有效路径')
        }
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
