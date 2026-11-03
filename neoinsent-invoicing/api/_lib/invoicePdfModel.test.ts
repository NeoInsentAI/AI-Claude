import { describe, expect, it } from 'vitest'
import { buildInvoicePdfModel, type InvoicePdfInput } from './invoicePdfModel'
import { COMPANY } from './company'

const NL_CLIENT = {
  name: 'Acme BV',
  contact_person: 'Jan de Vries',
  email: 'jan@acme.nl',
  address_line: 'Hoofdstraat 1',
  postal_code: '1000AA',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: null,
  kvk_number: '12345678',
}

// 21%: 10 × 100 = 1000.00 → VAT 210.00; 2.5 × 33.34 = 83.35 → VAT 17.5035 → 17.50
// 9%: 3 × 19.99 = 59.97 → VAT 5.3973 → 5.40
const NL_INPUT: InvoicePdfInput = {
  invoiceNumber: 'NEO-2026-0001',
  language: 'nl',
  vatTreatment: 'nl_standard',
  issueDate: '2026-11-02',
  dueDate: '2026-11-16',
  notes: 'Bedankt!',
  client: NL_CLIENT,
  items: [
    { description: 'Consultancy', quantity: 10, unit_price: 100, vat_rate: 21, line_total: 1210 },
    { description: 'Workshop', quantity: 2.5, unit_price: 33.34, vat_rate: 21, line_total: 100.85 },
    { description: 'Boek', quantity: 3, unit_price: 19.99, vat_rate: 9, line_total: 65.37 },
  ],
  subtotal: 1143.32,
  vatAmount: 232.9,
  total: 1376.22,
}

const EN_RC_INPUT: InvoicePdfInput = {
  invoiceNumber: 'NEO-2026-0002',
  language: 'en',
  vatTreatment: 'eu_reverse_charge',
  issueDate: '2026-01-05',
  dueDate: '2026-02-04',
  notes: null,
  client: {
    name: 'Beispiel GmbH',
    contact_person: null,
    email: 'ap@beispiel.de',
    address_line: 'Hauptstraße 5',
    postal_code: '10115',
    city: 'Berlin',
    country: 'DE',
    vat_number: 'DE123456789',
    kvk_number: null,
  },
  items: [
    { description: 'AI strategy', quantity: 8, unit_price: 125, vat_rate: 0, line_total: 1000 },
    { description: 'Report', quantity: 1, unit_price: 250, vat_rate: 0, line_total: 250 },
  ],
  subtotal: 1250,
  vatAmount: 0,
  total: 1250,
}

