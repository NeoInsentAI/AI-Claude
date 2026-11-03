// @vitest-environment node
//
// Plain Node environment (not the project-wide jsdom): @react-pdf/renderer resolves a
// browser-targeted build when a `window` global exists, which breaks server-side rendering.
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOGO_PATH, renderInvoicePdf } from './invoicePdf'
import { buildInvoicePdfModel, type InvoicePdfInput } from './invoicePdfModel'

const NL_INPUT: InvoicePdfInput = {
  invoiceNumber: 'NEO-2026-0001',
  language: 'nl',
  vatTreatment: 'nl_standard',
  issueDate: '2026-11-02',
  dueDate: '2026-11-16',
  notes: 'Bedankt voor de prettige samenwerking.',
  client: {
    name: 'Acme BV',
    contact_person: 'Jan de Vries',
    email: 'jan@acme.nl',
    address_line: 'Hoofdstraat 1',
    postal_code: '1000AA',
    city: 'Amsterdam',
    country: 'NL',
    vat_number: null,
    kvk_number: '12345678',
  },
  items: [
    { description: 'Consultancy', quantity: 10, unit_price: 100, vat_rate: 21, line_total: 1210 },
    { description: 'Boek', quantity: 3, unit_price: 19.99, vat_rate: 9, line_total: 65.37 },
  ],
  subtotal: 1059.97,
  vatAmount: 215.4,
  total: 1275.37,
}

const EN_RC_INPUT: InvoicePdfInput = {
  invoiceNumber: 'NEO-2026-0002',
  language: 'en',
  vatTreatment: 'eu_reverse_charge',
  issueDate: '2026-11-02',
  dueDate: '2026-12-02',
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
  items: [{ description: 'AI strategy', quantity: 8, unit_price: 125, vat_rate: 0, line_total: 1000 }],
  subtotal: 1000,
  vatAmount: 0,
  total: 1000,
}

function expectPdf(buffer: Buffer) {
  expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF')
  expect(buffer.length).toBeGreaterThan(1000)
}

function pageCount(buffer: Buffer): number {
  return buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

describe('renderInvoicePdf', () => {
  it('ships with the logo next to the module', async () => {
    const { existsSync } = await import('node:fs')
    expect(existsSync(DEFAULT_LOGO_PATH)).toBe(true)
  })

  it('renders a valid PDF for an NL-standard, Dutch-language invoice', async () => {
    expectPdf(await renderInvoicePdf(buildInvoicePdfModel(NL_INPUT)))
  })

  it('renders a valid PDF for an EU reverse-charge, English-language invoice', async () => {
    expectPdf(await renderInvoicePdf(buildInvoicePdfModel(EN_RC_INPUT)))
  })

  it('renders 60 lines with long descriptions across several pages', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      description:
        i % 5 === 0
          ? `Line ${i + 1}: a long description that has to wrap onto more than one line in the description column of the table`
          : `Line ${i + 1}`,
      quantity: 1,
      unit_price: 10,
      vat_rate: 21,
      line_total: 12.1,
    }))
    const buffer = await renderInvoicePdf(
      buildInvoicePdfModel({ ...NL_INPUT, items, subtotal: 600, vatAmount: 126, total: 726 }),
    )
    expectPdf(buffer)
    expect(pageCount(buffer)).toBeGreaterThan(1)
  }, 30_000)

  it('renders without the logo when the logo file is missing', async () => {
    const buffer = await renderInvoicePdf(buildInvoicePdfModel(NL_INPUT), {
      logoPath: '/nonexistent/neoinsent-logo.png',
    })
    expectPdf(buffer)
  })
})
