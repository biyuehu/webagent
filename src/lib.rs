//! # webagent
//!
//! A DSL-driven web AI agent tool for structured file operations, precise code modifications,
//! context packing, interactive TUI supervision, and Git-based undo management.
//!
//! ## Modules
//! - [`apply`]: Filesystem operation runtime for executing [`DslOp`] instructions.
//! - [`cli`]: Command-line interface definitions and dispatching.
//! - [`dsl`]: Domain Specific Language (DSL) definitions, ADT enums, and parsers.
//! - [`pack`]: Project context assembly, file glob collection, and diff inspection.
//! - [`pipeline`]: Validation, confirmation, and batch execution pipeline for DSL operations.
//! - [`prompt`]: System prompt assembly with constraint directives.
//! - [`tui`]: Interactive REPL and continuous clipboard monitoring service.
//! - [`undo`]: Git diff-based reverse patch snapshotting and recovery.

mod lib {
  pub mod apply;
  pub mod cli;
  pub mod dsl;
  pub mod pack;
  pub mod pipeline;
  pub mod prompt;
  pub mod tui;
  pub mod undo;
}

pub use lib::{apply, cli, dsl, pack, pipeline, prompt, tui, undo};

pub use lib::apply::{ApplyError, ApplyOutput, apply_dsl_op};
pub use lib::cli::{Cli, Commands, run_cli};
pub use lib::dsl::{DslMode, DslOp, OpSeverity, ParseResult, parse_dsl};
pub use lib::pack::{PackOptions, collect_packed_files, generate_tree, pack_context};
pub use lib::pipeline::{ApplyOptions, PipelineStats, run_apply_pipeline};
pub use lib::prompt::build_system_prompt;
pub use lib::tui::start_tui_loop;
pub use lib::undo::{UndoError, create_undo_patch, list_undo_patches, pop_undo_patch};
