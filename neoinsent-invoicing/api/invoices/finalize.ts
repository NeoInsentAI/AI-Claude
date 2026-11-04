import type { Request, Response } from 'express'
import { finalizeDraftInvoice, getInvoice, setInvoicePdfPath } from '../_lib/invoicesRepo'
import { backupBeforeFinalize, pdfRelPath, writeInvoicePdf } from '../_lib/invoicePdfFiles'
import { isUuid } from '../_lib/uuid'

const DATABASE_ERROR = 'Database error — please try again'
const NOT_FOUND = 'Invoice not found'
const ALREADY_FINAL = 'This invoice is already finalized'
const BACKUP_FAILED = 'Could not back up the database, so the invoice was not finalized — please try again'
const PDF_ERROR =
  'The invoice was finalized, but its PDF could not be created yet — it will be retried when you open it.'

/**
 * POST /api/invoices/:id/finalize — issues a draft: backs up the database, then (in one
 * transaction) assigns the next gap-free invoice number, freezes the client snapshot and marks it
 * final (refusing a number whose PDF already exists, i.e. a database restored without its
 * invoices folder); then writes the PDF. A PDF failure after commit doesn't undo the (legally issued)
 * invoice: it is reported as `pdfError` and the PDF is re-created on demand later.
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

  // Cheap pre-check so a repeated click doesn't take a backup; finalize re-checks atomically.
  let current
  try {
    current = await getInvoice(id)
  } catch (error) {
    console.error('Failed to load invoice', error)
    res.status(500).json({ error: DATABASE_ERROR })
    return
  }
  if (!current) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (current.status === 'final') {
    res.status(409).json({ error: ALREADY_FINAL })
    return
  }

  // Never issue an invoice without a backup of the state just before it.
  try {
    backupBeforeFinalize()
  } catch (error) {
    console.error('Pre-finalize backup failed; invoice not finalized', error)
    res.status(500).json({ error: BACKUP_FAILED })
    return
  }

  let result
  try {
    result = await finalizeDraftInvoice(id)
  } catch (error) {
    console.error('Failed to finalize invoice', error)
    res.status(500).json({ error: DATABASE_ERROR })
    return
  }
  switch (result.status) {
    case 'not_found':
      res.status(404).json({ error: NOT_FOUND })
      return
    case 'locked':
      res.status(409).json({ error: ALREADY_FINAL })
      return
    case 'vat_mismatch':
    case 'number_conflict':
      res.status(409).json({ error: result.message })
      return
    case 'invalid':
      res.status(422).json({ error: result.message })
      return
  }

  // The invoice is issued from here on: nothing below may turn this into an error response.
  const { invoice, pdfModel } = result
  let pdfPath: string | null = null
  try {
    const relPath = pdfRelPath(invoice.invoice_number as string, invoice.issue_date)
    // Never overwrite: an existing file would be another invoice's PDF.
    await writeInvoicePdf(pdfModel, relPath, { overwrite: false })
    await setInvoicePdfPath(id, relPath)
    pdfPath = relPath
  } catch (error) {
    console.error(`Invoice ${invoice.invoice_number} was finalized but its PDF could not be written or recorded`, error)
  }

  let reloaded = null
  try {
    reloaded = await getInvoice(id)
  } catch (error) {
    console.error(`Invoice ${invoice.invoice_number} was finalized but could not be reloaded`, error)
  }
  const body = reloaded ?? { ...invoice, pdf_path: pdfPath }
  res.status(200).json(pdfPath ? { invoice: body } : { invoice: body, pdfError: PDF_ERROR })
}