describe('buildInvoicePdfModel', () => {
  it('breaks VAT down per rate in cents, and the breakdown adds up to the invoice VAT', () => {
    const model = buildInvoicePdfModel(NL_INPUT)
    expect(model.vatBreakdown.map((b) => ({ rate: b.rate, base: b.base, vat: b.vat }))).toEqual([
      { rate: 21, base: 1083.35, vat: 227.5 },
      { rate: 9, base: 59.97, vat: 5.4 },
    ])
    const vatCents = model.vatBreakdown.reduce((sum, b) => sum + Math.round(b.vat * 100), 0)
    expect(vatCents).toBe(Math.round(NL_INPUT.vatAmount * 100))
    const baseCents = model.vatBreakdown.reduce((sum, b) => sum + Math.round(b.base * 100), 0)
    expect(baseCents).toBe(Math.round(NL_INPUT.subtotal * 100))
  })

  it('formats lines: Dutch quantities, prices excl. VAT, rate, amounts excl. and incl. VAT', () => {
    const model = buildInvoicePdfModel(NL_INPUT)
    expect(model.lines[1]).toMatchObject({
      description: 'Workshop',
      quantity: '2,5',
      vatRate: '21%',
    })
    expect(model.lines[1].unitPrice).toMatch(/^€\s33,34$/)
    expect(model.lines[1].amountExclVat).toMatch(/^€\s83,35$/)
    expect(model.lines[1].amountInclVat).toMatch(/^€\s100,85$/)
    expect(model.lines[0].amountExclVat).toMatch(/1\.000,00/)
    expect(model.lines[2].vatRate).toBe('9%')
  })

  it('formats totals and VAT lines with Dutch currency formatting', () => {
    const model = buildInvoicePdfModel(NL_INPUT)
    expect(model.totals.subtotal).toMatch(/1\.143,32/)
    expect(model.totals.vatTotal).toMatch(/232,90/)
    expect(model.totals.total).toMatch(/1\.376,22/)
    expect(model.vatBreakdown[0].label).toMatch(/^Btw 21% over €\s1\.083,35$/)
  })

  it('formats dates as DD-MM-YYYY', () => {
    const model = buildInvoicePdfModel(NL_INPUT)
    expect(model.issueDate).toBe('02-11-2026')
    expect(model.dueDate).toBe('16-11-2026')
  })

  it('uses Dutch labels for a Dutch invoice and English labels for an English one', () => {
    const nl = buildInvoicePdfModel(NL_INPUT)
    const en = buildInvoicePdfModel(EN_RC_INPUT)
    expect(nl.labels.title).toBe('FACTUUR')
    expect(nl.labels.billTo).toBe('Factuur aan')
    expect(nl.labels.issueDate).toBe('Factuurdatum')
    expect(en.labels.title).toBe('INVOICE')
    expect(en.labels.billTo).toBe('Bill to')
    expect(en.labels.issueDate).toBe('Invoice date')
  })

  it('prints the client block with contact person, address, country and registration numbers', () => {
    const nl = buildInvoicePdfModel(NL_INPUT)
    expect(nl.client.name).toBe('Acme BV')
    expect(nl.client.lines).toEqual([
      'T.a.v. Jan de Vries',
      'Hoofdstraat 1',
      '1000AA Amsterdam',
      'Nederland',
      'KVK-nummer: 12345678',
    ])
    const en = buildInvoicePdfModel(EN_RC_INPUT)
    expect(en.client.lines).toEqual([
      'Hauptstraße 5',
      '10115 Berlin',
      'Germany',
      'VAT number: DE123456789',
    ])
  })

  it('adds the reverse-charge note, the client VAT number and a single 0% rate on an EU invoice', () => {
    const model = buildInvoicePdfModel(EN_RC_INPUT)
    expect(model.reverseCharge).toEqual({
      note: 'VAT reverse-charged to the recipient (Article 196, EU VAT Directive)',
      clientVatNumber: 'Recipient VAT number: DE123456789',
    })
    expect(model.vatBreakdown.map((b) => ({ rate: b.rate, base: b.base, vat: b.vat }))).toEqual([
      { rate: 0, base: 1250, vat: 0 },
    ])
  })

  it('uses the Dutch reverse-charge note on a Dutch-language reverse-charge invoice', () => {
    const model = buildInvoicePdfModel({ ...EN_RC_INPUT, language: 'nl' })
    expect(model.reverseCharge?.note).toBe('Btw verlegd naar de afnemer')
    expect(model.reverseCharge?.clientVatNumber).toBe('Btw-nummer afnemer: DE123456789')
  })

  it('has no reverse-charge note on a standard Dutch invoice', () => {
    expect(buildInvoicePdfModel(NL_INPUT).reverseCharge).toBeNull()
  })

  it('builds the payment line with the IBAN and invoice number in the chosen language', () => {
    expect(buildInvoicePdfModel(NL_INPUT).paymentLine).toBe(
      'Gelieve binnen de betaaltermijn te betalen op IBAN NL62 BUNQ 2202 5896 86 t.n.v. NeoInsent AI o.v.v. factuurnummer NEO-2026-0001.',
    )
    expect(buildInvoicePdfModel(EN_RC_INPUT).paymentLine).toBe(
      'Please pay by the due date to IBAN NL62 BUNQ 2202 5896 86 in the name of NeoInsent AI, quoting invoice number NEO-2026-0002.',
    )
  })

  it('puts the company registration details in the footer', () => {
    const footer = buildInvoicePdfModel(NL_INPUT).footer.join(' ')
    for (const value of [
      COMPANY.name,
      COMPANY.kvkNumber,
      COMPANY.vatNumber,
      COMPANY.branchNumber,
      'NL62 BUNQ 2202 5896 86',
      COMPANY.bic,
      COMPANY.email,
      'Wagenlaan',
    ]) {
      expect(footer).toContain(value)
    }
  })

  it('never contains an OB-nummer', () => {
    for (const input of [NL_INPUT, EN_RC_INPUT]) {
      const json = JSON.stringify(buildInvoicePdfModel(input))
      expect(json).not.toMatch(/OB-nummer|omzetbelastingnummer|OB number/i)
    }
  })

  it('refuses to build a model whose stored totals do not match its lines', () => {
    expect(() => buildInvoicePdfModel({ ...NL_INPUT, vatAmount: 233 })).toThrow(/totals/i)
  })

  it('rejects malformed dates', () => {
    expect(() => buildInvoicePdfModel({ ...NL_INPUT, issueDate: '2/11/2026' })).toThrow(/date/i)
  })
})
