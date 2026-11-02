export interface InvoiceLineInput {
  quantity: number
  unitPrice: number
  vatRate: number // 21, 9, or 0
}

export interface LineComputed {
  lineSubtotal: number
  lineVat: number
  lineTotal: number
}

export interface InvoiceTotals {
  subtotal: number
  vatAmount: number
  total: number
}

// Verified correct for non-negative inputs only (quantities/prices/VAT rates
// are never negative in this app's current scope). Math.round rounds half-up
// rather than half-away-from-zero, so this is asymmetric for negative values
// (e.g. round2(-1.005) === -1, not -1.01). If a future credit-note/correction
// feature introduces negative amounts, re-verify this function's behavior
// rather than assuming it already works.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Each line is rounded to the nearest cent independently (subtotal, then
// vat computed off the rounded subtotal, then total). Invoice totals sum
// these already-rounded per-line amounts rather than summing raw values
// and rounding once at the end. This matches what appears on the printed
// invoice: every line amount the client sees is an exact cent figure, and
// the totals row is the arithmetic sum of the lines directly above it.
// The two strategies can disagree by a cent on some inputs (classic
// rounding-to-even vs. rounding-at-the-end drift) — that divergence is
// expected and is why this strategy is fixed deliberately, not a bug.
export function computeLine(line: InvoiceLineInput): LineComputed {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPrice) || !Number.isFinite(line.vatRate)) {
    throw new Error(`Invalid invoice line input: ${JSON.stringify(line)}`)
  }
  const lineSubtotal = round2(line.quantity * line.unitPrice)
  const lineVat = round2(lineSubtotal * (line.vatRate / 100))
  const lineTotal = round2(lineSubtotal + lineVat)
  return { lineSubtotal, lineVat, lineTotal }
}

export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  const computed = lines.map(computeLine)
  const subtotal = round2(computed.reduce((sum, l) => sum + l.lineSubtotal, 0))
  const vatAmount = round2(computed.reduce((sum, l) => sum + l.lineVat, 0))
  const total = round2(subtotal + vatAmount)
  return { subtotal, vatAmount, total }
}
