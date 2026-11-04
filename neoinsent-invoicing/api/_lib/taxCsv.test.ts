// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { icpCsv, invoicesCsv } from './taxCsv'
import type { IcpRow, TaxInvoiceRow } from './invoicesRepo'

const BOM = '﻿'

function invoice(overrides: Partial<TaxInvoiceRow> = {}): TaxInvoiceRow {
  return {
    invoiceNumber: 'NEO-2026-0001',
    issueDate: '2026-07-01',
    clientName: 'Acme BV',
    clientCountry: 'NL',
    clientVatNumber: 'NL123456789B01',
    treatment: 'nl_standard',
    subtotal: 1234.5,
    vatAmount: 259.25,
    total: 1493.75,
    paid: false,
    ...overrides,
  }
}

function icp(overrides: Partial<IcpRow> = {}): IcpRow {
  return { country: 'DE', vatNumber: 'DE123456789', clientName: 'Beispiel GmbH', servicesTotal: 1666.66, ...overrides }
}

/** The lines after the BOM, split on CRLF (the trailing CRLF leaves an empty last element). */
function lines(csv: string): string[] {
  return csv.slice(BOM.length).split('\r\n')
}

describe('invoicesCsv', () => {
  it('starts with a UTF-8 BOM and the Dutch header, separated by semicolons', () => {
    const csv = invoicesCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
    expect(lines(csv)).toEqual([
      'Factuurnummer;Factuurdatum;Klant;Land;Btw-nummer klant;Btw-behandeling;Bedrag excl. btw;Btw;Totaal;Betaald',
      '',
    ])
  })

  it('writes dates as DD-MM-YYYY, amounts with a decimal comma and no thousands separator', () => {
    expect(lines(invoicesCsv([invoice()]))[1]).toBe(
      'NEO-2026-0001;01-07-2026;Acme BV;NL;NL123456789B01;Binnenland;1234,50;259,25;1493,75;nee',
    )
  })

  it('names reverse charge, marks paid invoices and leaves a missing VAT number empty', () => {
    const row = invoice({
      treatment: 'eu_reverse_charge',
      clientCountry: 'DE',
      clientVatNumber: null,
      vatAmount: 0,
      subtotal: 1000000,
      total: 1000000,
      paid: true,
    })
    expect(lines(invoicesCsv([row]))[1]).toBe(
      'NEO-2026-0001;01-07-2026;Acme BV;DE;;Btw verlegd (EU);1000000,00;0,00;1000000,00;ja',
    )
  })

  it('ends every line, the last one included, with CRLF', () => {
    const csv = invoicesCsv([invoice(), invoice({ invoiceNumber: 'NEO-2026-0002' })])
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(lines(csv)).toHaveLength(4)
  })

  it('quotes fields containing a semicolon, a quote, CR or LF, doubling embedded quotes', () => {
    const cases: [string, string][] = [
      ['Smit; Zonen', '"Smit; Zonen"'],
      ['De "Beste" BV', '"De ""Beste"" BV"'],
      ['Line\nbreak', '"Line\nbreak"'],
      ['Carriage\rreturn', '"Carriage\rreturn"'],
    ]
    for (const [name, expected] of cases) {
      const csv = invoicesCsv([invoice({ clientName: name })])
      expect(csv).toContain(`;01-07-2026;${expected};NL;`)
    }
  })

  it('neutralises spreadsheet formulas in text fields with a leading apostrophe', () => {
    for (const name of ['=SUM(A1)', '+31 Trading', '-minus', '@cmd', '\t=1+1']) {
      expect(invoicesCsv([invoice({ clientName: name })])).toContain(`;'${name};NL;`)
    }
    // A leading carriage return is neutralised too, and then quoted (it contains CR).
    expect(invoicesCsv([invoice({ clientName: '\r=1+1' })])).toContain(`;"'\r=1+1";NL;`)
    // Quoting still applies after the prefix.
    expect(invoicesCsv([invoice({ clientName: '=1;2' })])).toContain(`;"'=1;2";NL;`)
  })

  it('does not prefix amounts (they are numbers, not text)', () => {
    const row = lines(invoicesCsv([invoice({ subtotal: 0, vatAmount: 0, total: 0 })]))[1]
    expect(row.endsWith(';0,00;0,00;0,00;nee')).toBe(true)
  })

  it('writes exactly two decimals without floating point artefacts', () => {
    const row = lines(invoicesCsv([invoice({ subtotal: 0.1 + 0.2, vatAmount: 7, total: 7.3 })]))[1]
    expect(row).toContain(';0,30;7,00;7,30;')
  })
})

describe('icpCsv', () => {
  it('writes the BOM, the Dutch header and one row per customer, with the VAT country code apart', () => {
    const csv = icpCsv([icp(), icp({ country: 'FR', vatNumber: 'FR12345678901', clientName: 'Exemple SARL', servicesTotal: 400 })])
    expect(csv.startsWith(BOM)).toBe(true)
    expect(lines(csv)).toEqual([
      'Landcode btw-nummer;Btw-nummer (zonder landcode);Klant;Diensten (excl. btw)',
      'DE;123456789;Beispiel GmbH;1666,66',
      'FR;12345678901;Exemple SARL;400,00',
      '',
    ])
  })

  it('uses the VAT number prefix EL for a Greek customer (country GR)', () => {
    expect(lines(icpCsv([icp({ country: 'GR', vatNumber: 'EL123456789', clientName: 'Etaireia AE' })]))[1]).toBe(
      'EL;123456789;Etaireia AE;1666,66',
    )
  })

  it('falls back to the country VAT prefix when the stored number has none', () => {
    expect(lines(icpCsv([icp({ country: 'GR', vatNumber: '123456789' })]))[1]).toBe(
      'EL;123456789;Beispiel GmbH;1666,66',
    )
  })

  it('quotes and neutralises the client name like the invoices CSV', () => {
    expect(lines(icpCsv([icp({ clientName: '=HYPERLINK("x")' })]))[1]).toBe(
      'DE;123456789;"\'=HYPERLINK(""x"")";1666,66',
    )
  })
})
