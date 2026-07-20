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

  const sourceLines = source.split(/\r?\n/)
  const originalLines = original.split(/\r?\n/)
  const normOriginal = normalizeText(original)

  if (sourceLines.length >= originalLines.length) {
    for (let i = 0; i <= sourceLines.length - originalLines.length; i++) {
      const windowSlice = sourceLines.slice(i, i + originalLines.length).join('\n')
      if (normalizeText(windowSlice) === normOriginal) {
        const startIndex = sourceLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
        return {
          strategy: 'NORMALIZE',
          startIndex,
          endIndex: startIndex + windowSlice.length,
          confidence: 0.95
        }
      }
    }

    let bestScore = 0
    let bestMatch: MatchResult = {
      strategy: 'NONE',
      startIndex: -1,
      endIndex: -1,
      confidence: 0
    }

    for (let i = 0; i <= sourceLines.length - originalLines.length; i++) {
      const windowSlice = sourceLines.slice(i, i + originalLines.length).join('\n')
      const similarity = calculateSimilarity(windowSlice, original)

      if (similarity > bestScore && similarity >= fuzzyThreshold) {
        bestScore = similarity
        const startIndex = sourceLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
        bestMatch = {
          strategy: 'FUZZY',
          startIndex,
          endIndex: startIndex + windowSlice.length,
          confidence: similarity
        }
      }
    }

    if (bestMatch.strategy !== 'NONE') {
      return bestMatch
    }
  }

  return {
    strategy: 'NONE',
    startIndex: -1,
    endIndex: -1,
    confidence: 0
  }
}
