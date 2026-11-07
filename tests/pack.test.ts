import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectPackedFiles, generateTree, getGitDiffForFiles } from '../src/pack'

describe('pack.ts', () => {
  const tmpDir = path.join(__dirname, 'tmp_test_pack')

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

  describe('generateTree', () => {
    it('should generate tree ignoring default ignored folders', () => {
      fs.mkdirSync(path.join(tmpDir, 'node_modules'))
      fs.writeFileSync(path.join(tmpDir, 'node_modules', 'ignored.js'), 'module')
      fs.mkdirSync(path.join(tmpDir, 'src'))
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'console.log()')

      const tree = generateTree(tmpDir)

      expect(tree).not.toContain('node_modules')
      expect(tree).toContain('src/')
      expect(tree).toContain('index.ts')
    })
  })

  describe('collectPackedFiles', () => {
    it('should collect matching files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'content a')
      fs.writeFileSync(path.join(tmpDir, 'b.js'), 'content b')

      const files = await collectPackedFiles(['*.ts'], tmpDir)
      expect(files).toEqual(['a.ts'])
    })
  })

  describe('getGitDiffForFiles', () => {
    it('should return empty string when empty array or non-existent files passed', () => {
      expect(getGitDiffForFiles([])).toBe('')
      expect(getGitDiffForFiles(['non_existent_file.ts'])).toBe('')
    })
  })
})
