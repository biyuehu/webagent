//! Context packing utility to bundle workspace tree, focus files, and diffs for the LLM.

use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::dsl::DslMode;
use crate::prompt::build_system_prompt;

/// Configuration options for assembling the context prompt bundle.
#[derive(Debug, Clone, Default)]
pub struct PackOptions {
  /// File globs specifying files to include in the context.
  pub globs: Vec<String>,
  /// Optional high-level goal description to append.
  pub goal: Option<String>,
  /// Whether to include the project directory structure tree.
  pub tree: bool,
  /// Whether to include `git diff` for focus files.
  pub diff: bool,
  /// Target DSL output mode requested from the LLM.
  pub mode: DslMode,
}

fn get_git_ignored_paths(paths: &[PathBuf], cwd: &Path) -> HashSet<PathBuf> {
  if paths.is_empty() {
    return HashSet::new();
  }

  let mut child = match Command::new("git")
    .args(["check-ignore", "--stdin"])
    .current_dir(cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
  {
    Ok(c) => c,
    Err(_) => return HashSet::new(),
  };

  if let Some(mut stdin) = child.stdin.take() {
    for p in paths {
      let _ = writeln!(stdin, "{}", p.display());
    }
  }

  let output = match child.wait_with_output() {
    Ok(o) => o,
    Err(_) => return HashSet::new(),
  };

  let stdout = String::from_utf8_lossy(&output.stdout);
  stdout
    .lines()
    .map(|l| PathBuf::from(l.trim()))
    .filter(|p| !p.as_os_str().is_empty())
    .collect()
}

/// Checks whether a given path is ignored by `.gitignore` in the specified workspace root.
pub fn is_git_ignored(target_path: &Path, cwd: &Path) -> bool {
  Command::new("git")
    .args(["check-ignore", target_path.to_string_lossy().as_ref()])
    .current_dir(cwd)
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map(|s| s.success())
    .unwrap_or(false)
}

/// Expands glob patterns against `cwd`, filters out gitignored paths, and returns matched relative paths.
pub fn collect_packed_files(globs: &[String], cwd: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
  let mut raw_files = Vec::new();

  for raw_glob in globs {
    let pattern_str = if let Some(stripped) = raw_glob.strip_suffix('#') {
      stripped
    } else {
      raw_glob.as_str()
    };

    let full_pattern = if Path::new(pattern_str).is_absolute() {
      pattern_str.to_string()
    } else {
      cwd.join(pattern_str).to_string_lossy().to_string()
    };

    if let Ok(entries) = glob::glob(&full_pattern) {
      for entry in entries.flatten() {
        if entry.is_file() {
          if let Ok(rel) = entry.strip_prefix(cwd) {
            raw_files.push(rel.to_path_buf());
          } else {
            raw_files.push(entry);
          }
        }
      }
    }
  }

  raw_files.sort();
  raw_files.dedup();

  let ignored_set = get_git_ignored_paths(&raw_files, cwd);
  Ok(
    raw_files
      .into_iter()
      .filter(|f| !ignored_set.contains(f))
      .collect(),
  )
}

/// Generates an ASCII/indented directory structure tree up to `depth`, ignoring gitignored files.
pub fn generate_tree(dir_path: &Path, depth: usize) -> String {
  let abs_root = dir_path
    .canonicalize()
    .unwrap_or_else(|_| dir_path.to_path_buf());
  let mut lines = Vec::new();

  fn walk(
    current_dir: &Path,
    current_depth: usize,
    max_depth: usize,
    abs_root: &Path,
    lines: &mut Vec<String>,
  ) {
    if current_depth > max_depth || !current_dir.exists() {
      return;
    }

    let Ok(entries) = fs::read_dir(current_dir) else {
      return;
    };

    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
      let file_name = entry.file_name();
      let name_str = file_name.to_string_lossy();
      if name_str == ".git" {
        continue;
      }

      let full_path = entry.path();
      let rel_path = full_path.strip_prefix(abs_root).unwrap_or(&full_path);

      if is_git_ignored(rel_path, abs_root) {
        continue;
      }

      let indent = "  ".repeat(current_depth.saturating_sub(1));
      let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

      if is_dir {
        lines.push(format!("{indent}{name_str}/"));
        walk(&full_path, current_depth + 1, max_depth, abs_root, lines);
      } else {
        lines.push(format!("{indent}{name_str}"));
      }
    }
  }

  walk(&abs_root, 1, depth, &abs_root, &mut lines);
  lines.join("\n")
}

/// Runs `git diff HEAD -- <files>` on the given files and returns the unified diff output.
pub fn get_git_diff_for_files(files: &[PathBuf]) -> String {
  if files.is_empty() {
    return String::new();
  }

  let valid_files: Vec<&PathBuf> = files.iter().filter(|f| f.exists()).collect();
  if valid_files.is_empty() {
    return String::new();
  }

  let mut cmd = Command::new("git");
  cmd.args(["diff", "HEAD", "--"]);
  for f in valid_files {
    cmd.arg(f);
  }

  cmd
    .output()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .unwrap_or_default()
}

/// Packs system prompt, optional file tree, focus file contents, and diff into a combined LLM prompt.
pub async fn pack_context(
  options: &PackOptions,
  cwd: &Path,
) -> Result<String, Box<dyn std::error::Error>> {
  let files = collect_packed_files(&options.globs, cwd)?;
  let mut sections = Vec::new();

  sections.push(build_system_prompt(options.mode, cwd).await);

  if options.tree {
    sections.push(format!(
      "## 项目结构\n```text\n{}\n```",
      generate_tree(cwd, 3)
    ));
  }

  let mut file_ops = Vec::new();
  for file_path in &files {
    let full_path = cwd.join(file_path);
    if full_path.exists()
      && let Ok(raw_content) = fs::read_to_string(&full_path)
    {
      let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt");
      file_ops.push(format!(
        "### `{}`\n```{ext}\n{raw_content}\n```",
        file_path.display()
      ));
    }
  }

  if !file_ops.is_empty() {
    sections.push(format!("## 焦点文件\n{}", file_ops.join("\n\n")));
  }

  if let Some(goal) = &options.goal {
    sections.push(format!("## 当前任务目标\n{goal}"));
  }

  let final_prompt = sections.join("\n\n---\n\n");

  if let Ok(mut clipboard) = arboard::Clipboard::new() {
    let _ = clipboard.set_text(&final_prompt);
  }

  Ok(final_prompt)
}
