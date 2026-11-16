//! Execution runtime for applying DSL operations to the host filesystem.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::dsl::DslOp;
use crate::pack::generate_tree;

/// Errors that can occur while executing a [`DslOp`].
#[derive(Debug, thiserror::Error)]
pub enum ApplyError {
  /// The target file or directory already exists when creating or moving without overwrite.
  #[error("Target already exists: {0}")]
  AlreadyExists(PathBuf),
  /// The specified target file does not exist.
  #[error("File not found: {0}")]
  FileNotFound(PathBuf),
  /// The path requested for inspection was not found.
  #[error("Read target not found: {0}")]
  ReadTargetNotFound(PathBuf),
  /// The source path for a move or copy operation does not exist.
  #[error("Source not found: {0}")]
  SourceNotFound(PathBuf),
  /// The path was expected to be a file, but a directory was encountered.
  #[error("Target is a directory: {0}")]
  IsDirectory(PathBuf),
  /// The search block (`ORIGINAL`) was not found in the target file.
  #[error("Original not found in {0}")]
  OriginalNotFound(PathBuf),
  /// The search block (`ORIGINAL`) matched multiple times, causing ambiguity.
  #[error("Original found multiple times in {0}")]
  OriginalAmbiguous(PathBuf),
  /// A spawned shell command failed with an exit error or stderr output.
  #[error("{0}")]
  CommandFailed(String),
  /// An underlying standard I/O error occurred.
  #[error("IO error: {0}")]
  Io(#[from] std::io::Error),
  /// Generic application error message.
  #[error("{0}")]
  Other(String),
}

/// Output produced by executing a [`DslOp`], if any.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyOutput {
  /// The operation completed without producing textual output to be captured.
  None,
  /// The operation produced textual output (such as read file contents or command stdout).
  Text(String),
}

fn ensure_parent_dir(path: &Path) -> Result<(), std::io::Error> {
  if let Some(parent) = path.parent()
    && !parent.as_os_str().is_empty()
    && !parent.exists()
  {
    fs::create_dir_all(parent)?;
  }
  Ok(())
}

fn copy_recursive(src: &Path, dest: &Path) -> Result<(), std::io::Error> {
  if src.is_dir() {
    if !dest.exists() {
      fs::create_dir_all(dest)?;
    }
    for entry in fs::read_dir(src)? {
      let entry = entry?;
      let file_type = entry.file_type()?;
      let from_path = entry.path();
      let to_path = dest.join(entry.file_name());
      if file_type.is_dir() {
        copy_recursive(&from_path, &to_path)?;
      } else {
        ensure_parent_dir(&to_path)?;
        fs::copy(&from_path, &to_path)?;
      }
    }
  } else {
    ensure_parent_dir(dest)?;
    fs::copy(src, dest)?;
  }
  Ok(())
}

