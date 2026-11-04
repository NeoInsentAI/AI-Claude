// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './db'
import { createClient, updateClient, type Client, type NewClient } from './clientsRepo'
import {
  createDraftInvoice,
  finalizeDraftInvoice,
  listInvoices,
  setInvoicePaid,
  taxReport,
  type DraftInvoiceInput,
} from './invoicesRepo'
import { TaxReportDataError } from './taxReportError'

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-tax-'))
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

const exempleInput: NewClient = {
  name: 'Exemple SARL',
  contact_person: null,
  email: 'compta@exemple.fr',
  address_line: '1 rue de Rivoli',
  postal_code: '75001',
  city: 'Paris',
  country: 'FR',
  vat_number: 'FR12345678901',
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

function reverseCharge(client: Client, items: DraftInvoiceInput['items']) {
  return draftFor(client, items, { language: 'en', vat_treatment: 'eu_reverse_charge' })
}

/** Creates a draft and finalizes it on `day` (local time), which becomes its issue date. */
async function issue(input: DraftInvoiceInput, day: Date): Promise<string> {
  const draft = await createDraftInvoice(input)
  const result = await finalizeDraftInvoice(draft.id, day)
  if (result.status !== 'ok') throw new Error(`finalize failed: ${result.status}`)
  return draft.id
}

const Q3_2026 = { fromDate: '2026-07-01', toDate: '2026-09-30' }

describe('taxReport', () => {
  let acme: Client
  let beispiel: Client
  let exemple: Client

  beforeEach(async () => {
    acme = await createClient(acmeInput)
    beispiel = await createClient(beispielInput)
    exemple = await createClient(exempleInput)
  })

  /** The scenario from the task: domestic 21/9/0% lines, three reverse-charge invoices, exclusions. */
  async function seed() {
    // A (NL): 2 x 100.00 @21% = 200.00 + 42.00; 3 x 19.99 @9% = 59.97 + 5.40; 1 x 50.00 @0%.
    const a = await issue(
      draftFor(acme, [
        { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
        { description: 'Books', quantity: 3, unit_price: 19.99, vat_rate: 9 },
        { description: 'Zero-rated item', quantity: 1, unit_price: 50, vat_rate: 0 },
      ]),
      new Date(2026, 6, 1, 0, 30),
    )
    // B (NL, paid): 1.5 x 6.67 @21% = 10.005 -> 10.01 + 2.10; 1 x 1000.00 @9% = 1000.00 + 90.00.
    const b = await issue(
      draftFor(acme, [
        { description: 'Workshop', quantity: 1.5, unit_price: 6.67, vat_rate: 21 },
        { description: 'Training', quantity: 1, unit_price: 1000, vat_rate: 9 },
      ]),
      new Date(2026, 7, 12, 10, 0),
    )
    await setInvoicePaid(b, true)
    // Reverse charge: FR first (to prove ordering is by country, not by date), then DE twice.
    await issue(reverseCharge(exemple, [{ description: 'Audit', quantity: 1, unit_price: 400, vat_rate: 0 }]), new Date(2026, 6, 2, 9, 0))
    await issue(
      reverseCharge(beispiel, [{ description: 'AI strategy', quantity: 8, unit_price: 125, vat_rate: 0 }]),
      new Date(2026, 6, 15, 9, 0),
    )
    await issue(
      reverseCharge(beispiel, [{ description: 'Follow-up', quantity: 2, unit_price: 333.33, vat_rate: 0 }]),
      new Date(2026, 8, 30, 23, 30),
    )
    // Excluded: a draft dated inside the period, and a final invoice issued after it.
    await createDraftInvoice(
      draftFor(acme, [{ description: 'Draft', quantity: 1, unit_price: 500, vat_rate: 21 }], {
        issue_date: '2026-08-01',
        due_date: '2026-08-15',
      }),
    )
    await issue(
      draftFor(acme, [{ description: 'Later', quantity: 1, unit_price: 700, vat_rate: 21 }]),
      new Date(2026, 9, 1, 9, 0),
    )
    return { a, b }
  }

  it('computes every BTW rubriek to the cent from final invoices in the period only', async () => {
    await seed()
    const report = await taxReport(Q3_2026)

    expect(report.btw).toEqual({
      r1a: { base: 210.01, vat: 44.1 },
      r1b: { base: 1059.97, vat: 95.4 },
      r1e: { base: 50 },
      r3b: { base: 2066.66 },
      vatDue: 139.5,
    })
  })

  it('makes the VAT due equal the sum of the period invoices’ own VAT', async () => {
    await seed()
    const report = await taxReport(Q3_2026)
    const invoices = await listInvoices({ ...Q3_2026, status: 'final' })
    const invoiceVatCents = invoices.reduce((sum, i) => sum + Math.round(i.vat_amount * 100), 0)
    expect(Math.round(report.btw.vatDue * 100)).toBe(invoiceVatCents)
    expect(invoices).toHaveLength(5)
  })

  it('lists ICP rows per country and VAT number, ordered by country then VAT number', async () => {
    await seed()
    const report = await taxReport(Q3_2026)
    expect(report.icp).toEqual([
      { country: 'DE', vatNumber: 'DE123456789', clientName: 'Beispiel GmbH', servicesTotal: 1666.66 },
      { country: 'FR', vatNumber: 'FR12345678901', clientName: 'Exemple SARL', servicesTotal: 400 },
    ])
  })

  it('lists the period’s final invoices for the CSV, oldest number first, from the snapshot', async () => {
    await seed()
    const report = await taxReport(Q3_2026)
    expect(report.invoices.map((i) => i.invoiceNumber)).toEqual([
      'NEO-2026-0001',
      'NEO-2026-0002',
      'NEO-2026-0003',
      'NEO-2026-0004',
      'NEO-2026-0005',
    ])
    expect(report.invoices[0]).toEqual({
      invoiceNumber: 'NEO-2026-0001',
      issueDate: '2026-07-01',
      clientName: 'Acme BV',
      clientCountry: 'NL',
      clientVatNumber: 'NL123456789B01',
      treatment: 'nl_standard',
      subtotal: 309.97,
      vatAmount: 47.4,
      total: 357.37,
      paid: false,
    })
    expect(report.invoices[1]).toMatchObject({ invoiceNumber: 'NEO-2026-0002', paid: true, vatAmount: 92.1 })
    expect(report.invoices[2]).toMatchObject({
      clientName: 'Exemple SARL',
      clientCountry: 'FR',
      clientVatNumber: 'FR12345678901',
      treatment: 'eu_reverse_charge',
      subtotal: 400,
      vatAmount: 0,
      total: 400,
    })
  })

  it('keeps the invoiced name when the client is renamed after finalizing', async () => {
    await issue(
      reverseCharge(beispiel, [{ description: 'AI strategy', quantity: 1, unit_price: 100, vat_rate: 0 }]),
      new Date(2026, 6, 15, 9, 0),
    )
    await updateClient(beispiel.id, { ...beispielInput, name: 'Beispiel AG' })

    const report = await taxReport(Q3_2026)
    expect(report.icp).toEqual([
      { country: 'DE', vatNumber: 'DE123456789', clientName: 'Beispiel GmbH', servicesTotal: 100 },
    ])
    expect(report.invoices[0].clientName).toBe('Beispiel GmbH')
  })

  it('uses the most recent invoice’s name when one VAT number was invoiced under two names', async () => {
    await issue(
      reverseCharge(beispiel, [{ description: 'One', quantity: 1, unit_price: 100, vat_rate: 0 }]),
      new Date(2026, 6, 15, 9, 0),
    )
    await updateClient(beispiel.id, { ...beispielInput, name: 'Beispiel AG' })
    await issue(
      reverseCharge(beispiel, [{ description: 'Two', quantity: 1, unit_price: 50, vat_rate: 0 }]),
      new Date(2026, 7, 1, 9, 0),
    )
    // Renamed back afterwards: the live name must not leak in either.
    await updateClient(beispiel.id, beispielInput)

    const report = await taxReport(Q3_2026)
    expect(report.icp).toEqual([
      { country: 'DE', vatNumber: 'DE123456789', clientName: 'Beispiel AG', servicesTotal: 150 },
    ])
  })

  it('returns zeros and empty lists for a period without final invoices', async () => {
    await createDraftInvoice(draftFor(acme, [{ description: 'Draft', quantity: 1, unit_price: 10, vat_rate: 21 }]))
    const report = await taxReport(Q3_2026)
    expect(report).toMatchObject({
      btw: { r1a: { base: 0, vat: 0 }, r1b: { base: 0, vat: 0 }, r1e: { base: 0 }, r3b: { base: 0 }, vatDue: 0 },
      icp: [],
      invoices: [],
    })
  })

  it('reports the earliest year with a final invoice (for the year picker)', async () => {
    expect((await taxReport(Q3_2026)).firstYear).toBeNull()
    await issue(draftFor(acme, [{ description: 'Old', quantity: 1, unit_price: 10, vat_rate: 21 }]), new Date(2024, 4, 1, 9, 0))
    expect((await taxReport(Q3_2026)).firstYear).toBe(2024)
  })

  it('reverse-charges a Greek client with an EL VAT number and lists it in the ICP as stored', async () => {
    const greek = await createClient({
      name: 'Paradeigma AE',
      contact_person: null,
      email: 'info@paradeigma.gr',
      address_line: 'Ermou 1',
      postal_code: '105 63',
      city: 'Athens',
      country: 'GR',
      vat_number: 'EL123456789',
      kvk_number: null,
    })
    await issue(reverseCharge(greek, [{ description: 'Advice', quantity: 1, unit_price: 250, vat_rate: 0 }]), new Date(2026, 6, 10, 9, 0))

    const report = await taxReport(Q3_2026)
    expect(report.btw.r3b).toEqual({ base: 250 })
    expect(report.icp).toEqual([
      { country: 'GR', vatNumber: 'EL123456789', clientName: 'Paradeigma AE', servicesTotal: 250 },
    ])
    expect(report.invoices[0]).toMatchObject({ clientCountry: 'GR', clientVatNumber: 'EL123456789', treatment: 'eu_reverse_charge' })
  })

  it('names the invoice and the rate when a line has an unexpected VAT rate', async () => {
    await issue(draftFor(acme, [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 21 }]), new Date(2026, 6, 1, 9, 0))
    // Only reachable through a damaged database: the schema's CHECK allows 0, 9 and 21, and a
    // trigger locks a final invoice's lines. Bypass both just for this update.
    const db = getDb()
    const trigger = db
      .prepare("select sql from sqlite_master where type = 'trigger' and name = 'invoice_items_final_no_update'")
      .get() as { sql: string }
    db.exec('drop trigger invoice_items_final_no_update')
    db.exec('PRAGMA ignore_check_constraints = ON')
    db.prepare('update invoice_items set vat_rate = 6').run()
    db.exec('PRAGMA ignore_check_constraints = OFF')
    db.exec(trigger.sql)

    await expect(taxReport(Q3_2026)).rejects.toThrow(
      'Invoice NEO-2026-0001 has a line at an unexpected VAT rate of 6%, so the tax records can’t be computed',
    )
    await expect(taxReport(Q3_2026)).rejects.toBeInstanceOf(TaxReportDataError)
  })
})
