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
import { createApp } from '../../server/app'

vi.mock('../_lib/invoicePdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/invoicePdf')>()
  return { ...actual, renderInvoicePdf: vi.fn(actual.renderInvoicePdf) }
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
})

afterEach(() => {
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
