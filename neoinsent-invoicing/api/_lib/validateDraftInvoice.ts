import { isInvoiceVatTreatment, type VatTreatment } from '../../src/lib/vat'
import type { DraftInvoiceInput, InvoiceItemInput } from './invoicesRepo'
import { isUuid } from './uuid'

export type ValidateDraftInvoiceResult =
  | { ok: true; value: DraftInvoiceInput }
  | { ok: false; error: string }

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_ITEMS = 100
const ALLOWED_VAT_RATES = [0, 9, 21]
const MAX_DESCRIPTION_LENGTH = 500
const MAX_NOTES_LENGTH = 2000
// Money/quantity columns are numeric(12,2). Postgres would silently round a
// third decimal on insert while line_total was computed from the unrounded
// value, so the stored line wouldn't add up. Reject instead.
const MAX_AMOUNT = 1_000_000

// Tolerance absorbs binary floating point (1.1 * 100 === 110.00000000000001).
const hasAtMost2Decimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// A YYYY-MM-DD string naming a date that exists (rejects 2026-02-30).
function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateItem(
  raw: unknown,
  line: number,
): { ok: true; value: InvoiceItemInput } | { ok: false; error: string } {
  const item = asRecord(raw)
  if (!item) return { ok: false, error: `Line ${line}: must be an object` }

  const description = typeof item.description === 'string' ? item.description.trim() : ''
  if (description === '') return { ok: false, error: `Line ${line}: description is required` }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Line ${line}: description can be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    }
  }

  if (!isFiniteNumber(item.quantity) || item.quantity <= 0) {
    return { ok: false, error: `Line ${line}: quantity must be a positive number` }
  }
  if (!hasAtMost2Decimals(item.quantity)) {
    return { ok: false, error: `Line ${line}: quantity can have at most 2 decimals` }
  }
  if (item.quantity > MAX_AMOUNT) {
    return { ok: false, error: `Line ${line}: quantity is too large` }
  }
  if (!isFiniteNumber(item.unit_price) || item.unit_price < 0) {
    return { ok: false, error: `Line ${line}: unit price must be zero or more` }
  }
  if (!hasAtMost2Decimals(item.unit_price)) {
    return { ok: false, error: `Line ${line}: unit price can have at most 2 decimals` }
  }
  if (item.unit_price > MAX_AMOUNT) {
    return { ok: false, error: `Line ${line}: unit price is too large` }
  }
  if (typeof item.vat_rate !== 'number' || !ALLOWED_VAT_RATES.includes(item.vat_rate)) {
    return { ok: false, error: `Line ${line}: VAT rate must be 0, 9 or 21` }
  }

  return {
    ok: true,
    value: {
      description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      vat_rate: item.vat_rate,
    },
  }
}

// Validates and normalizes a draft invoice create payload. Unknown keys are dropped.
export function validateDraftInvoice(body: unknown): ValidateDraftInvoiceResult {
  const input = asRecord(body) ?? {}

  const clientId = input.client_id
  if (!isUuid(clientId)) {
    return { ok: false, error: 'A valid client is required' }
  }

  const language = input.language
  if (language !== 'nl' && language !== 'en') {
    return { ok: false, error: "Language must be 'nl' or 'en'" }
  }

  // The guard is typed for VatTreatment; any other string simply fails it.
  const rawTreatment = input.vat_treatment as VatTreatment
  if (typeof rawTreatment !== 'string' || !isInvoiceVatTreatment(rawTreatment)) {
    return { ok: false, error: 'VAT treatment must be nl_standard or eu_reverse_charge' }
  }
  const vatTreatment = rawTreatment

  const issueDate = input.issue_date
  if (!isRealDate(issueDate)) {
    return { ok: false, error: 'Issue date must be a valid date (YYYY-MM-DD)' }
  }
  const dueDate = input.due_date
  if (!isRealDate(dueDate)) {
    return { ok: false, error: 'Due date must be a valid date (YYYY-MM-DD)' }
  }
  // Same-format ISO dates compare correctly as strings.
  if (dueDate < issueDate) {
    return { ok: false, error: 'Due date cannot be before the issue date' }
  }

  const notes = typeof input.notes === 'string' && input.notes.trim() !== '' ? input.notes.trim() : null
  if (notes !== null && notes.length > MAX_NOTES_LENGTH) {
    return { ok: false, error: `Notes can be at most ${MAX_NOTES_LENGTH} characters` }
  }

  const rawItems = input.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'At least one line item is required' }
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `An invoice can have at most ${MAX_ITEMS} line items` }
  }

  const items: InvoiceItemInput[] = []
  for (const [index, raw] of rawItems.entries()) {
    const result = validateItem(raw, index + 1)
    if (!result.ok) return result
    items.push(result.value)
  }

  if (vatTreatment === 'eu_reverse_charge' && items.some((item) => item.vat_rate !== 0)) {
    return { ok: false, error: 'Reverse-charge invoices must use 0% VAT on every line' }
  }

  return {
    ok: true,
    value: {
      client_id: clientId,
      language,
      vat_treatment: vatTreatment,
      issue_date: issueDate,
      due_date: dueDate,
      notes,
      items,
    },
  }
}
