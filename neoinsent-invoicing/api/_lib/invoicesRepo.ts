import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { fromCents, getDb, toCents, toHundredths, withTransaction } from './db'
import type { Client, NewClient } from './clientsRepo'
import { computeInvoiceTotals, computeLine } from '../../src/lib/invoiceMath'
import type { InvoiceVatTreatment } from '../../src/lib/vat'

// The database stores money as integer cents and quantities as integer hundredths; everything
// this module returns is in euros / plain quantities, converted at this boundary.

export interface InvoiceItemInput {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export interface DraftInvoiceInput {
  client_id: string
  language: 'nl' | 'en'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  due_date: string
  notes: string | null
  items: InvoiceItemInput[]
}

/** The client's details as frozen onto an invoice when it is finalized. */
export type ClientSnapshot = NewClient

export interface Invoice {
  id: string
  invoice_number: string | null
  client_id: string
  status: 'draft' | 'final'
  language: 'nl' | 'en'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  due_date: string
  notes: string | null
  subtotal: number
  vat_amount: number
  total: number
  client_snapshot: ClientSnapshot | null
  pdf_path: string | null
  paid: boolean
  sent_at: string | null
  created_at: string
  updated_at: string | null
  finalized_at: string | null
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  line_total: number
  sort_order: number
}

export interface InvoiceWithDetails extends Invoice {
  /** The live client row (for a final invoice, show client_snapshot instead). */
  client: Client | null
  items: InvoiceItem[]
}

export interface InvoiceSummary {
  id: string
  invoice_number: string | null
  client_id: string
  /** The live client's current name. */
  client_name: string
  status: 'draft' | 'final'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  subtotal: number
  vat_amount: number
  total: number
  paid: boolean
}

export interface ListInvoicesFilter {
  fromDate?: string
  toDate?: string
}

interface InvoiceRow {
  id: string
  invoice_number: string | null
  client_id: string
  status: 'draft' | 'final'
  language: 'nl' | 'en'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  due_date: string
  notes: string | null
  subtotal_cents: number
  vat_amount_cents: number
  total_cents: number
  client_snapshot: string | null
  pdf_path: string | null
  paid: number
  sent_at: string | null
  created_at: string
  updated_at: string | null
  finalized_at: string | null
}

interface InvoiceItemRow {
  id: string
  invoice_id: string
  description: string
  quantity_hundredths: number
  unit_price_cents: number
  vat_rate: number
  line_total_cents: number
  sort_order: number
}

type SummaryRow = Pick<
  InvoiceRow,
  | 'id'
  | 'invoice_number'
  | 'client_id'
  | 'status'
  | 'vat_treatment'
  | 'issue_date'
  | 'subtotal_cents'
  | 'vat_amount_cents'
  | 'total_cents'
  | 'paid'
> & { client_name: string }

function fromInvoiceRow(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    client_id: row.client_id,
    status: row.status,
    language: row.language,
    vat_treatment: row.vat_treatment,
    issue_date: row.issue_date,
    due_date: row.due_date,
    notes: row.notes,
    subtotal: fromCents(row.subtotal_cents),
    vat_amount: fromCents(row.vat_amount_cents),
    total: fromCents(row.total_cents),
    client_snapshot: row.client_snapshot === null ? null : (JSON.parse(row.client_snapshot) as ClientSnapshot),
    pdf_path: row.pdf_path,
    paid: row.paid === 1,
    sent_at: row.sent_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finalized_at: row.finalized_at,
  }
}

function fromItemRow(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    description: row.description,
    quantity: row.quantity_hundredths / 100,
    unit_price: fromCents(row.unit_price_cents),
    vat_rate: row.vat_rate,
    line_total: fromCents(row.line_total_cents),
    sort_order: row.sort_order,
  }
}

function fromSummaryRow(row: SummaryRow): InvoiceSummary {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    client_id: row.client_id,
    client_name: row.client_name,
    status: row.status,
    vat_treatment: row.vat_treatment,
    issue_date: row.issue_date,
    subtotal: fromCents(row.subtotal_cents),
    vat_amount: fromCents(row.vat_amount_cents),
    total: fromCents(row.total_cents),
    paid: row.paid === 1,
  }
}

// invoiceMath works in camelCase; DB/API items are snake_case.
function toLineInput(item: InvoiceItemInput) {
  return { quantity: item.quantity, unitPrice: item.unit_price, vatRate: item.vat_rate }
}

function totalsInCents(items: InvoiceItemInput[]) {
  const totals = computeInvoiceTotals(items.map(toLineInput))
  return {
    subtotal_cents: toCents(totals.subtotal),
    vat_amount_cents: toCents(totals.vatAmount),
    total_cents: toCents(totals.total),
  }
}

