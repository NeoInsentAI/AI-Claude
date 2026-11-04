// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../api/_lib/db'
import { finalizeDraftInvoice } from '../api/_lib/invoicesRepo'
import { createApp, wrap } from './app'

const PORT = 5174
const HOST = `localhost:${PORT}`

let tmpDir: string
let distDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-server-'))
  process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
  // A dot folder in the path (like .worktrees) must not stop the frontend from being served.
  distDir = path.join(tmpDir, '.hidden', 'dist')
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>NeoInsent</title>')
  fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log(1)')
  closeDb()
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

function app() {
  return createApp({ port: PORT, distDir })
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

async function createAcme(server: express.Express) {
  const res = await request(server).post('/api/clients').set('Host', HOST).send(acme)
  expect(res.status).toBe(201)
  return res.body.client as { id: string; name: string }
}

describe('API through the real database', () => {
  it('POST then GET /api/clients round-trips', async () => {
    const server = app()
    const client = await createAcme(server)
    const res = await request(server).get('/api/clients').set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.body.clients).toEqual([expect.objectContaining({ id: client.id, name: 'Acme BV' })])
  })

  it('PATCH /api/clients/:id updates the client', async () => {
    const server = app()
    const client = await createAcme(server)
    const res = await request(server)
      .patch(`/api/clients/${client.id}`)
      .set('Host', HOST)
      .send({ ...acme, name: 'Acme Holding BV' })
    expect(res.status).toBe(200)
    expect(res.body.client).toEqual(expect.objectContaining({ id: client.id, name: 'Acme Holding BV' }))
    const list = await request(server).get('/api/clients').set('Host', HOST)
    expect(list.body.clients[0].name).toBe('Acme Holding BV')
  })

  it("keeps the handler's own 405 for other methods", async () => {
    const server = app()
    const res = await request(server).delete('/api/clients').set('Host', HOST).set('Content-Type', 'application/json')
    expect(res.status).toBe(405)
    expect(res.body).toEqual({ error: 'Method not allowed' })
  })

  it('POST /api/invoices creates a draft and GET lists it', async () => {
    const server = app()
    const client = await createAcme(server)
    const created = await request(server)
      .post('/api/invoices')
      .set('Host', HOST)
      .send({
        client_id: client.id,
        language: 'nl',
        vat_treatment: 'nl_standard',
        issue_date: '2026-11-02',
        due_date: '2026-11-16',
        items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
      })
    expect(created.status).toBe(201)
    expect(created.body.invoice).toEqual(expect.objectContaining({ status: 'draft', client_id: client.id }))

    const list = await request(server).get('/api/invoices?year=2026&quarter=4').set('Host', HOST)
    expect(list.status).toBe(200)
    expect(list.body.invoices).toEqual([expect.objectContaining({ id: created.body.invoice.id })])
  })

  it('GET /api/invoices/:id returns the draft with its items and live client', async () => {
    const server = app()
    const client = await createAcme(server)
    const id = await createDraft(server, client.id)

    const res = await request(server).get(`/api/invoices/${id}`).set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.body.invoice).toEqual(
      expect.objectContaining({ id, status: 'draft', subtotal: 200, vat_amount: 42, total: 242 }),
    )
    expect(res.body.invoice.client).toEqual(expect.objectContaining({ id: client.id, name: 'Acme BV' }))
    expect(res.body.invoice.items).toEqual([
      expect.objectContaining({ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21, line_total: 242 }),
    ])
  })

  it('stores the service period (leverdatum) of a draft and GET returns it', async () => {
    const server = app()
    const client = await createAcme(server)
    const created = await request(server)
      .post('/api/invoices')
      .set('Host', HOST)
      .send({ ...draftBody(client.id), service_period: 'October 2026' })
    expect(created.status).toBe(201)
    expect(created.body.invoice.service_period).toBe('October 2026')

    const res = await request(server).get(`/api/invoices/${created.body.invoice.id}`).set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.body.invoice.service_period).toBe('October 2026')
  })

  it('stores the VAT note of a Dutch draft, PATCH replaces it and GET returns it', async () => {
    const server = app()
    const client = await createAcme(server)
    const zero = [{ description: 'Training', quantity: 1, unit_price: 50, vat_rate: 0 }]
    const created = await request(server)
      .post('/api/invoices')
      .set('Host', HOST)
      .send({ ...draftBody(client.id), items: zero, vat_note: 'Vrijgesteld van btw' })
    expect(created.status).toBe(201)
    expect(created.body.invoice.vat_note).toBe('Vrijgesteld van btw')

    const patched = await request(server)
      .patch(`/api/invoices/${created.body.invoice.id}`)
      .set('Host', HOST)
      .send({ ...draftBody(client.id), items: zero, vat_note: 'Art. 11 Wet OB' })
    expect(patched.status).toBe(200)

    const res = await request(server).get(`/api/invoices/${created.body.invoice.id}`).set('Host', HOST)
    expect(res.body.invoice.vat_note).toBe('Art. 11 Wet OB')
  })

  it('GET /api/invoices/:id answers 404 for an unknown invoice', async () => {
    const res = await request(app())
      .get('/api/invoices/7c9e6679-7425-40de-944b-e07fc1f90ae7')
      .set('Host', HOST)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Invoice not found' })
  })

  it('PATCH /api/invoices/:id replaces the lines and recomputes the totals', async () => {
    const server = app()
    const client = await createAcme(server)
    const id = await createDraft(server, client.id)

    const res = await request(server)
      .patch(`/api/invoices/${id}`)
      .set('Host', HOST)
      .send({
        ...draftBody(client.id),
        notes: 'Updated',
        items: [
          { description: 'Workshop', quantity: 1, unit_price: 500, vat_rate: 21 },
          { description: 'Travel', quantity: 3, unit_price: 10, vat_rate: 9 },
        ],
      })
    expect(res.status).toBe(200)
    expect(res.body.invoice).toEqual(
      expect.objectContaining({ id, notes: 'Updated', subtotal: 530, vat_amount: 107.7, total: 637.7 }),
    )

    const reread = await request(server).get(`/api/invoices/${id}`).set('Host', HOST)
    expect(reread.body.invoice.items.map((i: { description: string }) => i.description)).toEqual([
      'Workshop',
      'Travel',
    ])
    expect(reread.body.invoice.total).toBe(637.7)
  })

  it('PATCH /api/invoices/:id refuses a final invoice with 409 and leaves it unchanged', async () => {
    const server = app()
    const client = await createAcme(server)
    const id = await createDraft(server, client.id)
    const { id: _id, created_at: _c, updated_at: _u, ...snapshot } = (
      await request(server).get(`/api/invoices/${id}`).set('Host', HOST)
    ).body.invoice.client
    getDb()
      .prepare(
        `update invoices set invoice_number = ?, client_snapshot = ?, finalized_at = ?, status = 'final'
         where id = ?`,
      )
      .run('2026-0001', JSON.stringify(snapshot), '2026-11-03T10:00:00.000Z', id)
    const before = (await request(server).get(`/api/invoices/${id}`).set('Host', HOST)).body.invoice

    const res = await request(server)
      .patch(`/api/invoices/${id}`)
      .set('Host', HOST)
      .send({
        ...draftBody(client.id),
        items: [{ description: 'Sneaky edit', quantity: 1, unit_price: 1, vat_rate: 21 }],
      })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'This invoice is finalized and can no longer be edited' })

    const after = (await request(server).get(`/api/invoices/${id}`).set('Host', HOST)).body.invoice
    expect(after).toEqual(before)
    expect(after.items).toEqual([expect.objectContaining({ description: 'Consulting' })])
  })
})

