import fs from 'node:fs'
import path from 'node:path'
import { spinner } from '@clack/prompts'
import { cac } from 'cac'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import { collectPackedFiles, packContext } from './pack'
import { type ApplyResult, runApplyPipeline } from './pipeline'
import { startTuiLoop } from './tui'
import { listUndoPatches, popUndoPatch } from './undo'

const cli = cac('mycli')

function printApplySummary(res: ApplyResult) {
  if (res.failedCount === 0 && res.skippedCount === 0) {
    console.log(picocolors.green(`✔ 应用成功 (${res.successCount}/${res.totalBlocks} 块)`))
  } else {
    console.log(
      picocolors.yellow(`▲ 执行完成: ${res.successCount} 成功, ${res.failedCount} 失败, ${res.skippedCount} 拒绝`)
    )
  }

  if (res.errors.length > 0) {
    console.log(picocolors.bold(picocolors.red('\n================ [ 错误日志 ] ================')))
    res.errors.forEach(({ block, error }, index) => {
      console.log(picocolors.red(`[#${index + 1} Error] [${block.type}] -> ${error}`))
    })
    console.log(picocolors.bold(picocolors.red('=============================================\n')))
  }

  if (res.outputs.length > 0) {
    console.log(picocolors.cyan('\n[ 指令/读取输出 Context ]'))
    console.log(res.outputs.join('\n---\n'))
  }
}

cli
  .command('apply [file]', '应用 Markdown DSL 块')
  .option('--stdin', '强制从标准输入读取')
  .option('--allow-all', '允许所有高危操作(REMOVE/COMMAND)且无二次提示')
  .option('--no-undo', '禁用 Undo 快照生成')
  .action(async (file?: string, options: any = {}) => {
    let markdownContent = ''

    if (options.allowAll) {
      console.log(
        picocolors.bgYellow(picocolors.black(' 警告: 已开启 --allow-all，高危操作(REMOVE/COMMAND)将被直接静默执行! '))
      )
    }

    if (options.stdin) {
      markdownContent = fs.readFileSync(0, 'utf-8')
    } else if (file) {
      if (!fs.existsSync(file)) {
        console.error(picocolors.red(`错误: 找不到文件 ${file}`))
        process.exit(1)
      }
      markdownContent = fs.readFileSync(file, 'utf-8')
    } else {
      markdownContent = await clipboard.read()
      if (!markdownContent.trim()) {
        console.error(picocolors.red('错误: 剪贴板无内容且未提供输入文件'))
        process.exit(1)
      }
    }

    const s = spinner()
    s.start('正在处理 DSL 变动...')

    try {
      s.stop('DSL 解析完成')
      const res = await runApplyPipeline(markdownContent, {
        allowAll: options.allowAll,
        noUndo: !options.undo
      })
      printApplySummary(res)
    } catch (err: any) {
      s.stop('执行异常')
      console.error(picocolors.red(err.message ?? String(err)))
      process.exit(1)
    }
  })

cli
  .command('undo', '撤销变更')
  .option('--list', '查看存放在 .git/mycli/undo 中的历史快照')
  .action(async (options: any = {}) => {
    const undoDir = path.join(process.cwd(), '.git', 'mycli', 'undo')

    if (options.list) {
      const patches = listUndoPatches(undoDir)
      if (patches.length === 0) {
        console.log(picocolors.gray('没有找到 Undo 快照'))
        return
      }
      console.log(picocolors.bold('\nUndo 历史快照列表:'))
      for (const [index, p] of patches.entries()) console.log(`  ${index + 1}. ${p}`)
      return
    }

    const res = popUndoPatch(undoDir)
    if (res._tag === 'Left') {
      console.error(picocolors.red(`✖ 撤销失败: ${res.left}`))
    } else {
      console.log(picocolors.green(`✔ 已还原快照: ${res.right}`))
    }
  })

cli
  .command('pack [...globs]', '打包指定 Patterns 代码生成 Prompt')
  .option('--stdout', '在终端直接打印结果')
  .option('--max-size <kb>', '单文件限制(KB)', { default: 500 })
  .option('--no-tree', '不包含项目目录树')
  .option('--no-diff', '不包含焦点文件的 Git Diff')
  .action(async (globs: string[], options: any = {}) => {
    if (!globs || globs.length === 0) {
      console.error(picocolors.red('错误: 请至少指定一个 glob 表达式'))
      process.exit(1)
    }

    const s = spinner()
    s.start('搜集与分析匹配文件...')

    const { normalFiles, simplifyFiles } = await collectPackedFiles(globs)

    const promptText = await packContext({
      files: normalFiles,
      simplifyFiles,
      tree: options.tree,
      diff: options.diff,
      copy: !options.stdout
    })

    s.stop('打包完成')

    if (options.stdout) {
      console.log(promptText)
    } else {
      await clipboard.write(promptText)
      console.log(picocolors.green('✔ 已打包上下文并写入剪贴板'))
    }
  })

cli.command('loop', '进入持续化 TUI 模式').action(startTuiLoop)

cli.help()
cli.parse()
