import type { Request, Response } from 'express'
import { defaultEmailForInvoice, invoiceRecipient } from '../_lib/invoiceEmail'
import { NO_RECIPIENT, NOT_FINAL, NOT_FOUND } from '../_lib/invoiceEmailMessages'
import { getInvoice } from '../_lib/invoicesRepo'
import { isUuid } from '../_lib/uuid'

/**
 * GET /api/invoices/:id/email-preview — the address and the default subject/text the invoice
 * would be emailed with, so the UI can prefill an editable form.
 */
export default async function handler(req: Request, res: Response) {
  const id = req.params?.id
  if (typeof id !== 'string' || !isUuid(id)) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let invoice
  try {
    invoice = await getInvoice(id)
  } catch (error) {
    console.error('Failed to load invoice for the email preview', error)
    res.status(500).json({ error: 'Database error — please try again' })
    return
  }
  if (!invoice) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (invoice.status !== 'final') {
    res.status(409).json({ error: NOT_FINAL })
    return
  }
  const to = invoiceRecipient(invoice)
  if (!to) {
    res.status(409).json({ error: NO_RECIPIENT })
    return
  }
  res.status(200).json({ to, ...defaultEmailForInvoice(invoice) })
}
