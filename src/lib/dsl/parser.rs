//! Parsing engine for Markdown and Plain-text DSL representations.

use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};
use std::path::PathBuf;

use super::op::DslOp;

/// Target format mode for parsing DSL commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DslMode {
  /// Standard Markdown mode where operations are declared under H3 (`###`) headers.
  #[default]
  Markdown,
  /// Plain-text mode where operations start with an exclamation mark (`!OP:`).
  Plain,
}

/// The result of parsing DSL text into structured operations and diagnostics.
#[derive(Debug, Clone, Default)]
pub struct ParseResult {
  /// Sequence of parsed DSL operations in order of occurrence.
  pub ops: Vec<DslOp>,
  /// Raw unparsed text that was passed as input.
  pub raw_text: String,
  /// Flag indicating whether at least one valid operation was recognized.
  pub has_work: bool,
  /// Syntax warnings, malformed blocks, or missing delimiters encountered during parsing.
  pub warnings: Vec<String>,
}

fn clean_path(s: &str) -> String {
  s.trim().trim_matches(&['`', '*'][..]).trim().to_string()
}

/// Parses the input string into structured [`DslOp`] instructions according to the specified [`DslMode`].
pub fn parse_dsl(input: &str, mode: DslMode) -> ParseResult {
  match mode {
    DslMode::Plain => parse_plain_dsl(input),
    DslMode::Markdown => parse_markdown_dsl(input),
  }
}

fn parse_plain_dsl(input: &str) -> ParseResult {
  let mut ops = Vec::new();
  let mut warnings = Vec::new();
  let lines: Vec<&str> = input.lines().collect();

  let mut i = 0;
  while i < lines.len() {
    let line = lines[i].trim();

    if let Some(rest) = line.strip_prefix("!READ:") {
      let path = clean_path(rest);
      if !path.is_empty() {
        ops.push(DslOp::Read {
          path: PathBuf::from(path),
        });
      } else {
        warnings.push("READ 块缺少文件路径".to_string());
      }
      i += 1;
    } else if let Some(rest) = line.strip_prefix("!DELETE:") {
      let path = clean_path(rest);
      if !path.is_empty() {
        ops.push(DslOp::Delete {
          path: PathBuf::from(path),
        });
      } else {
        warnings.push("DELETE 块缺少文件路径".to_string());
      }
      i += 1;
    } else if let Some(rest) = line.strip_prefix("!EXISTS:") {
      let path = clean_path(rest);
      if !path.is_empty() {
        ops.push(DslOp::Exists {
          path: PathBuf::from(path),
        });
      } else {
        warnings.push("EXISTS 块缺少文件路径".to_string());
      }
      i += 1;
    } else if let Some(rest) = line.strip_prefix("!COMMAND:") {
      let cmd = rest.trim();
      if !cmd.is_empty() {
        ops.push(DslOp::Command {
          command: cmd.to_string(),
        });
      } else {
        warnings.push("COMMAND 块缺少命令内容".to_string());
      }
      i += 1;
    } else if let Some(rest) = line.strip_prefix("!MOVE:") {
      let rest = rest.trim();
      if let Some((from_str, to_str)) = rest.split_once(" -> ") {
        let from = clean_path(from_str);
        let to = clean_path(to_str);
        if !from.is_empty() && !to.is_empty() {
          ops.push(DslOp::Move {
            from: PathBuf::from(from),
            to: PathBuf::from(to),
          });
        } else {
          warnings.push("MOVE 块缺少有效路径".to_string());
        }
      } else {
        warnings.push("MOVE 块格式错误，应为 !MOVE: from -> to".to_string());
      }
      i += 1;
    } else if let Some(rest) = line.strip_prefix("!COPY:") {
      let rest = rest.trim();
      if let Some((from_str, to_str)) = rest.split_once(" -> ") {
        let from = clean_path(from_str);
        let to = clean_path(to_str);
        if !from.is_empty() && !to.is_empty() {
          ops.push(DslOp::Copy {
            from: PathBuf::from(from),
            to: PathBuf::from(to),
          });
        } else {
          warnings.push("COPY 块缺少有效路径".to_string());
        }
      } else {
        warnings.push("COPY 块格式错误，应为 !COPY: from -> to".to_string());
      }
      i += 1;
    } else if let Some(rest) = line.strip_prefix("!CREATE:") {
      let path = clean_path(rest);
      let (content, next_i) = collect_plain_block(&lines, i + 1, "!CREATE", &path, &mut warnings);
      ops.push(DslOp::Create {
        path: PathBuf::from(path),
        content,
      });
      i = next_i;
    } else if let Some(rest) = line.strip_prefix("!WRITE:") {
      let path = clean_path(rest);
      let (content, next_i) = collect_plain_block(&lines, i + 1, "!WRITE", &path, &mut warnings);
      ops.push(DslOp::Write {
        path: PathBuf::from(path),
        content,
      });
      i = next_i;
    } else if let Some(rest) = line.strip_prefix("!APPEND:") {
      let path = clean_path(rest);
      let (content, next_i) = collect_plain_block(&lines, i + 1, "!APPEND", &path, &mut warnings);
      ops.push(DslOp::Append {
        path: PathBuf::from(path),
        content,
      });
      i = next_i;
    } else if let Some(rest) = line.strip_prefix("!PREPEND:") {
      let path = clean_path(rest);
      let (content, next_i) = collect_plain_block(&lines, i + 1, "!PREPEND", &path, &mut warnings);
      ops.push(DslOp::Prepend {
        path: PathBuf::from(path),
        content,
      });
      i = next_i;
    } else if let Some(rest) = line.strip_prefix("!REPLACE:") {
      let path = clean_path(rest);
      let mut original = Vec::new();
      let mut updated = Vec::new();

      i += 1;
      while i < lines.len() && lines[i].trim() != "<<<<<<< ORIGINAL" {
        i += 1;
      }
      if i >= lines.len() {
        warnings.push(format!("REPLACE 块缺少有效冲突标记: {path}"));
        continue;
      }

      i += 1;
      while i < lines.len() && lines[i].trim() != "=======" {
        original.push(lines[i]);
        i += 1;
      }
      if i >= lines.len() {
        warnings.push(format!("REPLACE 块缺少有效冲突标记: {path}"));
        continue;
      }

      i += 1;
      while i < lines.len() && lines[i].trim() != ">>>>>>> UPDATED" {
        updated.push(lines[i]);
        i += 1;
      }
      if i >= lines.len() {
        warnings.push(format!("REPLACE 块缺少有效冲突标记: {path}"));
        continue;
      }

      ops.push(DslOp::Replace {
        path: PathBuf::from(path),
        original: original.join("\n").trim_end().to_string(),
        updated: updated.join("\n").trim_end().to_string(),
      });
      i += 1;
    } else {
      i += 1;
    }
  }

  let has_work = !ops.is_empty();
  ParseResult {
    ops,
    raw_text: input.to_string(),
    has_work,
    warnings,
  }
}

