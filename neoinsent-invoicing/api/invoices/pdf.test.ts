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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-pdf-route-'))
  dataDir = path.join(tmpDir, 'data')
  process.env.NEOINSENT_DATA_DIR = dataDir
  closeDb()
  vi.mocked(invoicePdf.renderInvoicePdf).mockClear()
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

async function createDraft(server: express.Express): Promise<string> {
  const client = await request(server).post('/api/clients').set('Host', HOST).send({
    name: 'Acme BV',
    email: 'billing@acme.nl',
    address_line: 'Damrak 1',
    postal_code: '1012 LG',
    city: 'Amsterdam',
    country: 'NL',
    vat_number: 'NL123456789B01',
  })
  expect(client.status).toBe(201)
  const draft = await request(server)
    .post('/api/invoices')
    .set('Host', HOST)
    .send({
      client_id: client.body.client.id,
      language: 'nl',
      vat_treatment: 'nl_standard',
      issue_date: '2026-11-04',
      due_date: '2026-11-18',
      items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
    })
  expect(draft.status).toBe(201)
  return draft.body.invoice.id as string
}

async function createFinal(server: express.Express): Promise<string> {
  const id = await createDraft(server)
  const res = await request(server)
    .post(`/api/invoices/${id}/finalize`)
    .set('Host', HOST)
    .set('Content-Type', 'application/json')
    .send({})
  expect(res.status).toBe(200)
  expect(res.body.invoice.invoice_number).toBe('NEO-2026-0001')
  return id
}

/** Collects the response body as a Buffer whatever its content type. */
function binary(res: request.Response, done: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = []
  res.on('data', (chunk: Buffer) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
}

function getPdf(server: express.Express, id: string, query = '') {
  return request(server).get(`/api/invoices/${id}/pdf${query}`).set('Host', HOST).buffer(true).parse(binary)
}

const PDF_FILE = () => path.join(dataDir, 'invoices', '2026', 'NEO-2026-0001.pdf')

describe('GET /api/invoices/:id/pdf', () => {
  it('serves the PDF of a finalized invoice inline, uncached', async () => {
    const server = app()
    const id = await createFinal(server)

    const res = await getPdf(server, id)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toBe('inline; filename="NEO-2026-0001.pdf"')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect((res.body as Buffer).subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect((res.body as Buffer).equals(fs.readFileSync(PDF_FILE()))).toBe(true)
  })

  it('serves it as a download with ?download=1', async () => {
    const server = app()
    const id = await createFinal(server)

    const res = await getPdf(server, id, '?download=1')

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBe('attachment; filename="NEO-2026-0001.pdf"')
  })

  it('re-creates a missing PDF from the stored invoice', async () => {
    const server = app()
    const id = await createFinal(server)
    fs.rmSync(PDF_FILE())
    getDb().prepare('update invoices set pdf_path = null where id = ?').run(id)

    const res = await getPdf(server, id)

    expect(res.status).toBe(200)
    expect((res.body as Buffer).subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(fs.existsSync(PDF_FILE())).toBe(true)
    expect(getDb().prepare('select pdf_path from invoices where id = ?').get(id)).toEqual({
      pdf_path: 'invoices/2026/NEO-2026-0001.pdf',
    })
  })

  it('answers 500 with a retry message when the PDF cannot be created', async () => {
    const server = app()
    const id = await createFinal(server)
    fs.rmSync(PDF_FILE())
    vi.mocked(invoicePdf.renderInvoicePdf).mockRejectedValueOnce(new Error('render failed'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(server).get(`/api/invoices/${id}/pdf`).set('Host', HOST)

    expect(res.status).toBe(500)
    expect(res.headers['content-type']).toMatch(/^application\/json/)
    expect(res.body).toEqual({ error: 'The PDF could not be created — try again' })
    expect(logged).toHaveBeenCalled()
    expect(fs.existsSync(PDF_FILE())).toBe(false)
  })

  it('answers 409 for a draft', async () => {
    const server = app()
    const id = await createDraft(server)

    const res = await request(server).get(`/api/invoices/${id}/pdf`).set('Host', HOST)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Only finalized invoices have a PDF' })
  })

  it('answers 404 for an unknown or malformed id', async () => {
    const server = app()
    const unknown = await request(server).get('/api/invoices/00000000-0000-4000-8000-000000000000/pdf').set('Host', HOST)
    const malformed = await request(server).get('/api/invoices/not-a-uuid/pdf').set('Host', HOST)

    expect(unknown.status).toBe(404)
    expect(malformed.status).toBe(404)
  })

  it('answers HEAD with the headers only', async () => {
    const server = app()
    const id = await createFinal(server)

    const res = await request(server).head(`/api/invoices/${id}/pdf`).set('Host', HOST)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toBe('inline; filename="NEO-2026-0001.pdf"')
  })

  it('answers 405 for POST', async () => {
    const server = app()
    const id = await createFinal(server)

    const res = await request(server)
      .post(`/api/invoices/${id}/pdf`)
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .send({})

    expect(res.status).toBe(405)
  })
})
