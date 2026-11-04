// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './db'
import { formatCurrency } from '../../src/lib/format'
import { createClient, updateClient, type Client, type NewClient } from './clientsRepo'
import {
  createDraftInvoice,
  finalizeDraftInvoice,
  getInvoice,
  setInvoicePdfPath,
  type DraftInvoiceInput,
} from './invoicesRepo'

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-finalize-'))
  process.env.NEOINSENT_DATA_DIR = tmpDir
  closeDb()
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'
// Local time: the invoice date is the user's calendar day.
const NOW = new Date(2026, 10, 4, 10, 30)

const acmeInput: NewClient = {
  name: 'Acme BV',
  contact_person: 'Jan de Vries',
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
  kvk_number: '12345678',
}

const beispielInput: NewClient = {
  name: 'Beispiel GmbH',
  contact_person: null,
  email: 'ap@beispiel.de',
  address_line: 'Hauptstraße 5',
  postal_code: '10115',
  city: 'Berlin',
  country: 'DE',
  vat_number: 'DE123456789',
  kvk_number: null,
}

function draftFor(client: Client, overrides: Partial<DraftInvoiceInput> = {}): DraftInvoiceInput {
  return {
    client_id: client.id,
    language: 'nl',
    vat_treatment: 'nl_standard',
    issue_date: '2026-11-02',
    due_date: '2026-11-16',
    notes: null,
    service_period: null,
    items: [
      // 2 x 100.00 = 200.00, 21% VAT 42.00
      { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
      // 3 x 19.99 = 59.97, 9% VAT 5.40
      { description: 'Books', quantity: 3, unit_price: 19.99, vat_rate: 9 },
    ],
    ...overrides,
  }
}

function reverseChargeDraft(client: Client): DraftInvoiceInput {
  return draftFor(client, {
    language: 'en',
    vat_treatment: 'eu_reverse_charge',
    items: [{ description: 'AI strategy', quantity: 8, unit_price: 125, vat_rate: 0 }],
  })
}

function counter(year: number): number | null {
  const row = getDb().prepare('select last_number from invoice_counters where year = ?').get(year) as
    | { last_number: number }
    | undefined
  return row?.last_number ?? null
}

function storedRow(id: string) {
  return getDb().prepare('select * from invoices where id = ?').get(id) as Record<string, unknown>
}

let acme: Client

beforeEach(async () => {
  acme = await createClient(acmeInput)
})

describe('finalizeDraftInvoice', () => {
  it('numbers invoices sequentially per issue year: NEO-2026-0001, then 0002', async () => {
    const first = await createDraftInvoice(draftFor(acme))
    const second = await createDraftInvoice(draftFor(acme))

    const r1 = await finalizeDraftInvoice(first.id, NOW)
    const r2 = await finalizeDraftInvoice(second.id, NOW)

    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status !== 'ok' || r2.status !== 'ok') return
    expect(r1.invoice.invoice_number).toBe('NEO-2026-0001')
    expect(r2.invoice.invoice_number).toBe('NEO-2026-0002')
    expect(counter(2026)).toBe(2)
  })

  it('dates the invoice the day it is finalized, keeps the payment term and numbers it in that year', async () => {
    const draft = await createDraftInvoice(draftFor(acme, { issue_date: '2026-12-10', due_date: '2026-12-24' }))

    const result = await finalizeDraftInvoice(draft.id, new Date(2027, 0, 5, 9, 0))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.invoice).toMatchObject({
      issue_date: '2027-01-05',
      due_date: '2027-01-19',
      invoice_number: 'NEO-2027-0001',
    })
    expect(storedRow(draft.id)).toMatchObject({ issue_date: '2027-01-05', due_date: '2027-01-19' })
    expect(result.pdfModel).toMatchObject({
      invoiceNumber: 'NEO-2027-0001',
      issueDate: '05-01-2027',
      dueDate: '19-01-2027',
    })
    expect(counter(2027)).toBe(1)
    expect(counter(2026)).toBeNull()
  })

  it('keeps the dates of a draft finalized on its own issue date', async () => {
    const draft = await createDraftInvoice(draftFor(acme, { issue_date: '2026-11-04', due_date: '2026-12-04' }))

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result.status === 'ok' && result.invoice).toMatchObject({
      issue_date: '2026-11-04',
      due_date: '2026-12-04',
      invoice_number: 'NEO-2026-0001',
    })
  })

  it("refuses a number that already has a PDF in the invoices folder ('number_conflict')", async () => {
    const draft = await createDraftInvoice(draftFor(acme))
    const yearDir = path.join(tmpDir, 'invoices', '2026')
    fs.mkdirSync(yearDir, { recursive: true })
    fs.writeFileSync(path.join(yearDir, 'NEO-2026-0001.pdf'), 'issued earlier')
    fs.writeFileSync(path.join(yearDir, 'NEO-2026-0003.pdf'), 'issued earlier')
    fs.writeFileSync(path.join(yearDir, 'notes.txt'), 'ignored')
    const before = storedRow(draft.id)

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result).toEqual({
      status: 'number_conflict',
      message:
        "Invoice NEO-2026-0003 already exists in your invoices folder, but the database doesn't know it — " +
        'it looks restored from an older backup. Restore the database and the invoices folder from the ' +
        'same moment. Nothing was finalized.',
    })
    expect(storedRow(draft.id)).toEqual(before)
    expect(counter(2026)).toBeNull()
  })

  it('marks the invoice final with the snapshot, timestamps and a PDF model', async () => {
    const draft = await createDraftInvoice(draftFor(acme, { service_period: 'October 2026' }))

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.invoice).toMatchObject({
      id: draft.id,
      status: 'final',
      finalized_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      pdf_path: null,
      client_snapshot: acmeInput,
    })
    expect(JSON.parse(storedRow(draft.id).client_snapshot as string)).toEqual(acmeInput)
    expect(result.pdfModel).toMatchObject({
      invoiceNumber: 'NEO-2026-0001',
      servicePeriod: 'October 2026',
      client: { name: 'Acme BV' },
      totals: {
        subtotal: formatCurrency(259.97),
        vatTotal: formatCurrency(47.4),
        total: formatCurrency(307.37),
      },
    })
  })

  it('recomputes stored line and invoice totals from the items before issuing', async () => {
    const draft = await createDraftInvoice(draftFor(acme))
    const db = getDb()
    db.prepare(
      'update invoices set subtotal_cents = 1, vat_amount_cents = 2, total_cents = 3 where id = ?',
    ).run(draft.id)
    db.prepare('update invoice_items set line_total_cents = 999 where invoice_id = ?').run(draft.id)

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result.status).toBe('ok')
    const stored = await getInvoice(draft.id)
    expect(stored).toMatchObject({ subtotal: 259.97, vat_amount: 47.4, total: 307.37 })
    expect(stored?.items.map((i) => i.line_total)).toEqual([242, 65.37])
  })

  it("returns 'not_found' for an unknown id", async () => {
    expect(await finalizeDraftInvoice(UNKNOWN_ID, NOW)).toEqual({ status: 'not_found' })
  })

  it("returns 'locked' for an invoice that is already final, without consuming a number", async () => {
    const draft = await createDraftInvoice(draftFor(acme))
    await finalizeDraftInvoice(draft.id, NOW)

    expect(await finalizeDraftInvoice(draft.id, NOW)).toEqual({ status: 'locked' })
    expect(counter(2026)).toBe(1)
    expect((await getInvoice(draft.id))?.invoice_number).toBe('NEO-2026-0001')
  })

  it("returns 'vat_mismatch' when the client changed since the draft, consuming no number", async () => {
    const stale = await createDraftInvoice(draftFor(acme))
    // The client moved to Germany without a VAT number: no longer nl_standard.
    await updateClient(acme.id, { ...acmeInput, country: 'DE', vat_number: null })
    const db = getDb()
    db.prepare('update invoices set subtotal_cents = 1 where id = ?').run(stale.id)

    const result = await finalizeDraftInvoice(stale.id, NOW)

    expect(result).toEqual({
      status: 'vat_mismatch',
      message: 'This client needs a valid VAT number matching their country before you can invoice them',
    })
    expect(storedRow(stale.id)).toMatchObject({
      status: 'draft',
      invoice_number: null,
      client_snapshot: null,
      finalized_at: null,
      subtotal_cents: 1, // nothing written, not even the recomputed totals
    })
    expect(counter(2026)).toBeNull()

    const other = await createClient({ ...acmeInput, name: 'Other BV' })
    const good = await createDraftInvoice(draftFor(other))
    const ok = await finalizeDraftInvoice(good.id, NOW)
    expect(ok.status === 'ok' && ok.invoice.invoice_number).toBe('NEO-2026-0001')
  })

  it("rolls everything back and returns 'invalid' when the PDF model refuses the invoice", async () => {
    const beispiel = await createClient(beispielInput)
    const draft = await createDraftInvoice(reverseChargeDraft(beispiel))
    // A 21% line on a reverse-charge invoice can only come from tampering; the PDF rules refuse it.
    getDb().prepare('update invoice_items set vat_rate = 21 where invoice_id = ?').run(draft.id)
    const before = storedRow(draft.id)

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result.status).toBe('invalid')
    expect(result.status === 'invalid' && result.message).toMatch(/reverse-charge invoice must have 0% VAT/)
    expect(storedRow(draft.id)).toEqual(before) // still a draft, totals not rewritten
    expect(counter(2026)).toBeNull()

    const good = await createDraftInvoice(draftFor(acme))
    const ok = await finalizeDraftInvoice(good.id, NOW)
    expect(ok.status === 'ok' && ok.invoice.invoice_number).toBe('NEO-2026-0001')
  })

  it("returns 'invalid' for a draft without lines", async () => {
    const draft = await createDraftInvoice(draftFor(acme))
    getDb().prepare('delete from invoice_items where invoice_id = ?').run(draft.id)

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result).toEqual({ status: 'invalid', message: 'An invoice needs at least one line' })
    expect(counter(2026)).toBeNull()
  })

  it('finalizes a reverse-charge invoice for an EU client', async () => {
    const beispiel = await createClient(beispielInput)
    const draft = await createDraftInvoice(reverseChargeDraft(beispiel))

    const result = await finalizeDraftInvoice(draft.id, NOW)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.invoice.client_snapshot).toEqual(beispielInput)
    expect(result.pdfModel.reverseCharge).not.toBeNull()
  })
})

describe('setInvoicePdfPath', () => {
  it('sets pdf_path and updated_at on a final invoice', async () => {
    const draft = await createDraftInvoice(draftFor(acme))
    await finalizeDraftInvoice(draft.id, NOW)

    expect(await setInvoicePdfPath(draft.id, 'invoices/2026/NEO-2026-0001.pdf')).toBe(true)

    const stored = await getInvoice(draft.id)
    expect(stored?.pdf_path).toBe('invoices/2026/NEO-2026-0001.pdf')
    expect(stored?.updated_at).not.toBe(NOW.toISOString())
  })

  it('returns false for an unknown id', async () => {
    expect(await setInvoicePdfPath(UNKNOWN_ID, 'x.pdf')).toBe(false)
  })
})