function insertItems(db: DatabaseSync, invoiceId: string, items: InvoiceItemInput[]): void {
  const insert = db.prepare(
    `insert into invoice_items (id, invoice_id, description, quantity_hundredths,
                                unit_price_cents, vat_rate, line_total_cents, sort_order)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  items.forEach((item, index) => {
    insert.run(
      randomUUID(),
      invoiceId,
      item.description,
      toHundredths(item.quantity),
      toCents(item.unit_price),
      item.vat_rate,
      toCents(computeLine(toLineInput(item)).lineTotal),
      index,
    )
  })
}

function selectInvoiceRow(db: DatabaseSync, id: string): InvoiceRow | null {
  return (db.prepare('select * from invoices where id = ?').get(id) as InvoiceRow | undefined) ?? null
}

function loadInvoice(db: DatabaseSync, id: string): InvoiceWithDetails | null {
  const row = selectInvoiceRow(db, id)
  if (!row) return null
  const items = db
    .prepare('select * from invoice_items where invoice_id = ? order by sort_order')
    .all(id) as unknown as InvoiceItemRow[]
  const client = db.prepare('select * from clients where id = ?').get(row.client_id) as
    | Client
    | undefined
  return {
    ...fromInvoiceRow(row),
    client: client ? { ...client } : null,
    items: items.map(fromItemRow),
  }
}

export async function createDraftInvoice(input: DraftInvoiceInput): Promise<Invoice> {
  const db = getDb()
  const totals = totalsInCents(input.items)
  const id = randomUUID()
  const row = withTransaction(db, () => {
    db.prepare(
      `insert into invoices (id, client_id, status, language, vat_treatment, issue_date, due_date,
                             notes, subtotal_cents, vat_amount_cents, total_cents, created_at)
       values (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.client_id,
      input.language,
      input.vat_treatment,
      input.issue_date,
      input.due_date,
      input.notes,
      totals.subtotal_cents,
      totals.vat_amount_cents,
      totals.total_cents,
      new Date().toISOString(),
    )
    insertItems(db, id, input.items)
    return selectInvoiceRow(db, id) as InvoiceRow
  })
  return fromInvoiceRow(row)
}

export async function listInvoices(filter: ListInvoicesFilter = {}): Promise<InvoiceSummary[]> {
  const conditions: string[] = []
  const params: string[] = []
  if (filter.fromDate) {
    conditions.push('i.issue_date >= ?')
    params.push(filter.fromDate)
  }
  if (filter.toDate) {
    conditions.push('i.issue_date <= ?')
    params.push(filter.toDate)
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const rows = getDb()
    .prepare(
      `select i.id, i.invoice_number, i.client_id, c.name as client_name, i.status,
              i.vat_treatment, i.issue_date, i.subtotal_cents, i.vat_amount_cents, i.total_cents,
              i.paid
       from invoices i join clients c on c.id = i.client_id
       ${where}
       -- created_at, then rowid (insertion order), keep same-day invoices in a stable order.
       order by i.issue_date desc, i.created_at desc, i.rowid desc`,
    )
    .all(...params) as unknown as SummaryRow[]
  return rows.map(fromSummaryRow)
}

export async function getInvoice(id: string): Promise<InvoiceWithDetails | null> {
  return loadInvoice(getDb(), id)
}

/**
 * Replaces a draft's fields and lines in one transaction. Returns 'not_found' for an unknown id
 * and 'locked' for a final invoice (left untouched); otherwise the refreshed invoice.
 */
export async function replaceDraftInvoice(
  id: string,
  input: DraftInvoiceInput,
): Promise<'not_found' | 'locked' | InvoiceWithDetails> {
  const db = getDb()
  const totals = totalsInCents(input.items)
  return withTransaction(db, () => {
    const current = db.prepare('select status from invoices where id = ?').get(id) as
      | { status: 'draft' | 'final' }
      | undefined
    if (!current) return 'not_found' as const
    if (current.status !== 'draft') return 'locked' as const

    db.prepare(
      `update invoices set client_id = ?, language = ?, vat_treatment = ?, issue_date = ?,
                           due_date = ?, notes = ?, subtotal_cents = ?, vat_amount_cents = ?,
                           total_cents = ?, updated_at = ?
       where id = ?`,
    ).run(
      input.client_id,
      input.language,
      input.vat_treatment,
      input.issue_date,
      input.due_date,
      input.notes,
      totals.subtotal_cents,
      totals.vat_amount_cents,
      totals.total_cents,
      new Date().toISOString(),
      id,
    )
    db.prepare('delete from invoice_items where invoice_id = ?').run(id)
    insertItems(db, id, input.items)
    return loadInvoice(db, id) as InvoiceWithDetails
  })
}
