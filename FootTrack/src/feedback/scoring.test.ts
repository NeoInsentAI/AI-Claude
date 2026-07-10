import { describe, it, expect } from 'vitest'
import { sessionScore, updateEwma, weakFootConfidence } from './scoring'

describe('sessionScore', () => {
  it('scores 100 for perfect mechanics, perfect consistency, and full completion', () => {
    expect(sessionScore({ mechanicsQuality: 1, consistency: 1, completion: 1 })).toBe(100)
  })
  it('weights mechanics 70%, consistency 20%, completion 10%', () => {
    expect(sessionScore({ mechanicsQuality: 0.5, consistency: 0.5, completion: 0.5 })).toBe(50)
  })
  it('rounds to the nearest integer', () => {
    expect(sessionScore({ mechanicsQuality: 0.83, consistency: 0.6, completion: 1 })).toBe(Math.round((0.83 * 0.7 + 0.6 * 0.2 + 1 * 0.1) * 100))
  })
})

describe('updateEwma', () => {
  it('takes the new value directly when there is no previous value', () => {
    expect(updateEwma(null, 80)).toBe(80)
  })
  it('blends 30% new / 70% previous', () => {
    expect(updateEwma(60, 90)).toBeCloseTo(60 * 0.7 + 90 * 0.3)
  })
})

describe('weakFootConfidence', () => {
  it('returns 0 when the weak foot has never been used', () => {
    const result = weakFootConfidence('right', [
      { foot: 'right', techniqueScore: 80 },
      { foot: 'right', techniqueScore: 85 },
    ])
    expect(result.value).toBe(0)
  })

  it('scores higher when weak-foot technique is close to strong-foot technique AND usage share is high', () => {
    const highUsageCloseGap = weakFootConfidence('right', [
      { foot: 'right', techniqueScore: 80 }, { foot: 'left', techniqueScore: 75 },
      { foot: 'right', techniqueScore: 80 }, { foot: 'left', techniqueScore: 75 },
    ])
    const lowUsageBigGap = weakFootConfidence('right', [
      { foot: 'right', techniqueScore: 80 }, { foot: 'right', techniqueScore: 80 },
      { foot: 'right', techniqueScore: 80 }, { foot: 'left', techniqueScore: 40 },
    ])
    expect(highUsageCloseGap.value).toBeGreaterThan(lowUsageBigGap.value)
  })
})
