import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyDSLDef } from '../src/apply'
import type { DSLDef } from '../src/dsl'

const tmpDir = path.join(__dirname, 'tmp_test_apply')

beforeEach(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  fs.mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('applyDSLDef', () => {
  it('should handle CREATE op successfully', () => {
    const filePath = path.join(tmpDir, 'nested', 'created.txt')
    const op: DSLDef = {
      type: 'CREATE',
      label: 'mutating',
      filePath,
      content: 'hello world'
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Right')
    expect(fs.existsSync(filePath)).toBe(true)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world')
  })

  it('should handle DELETE op successfully', () => {
    const filePath = path.join(tmpDir, 'to_delete.txt')
    fs.writeFileSync(filePath, 'delete me', 'utf-8')

    const op: DSLDef = {
      type: 'DELETE',
      label: 'dangerous',
      filePath
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Right')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('should handle REPLACE op successfully', () => {
    const filePath = path.join(tmpDir, 'target.ts')
    fs.writeFileSync(filePath, 'const a = 1;\nconst b = 2;', 'utf-8')

    const op: DSLDef = {
      type: 'REPLACE',
      label: 'mutating',
      filePath,
      original: 'const b = 2;',
      updated: 'const b = 42;'
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Right')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('const a = 1;\nconst b = 42;')
  })

  it('should return Left when REPLACE target file does not exist', () => {
    const op: DSLDef = {
      type: 'REPLACE',
      label: 'mutating',
      filePath: path.join(tmpDir, 'non_existent.ts'),
      original: 'foo',
      updated: 'bar'
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toContain('File not found')
    }
  })

  it('should handle COMMAND op and return command string on Right', () => {
    const op: DSLDef = {
      type: 'COMMAND',
      label: 'dangerous',
      command: 'node -v'
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Right')
    if (result._tag === 'Right') {
      expect(result.right).toBe('node -v')
    }
  })

  it('should handle READ op for a file and return content on Right', () => {
    const filePath = path.join(tmpDir, 'read_me.ts')
    fs.writeFileSync(filePath, 'export const x = 10;', 'utf-8')

    const op: DSLDef = {
      type: 'READ',
      label: 'readonly',
      filePath
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Right')
    if (result._tag === 'Right') {
      expect(result.right).toContain('export const x = 10;')
      expect(result.right).toContain('### File:')
    }
  })

  it('should handle READ op for a directory and return tree on Right', () => {
    const subDir = path.join(tmpDir, 'subdir')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(subDir, 'file.txt'), 'content', 'utf-8')

    const op: DSLDef = {
      type: 'READ',
      label: 'readonly',
      filePath: subDir
    }

    const result = applyDSLDef(op)

    expect(result._tag).toBe('Right')
    if (result._tag === 'Right') {
      expect(result.right).toContain('file.txt')
      expect(result.right).toContain('### Directory:')
    }
  })
})
