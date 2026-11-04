// @vitest-environment node
//
// Through the real app and a real temporary database (plain Node: react-pdf needs its server build).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb } from '../_lib/db'
import { getInvoice } from '../_lib/invoicesRepo'
import { createApp } from '../../server/app'

const PORT = 5174
const HOST = `localhost:${PORT}`

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-paid-route-'))
  process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
  closeDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 10, 30))
})

afterEach(() => {
  vi.useRealTimers()
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
  return id
}

function setPaid(server: express.Express, id: string, body: unknown) {
  return request(server)
    .post(`/api/invoices/${id}/paid`)
    .set('Host', HOST)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body))
}

describe('POST /api/invoices/:id/paid', () => {
  it('marks a final invoice paid and unpaid', async () => {
    const server = app()
    const id = await createFinal(server)

    const finalizedAt = (await getInvoice(id))?.updated_at

    vi.setSystemTime(new Date(2026, 10, 5, 9, 0))
    const paid = await setPaid(server, id, { paid: true })
    expect(paid.status).toBe(200)
    expect(paid.body.invoice).toMatchObject({ id, status: 'final', paid: true })
    const afterPaid = await getInvoice(id)
    expect(afterPaid?.paid).toBe(true)
    expect(afterPaid?.updated_at).toBe(new Date(2026, 10, 5, 9, 0).toISOString())
    expect(afterPaid?.updated_at).not.toBe(finalizedAt)

    vi.setSystemTime(new Date(2026, 10, 6, 14, 15))
    const unpaid = await setPaid(server, id, { paid: false })
    expect(unpaid.status).toBe(200)
    expect(unpaid.body.invoice).toMatchObject({ paid: false })
    const afterUnpaid = await getInvoice(id)
    expect(afterUnpaid?.paid).toBe(false)
    expect(afterUnpaid?.updated_at).toBe(new Date(2026, 10, 6, 14, 15).toISOString())
  })

  it('answers 409 for a draft', async () => {
    const server = app()
    const id = await createDraft(server)

    const res = await setPaid(server, id, { paid: true })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Only finalized invoices can be marked paid' })
    expect((await getInvoice(id))?.paid).toBe(false)
  })

  it.each([[{}], [{ paid: 'true' }], [{ paid: 1 }], [{ paid: null }], [[true]], ['true']])(
    'answers 400 for body %j',
    async (body: unknown) => {
      const server = app()
      const id = await createFinal(server)

      const res = await setPaid(server, id, body)

      expect(res.status).toBe(400)
      expect((await getInvoice(id))?.paid).toBe(false)
    },
  )

  it('answers 404 for an unknown or malformed id', async () => {
    const server = app()
    expect((await setPaid(server, '00000000-0000-4000-8000-000000000000', { paid: true })).status).toBe(404)
    expect((await setPaid(server, 'not-a-uuid', { paid: true })).status).toBe(404)
  })

  it('answers 405 for GET', async () => {
    const server = app()
    const id = await createFinal(server)

    const res = await request(server).get(`/api/invoices/${id}/paid`).set('Host', HOST)

    expect(res.status).toBe(405)
  })
})
