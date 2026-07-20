import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createUndoPatch, listUndoPatches, popUndoPatch } from '../src/undo'

const tmpDir = path.join(__dirname, 'tmp_test_undo')
const undoDir = path.join(tmpDir, '.git', 'mycli', 'undo')
let originalCwd = ''

beforeEach(() => {
  originalCwd = process.cwd()

  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  fs.mkdirSync(tmpDir, { recursive: true })

  execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' })
  execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' })
  execSync('git config core.autocrlf false', { cwd: tmpDir, stdio: 'ignore' })

  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('undo', () => {
  it('should create patch, list patch, and pop patch to restore modified files', () => {
    const targetFile = 'code.ts'
    fs.writeFileSync(targetFile, 'const version = 1;\n', 'utf-8')

    execSync('git add code.ts', { stdio: 'ignore' })
    execSync('git commit -m "initial"', { stdio: 'ignore' })

    fs.writeFileSync(targetFile, 'const version = 2;\n', 'utf-8')

    const createRes = createUndoPatch([targetFile], undoDir)
    expect(createRes._tag).toBe('Right')

    const patchList = listUndoPatches(undoDir)
    expect(patchList.length).toBe(1)
    expect(patchList[0]).toMatch(/^snapshot_.*\.patch$/)

    const popRes = popUndoPatch(undoDir)
    expect(popRes._tag).toBe('Right')

    const content = fs.readFileSync(targetFile, 'utf-8').replace(/\r\n/g, '\n')
    expect(content).toBe('const version = 1;\n')
    expect(listUndoPatches(undoDir).length).toBe(0)
  })

  it('should return Left when trying to pop from empty undo directory', () => {
    const popRes = popUndoPatch(undoDir)
    expect(popRes._tag).toBe('Left')
    if (popRes._tag === 'Left') {
      expect(popRes.left).toContain('No undo directory found')
    }
  })
})
