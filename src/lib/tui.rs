//! Interactive Terminal UI loop and background clipboard monitoring daemon.

use colored::Colorize;
use sha2::{Digest, Sha256};
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::dsl::{DslMode, parse_dsl};
use crate::pack::{PackOptions, pack_context};
use crate::pipeline::{ApplyOptions, run_apply_pipeline};

const HELP_TEXT: &str = "ap [--allow-all] | pa <globs...> [--no-tree] | $ <shell> | exit | help";

/// Starts the continuous interactive REPL loop and spawns the background clipboard listener task.
pub async fn start_tui_loop(mode: DslMode) -> Result<(), Box<dyn std::error::Error>> {
  println!("{}", " ROMI 持续交互终端 ".on_cyan().black().bold());
  println!(
    "{}",
    "  后台监听剪贴板: WORKACTION 强制触发, 纯只读 DSL 自动触发".bright_black()
  );
  println!("{}\n", format!("  指令: {HELP_TEXT}").bright_black());

  let running = Arc::new(AtomicBool::new(true));
  let running_clone = running.clone();

  // Background clipboard monitor
  tokio::spawn(async move {
    let mut last_hash = String::new();

    while running_clone.load(Ordering::Relaxed) {
      tokio::time::sleep(Duration::from_millis(1000)).await;

      let current_text = match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(t) => t,
        Err(_) => continue,
      };

      let mut hasher = Sha256::new();
      hasher.update(current_text.as_bytes());
      let current_hash = hex::encode(hasher.finalize());

      if current_hash == last_hash {
        continue;
      }
      last_hash = current_hash;

      let parsed = parse_dsl(&current_text, mode);
      let is_workaction = current_text.contains("(WORKACTION)");
      let is_all_readonly = !parsed.ops.is_empty()
        && parsed
          .ops
          .iter()
          .all(|o| o.severity() == crate::dsl::OpSeverity::ReadOnly);

      if is_workaction || is_all_readonly {
        let opts = ApplyOptions {
          allow_all: false,
          no_undo: false,
          mode,
        };
        let success = run_apply_pipeline(&current_text, &opts, |_| {}).await;
        let symbol = if success { "√" } else { "×" };
        print!("{symbol}");
        let _ = io::stdout().flush();
        tokio::time::sleep(Duration::from_secs(2)).await;
        print!("\x08 \x08");
        let _ = io::stdout().flush();
      }
    }
  });

  loop {
    let input = inquire::Text::new("romi>")
      .with_placeholder("ap | pa <globs...> | $ <shell> | exit | help")
      .prompt();

    let input = match input {
      Ok(i) => i,
      Err(_) => {
        break;
      }
    };

    let trimmed = input.trim();
    if trimmed.is_empty() {
      continue;
    }

    if trimmed == "exit" {
      break;
    }

    if let Some(cmd_str) = trimmed.strip_prefix('$') {
      let cmd_str = cmd_str.trim();
      let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", cmd_str]).output()
      } else {
        Command::new("sh").args(["-c", cmd_str]).output()
      };

      match output {
        Ok(out) => {
          let stdout = String::from_utf8_lossy(&out.stdout);
          let stderr = String::from_utf8_lossy(&out.stderr);
          if !stdout.is_empty() {
            print!("{stdout}");
          }
          if !stderr.is_empty() {
            eprint!("{}", stderr.red());
          }
        }
        Err(e) => {
          eprintln!("{}", e.to_string().red());
        }
      }
      continue;
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    let cmd = parts[0];
    let rest = &parts[1..];

    if cmd == "help" {
      println!("{}", format!("  {HELP_TEXT}").bright_black());
    } else if cmd == "ap" {
      let allow_all = rest.contains(&"--allow-all");
      let content = match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(t) => t,
        Err(_) => {
          eprintln!("{}", "✖ 剪贴板无内容".red());
          continue;
        }
      };

      if content.trim().is_empty() {
        eprintln!("{}", "✖ 剪贴板无内容".red());
        continue;
      }

      let opts = ApplyOptions {
        allow_all,
        no_undo: false,
        mode,
      };
      run_apply_pipeline(&content, &opts, |msg| println!("{msg}")).await;
    } else if cmd == "pa" {
      let no_tree = rest.contains(&"--no-tree");
      let globs: Vec<String> = rest
        .iter()
        .filter(|a| !a.starts_with('-'))
        .map(|s| s.to_string())
        .collect();

      let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
      let opts = PackOptions {
        globs,
        goal: None,
        tree: !no_tree,
        diff: false,
        mode,
      };

      match pack_context(&opts, &cwd).await {
        Ok(_) => println!("{}", "✔ 已打包上下文并写入剪贴板".green()),
        Err(e) => eprintln!("{}", format!("✖ 打包失败: {e}").red()),
      }
    } else {
      eprintln!("{}", format!("未知命令: {cmd}").yellow());
    }
  }

  running.store(false, Ordering::Relaxed);
  println!("已退出 TUI 模式");
  Ok(())
}
