// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb } from '../api/_lib/db'
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
    const res = await request(server).delete('/api/clients').set('Host', HOST)
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
})

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
    expect(res.body).toEqual({ error: expect.any(String) })
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
