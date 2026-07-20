import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { type Either, left, right } from './types'

export function createUndoPatch(affectedFiles: string[], undoDir: string): Either<string, string> {
  try {
    if (affectedFiles.length === 0) return left('No files specified for snapshot')
    if (!fs.existsSync(undoDir)) fs.mkdirSync(undoDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const patchFileName = `snapshot_${timestamp}.patch`
    const patchPath = path.join(undoDir, patchFileName)
    const fileArgs = affectedFiles.map((f) => `"${f}"`).join(' ')
    const diffOutput = execSync(`git diff HEAD -- ${fileArgs}`, { encoding: 'utf-8' })

    fs.writeFileSync(patchPath, diffOutput, 'utf-8')
    return right(patchPath)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return left(`Failed to create undo patch: ${message}`)
  }
}

export function popUndoPatch(undoDir: string): Either<string, string> {
  try {
    if (!fs.existsSync(undoDir)) return left('No undo directory found')

    const files = fs
      .readdirSync(undoDir)
      .filter((f) => f.startsWith('snapshot_') && f.endsWith('.patch'))
      .sort()

    if (files.length === 0) return left('No undo patches available')

    const latestPatchName = files[files.length - 1]!
    const patchPath = path.join(undoDir, latestPatchName)

    execSync(`git apply --reverse "${patchPath}"`, { stdio: 'pipe' })
    fs.unlinkSync(patchPath)

    return right(latestPatchName)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return left(`Failed to apply undo patch: ${message}`)
  }
}

export function listUndoPatches(undoDir: string): string[] {
  if (!fs.existsSync(undoDir)) {
    return []
  }

  return fs
    .readdirSync(undoDir)
    .filter((f) => f.startsWith('snapshot_') && f.endsWith('.patch'))
    .sort()
}
