import { describe, it, expect } from 'vitest'
import { generateFeedback } from './generateFeedback'
import type { AggregatedFault } from './faultTaxonomy'

describe('generateFeedback', () => {
  it('puts the highest-priority fault first as the priority fix', () => {
    const faults: AggregatedFault[] = [
      { tag: 'shooting_torso_lean', frequency: 0.7, avgSeverity: 0.5, priority: 0.5 },
      { tag: 'shooting_balance_wobble', frequency: 0.3, avgSeverity: 0.2, priority: 0.1 },
    ]
    const items = generateFeedback(faults)
    expect(items[0].kind).toBe('priority_fix')
    expect(items[0].faultTag).toBe('shooting_torso_lean')
    expect(items[0].copy.length).toBeGreaterThan(0)
  })

  it('caps corrections at 2 items beyond the priority fix', () => {
    const faults: AggregatedFault[] = [
      { tag: 'shooting_torso_lean', frequency: 0.9, avgSeverity: 0.5, priority: 0.9 },
      { tag: 'shooting_balance_wobble', frequency: 0.6, avgSeverity: 0.4, priority: 0.6 },
      { tag: 'shooting_landing_unstable', frequency: 0.5, avgSeverity: 0.3, priority: 0.4 },
      { tag: 'shooting_plant_inconsistent', frequency: 0.4, avgSeverity: 0.2, priority: 0.2 },
    ]
    const items = generateFeedback(faults)
    const corrections = items.filter((i) => i.kind === 'correction')
    expect(corrections).toHaveLength(2)
  })

  it('returns only a "clean session" win when there are no faults', () => {
    const items = generateFeedback([])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('win')
  })
})
