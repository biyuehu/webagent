//! Command-line argument definitions and top-level CLI dispatch.

use clap::{Parser, Subcommand};
use colored::Colorize;
use std::fs;
use std::io::Read;
use std::path::PathBuf;

use crate::dsl::DslMode;
use crate::pack::{PackOptions, pack_context};
use crate::pipeline::{ApplyOptions, run_apply_pipeline};
use crate::tui::start_tui_loop;
use crate::undo::{list_undo_patches, pop_undo_patch};

/// Top-level command-line argument parser for `webagent`.
#[derive(Parser)]
#[command(
  name = "webagent",
  version = "1.0.0",
  about = "DSL-driven web AI agent for file operations, code modification, and command execution"
)]
pub struct Cli {
  /// Selected subcommand to execute. Defaults to interactive TUI loop if omitted.
  #[command(subcommand)]
  pub command: Option<Commands>,
}

/// Available subcommands for `webagent`.
#[derive(Subcommand)]
pub enum Commands {
  /// Enters interactive TUI / clipboard monitor loop mode.
  #[command(alias = "l", about = "进入持续化 TUI 模式")]
  Loop {
    /// Use plain-text DSL instead of standard Markdown.
    #[arg(long, help = "使用纯文本 DSL（非 Markdown）")]
    plain: bool,
  },
  /// Applies DSL operation blocks from a file, stdin, or clipboard.
  #[command(alias = "ap", about = "应用 Markdown DSL 块")]
  Apply {
    /// Path to input file containing DSL content.
    #[arg(help = "指定输入文件")]
    file: Option<PathBuf>,
    /// Force reading DSL content from standard input.
    #[arg(long, help = "强制从标准输入读取")]
    stdin: bool,
    /// Permit dangerous operations (DELETE/COMMAND) without confirmation prompts.
    #[arg(long, help = "允许所有高危操作(REMOVE/COMMAND)且无二次提示")]
    allow_all: bool,
    /// Disable automatic Git undo snapshot creation.
    #[arg(long, help = "禁用 Undo 快照生成")]
    no_undo: bool,
    /// Use plain-text DSL format.
    #[arg(long, help = "使用纯文本 DSL（非 Markdown）")]
    plain: bool,
  },
  /// Packs focus files and workspace context into clipboard for LLM input.
  #[command(alias = "pa", about = "打包指定 Patterns 代码生成 Prompt")]
  Pack {
    /// Glob patterns specifying files to pack.
    #[arg(help = "指定 Glob patterns")]
    globs: Vec<String>,
    /// High-level goal or task prompt.
    #[arg(long, help = "任务目标")]
    goal: Option<String>,
    /// Use plain-text DSL format.
    #[arg(long, help = "使用纯文本 DSL（非 Markdown）")]
    plain: bool,
    /// Exclude project directory structure tree.
    #[arg(long, help = "不包含项目目录树")]
    no_tree: bool,
    /// Exclude git diff output for focus files.
    #[arg(long, help = "不包含焦点文件的 Git Diff")]
    no_diff: bool,
  },
  /// Restores previous modifications or lists undo snapshots.
  #[command(about = "撤销变更")]
  Undo {
    /// List available snapshot patches in `.git/romi/undo`.
    #[arg(long, help = "查看存放在 .git/romi/undo 中的历史快照")]
    list: bool,
  },
  /// Displays application version information.
  #[command(about = "显示版本信息")]
  Version,
}

/// Entrypoint function for running the CLI application, validating the star gate and dispatching commands.
pub async fn run_cli() -> Result<(), Box<dyn std::error::Error>> {
  staron::gate(
    staron::StaronOptions::new("Ov23liCJaZwQGcVvHs9X", "biyuehu", "webagent")
      .on_fail(staron::Block(Some(
        "Please star biyuehu/webagent on GitHub to use this tool.",
      )))
      .skip_star_for_owner(true),
  )
  .await;

  let cli = Cli::parse();

  match cli.command {
    Some(Commands::Loop { plain }) => {
      let mode = if plain {
        DslMode::Plain
      } else {
        DslMode::Markdown
      };
      start_tui_loop(mode).await?;
    }

    Some(Commands::Apply {
      file,
      stdin,
      allow_all,
      no_undo,
      plain,
    }) => {
      let mode = if plain {
        DslMode::Plain
      } else {
        DslMode::Markdown
      };

      if allow_all {
        println!(
          "{}",
          "⚠ 已开启 --allow-all，高危操作(REMOVE/COMMAND)将被直接静默执行! "
            .on_yellow()
            .black()
        );
      }

      let content = if stdin {
        let mut buffer = String::new();
        std::io::stdin().read_to_string(&mut buffer)?;
        buffer
      } else if let Some(path) = file {
        if !path.exists() {
          eprintln!("{}", format!("✖ 找不到文件 {}", path.display()).red());
          return Ok(());
        }
        fs::read_to_string(path)?
      } else {
        let clipboard_text = match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
          Ok(t) => t,
          Err(_) => {
            eprintln!("{}", "✖ 剪贴板无内容且未提供输入文件".red());
            return Ok(());
          }
        };
        if clipboard_text.trim().is_empty() {
          eprintln!("{}", "✖ 剪贴板无内容且未提供输入文件".red());
          return Ok(());
        }
        clipboard_text
      };

      let opts = ApplyOptions {
        allow_all,
        no_undo,
        mode,
      };

      run_apply_pipeline(&content, &opts, |msg| println!("{msg}")).await;
      println!("{}", "✔ 执行完成".green());
    }

    Some(Commands::Pack {
      globs,
      goal,
      plain,
      no_tree,
      no_diff,
    }) => {
      let mode = if plain {
        DslMode::Plain
      } else {
        DslMode::Markdown
      };
      let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
      let opts = PackOptions {
        globs,
        goal,
        tree: !no_tree,
        diff: !no_diff,
        mode,
      };

      match pack_context(&opts, &cwd).await {
        Ok(_) => println!("{}", "✔ 已打包上下文并写入剪贴板".green()),
        Err(e) => eprintln!("{}", format!("✖ 打包失败: {e}").red()),
      }
    }

    Some(Commands::Undo { list }) => {
      let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
      let undo_dir = cwd.join(".git").join("romi").join("undo");

      if list {
        let patches = list_undo_patches(&undo_dir);
        if patches.is_empty() {
          println!("{}", "没有找到 Undo 快照".bright_black());
        } else {
          println!("{}", "\nUndo 历史快照列表:".bold());
          for (idx, p) in patches.iter().enumerate() {
            println!("  {}. {p}", idx + 1);
          }
        }
      } else {
        match pop_undo_patch(&undo_dir) {
          Err(err) => eprintln!("{}", format!("✖ 撤销失败: {err}").red()),
          Ok(name) => println!("{}", format!("✔ 已还原快照: {name}").green()),
        }
      }
    }

    Some(Commands::Version) => {
      println!("webagentx 1.0.0");
    }

    None => {
      use clap::CommandFactory;
      let mut cmd = Cli::command();
      cmd.print_help()?;
      println!();
    }
  }

  Ok(())
}
