import { describe, expect, it } from 'vitest'
import { op, parseDSL } from '../src/dsl'

describe('op constructors', () => {
  it('should create CREATE op', () => {
    expect(op.create('path', 'content')).toEqual(op.create('path', 'content'))
    expect(op.create('path')).toEqual(op.create('path'))
  })

  it('should create DELETE op', () => {
    expect(op.delete('path')).toEqual(op.delete('path'))
  })

  it('should create REPLACE op', () => {
    expect(op.replace('path', 'old', 'new')).toEqual(op.replace('path', 'old', 'new'))
  })

  it('should create READ op', () => {
    expect(op.read('path')).toEqual(op.read('path'))
  })

  it('should create COMMAND op', () => {
    expect(op.command('echo hi')).toEqual(op.command('echo hi'))
  })

  it('should create EXISTS op', () => {
    expect(op.exists('path')).toEqual(op.exists('path'))
  })

  it('should create MOVE op', () => {
    expect(op.move('from', 'to')).toEqual(op.move('from', 'to'))
  })

  it('should create COPY op', () => {
    expect(op.copy('from', 'to')).toEqual(op.copy('from', 'to'))
  })

  it('should create WRITE op', () => {
    expect(op.write('path', 'content')).toEqual(op.write('path', 'content'))
  })

  it('should create APPEND op', () => {
    expect(op.append('path', 'content')).toEqual(op.append('path', 'content'))
  })

  it('should create PREPEND op', () => {
    expect(op.prepend('path', 'content')).toEqual(op.prepend('path', 'content'))
  })
})

