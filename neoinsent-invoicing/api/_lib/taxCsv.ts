import type { IcpRow, TaxInvoiceRow } from './invoicesRepo'
import type { InvoiceVatTreatment } from '../../src/lib/vat'
import { formatDate } from '../../src/lib/format'

// CSV files for Dutch Excel: `;` between fields, decimal comma, no thousands separator, dates
// DD-MM-YYYY, CRLF line endings, UTF-8 with a BOM (so Excel doesn't read it as Windows-1252).

const BOM = '﻿'
const SEPARATOR = ';'
const EOL = '\r\n'

const TREATMENT_LABELS: Record<InvoiceVatTreatment, string> = {
  nl_standard: 'Binnenland',
  eu_reverse_charge: 'Btw verlegd (EU)',
}

/** A field starting with one of these would be run as a formula by a spreadsheet. */
const FORMULA_START = /^[=+\-@]/
const NEEDS_QUOTES = /[;"\r\n]/

/** A text field: formula-neutralised with a leading `'`, then quoted if needed. */
function text(value: string | null): string {
  let field = value ?? ''
  if (FORMULA_START.test(field)) field = `'${field}`
  return NEEDS_QUOTES.test(field) ? `"${field.replace(/"/g, '""')}"` : field
}

/** An amount in euros as `1234,50`. */
function amount(euros: number): string {
  return (Math.round(euros * 100) / 100).toFixed(2).replace('.', ',')
}

function csv(header: string[], rows: string[][]): string {
  return BOM + [header, ...rows].map((fields) => fields.join(SEPARATOR) + EOL).join('')
}

/** The period's final invoices, one row each. */
export function invoicesCsv(rows: TaxInvoiceRow[]): string {
  return csv(
    [
      'Factuurnummer',
      'Factuurdatum',
      'Klant',
      'Land',
      'Btw-nummer klant',
      'Btw-behandeling',
      'Bedrag excl. btw',
      'Btw',
      'Totaal',
      'Betaald',
    ],
    rows.map((row) => [
      text(row.invoiceNumber),
      formatDate(row.issueDate),
      text(row.clientName),
      text(row.clientCountry),
      text(row.clientVatNumber),
      TREATMENT_LABELS[row.treatment],
      amount(row.subtotal),
      amount(row.vatAmount),
      amount(row.total),
      row.paid ? 'ja' : 'nee',
    ]),
  )
}

/** The ICP declaration: services per EU customer. */
export function icpCsv(rows: IcpRow[]): string {
  return csv(
    ['Land', 'Btw-nummer', 'Klant', 'Diensten (excl. btw)'],
    rows.map((row) => [text(row.country), text(row.vatNumber), text(row.clientName), amount(row.servicesTotal)]),
  )
}
