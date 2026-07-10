import { describe, it, expect } from 'vitest'
import { chooseFocusAreas } from './generatePlan'
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
