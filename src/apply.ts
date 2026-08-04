import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { DSLDef } from './dsl'
import { generateTree } from './pack'
import { type Either, left, right } from './types'

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function applyDSLDef(op: DSLDef): Either<string, undefined | string> {
  try {
    switch (op.type) {
      case 'CREATE': {
        if (fs.existsSync(op.filePath)) return left(`File already exists: ${op.filePath}`)
        ensureDirectoryExists(op.filePath)
        fs.writeFileSync(op.filePath, op.content, 'utf-8')
        return right(undefined)
      }
      case 'DELETE': {
        if (fs.existsSync(op.filePath)) fs.unlinkSync(op.filePath)
        return right(undefined)
      }
      case 'REPLACE': {
        if (!fs.existsSync(op.filePath)) return left(`File not found: ${op.filePath}`)
        const source = fs.readFileSync(op.filePath, 'utf-8').replace(/\r\n/g, '\n')
        const index = source.indexOf(op.original.replace(/\r\n/g, '\n'))
        if (index === -1) return left(`Original not found in ${op.filePath}`)
        if (source.indexOf(op.original.replace(/\r\n/g, '\n'), index + 1) !== -1) {
          return left(`Original found multiple times in ${op.filePath}`)
        }
        fs.writeFileSync('cache1', op.original.replace(/\r\n/g, '\n'))
        fs.writeFileSync('cache2', op.updated.replace(/\r\n/g, '\n'))
        fs.writeFileSync(
          op.filePath,
          source.replace(op.original.replace(/\r\n/g, '\n'), op.updated.replace(/\r\n/g, '\n')),
          'utf-8'
        )
        return right(undefined)
      }
      case 'COMMAND': {
        execSync(op.command, { stdio: 'inherit', encoding: 'utf-8' })
        return right(op.command)
      }
      case 'READ': {
        if (!fs.existsSync(op.filePath)) return left(`Read target not found: ${op.filePath}`)
        const stat = fs.statSync(op.filePath)
        if (stat.isDirectory()) {
          const tree = generateTree(op.filePath)
          return right(`### Directory: \`${op.filePath}\`\n\`\`\`text\n${tree}\n\`\`\``)
        }
        return right(
          `### File: \`${op.filePath}\`\n\`\`\`${path.extname(op.filePath).slice(1) || 'txt'}\n${fs.readFileSync(op.filePath, 'utf-8')}\n\`\`\``
        )
      }
    }
  } catch (err) {
    return left(err instanceof Error ? err.message : String(err))
  }
}
