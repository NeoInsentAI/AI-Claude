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
  // strongAvg <= 0 means the dominant foot's own technique scores are all zero — analysis-failure
  // territory, not real data. Deliberately returns 0 here even when weakAvg > 0 (which the raw
  // ratio would otherwise cap at a "perfect" 1): a broken/degenerate denominator should never
  // produce a confident-looking weak-foot score, since that would be a worse, more misleading
  // failure mode than an honest 0.
  const techniqueRatio = strongAvg <= 0 ? 0 : Math.min(1, weakAvg / strongAvg)

  const usageShare = weakReps.length / (weakReps.length + strongReps.length)
  const value = 100 * techniqueRatio * (0.5 + 0.5 * usageShare)

  return { value, confidence: weakReps.length >= 5 ? 0.9 : 0.6 }
}
