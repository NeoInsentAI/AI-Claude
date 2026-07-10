import { describe, it, expect } from 'vitest'
import { chooseFocusAreas, targetDayFor } from './generatePlan'
import type { Skill } from '../analysis/skillConfig'

describe('chooseFocusAreas', () => {
  it('picks the 1-2 lowest-scoring skills as focus areas', () => {
    const scores: { skill: Skill; technique: number }[] = [
      { skill: 'shooting', technique: 85 },
      { skill: 'passing', technique: 50 },
      { skill: 'first_touch', technique: 65 },
    ]
    expect(chooseFocusAreas(scores)).toEqual(['passing', 'first_touch'])
  })

  it('falls back to all 3 skills evenly when there is no score history', () => {
    expect(chooseFocusAreas([])).toEqual(['shooting', 'passing', 'first_touch'])
  })
})

describe('targetDayFor', () => {
  it('never exceeds day 7, even for the realistic max of 4 plan items', () => {
    for (const index of [0, 1, 2, 3]) {
      expect(targetDayFor(index)).toBeLessThanOrEqual(7)
      expect(targetDayFor(index)).toBeGreaterThanOrEqual(1)
    }
  })

  it('still spreads items across the week in non-decreasing order', () => {
    const days = [0, 1, 2, 3].map(targetDayFor)
    expect(days).toEqual([2, 4, 6, 7])
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThanOrEqual(days[i - 1])
    }
  })
})
