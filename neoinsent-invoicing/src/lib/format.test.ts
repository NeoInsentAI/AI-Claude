import { describe, expect, it } from 'vitest'
import { formatCurrency } from './format'

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
