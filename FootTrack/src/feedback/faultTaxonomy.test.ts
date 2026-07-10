import { describe, it, expect } from 'vitest'
import { detectFaults, aggregateFaults } from './faultTaxonomy'
import type { MetricResult } from '../analysis/types'

const m = (value: number, confidence = 1): MetricResult => ({ value, confidence })

describe('detectFaults', () => {
  it('flags shooting_torso_lean when body lean exceeds the threshold', () => {
    const faults = detectFaults('shooting', { bodyLean: m(22), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) })
    expect(faults.map((f) => f.tag)).toContain('shooting_torso_lean')
  })

  it('does not flag shooting_torso_lean for an upright torso', () => {
    const faults = detectFaults('shooting', { bodyLean: m(4), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) })
    expect(faults.map((f) => f.tag)).not.toContain('shooting_torso_lean')
  })

  it('ignores a metric below the confidence floor', () => {
    const faults = detectFaults('shooting', { bodyLean: m(22, 0.3), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) })
    expect(faults.map((f) => f.tag)).not.toContain('shooting_torso_lean')
  })

  it('flags first_touch_closed_stance for a near-zero receiving angle', () => {
    const faults = detectFaults('first_touch', { orientation: m(3), balance: m(0.01), cushioning: m(6) })
    expect(faults.map((f) => f.tag)).toContain('first_touch_closed_stance')
  })
})

describe('aggregateFaults', () => {
  it('ranks the most frequent, highest-impact fault first', () => {
    const perRep = [
      detectFaults('shooting', { bodyLean: m(22), balance: m(0.08), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) }),
      detectFaults('shooting', { bodyLean: m(21), balance: m(0.07), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) }),
      detectFaults('shooting', { bodyLean: m(3), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) }),
    ]
    const ranked = aggregateFaults(perRep)
    expect(ranked[0].tag).toBe('shooting_torso_lean')
    expect(ranked[0].frequency).toBeCloseTo(2 / 3)
  })

  it('returns an empty list when no faults were detected', () => {
    const perRep = [detectFaults('shooting', { bodyLean: m(2), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.01) })]
    expect(aggregateFaults(perRep)).toEqual([])
  })
})
