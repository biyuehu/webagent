import { confirm, isCancel } from '@clack/prompts'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import { applyDSLDef } from './apply'
import { DSLDef, parseDSL } from './dsl'

export interface ApplyOptions {
  allowAll?: boolean
  noUndo?: boolean
  plain?: boolean
}

function describeOp(op: DSLDef): string {
  switch (op.type) {
    case 'CREATE':
      return `CREATE ${op.filePath}${op.content === '' ? ' (dir)' : ''}`
    case 'DELETE':
      return `DELETE ${op.filePath}`
    case 'REPLACE':
      return `REPLACE ${op.filePath}`
    case 'COMMAND':
      return `COMMAND ${op.command}`
    case 'READ':
      return `READ ${op.filePath}`
    case 'EXISTS':
      return `EXISTS ${op.filePath}`
    case 'MOVE':
      return `MOVE ${op.from} -> ${op.to}`
    case 'COPY':
      return `COPY ${op.from} -> ${op.to}`
    case 'WRITE':
      return `WRITE ${op.filePath}`
    case 'APPEND':
      return `APPEND ${op.filePath}`
    case 'PREPEND':
      return `PREPEND ${op.filePath}`
  }
}

function getFilePath(op: DSLDef): string | undefined {
  switch (op.type) {
    case 'CREATE':
    case 'DELETE':
    case 'REPLACE':
    case 'READ':
    case 'EXISTS':
    case 'WRITE':
    case 'APPEND':
    case 'PREPEND':
      return op.filePath
    case 'MOVE':
    case 'COPY':
      return op.from
    default:
      return undefined
  }
}

function isWriteOperation(op: DSLDef): boolean {
  return DSLDef.filter(({ label }) => label === 'mutating')
    .map(({ type }) => type)
    .includes(op.type)
}

export async function runApplyPipeline(
  markdownContent: string,
  options: ApplyOptions = {},
  log: (msg: string) => void = console.log
): Promise<boolean> {
  const { ops, warnings } = parseDSL(markdownContent, options.plain)
  const result = { totalOps: ops.length, successCount: 0, failedCount: 0, skippedCount: 0 }

  if (ops.length === 0) return true

  const successOps = new Map<string, Map<string, number>>()
  const clipboardParts: string[] = []

  const readFiles = new Set<string>()
  for (const [index, op] of ops.entries()) {
    if (op.type === 'READ' || op.type === 'EXISTS') {
      const path = getFilePath(op)
      if (path) readFiles.add(path)
    } else if (isWriteOperation(op)) {
      const path = getFilePath(op)
      if (path && readFiles.has(path)) {
        log(picocolors.red(`✖ [#${index + 1}] ${op.type} ${path}：该文件先被 READ/EXISTS 后出现写操作，跳过全部`))
        return false
      }
    }
  }

  for (const w of warnings) {
    log(picocolors.yellow(`⚠ ${w}`))
    clipboardParts.push(`警告: ${w}`)
  }

  for (const [index, op] of ops.entries()) {
    const tag = `[#${index + 1}]`

    if (!options.allowAll && op.label === 'dangerous') {
      const confirmed = await confirm({
        message: `确认执行高危操作 [${op.type}] ${op.type === 'COMMAND' ? op.command : op.filePath}?`,
        initialValue: true
      })

      if (isCancel(confirmed) || !confirmed) {
        result.skippedCount++
        const msg = `拒绝执行，用户跳过 ${describeOp(op)}`
        log(picocolors.red(`${tag}: ${msg}`))
        clipboardParts.push(`${tag}: ${msg}`)
        continue
      }
    }

    const execRes = applyDSLDef(op)
    if (execRes._tag === 'Left') {
      result.failedCount++
      log(picocolors.red(`✖ ${tag} ${execRes.left}`))
      if (op.type === 'COMMAND') clipboardParts.push(`${tag} ${describeOp(op)} stderr:\n${execRes.left}`)
      else clipboardParts.push(execRes.left)
    } else {
      result.successCount++
      const key = op.type === 'COMMAND' ? 'COMMAND' : (getFilePath(op) ?? op.type)
      const typeLabel = op.type
      if (!successOps.has(key)) successOps.set(key, new Map())
      successOps.get(key)!.set(typeLabel, (successOps.get(key)!.get(typeLabel) ?? 0) + 1)
      if (typeof execRes.right === 'string' && execRes.right.trim() !== '') {
        if (op.type !== 'READ' && op.type !== 'EXISTS') log(execRes.right)
        if (op.type === 'COMMAND') clipboardParts.push(`${tag} ${describeOp(op)} stdout:\n${execRes.right}`)
        else clipboardParts.push(execRes.right)
      }
    }
  }

  if (successOps.size > 0) {
    for (const [key, typeMap] of successOps) {
      const parts: string[] = []
      for (const [type, count] of typeMap) parts.push(count > 1 ? `${type} ×${count}` : type)
      log(picocolors.green(` ${key}: ${parts.join(', ')}`))
    }
  }

  log(
    result.failedCount === 0 && result.skippedCount === 0
      ? picocolors.green(`应用成功 (${result.successCount}/${result.totalOps} 块)`)
      : picocolors.yellow(
          `▲ 执行完成: ${result.successCount} 成功, ${result.failedCount} 失败, ${result.skippedCount} 拒绝`
        )
  )

  if (clipboardParts.length > 0) {
    await clipboard.write(clipboardParts.join('\n---\n'))
    log(picocolors.green(`已复制 ${clipboardParts.length} 个输出项到剪贴板`))
  }

  return result.failedCount === 0 && result.skippedCount === 0
}
