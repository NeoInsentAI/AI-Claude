import { COMPANY, formatIban } from './company'
import type { ClientDetails } from '../../src/lib/clientForInvoice'
import { formatCurrency } from '../../src/lib/format'
import { computeLine } from '../../src/lib/invoiceMath'
import type { InvoiceVatTreatment } from '../../src/lib/vat'

/** Everything the invoice PDF needs, in euros as `getInvoice` returns them. */
export interface InvoicePdfInput {
  invoiceNumber: string
  language: 'nl' | 'en'
  vatTreatment: InvoiceVatTreatment
  /** YYYY-MM-DD */
  issueDate: string
  /** YYYY-MM-DD */
  dueDate: string
  notes: string | null
  /** For a final invoice this is the client snapshot (see clientForInvoice). */
  client: ClientDetails
  items: {
    description: string
    quantity: number
    unit_price: number
    vat_rate: number
    line_total: number
  }[]
  subtotal: number
  vatAmount: number
  total: number
}

export interface InvoicePdfLabels {
  title: string
  invoiceNumber: string
  billTo: string
  issueDate: string
  dueDate: string
  description: string
  quantity: string
  unitPrice: string
  vatRate: string
  amountExclVat: string
  subtotal: string
  vatTotal: string
  total: string
  notes: string
}

export interface InvoicePdfLine {
  description: string
  quantity: string
  /** Excl. VAT. */
  unitPrice: string
  vatRate: string
  amountExclVat: string
  amountInclVat: string
}

export interface InvoicePdfVatGroup {
  rate: number
  /** Taxable base in euros (summed in cents). */
  base: number
  /** VAT in euros (summed in cents). */
  vat: number
  /** e.g. "Btw 21% over € 1.000,00" */
  label: string
  /** Formatted VAT amount for this rate. */
  amount: string
}

export interface InvoicePdfModel {
  language: 'nl' | 'en'
  labels: InvoicePdfLabels
  invoiceNumber: string
  issueDate: string
  dueDate: string
  client: {
    name: string
    /** Contact person, address, country and registration numbers, one printed line each. */
    lines: string[]
  }
  lines: InvoicePdfLine[]
  vatBreakdown: InvoicePdfVatGroup[]
  totals: { subtotal: string; vatTotal: string; total: string }
  reverseCharge: { note: string; clientVatNumber: string } | null
  notes: string | null
  paymentLine: string
  /** Company details for the page footer, one printed line each. */
  footer: string[]
}

const LABELS: Record<'nl' | 'en', InvoicePdfLabels> = {
  nl: {
    title: 'FACTUUR',
    invoiceNumber: 'Factuurnummer',
    billTo: 'Factuur aan',
    issueDate: 'Factuurdatum',
    dueDate: 'Vervaldatum',
    description: 'Omschrijving',
    quantity: 'Aantal',
    unitPrice: 'Prijs excl. btw',
    vatRate: 'Btw',
    amountExclVat: 'Bedrag excl. btw',
    subtotal: 'Subtotaal excl. btw',
    vatTotal: 'Totaal btw',
    total: 'Totaal',
    notes: 'Opmerkingen',
  },
  en: {
    title: 'INVOICE',
    invoiceNumber: 'Invoice number',
    billTo: 'Bill to',
    issueDate: 'Invoice date',
    dueDate: 'Due date',
    description: 'Description',
    quantity: 'Qty',
    unitPrice: 'Unit price excl. VAT',
    vatRate: 'VAT',
    amountExclVat: 'Amount excl. VAT',
    subtotal: 'Subtotal excl. VAT',
    vatTotal: 'Total VAT',
    total: 'Total',
    notes: 'Notes',
  },
}

const TEXT = {
  nl: {
    attention: 'T.a.v.',
    clientVatNumber: 'Btw-nummer',
    clientKvkNumber: 'KVK-nummer',
    vatLine: (rate: number, base: string) => `Btw ${rate}% over ${base}`,
    reverseChargeNote: 'Btw verlegd naar de afnemer',
    reverseChargeClientVat: 'Btw-nummer afnemer',
    payment: (iban: string, invoiceNumber: string) =>
      `Gelieve binnen de betaaltermijn te betalen op IBAN ${iban} t.n.v. ${COMPANY.name} o.v.v. factuurnummer ${invoiceNumber}.`,
    companyKvk: 'KVK',
    companyVat: 'Btw-id',
    companyBranch: 'Vestigingsnummer',
  },
  en: {
    attention: 'Attn.',
    clientVatNumber: 'VAT number',
    clientKvkNumber: 'KVK number',
    vatLine: (rate: number, base: string) => `VAT ${rate}% on ${base}`,
    reverseChargeNote: 'VAT reverse-charged to the recipient (Article 196, EU VAT Directive)',
    reverseChargeClientVat: 'Recipient VAT number',
    payment: (iban: string, invoiceNumber: string) =>
      `Please pay by the due date to IBAN ${iban} in the name of ${COMPANY.name}, quoting invoice number ${invoiceNumber}.`,
    companyKvk: 'KVK (Chamber of Commerce)',
    companyVat: 'VAT',
    companyBranch: 'Branch no.',
  },
} as const

const QUANTITY_FORMAT = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 })