function draftBody(clientId: string) {
  return {
    client_id: clientId,
    language: 'nl',
    vat_treatment: 'nl_standard',
    issue_date: '2026-11-02',
    due_date: '2026-11-16',
    items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
  }
}

async function createDraft(server: express.Express, clientId: string): Promise<string> {
  const res = await request(server).post('/api/invoices').set('Host', HOST).send(draftBody(clientId))
  expect(res.status).toBe(201)
  return res.body.invoice.id as string
}

describe('localhost-only protections', () => {
  it('rejects a foreign Host header with 403 (DNS rebinding)', async () => {
    const res = await request(app()).get('/api/clients').set('Host', 'evil.example:5174')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it('rejects the right host on the wrong port', async () => {
    const res = await request(app()).get('/').set('Host', 'localhost:9999')
    expect(res.status).toBe(403)
  })

  it('accepts 127.0.0.1:<port> as Host', async () => {
    const res = await request(app()).get('/api/clients').set('Host', `127.0.0.1:${PORT}`)
    expect(res.status).toBe(200)
  })

  it('rejects a write from a foreign Origin with 403', async () => {
    const res = await request(app())
      .post('/api/clients')
      .set('Host', HOST)
      .set('Origin', 'https://evil.example')
      .send(acme)
    expect(res.status).toBe(403)
    const list = await request(app()).get('/api/clients').set('Host', HOST)
    expect(list.body.clients).toEqual([])
  })

  it('rejects Origin: null on a write', async () => {
    const res = await request(app()).post('/api/clients').set('Host', HOST).set('Origin', 'null').send(acme)
    expect(res.status).toBe(403)
  })

  it('rejects a foreign Origin on an uppercased API path (POST /API/clients)', async () => {
    const server = app()
    const res = await request(server)
      .post('/API/clients')
      .set('Host', HOST)
      .set('Origin', 'https://evil.example')
      .send(acme)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Forbidden: cross-site request' })
    const list = await request(server).get('/api/clients').set('Host', HOST)
    expect(list.body.clients).toEqual([])
  })

  it('does not route a mixed-case API path to the handler (case-sensitive routing)', async () => {
    const server = app()
    const res = await request(server).post('/Api/clients').set('Host', HOST).send(acme)
    expect(res.status).toBe(404)
    const list = await request(server).get('/api/clients').set('Host', HOST)
    expect(list.body.clients).toEqual([])
  })

  it('rejects a foreign Origin on a non-API write', async () => {
    const res = await request(app()).post('/anything').set('Host', HOST).set('Origin', 'https://evil.example')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Forbidden: cross-site request' })
  })

  it('allows a write from the app’s own Origin', async () => {
    for (const origin of [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]) {
      const res = await request(app()).post('/api/clients').set('Host', HOST).set('Origin', origin).send(acme)
      expect(res.status).toBe(201)
    }
  })
})

describe('writes must be JSON and same-site', () => {
  it('rejects a text/plain write without Origin with 415 and writes nothing', async () => {
    const server = app()
    const res = await request(server)
      .post('/api/clients')
      .set('Host', HOST)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(acme))
    expect(res.status).toBe(415)
    expect(res.body).toEqual({ error: 'Send JSON (Content-Type: application/json)' })
    const list = await request(server).get('/api/clients').set('Host', HOST)
    expect(list.body.clients).toEqual([])
  })

  it('rejects a body-less write with no Content-Type with 415', async () => {
    const res = await request(app()).delete('/api/clients/abc').set('Host', HOST)
    expect(res.status).toBe(415)
  })

  it('accepts application/json with a charset parameter', async () => {
    const res = await request(app())
      .post('/api/clients')
      .set('Host', HOST)
      .set('Content-Type', 'Application/JSON; charset=utf-8')
      .send(JSON.stringify(acme))
    expect(res.status).toBe(201)
  })

  it('rejects a write with Sec-Fetch-Site: cross-site (no Origin) with 403', async () => {
    const server = app()
    const res = await request(server).post('/api/clients').set('Host', HOST).set('Sec-Fetch-Site', 'cross-site').send(acme)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Forbidden: cross-site request' })
    const list = await request(server).get('/api/clients').set('Host', HOST)
    expect(list.body.clients).toEqual([])
  })

  it('rejects a write with Sec-Fetch-Site: same-site with 403', async () => {
    const res = await request(app()).post('/api/clients').set('Host', HOST).set('Sec-Fetch-Site', 'same-site').send(acme)
    expect(res.status).toBe(403)
  })

  it('allows Sec-Fetch-Site: same-origin and none', async () => {
    for (const site of ['same-origin', 'none']) {
      const res = await request(app()).post('/api/clients').set('Host', HOST).set('Sec-Fetch-Site', site).send(acme)
      expect(res.status).toBe(201)
    }
  })

  it('still accepts a same-origin JSON POST', async () => {
    const res = await request(app())
      .post('/api/clients')
      .set('Host', HOST)
      .set('Origin', `http://localhost:${PORT}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send(acme)
    expect(res.status).toBe(201)
  })

  it('does not require JSON for GET', async () => {
    const res = await request(app()).get('/api/clients').set('Host', HOST).set('Sec-Fetch-Site', 'cross-site')
    expect(res.status).toBe(200)
  })
})

describe('security headers', () => {
  const expected = {
    'x-frame-options': 'DENY',
    'content-security-policy': "frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
  }

  it('sets them on the frontend, on /api responses and on rejections', async () => {
    const responses = [
      await request(app()).get('/').set('Host', HOST),
      await request(app()).get('/api/clients').set('Host', HOST),
      await request(app()).get('/api/clients').set('Host', 'evil.example'),
    ]
    for (const res of responses) expect(res.headers).toEqual(expect.objectContaining(expected))
  })
})

describe('GET /api/health', () => {
  it('identifies the app', async () => {
    const res = await request(app()).get('/api/health').set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ app: 'neoinsent' })
  })

  it('is subject to the Host check', async () => {
    const res = await request(app()).get('/api/health').set('Host', 'evil.example:5174')
    expect(res.status).toBe(403)
  })
})

describe('routing and errors', () => {
  it('returns 404 JSON for an unknown /api route', async () => {
    const res = await request(app()).get('/api/nope').set('Host', HOST)
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('returns 400 JSON for a malformed JSON body', async () => {
    const res = await request(app())
      .post('/api/clients')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .send('{"name":')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Request body is not valid JSON' })
  })

  it('returns 413 with a fixed message for a too-large body', async () => {
    const res = await request(app())
      .post('/api/clients')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(1024 * 1024 + 10) }))
    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: 'Request body is too large' })
  })

  it('does not echo the message of other 4xx errors', async () => {
    const res = await request(app())
      .post('/api/clients')
      .set('Host', HOST)
      .set('Content-Type', 'application/json; charset=bogus-charset-xyz')
      .send('{}')
    expect(res.status).toBe(415)
    expect(res.body).toEqual({ error: 'Bad request' })
  })

  it('serves the built frontend and falls back to index.html for app routes', async () => {
    const root = await request(app()).get('/').set('Host', HOST)
    expect(root.status).toBe(200)
    expect(root.text).toContain('<title>NeoInsent</title>')

    const deep = await request(app()).get('/invoices/123').set('Host', HOST)
    expect(deep.status).toBe(200)
    expect(deep.headers['content-type']).toMatch(/html/)

    const asset = await request(app()).get('/assets/app.js').set('Host', HOST)
    expect(asset.status).toBe(200)
    expect(asset.text).toBe('console.log(1)')
  })

  it('wrap turns a thrown error into a 500 JSON response', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mini = express()
    mini.get(
      '/boom',
      wrap(async () => {
        throw new Error('kaboom')
      }),
    )
    const res = await request(mini).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Something went wrong' })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('GET /api/dashboard', () => {
  it('returns the period summary and lists drafts through the real database', async () => {
    const server = app()
    const client = await createAcme(server)
    const draftId = await createDraft(server, client.id)

    const res = await request(server).get('/api/dashboard?year=2026&quarter=4').set('Host', HOST)

    expect(res.status).toBe(200)
    expect(res.body.period).toEqual({ year: 2026, quarter: 4, fromDate: '2026-10-01', toDate: '2026-12-31' })
    expect(res.body.summary).toMatchObject({ invoiceCount: 0, total: 0, vatByRate: [] })
    expect(res.body.invoices).toEqual([])
    expect(res.body.drafts).toEqual([expect.objectContaining({ id: draftId, client_name: 'Acme BV' })])
  })

  it('validates the query and allows only GET', async () => {
    const server = app()
    expect((await request(server).get('/api/dashboard?quarter=2').set('Host', HOST)).status).toBe(400)
    const post = await request(server).post('/api/dashboard').set('Host', HOST).send({})
    expect(post.status).toBe(405)
  })
})

describe('GET /api/tax and the CSV downloads', () => {
  async function issueAcmeInvoice(server: express.Express) {
    const client = await createAcme(server)
    const id = await createDraft(server, client.id)
    const result = await finalizeDraftInvoice(id, new Date(2026, 9, 5, 10, 0))
    expect(result.status).toBe('ok')
  }

  it('returns the BTW figures for the quarter through the real database', async () => {
    const server = app()
    await issueAcmeInvoice(server)
    const res = await request(server).get('/api/tax?year=2026&quarter=4').set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      period: { year: 2026, quarter: 4, fromDate: '2026-10-01', toDate: '2026-12-31' },
      btw: { r1a: { base: 200, vat: 42 }, r1b: { base: 0, vat: 0 }, r1e: { base: 0 }, r3b: { base: 0 }, vatDue: 42 },
      icp: [],
      invoiceCount: 1,
      firstYear: 2026,
    })
  })

  it('serves the invoices CSV with a BOM as an attachment named after the quarter', async () => {
    const server = app()
    await issueAcmeInvoice(server)
    const res = await request(server)
      .get('/api/tax/invoices.csv?year=2026&quarter=4')
      .set('Host', HOST)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => done(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe('attachment; filename="neoinsent-facturen-2026-Q4.csv"')
    const body = res.body as Buffer
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(body.toString('utf8')).toBe(
      '\uFEFFFactuurnummer;Factuurdatum;Klant;Land;Btw-nummer klant;Btw-behandeling;Bedrag excl. btw;Btw;Totaal;Betaald\r\n' +
        'NEO-2026-0001;05-10-2026;Acme BV;NL;NL123456789B01;Binnenland;200,00;42,00;242,00;nee\r\n',
    )
  })

  it('names the ICP CSV after the year when no quarter is given', async () => {
    const server = app()
    const res = await request(server).get('/api/tax/icp.csv?year=2026').set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBe('attachment; filename="neoinsent-icp-2026.csv"')
    expect(res.text).toBe('\uFEFFLandcode btw-nummer;Btw-nummer (zonder landcode);Klant;Diensten (excl. btw)\r\n')
  })

  it('requires a year and allows only GET', async () => {
    const server = app()
    expect((await request(server).get('/api/tax').set('Host', HOST)).status).toBe(400)
    expect((await request(server).get('/api/tax/invoices.csv?quarter=1').set('Host', HOST)).status).toBe(400)
    for (const route of ['/api/tax', '/api/tax/invoices.csv', '/api/tax/icp.csv']) {
      const post = await request(server).post(`${route}?year=2026`).set('Host', HOST).send({})
      expect(post.status).toBe(405)
    }
  })
})
