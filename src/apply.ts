import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { DSLBlock } from './dsl'
import { findMatchLocation } from './matcher'
import { generateTree } from './pack'
import { type Either, left, right } from './types'

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function applyDSLBlock(block: DSLBlock): Either<string, undefined | string> {
  try {
    switch (block.type) {
      case 'CREATE': {
        ensureDirectoryExists(block.filePath)
        fs.writeFileSync(block.filePath, block.content, 'utf-8')
        return right(undefined)
      }

      case 'DELETE': {
        if (fs.existsSync(block.filePath)) {
          fs.unlinkSync(block.filePath)
        }
        return right(undefined)
      }

      case 'REPLACE': {
        if (!fs.existsSync(block.filePath)) {
          return left(`File not found: ${block.filePath}`)
        }

        const source = fs.readFileSync(block.filePath, 'utf-8')
        const match = findMatchLocation(source, block.original)

        if (match.strategy === 'NONE') {
          return left(`Search block match failed in ${block.filePath}`)
        }

        const before = source.slice(0, match.startIndex)
        const after = source.slice(match.endIndex)
        const updatedSource = before + block.updated + after

        fs.writeFileSync(block.filePath, updatedSource, 'utf-8')
        return right(undefined)
      }

      case 'COMMAND': {
        execSync(block.command, { stdio: 'inherit', encoding: 'utf-8' })
        return right(block.command)
      }

      case 'READ': {
        if (!fs.existsSync(block.filePath)) {
          return left(`Read target not found: ${block.filePath}`)
        }

        const stat = fs.statSync(block.filePath)
        if (stat.isDirectory()) {
          const tree = generateTree(block.filePath)
          return right(`### Directory: \`${block.filePath}\`\n\`\`\`text\n${tree}\n\`\`\``)
        }

        const content = fs.readFileSync(block.filePath, 'utf-8')
        const ext = path.extname(block.filePath).slice(1) || 'txt'
        return right(`### File: \`${block.filePath}\`\n\`\`\`${ext}\n${content}\n\`\`\``)
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return left(message)
  }
}