function toCents(euros: number): number {
  return Math.round(euros * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

/** "2026-11-02" → "02-11-2026". */
function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new Error(`Invalid invoice date: ${isoDate}`)
  return `${match[3]}-${match[2]}-${match[1]}`
}

function countryName(code: string, language: 'nl' | 'en'): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/**
 * Builds the printable content of an invoice. Pure: all money logic lives here (testable without
 * rendering); `invoicePdf.tsx` only lays it out.
 *
 * Line amounts use the same per-line rounding as `computeLine` (the rule the stored totals were
 * computed with). The VAT breakdown per rate is summed in integer cents, and must add up to the
 * stored subtotal and VAT — if not, the invoice data is inconsistent and this throws rather than
 * print an invoice whose numbers disagree.
 */
export function buildInvoicePdfModel(input: InvoicePdfInput): InvoicePdfModel {
  const { language } = input
  const text = TEXT[language]

  if (input.vatTreatment === 'eu_reverse_charge') {
    if (!input.client.vat_number?.trim()) {
      throw new Error(
        `Invoice ${input.invoiceNumber}: a reverse-charge invoice must show the client's VAT number, but the client has none`,
      )
    }
    const taxed = input.items.find((item) => item.vat_rate !== 0)
    if (taxed) {
      throw new Error(
        `Invoice ${input.invoiceNumber}: a reverse-charge invoice must have 0% VAT on every line, ` +
          `but "${taxed.description}" is at ${taxed.vat_rate}%`,
      )
    }
  }

  const groups = new Map<number, { baseCents: number; vatCents: number }>()
  const lines: InvoicePdfLine[] = input.items.map((item) => {
    const computed = computeLine({
      quantity: item.quantity,
      unitPrice: item.unit_price,
      vatRate: item.vat_rate,
    })
    const baseCents = toCents(computed.lineSubtotal)
    const vatCents = toCents(computed.lineVat)
    const group = groups.get(item.vat_rate) ?? { baseCents: 0, vatCents: 0 }
    group.baseCents += baseCents
    group.vatCents += vatCents
    groups.set(item.vat_rate, group)
    return {
      description: item.description,
      quantity: QUANTITY_FORMAT.format(item.quantity),
      unitPrice: formatCurrency(item.unit_price),
      vatRate: `${item.vat_rate}%`,
      amountExclVat: formatCurrency(fromCents(baseCents)),
      amountInclVat: formatCurrency(fromCents(baseCents + vatCents)),
    }
  })

  const vatBreakdown: InvoicePdfVatGroup[] = [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, { baseCents, vatCents }]) => ({
      rate,
      base: fromCents(baseCents),
      vat: fromCents(vatCents),
      label: text.vatLine(rate, formatCurrency(fromCents(baseCents))),
      amount: formatCurrency(fromCents(vatCents)),
    }))

  const baseSum = [...groups.values()].reduce((sum, g) => sum + g.baseCents, 0)
  const vatSum = [...groups.values()].reduce((sum, g) => sum + g.vatCents, 0)
  if (
    baseSum !== toCents(input.subtotal) ||
    vatSum !== toCents(input.vatAmount) ||
    baseSum + vatSum !== toCents(input.total)
  ) {
    throw new Error(
      `Invoice ${input.invoiceNumber}: stored totals (${input.subtotal} + ${input.vatAmount} = ${input.total}) ` +
        `do not match its lines (${fromCents(baseSum)} + ${fromCents(vatSum)})`,
    )
  }

  const { client } = input
  const clientLines: string[] = []
  if (client.contact_person) clientLines.push(`${text.attention} ${client.contact_person}`)
  clientLines.push(client.address_line)
  clientLines.push(`${client.postal_code} ${client.city}`)
  clientLines.push(countryName(client.country, language))
  if (client.vat_number) clientLines.push(`${text.clientVatNumber}: ${client.vat_number}`)
  if (client.kvk_number) clientLines.push(`${text.clientKvkNumber}: ${client.kvk_number}`)

  const reverseCharge =
    input.vatTreatment === 'eu_reverse_charge'
      ? {
          note: text.reverseChargeNote,
          clientVatNumber: `${text.reverseChargeClientVat}: ${client.vat_number}`,
        }
      : null

  const iban = formatIban(COMPANY.iban)
  const footer = [
    `${COMPANY.name} · ${COMPANY.addressLine}, ${COMPANY.postalCode} ${COMPANY.city} · ${COMPANY.email}`,
    `${text.companyKvk} ${COMPANY.kvkNumber} · ${text.companyVat} ${COMPANY.vatNumber} · ${text.companyBranch} ${COMPANY.branchNumber}`,
    `IBAN ${iban} · BIC ${COMPANY.bic}`,
  ]

  return {
    language,
    labels: LABELS[language],
    invoiceNumber: input.invoiceNumber,
    issueDate: formatDate(input.issueDate),
    dueDate: formatDate(input.dueDate),
    client: { name: client.name, lines: clientLines },
    lines,
    vatBreakdown,
    totals: {
      subtotal: formatCurrency(input.subtotal),
      vatTotal: formatCurrency(input.vatAmount),
      total: formatCurrency(input.total),
    },
    reverseCharge,
    notes: input.notes?.trim() ? input.notes : null,
    paymentLine: text.payment(iban, input.invoiceNumber),
    footer,
  }
}
