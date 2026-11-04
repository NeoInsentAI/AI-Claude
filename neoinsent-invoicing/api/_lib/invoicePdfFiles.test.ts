// @vitest-environment node
//
// Plain Node environment: @react-pdf/renderer needs its server build (see invoicePdf.test.ts).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb } from './db'
import { createClient, updateClient, type Client, type NewClient } from './clientsRepo'
import { createDraftInvoice, finalizeDraftInvoice, getInvoice, type DraftInvoiceInput } from './invoicesRepo'
import * as invoicePdfModel from './invoicePdfModel'
import {
  backupBeforeFinalize,
  ensureInvoicePdf,
  moveAsideConflictingPdf,
  pdfRelPath,
  writeInvoicePdf,
} from './invoicePdfFiles'

vi.mock('./invoicePdfModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./invoicePdfModel')>()
  return { ...actual, buildInvoicePdfModel: vi.fn(actual.buildInvoicePdfModel) }
})

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-pdffiles-'))
  process.env.NEOINSENT_DATA_DIR = tmpDir
  closeDb()
  vi.mocked(invoicePdfModel.buildInvoicePdfModel).mockClear()
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'
// Finalize dates the invoice today (local); a fixed day keeps the numbers in 2026.
const NOW = new Date(2026, 10, 4, 10, 30)

const acmeInput: NewClient = {
  name: 'Acme BV',
  contact_person: null,
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
  kvk_number: null,
}

function draftFor(client: Client): DraftInvoiceInput {
  return {
    client_id: client.id,
    language: 'nl',
    vat_treatment: 'nl_standard',
    issue_date: '2026-11-02',
    due_date: '2026-11-16',
    notes: null,
    service_period: null,
    items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
  }
}

async function finalizedInvoice() {
  const client = await createClient(acmeInput)
  const draft = await createDraftInvoice(draftFor(client))
  const result = await finalizeDraftInvoice(draft.id, NOW)
  if (result.status !== 'ok') throw new Error(`finalize failed: ${result.status}`)
  return { client, invoice: result.invoice, pdfModel: result.pdfModel }
}

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
}

describe('pdfRelPath', () => {
  it('puts the PDF under invoices/<issue year>/<number>.pdf', () => {
    expect(pdfRelPath('NEO-2026-0001', '2026-11-02')).toBe('invoices/2026/NEO-2026-0001.pdf')
  })

  it('refuses anything that is not an invoice number', () => {
    expect(() => pdfRelPath('../../etc/passwd', '2026-11-02')).toThrow()
    expect(() => pdfRelPath('NEO-2026-0001', 'not-a-date')).toThrow()
  })
})