fn collect_plain_block(
  lines: &[&str],
  start: usize,
  kind: &str,
  path: &str,
  warnings: &mut Vec<String>,
) -> (String, usize) {
  let mut content = Vec::new();
  let mut j = start;
  while j < lines.len() && lines[j].trim() != "!END" {
    content.push(lines[j]);
    j += 1;
  }
  if j >= lines.len() {
    warnings.push(format!("{kind} 块缺少 !END 标记: {path}"));
    (content.join("\n"), j)
  } else {
    (content.join("\n"), j + 1)
  }
}

fn parse_markdown_dsl(input: &str) -> ParseResult {
  let mut ops = Vec::new();
  let mut warnings = Vec::new();

  struct Section {
    header: String,
    code_blocks: Vec<String>,
  }

  let mut sections: Vec<Section> = Vec::new();
  let mut current_header: Option<String> = None;
  let mut current_code: Option<String> = None;
  let mut current_code_blocks: Vec<String> = Vec::new();
  let mut in_h3 = false;
  let mut h3_text = String::new();

  for event in Parser::new(input) {
    match event {
      Event::Start(Tag::Heading {
        level: HeadingLevel::H3,
        ..
      }) => {
        if let Some(header) = current_header.take() {
          sections.push(Section {
            header,
            code_blocks: std::mem::take(&mut current_code_blocks),
          });
        }
        in_h3 = true;
        h3_text.clear();
      }
      Event::End(TagEnd::Heading(HeadingLevel::H3)) => {
        in_h3 = false;
        current_header = Some(h3_text.trim().to_string());
      }
      Event::Text(t) => {
        if in_h3 {
          h3_text.push_str(&t);
        } else if let Some(code) = current_code.as_mut() {
          code.push_str(&t);
        }
      }
      Event::Code(c) => {
        if in_h3 {
          h3_text.push_str(&c);
        }
      }
      Event::Start(Tag::CodeBlock(_)) => {
        current_code = Some(String::new());
      }
      Event::End(TagEnd::CodeBlock) => {
        if let Some(code) = current_code.take() {
          current_code_blocks.push(code);
        }
      }
      _ => {}
    }
  }

  if let Some(header) = current_header {
    sections.push(Section {
      header,
      code_blocks: current_code_blocks,
    });
  }

  for section in sections {
    let header = section.header.trim();
    let (type_part, path_or_command) = if let Some((t, p)) = header.split_once(':') {
      (t.trim().to_uppercase(), clean_path(p))
    } else {
      (header.trim().to_uppercase(), String::new())
    };

    let first_code = section.code_blocks.first().cloned();

    match type_part.as_str() {
      "REPLACE" => {
        if let Some(code) = first_code {
          if let Some((original, updated)) = parse_conflict_marker(&code) {
            ops.push(DslOp::Replace {
              path: PathBuf::from(path_or_command),
              original,
              updated,
            });
          } else {
            warnings.push(format!("REPLACE 块缺少有效冲突标记: {path_or_command}"));
          }
        } else {
          warnings.push(format!("REPLACE 块缺少代码块: {path_or_command}"));
        }
      }
      "CREATE" => {
        ops.push(DslOp::Create {
          path: PathBuf::from(path_or_command),
          content: first_code.unwrap_or_default(),
        });
      }
      "WRITE" => {
        if let Some(code) = first_code {
          ops.push(DslOp::Write {
            path: PathBuf::from(path_or_command),
            content: code,
          });
        } else {
          warnings.push(format!("WRITE 块缺少代码块: {path_or_command}"));
        }
      }
      "APPEND" => {
        if let Some(code) = first_code {
          ops.push(DslOp::Append {
            path: PathBuf::from(path_or_command),
            content: code,
          });
        } else {
          warnings.push(format!("APPEND 块缺少代码块: {path_or_command}"));
        }
      }
      "PREPEND" => {
        if let Some(code) = first_code {
          ops.push(DslOp::Prepend {
            path: PathBuf::from(path_or_command),
            content: code,
          });
        } else {
          warnings.push(format!("PREPEND 块缺少代码块: {path_or_command}"));
        }
      }
      "DELETE" => {
        if !path_or_command.is_empty() {
          ops.push(DslOp::Delete {
            path: PathBuf::from(path_or_command),
          });
        } else {
          warnings.push("DELETE 块缺少文件路径".to_string());
        }
      }
      "READ" => {
        if !path_or_command.is_empty() {
          ops.push(DslOp::Read {
            path: PathBuf::from(path_or_command),
          });
        } else {
          warnings.push("READ 块缺少文件路径".to_string());
        }
      }
      "EXISTS" => {
        if !path_or_command.is_empty() {
          ops.push(DslOp::Exists {
            path: PathBuf::from(path_or_command),
          });
        } else {
          warnings.push("EXISTS 块缺少文件路径".to_string());
        }
      }
      "COMMAND" => {
        if !path_or_command.is_empty() {
          ops.push(DslOp::Command {
            command: path_or_command,
          });
        } else if let Some(code) = first_code {
          ops.push(DslOp::Command {
            command: code.trim_end().to_string(),
          });
        } else {
          warnings.push("COMMAND 块缺少命令内容".to_string());
        }
      }
      "MOVE" => {
        if let Some((from_str, to_str)) = path_or_command.split_once(" -> ") {
          let from = clean_path(from_str);
          let to = clean_path(to_str);
          if !from.is_empty() && !to.is_empty() {
            ops.push(DslOp::Move {
              from: PathBuf::from(from),
              to: PathBuf::from(to),
            });
          } else {
            warnings.push("MOVE 块缺少有效路径".to_string());
          }
        } else {
          warnings.push("MOVE 块格式错误，应为 MOVE: from -> to".to_string());
        }
      }
      "COPY" => {
        if let Some((from_str, to_str)) = path_or_command.split_once(" -> ") {
          let from = clean_path(from_str);
          let to = clean_path(to_str);
          if !from.is_empty() && !to.is_empty() {
            ops.push(DslOp::Copy {
              from: PathBuf::from(from),
              to: PathBuf::from(to),
            });
          } else {
            warnings.push("COPY 块缺少有效路径".to_string());
          }
        } else {
          warnings.push("COPY 块格式错误，应为 COPY: from -> to".to_string());
        }
      }
      other => {
        warnings.push(format!("未知 DSL 操作类型: {other}"));
      }
    }
  }

  let has_work = !ops.is_empty();
  ParseResult {
    ops,
    raw_text: input.to_string(),
    has_work,
    warnings,
  }
}

