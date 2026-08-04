import { intro, isCancel, outro, text } from '@clack/prompts'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import { cli } from './cli'

export async function startTuiLoop(): Promise<void> {
  console.clear()
  intro(picocolors.bgCyan(picocolors.black(' ROMI 持续交互终端 ')))
  console.log(picocolors.gray('  后台监听剪贴板中... 含有 `WORKACTION` 时自动执行 apply'))

  let lastClipboardText = await clipboard.read()

  const timer = setInterval(async () => {
    try {
      const currentText = await clipboard.read()
      if (currentText !== lastClipboardText) {
        lastClipboardText = currentText
        if (currentText.includes('(WORKACTION)')) {
          console.log(picocolors.magenta('\n⚡ 剪贴板检测到 (WORKACTION)，自动触发 apply...'))
          cli.parse(['', '', 'apply'])
        }
      }
    } catch (err) {
      console.log(picocolors.red('✖ 剪贴板或应用异常: '), err)
    }
  }, 1000)

  while (true) {
    const input = await text({
      message: 'romi>',
      placeholder: 'Input command...'
    })

    if (isCancel(input) || input === 'exit') {
      clearInterval(timer)
      outro('已退出 TUI 模式')
      process.exit(0)
    }

    const trimmed = input.trim()
    if (!trimmed) continue

    try {
      cli.parse(['', '', ...trimmed.split(/\s+/)])
      continue
    } catch {
      console.log(picocolors.red('✖ 命令解析失败: '), input)
    }
  }
}
