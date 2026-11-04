// @vitest-environment node
//
// Through the real app and a real temporary database (plain Node: react-pdf needs its server build).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../_lib/db'
import * as invoicePdf from '../_lib/invoicePdf'
import * as pdfFiles from '../_lib/invoicePdfFiles'
import * as invoicesRepo from '../_lib/invoicesRepo'
import { createApp } from '../../server/app'

vi.mock('../_lib/invoicePdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/invoicePdf')>()
  return { ...actual, renderInvoicePdf: vi.fn(actual.renderInvoicePdf) }
})

vi.mock('../_lib/invoicesRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/invoicesRepo')>()
  return {
    ...actual,
    getInvoice: vi.fn(actual.getInvoice),
    setInvoicePdfPath: vi.fn(actual.setInvoicePdfPath),
  }
})

const PORT = 5174
const HOST = `localhost:${PORT}`

let tmpDir: string
let dataDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-finalize-route-'))
  dataDir = path.join(tmpDir, 'data')
  process.env.NEOINSENT_DATA_DIR = dataDir
  closeDb()
  vi.mocked(invoicePdf.renderInvoicePdf).mockClear()
  // Finalize dates the invoice today (local): pin today so the numbers stay in 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 10, 30))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

function app() {
  return createApp({ port: PORT, distDir: path.join(tmpDir, 'dist') })
}

const acme = {
  name: 'Acme BV',
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
}

async function createDraft(server: express.Express) {
  const client = await request(server).post('/api/clients').set('Host', HOST).send(acme)
  expect(client.status).toBe(201)
  const draft = await request(server)
    .post('/api/invoices')
    .set('Host', HOST)
    .send({
      client_id: client.body.client.id,
      language: 'nl',
      vat_treatment: 'nl_standard',
      issue_date: '2026-11-02',
      due_date: '2026-11-16',
      items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
    })
  expect(draft.status).toBe(201)
  return { clientId: client.body.client.id as string, invoiceId: draft.body.invoice.id as string }
}

function finalize(server: express.Express, id: string) {
  return request(server)
    .post(`/api/invoices/${id}/finalize`)
    .set('Host', HOST)
    .set('Content-Type', 'application/json')
    .send({})
}

function counter(): number | null {
  const row = getDb().prepare('select last_number from invoice_counters where year = 2026').get() as
    | { last_number: number }
    | undefined
  return row?.last_number ?? null
}

function preFinalizeBackups(): string[] {
  const dir = path.join(dataDir, 'backups')
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('pre-finalize-')) : []
}

