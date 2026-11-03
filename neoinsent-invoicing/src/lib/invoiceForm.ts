import type { ClientSummary } from '../components/ClientPicker'
import type { LineItemRow } from '../components/InvoiceLineItems'
import { computeLine } from './invoiceMath'
import type { VatTreatment } from './vat'

/** An invoice line as the API sends and receives it. */
export interface ApiInvoiceItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Today's date in the user's own calendar. `toISOString()` is UTC, which in Amsterdam is still
 * yesterday just after midnight.
 */
export function todayLocalIso(now: Date = new Date()): string {
  return isoFromLocalDate(now)
}

/** `iso` (YYYY-MM-DD) plus `days` calendar days, computed on local dates so DST can't shift it. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoFromLocalDate(new Date(y, m - 1, d + days))
}

export function rowsFromInvoiceItems(items: ApiInvoiceItem[]): LineItemRow[] {
  return items.map((item) => ({
    key: crypto.randomUUID(),
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    vatRate: item.vat_rate,
  }))
}

export function itemsForApi(rows: LineItemRow[]): ApiInvoiceItem[] {
  return rows.map((row) => ({
    description: row.description.trim(),
    quantity: row.quantity,
    unit_price: row.unitPrice,
    vat_rate: row.vatRate,
  }))
}

/**
 * Line VAT rates after the invoice's VAT treatment changes: reverse charge is always 0%; leaving
 * reverse charge for NL resets the zeroed lines to the standard 21%; otherwise rates the user
 * picked (e.g. 9%) are kept.
 */
export function normalizeRatesForTreatment(
  rows: LineItemRow[],
  treatment: VatTreatment | null,
  previousTreatment: VatTreatment | null,
): LineItemRow[] {
  if (treatment === 'eu_reverse_charge') return rows.map((row) => ({ ...row, vatRate: 0 }))
  if (treatment === 'nl_standard' && previousTreatment === 'eu_reverse_charge') {
    return rows.map((row) => ({ ...row, vatRate: 21 }))
  }
  return rows
}

export interface InvoiceFormState {
  client: ClientSummary | null
  treatment: VatTreatment | null
  rows: LineItemRow[]
  issueDate: string
  dueDate: string
}

export type CanSaveResult = { ok: true } | { ok: false; reason: string }

function lineIsComputable(row: LineItemRow): boolean {
  try {
    return Number.isFinite(computeLine(row).lineTotal)
  } catch {
    return false
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function canSave(state: InvoiceFormState): CanSaveResult {
  if (!state.client) return { ok: false, reason: 'Choose a client.' }
  if (state.treatment === 'blocked_missing_vat_number') {
    return { ok: false, reason: "Add the client's VAT number first." }
  }
  if (state.treatment === 'not_supported' || state.treatment === null) {
    return { ok: false, reason: "This client's country isn't supported." }
  }
  if (state.rows.length === 0) return { ok: false, reason: 'Add at least one line.' }
  const n = state.rows.findIndex((row) => row.description.trim() === '')
  if (n !== -1) return { ok: false, reason: `Line ${n + 1} needs a description.` }
  const bad = state.rows.findIndex((row) => !lineIsComputable(row))
  if (bad !== -1) return { ok: false, reason: `Line ${bad + 1} has an invalid amount.` }
  if (!ISO_DATE.test(state.issueDate)) return { ok: false, reason: 'Enter an issue date.' }
  if (!ISO_DATE.test(state.dueDate)) return { ok: false, reason: 'Enter a due date.' }
  if (state.dueDate < state.issueDate) {
    return { ok: false, reason: 'The due date must be on or after the issue date.' }
  }
  return { ok: true }
}