describe('writeInvoicePdf', () => {
  it('writes the PDF atomically, owner-only, leaving no temporary files', async () => {
    const { pdfModel } = await finalizedInvoice()

    const abs = await writeInvoicePdf(pdfModel, 'invoices/2026/NEO-2026-0001.pdf')

    expect(abs).toBe(path.join(tmpDir, 'invoices', '2026', 'NEO-2026-0001.pdf'))
    expect(fs.readFileSync(abs).subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(fs.statSync(path.dirname(abs)).mode & 0o777).toBe(0o700)
    expect(fs.statSync(abs).mode & 0o777).toBe(0o600)
    expect(filesUnder(path.join(tmpDir, 'invoices')).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('replaces an existing file by default', async () => {
    const { pdfModel } = await finalizedInvoice()
    const abs = path.join(tmpDir, 'invoices', '2026', 'NEO-2026-0001.pdf')
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'old')

    await writeInvoicePdf(pdfModel, 'invoices/2026/NEO-2026-0001.pdf')

    expect(fs.readFileSync(abs).subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('with overwrite: false, refuses an existing file and leaves it intact', async () => {
    const { pdfModel } = await finalizedInvoice()
    const abs = path.join(tmpDir, 'invoices', '2026', 'NEO-2026-0001.pdf')
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'issued earlier')

    await expect(
      writeInvoicePdf(pdfModel, 'invoices/2026/NEO-2026-0001.pdf', { overwrite: false }),
    ).rejects.toMatchObject({ code: 'EEXIST' })

    expect(fs.readFileSync(abs, 'utf8')).toBe('issued earlier')
    expect(filesUnder(path.join(tmpDir, 'invoices')).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('with overwrite: false, writes a new file owner-only, leaving no temporary files', async () => {
    const { pdfModel } = await finalizedInvoice()

    const abs = await writeInvoicePdf(pdfModel, 'invoices/2026/NEO-2026-0001.pdf', { overwrite: false })

    expect(fs.readFileSync(abs).subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(fs.statSync(abs).mode & 0o777).toBe(0o600)
    expect(filesUnder(path.join(tmpDir, 'invoices')).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})

describe('moveAsideConflictingPdf', () => {
  const rel = 'invoices/2026/NEO-2026-0001.pdf'
  const when = new Date(2026, 10, 4, 10, 30, 5)

  it('renames the file to <name>.conflict-<timestamp>-<8 hex> in the same folder, bytes intact', async () => {
    const abs = path.join(tmpDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'someone else')

    const moved = await moveAsideConflictingPdf(rel, when)

    expect(moved).toMatch(/^NEO-2026-0001\.pdf\.conflict-20261104-103005-[0-9a-f]{8}$/)
    expect(fs.existsSync(abs)).toBe(false)
    expect(fs.readFileSync(path.join(path.dirname(abs), moved), 'utf8')).toBe('someone else')
  })

  it('gives two conflicts in a row distinct names and never clobbers the earlier one', async () => {
    const abs = path.join(tmpDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'first')
    const first = await moveAsideConflictingPdf(rel, when)
    fs.writeFileSync(abs, 'second')
    const second = await moveAsideConflictingPdf(rel, when)

    expect(second).not.toBe(first)
    expect(fs.readFileSync(path.join(path.dirname(abs), first), 'utf8')).toBe('first')
    expect(fs.readFileSync(path.join(path.dirname(abs), second), 'utf8')).toBe('second')
    expect(fs.existsSync(abs)).toBe(false)
  })

  it('refuses paths outside the data folder', async () => {
    await expect(moveAsideConflictingPdf('../outside.pdf', when)).rejects.toThrow(/outside the data folder/)
  })
})

describe('ensureInvoicePdf', () => {
  it('creates the missing PDF of a final invoice under invoices/2026/ and records pdf_path', async () => {
    const { invoice } = await finalizedInvoice()

    const result = await ensureInvoicePdf(invoice.id)

    const abs = path.join(tmpDir, 'invoices', '2026', 'NEO-2026-0001.pdf')
    expect(result).toEqual({ status: 'ok', path: abs })
    expect(fs.existsSync(abs)).toBe(true)
    expect((await getInvoice(invoice.id))?.pdf_path).toBe('invoices/2026/NEO-2026-0001.pdf')
  })

  it('leaves an existing PDF alone', async () => {
    const { invoice } = await finalizedInvoice()
    const first = await ensureInvoicePdf(invoice.id)
    const abs = first.status === 'ok' ? first.path : ''
    fs.writeFileSync(abs, 'existing')
    vi.mocked(invoicePdfModel.buildInvoicePdfModel).mockClear()

    expect(await ensureInvoicePdf(invoice.id)).toEqual({ status: 'ok', path: abs })
    expect(fs.readFileSync(abs, 'utf8')).toBe('existing')
    expect(invoicePdfModel.buildInvoicePdfModel).not.toHaveBeenCalled()
  })

  it('records a PDF that was written but whose pdf_path was never stored, without re-rendering', async () => {
    const { invoice } = await finalizedInvoice()
    const abs = path.join(tmpDir, 'invoices', '2026', 'NEO-2026-0001.pdf')
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'written at finalize')
    vi.mocked(invoicePdfModel.buildInvoicePdfModel).mockClear()

    expect(await ensureInvoicePdf(invoice.id)).toEqual({ status: 'ok', path: abs })
    expect(fs.readFileSync(abs, 'utf8')).toBe('written at finalize')
    expect(invoicePdfModel.buildInvoicePdfModel).not.toHaveBeenCalled()
    expect((await getInvoice(invoice.id))?.pdf_path).toBe('invoices/2026/NEO-2026-0001.pdf')
  })

  it('re-renders a deleted PDF from the client snapshot, not the edited live client', async () => {
    const { client, invoice } = await finalizedInvoice()
    const first = await ensureInvoicePdf(invoice.id)
    fs.rmSync(first.status === 'ok' ? first.path : '')
    await updateClient(client.id, { ...acmeInput, name: 'Renamed Holding BV', address_line: 'Elsewhere 9' })
    vi.mocked(invoicePdfModel.buildInvoicePdfModel).mockClear()

    const again = await ensureInvoicePdf(invoice.id)

    expect(again.status).toBe('ok')
    expect(fs.existsSync(again.status === 'ok' ? again.path : '')).toBe(true)
    const input = vi.mocked(invoicePdfModel.buildInvoicePdfModel).mock.calls[0][0]
    expect(input.client).toEqual(acmeInput)
    expect(input.invoiceNumber).toBe('NEO-2026-0001')
  })

  it("returns 'not_final' for a draft and writes nothing", async () => {
    const client = await createClient(acmeInput)
    const draft = await createDraftInvoice(draftFor(client))

    expect(await ensureInvoicePdf(draft.id)).toEqual({ status: 'not_final' })
    expect(fs.existsSync(path.join(tmpDir, 'invoices'))).toBe(false)
  })

  it("returns 'not_found' for an unknown id", async () => {
    expect(await ensureInvoicePdf(UNKNOWN_ID)).toEqual({ status: 'not_found' })
  })
})

describe('backupBeforeFinalize', () => {
  it('writes a pre-finalize backup that the daily rotation will not touch', async () => {
    await finalizedInvoice()

    const file = backupBeforeFinalize(new Date(2026, 10, 4, 9, 5, 7))

    expect(file).toBe(path.join(tmpDir, 'backups', 'pre-finalize-20261104-090507.db'))
    expect(fs.statSync(file).size).toBeGreaterThan(0)
    expect(/^neoinsent-\d{4}-\d{2}-\d{2}\.db$/.test(path.basename(file))).toBe(false)
  })

  it('adds a suffix rather than overwrite a backup from the same second', () => {
    const at = new Date(2026, 10, 4, 9, 5, 7)
    backupBeforeFinalize(at)

    expect(path.basename(backupBeforeFinalize(at))).toBe('pre-finalize-20261104-090507-2.db')
  })

  it('keeps only the newest 20 pre-finalize backups and never other files', () => {
    const dir = path.join(tmpDir, 'backups')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'neoinsent-2026-01-01.db'), 'daily')
    fs.writeFileSync(path.join(dir, 'pre-migration-v1-to-v2-20260101-000000.db'), 'migration')
    for (let i = 0; i < 22; i++) backupBeforeFinalize(new Date(2026, 10, 4, 9, 0, i))
    // Same second as the newest: the suffixed copy is newer still.
    backupBeforeFinalize(new Date(2026, 10, 4, 9, 0, 21))

    const kept = fs.readdirSync(dir).filter((f) => f.startsWith('pre-finalize-')).sort()
    expect(kept).toHaveLength(20)
    expect(kept).not.toContain('pre-finalize-20261104-090000.db')
    expect(kept).not.toContain('pre-finalize-20261104-090002.db')
    expect(kept).toContain('pre-finalize-20261104-090003.db')
    expect(kept).toContain('pre-finalize-20261104-090021.db')
    expect(kept).toContain('pre-finalize-20261104-090021-2.db')
    expect(fs.existsSync(path.join(dir, 'neoinsent-2026-01-01.db'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'pre-migration-v1-to-v2-20260101-000000.db'))).toBe(true)
  })
})