/// Applies a single [`DslOp`] directly to the local filesystem or process environment.
pub fn apply_dsl_op(op: &DslOp) -> Result<ApplyOutput, ApplyError> {
  match op {
    DslOp::Create { path, content } => {
      if path.exists() {
        return Err(ApplyError::AlreadyExists(path.clone()));
      }
      if content.is_empty() {
        fs::create_dir_all(path)?;
        return Ok(ApplyOutput::None);
      }
      ensure_parent_dir(path)?;
      fs::write(path, content)?;
      Ok(ApplyOutput::None)
    }

    DslOp::Delete { path } => {
      if !path.exists() {
        return Ok(ApplyOutput::None);
      }
      if path.is_dir() {
        fs::remove_dir_all(path)?;
      } else {
        fs::remove_file(path)?;
      }
      Ok(ApplyOutput::None)
    }

    DslOp::Replace {
      path,
      original,
      updated,
    } => {
      if !path.exists() {
        return Err(ApplyError::FileNotFound(path.clone()));
      }
      let raw = fs::read_to_string(path)?;
      let source = raw.replace("\r\n", "\n");
      let orig = original.replace("\r\n", "\n");
      let upd = updated.replace("\r\n", "\n");

      let first_idx = match source.find(&orig) {
        Some(idx) => idx,
        None => return Err(ApplyError::OriginalNotFound(path.clone())),
      };

      if source[first_idx + orig.len()..].contains(&orig) {
        return Err(ApplyError::OriginalAmbiguous(path.clone()));
      }

      let mut result = String::with_capacity(source.len() + upd.len());
      result.push_str(&source[..first_idx]);
      result.push_str(&upd);
      result.push_str(&source[first_idx + orig.len()..]);

      fs::write(path, result)?;
      Ok(ApplyOutput::None)
    }

    DslOp::Command { command } => {
      let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", command]).output()?
      } else {
        Command::new("sh").args(["-c", command]).output()?
      };

      let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
      let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

      if !output.status.success() {
        let msg = if !stderr.is_empty() {
          stderr
        } else if !stdout.is_empty() {
          stdout
        } else {
          format!("Command exited with status {:?}", output.status.code())
        };
        return Err(ApplyError::CommandFailed(msg));
      }

      if stdout.is_empty() {
        Ok(ApplyOutput::None)
      } else {
        Ok(ApplyOutput::Text(stdout))
      }
    }

    DslOp::Read { path } => {
      if !path.exists() {
        return Err(ApplyError::ReadTargetNotFound(path.clone()));
      }
      if path.is_dir() {
        let tree = generate_tree(path, 3);
        let text = format!(
          "### Directory: `{}`\n```text\n{}\n```",
          path.display(),
          tree
        );
        Ok(ApplyOutput::Text(text))
      } else {
        let content = fs::read_to_string(path)?;
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("txt");
        let text = format!("### File: `{}`\n```{ext}\n{content}\n```", path.display());
        Ok(ApplyOutput::Text(text))
      }
    }

    DslOp::Exists { path } => {
      if path.exists() {
        let kind = if path.is_dir() { "Directory" } else { "File" };
        Ok(ApplyOutput::Text(format!(
          "Exists: {} ({kind})",
          path.display()
        )))
      } else {
        Ok(ApplyOutput::Text(format!(
          "Does not exist: {}",
          path.display()
        )))
      }
    }

    DslOp::Move { from, to } => {
      if !from.exists() {
        return Err(ApplyError::SourceNotFound(from.clone()));
      }
      if to.exists() {
        return Err(ApplyError::AlreadyExists(to.clone()));
      }
      ensure_parent_dir(to)?;
      fs::rename(from, to)?;
      Ok(ApplyOutput::None)
    }

    DslOp::Copy { from, to } => {
      if !from.exists() {
        return Err(ApplyError::SourceNotFound(from.clone()));
      }
      if to.exists() {
        return Err(ApplyError::AlreadyExists(to.clone()));
      }
      copy_recursive(from, to)?;
      Ok(ApplyOutput::None)
    }

    DslOp::Write { path, content } => {
      if !path.exists() {
        return Err(ApplyError::FileNotFound(path.clone()));
      }
      if path.is_dir() {
        return Err(ApplyError::IsDirectory(path.clone()));
      }
      fs::write(path, content)?;
      Ok(ApplyOutput::None)
    }

    DslOp::Append { path, content } => {
      if !path.exists() {
        return Err(ApplyError::FileNotFound(path.clone()));
      }
      if path.is_dir() {
        return Err(ApplyError::IsDirectory(path.clone()));
      }
      let mut file = fs::OpenOptions::new().append(true).open(path)?;
      use std::io::Write;
      file.write_all(content.as_bytes())?;
      Ok(ApplyOutput::None)
    }

    DslOp::Prepend { path, content } => {
      if !path.exists() {
        return Err(ApplyError::FileNotFound(path.clone()));
      }
      if path.is_dir() {
        return Err(ApplyError::IsDirectory(path.clone()));
      }
      let existing = fs::read_to_string(path)?;
      let mut new_content = content.clone();
      new_content.push_str(&existing);
      fs::write(path, new_content)?;
      Ok(ApplyOutput::None)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::tempdir;

  #[test]
  fn test_create_and_delete() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.txt");
    let op = DslOp::Create {
      path: file.clone(),
      content: "hello".to_string(),
    };
    let res = apply_dsl_op(&op);
    assert!(res.is_ok());
    assert_eq!(fs::read_to_string(&file).unwrap(), "hello");

    let del = DslOp::Delete { path: file.clone() };
    let res = apply_dsl_op(&del);
    assert!(res.is_ok());
    assert!(!file.exists());
  }

  #[test]
  fn test_replace() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("b.txt");
    fs::write(&file, "foo 123 bar").unwrap();

    let op = DslOp::Replace {
      path: file.clone(),
      original: "123".to_string(),
      updated: "456".to_string(),
    };
    let res = apply_dsl_op(&op);
    assert!(res.is_ok());
    assert_eq!(fs::read_to_string(&file).unwrap(), "foo 456 bar");
  }

  #[test]
  fn test_move_and_copy() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("src.txt");
    let dest = dir.path().join("dest.txt");
    fs::write(&src, "content").unwrap();

    let copy_op = DslOp::Copy {
      from: src.clone(),
      to: dest.clone(),
    };
    let res = apply_dsl_op(&copy_op);
    assert!(res.is_ok());
    assert!(src.exists());
    assert!(dest.exists());

    let move_dest = dir.path().join("moved.txt");
    let move_op = DslOp::Move {
      from: dest.clone(),
      to: move_dest.clone(),
    };
    let res = apply_dsl_op(&move_op);
    assert!(res.is_ok());
    assert!(!dest.exists());
    assert!(move_dest.exists());
  }
}
