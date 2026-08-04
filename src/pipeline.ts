import path from 'node:path'
import { confirm, isCancel } from '@clack/prompts'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import { applyDSLDef } from './apply'
import { type DSLDef, parseDSL } from './dsl'
import { createUndoPatch } from './undo'

export interface ApplyOptions {
  allowAll?: boolean
  noUndo?: boolean
  plain?: boolean
}

function describeBlock(block: DSLDef): string {
  switch (block.type) {
    case 'CREATE':
      return `CREATE ${block.filePath}`
    case 'DELETE':
      return `DELETE ${block.filePath}`
    case 'REPLACE':
      return `REPLACE ${block.filePath}`
    case 'COMMAND':
      return `COMMAND ${block.command}`
    case 'READ':
      return `READ ${block.filePath}`
  }
}

export async function runApplyPipeline(markdownContent: string, options: ApplyOptions = {}): Promise<void> {
  const { blocks, warnings } = parseDSL(markdownContent, !options.plain)
  const result = { totalBlocks: blocks.length, successCount: 0, failedCount: 0, skippedCount: 0 }

  if (blocks.length === 0) return

  const affectedFiles = blocks
    .filter((block) => (block.label === 'mutating' || block.label === 'dangerous') && 'filePath' in block)
    .map(({ filePath }) => filePath)

  if (!options.noUndo && affectedFiles.length > 0) {
    const undoDir = path.join('.git', 'romi', 'undo')
    createUndoPatch(affectedFiles, undoDir)
  }

  const successOps = new Map<string, Map<string, number>>()
  const clipboardParts: string[] = []

  for (const w of warnings) {
    console.log(picocolors.yellow(`[解析警告] ${w}`))
    clipboardParts.push(`[解析警告] ${w}`)
  }

  for (const [index, block] of blocks.entries()) {
    const tag = `[#${index + 1}] ${describeBlock(block)}`

    if (!options.allowAll && block.label === 'dangerous') {
      const targetDesc = block.type === 'DELETE' ? block.filePath : block.command
      const confirmed = await confirm({
        message: `确认执行高危操作 [${block.type}] ${targetDesc}?`,
        initialValue: true
      })

      if (isCancel(confirmed) || !confirmed) {
        result.skippedCount++
        const msg = `[拒绝执行] 用户跳过了 ${block.type} 操作`
        console.log(picocolors.red(`${tag}\n  ${msg}`))
        clipboardParts.push(`${tag}\n  ${msg}`)
        continue
      }
    }

    const execRes = applyDSLDef(block)
    if (execRes._tag === 'Left') {
      result.failedCount++
      console.log(picocolors.red(`${tag}\n  错误: ${execRes.left}`))
      clipboardParts.push(`${tag}\n  错误: ${execRes.left}`)
    } else {
      result.successCount++
      const key = block.type === 'COMMAND' ? 'COMMAND' : block.filePath
      const typeLabel = block.type
      if (!successOps.has(key)) successOps.set(key, new Map())
      successOps.get(key)!.set(typeLabel, (successOps.get(key)!.get(typeLabel) ?? 0) + 1)
      if (typeof execRes.right === 'string' && execRes.right.trim() !== '') clipboardParts.push(execRes.right)
    }
  }

  if (successOps.size > 0) {
    // console.log(picocolors.bold(picocolors.green('\n================ [ 执行成功摘要 ] ================')))
    for (const [key, typeMap] of successOps) {
      const parts: string[] = []
      for (const [type, count] of typeMap) parts.push(count > 1 ? `${type} ×${count}` : type)
      console.log(picocolors.green(`  ${key}: ${parts.join(', ')}`))
    }
    // console.log(picocolors.bold(picocolors.green('=================================================\n')))
  }

  console.log(
    result.failedCount === 0 && result.skippedCount === 0
      ? picocolors.green(`✔ 应用成功 (${result.successCount}/${result.totalBlocks} 块)`)
      : picocolors.yellow(
          `▲ 执行完成: ${result.successCount} 成功, ${result.failedCount} 失败, ${result.skippedCount} 拒绝`
        )
  )

  if (clipboardParts.length > 0) {
    await clipboard.write(clipboardParts.join('\n---\n'))
    console.log(picocolors.green(`已复制 ${clipboardParts.length} 个输出项到剪贴板`))
  }
}
