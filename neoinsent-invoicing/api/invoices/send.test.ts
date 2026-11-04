// @vitest-environment node
//
// Through the real app and a real temporary database; nodemailer is mocked, so no email is sent.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import nodemailer from 'nodemailer'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDataDir } from '../_lib/db'
import { getInvoice, markInvoiceSent } from '../_lib/invoicesRepo'
import { createApp } from '../../server/app'

vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }))
vi.mock('../_lib/invoicesRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/invoicesRepo')>()
  return { ...actual, markInvoiceSent: vi.fn(actual.markInvoiceSent) }
})

const PORT = 5174
const HOST = `localhost:${PORT}`
const PASSWORD = 'abcdefghijklmnop'
const NOW = new Date(2026, 10, 4, 10, 30)
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

let tmpDir: string
const saved = {
  dataDir: process.env.NEOINSENT_DATA_DIR,
  user: process.env.GMAIL_USER,
  pass: process.env.GMAIL_APP_PASSWORD,
}
const sendMail = vi.fn()
const realMarkInvoiceSent = vi.mocked(markInvoiceSent).getMockImplementation()!

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-send-route-'))
  process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
  process.env.GMAIL_USER = 'finance@neoinsentai.com'
  process.env.GMAIL_APP_PASSWORD = PASSWORD
  closeDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sendMail.mockReset().mockResolvedValue({ messageId: '<x@gmail>' })
  vi.mocked(nodemailer.createTransport).mockReset().mockReturnValue({ sendMail } as never)
})

afterEach(() => {
  vi.mocked(markInvoiceSent).mockReset().mockImplementation(realMarkInvoiceSent)
  vi.useRealTimers()
  vi.restoreAllMocks()
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  restore('NEOINSENT_DATA_DIR', saved.dataDir)
  restore('GMAIL_USER', saved.user)
  restore('GMAIL_APP_PASSWORD', saved.pass)
})

function app() {
  return createApp({ port: PORT, distDir: path.join(tmpDir, 'dist') })
}

const ACME = {
  name: 'Acme BV',
  contact_person: 'Jan de Vries',
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
}

async function createDraft(server: express.Express, language: 'nl' | 'en' = 'nl') {
  const client = await request(server).post('/api/clients').set('Host', HOST).send(ACME)
  expect(client.status).toBe(201)
  const draft = await request(server)
    .post('/api/invoices')
    .set('Host', HOST)
    .send({
      client_id: client.body.client.id,
      language,
      vat_treatment: 'nl_standard',
      issue_date: '2026-11-04',
      due_date: '2026-11-18',
      items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
    })
  expect(draft.status).toBe(201)
  return { id: draft.body.invoice.id as string, clientId: client.body.client.id as string }
}

async function createFinal(server: express.Express, language: 'nl' | 'en' = 'nl') {
  const draft = await createDraft(server, language)
  const res = await request(server)
    .post(`/api/invoices/${draft.id}/finalize`)
    .set('Host', HOST)
    .set('Content-Type', 'application/json')
    .send({})
  expect(res.status).toBe(200)
  return { ...draft, invoiceNumber: res.body.invoice.invoice_number as string }
}

function send(server: express.Express, id: string, body: unknown = {}) {
  return request(server)
    .post(`/api/invoices/${id}/send`)
    .set('Host', HOST)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body))
}

function preview(server: express.Express, id: string) {
  return request(server).get(`/api/invoices/${id}/email-preview`).set('Host', HOST)
}

function smtpError(message: string, props: Record<string, unknown>): Error {
  return Object.assign(new Error(message), props)
}

describe('GET /api/email/status', () => {
  it('reports configured with the sending address, never the password', async () => {
    const res = await request(app()).get('/api/email/status').set('Host', HOST)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ configured: true, from: 'finance@neoinsentai.com' })
    expect(res.text).not.toContain(PASSWORD)
  })

  it('reports not configured when the app password is missing', async () => {
    delete process.env.GMAIL_APP_PASSWORD
    const res = await request(app()).get('/api/email/status').set('Host', HOST)
    expect(res.body).toEqual({ configured: false, from: null })
  })

  it('answers 405 to anything but GET', async () => {
    const res = await request(app())
      .post('/api/email/status')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .send('{}')
    expect(res.status).toBe(405)
  })
})

