import { describe, expect, it } from 'vitest'
import { lastCompletedQuarter, yearOptions } from './periods'

describe('yearOptions', () => {
  it('offers the current year and at least the four before it, newest first', () => {
    expect(yearOptions(2026, null)).toEqual([2026, 2025, 2024, 2023, 2022])
    expect(yearOptions(2026, 2026)).toEqual([2026, 2025, 2024, 2023, 2022])
  })

  it('reaches back to the first year with an invoice', () => {
    expect(yearOptions(2026, 2019)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019])
  })
})

describe('lastCompletedQuarter', () => {
  it('is the previous quarter of the same year after Q1', () => {
    expect(lastCompletedQuarter(new Date(2026, 10, 4))).toEqual({ year: 2026, quarter: 3 })
    expect(lastCompletedQuarter(new Date(2026, 3, 1))).toEqual({ year: 2026, quarter: 1 })
    expect(lastCompletedQuarter(new Date(2026, 11, 31, 23, 59))).toEqual({ year: 2026, quarter: 3 })
  })

  it('is Q4 of last year during Q1', () => {
    expect(lastCompletedQuarter(new Date(2026, 0, 15))).toEqual({ year: 2025, quarter: 4 })
    expect(lastCompletedQuarter(new Date(2026, 2, 31, 23, 59))).toEqual({ year: 2025, quarter: 4 })
  })
})
