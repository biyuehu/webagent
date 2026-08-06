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

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    ensureDirectoryExists(dest)
    fs.copyFileSync(src, dest)
  }
}

function moveRecursive(src: string, dest: string): void {
  fs.renameSync(src, dest)
}

export function applyDSLDef(op: DSLDef): Either<string, undefined | string> {
  try {
    switch (op.type) {
      case 'CREATE': {
        if (fs.existsSync(op.filePath)) return left(`Target already exists: ${op.filePath}`)
        if (op.content === '') {
          fs.mkdirSync(op.filePath, { recursive: true })
          return right(undefined)
        }
        ensureDirectoryExists(op.filePath)
        fs.writeFileSync(op.filePath, op.content, 'utf-8')
        return right(undefined)
      }
      case 'DELETE': {
        if (!fs.existsSync(op.filePath)) return right(undefined)
        const stat = fs.statSync(op.filePath)
        if (stat.isDirectory()) fs.rmSync(op.filePath, { recursive: true })
        else fs.unlinkSync(op.filePath)
        return right(undefined)
      }
      case 'REPLACE': {
        if (!fs.existsSync(op.filePath)) return left(`File not found: ${op.filePath}`)
        const source = fs.readFileSync(op.filePath, 'utf-8').replace(/\r\n/g, '\n')
        const original = op.original.replace(/\r\n/g, '\n')
        const index = source.indexOf(original)
        if (index === -1) return left(`Original not found in ${op.filePath}`)
        if (source.indexOf(original, index + 1) !== -1) return left(`Original found multiple times in ${op.filePath}`)
        fs.writeFileSync(op.filePath, source.replace(original, op.updated.replace(/\r\n/g, '\n')), 'utf-8')
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
      case 'EXISTS': {
        const exists = fs.existsSync(op.filePath)
        if (exists) {
          const stat = fs.statSync(op.filePath)
          return right(`✅ 存在: ${op.filePath} (${stat.isDirectory() ? '目录' : '文件'})`)
        }
        return right(`❌ 不存在: ${op.filePath}`)
      }
      case 'MOVE': {
        if (!fs.existsSync(op.from)) return left(`Source not found: ${op.from}`)
        if (fs.existsSync(op.to)) return left(`Target already exists: ${op.to}`)
        ensureDirectoryExists(op.to)
        moveRecursive(op.from, op.to)
        return right(undefined)
      }
      case 'COPY': {
        if (!fs.existsSync(op.from)) return left(`Source not found: ${op.from}`)
        if (fs.existsSync(op.to)) return left(`Target already exists: ${op.to}`)
        copyRecursive(op.from, op.to)
        return right(undefined)
      }
      case 'WRITE': {
        if (!fs.existsSync(op.filePath)) return left(`File not found: ${op.filePath}`)
        const stat = fs.statSync(op.filePath)
        if (stat.isDirectory()) return left(`Target is a directory: ${op.filePath}`)
        fs.writeFileSync(op.filePath, op.content, 'utf-8')
        return right(undefined)
      }
      case 'APPEND': {
        if (!fs.existsSync(op.filePath)) return left(`File not found: ${op.filePath}`)
        const stat = fs.statSync(op.filePath)
        if (stat.isDirectory()) return left(`Target is a directory: ${op.filePath}`)
        fs.appendFileSync(op.filePath, op.content, 'utf-8')
        return right(undefined)
      }
      case 'PREPEND': {
        if (!fs.existsSync(op.filePath)) return left(`File not found: ${op.filePath}`)
        const stat = fs.statSync(op.filePath)
        if (stat.isDirectory()) return left(`Target is a directory: ${op.filePath}`)
        const existing = fs.readFileSync(op.filePath, 'utf-8')
        fs.writeFileSync(op.filePath, op.content + existing, 'utf-8')
        return right(undefined)
      }
    }
  } catch (err) {
    return left(err instanceof Error ? err.message : String(err))
  }
}
