import type { Request, Response } from 'express'
import { finalizeDraftInvoice, getInvoice, setInvoicePdfPath } from '../_lib/invoicesRepo'
import {
  backupBeforeFinalize,
  moveAsideConflictingPdf,
  pdfRelPath,
  writeInvoicePdf,
} from '../_lib/invoicePdfFiles'
import { isUuid } from '../_lib/uuid'
import { needsVatNote, VAT_NOTE_REQUIRED } from '../../src/lib/vat'

const DATABASE_ERROR = 'Database error — please try again'
const NOT_FOUND = 'Invoice not found'
const ALREADY_FINAL = 'This invoice is already finalized'
const BACKUP_FAILED = 'Could not back up the database, so the invoice was not finalized — please try again'
const PDF_ERROR =
  'The invoice was finalized, but its PDF could not be created yet — it will be retried when you open it.'
const pdfConflictWarning = (kept: string) =>
  `A different file was already saved under this invoice number and has been kept as ${kept}. ` +
  'Check that only one copy of NeoInsent uses this data folder.'

/**
 * POST /api/invoices/:id/finalize — issues a draft: backs up the database, then (in one
 * transaction) assigns the next gap-free invoice number, freezes the client snapshot and marks it
 * final (refusing a number whose PDF already exists, i.e. a database restored without its
 * invoices folder); then writes the PDF. A PDF failure after commit doesn't undo the (legally issued)
 * invoice: it is reported as `pdfError` and the PDF is re-created on demand later. A file that
 * appears at the new number's path in the meantime is never adopted as this invoice's PDF: it is
 * moved aside (kept as `<name>.conflict-…`), this invoice's PDF is written, and `pdfWarning` says so.
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
  // Also refused inside finalizeDraftInvoice; checked here too so no backup is taken for it.
  if (needsVatNote(current.vat_treatment, current.items.map((item) => item.vat_rate)) && !current.vat_note?.trim()) {
    res.status(422).json({ error: VAT_NOTE_REQUIRED })
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
  let pdfWarning: string | null = null
  try {
    const relPath = pdfRelPath(invoice.invoice_number as string, invoice.issue_date)
    try {
      // Never overwrite: an existing file would be another invoice's PDF.
      await writeInvoicePdf(pdfModel, relPath, { overwrite: false })
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error
      // The number-conflict scan passed before commit, so this file appeared afterwards: it is not
      // this invoice's PDF. Keep it under another name and put this invoice's PDF in its place.
      const kept = await moveAsideConflictingPdf(relPath, new Date())
      console.error(
        `CONFLICT: A different file was at ${relPath} after ${invoice.invoice_number} was issued — moved it to ${kept}. ` +
          'Two copies of the app or two databases may be sharing this data folder.',
      )
      pdfWarning = pdfConflictWarning(kept)
      await writeInvoicePdf(pdfModel, relPath, { overwrite: false })
    }
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
  if (!pdfPath) {
    res.status(200).json({ invoice: body, pdfError: PDF_ERROR })
    return
  }
  res.status(200).json(pdfWarning ? { invoice: body, pdfWarning } : { invoice: body })
}
