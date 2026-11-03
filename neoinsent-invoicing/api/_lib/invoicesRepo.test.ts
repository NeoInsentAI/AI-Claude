// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from './db'
import { createClient, updateClient, type Client, type NewClient } from './clientsRepo'
import {
  createDraftInvoice,
  getInvoice,
  listInvoices,
  replaceDraftInvoice,
  type DraftInvoiceInput,
} from './invoicesRepo'

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-invoices-'))
  process.env.NEOINSENT_DATA_DIR = tmpDir
  closeDb()
})

afterEach(() => {
  vi.useRealTimers()
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

const acmeInput: NewClient = {
  name: 'Acme BV',
  contact_person: null,
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
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
    items: [
      // 2 x 100.00 = 200.00, 21% VAT 42.00, line total 242.00
      { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
      // 3 x 19.99 = 59.97, 9% VAT 5.3973 -> 5.40, line total 65.37
      { description: 'Books', quantity: 3, unit_price: 19.99, vat_rate: 9 },
    ],
    ...overrides,
  }
}

/** Turns a draft into a final invoice directly in SQL (finalize doesn't exist yet). */
function finalizeInSql(id: string, client: Client): void {
  const { id: _id, created_at: _c, updated_at: _u, ...snapshot } = client
  getDb()
    .prepare(
      `update invoices set status = 'final', invoice_number = ?, client_snapshot = ?,
                           finalized_at = ?
       where id = ?`,
    )
    .run('2026-001', JSON.stringify(snapshot), '2026-11-03T10:00:00.000Z', id)
}

let acme: Client

beforeEach(async () => {
  acme = await createClient(acmeInput)
})

describe('createDraftInvoice', () => {
  it('stores exact totals for a mixed 21%/9% draft and returns the invoice', async () => {
    const invoice = await createDraftInvoice(draftFor(acme))

    expect(invoice).toMatchObject({
      client_id: acme.id,
      status: 'draft',
      invoice_number: null,
      subtotal: 259.97,
      vat_amount: 47.4,
      total: 307.37,
      paid: false,
      client_snapshot: null,
    })
  })

  it('round-trips totals, lines and the live client through getInvoice', async () => {
    const { id } = await createDraftInvoice(draftFor(acme, { notes: 'Thanks!' }))

    const invoice = await getInvoice(id)

    expect(invoice).toMatchObject({
      id,
      language: 'nl',
      vat_treatment: 'nl_standard',
      issue_date: '2026-11-02',
      due_date: '2026-11-16',
      notes: 'Thanks!',
      subtotal: 259.97,
      vat_amount: 47.4,
      total: 307.37,
      paid: false,
      client_snapshot: null,
      client: acme,
    })
    expect(invoice?.items).toEqual([
      expect.objectContaining({
        invoice_id: id,
        description: 'Consulting',
        quantity: 2,
        unit_price: 100,
        vat_rate: 21,
        line_total: 242,
        sort_order: 0,
      }),
      expect.objectContaining({
        invoice_id: id,
        description: 'Books',
        quantity: 3,
        unit_price: 19.99,
        vat_rate: 9,
        line_total: 65.37,
        sort_order: 1,
      }),
    ])
  })

  it('round-trips a fractional quantity', async () => {
    const { id } = await createDraftInvoice(
      draftFor(acme, {
        items: [{ description: 'Half day', quantity: 1.5, unit_price: 80, vat_rate: 21 }],
      }),
    )

    const invoice = await getInvoice(id)

    expect(invoice?.items[0]).toMatchObject({ quantity: 1.5, line_total: 145.2 })
    expect(invoice).toMatchObject({ subtotal: 120, vat_amount: 25.2, total: 145.2 })
  })

  it('stores nothing when an item insert fails', async () => {
    await expect(
      createDraftInvoice(
        draftFor(acme, {
          items: [
            { description: 'Fine', quantity: 1, unit_price: 10, vat_rate: 21 },
            { description: 'Bad rate', quantity: 1, unit_price: 10, vat_rate: 7 },
          ],
        }),
      ),
    ).rejects.toThrow()

    expect(await listInvoices()).toEqual([])
    expect(getDb().prepare('select count(*) as n from invoice_items').get()).toEqual({ n: 0 })
  })
})

describe('listInvoices', () => {
  it('returns summaries with the live client name, newest issue date first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T09:00:00Z'))
    const older = await createDraftInvoice(draftFor(acme, { issue_date: '2026-02-10' }))
    const sameDayFirst = await createDraftInvoice(draftFor(acme, { issue_date: '2026-03-31' }))
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'))
    const sameDaySecond = await createDraftInvoice(draftFor(acme, { issue_date: '2026-03-31' }))
    await updateClient(acme.id, { ...acmeInput, name: 'Acme Holding BV' })

    const invoices = await listInvoices()

    expect(invoices.map((i) => i.id)).toEqual([sameDaySecond.id, sameDayFirst.id, older.id])
    expect(invoices[0]).toEqual({
      id: sameDaySecond.id,
      invoice_number: null,
      client_id: acme.id,
      client_name: 'Acme Holding BV',
      status: 'draft',
      vat_treatment: 'nl_standard',
      issue_date: '2026-03-31',
      subtotal: 259.97,
      vat_amount: 47.4,
      total: 307.37,
      paid: false,
    })
  })

  it('filters by issue date, inclusive at both ends', async () => {
    const dates = ['2025-12-31', '2026-01-01', '2026-02-15', '2026-03-31', '2026-04-01']
    for (const issue_date of dates) await createDraftInvoice(draftFor(acme, { issue_date }))

    const q1 = await listInvoices({ fromDate: '2026-01-01', toDate: '2026-03-31' })
    expect(q1.map((i) => i.issue_date)).toEqual(['2026-03-31', '2026-02-15', '2026-01-01'])

    const from = await listInvoices({ fromDate: '2026-03-31' })
    expect(from.map((i) => i.issue_date)).toEqual(['2026-04-01', '2026-03-31'])

    const to = await listInvoices({ toDate: '2026-01-01' })
    expect(to.map((i) => i.issue_date)).toEqual(['2026-01-01', '2025-12-31'])
  })
})

