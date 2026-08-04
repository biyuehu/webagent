import { describe, expect, it } from 'vitest'
import { calculateSimilarity, findMatchLocation } from '../src/matcher'

describe('matcher.ts', () => {
  describe('findMatchLocation', () => {
    const sourceCode = [
      "import fs from 'fs'",
      '',
      'export function run() {',
      '  const a = 1',
      '  const b = 2',
      '  return a + b',
      '}'
    ].join('\n')

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

  describe('连续多次 REPLACE 稳定性', () => {
    it('连续 EXACT 替换互不重叠区域', () => {
      let file = ['line1: aaa', 'line2: bbb', 'line3: ccc', 'line4: ddd', 'line5: eee'].join('\n')

      const replacements = [
        { original: 'line2: bbb', updated: 'line2: BBB' },
        { original: 'line4: ddd', updated: 'line4: DDD' }
      ]

      for (const { original, updated } of replacements) {
        const match = findMatchLocation(file, original)
        expect(match.strategy).toBe('EXACT')
        file = file.slice(0, match.startIndex) + updated + file.slice(match.endIndex)
      }

      expect(file).toBe(['line1: aaa', 'line2: BBB', 'line3: ccc', 'line4: DDD', 'line5: eee'].join('\n'))
    })

    it('连续 EXACT 替换相邻区域（前面替换影响行数）', () => {
      let file = ['line1: aaa', 'line2: bbb', 'line3: ccc', 'line4: ddd', 'line5: eee'].join('\n')

      const replacements = [
        { original: 'line2: bbb\nline3: ccc', updated: 'line2: BBB\nline2.5: CCC_extra\nline3: CCC' },
        { original: 'line4: ddd', updated: 'line4: DDD' }
      ]

      for (const { original, updated } of replacements) {
        const match = findMatchLocation(file, original)
        expect(match.strategy).toBe('EXACT')
        file = file.slice(0, match.startIndex) + updated + file.slice(match.endIndex)
      }

      expect(file).toBe(
        ['line1: aaa', 'line2: BBB', 'line2.5: CCC_extra', 'line3: CCC', 'line4: DDD', 'line5: eee'].join('\n')
      )
    })

    it('连续替换中第二个 original 在第一个替换后仍能 EXACT 匹配', () => {
      let file = ['function foo() {', '  const x = 1;', '  const y = 2;', '  return x + y;', '}'].join('\n')

      file = file.replace('const x = 1;', 'const x = 10;').replace('const y = 2;', 'const y = 20;')

      expect(file).toBe(['function foo() {', '  const x = 10;', '  const y = 20;', '  return x + y;', '}'].join('\n'))
    })

    it('前面替换导致后面 original 找不到了应回退到 FUZZY 或 NONE', () => {
      let file = ['function foo() {', '  const x = 1;', '  const y = 2;', '  return x + y;', '}'].join('\n')

      const match1 = findMatchLocation(file, 'const x = 1;')
      file = file.slice(0, match1.startIndex) + 'const x = 999;' + file.slice(match1.endIndex)

      const match2 = findMatchLocation(file, 'const x = 1;')
      expect(match2.strategy).not.toBe('EXACT')
    })

    it('空 original 始终匹配文件末尾', () => {
      const file = 'line1\nline2\nline3'
      const match = findMatchLocation(file, '')
      expect(match.strategy).toBe('EXACT')
      expect(match.startIndex).toBe(file.length)
      expect(match.endIndex).toBe(file.length)
    })

    it('连续 REPLACE 中某次匹配 NONE 不应破坏后续精确匹配', () => {
      const file = ['import a', 'import b', 'import c', 'import d'].join('\n')

      const badMatch = findMatchLocation(file, 'import z')
      expect(badMatch.strategy).toBe('NONE')

      const goodMatch = findMatchLocation(file, 'import c')
      expect(goodMatch.strategy).toBe('EXACT')
      expect(file.slice(goodMatch.startIndex, goodMatch.endIndex)).toBe('import c')
    })

    it('重复多次 EXACT 替换同一文件的相同内容只替换第一个', () => {
      let file = 'dup\ndup\ndup'
      const original = 'dup'

      for (let i = 0; i < 3; i++) {
        const match = findMatchLocation(file, original)
        expect(match.strategy).toBe('EXACT')
        file = file.slice(0, match.startIndex) + 'XXX' + file.slice(match.endIndex)
      }

      expect(file).toBe('XXX\nXXX\nXXX')
    })

    it('FUZZY 匹配同一块多次（模拟重复 replace 稳定性）', () => {
      let file = ['const config = {', '  port: 3000,', '  host: "localhost",', '  debug: true', '}'].join('\n')

      file = file
        .replace('port: 3000', 'port: 8080')
        .replace('host: "localhost"', 'host: "0.0.0.0"')
        .replace('debug: true', 'debug: false')

      const match = findMatchLocation(file, 'port: 8080,\n  host: "0.0.0.0",', 0.7)
      expect(match.strategy).not.toBe('NONE')
      expect(file.slice(match.startIndex, match.endIndex)).toBe('port: 8080,\n  host: "0.0.0.0",')
    })
  })
})
