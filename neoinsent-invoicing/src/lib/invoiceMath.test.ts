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
  // reimplementation). Each line's raw amount is 10.005, a rounding-boundary
  // value: rounded per line it becomes 10.01, and three of those sum to
  // 30.03. Summing the raw 10.005 values first gives 30.015, which rounds
  // once to 30.02 — a different, wrong result. If this test used whole
  // numbers (like the other tests above), both strategies would agree and
  // the bug would slip through undetected.
  it('rounds per-line before summing, distinguishing it from a sum-then-round-once strategy', () => {
    expect(
      computeInvoiceTotals([
        { quantity: 1, unitPrice: 10.005, vatRate: 0 },
        { quantity: 1, unitPrice: 10.005, vatRate: 0 },
        { quantity: 1, unitPrice: 10.005, vatRate: 0 },
      ]),
    ).toEqual({ subtotal: 30.03, vatAmount: 0, total: 30.03 })
  })
})
