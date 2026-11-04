import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { fromCents, getDataDir, getDb, nextInvoiceNumber, toCents, toHundredths, withTransaction } from './db'
import { CLIENT_COLUMNS, toClient, type Client, type NewClient } from './clientsRepo'
import { vatMismatchMessage } from './checkClientForDraft'
import { TaxReportDataError } from './taxReportError'
import { buildInvoicePdfModel, pdfInputForStoredInvoice, type InvoicePdfModel } from './invoicePdfModel'
import { computeInvoiceTotals, computeLine, computeStoredLineCents } from '../../src/lib/invoiceMath'
import { determineVatTreatment, needsVatNote, VAT_NOTE_REQUIRED, type InvoiceVatTreatment } from '../../src/lib/vat'

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
  /** Why a line has 0% VAT on a Dutch invoice (required to finalize one); null for reverse charge. */
  vat_note: string | null
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
  /** Why a line has 0% VAT on a Dutch invoice; printed on the PDF. */
  vat_note: string | null
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
  /** The client's name as invoiced (from the snapshot) for a final invoice; the live name for a draft. */
  client_name: string
  status: 'draft' | 'final'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  due_date: string
  subtotal: number
  vat_amount: number
  total: number
  paid: boolean
  /** Where the PDF was written; null on a final invoice means it still has to be (re)created. */
  pdf_path: string | null
}

export interface ListInvoicesFilter {
  fromDate?: string
  toDate?: string
  status?: 'draft' | 'final'
}

/** An inclusive range of issue dates (YYYY-MM-DD). */
export interface PeriodRange {
  fromDate: string
  toDate: string
}

/**
 * One line of the VAT breakdown: amounts per VAT treatment AND rate, so 0% reverse-charge
 * revenue never mixes with 0% domestic lines.
 *
 * Task 21 (BTW return / ICP listing) must select on `treatment`, never on `rate`: reverse-charge
 * revenue is `treatment === 'eu_reverse_charge'` (BTW rubriek 3b / ICP), whatever its rate.
 */
export interface VatRateTotal {
  treatment: InvoiceVatTreatment
  /** VAT rate in percent (21, 9, 0). */
  rate: number
  /** Sum of the lines' amounts excl. VAT with this treatment and rate. */
  base: number
  vat: number
}

/** Totals over the final invoices issued in a period, in euros. */
export interface PeriodSummary {
  invoiceCount: number
  subtotal: number
  vatAmount: number
  total: number
  /**
   * Per VAT treatment (domestic first) and rate (highest first); adds up to subtotal and
   * vatAmount. See VatRateTotal: tax reports must use the treatment, not the rate.
   */
  vatByRate: VatRateTotal[]
  /** Amount excl. VAT of EU reverse-charge invoices (ICP). */
  reverseChargeRevenue: number
  unpaidCount: number
  unpaidTotal: number
}

/** Every final invoice not yet paid, regardless of when it was issued. */
export interface OutstandingSummary {
  count: number
  total: number
  /** How many are past their due date (due_date before `today`). */
  overdueCount: number
  /** Ordered by due date, oldest first. */
  invoices: InvoiceSummary[]
}

export interface DashboardQuery extends PeriodRange {
  /** The local calendar date (YYYY-MM-DD) used to decide what is overdue. */
  today: string
}

