import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyDSLDef } from '../src/apply'
import { op } from '../src/dsl'

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
  describe('CREATE', () => {
    it('should create file with content', () => {
      const filePath = path.join(tmpDir, 'nested', 'created.txt')
      const result = applyDSLDef(op.create(filePath, 'hello world'))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world')
    })

    it('should create directory when content is empty', () => {
      const dirPath = path.join(tmpDir, 'new', 'deep', 'dir')
      const result = applyDSLDef(op.create(dirPath, ''))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(dirPath)).toBe(true)
      expect(fs.statSync(dirPath).isDirectory()).toBe(true)
    })

    it('should return Left if target already exists (file)', () => {
      const filePath = path.join(tmpDir, 'exists.txt')
      fs.writeFileSync(filePath, 'existing', 'utf-8')
      const result = applyDSLDef(op.create(filePath, 'new'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('already exists')
    })

    it('should return Left if target already exists (directory)', () => {
      const dirPath = path.join(tmpDir, 'exists_dir')
      fs.mkdirSync(dirPath)
      const result = applyDSLDef(op.create(dirPath, ''))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('already exists')
    })
  })

  describe('DELETE', () => {
    it('should delete file', () => {
      const filePath = path.join(tmpDir, 'to_delete.txt')
      fs.writeFileSync(filePath, 'delete me', 'utf-8')
      const result = applyDSLDef(op.delete(filePath))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(filePath)).toBe(false)
    })

    it('should delete directory recursively', () => {
      const dirPath = path.join(tmpDir, 'to_delete_dir')
      fs.mkdirSync(dirPath)
      fs.writeFileSync(path.join(dirPath, 'nested.txt'), 'content', 'utf-8')
      const result = applyDSLDef(op.delete(dirPath))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(dirPath)).toBe(false)
    })

    it('should return Right (no-op) if target does not exist', () => {
      const result = applyDSLDef(op.delete(path.join(tmpDir, 'nonexistent')))
      expect(result._tag).toBe('Right')
    })
  })

  describe('REPLACE', () => {
    it('should replace content in file', () => {
      const filePath = path.join(tmpDir, 'target.ts')
      fs.writeFileSync(filePath, 'const a = 1;\nconst b = 2;', 'utf-8')
      const result = applyDSLDef(op.replace(filePath, 'const b = 2;', 'const b = 42;'))
      expect(result._tag).toBe('Right')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('const a = 1;\nconst b = 42;')
    })

    it('should return Left if file not found', () => {
      const result = applyDSLDef(op.replace(path.join(tmpDir, 'non_existent.ts'), 'foo', 'bar'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('File not found')
    })

    it('should return Left if original not found', () => {
      const filePath = path.join(tmpDir, 'target.txt')
      fs.writeFileSync(filePath, 'hello world', 'utf-8')
      const result = applyDSLDef(op.replace(filePath, 'not here', 'there'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('Original not found')
    })

    it('should return Left if original found multiple times', () => {
      const filePath = path.join(tmpDir, 'dup.txt')
      fs.writeFileSync(filePath, 'foo\nfoo\n', 'utf-8')
      const result = applyDSLDef(op.replace(filePath, 'foo', 'bar'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('multiple times')
    })
  })

  describe('COMMAND', () => {
    it('should execute command and return command string', () => {
      const result = applyDSLDef(op.command('node -v'))
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') expect(result.right).toBe('node -v')
    })
  })

  describe('READ', () => {
    it('should read file and return content', () => {
      const filePath = path.join(tmpDir, 'read_me.ts')
      fs.writeFileSync(filePath, 'export const x = 10;', 'utf-8')
      const result = applyDSLDef(op.read(filePath))
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right).toContain('export const x = 10;')
        expect(result.right).toContain('### File:')
      }
    })

    it('should read directory and return tree', () => {
      const subDir = path.join(tmpDir, 'subdir')
      fs.mkdirSync(subDir, { recursive: true })
      fs.writeFileSync(path.join(subDir, 'file.txt'), 'content', 'utf-8')
      const result = applyDSLDef(op.read(subDir))
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right).toContain('file.txt')
        expect(result.right).toContain('### Directory:')
      }
    })

    it('should return Left if target not found', () => {
      const result = applyDSLDef(op.read(path.join(tmpDir, 'nonexistent')))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('not found')
    })
  })

  describe('EXISTS', () => {
    it('should return Right with "存在" for existing file', () => {
      const filePath = path.join(tmpDir, 'exists.txt')
      fs.writeFileSync(filePath, 'content', 'utf-8')
      const result = applyDSLDef(op.exists(filePath))
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right).toContain('✅ 存在')
        expect(result.right).toContain('文件')
      }
    })

    it('should return Right with "存在" for existing directory', () => {
      const dirPath = path.join(tmpDir, 'exists_dir')
      fs.mkdirSync(dirPath)
      const result = applyDSLDef(op.exists(dirPath))
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right).toContain('✅ 存在')
        expect(result.right).toContain('目录')
      }
    })

    it('should return Right with "不存在" for non-existent target', () => {
      const result = applyDSLDef(op.exists(path.join(tmpDir, 'nonexistent')))
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') expect(result.right).toContain('❌ 不存在')
    })
  })

  describe('MOVE', () => {
    it('should move file', () => {
      const from = path.join(tmpDir, 'from.txt')
      const to = path.join(tmpDir, 'sub', 'to.txt')
      fs.writeFileSync(from, 'content', 'utf-8')
      const result = applyDSLDef(op.move(from, to))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(from)).toBe(false)
      expect(fs.existsSync(to)).toBe(true)
      expect(fs.readFileSync(to, 'utf-8')).toBe('content')
    })

    it('should move directory recursively', () => {
      const from = path.join(tmpDir, 'from_dir')
      const to = path.join(tmpDir, 'to_dir')
      fs.mkdirSync(from)
      fs.writeFileSync(path.join(from, 'nested.txt'), 'nested', 'utf-8')
      const result = applyDSLDef(op.move(from, to))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(from)).toBe(false)
      expect(fs.existsSync(to)).toBe(true)
      expect(fs.readFileSync(path.join(to, 'nested.txt'), 'utf-8')).toBe('nested')
    })

    it('should return Left if source not found', () => {
      const result = applyDSLDef(op.move(path.join(tmpDir, 'nonexistent'), path.join(tmpDir, 'dest')))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('Source not found')
    })

    it('should return Left if target already exists', () => {
      const from = path.join(tmpDir, 'from.txt')
      const to = path.join(tmpDir, 'to.txt')
      fs.writeFileSync(from, 'content', 'utf-8')
      fs.writeFileSync(to, 'existing', 'utf-8')
      const result = applyDSLDef(op.move(from, to))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('already exists')
    })
  })

  describe('COPY', () => {
    it('should copy file', () => {
      const from = path.join(tmpDir, 'from.txt')
      const to = path.join(tmpDir, 'sub', 'to.txt')
      fs.writeFileSync(from, 'content', 'utf-8')
      const result = applyDSLDef(op.copy(from, to))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(from)).toBe(true)
      expect(fs.existsSync(to)).toBe(true)
      expect(fs.readFileSync(to, 'utf-8')).toBe('content')
    })

    it('should copy directory recursively', () => {
      const from = path.join(tmpDir, 'from_dir')
      const to = path.join(tmpDir, 'to_dir')
      fs.mkdirSync(from)
      fs.writeFileSync(path.join(from, 'nested.txt'), 'nested', 'utf-8')
      const result = applyDSLDef(op.copy(from, to))
      expect(result._tag).toBe('Right')
      expect(fs.existsSync(from)).toBe(true)
      expect(fs.existsSync(to)).toBe(true)
      expect(fs.readFileSync(path.join(to, 'nested.txt'), 'utf-8')).toBe('nested')
    })

    it('should return Left if source not found', () => {
      const result = applyDSLDef(op.copy(path.join(tmpDir, 'nonexistent'), path.join(tmpDir, 'dest')))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('Source not found')
    })

    it('should return Left if target already exists', () => {
      const from = path.join(tmpDir, 'from.txt')
      const to = path.join(tmpDir, 'to.txt')
      fs.writeFileSync(from, 'content', 'utf-8')
      fs.writeFileSync(to, 'existing', 'utf-8')
      const result = applyDSLDef(op.copy(from, to))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('already exists')
    })
  })

  describe('WRITE', () => {
    it('should overwrite existing file', () => {
      const filePath = path.join(tmpDir, 'target.txt')
      fs.writeFileSync(filePath, 'old content', 'utf-8')
      const result = applyDSLDef(op.write(filePath, 'new content'))
      expect(result._tag).toBe('Right')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
    })

    it('should return Left if file not found', () => {
      const result = applyDSLDef(op.write(path.join(tmpDir, 'nonexistent.txt'), 'content'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('File not found')
    })

    it('should return Left if target is a directory', () => {
      const dirPath = path.join(tmpDir, 'adir')
      fs.mkdirSync(dirPath)
      const result = applyDSLDef(op.write(dirPath, 'content'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('directory')
    })
  })

  describe('APPEND', () => {
    it('should append to existing file', () => {
      const filePath = path.join(tmpDir, 'target.txt')
      fs.writeFileSync(filePath, 'first line\n', 'utf-8')
      const result = applyDSLDef(op.append(filePath, 'second line\n'))
      expect(result._tag).toBe('Right')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('first line\nsecond line\n')
    })

    it('should return Left if file not found', () => {
      const result = applyDSLDef(op.append(path.join(tmpDir, 'nonexistent.txt'), 'content'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('File not found')
    })

    it('should return Left if target is a directory', () => {
      const dirPath = path.join(tmpDir, 'adir')
      fs.mkdirSync(dirPath)
      const result = applyDSLDef(op.append(dirPath, 'content'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('directory')
    })
  })

  describe('PREPEND', () => {
    it('should prepend to existing file', () => {
      const filePath = path.join(tmpDir, 'target.txt')
      fs.writeFileSync(filePath, 'second line\n', 'utf-8')
      const result = applyDSLDef(op.prepend(filePath, 'first line\n'))
      expect(result._tag).toBe('Right')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('first line\nsecond line\n')
    })

    it('should return Left if file not found', () => {
      const result = applyDSLDef(op.prepend(path.join(tmpDir, 'nonexistent.txt'), 'content'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('File not found')
    })

    it('should return Left if target is a directory', () => {
      const dirPath = path.join(tmpDir, 'adir')
      fs.mkdirSync(dirPath)
      const result = applyDSLDef(op.prepend(dirPath, 'content'))
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') expect(result.left).toContain('directory')
    })
  })
})
