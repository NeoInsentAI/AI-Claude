// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from './db'
import { createClient, type Client, type NewClient } from './clientsRepo'
import {
  createDraftInvoice,
  dashboardData,
  finalizeDraftInvoice,
  getInvoice,
  replaceDraftInvoice,
  setInvoicePaid,
  summaryForPeriod,
  type DraftInvoiceInput,
} from './invoicesRepo'

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-summary-'))
  process.env.NEOINSENT_DATA_DIR = tmpDir
  closeDb()
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

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

function draftFor(client: Client, items: DraftInvoiceInput['items'], overrides: Partial<DraftInvoiceInput> = {}) {
  return {
    client_id: client.id,
    language: 'nl',
    vat_treatment: 'nl_standard',
    issue_date: '2026-01-01',
    due_date: '2026-01-15',
    notes: null,
    service_period: null,
    vat_note: null,
    items,
    ...overrides,
  } satisfies DraftInvoiceInput
}

/** Creates a draft and finalizes it on `day` (local time), which becomes its issue date. */
async function issue(input: DraftInvoiceInput, day: Date): Promise<string> {
  const draft = await createDraftInvoice(input)
  const result = await finalizeDraftInvoice(draft.id, day)
  if (result.status !== 'ok') throw new Error(`finalize failed: ${result.status}`)
  return draft.id
}

const Q1_2026 = { fromDate: '2026-01-01', toDate: '2026-03-31' }

