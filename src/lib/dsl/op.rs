//! Domain types and Algebraic Data Types (ADTs) representing DSL operations.

use std::fmt;
use std::path::{Path, PathBuf};

/// Classification of operation severity, defining risk levels and confirmation requirements.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum OpSeverity {
  /// Harmless inspection operations that do not modify state (e.g. `READ`, `EXISTS`).
  ReadOnly,
  /// Operations that mutate files or directories without irrevocable destruction.
  Mutating,
  /// Potentially destructive or uncontained operations (e.g. `DELETE`, `COMMAND`).
  Dangerous,
}

/// An algebraic data type representing an individual domain instruction emitted by the AI agent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DslOp {
  /// Creates a file with the given content, or a directory if content is empty.
  Create {
    /// Path to the file or directory to create.
    path: PathBuf,
    /// UTF-8 string content. When empty, interpreted as a directory creation.
    content: String,
  },
  /// Recursively deletes a file or directory.
  Delete {
    /// Target path to be removed.
    path: PathBuf,
  },
  /// Replaces unique matching original text with updated text inside a file.
  Replace {
    /// Target file path.
    path: PathBuf,
    /// Expected exact match content to replace.
    original: String,
    /// Replacement content.
    updated: String,
  },
  /// Reads the content of a file or lists files in a directory.
  Read {
    /// Target path to inspect.
    path: PathBuf,
  },
  /// Executes an arbitrary shell command.
  Command {
    /// Shell command string to be run.
    command: String,
  },
  /// Checks whether a given path exists in the filesystem.
  Exists {
    /// Target path to test for existence.
    path: PathBuf,
  },
  /// Moves or renames a file or directory from `from` to `to`.
  Move {
    /// Source path.
    from: PathBuf,
    /// Destination path.
    to: PathBuf,
  },
  /// Recursively copies a file or directory from `from` to `to`.
  Copy {
    /// Source path.
    from: PathBuf,
    /// Destination path.
    to: PathBuf,
  },
  /// Overwrites the full content of an existing file.
  Write {
    /// Target file path.
    path: PathBuf,
    /// Content to write into the file.
    content: String,
  },
  /// Appends content to the end of an existing file.
  Append {
    /// Target file path.
    path: PathBuf,
    /// Content to append.
    content: String,
  },
  /// Prepends content to the beginning of an existing file.
  Prepend {
    /// Target file path.
    path: PathBuf,
    /// Content to prepend.
    content: String,
  },
}

impl DslOp {
  /// Returns the severity level of this operation.
  pub fn severity(&self) -> OpSeverity {
    match self {
      Self::Delete { .. } | Self::Command { .. } => OpSeverity::Dangerous,
      Self::Read { .. } | Self::Exists { .. } => OpSeverity::ReadOnly,
      _ => OpSeverity::Mutating,
    }
  }

  /// Returns `true` if this operation requires manual user confirmation.
  pub fn is_dangerous(&self) -> bool {
    self.severity() == OpSeverity::Dangerous
  }

  /// Returns `true` if this operation performs a mutating write to the filesystem.
  pub fn is_write(&self) -> bool {
    self.severity() == OpSeverity::Mutating
  }

  /// Returns `true` if this operation is purely read-only (`READ` or `EXISTS`).
  pub fn is_read_or_exists(&self) -> bool {
    self.severity() == OpSeverity::ReadOnly
  }

  /// Extracts the primary target file or directory path, if applicable.
  pub fn target_path(&self) -> Option<&Path> {
    match self {
      Self::Create { path, .. }
      | Self::Delete { path }
      | Self::Replace { path, .. }
      | Self::Read { path }
      | Self::Exists { path }
      | Self::Write { path, .. }
      | Self::Append { path, .. }
      | Self::Prepend { path, .. } => Some(path.as_path()),
      Self::Move { from, .. } | Self::Copy { from, .. } => Some(from.as_path()),
      Self::Command { .. } => None,
    }
  }

  /// Returns the canonical uppercase operator name (e.g. `"CREATE"`, `"REPLACE"`).
  pub fn op_type_name(&self) -> &'static str {
    match self {
      Self::Create { .. } => "CREATE",
      Self::Delete { .. } => "DELETE",
      Self::Replace { .. } => "REPLACE",
      Self::Read { .. } => "READ",
      Self::Command { .. } => "COMMAND",
      Self::Exists { .. } => "EXISTS",
      Self::Move { .. } => "MOVE",
      Self::Copy { .. } => "COPY",
      Self::Write { .. } => "WRITE",
      Self::Append { .. } => "APPEND",
      Self::Prepend { .. } => "PREPEND",
    }
  }
}

impl fmt::Display for DslOp {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::Create { path, content } => {
        if content.is_empty() {
          write!(f, "CREATE {} (dir)", path.display())
        } else {
          write!(f, "CREATE {}", path.display())
        }
      }
      Self::Delete { path } => write!(f, "DELETE {}", path.display()),
      Self::Replace { path, .. } => write!(f, "REPLACE {}", path.display()),
      Self::Command { command } => write!(f, "COMMAND {command}"),
      Self::Read { path } => write!(f, "READ {}", path.display()),
      Self::Exists { path } => write!(f, "EXISTS {}", path.display()),
      Self::Move { from, to } => write!(f, "MOVE {} -> {}", from.display(), to.display()),
      Self::Copy { from, to } => write!(f, "COPY {} -> {}", from.display(), to.display()),
      Self::Write { path, .. } => write!(f, "WRITE {}", path.display()),
      Self::Append { path, .. } => write!(f, "APPEND {}", path.display()),
      Self::Prepend { path, .. } => write!(f, "PREPEND {}", path.display()),
    }
  }
}
