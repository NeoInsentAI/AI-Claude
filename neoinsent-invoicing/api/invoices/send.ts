import path from 'node:path'
import type { Request, Response } from 'express'
import { defaultEmailForInvoice, invoiceRecipient } from '../_lib/invoiceEmail'
import { ensureInvoicePdf } from '../_lib/invoicePdfFiles'
import { getInvoice, markInvoiceSent } from '../_lib/invoicesRepo'
import { isEmailConfigured, MailerError, NOT_CONFIGURED_MESSAGE, sendInvoiceEmail } from '../_lib/mailer'
import { isUuid } from '../_lib/uuid'

export const NOT_FOUND = 'Invoice not found'
export const NOT_FINAL = 'Only finalized invoices can be emailed'
export const NO_RECIPIENT =
  "This invoice has no client email address to send it to. Download the PDF and send it yourself."
const DATABASE_ERROR = 'Database error — please try again'
const PDF_FAILED = 'The PDF could not be created — try again'

const SUBJECT_MAX = 200
const TEXT_MAX = 5000

type Field = { ok: true; value: string | undefined } | { ok: false; error: string }

/** An optional string field, trimmed; absent → undefined. Empty, too long or not a string → error. */
function optionalText(body: Record<string, unknown>, key: 'subject' | 'text', label: string, max: number): Field {
  if (!(key in body) || body[key] === undefined) return { ok: true, value: undefined }
  const raw = body[key]
  if (typeof raw !== 'string') return { ok: false, error: `${label} must be text` }
  const value = raw.trim()
  if (value === '') return { ok: false, error: `${label} can't be empty` }
  if (value.length > max) return { ok: false, error: `${label} can be at most ${max} characters` }
  return { ok: true, value }
}

type Overrides = { ok: true; subject?: string; text?: string } | { ok: false; error: string }

function parseBody(body: unknown): Overrides {
  if (body === undefined) return { ok: true }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Send a JSON object: { "subject"?: string, "text"?: string }' }
  }
  const fields = body as Record<string, unknown>
  const subject = optionalText(fields, 'subject', 'Subject', SUBJECT_MAX)
  if (!subject.ok) return subject
  // A subject is one header line: no line breaks.
  if (subject.value !== undefined && /[\r\n]/.test(subject.value)) {
    return { ok: false, error: 'Subject must be a single line' }
  }
  const text = optionalText(fields, 'text', 'Email text', TEXT_MAX)
  if (!text.ok) return text
  return { ok: true, subject: subject.value, text: text.value }
}

/**
 * POST /api/invoices/:id/send with `{ subject?, text? }` — emails a final invoice's PDF to the
 * client address frozen at finalize, from the Gmail mailbox, then records `sent_at`. Subject and
 * text default to the invoice-language template. Sending again is allowed (e.g. a reminder).
 */
export default async function handler(req: Request, res: Response) {
  const id = req.params?.id
  if (typeof id !== 'string' || !isUuid(id)) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const overrides = parseBody(req.body)
  if (!overrides.ok) {
    res.status(400).json({ error: overrides.error })
    return
  }

  let invoice
  try {
    invoice = await getInvoice(id)
  } catch (error) {
    console.error('Failed to load invoice for sending', error)
    res.status(500).json({ error: DATABASE_ERROR })
    return
  }
  if (!invoice) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (invoice.status !== 'final' || !invoice.invoice_number) {
    res.status(409).json({ error: NOT_FINAL })
    return
  }
  if (!isEmailConfigured()) {
    res.status(503).json({ error: NOT_CONFIGURED_MESSAGE })
    return
  }
  const to = invoiceRecipient(invoice)
  if (!to) {
    res.status(409).json({ error: NO_RECIPIENT })
    return
  }

  let pdfPath: string
  try {
    const pdf = await ensureInvoicePdf(id)
    if (pdf.status !== 'ok') throw new Error(`Unexpected PDF status ${pdf.status}`)
    pdfPath = pdf.path
  } catch (error) {
    console.error(`Could not create or find the PDF of invoice ${id}`, error)
    res.status(500).json({ error: PDF_FAILED })
    return
  }

  const defaults = defaultEmailForInvoice(invoice)
  try {
    await sendInvoiceEmail({
      to,
      subject: overrides.subject ?? defaults.subject,
      text: overrides.text ?? defaults.text,
      attachment: { filename: path.basename(pdfPath), path: pdfPath },
    })
  } catch (error) {
    if (error instanceof MailerError) {
      // logDetail has the password removed; never log the raw nodemailer error.
      console.error(`Could not email invoice ${invoice.invoice_number} (${error.kind})`, error.logDetail)
      res.status(error.kind === 'not_configured' ? 503 : 502).json({ error: error.message })
      return
    }
    console.error(`Could not email invoice ${invoice.invoice_number}`)
    res.status(502).json({ error: 'The email could not be sent — try again' })
    return
  }

  let updated
  try {
    updated = await markInvoiceSent(id, new Date())
  } catch (error) {
    console.error(`Invoice ${invoice.invoice_number} was emailed but sent_at could not be recorded`, error)
    updated = null
  }
  if (updated === null || typeof updated === 'string') {
    // The email did go out: say so plainly, so it isn't sent twice by mistake.
    res.status(500).json({
      error: `The email was sent to ${to}, but the app could not record it. Don't send it again.`,
    })
    return
  }
  res.status(200).json({ invoice: updated, sentTo: to })
}
