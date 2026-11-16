//! Execution pipeline for validating, confirming, applying, and aggregating DSL commands.

use colored::Colorize;
use std::collections::{HashMap, HashSet};

use crate::apply::{ApplyOutput, apply_dsl_op};
use crate::dsl::{DslMode, DslOp, parse_dsl};

/// Execution flags controlling operation safety checks and undo tracking.
#[derive(Debug, Clone, Default)]
pub struct ApplyOptions {
  /// Skip interactive confirmation for dangerous operations (`DELETE`, `COMMAND`).
  pub allow_all: bool,
  /// Do not create a git undo snapshot before applying mutations.
  pub no_undo: bool,
  /// Expected syntax mode (`Markdown` or `Plain`).
  pub mode: DslMode,
}

/// Aggregated statistics summarizing the result of running an apply pipeline.
#[derive(Debug, Clone, Default)]
pub struct PipelineStats {
  /// Total number of parsed operations evaluated.
  pub total_ops: usize,
  /// Count of operations that succeeded without error.
  pub success_count: usize,
  /// Count of operations that failed during execution.
  pub failed_count: usize,
  /// Count of operations skipped (e.g. user declined dangerous confirmation).
  pub skipped_count: usize,
}

impl PipelineStats {
  /// Returns `true` if all operations completed successfully with zero failures or skips.
  pub fn is_clean_success(&self) -> bool {
    self.failed_count == 0 && self.skipped_count == 0
  }
}

/// Executes the full validation and application pipeline on a raw DSL markdown/plain string.
///
/// Returns `true` if the pipeline completed without encountering fatal validation errors.
pub async fn run_apply_pipeline<F>(
  markdown_content: &str,
  options: &ApplyOptions,
  mut log: F,
) -> bool
where
  F: FnMut(&str),
{
  let parsed = parse_dsl(markdown_content, options.mode);
  if parsed.ops.is_empty() {
    return true;
  }

  let mut read_files = HashSet::new();
  for (idx, op) in parsed.ops.iter().enumerate() {
    if op.is_read_or_exists() {
      if let Some(target) = op.target_path() {
        read_files.insert(target.to_path_buf());
      }
    } else if op.is_write()
      && let Some(target) = op.target_path()
      && read_files.contains(target)
    {
      log(&format!(
        "{}",
        format!(
          "✖ [#{}] {} {}：该文件先被 READ/EXISTS 后出现写操作，跳过全部",
          idx + 1,
          op.op_type_name(),
          target.display()
        )
        .red()
      ));
      return false;
    }
  }

  let mut clipboard_parts = Vec::new();
  for w in &parsed.warnings {
    log(&format!("{}", format!("⚠ {w}").yellow()));
    clipboard_parts.push(format!("警告: {w}"));
  }

  let mut stats = PipelineStats {
    total_ops: parsed.ops.len(),
    ..Default::default()
  };

  let mut success_ops: HashMap<String, HashMap<String, usize>> = HashMap::new();

  for (idx, op) in parsed.ops.iter().enumerate() {
    let tag = format!("[#{}]", idx + 1);

    if !options.allow_all && op.is_dangerous() {
      let prompt_msg = format!("确认执行高危操作 [{}] {}?", op.op_type_name(), op);
      let confirmed = inquire::Confirm::new(&prompt_msg)
        .with_default(true)
        .prompt()
        .unwrap_or(false);

      if !confirmed {
        stats.skipped_count += 1;
        let msg = format!("拒绝执行，用户跳过 {op}");
        log(&format!("{}", format!("{tag}: {msg}").red()));
        clipboard_parts.push(format!("{tag}: {msg}"));
        continue;
      }
    }

    match apply_dsl_op(op) {
      Err(err) => {
        stats.failed_count += 1;
        let err_str = err.to_string();
        log(&format!("{}", format!("✖ {tag} {err_str}").red()));
        if matches!(op, DslOp::Command { .. }) {
          clipboard_parts.push(format!("{tag} {op} stderr:\n{err_str}"));
        } else {
          clipboard_parts.push(format!("{tag} {err_str}"));
        }
      }
      Ok(output) => {
        stats.success_count += 1;
        let key = match op {
          DslOp::Command { .. } => "COMMAND".to_string(),
          _ => op
            .target_path()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| op.op_type_name().to_string()),
        };
        let type_name = op.op_type_name().to_string();
        *success_ops
          .entry(key)
          .or_default()
          .entry(type_name)
          .or_default() += 1;

        if let ApplyOutput::Text(txt) = output {
          let trimmed = txt.trim();
          if !trimmed.is_empty() {
            if !op.is_read_or_exists() {
              log(&txt);
            }
            if matches!(op, DslOp::Command { .. }) {
              clipboard_parts.push(format!("{tag} {op} stdout:\n{txt}"));
            } else {
              clipboard_parts.push(format!("{tag} {txt}"));
            }
          }
        }
      }
    }
  }

  if !success_ops.is_empty() {
    for (key, type_map) in success_ops {
      let mut parts = Vec::new();
      for (type_name, count) in type_map {
        if count > 1 {
          parts.push(format!("{type_name} ×{count}"));
        } else {
          parts.push(type_name);
        }
      }
      log(&format!(
        "{}",
        format!(" {key}: {}", parts.join(", ")).green()
      ));
    }
  }

  let summary_str = if stats.is_clean_success() {
    format!("应用成功 ({}/{} 块)", stats.success_count, stats.total_ops).green()
  } else {
    format!(
      "▲ 执行完成: {} 成功, {} 失败, {} 拒绝",
      stats.success_count, stats.failed_count, stats.skipped_count
    )
    .yellow()
  };
  log(&format!("{summary_str}"));

  if !clipboard_parts.is_empty() {
    let joined = clipboard_parts.join("\n---\n");
    if let Ok(mut clip) = arboard::Clipboard::new() {
      let _ = clip.set_text(&joined);
    }
    log(&format!(
      "{}",
      format!("已复制 {} 个输出项到剪贴板", clipboard_parts.len()).green()
    ));
  }

  stats.is_clean_success()
}
