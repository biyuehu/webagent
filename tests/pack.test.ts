import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractSkeleton, generateTree, getGitDiffForFiles } from '../src/pack'

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

  describe('extractSkeleton', () => {
    it('should extract types and functions signatures while dropping function bodies', () => {
      const code = `
        export interface User {
          id: string
          name: string
        }
        export function getUser(id: string): User {
          const name = "test"
          return { id, name }
        }
        export class Service {
          async run(): Promise<void> {
            console.log("doing work")
          }
        }
      `

      const skeleton = extractSkeleton(code, 'test.ts')

      expect(skeleton).toContain('interface User')
      expect(skeleton).toContain('function getUser(id: string): User;')
      expect(skeleton).not.toContain('const name = "test"')
      expect(skeleton).not.toContain('console.log("doing work")')
    })
  })

  describe('getGitDiffForFiles', () => {
    it('should return empty string when empty array or non-existent files passed', () => {
      expect(getGitDiffForFiles([])).toBe('')
      expect(getGitDiffForFiles(['non_existent_file.ts'])).toBe('')
    })
  })
})