describe('summaryForPeriod', () => {
  let acme: Client
  let beispiel: Client

  beforeEach(async () => {
    acme = await createClient(acmeInput)
    beispiel = await createClient(beispielInput)
  })

  it('totals final invoices in the period to the cent, per VAT rate and per status', async () => {
    // A: NL, unpaid. 2 x 100.00 @21% = 200.00 + 42.00; 3 x 19.99 @9% = 59.97 + 5.40.
    // Subtotal 259.97, VAT 47.40, total 307.37.
    await issue(
      draftFor(acme, [
        { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
        { description: 'Books', quantity: 3, unit_price: 19.99, vat_rate: 9 },
      ]),
      new Date(2026, 1, 10, 9, 0),
    )
    // B: NL, paid. 1.5 x 6.67 @21% = 10.005 -> 10.01 + 2.10; 1 x 1000.00 @9% = 1000.00 + 90.00.
    // Subtotal 1010.01, VAT 92.10, total 1102.11.
    const b = await issue(
      draftFor(acme, [
        { description: 'Workshop', quantity: 1.5, unit_price: 6.67, vat_rate: 21 },
        { description: 'Training', quantity: 1, unit_price: 1000, vat_rate: 9 },
      ]),
      new Date(2026, 2, 31, 23, 30),
    )
    await setInvoicePaid(b, true)
    // C: EU reverse charge, unpaid. 8 x 125.00 @0% = 1000.00.
    await issue(
      draftFor(beispiel, [{ description: 'AI strategy', quantity: 8, unit_price: 125, vat_rate: 0 }], {
        language: 'en',
        vat_treatment: 'eu_reverse_charge',
      }),
      new Date(2026, 0, 1, 8, 0),
    )
    // Excluded: a draft dated inside the period, and a final invoice issued after it.
    await createDraftInvoice(
      draftFor(acme, [{ description: 'Draft', quantity: 1, unit_price: 500, vat_rate: 21 }], {
        issue_date: '2026-02-01',
        due_date: '2026-02-15',
      }),
    )
    await issue(
      draftFor(acme, [{ description: 'Later', quantity: 1, unit_price: 700, vat_rate: 21 }]),
      new Date(2026, 3, 1, 9, 0),
    )

    const summary = await summaryForPeriod(Q1_2026)

    expect(summary).toEqual({
      invoiceCount: 3,
      subtotal: 2269.98,
      vatAmount: 139.5,
      total: 2409.48,
      vatByRate: [
        { treatment: 'nl_standard', rate: 21, base: 210.01, vat: 44.1 },
        { treatment: 'nl_standard', rate: 9, base: 1059.97, vat: 95.4 },
        { treatment: 'eu_reverse_charge', rate: 0, base: 1000, vat: 0 },
      ],
      reverseChargeRevenue: 1000,
      unpaidCount: 2,
      unpaidTotal: 1307.37,
    })
    // The per-rate breakdown adds up to the invoices' own totals (compare in cents).
    const vatCents = summary.vatByRate.reduce((sum, r) => sum + Math.round(r.vat * 100), 0)
    const baseCents = summary.vatByRate.reduce((sum, r) => sum + Math.round(r.base * 100), 0)
    expect(vatCents).toBe(Math.round(summary.vatAmount * 100))
    expect(baseCents).toBe(Math.round(summary.subtotal * 100))
  })

  it('returns zeros and no rates for a period without final invoices', async () => {
    await createDraftInvoice(
      draftFor(acme, [{ description: 'Draft', quantity: 1, unit_price: 500, vat_rate: 21 }], {
        issue_date: '2026-02-01',
      }),
    )

    expect(await summaryForPeriod(Q1_2026)).toEqual({
      invoiceCount: 0,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      vatByRate: [],
      reverseChargeRevenue: 0,
      unpaidCount: 0,
      unpaidTotal: 0,
    })
  })

  it('keeps 0% reverse-charge lines apart from 0% domestic lines', async () => {
    await issue(
      draftFor(acme, [
        { description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 21 },
        { description: 'Exempt', quantity: 1, unit_price: 40, vat_rate: 0 },
      ], { vat_note: 'Vrijgesteld van btw' }),
      new Date(2026, 1, 10, 9, 0),
    )
    await issue(
      draftFor(beispiel, [{ description: 'AI strategy', quantity: 2, unit_price: 250, vat_rate: 0 }], {
        language: 'en',
        vat_treatment: 'eu_reverse_charge',
      }),
      new Date(2026, 1, 11, 9, 0),
    )

    const summary = await summaryForPeriod(Q1_2026)

    expect(summary.vatByRate).toEqual([
      { treatment: 'nl_standard', rate: 21, base: 100, vat: 21 },
      { treatment: 'nl_standard', rate: 0, base: 40, vat: 0 },
      { treatment: 'eu_reverse_charge', rate: 0, base: 500, vat: 0 },
    ])
    expect(summary.reverseChargeRevenue).toBe(500)
  })

  it('per-rate sums equal the stored totals of an invoice saved through the draft-replace path', async () => {
    const draft = await createDraftInvoice(
      draftFor(acme, [
        { description: 'A', quantity: 0.33, unit_price: 15.15, vat_rate: 21 },
        { description: 'B', quantity: 7, unit_price: 0.05, vat_rate: 21 },
        { description: 'C', quantity: 3, unit_price: 19.99, vat_rate: 9 },
      ]),
    )
    const replaced = await replaceDraftInvoice(
      draft.id,
      draftFor(acme, [
        { description: 'A', quantity: 0.33, unit_price: 15.15, vat_rate: 21 },
        { description: 'B', quantity: 7, unit_price: 0.05, vat_rate: 21 },
        { description: 'C', quantity: 3, unit_price: 19.99, vat_rate: 9 },
        { description: 'D', quantity: 1.5, unit_price: 6.67, vat_rate: 21 },
        { description: 'E', quantity: 0.07, unit_price: 3.33, vat_rate: 9 },
      ]),
    )
    expect(typeof replaced).toBe('object')
    const result = await finalizeDraftInvoice(draft.id, new Date(2026, 1, 10, 9, 0))
    expect(result.status).toBe('ok')
    const stored = await getInvoice(draft.id)

    const summary = await summaryForPeriod(Q1_2026)

    const vatCents = summary.vatByRate.reduce((sum, r) => sum + Math.round(r.vat * 100), 0)
    const baseCents = summary.vatByRate.reduce((sum, r) => sum + Math.round(r.base * 100), 0)
    expect(vatCents).toBe(Math.round(stored!.vat_amount * 100))
    expect(baseCents).toBe(Math.round(stored!.subtotal * 100))
    expect(summary.vatAmount).toBe(stored!.vat_amount)
    expect(summary.subtotal).toBe(stored!.subtotal)
    expect(summary.vatByRate.map((r) => r.rate)).toEqual([21, 9])
  })
})

describe('dashboardData', () => {
  let acme: Client
  let beispiel: Client

  beforeEach(async () => {
    acme = await createClient(acmeInput)
    beispiel = await createClient(beispielInput)
  })

  const YEAR_2026 = { fromDate: '2026-01-01', toDate: '2026-12-31', today: '2026-11-04' }

  it('lists every unpaid final invoice under outstanding, whatever the period', async () => {
    // 2024, unpaid: due 2024-05-15 (overdue).
    const old = await issue(
      draftFor(acme, [{ description: 'Old', quantity: 1, unit_price: 100, vat_rate: 21 }]),
      new Date(2024, 4, 1, 9, 0),
    )
    // 2025, paid: not outstanding.
    const paid = await issue(
      draftFor(acme, [{ description: 'Paid', quantity: 1, unit_price: 50, vat_rate: 21 }]),
      new Date(2025, 2, 1, 9, 0),
    )
    await setInvoicePaid(paid, true)
    // 2026, unpaid: due 2026-11-15 (not overdue on 2026-11-04).
    const recent = await issue(
      draftFor(beispiel, [{ description: 'Recent', quantity: 2, unit_price: 250, vat_rate: 0 }], {
        language: 'en',
        vat_treatment: 'eu_reverse_charge',
      }),
      new Date(2026, 10, 1, 9, 0),
    )
    // 2026, unpaid: due 2026-03-15 (overdue).
    const march = await issue(
      draftFor(acme, [{ description: 'March', quantity: 1, unit_price: 10, vat_rate: 9 }]),
      new Date(2026, 2, 1, 9, 0),
    )
    // A draft is never outstanding.
    await createDraftInvoice(draftFor(acme, [{ description: 'Draft', quantity: 1, unit_price: 1, vat_rate: 21 }]))

    const data = await dashboardData(YEAR_2026)

    expect(data.outstanding.invoices.map((i) => i.id)).toEqual([old, march, recent])
    expect(data.outstanding.invoices.map((i) => i.due_date)).toEqual(['2024-05-15', '2026-03-15', '2026-11-15'])
    expect(data.outstanding.count).toBe(3)
    expect(data.outstanding.total).toBe(631.9)
    expect(data.outstanding.overdueCount).toBe(2)
    // The period's own figures still only cover 2026.
    expect(data.summary.unpaidCount).toBe(2)
    expect(data.invoices.map((i) => i.id).sort()).toEqual([recent, march].sort())
    expect(data.drafts).toHaveLength(1)
    expect(data.firstYear).toBe(2024)
  })

  it('counts an invoice due today as not overdue', async () => {
    await issue(
      draftFor(acme, [{ description: 'Due today', quantity: 1, unit_price: 100, vat_rate: 21 }]),
      new Date(2026, 9, 21, 9, 0),
    )
    const data = await dashboardData(YEAR_2026)
    expect(data.outstanding.invoices[0].due_date).toBe('2026-11-04')
    expect(data.outstanding.overdueCount).toBe(0)
  })

  it('reports the earliest year with a final invoice, ignoring drafts', async () => {
    await createDraftInvoice(
      draftFor(acme, [{ description: 'Draft', quantity: 1, unit_price: 1, vat_rate: 21 }], {
        issue_date: '2015-01-01',
        due_date: '2015-01-15',
      }),
    )
    expect((await dashboardData(YEAR_2026)).firstYear).toBeNull()

    await issue(
      draftFor(acme, [{ description: 'Old', quantity: 1, unit_price: 100, vat_rate: 21 }]),
      new Date(2019, 5, 1, 9, 0),
    )
    await issue(
      draftFor(acme, [{ description: 'New', quantity: 1, unit_price: 100, vat_rate: 21 }]),
      new Date(2026, 5, 1, 9, 0),
    )
    expect((await dashboardData(YEAR_2026)).firstYear).toBe(2019)
  })

  it('returns an empty outstanding list and the same summary as summaryForPeriod', async () => {
    const data = await dashboardData(YEAR_2026)
    expect(data.outstanding).toEqual({ count: 0, total: 0, overdueCount: 0, invoices: [] })
    expect(data.summary).toEqual(await summaryForPeriod(YEAR_2026))
  })
})

