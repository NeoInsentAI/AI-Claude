// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from './db'
import { createClient, type Client, type NewClient } from './clientsRepo'
import {
  createDraftInvoice,
  finalizeDraftInvoice,
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
        { rate: 21, base: 210.01, vat: 44.1 },
        { rate: 9, base: 1059.97, vat: 95.4 },
        { rate: 0, base: 1000, vat: 0 },
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
})