fn parse_conflict_marker(code: &str) -> Option<(String, String)> {
  let lines: Vec<&str> = code.lines().collect();
  let mut i = 0;
  while i < lines.len() && !lines[i].trim().starts_with("<<<<<<< ORIGINAL") {
    i += 1;
  }
  if i >= lines.len() {
    return None;
  }

  i += 1;
  let mut orig = Vec::new();
  while i < lines.len() && !lines[i].trim().starts_with("=======") {
    orig.push(lines[i]);
    i += 1;
  }
  if i >= lines.len() {
    return None;
  }

  i += 1;
  let mut updated = Vec::new();
  while i < lines.len() && !lines[i].trim().starts_with(">>>>>>> UPDATED") {
    updated.push(lines[i]);
    i += 1;
  }
  if i >= lines.len() {
    return None;
  }

  Some((
    orig.join("\n").trim_end().to_string(),
    updated.join("\n").trim_end().to_string(),
  ))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_markdown_parser() {
    let input = r#"
### CREATE: src/hello.txt
```txt
hello world
```
### DELETE: src/old.txt
### REPLACE: src/main.rs
```rust
<<<<<<< ORIGINAL
foo
=======
bar
>>>>>>> UPDATED
```
"#;
    let res = parse_dsl(input, DslMode::Markdown);
    assert_eq!(res.ops.len(), 3);
    assert!(res.has_work);
  }

  #[test]
  fn test_plain_parser_mixed() {
    let input = r#"
!CREATE: src/foo.txt
some content
!END
!DELETE: src/bar.txt
!READ: src/foo.txt
"#;
    let res = parse_dsl(input, DslMode::Plain);
    assert_eq!(res.ops.len(), 3);
    assert!(res.has_work);
  }
}
