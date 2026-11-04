import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { fromCents, getDataDir, getDb, nextInvoiceNumber, toCents, toHundredths, withTransaction } from './db'
import { CLIENT_COLUMNS, toClient, type Client, type NewClient } from './clientsRepo'
import { vatMismatchMessage } from './checkClientForDraft'
import { buildInvoicePdfModel, pdfInputForStoredInvoice, type InvoicePdfModel } from './invoicePdfModel'
import { computeInvoiceTotals, computeLine } from '../../src/lib/invoiceMath'
import { determineVatTreatment, type InvoiceVatTreatment } from '../../src/lib/vat'

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
  /** Date or period of supply (leverdatum) when it differs from the issue date, e.g. 'October 2026'. */
  service_period: string | null
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
  /** Date or period of supply (leverdatum), when it differs from the issue date. */
  service_period: string | null
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
  service_period: string | null
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
    service_period: row.service_period,
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
  const client = db.prepare(`select ${CLIENT_COLUMNS} from clients where id = ?`).get(row.client_id)
  return {
    ...fromInvoiceRow(row),
    client: client === undefined ? null : toClient(client),
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
                             notes, service_period, subtotal_cents, vat_amount_cents,
                             total_cents, created_at)
       values (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.client_id,
      input.language,
      input.vat_treatment,
      input.issue_date,
      input.due_date,
      input.notes,
      input.service_period,
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
                           due_date = ?, notes = ?, service_period = ?, subtotal_cents = ?,
                           vat_amount_cents = ?, total_cents = ?, updated_at = ?
       where id = ?`,
    ).run(
      input.client_id,
      input.language,
      input.vat_treatment,
      input.issue_date,
      input.due_date,
      input.notes,
      input.service_period,
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

export type FinalizeResult =
  | { status: 'not_found' }
  | { status: 'locked' }
  | { status: 'vat_mismatch'; message: string }
  /** The invoice data can't be printed as a valid invoice (the PDF rules refused it). */
  | { status: 'invalid'; message: string }
  /** The next number already has a PDF in the invoices folder (the database was restored alone). */
  | { status: 'number_conflict'; message: string }
  | { status: 'ok'; invoice: InvoiceWithDetails; pdfModel: InvoicePdfModel }

/** Thrown inside the finalize transaction to roll it back and return `result` instead. */
class FinalizeRollback {
  constructor(readonly result: FinalizeResult) {}
}

/** The fields of a client that are frozen onto an invoice when it is finalized. */
function snapshotOf(client: Client): ClientSnapshot {
  return {
    name: client.name,
    contact_person: client.contact_person,
    email: client.email,
    address_line: client.address_line,
    postal_code: client.postal_code,
    city: client.city,
    country: client.country,
    vat_number: client.vat_number,
    kvk_number: client.kvk_number,
  }
}

/** 'NEO-2026-0001' — the per-year sequence, zero-padded to at least 4 digits. */
function formatInvoiceNumber(year: number, seq: number): string {
  return `NEO-${year}-${String(seq).padStart(4, '0')}`
}

/** The local calendar date of `d` as YYYY-MM-DD (not UTC: the invoice date is the user's day). */
function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole days from `from` to `to` (YYYY-MM-DD), never negative. */
function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((utcDay(to) - utcDay(from)) / DAY_MS))
}

function addDays(isoDate: string, days: number): string {
  return new Date(utcDay(isoDate) + days * DAY_MS).toISOString().slice(0, 10)
}

const PDF_FILE_NAME = /^NEO-(\d{4})-(\d{4,})\.pdf$/

/**
 * The highest invoice sequence for `year` that already has a PDF in `<dataDir>/invoices/<year>/`
 * (0 if none or the folder is missing). Synchronous, so it can run inside the finalize transaction.
 */
function highestPdfSequence(year: number): number {
  let names: string[]
  try {
    names = fs.readdirSync(path.join(getDataDir(), 'invoices', String(year)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
  let highest = 0
  for (const name of names) {
    const match = PDF_FILE_NAME.exec(name)
    if (match && Number(match[1]) === year) highest = Math.max(highest, Number(match[2]))
  }
  return highest
}

/**
 * Issues a draft: in ONE transaction it re-checks the VAT treatment against the live client,
 * recomputes the stored line and invoice totals from the lines, dates the invoice today (the due
 * date moves with it, keeping the draft's payment term), takes the next gap-free number for that
 * year — refusing one that already has a PDF on disk, which means the database was restored from
 * an older backup without the invoices folder — freezes the client snapshot, sets status
 * 'final', and builds the PDF model
 * from exactly what was stored. Any refusal or error rolls everything back — the counter
 * included — so a number is only ever consumed by an invoice that is actually issued.
 *
 * Writing the PDF file happens after commit (see invoicePdfFiles.ts); `pdf_path` stays null
 * until then.
 */
export async function finalizeDraftInvoice(id: string, now: Date = new Date()): Promise<FinalizeResult> {
  const db = getDb()
  const timestamp = now.toISOString()
  try {
    return withTransaction(db, (): FinalizeResult => {
      const row = selectInvoiceRow(db, id)
      if (!row) return { status: 'not_found' }
      if (row.status !== 'draft') return { status: 'locked' }

      const clientRow = db.prepare(`select ${CLIENT_COLUMNS} from clients where id = ?`).get(row.client_id)
      if (clientRow === undefined) throw new Error(`Invoice ${id}: client ${row.client_id} not found`)
      const client = toClient(clientRow)

      const expected = determineVatTreatment(client.country, client.vat_number).treatment
      if (expected !== row.vat_treatment) {
        return { status: 'vat_mismatch', message: vatMismatchMessage(expected) }
      }

      const items = db
        .prepare('select * from invoice_items where invoice_id = ? order by sort_order')
        .all(id) as unknown as InvoiceItemRow[]
      if (items.length === 0) return { status: 'invalid', message: 'An invoice needs at least one line' }

      // Recompute every stored amount from the lines with the current (integer-cent) rules, so
      // the issued totals always agree with the lines printed on the PDF.
      const lines = items.map((item) => ({
        id: item.id,
        input: {
          description: item.description,
          quantity: item.quantity_hundredths / 100,
          unit_price: fromCents(item.unit_price_cents),
          vat_rate: item.vat_rate,
        },
      }))
      const updateLine = db.prepare('update invoice_items set line_total_cents = ? where id = ?')
      for (const line of lines) {
        updateLine.run(toCents(computeLine(toLineInput(line.input)).lineTotal), line.id)
      }
      const totals = totalsInCents(lines.map((line) => line.input))
      db.prepare(
        'update invoices set subtotal_cents = ?, vat_amount_cents = ?, total_cents = ? where id = ?',
      ).run(totals.subtotal_cents, totals.vat_amount_cents, totals.total_cents, id)

      // An invoice is dated the day it is issued; the due date keeps the draft's payment term.
      const issueDate = localIsoDate(now)
      const dueDate = addDays(issueDate, daysBetween(row.issue_date, row.due_date))

      const year = Number(issueDate.slice(0, 4))
      const seq = nextInvoiceNumber(db, year)
      const onDisk = highestPdfSequence(year)
      if (onDisk >= seq) {
        throw new FinalizeRollback({
          status: 'number_conflict',
          message:
            `Invoice ${formatInvoiceNumber(year, onDisk)} already exists in your invoices folder, but the ` +
            "database doesn't know it — it looks restored from an older backup. Restore the database " +
            'and the invoices folder from the same moment. Nothing was finalized.',
        })
      }
      const invoiceNumber = formatInvoiceNumber(year, seq)
      const result = db
        .prepare(
          `update invoices set status = 'final', invoice_number = ?, issue_date = ?, due_date = ?,
                               client_snapshot = ?, finalized_at = ?, updated_at = ?
           where id = ? and status = 'draft'`,
        )
        .run(invoiceNumber, issueDate, dueDate, JSON.stringify(snapshotOf(client)), timestamp, timestamp, id)
      if (result.changes !== 1) throw new Error(`Invoice ${id}: finalize updated ${result.changes} rows`)

      const invoice = loadInvoice(db, id) as InvoiceWithDetails
      let pdfModel: InvoicePdfModel
      try {
        pdfModel = buildInvoicePdfModel(pdfInputForStoredInvoice(invoice))
      } catch (error) {
        throw new FinalizeRollback({
          status: 'invalid',
          message: error instanceof Error ? error.message : String(error),
        })
      }
      return { status: 'ok', invoice, pdfModel }
    })
  } catch (error) {
    if (error instanceof FinalizeRollback) return error.result
    throw error
  }
}

/** Records where a final invoice's PDF was written (relative to the data folder). */
export async function setInvoicePdfPath(id: string, relPath: string): Promise<boolean> {
  const result = getDb()
    .prepare('update invoices set pdf_path = ?, updated_at = ? where id = ?')
    .run(relPath, new Date().toISOString(), id)
  return result.changes > 0
}