describe('DSL Parser (parseDSL)', () => {
  it('should recognize pure Relax mode', () => {
    const input = '这是一个普通的回答，没有任何代码修改指令。'
    const result = parseDSL(input, true)
    expect(result.hasWork).toBe(false)
    expect(result.ops).toHaveLength(0)
  })

  describe('Markdown mode', () => {
    it('should parse REPLACE block', () => {
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
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(
        op.replace('src/auth.ts', 'const a = 1;\nconst b = 2;', 'const a = 100;\nconst b = 200;')
      )
    })

    it('should parse CREATE with content (file)', () => {
      const input = `
### CREATE: src/config.ts
\`\`\`ts
export const PORT = 3000;
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.create('src/config.ts', 'export const PORT = 3000;'))
    })

    it('should parse CREATE without content (directory)', () => {
      const input = `
### CREATE: src/new_dir
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.create('src/new_dir', ''))
    })

    it('should parse WRITE block', () => {
      const input = `
### WRITE: src/config.ts
\`\`\`ts
export const PORT = 8080;
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.write('src/config.ts', 'export const PORT = 8080;'))
    })

    it('should parse APPEND block', () => {
      const input = `
### APPEND: src/config.ts
\`\`\`ts
// new line
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.append('src/config.ts', '// new line'))
    })

    it('should parse PREPEND block', () => {
      const input = `
### PREPEND: src/config.ts
\`\`\`ts
import { env } from 'node:process'
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.prepend('src/config.ts', "import { env } from 'node:process'"))
    })

    it('should parse DELETE block', () => {
      const input = `
### DELETE: src/legacy.ts
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.delete('src/legacy.ts'))
    })

    it('should parse READ block', () => {
      const input = `
### READ: src/index.ts
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.read('src/index.ts'))
    })

    it('should parse EXISTS block', () => {
      const input = `
### EXISTS: src/index.ts
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.exists('src/index.ts'))
    })

    it('should parse MOVE block', () => {
      const input = `
### MOVE: src/old.ts -> src/new.ts
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.move('src/old.ts', 'src/new.ts'))
    })

    it('should parse COPY block', () => {
      const input = `
### COPY: src/from.ts -> src/to.ts
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.copy('src/from.ts', 'src/to.ts'))
    })

    it('should parse COMMAND block', () => {
      const input = `
### COMMAND
\`\`\`
echo "Hello, World!"
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.command('echo "Hello, World!"'))
    })

    it('should parse COMMAND with inline path', () => {
      const input = `
### COMMAND: npm run build
`
      const result = parseDSL(input)
      expect(result.ops[0]).toEqual(op.command('npm run build'))
    })
  })

  describe('Plain mode (! prefix)', () => {
    it('should parse !CREATE with content (file)', () => {
      const input = `
!CREATE: src/utils/math.ts
export const add = (a: number, b: number) => a + b;
!END
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(
        op.create('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;')
      )
    })

    it('should parse !CREATE without content (directory)', () => {
      const input = `
!CREATE: src/new_dir
!END
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.create('src/new_dir', ''))
    })

    it('should parse !WRITE block', () => {
      const input = `
!WRITE: src/config.ts
export const PORT = 8080;
!END
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.write('src/config.ts', 'export const PORT = 8080;'))
    })

    it('should parse !APPEND block', () => {
      const input = `
!APPEND: src/config.ts
// new line
!END
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.append('src/config.ts', '// new line'))
    })

    it('should parse !PREPEND block', () => {
      const input = `
!PREPEND: src/config.ts
import { env } from 'node:process'
!END
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.prepend('src/config.ts', "import { env } from 'node:process'"))
    })

    it('should parse !DELETE block', () => {
      const input = `
!DELETE: src/legacy.ts
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.delete('src/legacy.ts'))
    })

    it('should parse !READ block', () => {
      const input = `
!READ: src/index.ts
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.read('src/index.ts'))
    })

    it('should parse !EXISTS block', () => {
      const input = `
!EXISTS: src/index.ts
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.exists('src/index.ts'))
    })

    it('should parse !MOVE block', () => {
      const input = `
!MOVE: src/old.ts -> src/new.ts
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.move('src/old.ts', 'src/new.ts'))
    })

    it('should parse !COPY block', () => {
      const input = `
!COPY: src/from.ts -> src/to.ts
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.copy('src/from.ts', 'src/to.ts'))
    })

    it('should parse !COMMAND block', () => {
      const input = `
!COMMAND: npm run test src/auth.test.ts
`
      const result = parseDSL(input, true)
      expect(result.ops[0]).toEqual(op.command('npm run test src/auth.test.ts'))
    })

    it('should parse mixed DSL blocks in plain mode', () => {
      const input = `
!REPLACE: src/index.ts
<<<<<<< ORIGINAL
console.log('old');
=======
console.log('new');
>>>>>>> UPDATED

!CREATE: src/new_dir
!END

!WRITE: src/config.ts
export const PORT = 3000;
!END

!MOVE: src/old.ts -> src/new.ts
!DELETE: src/temp.ts
!COMMAND: npm run build
`
      const result = parseDSL(input, true)
      expect(result.ops.map((b) => b.type)).toEqual(['REPLACE', 'CREATE', 'WRITE', 'MOVE', 'DELETE', 'COMMAND'])
    })
  })

  describe('Edge cases', () => {
    it('should clean path of markdown backticks', () => {
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
      expect((result.ops[0] as { filePath: string }).filePath).toBe('src/auth.ts')
    })

    it('should parse REPLACE with empty UPDATED', () => {
      const input = `
### REPLACE: src/types.rs
\`\`\`rust
<<<<<<< ORIGINAL
struct Foo {}
=======
>>>>>>> UPDATED
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toMatchObject(op.replace('src/types.rs', 'struct Foo {}', ''))
    })

    it('should parse REPLACE with UPDATED containing literal marker', () => {
      const input = `
### REPLACE: src/parser.ts
\`\`\`typescript
<<<<<<< ORIGINAL
const old = 1
=======
const marker = 'stop at >>>>>>> UPDATED here'
const real = 2
>>>>>>> UPDATED
\`\`\`
`
      const result = parseDSL(input)
      expect(result.ops[0]).toMatchObject(
        op.replace('src/parser.ts', 'const old = 1', "const marker = 'stop at >>>>>>> UPDATED here'\nconst real = 2")
      )
    })

    it('should emit warning for malformed MOVE', () => {
      const input = `
### MOVE: src/old.ts
`
      const result = parseDSL(input)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('MOVE')
    })

    it('should emit warning for malformed COPY', () => {
      const input = `
### COPY: src/from.ts
`
      const result = parseDSL(input)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('COPY')
    })

    it('should emit warning for !MOVE malformed in plain mode', () => {
      const input = `
!MOVE: src/old.ts
`
      const result = parseDSL(input, true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('MOVE')
    })
  })
})
