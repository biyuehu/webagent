//! Undo snapshot management using git patch tracking.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Errors encountered during undo snapshot capture or restoration.
#[derive(Debug, thiserror::Error)]
pub enum UndoError {
  /// Attempted to snapshot an empty list of files.
  #[error("No files specified for snapshot")]
  NoFilesSpecified,
  /// Target undo directory does not exist.
  #[error("No undo directory found")]
  NoUndoDirectory,
  /// No snapshot patches were found in the undo directory.
  #[error("No undo patches available")]
  NoPatchesAvailable,
  /// A git command failed during snapshot diff or apply.
  #[error("Failed to execute git: {0}")]
  GitFailed(String),
  /// An underlying standard I/O error occurred.
  #[error("IO error: {0}")]
  Io(#[from] std::io::Error),
}

/// Creates a reverse/snapshot patch of the affected files using git diff and saves it into `undo_dir`.
pub fn create_undo_patch(affected_files: &[&Path], undo_dir: &Path) -> Result<PathBuf, UndoError> {
  if affected_files.is_empty() {
    return Err(UndoError::NoFilesSpecified);
  }

  if !undo_dir.exists() {
    fs::create_dir_all(undo_dir)?;
  }

  let duration = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default();
  let patch_file_name = format!(
    "snapshot_{}_{:03}.patch",
    duration.as_secs(),
    duration.subsec_millis()
  );
  let patch_path = undo_dir.join(&patch_file_name);

  let mut cmd = Command::new("git");
  cmd.args(["diff", "HEAD", "--"]);
  for file in affected_files {
    cmd.arg(file.as_os_str());
  }

  let output = cmd
    .output()
    .map_err(|e| UndoError::GitFailed(e.to_string()))?;
  if !output.status.success() {
    let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(UndoError::GitFailed(err_msg));
  }

  fs::write(&patch_path, &output.stdout)?;
  Ok(patch_path)
}

/// Restores the most recent snapshot patch using `git apply --reverse` and deletes the patch file.
pub fn pop_undo_patch(undo_dir: &Path) -> Result<String, UndoError> {
  if !undo_dir.exists() {
    return Err(UndoError::NoUndoDirectory);
  }

  let mut patches = list_undo_patches(undo_dir);
  if patches.is_empty() {
    return Err(UndoError::NoPatchesAvailable);
  }

  patches.sort();
  let latest = patches.pop().unwrap();
  let patch_path = undo_dir.join(&latest);

  let output = Command::new("git")
    .args(["apply", "--reverse"])
    .arg(&patch_path)
    .output()
    .map_err(|e| UndoError::GitFailed(e.to_string()))?;

  if !output.status.success() {
    let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(UndoError::GitFailed(err_msg));
  }

  fs::remove_file(&patch_path)?;
  Ok(latest)
}

/// Lists all snapshot patch file names found in `undo_dir`, sorted chronologically.
pub fn list_undo_patches(undo_dir: &Path) -> Vec<String> {
  if !undo_dir.exists() {
    return Vec::new();
  }

  let Ok(entries) = fs::read_dir(undo_dir) else {
    return Vec::new();
  };

  let mut patches: Vec<String> = entries
    .filter_map(|e| e.ok())
    .filter_map(|e| {
      let name = e.file_name().to_string_lossy().to_string();
      if name.starts_with("snapshot_") && name.ends_with(".patch") {
        Some(name)
      } else {
        None
      }
    })
    .collect();

  patches.sort();
  patches
}