describe('GET /api/invoices/:id/email-preview', () => {
  it('returns the Dutch defaults for a Dutch invoice', async () => {
    const server = app()
    const { id, invoiceNumber } = await createFinal(server, 'nl')
    const res = await preview(server, id)
    expect(res.status).toBe(200)
    expect(res.body.to).toBe('billing@acme.nl')
    expect(res.body.subject).toBe(`Factuur ${invoiceNumber} — NeoInsent AI`)
    expect(res.body.text).toMatch(/^Beste Jan de Vries,/)
    expect(res.body.text).toContain('18-11-2026')
    expect(res.body.text).toContain('€ 242,00')
    expect(res.body.text).toContain(`o.v.v. ${invoiceNumber}`)
  })

  it('returns the English defaults for an English invoice', async () => {
    const server = app()
    const { id, invoiceNumber } = await createFinal(server, 'en')
    const res = await preview(server, id)
    expect(res.status).toBe(200)
    expect(res.body.subject).toBe(`Invoice ${invoiceNumber} — NeoInsent AI`)
    expect(res.body.text).toMatch(/^Dear Jan de Vries,/)
    expect(res.body.text).toContain(`quoting ${invoiceNumber}`)
  })

  it('is 409 for a draft and 404 for unknown or malformed ids', async () => {
    const server = app()
    const { id } = await createDraft(server)
    expect((await preview(server, id)).status).toBe(409)
    expect((await preview(server, UNKNOWN_ID)).status).toBe(404)
    expect((await preview(server, 'nope')).status).toBe(404)
  })
})

