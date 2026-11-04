import { describe, expect, it } from 'vitest'
import { computeInvoiceTotals, computeLine } from './invoiceMath'

describe('computeLine', () => {
  it('computes subtotal, vat, and total for a standard-rate line', () => {
    expect(computeLine({ quantity: 10, unitPrice: 100, vatRate: 21 })).toEqual({
      lineSubtotal: 1000,
      lineVat: 210,
      lineTotal: 1210,
    })
  })

  it('computes a zero-vat reverse-charge line', () => {
    expect(computeLine({ quantity: 5, unitPrice: 200, vatRate: 0 })).toEqual({
      lineSubtotal: 1000,
      lineVat: 0,
      lineTotal: 1000,
    })
  })

  it('rounds to 2 decimals without floating point drift', () => {
    expect(computeLine({ quantity: 3, unitPrice: 19.99, vatRate: 21 })).toEqual({
      lineSubtotal: 59.97,
      lineVat: 12.59,
      lineTotal: 72.56,
    })
  })

  it('rounds an exact half-cent subtotal up (2.5 × 33.33 = 83.325 → 83.33)', () => {
    // Float multiplication gives 83.32499999999999, which the old
    // EPSILON-nudged rounding turned into 83.32. VAT: 8333 × 21 / 100 =
    // 1749.93 cents → 17.50.
    expect(computeLine({ quantity: 2.5, unitPrice: 33.33, vatRate: 21 })).toEqual({
      lineSubtotal: 83.33,
      lineVat: 17.5,
      lineTotal: 100.83,
    })
  })

  it('rounds an exact half-cent VAT amount up', () => {
    // 0.50 × 9% = 4.5 cents → 5 cents; 2.50 × 21% = 52.5 cents → 53 cents.
    expect(computeLine({ quantity: 1, unitPrice: 0.5, vatRate: 9 })).toEqual({
      lineSubtotal: 0.5,
      lineVat: 0.05,
      lineTotal: 0.55,
    })
    expect(computeLine({ quantity: 1, unitPrice: 2.5, vatRate: 21 })).toEqual({
      lineSubtotal: 2.5,
      lineVat: 0.53,
      lineTotal: 3.03,
    })
  })

  it('keeps exact cents for very large amounts (no precision loss past 2^53)', () => {
    // qtyHundredths × priceCents = 1e8 × 1e8 = 1e16 > Number.MAX_SAFE_INTEGER.
    const line = computeLine({ quantity: 1_000_000, unitPrice: 1_000_000, vatRate: 21 })
    expect(line.lineSubtotal).toBe(1e12)
    expect(line.lineVat).toBe(2.1e11)
    expect(line.lineTotal).toBe(1.21e12)
    expect(Number.isFinite(line.lineTotal)).toBe(true)
  })

  it('still supports a non-integer VAT rate', () => {
    // 100.00 × 5.5% = 550 cents exactly; 0.10 × 5.5% = 0.55 cents → 1 cent.
    expect(computeLine({ quantity: 1, unitPrice: 100, vatRate: 5.5 }).lineVat).toBe(5.5)
    expect(computeLine({ quantity: 1, unitPrice: 0.1, vatRate: 5.5 }).lineVat).toBe(0.01)
  })

  it('throws for a NaN quantity', () => {
    expect(() => computeLine({ quantity: NaN, unitPrice: 100, vatRate: 21 })).toThrow()
  })

  it('throws for a non-finite unit price', () => {
    expect(() => computeLine({ quantity: 10, unitPrice: Infinity, vatRate: 21 })).toThrow()
  })
})

describe('computeInvoiceTotals', () => {
  it('sums multiple lines at the same rate', () => {
    expect(
      computeInvoiceTotals([
        { quantity: 10, unitPrice: 100, vatRate: 21 },
        { quantity: 2, unitPrice: 50, vatRate: 21 },
      ]),
    ).toEqual({ subtotal: 1100, vatAmount: 231, total: 1331 })
  })

  it('sums mixed-rate lines correctly', () => {
    expect(
      computeInvoiceTotals([
        { quantity: 1, unitPrice: 1000, vatRate: 21 },
        { quantity: 1, unitPrice: 500, vatRate: 0 },
      ]),
    ).toEqual({ subtotal: 1500, vatAmount: 210, total: 1710 })
  })

  it('returns zeros for an empty line list', () => {
    expect(computeInvoiceTotals([])).toEqual({ subtotal: 0, vatAmount: 0, total: 0 })
  })

  // This test exists specifically to distinguish round-per-line-then-sum
  // (the specified, correct strategy) from sum-then-round-once (a buggy
  // reimplementation). Each line's raw amount is 1.5 × 6.67 = 10.005, a
  // rounding-boundary value: rounded per line it becomes 10.01, and three of
  // those sum to 30.03. Summing the raw 10.005 values first gives 30.015,
  // which rounds once to 30.02 — a different, wrong result. The inputs have
  // at most 2 decimals (as the app's validation enforces); the half cent
  // comes from the multiplication, not from an over-precise unit price.
  it('rounds per-line before summing, distinguishing it from a sum-then-round-once strategy', () => {
    expect(
      computeInvoiceTotals([
        { quantity: 1.5, unitPrice: 6.67, vatRate: 0 },
        { quantity: 1.5, unitPrice: 6.67, vatRate: 0 },
        { quantity: 1.5, unitPrice: 6.67, vatRate: 0 },
      ]),
    ).toEqual({ subtotal: 30.03, vatAmount: 0, total: 30.03 })
  })
})
