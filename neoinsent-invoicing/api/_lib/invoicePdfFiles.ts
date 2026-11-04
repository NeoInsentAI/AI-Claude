import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { backupDb, fileTimestamp, getDataDir, getDb, mkdirPrivate } from './db'
import { getInvoice, setInvoicePdfPath } from './invoicesRepo'
import { renderInvoicePdf } from './invoicePdf'
import { buildInvoicePdfModel, pdfInputForStoredInvoice, type InvoicePdfModel } from './invoicePdfModel'

// Finalized invoice PDFs live in the data folder at invoices/<issue year>/<invoice number>.pdf.
// The database stores that path relative to the data folder, so the folder can be moved.

const INVOICE_NUMBER = /^NEO-\d{4}-\d{4,}$/
const ISO_DATE = /^(\d{4})-\d{2}-\d{2}$/

/** `invoices/<year of issue>/<invoiceNumber>.pdf`, relative to the data folder. */
export function pdfRelPath(invoiceNumber: string, issueDate: string): string {
  if (!INVOICE_NUMBER.test(invoiceNumber)) throw new Error(`Not an invoice number: ${invoiceNumber}`)
  const match = ISO_DATE.exec(issueDate)
  if (!match) throw new Error(`Not an issue date: ${issueDate}`)
  return `invoices/${match[1]}/${invoiceNumber}.pdf`
}

/** The absolute path of a data-folder-relative path; refuses paths that escape the folder. */
function resolveInDataDir(relPath: string): string {
  const dataDir = getDataDir()
  const abs = path.resolve(dataDir, relPath)
  const rel = path.relative(dataDir, abs)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path is outside the data folder: ${relPath}`)
  }
  return abs
}

/**
 * Renders the invoice and writes it to `relPath` (relative to the data folder): first to a
 * temporary file in the same folder, then renamed into place, so the PDF is either complete or
 * absent — never half-written. Folders are created owner-only. Returns the absolute path.
 */
export async function writeInvoicePdf(model: InvoicePdfModel, relPath: string): Promise<string> {
  const abs = resolveInDataDir(relPath)
  const buffer = await renderInvoicePdf(model)
  mkdirPrivate(path.dirname(abs))
  const tmp = `${abs}.${randomUUID()}.tmp`
  try {
    await fs.promises.writeFile(tmp, buffer, { mode: 0o600, flag: 'wx' })
    await fs.promises.rename(tmp, abs)
  } catch (error) {
    await fs.promises.rm(tmp, { force: true })
    throw error
  }
  return abs
}

export type EnsurePdfResult =
  | { status: 'not_found' }
  | { status: 'not_final' }
  | { status: 'ok'; path: string }

/**
 * The absolute path of a final invoice's PDF, writing it first if it was never written (a failed
 * write right after finalize) or the file has gone missing. A re-render uses only what was stored
 * at finalize — number, amounts, lines and the client snapshot — never the live client.
 */
export async function ensureInvoicePdf(id: string): Promise<EnsurePdfResult> {
  const invoice = await getInvoice(id)
  if (!invoice) return { status: 'not_found' }
  if (invoice.status !== 'final' || !invoice.invoice_number) return { status: 'not_final' }

  if (invoice.pdf_path) {
    const existing = resolveInDataDir(invoice.pdf_path)
    if (fs.existsSync(existing)) return { status: 'ok', path: existing }
  }
  const relPath = pdfRelPath(invoice.invoice_number, invoice.issue_date)
  const model = buildInvoicePdfModel(pdfInputForStoredInvoice(invoice))
  const abs = await writeInvoicePdf(model, relPath)
  await setInvoicePdfPath(id, relPath)
  return { status: 'ok', path: abs }
}

const PRE_FINALIZE_FILE = /^pre-finalize-(\d{8}-\d{6})(?:-(\d+))?\.db$/
const PRE_FINALIZE_KEEP = 20

/** Sort key: the timestamp, then the same-second suffix (none = 1, then -2, -3, …). */
function preFinalizeOrder(file: string): [string, number] {
  const match = PRE_FINALIZE_FILE.exec(file) as RegExpExecArray
  return [match[1], match[2] ? Number(match[2]) : 1]
}

/**
 * Copies the database to `<dataDir>/backups/pre-finalize-YYYYMMDD-HHmmss.db` (a `-2`, `-3`, …
 * suffix if that exists) and keeps only the newest 20 such copies. Runs before every finalize, so
 * the state just before an invoice was issued can always be recovered. Must not be called inside
 * a transaction (VACUUM INTO can't run in one). These names never match the daily-backup pattern,
 * so rotateBackups leaves them alone (and this leaves the daily backups alone). Returns the path.
 */
export function backupBeforeFinalize(now: Date = new Date()): string {
  const dir = path.join(getDataDir(), 'backups')
  mkdirPrivate(dir)
  const base = `pre-finalize-${fileTimestamp(now)}`
  let dest = path.join(dir, `${base}.db`)
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(dir, `${base}-${i}.db`)
  backupDb(getDb(), dest)

  const backups = fs
    .readdirSync(dir)
    .filter((f) => PRE_FINALIZE_FILE.test(f))
    .sort((a, b) => {
      const [ta, na] = preFinalizeOrder(a)
      const [tb, nb] = preFinalizeOrder(b)
      return ta < tb ? -1 : ta > tb ? 1 : na - nb
    })
  for (const old of backups.slice(0, Math.max(0, backups.length - PRE_FINALIZE_KEEP))) {
    fs.rmSync(path.join(dir, old))
  }
  return dest
}
