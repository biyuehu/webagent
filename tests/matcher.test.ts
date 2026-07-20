import { describe, expect, it } from 'vitest'
import { calculateSimilarity, findMatchLocation } from '../src/matcher'

describe('matcher.ts', () => {
  const sourceCode = [
    "import fs from 'fs'",
    '',
    'export function run() {',
    '  const a = 1',
    '  const b = 2',
    '  return a + b',
    '}'
  ].join('\n')

  describe('findMatchLocation', () => {
    it('should match EXACT strategy', () => {
      const original = '  const a = 1\n  const b = 2'
      const result = findMatchLocation(sourceCode, original)

      expect(result.strategy).toBe('EXACT')
      expect(result.confidence).toBe(1.0)
      expect(sourceCode.slice(result.startIndex, result.endIndex)).toBe(original)
    })

    it('should match NORMALIZE strategy ignoring indents and whitespace differences', () => {
      const original = 'const a = 1\nconst b = 2'
      const result = findMatchLocation(sourceCode, original)

      expect(result.strategy).toBe('NORMALIZE')
      expect(result.confidence).toBe(0.95)
      expect(result.startIndex).toBeGreaterThanOrEqual(0)
    })

    it('should match FUZZY strategy with high similarity', () => {
      const original = 'let a = 1\nconst b = 2'
      const result = findMatchLocation(sourceCode, original, 0.7)

      expect(result.strategy).toBe('FUZZY')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('should return NONE when pattern is completely absent', () => {
      const original = 'function missingFunction() {}'
      const result = findMatchLocation(sourceCode, original)

      expect(result.strategy).toBe('NONE')
      expect(result.startIndex).toBe(-1)
      expect(result.endIndex).toBe(-1)
      expect(result.confidence).toBe(0)
    })

    it('should default to append at end of file for empty original pattern', () => {
      const result = findMatchLocation(sourceCode, '   \n  ')

      expect(result.strategy).toBe('EXACT')
      expect(result.startIndex).toBe(sourceCode.length)
      expect(result.endIndex).toBe(sourceCode.length)
    })
  })

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical or normalized identical strings', () => {
      expect(calculateSimilarity('const x = 1;', '  const x = 1; \n')).toBe(1.0)
    })

    it('should compute floating similarity ratio for partial changes', () => {
      const similarity = calculateSimilarity('const value = 100', 'const value = 101')
      expect(similarity).toBeGreaterThan(0.8)
      expect(similarity).toBeLessThan(1.0)
    })
  })
})