/** Everything the dashboard shows, read in one transaction so the figures agree with each other. */
export interface DashboardData {
  summary: PeriodSummary
  /** Final invoices issued in the period, newest first. */
  invoices: InvoiceSummary[]
  /** Every draft, regardless of date. */
  drafts: InvoiceSummary[]
  outstanding: OutstandingSummary
  /** Earliest year with a final invoice; null when there are none yet. */
  firstYear: number | null
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
  vat_note: string | null
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
  | 'due_date'
  | 'subtotal_cents'
  | 'vat_amount_cents'
  | 'total_cents'
  | 'paid'
  | 'pdf_path'
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
    vat_note: row.vat_note,
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
    due_date: row.due_date,
    subtotal: fromCents(row.subtotal_cents),
    vat_amount: fromCents(row.vat_amount_cents),
    total: fromCents(row.total_cents),
    paid: row.paid === 1,
    pdf_path: row.pdf_path,
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
                             notes, service_period, vat_note, subtotal_cents, vat_amount_cents,
                             total_cents, created_at)
       values (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.client_id,
      input.language,
      input.vat_treatment,
      input.issue_date,
      input.due_date,
      input.notes,
      input.service_period,
      input.vat_note,
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

const SUMMARY_SELECT = `select i.id, i.invoice_number, i.client_id,
       -- A final invoice keeps the name it was issued to, even after the client is renamed.
       coalesce(json_extract(i.client_snapshot, '$.name'), c.name) as client_name, i.status,
       i.vat_treatment, i.issue_date, i.due_date, i.subtotal_cents, i.vat_amount_cents, i.total_cents,
       i.paid, i.pdf_path
from invoices i join clients c on c.id = i.client_id`

// created_at, then rowid (insertion order), keep same-day invoices in a stable order.
const NEWEST_FIRST = 'order by i.issue_date desc, i.created_at desc, i.rowid desc'

function selectSummaries(db: DatabaseSync, filter: ListInvoicesFilter): InvoiceSummary[] {
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
  if (filter.status) {
    conditions.push('i.status = ?')
    params.push(filter.status)
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const rows = db.prepare(`${SUMMARY_SELECT} ${where} ${NEWEST_FIRST}`).all(...params) as unknown as SummaryRow[]
  return rows.map(fromSummaryRow)
}

export async function listInvoices(filter: ListInvoicesFilter = {}): Promise<InvoiceSummary[]> {
  return selectSummaries(getDb(), filter)
}

interface PeriodTotalsRow {
  invoice_count: number
  subtotal_cents: number
  vat_amount_cents: number
  total_cents: number
  reverse_charge_cents: number
  unpaid_count: number
  unpaid_cents: number
}

const TREATMENT_ORDER: Record<InvoiceVatTreatment, number> = { nl_standard: 0, eu_reverse_charge: 1 }

/** See summaryForPeriod. Synchronous, so it can run inside a transaction. */
function periodSummary(db: DatabaseSync, range: PeriodRange): PeriodSummary {
  const totals = db
    .prepare(
      `select count(*) as invoice_count,
              coalesce(sum(subtotal_cents), 0) as subtotal_cents,
              coalesce(sum(vat_amount_cents), 0) as vat_amount_cents,
              coalesce(sum(total_cents), 0) as total_cents,
              coalesce(sum(case when vat_treatment = 'eu_reverse_charge' then subtotal_cents end), 0)
                as reverse_charge_cents,
              coalesce(sum(case when paid = 0 then 1 else 0 end), 0) as unpaid_count,
              coalesce(sum(case when paid = 0 then total_cents end), 0) as unpaid_cents
       from invoices
       where status = 'final' and issue_date between ? and ?`,
    )
    .get(range.fromDate, range.toDate) as unknown as PeriodTotalsRow

  const lines = db
    .prepare(
      `select i.vat_treatment, it.quantity_hundredths, it.unit_price_cents, it.vat_rate
       from invoice_items it join invoices i on i.id = it.invoice_id
       where i.status = 'final' and i.issue_date between ? and ?`,
    )
    .all(range.fromDate, range.toDate) as unknown as (Pick<
    InvoiceItemRow,
    'quantity_hundredths' | 'unit_price_cents' | 'vat_rate'
  > & { vat_treatment: InvoiceVatTreatment })[]
  const groups = new Map<string, { treatment: InvoiceVatTreatment; rate: number; baseCents: number; vatCents: number }>()
  for (const line of lines) {
    const cents = computeStoredLineCents({
      quantityHundredths: line.quantity_hundredths,
      unitPriceCents: line.unit_price_cents,
      vatRate: line.vat_rate,
    })
    const key = `${line.vat_treatment}|${line.vat_rate}`
    const entry = groups.get(key) ?? { treatment: line.vat_treatment, rate: line.vat_rate, baseCents: 0, vatCents: 0 }
    entry.baseCents += cents.subtotalCents
    entry.vatCents += cents.vatCents
    groups.set(key, entry)
  }

  return {
    invoiceCount: totals.invoice_count,
    subtotal: fromCents(totals.subtotal_cents),
    vatAmount: fromCents(totals.vat_amount_cents),
    total: fromCents(totals.total_cents),
    vatByRate: [...groups.values()]
      .sort((a, b) => TREATMENT_ORDER[a.treatment] - TREATMENT_ORDER[b.treatment] || b.rate - a.rate)
      .map(({ treatment, rate, baseCents, vatCents }) => ({
        treatment,
        rate,
        base: fromCents(baseCents),
        vat: fromCents(vatCents),
      })),
    reverseChargeRevenue: fromCents(totals.reverse_charge_cents),
    unpaidCount: totals.unpaid_count,
    unpaidTotal: fromCents(totals.unpaid_cents),
  }
}

/**
 * Totals over the final invoices issued in `range` (inclusive). Sums run over integer cents and
 * are converted to euros once at the end. The per-treatment/per-rate split recomputes each stored
 * line's amount excl. VAT and VAT with invoiceMath's rounding, so it adds up to the invoices' totals.
 */
export async function summaryForPeriod(range: PeriodRange): Promise<PeriodSummary> {
  return periodSummary(getDb(), range)
}

/** Every unpaid final invoice, oldest due date first. Synchronous, for use inside a transaction. */
function outstandingInvoices(db: DatabaseSync, today: string): OutstandingSummary {
  const rows = db
    .prepare(
      `${SUMMARY_SELECT}
       where i.status = 'final' and i.paid = 0
       order by i.due_date asc, i.issue_date asc, i.invoice_number asc`,
    )
    .all() as unknown as SummaryRow[]
  const totalCents = rows.reduce((sum, row) => sum + row.total_cents, 0)
  return {
    count: rows.length,
    total: fromCents(totalCents),
    overdueCount: rows.filter((row) => row.due_date < today).length,
    invoices: rows.map(fromSummaryRow),
  }
}

function firstFinalYear(db: DatabaseSync): number | null {
  const row = db
    .prepare(`select min(cast(substr(issue_date, 1, 4) as integer)) as year from invoices where status = 'final'`)
    .get() as { year: number | null }
  return row.year ?? null
}

/**
 * The dashboard's data for a period, read in ONE transaction so the totals, the period's invoices,
 * the drafts and the outstanding list all describe the same moment.
 */
export async function dashboardData({ fromDate, toDate, today }: DashboardQuery): Promise<DashboardData> {
  const db = getDb()
  const range = { fromDate, toDate }
  return withTransaction(db, () => ({
    summary: periodSummary(db, range),
    invoices: selectSummaries(db, { ...range, status: 'final' }),
    drafts: selectSummaries(db, { status: 'draft' }),
    outstanding: outstandingInvoices(db, today),
    firstYear: firstFinalYear(db),
  }))
}

/** Turnover excl. VAT and the VAT on it, in euros. */
export interface BtwAmounts {
  base: number
  vat: number
}

/** The figures for the Dutch VAT return (aangifte omzetbelasting), in euros, exact to the cent. */
export interface BtwFigures {
  /** 1a: domestic supplies/services at the high rate (21%). */
  r1a: BtwAmounts
  /** 1b: domestic supplies/services at the low rate (9%). */
  r1b: BtwAmounts
  /** 1e: domestic supplies/services at 0% (or not taxed with you). */
  r1e: { base: number }
  /** 3b: services to businesses in other EU countries (reverse charge, intra-community). */
  r3b: { base: number }
  /** r1a.vat + r1b.vat — equals the sum of the period's invoice VAT. */
  vatDue: number
}

/** One line of the ICP declaration: services to one EU customer (country + VAT number). */
export interface IcpRow {
  country: string
  vatNumber: string
  /** The name on the most recent invoice to this VAT number in the period (from the snapshot). */
  clientName: string
  /** Sum of the invoices' amounts excl. VAT. */
  servicesTotal: number
}

/** A final invoice as listed in the tax records CSV; client details from the snapshot. */
export interface TaxInvoiceRow {
  invoiceNumber: string
  issueDate: string
  clientName: string
  clientCountry: string
  clientVatNumber: string | null
  treatment: InvoiceVatTreatment
  subtotal: number
  vatAmount: number
  total: number
  paid: boolean
}

export interface TaxReport {
  btw: BtwFigures
  /** Ordered by country, then VAT number. */
  icp: IcpRow[]
  /** The period's final invoices, oldest invoice number first. */
  invoices: TaxInvoiceRow[]
  /** Earliest year with a final invoice; null when there are none yet (for the year picker). */
  firstYear: number | null
}

/** BTW rubrieken from the period's final invoice lines. Synchronous, for use inside a transaction. */
function btwFigures(db: DatabaseSync, range: PeriodRange): BtwFigures {
  const lines = db
    .prepare(
      `select i.invoice_number, i.vat_treatment, it.quantity_hundredths, it.unit_price_cents, it.vat_rate
       from invoice_items it join invoices i on i.id = it.invoice_id
       where i.status = 'final' and i.issue_date between ? and ?`,
    )
    .all(range.fromDate, range.toDate) as unknown as (Pick<
    InvoiceItemRow,
    'quantity_hundredths' | 'unit_price_cents' | 'vat_rate'
  > & { invoice_number: string; vat_treatment: InvoiceVatTreatment })[]

  const cents = { r1a: { base: 0, vat: 0 }, r1b: { base: 0, vat: 0 }, r1e: { base: 0 }, r3b: { base: 0 } }
  for (const line of lines) {
    const { subtotalCents, vatCents } = computeStoredLineCents({
      quantityHundredths: line.quantity_hundredths,
      unitPriceCents: line.unit_price_cents,
      vatRate: line.vat_rate,
    })
    // Reverse charge is recognised by its treatment, never by its 0% rate.
    if (line.vat_treatment === 'eu_reverse_charge') {
      cents.r3b.base += subtotalCents
    } else if (line.vat_rate === 21) {
      cents.r1a.base += subtotalCents
      cents.r1a.vat += vatCents
    } else if (line.vat_rate === 9) {
      cents.r1b.base += subtotalCents
      cents.r1b.vat += vatCents
    } else if (line.vat_rate === 0) {
      cents.r1e.base += subtotalCents
    } else {
      // Never silently leave turnover out of a tax return.
      throw new TaxReportDataError(
        `Invoice ${line.invoice_number} has a line at an unexpected VAT rate of ${line.vat_rate}%, ` +
          'so the tax records can’t be computed',
      )
    }
  }
  return {
    r1a: { base: fromCents(cents.r1a.base), vat: fromCents(cents.r1a.vat) },
    r1b: { base: fromCents(cents.r1b.base), vat: fromCents(cents.r1b.vat) },
    r1e: { base: fromCents(cents.r1e.base) },
    r3b: { base: fromCents(cents.r3b.base) },
    vatDue: fromCents(cents.r1a.vat + cents.r1b.vat),
  }
}

/** ICP rows from the snapshots of the period's reverse-charge invoices. Synchronous. */
function icpRows(db: DatabaseSync, range: PeriodRange): IcpRow[] {
  const rows = db
    .prepare(
      // One row per customer: VAT numbers are compared without spaces, dots and dashes, in upper
      // case, so 'DE 123.456-789' and 'DE123456789' are the same customer.
      `with snap as (
         select json_extract(client_snapshot, '$.country') as country,
                upper(replace(replace(replace(json_extract(client_snapshot, '$.vat_number'),
                  ' ', ''), '.', ''), '-', '')) as vat_number,
                json_extract(client_snapshot, '$.name') as name,
                subtotal_cents, issue_date, invoice_number
         from invoices
         where status = 'final' and vat_treatment = 'eu_reverse_charge' and issue_date between ? and ?
       ),
       rc as (
         select country, vat_number, name, subtotal_cents,
                row_number() over (
                  partition by country, vat_number
                  order by issue_date desc, invoice_number desc
                ) as recency
         from snap
       )
       select country, vat_number,
              max(case when recency = 1 then name end) as client_name,
              sum(subtotal_cents) as services_cents
       from rc
       group by country, vat_number
       order by country, vat_number`,
    )
    .all(range.fromDate, range.toDate) as unknown as {
    country: string
    vat_number: string
    client_name: string
    services_cents: number
  }[]
  return rows.map((row) => ({
    country: row.country,
    vatNumber: row.vat_number,
    clientName: row.client_name,
    servicesTotal: fromCents(row.services_cents),
  }))
}

/** The period's final invoices for the CSV, with client details from the snapshot. Synchronous. */
function taxInvoiceRows(db: DatabaseSync, range: PeriodRange): TaxInvoiceRow[] {
  const rows = db
    .prepare(
      `select invoice_number, issue_date,
              json_extract(client_snapshot, '$.name') as client_name,
              json_extract(client_snapshot, '$.country') as client_country,
              json_extract(client_snapshot, '$.vat_number') as client_vat_number,
              vat_treatment, subtotal_cents, vat_amount_cents, total_cents, paid
       from invoices
       where status = 'final' and issue_date between ? and ?
       order by invoice_number asc`,
    )
    .all(range.fromDate, range.toDate) as unknown as {
    invoice_number: string
    issue_date: string
    client_name: string
    client_country: string
    client_vat_number: string | null
    vat_treatment: InvoiceVatTreatment
    subtotal_cents: number
    vat_amount_cents: number
    total_cents: number
    paid: number
  }[]
  return rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    clientName: row.client_name,
    clientCountry: row.client_country,
    clientVatNumber: row.client_vat_number,
    treatment: row.vat_treatment,
    subtotal: fromCents(row.subtotal_cents),
    vatAmount: fromCents(row.vat_amount_cents),
    total: fromCents(row.total_cents),
    paid: row.paid === 1,
  }))
}

