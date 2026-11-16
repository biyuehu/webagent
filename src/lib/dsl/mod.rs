//! Domain Specific Language (DSL) parser and operation definitions.

pub mod op;
pub mod parser;

pub use op::{DslOp, OpSeverity};
pub use parser::{DslMode, ParseResult, parse_dsl};