describe('POST /api/invoices/:id/finalize', () => {
  it('finalizes the draft, writes its PDF and backs up first', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.pdfError).toBeUndefined()
    expect(res.body.invoice).toMatchObject({
      id: invoiceId,
      status: 'final',
      invoice_number: 'NEO-2026-0001',
      pdf_path: 'invoices/2026/NEO-2026-0001.pdf',
      client_snapshot: expect.objectContaining({ name: 'Acme BV' }),
    })
    const pdf = fs.readFileSync(path.join(dataDir, res.body.invoice.pdf_path))
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(preFinalizeBackups()).toHaveLength(1)
  })

  it('answers 409 when the invoice is already final', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    await finalize(server, invoiceId)

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'This invoice is already finalized' })
    expect(counter()).toBe(1)
  })

  it('answers 409 with the reason when the client no longer fits the VAT treatment', async () => {
    const server = app()
    const { clientId, invoiceId } = await createDraft(server)
    const edit = await request(server)
      .patch(`/api/clients/${clientId}`)
      .set('Host', HOST)
      .send({ ...acme, country: 'DE', vat_number: null })
    expect(edit.status).toBe(200)

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: 'This client needs a valid VAT number matching their country before you can invoice them',
    })
    expect(counter()).toBeNull()
  })

  it('answers 422 when the invoice data cannot be printed, consuming no number', async () => {
    const server = app()
    const { clientId, invoiceId } = await createDraft(server)
    // A reverse-charge invoice with a 21% line can only come from tampering; the PDF rules refuse it.
    getDb().prepare("update invoices set vat_treatment = 'eu_reverse_charge' where id = ?").run(invoiceId)
    const edit = await request(server)
      .patch(`/api/clients/${clientId}`)
      .set('Host', HOST)
      .send({ ...acme, country: 'DE', vat_number: 'DE123456789' })
    expect(edit.status).toBe(200)

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/reverse-charge invoice must have 0% VAT/)
    expect(counter()).toBeNull()
  })

  it('still finalizes when the PDF cannot be written, and the PDF can be created later', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    vi.mocked(invoicePdf.renderInvoicePdf).mockRejectedValueOnce(new Error('render failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.pdfError).toBe(
      'The invoice was finalized, but its PDF could not be created yet — it will be retried when you open it.',
    )
    expect(res.body.invoice).toMatchObject({ status: 'final', invoice_number: 'NEO-2026-0001', pdf_path: null })

    const later = await pdfFiles.ensureInvoicePdf(invoiceId)
    expect(later).toEqual({ status: 'ok', path: path.join(dataDir, 'invoices', '2026', 'NEO-2026-0001.pdf') })
  })

  it('moves a foreign file at the new path aside, writes this invoice there and warns', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    const dir = path.join(dataDir, 'invoices', '2026')
    const abs = path.join(dir, 'NEO-2026-0001.pdf')
    const actualRender = vi.mocked(invoicePdf.renderInvoicePdf).getMockImplementation()!
    // A file appears at the path after the number was taken, before the PDF is moved into place.
    vi.mocked(invoicePdf.renderInvoicePdf).mockImplementationOnce(async (model) => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(abs, 'someone else')
      return actualRender(model)
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.pdfError).toBeUndefined()
    expect(res.body.invoice).toMatchObject({ invoice_number: 'NEO-2026-0001', pdf_path: 'invoices/2026/NEO-2026-0001.pdf' })
    expect((await invoicesRepo.getInvoice(invoiceId))?.pdf_path).toBe('invoices/2026/NEO-2026-0001.pdf')

    // The foreign bytes are kept, under a .conflict-* name next to it.
    const conflicts = fs.readdirSync(dir).filter((f) => f.startsWith('NEO-2026-0001.pdf.conflict-'))
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatch(/^NEO-2026-0001\.pdf\.conflict-20261104-103000-[0-9a-f]{8}$/)
    expect(fs.readFileSync(path.join(dir, conflicts[0]), 'utf8')).toBe('someone else')

    // The file at the expected path is now this invoice's PDF.
    const written = fs.readFileSync(abs)
    expect(written.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(written.toString('latin1')).not.toBe('someone else')

    expect(res.body.pdfWarning).toBe(
      `A different file was already saved under this invoice number and has been kept as ${conflicts[0]}. ` +
        'Check that only one copy of NeoInsent uses this data folder.',
    )
    expect(logged).toHaveBeenCalledWith(
      `CONFLICT: A different file was at invoices/2026/NEO-2026-0001.pdf after NEO-2026-0001 was issued — moved it to ${conflicts[0]}. ` +
        'Two copies of the app or two databases may be sharing this data folder.',
    )
    expect(logged.mock.calls.flat().join(' ')).not.toMatch(/already existed on disk before/)

    // The conflict copy does not count as an issued number: the next invoice gets 0002.
    const next = await createDraft(server)
    const second = await finalize(server, next.invoiceId)
    expect(second.status).toBe(200)
    expect(second.body.invoice).toMatchObject({ invoice_number: 'NEO-2026-0002' })
    expect(second.body.pdfWarning).toBeUndefined()
  })

  it('falls back to pdfError when writing after the move-aside fails too', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    const dir = path.join(dataDir, 'invoices', '2026')
    const abs = path.join(dir, 'NEO-2026-0001.pdf')
    const actualRender = vi.mocked(invoicePdf.renderInvoicePdf).getMockImplementation()!
    vi.mocked(invoicePdf.renderInvoicePdf)
      .mockImplementationOnce(async (model) => {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(abs, 'someone else')
        return actualRender(model)
      })
      .mockRejectedValueOnce(new Error('render failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.pdfError).toMatch(/could not be created yet/)
    expect(res.body.pdfWarning).toBeUndefined()
    expect(res.body.invoice).toMatchObject({ pdf_path: null })
    expect(fs.existsSync(abs)).toBe(false)
    const conflicts = fs.readdirSync(dir).filter((f) => f.includes('.conflict-'))
    expect(fs.readFileSync(path.join(dir, conflicts[0]), 'utf8')).toBe('someone else')
  })

  it('answers 200 with pdfError when recording the PDF fails, and the written PDF is accepted later', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    vi.mocked(invoicesRepo.setInvoicePdfPath).mockRejectedValueOnce(new Error('disk I/O error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.pdfError).toMatch(/could not be created yet/)
    expect(res.body.invoice).toMatchObject({ status: 'final', invoice_number: 'NEO-2026-0001', pdf_path: null })
    const abs = path.join(dataDir, 'invoices', '2026', 'NEO-2026-0001.pdf')
    const written = fs.readFileSync(abs)
    expect(vi.mocked(invoicePdf.renderInvoicePdf)).toHaveBeenCalledTimes(1)

    expect(await pdfFiles.ensureInvoicePdf(invoiceId)).toEqual({ status: 'ok', path: abs })
    expect(vi.mocked(invoicePdf.renderInvoicePdf)).toHaveBeenCalledTimes(1) // not re-rendered
    expect(fs.readFileSync(abs).equals(written)).toBe(true)
    expect((await invoicesRepo.getInvoice(invoiceId))?.pdf_path).toBe('invoices/2026/NEO-2026-0001.pdf')
  })

  it('still answers 200 with the issued invoice when re-reading it afterwards fails', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    const actualGetInvoice = vi.mocked(invoicesRepo.getInvoice).getMockImplementation()!
    vi.mocked(invoicesRepo.getInvoice)
      .mockImplementationOnce(actualGetInvoice) // the route's pre-check
      .mockRejectedValueOnce(new Error('database is locked')) // the final re-read
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.pdfError).toBeUndefined()
    expect(res.body.invoice).toMatchObject({
      id: invoiceId,
      status: 'final',
      invoice_number: 'NEO-2026-0001',
      pdf_path: 'invoices/2026/NEO-2026-0001.pdf',
    })
  })

  it('dates the invoice the day it is finalized and moves the due date with it', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server) // 2026-11-02, due 2026-11-16

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(200)
    expect(res.body.invoice).toMatchObject({ issue_date: '2026-11-04', due_date: '2026-11-18' })
  })

  it('refuses to reuse an issued number after the database alone was restored (409)', async () => {
    const server = app()
    const first = await createDraft(server)
    const issued = await finalize(server, first.invoiceId)
    expect(issued.body.invoice.invoice_number).toBe('NEO-2026-0001')
    const pdfPath = path.join(dataDir, 'invoices', '2026', 'NEO-2026-0001.pdf')
    const original = fs.readFileSync(pdfPath)

    // Simulate restoring an older database while keeping the invoices folder: forget the issued
    // invoice and its number (the delete trigger is bypassed only for this simulation).
    const db = getDb()
    db.exec('drop trigger invoices_final_no_delete; drop trigger invoice_items_final_no_delete')
    db.prepare('delete from invoices where id = ?').run(first.invoiceId)
    db.prepare('delete from invoice_counters').run()

    const second = await createDraft(server)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await finalize(server, second.invoiceId)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error:
        "Invoice NEO-2026-0001 already exists in your invoices folder, but the database doesn't know it — " +
        'it looks restored from an older backup. Restore the database and the invoices folder from the ' +
        'same moment. Nothing was finalized.',
    })
    expect(counter()).toBeNull()
    expect(getDb().prepare('select status, invoice_number from invoices where id = ?').get(second.invoiceId)).toEqual({
      status: 'draft',
      invoice_number: null,
    })
    expect(fs.readFileSync(pdfPath).equals(original)).toBe(true)
  })

  it('does not finalize when the backup fails', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)
    // A file where the backups folder should be makes the backup impossible.
    fs.writeFileSync(path.join(dataDir, 'backups'), 'not a folder')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await finalize(server, invoiceId)

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/could not back up/i)
    expect(counter()).toBeNull()
    expect(getDb().prepare('select status from invoices where id = ?').get(invoiceId)).toEqual({ status: 'draft' })
  })

  it('answers 404 for an unknown or malformed id', async () => {
    const server = app()
    expect((await finalize(server, '00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await finalize(server, 'not-a-uuid')).status).toBe(404)
  })

  it('answers 405 for GET', async () => {
    const server = app()
    const { invoiceId } = await createDraft(server)

    const res = await request(server).get(`/api/invoices/${invoiceId}/finalize`).set('Host', HOST)

    expect(res.status).toBe(405)
  })
})
