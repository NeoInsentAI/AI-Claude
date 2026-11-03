import { describe, expect, it } from 'vitest'
import { quarterDateRange } from './dateRanges'

describe('quarterDateRange', () => {
  it('returns the full year when no quarter is given', () => {
    expect(quarterDateRange(2026)).toEqual({ fromDate: '2026-01-01', toDate: '2026-12-31' })
  })

  it('returns Q1 (Jan-Mar)', () => {
    expect(quarterDateRange(2026, 1)).toEqual({ fromDate: '2026-01-01', toDate: '2026-03-31' })
  })

  it('returns Q2 (Apr-Jun)', () => {
    expect(quarterDateRange(2026, 2)).toEqual({ fromDate: '2026-04-01', toDate: '2026-06-30' })
  })

  it('returns Q4 (Oct-Dec)', () => {
    expect(quarterDateRange(2026, 4)).toEqual({ fromDate: '2026-10-01', toDate: '2026-12-31' })
  })
})
