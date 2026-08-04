import { createHash } from 'node:crypto'
import { intro, isCancel, log, outro, text } from '@clack/prompts'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import { DSLDef } from './dsl'
import { packContext } from './pack'
import { runApplyPipeline } from './pipeline'

export async function startTuiLoop({ plain }: { plain?: boolean } = {}): Promise<void> {
  console.clear()
  intro(picocolors.bgCyan(picocolors.black(' ROMI 持续交互终端 ')))
  console.log(picocolors.gray('  后台监听剪贴板: WORKACTION 强制触发, 纯只读 DSL 自动触发'))
  console.log(picocolors.gray('  指令: ap [--allow-all] | pa <globs...> [--only] [--no-tree] | exit\n'))

  const initialText = await clipboard.read()
  let lastHash = createHash('sha256').update(initialText).digest('hex')

  const timer = setInterval(async () => {
    try {
      const currentText = await clipboard.read()
      const currentHash = createHash('sha256').update(currentText).digest('hex')
      if (currentHash === lastHash) return
      lastHash = currentHash

      const hasWork = currentText.includes('(WORKACTION)')
      const readonlyOnly = DSLDef.filter(({ type }) => currentText.includes(type)).every(
        ({ label }) => label === 'readonly'
      )

      if (hasWork || readonlyOnly) {
        await runApplyPipeline(currentText, { allowAll: false, plain }, () => {})
        process.stdout.write('√')
        setTimeout(() => {
          process.stdout.write('\b \b')
        }, 2000)
      }
    } catch (err) {
      log.error(picocolors.red(`✖ 剪贴板或应用异常: ${err instanceof Error ? err.message : String(err)}`))
    }
  }, 1000)

  while (true) {
    const input = await text({
      message: 'romi>',
      placeholder: 'ap | pa <globs...> | exit'
    })

    if (isCancel(input) || input === 'exit') {
      clearInterval(timer)
      outro('已退出 TUI 模式')
      process.exit(0)
    }

    const trimmed = input.trim()
    if (!trimmed) continue

    const [cmd, ...rest] = trimmed.split(/\s+/)

    if (cmd === 'ap') {
      const allowAll = rest.includes('--allow-all')
      const content = await clipboard.read()
      if (!content.trim()) {
        log.error(picocolors.red('✖ 剪贴板无内容'))
        continue
      }
      await runApplyPipeline(content, { allowAll, plain }, log.info)
    } else if (cmd === 'pa') {
      const only = rest.includes('--only')
      const noTree = rest.includes('--no-tree')
      await packContext({ globs: rest.filter((a) => !a.startsWith('-')), only, tree: !noTree, plain })
      log.info(picocolors.green('✔ 已打包上下文并写入剪贴板'))
    } else {
      log.warn(picocolors.yellow(`未知命令: ${cmd}`))
    }
  }
}
