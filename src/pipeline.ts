import path from 'node:path'
import { confirm, isCancel } from '@clack/prompts'
import { applyDSLBlock } from './apply'
import { type DSLBlock, parseDSL } from './dsl'
import { createUndoPatch } from './undo'

export interface ApplyOptions {
  allowAll?: boolean
  noUndo?: boolean
  cwd?: string
}

export interface ExecutionError {
  block: DSLBlock
  error: string
}

export interface ApplyResult {
  totalBlocks: number
  successCount: number
  failedCount: number
  skippedCount: number
  errors: ExecutionError[]
  outputs: string[]
  undoPatchName?: string
}

export function extractAffectedFiles(blocks: DSLBlock[]): string[] {
  const files = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'CREATE' || block.type === 'REPLACE' || block.type === 'DELETE') {
      files.add(block.filePath)
    }
  }
  return Array.from(files)
}

export async function runApplyPipeline(markdownContent: string, options: ApplyOptions = {}): Promise<ApplyResult> {
  const cwd = options.cwd || process.cwd()
  const { blocks } = parseDSL(markdownContent)

  const result: ApplyResult = {
    totalBlocks: blocks.length,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
    outputs: []
  }

  if (blocks.length === 0) {
    return result
  }

  const affectedFiles = extractAffectedFiles(blocks)

  if (!options.noUndo && affectedFiles.length > 0) {
    const undoDir = path.join(cwd, '.git', 'mycli', 'undo')
    const undoRes = createUndoPatch(affectedFiles, undoDir)
    if (undoRes._tag === 'Right') {
      result.undoPatchName = undoRes.right
    }
  }

  for (const block of blocks) {
    if (!options.allowAll && (block.type === 'DELETE' || block.type === 'COMMAND')) {
      const targetDesc = block.type === 'DELETE' ? block.filePath : block.command
      const confirmed = await confirm({
        message: `确认执行高危操作 [${block.type}] ${targetDesc}?`,
        initialValue: true
      })

      if (isCancel(confirmed) || !confirmed) {
        result.skippedCount++
        result.errors.push({
          block,
          error: `[拒绝执行] 用户跳过了 ${block.type} 操作`
        })
        continue
      }
    }

    const execRes = applyDSLBlock(block /* , cwd */) // TODO
    if (execRes._tag === 'Left') {
      result.failedCount++
      result.errors.push({
        block,
        error: execRes.left
      })
    } else {
      result.successCount++
      if (typeof execRes.right === 'string' && execRes.right.trim() !== '') {
        result.outputs.push(execRes.right)
      }
    }
  }

  return result
}
