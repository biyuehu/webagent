import fs from 'node:fs'
import path from 'node:path'
import { cac } from 'cac'
import clipboard from 'clipboardy'
import picocolors from 'picocolors'
import pkg from '../package.json'
import { packContext } from './pack'
import { runApplyPipeline } from './pipeline'
import { startTuiLoop } from './tui'
import { listUndoPatches, popUndoPatch } from './undo'

export const cli = cac('web-agent')

cli
  .command('apply [file]', '应用 Markdown DSL 块')
  .option('--stdin', '强制从标准输入读取')
  .option('--allow-all', '允许所有高危操作(REMOVE/COMMAND)且无二次提示')
  .option('--no-undo', '禁用 Undo 快照生成')
  .option('--plain', '使用纯文本 DSL（非 Markdown）')
  .action(
    async (
      file?: string,
      options: { stdin?: boolean; allowAll?: boolean; undo?: boolean; plain?: boolean } = {}
    ): Promise<void> => {
      let markdownContent = ''
      if (options.allowAll)
        console.log(
          picocolors.bgYellow(picocolors.black('⚠ 已开启 --allow-all，高危操作(REMOVE/COMMAND)将被直接静默执行! '))
        )
      if (options.stdin) markdownContent = fs.readFileSync(0, 'utf-8')
      else if (file) {
        if (!fs.existsSync(file)) {
          console.error(picocolors.red(`✖ 找不到文件 ${file}`))
          return
        }
        markdownContent = fs.readFileSync(file, 'utf-8')
      } else {
        markdownContent = await clipboard.read()
        if (!markdownContent.trim()) {
          console.error(picocolors.red('✖ 剪贴板无内容且未提供输入文件'))
          return
        }
      }
      try {
        await runApplyPipeline(markdownContent, { allowAll: options.allowAll, plain: options.plain, noUndo: true })
        console.log(picocolors.green('✔ 执行完成'))
      } catch (err: unknown) {
        console.error('✖ 执行异常')
        console.error(picocolors.red(err instanceof Error ? err.message : String(err)))
      }
    }
  )

cli
  .command('pack [...globs]', '打包指定 Patterns 代码生成 Prompt')
  .option('--goal <text>', '任务目标')
  .option('--only', '仅含文件内容')
  .option('--plain', '使用纯文本 DSL（非 Markdown）')
  .option('--no-tree', '不包含项目目录树')
  .option('--no-diff', '不包含焦点文件的 Git Diff')
  .action(
    async (
      globs: string[],
      options: { tree?: boolean; diff?: boolean; only?: boolean; plain?: boolean; goal?: string } = {}
    ): Promise<void> => {
      await packContext({
        only: options.only,
        globs,
        goal: options.goal,
        tree: options.tree,
        diff: options.diff,
        plain: options.plain
      })
      console.log(picocolors.green('✔ 已打包上下文并写入剪贴板'))
    }
  )

cli
  .command('undo', '撤销变更')
  .option('--list', '查看存放在 .git/romi/undo 中的历史快照')
  .action(async (options: { list?: boolean } = {}): Promise<void> => {
    const undoDir = path.join(process.cwd(), '.git', 'romi', 'undo')
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
    if (res._tag === 'Left') console.error(picocolors.red(`✖ 撤销失败: ${res.left}`))
    else console.log(picocolors.green(`✔ 已还原快照: ${res.right}`))
  })

cli
  .command('loop', '进入持续化 TUI 模式')
  .option('--plain', '使用纯文本 DSL（非 Markdown）')
  .action((options: { plain?: boolean }) => startTuiLoop(options))

cli.command('version', '显示版本信息').action(() => cli.outputVersion())

cli.help()
cli.version(pkg.version)
cli.parse()
if (!cli.matchedCommand) cli.outputHelp()
