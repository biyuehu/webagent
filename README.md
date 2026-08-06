<!-- markdownlint-disable MD060 MD033 MD022 -->

# Web Agent [![CI](https://github.com/biyuehu/webagentx/actions/workflows/build.yml/badge.svg)](https://github.com/biyuehu/webagentx/actions/workflows/build.yml) [![npm version](https://img.shields.io/npm/v/webagentx.svg)](https://www.npmjs.com/package/webagentx) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0) [![Bun](https://img.shields.io/badge/Bun-1.x-000000?logo=bun&logoColor=white)](https://bun.sh)

<div align="center">
  <img src="./images/logo.png" alt="Web Agent Logo" width="200" />
</div>

A lightweight, DSL-driven AI agent for file operations, code modification, and command execution — designed for web and client-side AI assistants.

## Why Web Agent?

Most AI coding assistants are either:

- **Cloud-based**: Require API keys, network access, and recurring payments
- **Heavy**: Packed with features you don't need, slow to start

**Web Agent** is different:

- **Works with any web AI** — Copy the generated prompt, paste it into your browser's AI chat (Claude, ChatGPT, DeepSeek, etc.), and let the AI respond with DSL commands
- **Zero cost** — No API calls, no token billing, no network dependency
- **Instant** — Runs locally with Bun, no server setup, no waiting
- **Transparent** — You see every file change and command before it executes
- **Your data stays yours** — No telemetry, no cloud sync, no third-party servers

It bridges the gap between "AI in the browser" and "files on your machine" — securely, offline, and free.

## Features

- **DSL-based operations** — File create, replace, delete, read, move, copy, write, append, prepend, exists, and command execution
- **Markdown or plain-text DSL** — Works with any AI output format
- **Interactive TUI** — Monitor clipboard, trigger operations automatically
- **Git integration** — Undo support, diff preview, `.gitignore` awareness
- **AST simplification** — Reduces noise when feeding code to AI
- **Zero dependencies for the core runtime** — Built with Bun, runs fast

## Installation

```bash
bun install -g webagentx
npm install -g webagentx
pnpm add -g webagentx
yarn global add webagentx
```

### Direct usage (no install)

```bash
bunx webagentx
npx webagentx
pnpm dlx webagentx
yarn dlx webagentx
```

## Commands

After installation, the following commands are available:

| Command | Alias | Description |
|---------|-------|-------------|
| `webagentx` | `wa`, `ro` | Main entry point |

```bash
# All three are equivalent
webagentx apply
wa apply
ro apply
```

## Usage

### Apply DSL from clipboard

```bash
webagentx apply
```

### Apply from file

```bash
webagentx apply ./instructions.md
```

### Pack context for AI

```bash
webagentx pack ./src/**/*.ts --goal "Refactor the auth module"
```

### Interactive TUI

```bash
webagentx loop
```

### Undo last change

```bash
webagentx undo
```

## How It Works

1. **Pack**: `webagentx pack` collects your code context, project structure, and system instructions into a prompt
2. **AI**: Copy the prompt to your browser AI (Claude, ChatGPT, DeepSeek, Gemini, etc.)
3. **Apply**: The AI responds with DSL operations — copy that response, run `webagentx apply`
4. **Review**: Confirm dangerous operations (DELETE, COMMAND, WRITE) before execution

The workflow is clipboard-based and works with any AI that can follow structured output formats.

## Options

### `apply`

| Option | Description |
| -------- | ------------- |
| `--stdin` | Read from standard input instead of clipboard |
| `--allow-all` | Skip confirmation for dangerous operations |
| `--plain` | Use plain-text DSL instead of Markdown |
| `--no-undo` | Disable undo snapshot generation |

### `pack`

| Option | Description |
| -------- | ------------- |
| `--goal <text>` | Task goal for the AI |
| `--only` | Include only file contents, skip system instructions |
| `--plain` | Use plain-text DSL instead of Markdown |
| `--no-tree` | Exclude project directory tree |
| `--no-diff` | Exclude Git diff of focus files |

### `undo`

| Option | Description |
|--------|-------------|
| `--list` | List available undo snapshots |

## Configuration

### Biome

The project uses Biome for linting and formatting:

```bash
bun fix
```

### Lefthook

Pre-commit hooks run formatting and tests automatically:

```bash
bun init  # Installs lefthook hooks
```

## Development

```bash
bun install
bun run build
bun test
```

## License

GPL-3.0

## Author

ArimuraSena <i@arimuraromi.com>
