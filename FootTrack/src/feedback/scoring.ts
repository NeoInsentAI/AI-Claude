import type { Foot } from '../analysis/skillConfig'
import type { MetricResult } from '../analysis/types'

const EWMA_ALPHA = 0.3

export function sessionScore(input: { mechanicsQuality: number; consistency: number; completion: number }): number {
  const raw = input.mechanicsQuality * 0.7 + input.consistency * 0.2 + input.completion * 0.1
  return Math.round(raw * 100)
}

export function updateEwma(previous: number | null, newValue: number): number {
  if (previous === null) return newValue
  return previous * (1 - EWMA_ALPHA) + newValue * EWMA_ALPHA
}

export function weakFootConfidence(
  dominantFoot: Foot,
  sessions: { foot: Foot; techniqueScore: number }[]
): MetricResult {
  const weakFoot: Foot = dominantFoot === 'left' ? 'right' : 'left'
  const weakReps = sessions.filter((s) => s.foot === weakFoot)
  const strongReps = sessions.filter((s) => s.foot === dominantFoot)

  if (weakReps.length === 0) return { value: 0, confidence: 1 }
  if (strongReps.length === 0) return { value: 0, confidence: 0.3 }

  const weakAvg = weakReps.reduce((a, s) => a + s.techniqueScore, 0) / weakReps.length
  const strongAvg = strongReps.reduce((a, s) => a + s.techniqueScore, 0) / strongReps.length
  const techniqueRatio = strongAvg <= 0 ? 0 : Math.min(1, weakAvg / strongAvg)

  const usageShare = weakReps.length / (weakReps.length + strongReps.length)
  const value = 100 * techniqueRatio * (0.5 + 0.5 * usageShare)

  return { value, confidence: weakReps.length >= 5 ? 0.9 : 0.6 }
}
