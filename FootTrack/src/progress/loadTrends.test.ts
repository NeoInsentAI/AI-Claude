import { describe, it, expect } from 'vitest'
import { buildTrendTiles } from './loadTrends'

describe('buildTrendTiles', () => {
  it('averages the latest per-skill value for account-wide attributes', () => {
    const rows = [
      { attribute: 'technique', skill: 'shooting', value: 80, computed_at: '2026-07-01' },
      { attribute: 'technique', skill: 'passing', value: 60, computed_at: '2026-07-01' },
      { attribute: 'technique', skill: 'first_touch', value: 70, computed_at: '2026-07-01' },
    ]
    const tiles = buildTrendTiles(rows)
    const technique = tiles.find((t) => t.attribute === 'technique')
    expect(technique?.value).toBeCloseTo(70)
  })

  it('takes weak_foot_confidence directly since it has no per-skill split', () => {
    const rows = [{ attribute: 'weak_foot_confidence', skill: null, value: 42, computed_at: '2026-07-01' }]
    const tiles = buildTrendTiles(rows)
    expect(tiles.find((t) => t.attribute === 'weak_foot_confidence')?.value).toBe(42)
  })

  it('only uses the most recent row per (attribute, skill) pair', () => {
    const rows = [
      { attribute: 'technique', skill: 'shooting', value: 50, computed_at: '2026-07-01' },
      { attribute: 'technique', skill: 'shooting', value: 90, computed_at: '2026-07-05' },
    ]
    expect(buildTrendTiles(rows).find((t) => t.attribute === 'technique')?.value).toBe(90)
  })

  it('returns null for a tile with no data yet', () => {
    expect(buildTrendTiles([]).find((t) => t.attribute === 'balance')?.value).toBeNull()
  })

  it('reports how many skills contributed, so a 1-skill average is distinguishable from a 3-skill one', () => {
    const rows = [{ attribute: 'technique', skill: 'shooting', value: 80, computed_at: '2026-07-01' }]
    const tiles = buildTrendTiles(rows)
    expect(tiles.find((t) => t.attribute === 'technique')?.skillsWithData).toBe(1)
    expect(tiles.find((t) => t.attribute === 'balance')?.skillsWithData).toBe(0)
  })
})