/**
 * The tax records for a period — BTW return figures, ICP listing and the invoice list — from the
 * final invoices issued in `range` (inclusive), read in ONE transaction so they agree. Client
 * details come from each invoice's snapshot (what was actually invoiced), never the live client.
 * Sums run over integer cents; per-line amounts use invoiceMath's rounding, so the VAT due equals
 * the sum of the invoices' VAT.
 */
export async function taxReport({ fromDate, toDate }: PeriodRange): Promise<TaxReport> {
  const db = getDb()
  const range = { fromDate, toDate }
  return withTransaction(db, () => ({
    btw: btwFigures(db, range),
    icp: icpRows(db, range),
    invoices: taxInvoiceRows(db, range),
    firstYear: firstFinalYear(db),
  }))
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
                           due_date = ?, notes = ?, service_period = ?, vat_note = ?,
                           subtotal_cents = ?, vat_amount_cents = ?, total_cents = ?, updated_at = ?
       where id = ?`,
    ).run(
      input.client_id,
      input.language,
      input.vat_treatment,
      input.issue_date,
      input.due_date,
      input.notes,
      input.service_period,
      input.vat_note,
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
      // Dutch invoice rules: a 0% line must say why no VAT applies.
      if (needsVatNote(row.vat_treatment, items.map((item) => item.vat_rate)) && !row.vat_note?.trim()) {
        return { status: 'invalid', message: VAT_NOTE_REQUIRED }
      }

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
            'and the invoices folder from the same moment (see "Restoring" in README.md in the app folder). Nothing was finalized.',
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

/**
 * Records where a final invoice's PDF was written (relative to the data folder). Returns false
 * for an unknown id or a draft (drafts have no issued PDF).
 */
export async function setInvoicePdfPath(id: string, relPath: string): Promise<boolean> {
  const result = getDb()
    .prepare("update invoices set pdf_path = ?, updated_at = ? where id = ? and status = 'final'")
    .run(relPath, new Date().toISOString(), id)
  return result.changes > 0
}

/**
 * Marks a final invoice paid or unpaid (drafts can't be paid). Returns 'not_found' for an unknown
 * id and 'not_final' for a draft (left untouched); otherwise the refreshed invoice.
 */
export async function setInvoicePaid(
  id: string,
  paid: boolean,
): Promise<'not_found' | 'not_final' | InvoiceWithDetails> {
  const db = getDb()
  return withTransaction(db, () => {
    const result = db
      .prepare("update invoices set paid = ?, updated_at = ? where id = ? and status = 'final'")
      .run(paid ? 1 : 0, new Date().toISOString(), id)
    if (result.changes === 0) {
      return selectInvoiceRow(db, id) ? ('not_final' as const) : ('not_found' as const)
    }
    return loadInvoice(db, id) as InvoiceWithDetails
  })
}

/**
 * Records that a final invoice was emailed: sets `sent_at` (and `updated_at`) to `now`. Returns
 * 'not_found' for an unknown id and 'not_final' for a draft (left untouched); otherwise the
 * refreshed invoice. Sending again simply moves `sent_at` to the latest send.
 */
export async function markInvoiceSent(
  id: string,
  now: Date = new Date(),
): Promise<'not_found' | 'not_final' | InvoiceWithDetails> {
  const db = getDb()
  const at = now.toISOString()
  return withTransaction(db, () => {
    const result = db
      .prepare("update invoices set sent_at = ?, updated_at = ? where id = ? and status = 'final'")
      .run(at, at, id)
    if (result.changes === 0) {
      return selectInvoiceRow(db, id) ? ('not_final' as const) : ('not_found' as const)
    }
    return loadInvoice(db, id) as InvoiceWithDetails
  })
}
