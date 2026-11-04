import { COMPANY, formatIban } from './company'
import { clientForInvoice } from '../../src/lib/clientForInvoice'
import { formatCurrency } from '../../src/lib/format'
import type { InvoiceWithDetails } from './invoicesRepo'

// The default subject and body of the email that sends a finalized invoice. Pure: no I/O.

export interface InvoiceEmailInput {
  language: 'nl' | 'en'
  invoiceNumber: string
  /** The invoice total in euros. */
  total: number
  /** ISO date, e.g. "2026-12-02". */
  dueDate: string
  clientName: string
  contactPerson: string | null
}

export interface InvoiceEmailContent {
  subject: string
  text: string
}

/** "2026-12-02" → "02-12-2026" (anything else is returned unchanged). */
function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : isoDate
}

export function defaultInvoiceEmail(input: InvoiceEmailInput): InvoiceEmailContent {
  const name = input.contactPerson?.trim() || input.clientName
  const number = input.invoiceNumber
  const amount = formatCurrency(input.total)
  const due = formatDate(input.dueDate)
  const iban = formatIban(COMPANY.iban)
  const signature = `${COMPANY.contactPerson}\n${COMPANY.name}`

  if (input.language === 'nl') {
    return {
      subject: `Factuur ${number} — ${COMPANY.name}`,
      text: [
        `Beste ${name},`,
        `Hierbij ontvangt u factuur ${number} van ${COMPANY.name}. De factuur vindt u als pdf in de bijlage.`,
        `Bedrag: ${amount}\nVervaldatum: ${due}`,
        `Wilt u het bedrag vóór de vervaldatum overmaken naar IBAN ${iban} t.n.v. ${COMPANY.name}, o.v.v. ${number}?`,
        `Met vriendelijke groet,\n${signature}`,
      ].join('\n\n'),
    }
  }
  return {
    subject: `Invoice ${number} — ${COMPANY.name}`,
    text: [
      `Dear ${name},`,
      `Please find attached invoice ${number} from ${COMPANY.name} (PDF).`,
      `Amount: ${amount}\nDue date: ${due}`,
      `Please transfer the amount by the due date to IBAN ${iban} (BIC ${COMPANY.bic}) in the name of ${COMPANY.name}, quoting ${number}.`,
      `Kind regards,\n${signature}`,
    ].join('\n\n'),
  }
}

/**
 * The address a final invoice is emailed to: the client's email as frozen in the snapshot at
 * finalize — never the live client, which may have been edited since. Null if there is none.
 */
export function invoiceRecipient(invoice: {
  status: 'draft' | 'final'
  client_snapshot: { email: string } | null
  client: { email: string } | null
}): string | null {
  if (invoice.status !== 'final') return null
  const email = invoice.client_snapshot?.email?.trim()
  return email ? email : null
}

/** The default email for a stored final invoice (client name and contact from its snapshot). */
export function defaultEmailForInvoice(
  invoice: Pick<InvoiceWithDetails, 'status' | 'language' | 'invoice_number' | 'total' | 'due_date' | 'client' | 'client_snapshot'>,
): InvoiceEmailContent {
  const client = clientForInvoice(invoice)
  return defaultInvoiceEmail({
    language: invoice.language,
    invoiceNumber: invoice.invoice_number ?? '',
    total: invoice.total,
    dueDate: invoice.due_date,
    clientName: client?.name ?? '',
    contactPerson: client?.contact_person ?? null,
  })
}
