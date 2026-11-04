import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatDateTime } from './format'

describe('formatCurrency', () => {
  it('formats whole euros with Dutch thousands/decimal separators', () => {
    const result = formatCurrency(1210)
    expect(result).toContain('€')
    expect(result).toMatch(/1\.210,00/)
  })

  it('formats cents correctly', () => {
    expect(formatCurrency(72.56)).toMatch(/72,56/)
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toMatch(/0,00/)
  })
})

describe('formatDate', () => {
  it('prints an ISO date as dd-mm-yyyy without time-zone shifts', () => {
    expect(formatDate('2026-11-04')).toBe('04-11-2026')
    expect(formatDate('2026-01-31')).toBe('31-01-2026')
  })

  it('returns anything that is not an ISO date unchanged', () => {
    expect(formatDate('soon')).toBe('soon')
  })
})

describe('formatDateTime', () => {
  it('prints a timestamp as local dd-mm-yyyy HH:mm', () => {
    const local = new Date(2026, 10, 5, 9, 7)
    expect(formatDateTime(local.toISOString())).toBe('05-11-2026 09:07')
  })

  it('returns an unparseable value unchanged', () => {
    expect(formatDateTime('nope')).toBe('nope')
  })
})