describe('getInvoice', () => {
  it('returns null for an unknown id', async () => {
    expect(await getInvoice(UNKNOWN_ID)).toBeNull()
  })

  it('parses the client snapshot of a final invoice', async () => {
    const { id } = await createDraftInvoice(draftFor(acme))
    finalizeInSql(id, acme)

    const invoice = await getInvoice(id)

    expect(invoice).toMatchObject({ status: 'final', invoice_number: '2026-001' })
    expect(invoice?.client_snapshot).toEqual({
      name: 'Acme BV',
      contact_person: null,
      email: 'billing@acme.nl',
      address_line: 'Damrak 1',
      postal_code: '1012 LG',
      city: 'Amsterdam',
      country: 'NL',
      vat_number: 'NL123456789B01',
      kvk_number: null,
    })
  })
})

describe('replaceDraftInvoice', () => {
  it('replaces the fields, lines and totals of a draft', async () => {
    const created = await createDraftInvoice(draftFor(acme))
    const other = await createClient({ ...acmeInput, name: 'Other BV' })

    const result = await replaceDraftInvoice(
      created.id,
      draftFor(other, {
        language: 'en',
        issue_date: '2026-11-05',
        due_date: '2026-12-05',
        notes: 'Updated',
        items: [{ description: 'Workshop', quantity: 1.5, unit_price: 80, vat_rate: 21 }],
      }),
    )

    expect(result).not.toBe('not_found')
    expect(result).not.toBe('locked')
    const invoice = await getInvoice(created.id)
    expect(result).toEqual(invoice)
    expect(invoice).toMatchObject({
      client_id: other.id,
      client: { name: 'Other BV' },
      language: 'en',
      issue_date: '2026-11-05',
      due_date: '2026-12-05',
      notes: 'Updated',
      subtotal: 120,
      vat_amount: 25.2,
      total: 145.2,
      created_at: created.created_at,
      updated_at: expect.any(String),
    })
    expect(invoice?.items).toEqual([
      expect.objectContaining({
        description: 'Workshop',
        quantity: 1.5,
        unit_price: 80,
        line_total: 145.2,
        sort_order: 0,
      }),
    ])
  })

  it("returns 'not_found' for an unknown id", async () => {
    expect(await replaceDraftInvoice(UNKNOWN_ID, draftFor(acme))).toBe('not_found')
  })

  it("returns 'locked' for a final invoice and leaves it unchanged", async () => {
    const { id } = await createDraftInvoice(draftFor(acme))
    finalizeInSql(id, acme)
    const before = await getInvoice(id)

    const result = await replaceDraftInvoice(
      id,
      draftFor(acme, { items: [{ description: 'Sneaky', quantity: 1, unit_price: 1, vat_rate: 21 }] }),
    )

    expect(result).toBe('locked')
    expect(await getInvoice(id)).toEqual(before)
  })

  it('rolls back when a new line fails to insert, keeping the old lines and totals', async () => {
    const { id } = await createDraftInvoice(draftFor(acme))
    const before = await getInvoice(id)

    await expect(
      replaceDraftInvoice(
        id,
        draftFor(acme, {
          notes: 'Should not stick',
          items: [
            { description: 'Fine', quantity: 1, unit_price: 10, vat_rate: 21 },
            // Violates the vat_rate CHECK constraint after the first line went in.
            { description: 'Bad rate', quantity: 1, unit_price: 10, vat_rate: 7 },
          ],
        }),
      ),
    ).rejects.toThrow()

    expect(await getInvoice(id)).toEqual(before)
    expect(getDb().isTransaction).toBe(false)
  })
})
