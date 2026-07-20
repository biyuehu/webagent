import { intro, isCancel, outro, text } from '@clack/prompts'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import { runApplyPipeline } from './pipeline'
import { listUndoPatches, popUndoPatch } from './undo'

export async function startTuiLoop() {
  console.clear()
  intro(picocolors.bgCyan(picocolors.black(' MYCLI 持续交互终端 ')))
  console.log(picocolors.gray('  后台监听剪贴板中... 含有 `WORKACTION` 时自动执行 apply'))
  console.log(picocolors.gray('  可用指令: apply | undo | list | exit\n'))

  let lastClipboardText = await clipboard.read()

  const timer = setInterval(async () => {
    try {
      const currentText = await clipboard.read()
      if (currentText !== lastClipboardText) {
        lastClipboardText = currentText
        if (currentText.includes('(WORKACTION)')) {
          console.log(picocolors.magenta('\n⚡ 剪贴板检测到 WORKACTION，自动触发 apply...'))
          const res = await runApplyPipeline(currentText, { allowAll: false })
          if (res.failedCount > 0) {
            console.log(picocolors.red(`✖ 执行存在 ${res.failedCount} 个错误`))
          } else {
            console.log(picocolors.green(`✔ 自动应用成功 (${res.successCount} 块)`))
          }
        }
      }
    } catch {
      // 忽略剪贴板读写锁异常
    }
  }, 1000)

  while (true) {
    const input = await text({
      message: 'mycli>',
      placeholder: '输入指令 (apply / undo / list / exit)'
    })

    if (isCancel(input) || input === 'exit') {
      clearInterval(timer)
      outro('已退出 TUI 模式')
      process.exit(0)
    }

    const cmd = (input as string).trim()

    switch (cmd) {
      case 'apply': {
        const content = await clipboard.read()
        const res = await runApplyPipeline(content, { allowAll: false })
        console.log(picocolors.green(`✔ 执行完毕 (成功: ${res.successCount}, 失败: ${res.failedCount})`))
        break
      }
      case 'undo': {
        const undoDir = '.git/mycli/undo'
        const res = popUndoPatch(undoDir)
        if (res._tag === 'Right') {
          console.log(picocolors.green(`✔ 还原成功: ${res.right}`))
        } else {
          console.log(picocolors.red(`✖ 撤销失败: ${res.left}`))
        }
        break
      }
      case 'list': {
        const undoDir = '.git/mycli/undo'
        const list = listUndoPatches(undoDir)
        console.log(picocolors.bold('Undo 快照列表:'), list)
        break
      }
      case '':
        break
      default:
        console.log(picocolors.yellow(`未知命令: ${cmd}`))
        break
    }
  }
}
