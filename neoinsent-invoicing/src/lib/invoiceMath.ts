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

// All money arithmetic happens in integer cents. Float products like
// 2.5 * 33.33 = 83.32499999999999 cannot be rounded reliably as euros (an
// EPSILON nudge is far too small at that magnitude), so inputs are converted
// to integers first and every division rounds exactly.

// Divides n by d (d > 0) and rounds the quotient to the nearest integer, with
// exact halves rounded away from zero: half-up for non-negative n (the only
// case in this app today), and e.g. -2.5 → -3 for negative n, which mirrors
// the positive amount. BigInt keeps the result exact past 2^53.
function roundHalfUpDiv(n: bigint, d: bigint): bigint {
  const negative = n < 0n
  const abs = negative ? -n : n
  const q = (abs * 2n + d) / (d * 2n)
  return negative ? -q : q
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
//
// Quantities and unit prices are validated elsewhere to at most 2 decimals;
// the Math.round calls below only absorb float noise (19.99 * 100 =
// 1998.9999999999998). VAT rates are whole percentages (0/9/21) but are
// handled as basis points so a fractional rate still computes exactly.
function computeLineCents(line: InvoiceLineInput): { subtotal: bigint; vat: bigint } {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPrice) || !Number.isFinite(line.vatRate)) {
    throw new Error(`Invalid invoice line input: ${JSON.stringify(line)}`)
  }
  return lineCentsFromIntegers(
    BigInt(Math.round(line.quantity * 100)),
    BigInt(Math.round(line.unitPrice * 100)),
    line.vatRate,
  )
}

function lineCentsFromIntegers(
  qtyHundredths: bigint,
  priceCents: bigint,
  vatRate: number,
): { subtotal: bigint; vat: bigint } {
  const rateBasisPoints = BigInt(Math.round(vatRate * 100))
  const subtotal = roundHalfUpDiv(qtyHundredths * priceCents, 100n)
  const vat = roundHalfUpDiv(subtotal * rateBasisPoints, 10_000n)
  return { subtotal, vat }
}

/** A line as the database stores it: integer hundredths and cents. */
export interface StoredLineInput {
  quantityHundredths: number
  unitPriceCents: number
  vatRate: number
}

/**
 * A stored line's amount excl. VAT and its VAT, in integer cents, rounded exactly like
 * computeLine (so the per-line amounts add up to the invoice's stored totals).
 */
export function computeStoredLineCents(line: StoredLineInput): { subtotalCents: number; vatCents: number } {
  if (
    !Number.isSafeInteger(line.quantityHundredths) ||
    !Number.isSafeInteger(line.unitPriceCents) ||
    !Number.isFinite(line.vatRate)
  ) {
    throw new Error(`Invalid stored invoice line: ${JSON.stringify(line)}`)
  }
  const { subtotal, vat } = lineCentsFromIntegers(
    BigInt(line.quantityHundredths),
    BigInt(line.unitPriceCents),
    line.vatRate,
  )
  return { subtotalCents: Number(subtotal), vatCents: Number(vat) }
}

function toEuros(cents: bigint): number {
  return Number(cents) / 100
}

export function computeLine(line: InvoiceLineInput): LineComputed {
  const { subtotal, vat } = computeLineCents(line)
  return {
    lineSubtotal: toEuros(subtotal),
    lineVat: toEuros(vat),
    lineTotal: toEuros(subtotal + vat),
  }
}

export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  let subtotal = 0n
  let vatAmount = 0n
  for (const line of lines) {
    const cents = computeLineCents(line)
    subtotal += cents.subtotal
    vatAmount += cents.vat
  }
  return {
    subtotal: toEuros(subtotal),
    vatAmount: toEuros(vatAmount),
    total: toEuros(subtotal + vatAmount),
  }
}
