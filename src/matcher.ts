export type MatchStrategy = 'EXACT' | 'NORMALIZE' | 'FUZZY' | 'NONE'

export interface MatchResult {
  strategy: MatchStrategy
  startIndex: number
  endIndex: number
  confidence: number
}

function normalizeText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!
      } else {
        matrix[i]![j] = Math.min(matrix[i - 1]![j - 1]! + 1, matrix[i]![j - 1]! + 1, matrix[i - 1]![j]! + 1)
      }
    }
  }
  return matrix[b.length]![a.length]!
}

export function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeText(a)
  const normB = normalizeText(b)
  if (normA === normB) return 1.0

  const maxLength = Math.max(normA.length, normB.length)
  if (maxLength === 0) return 1.0

  const distance = levenshteinDistance(normA, normB)
  return 1.0 - distance / maxLength
}

export function findMatchLocation(source: string, original: string, fuzzyThreshold = 0.8): MatchResult {
  if (!original.trim()) {
    return {
      strategy: 'EXACT',
      startIndex: source.length,
      endIndex: source.length,
      confidence: 1.0
    }
  }

  const exactIndex = source.indexOf(original)
  if (exactIndex !== -1) {
    return {
      strategy: 'EXACT',
      startIndex: exactIndex,
      endIndex: exactIndex + original.length,
      confidence: 1.0
    }
  }

  const lineStarts: number[] = []
  const sourceLines: string[] = []
  let start = 0

  while (start <= source.length) {
    lineStarts.push(start)
    const end = source.indexOf('\n', start)
    if (end === -1) {
      sourceLines.push(source.slice(start))
      break
    }
    sourceLines.push(source.slice(start, source[end - 1] === '\r' ? end - 1 : end))
    start = end + 1
  }

  const originalLines = original.split(/\r?\n/)
  const normOriginal = normalizeText(original)

  if (sourceLines.length >= originalLines.length) {
    for (let i = 0; i <= sourceLines.length - originalLines.length; i++) {
      const windowSlice = sourceLines.slice(i, i + originalLines.length).join('\n')
      if (normalizeText(windowSlice) === normOriginal) {
        return {
          strategy: 'NORMALIZE',
          startIndex: lineStarts[i]!,
          endIndex: lineStarts[i + originalLines.length] ?? source.length,
          confidence: 0.95
        }
      }
    }

    let bestScore = 0
    let bestCount = 0
    let bestMatch: MatchResult = {
      strategy: 'NONE',
      startIndex: -1,
      endIndex: -1,
      confidence: 0
    }

    for (let i = 0; i <= sourceLines.length - originalLines.length; i++) {
      const windowSlice = sourceLines.slice(i, i + originalLines.length).join('\n')
      const similarity = calculateSimilarity(windowSlice, original)

      if (similarity < fuzzyThreshold) continue

      if (similarity > bestScore) {
        bestScore = similarity
        bestCount = 1
        bestMatch = {
          strategy: 'FUZZY',
          startIndex: lineStarts[i]!,
          endIndex: lineStarts[i + originalLines.length] ?? source.length,
          confidence: similarity
        }
      } else if (similarity === bestScore) {
        bestCount++
      }
    }

    if (bestCount === 1) return bestMatch
  }

  return {
    strategy: 'NONE',
    startIndex: -1,
    endIndex: -1,
    confidence: 0
  }
}
