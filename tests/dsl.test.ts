import { describe, expect, it } from 'vitest'
import { parseDSL } from '../src/dsl'

describe('DSL Parser (parseDSL)', () => {
  it('应当识别纯 Relax 模式（不包含任何 DSL 块）', () => {
    const input = '这是一个普通的回答，没有任何代码修改指令。'
    const result = parseDSL(input, false)

    expect(result.hasWork).toBe(false)
    expect(result.blocks).toHaveLength(0)
  })

  it('应当精准解析标准的 Markdown REPLACE 块', () => {
    const input = `
### REPLACE: src/auth.ts
\`\`\`ts
<<<<<<< ORIGINAL
const a = 1;
const b = 2;
=======
const a = 100;
const b = 200;
>>>>>>> UPDATED
\`\`\`

一些后续说明...
`
    const result = parseDSL(input)

    expect(result.hasWork).toBe(true)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toEqual({
      type: 'REPLACE',
      label: 'mutating',
      filePath: 'src/auth.ts',
      original: 'const a = 1;\nconst b = 2;',
      updated: 'const a = 100;\nconst b = 200;'
    })
  })

  it('应当精准解析 !CREATE 块（非 Markdown 模式，包含 !END 标记）', () => {
    const input = `
!CREATE: src/utils/math.ts
export const add = (a: number, b: number) => a + b;
export const sub = (a: number, b: number) => a - b;
!END
`
    const result = parseDSL(input, false)

    expect(result.hasWork).toBe(true)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toEqual({
      type: 'CREATE',
      label: 'mutating',
      filePath: 'src/utils/math.ts',
      content:
        'export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;'
    })
  })

  it('应当正确处理 Markdown CREATE 块', () => {
    const input = `
### CREATE: src/config.ts
\`\`\`ts
export const PORT = 3000;
\`\`\`
`
    const result = parseDSL(input)

    expect(result.hasWork).toBe(true)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toEqual({
      type: 'CREATE',
      label: 'mutating',
      filePath: 'src/config.ts',
      content: 'export const PORT = 3000;'
    })
  })

  it('应当正确处理 Markdown COMMAND 块', () => {
    const input = `
### COMMAND
\`\`\`
echo "Hello, World!"
\`\`\`
`
    const result = parseDSL(input)

    expect(result.hasWork).toBe(true)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toEqual({
      type: 'COMMAND',
      label: 'dangerous',
      command: 'echo "Hello, World!"'
    })
  })
  it('应当精准解析 !DELETE 和 !COMMAND 指令（非 Markdown 模式）', () => {
    const input = `
!DELETE: src/legacy/old_auth.ts
!COMMAND: npm run test src/auth.test.ts`
    const result = parseDSL(input, false)

    expect(result.hasWork).toBe(true)
    expect(result.blocks).toHaveLength(2)
    expect(result.blocks[0]).toEqual({
      type: 'DELETE',
      label: 'dangerous',
      filePath: 'src/legacy/old_auth.ts'
    })
    expect(result.blocks[1]).toEqual({
      type: 'COMMAND',
      label: 'dangerous',
      command: 'npm run test src/auth.test.ts'
    })
  })

  it('应当能够连续解析组合发生的混合 DSL 块（非 Markdown 模式）', () => {
    const input = `
修改已就绪：

!REPLACE: src/index.ts
<<<<<<< ORIGINAL
console.log('old');
=======
console.log('new');
>>>>>>> UPDATED

!CREATE: src/new_file.ts
console.log('created');
!END

!DELETE: src/temp.ts
!COMMAND: npm run build
`
    const result = parseDSL(input, false)
    expect(result.hasWork).toBe(true)
    expect(result.blocks).toHaveLength(4)
    expect(result.blocks.map((b) => b.type)).toEqual(['REPLACE', 'CREATE', 'DELETE', 'COMMAND'])
  })

  it('应当容错清洗路径中的 Markdown 样式字符（如 `src/auth.ts`）', () => {
    const input = `
### REPLACE: \`src/auth.ts\`
\`\`\`ts
<<<<<<< ORIGINAL
foo
=======
bar
>>>>>>> UPDATED
\`\`\`
`
    const result = parseDSL(input)

    expect((result.blocks[0] as { filePath: string }).filePath).toBe('src/auth.ts')
  })

  it('应当正确解析 Markdown 模式下 UPDATED 为空的 REPLACE 块', () => {
    const input = `
### REPLACE: src/types.rs
\`\`\`rust
<<<<<<< ORIGINAL
#[derive(Debug, FromQueryResult)]
struct TempSearchResult {
  pub pid: u32,
  pub str_id: Option<String>,
  pub title: String,
  pub text: String,
  pub modified: u32,
}
=======
>>>>>>> UPDATED
\`\`\`
`
    const result = parseDSL(input)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toEqual({
      type: 'REPLACE',
      label: 'mutating',
      filePath: 'src/types.rs',
      original:
        '#[derive(Debug, FromQueryResult)]\nstruct TempSearchResult {\n  pub pid: u32,\n  pub str_id: Option<String>,\n  pub title: String,\n  pub text: String,\n  pub modified: u32,\n}',
      updated: ''
    })
  })
})
