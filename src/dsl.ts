export type DSLBlock =
  | {
      type: 'REPLACE'
      filePath: string
      original: string
      updated: string
    }
  | {
      type: 'CREATE'
      filePath: string
      content: string
    }
  | {
      type: 'DELETE'
      filePath: string
    }
  | {
      type: 'READ'
      filePath: string
    }
  | {
      type: 'COMMAND'
      command: string
    }

export interface ParseResult {
  blocks: DSLBlock[]
  rawText: string
  hasWork: boolean
}

function cleanPath(pathStr: string): string {
  return pathStr.trim().replace(/^[`*]+|[`*]+$/g, '')
}

export function parseDSL(input: string): ParseResult {
  const lines = input.split(/\r?\n/)
  const blocks: DSLBlock[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()

    if (line.startsWith('### REPLACE:')) {
      const filePath = cleanPath(line.slice('### REPLACE:'.length))
      i++

      while (i < lines.length && !lines[i]?.trim().startsWith('<<<<<<< ORIGINAL')) {
        i++
      }
      if (i >= lines.length) break
      i++

      const originalLines: string[] = []
      while (i < lines.length && !lines[i]?.trim().startsWith('=======')) {
        originalLines.push(lines[i]!)
        i++
      }
      if (i >= lines.length) break
      i++

      const updatedLines: string[] = []
      while (i < lines.length && !lines[i]?.trim().startsWith('>>>>>>> UPDATED')) {
        updatedLines.push(lines[i]!)
        i++
      }

      blocks.push({
        type: 'REPLACE',
        filePath,
        original: originalLines.join('\n'),
        updated: updatedLines.join('\n')
      })
    } else if (line.startsWith('### CREATE:')) {
      const filePath = cleanPath(line.slice('### CREATE:'.length))
      i++

      const contentLines: string[] = []
      while (i < lines.length) {
        const currentLine = lines[i]!
        const trimmed = currentLine.trim()

        if (
          trimmed === '### END' ||
          trimmed === '```' ||
          trimmed.startsWith('### REPLACE:') ||
          trimmed.startsWith('### CREATE:') ||
          trimmed.startsWith('### DELETE:') ||
          trimmed.startsWith('### READ:') ||
          trimmed.startsWith('### COMMAND:')
        ) {
          if (trimmed === '### END') {
            i++
          }
          break
        }
        contentLines.push(currentLine)
        i++
      }

      blocks.push({
        type: 'CREATE',
        filePath,
        content: contentLines.join('\n')
      })
      continue
    } else if (line.startsWith('### DELETE:')) {
      const filePath = cleanPath(line.slice('### DELETE:'.length))
      blocks.push({
        type: 'DELETE',
        filePath
      })
    } else if (line.startsWith('### READ:')) {
      const filePath = cleanPath(line.slice('### READ:'.length))
      if (filePath) {
        blocks.push({
          type: 'READ',
          filePath
        })
      }
    } else if (line.startsWith('### COMMAND:')) {
      const command = line.slice('### COMMAND:'.length).trim()
      if (command) {
        blocks.push({
          type: 'COMMAND',
          command
        })
      }
    }

    i++
  }

  return {
    blocks,
    rawText: input,
    hasWork: blocks.length > 0
  }
}
