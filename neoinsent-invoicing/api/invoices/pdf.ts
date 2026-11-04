import path from 'node:path'
import type { Request, Response } from 'express'
import { getDataDir } from '../_lib/db'
import { ensureInvoicePdf } from '../_lib/invoicePdfFiles'
import { isUuid } from '../_lib/uuid'

const NOT_FOUND = 'Invoice not found'
const NOT_FINAL = 'Only finalized invoices have a PDF'
const PDF_FAILED = 'The PDF could not be created — try again'

/** Only plain file names go into Content-Disposition (invoice numbers always qualify). */
const SAFE_FILE_NAME = /^[A-Za-z0-9._-]+\.pdf$/

/**
 * GET /api/invoices/:id/pdf — the PDF of a final invoice, from the data folder. A PDF that was
 * never written (a failure right after finalize) or has gone missing is re-created first from
 * what was stored at finalize. Shown inline; `?download=1` serves it as a download instead.
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

  let result
  try {
    result = await ensureInvoicePdf(id)
  } catch (error) {
    console.error(`Could not create or find the PDF of invoice ${id}`, error)
    res.status(500).json({ error: PDF_FAILED })
    return
  }
  if (result.status === 'not_found') {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (result.status === 'not_final') {
    res.status(409).json({ error: NOT_FINAL })
    return
  }

  const dataDir = getDataDir()
  const fileName = path.basename(result.path)
  const disposition = req.query.download === '1' ? 'attachment' : 'inline'
  res.sendFile(
    path.relative(dataDir, result.path),
    {
      // `root` keeps send's dotfile check to the path inside the data folder.
      root: dataDir,
      cacheControl: false,
      lastModified: false,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        'Content-Disposition': `${disposition}; filename="${SAFE_FILE_NAME.test(fileName) ? fileName : 'invoice.pdf'}"`,
      },
    },
    (error) => {
      if (!error) return
      console.error(`Could not send the PDF of invoice ${id}`, error)
      if (!res.headersSent) res.status(500).json({ error: PDF_FAILED })
    },
  )
}