describe('POST /api/invoices/:id/send', () => {
  it('emails the PDF to the snapshot address and records sent_at', async () => {
    const server = app()
    const { id, clientId, invoiceNumber } = await createFinal(server)
    // Edited after finalize: the invoice must still go to the address it was issued to.
    const edit = await request(server)
      .patch(`/api/clients/${clientId}`)
      .set('Host', HOST)
      .send({ ...ACME, email: 'new-address@acme.nl' })
    expect(edit.status).toBe(200)

    let attachmentExisted = false
    sendMail.mockImplementation(async (mail: { attachments: { path: string }[] }) => {
      attachmentExisted = fs.existsSync(mail.attachments[0].path)
      return { messageId: '<x@gmail>' }
    })
    const sentAt = new Date(2026, 10, 5, 9, 15)
    vi.setSystemTime(sentAt)

    const res = await send(server, id)
    expect(res.status).toBe(200)
    expect(res.body.sentTo).toBe('billing@acme.nl')
    expect(res.body.invoice).toMatchObject({ id, sent_at: sentAt.toISOString() })

    expect(sendMail).toHaveBeenCalledTimes(1)
    const mail = sendMail.mock.calls[0][0]
    expect(mail.to).toBe('billing@acme.nl')
    expect(mail.from).toBe('"NeoInsent AI" <finance@neoinsentai.com>')
    expect(mail.replyTo).toBe('finance@neoinsentai.com')
    expect(mail.subject).toBe(`Factuur ${invoiceNumber} — NeoInsent AI`)
    expect(mail.text).toMatch(/^Beste Jan de Vries,/)
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe(`${invoiceNumber}.pdf`)
    expect(mail.attachments[0].filename).toMatch(/^NEO-\d{4}-\d{4,}\.pdf$/)
    expect(mail.attachments[0].path).toBe(path.join(getDataDir(), 'invoices', '2026', `${invoiceNumber}.pdf`))
    expect(attachmentExisted).toBe(true)

    expect((await getInvoice(id))?.sent_at).toBe(sentAt.toISOString())
  })

  it('re-creates a missing PDF before attaching it', async () => {
    const server = app()
    const { id, invoiceNumber } = await createFinal(server)
    const pdf = path.join(getDataDir(), 'invoices', '2026', `${invoiceNumber}.pdf`)
    fs.rmSync(pdf)

    const res = await send(server, id)
    expect(res.status).toBe(200)
    expect(fs.existsSync(pdf)).toBe(true)
  })

  it('uses a custom subject and text, trimmed', async () => {
    const server = app()
    const { id } = await createFinal(server)
    const res = await send(server, id, { subject: '  Your invoice  ', text: '\nHi Jan, see attached.\n' })
    expect(res.status).toBe(200)
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: 'Your invoice', text: 'Hi Jan, see attached.' })
  })

  it('uses the default text when only a subject is given', async () => {
    const server = app()
    const { id } = await createFinal(server)
    await send(server, id, { subject: 'Only the subject' })
    expect(sendMail.mock.calls[0][0].text).toMatch(/^Beste Jan de Vries,/)
  })

  it('refuses a draft with 409 and sends nothing', async () => {
    const server = app()
    const { id } = await createDraft(server)
    const res = await send(server, id)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Only finalized invoices can be emailed')
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('answers 404 for unknown and malformed ids', async () => {
    const server = app()
    expect((await send(server, UNKNOWN_ID)).status).toBe(404)
    expect((await send(server, 'not-a-uuid')).status).toBe(404)
  })

  it('answers 405 to GET', async () => {
    const server = app()
    const { id } = await createFinal(server)
    expect((await request(server).get(`/api/invoices/${id}/send`).set('Host', HOST)).status).toBe(405)
  })

  it('is 503 when email is not set up, and sends nothing', async () => {
    const server = app()
    const { id } = await createFinal(server)
    process.env.GMAIL_APP_PASSWORD = ''
    const res = await send(server, id)
    expect(res.status).toBe(503)
    expect(res.body.error).toBe("Email isn't set up yet — add your Gmail app password to the .env file (see README).")
    expect(sendMail).not.toHaveBeenCalled()
    expect(nodemailer.createTransport).not.toHaveBeenCalled()
    expect((await getInvoice(id))?.sent_at).toBeNull()
  })

  it('maps a Gmail login failure to 502 without leaking the password', async () => {
    const server = app()
    const { id } = await createFinal(server)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendMail.mockRejectedValue(
      smtpError(`Invalid login: 535 Username and Password not accepted (${PASSWORD})`, {
        code: 'EAUTH',
        responseCode: 535,
        response: `535-5.7.8 ${PASSWORD}`,
      }),
    )
    const res = await send(server, id)
    expect(res.status).toBe(502)
    expect(res.body).toEqual({
      error: 'Gmail rejected the login. Check GMAIL_USER and the app password in the .env file.',
    })
    expect(res.text).not.toContain(PASSWORD)
    expect(errorLog).toHaveBeenCalled()
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(PASSWORD)
    expect((await getInvoice(id))?.sent_at).toBeNull()
  })

  it('maps a timeout to 502 with the connection message', async () => {
    const server = app()
    const { id } = await createFinal(server)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sendMail.mockRejectedValue(smtpError('Connection timeout', { code: 'ETIMEDOUT' }))
    const res = await send(server, id)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Could not reach Gmail. Check your internet connection and try again.')
    expect((await getInvoice(id))?.sent_at).toBeNull()
  })

  it.each([
    [{ subject: 'x'.repeat(201) }, /Subject/],
    [{ text: 'x'.repeat(5001) }, /text/],
    [{ subject: '   ' }, /Subject/],
    [{ subject: 'Line\r\nBcc: someone@evil.test' }, /Subject/],
    [{ subject: 42 }, /Subject/],
    [{ text: null }, /text/],
    [[], /JSON object/],
  ])('rejects the body %j with 400 and sends nothing', async (body, message) => {
    const server = app()
    const { id } = await createFinal(server)
    const res = await send(server, id, body)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(message)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('accepts a subject of exactly 200 and a text of exactly 5000 characters', async () => {
    const server = app()
    const { id } = await createFinal(server)
    const res = await send(server, id, { subject: 's'.repeat(200), text: 't'.repeat(5000) })
    expect(res.status).toBe(200)
  })

  it('says the email went out (and not to resend) when recording sent_at throws', async () => {
    const server = app()
    const { id } = await createFinal(server)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(markInvoiceSent).mockRejectedValueOnce(new Error('database is locked'))
    const res = await send(server, id)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
    expect(res.body.error).toBe(
      "The email was sent to billing@acme.nl, but the app could not record it. Don't send it again.",
    )
    expect(errorLog).toHaveBeenCalled()
  })

  it('says the email went out (and not to resend) when the invoice is no longer final', async () => {
    const server = app()
    const { id } = await createFinal(server)
    vi.mocked(markInvoiceSent).mockResolvedValueOnce('not_final')
    const res = await send(server, id)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/was sent to billing@acme\.nl.*Don't send it again\./)
  })
})
