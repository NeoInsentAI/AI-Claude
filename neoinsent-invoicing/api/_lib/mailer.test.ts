// @vitest-environment node
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_FAILED_MESSAGE, CONNECTION_FAILED_MESSAGE, MailerError, isEmailConfigured, sendInvoiceEmail } from './mailer'

vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }))

const PASSWORD = 'abcdefghijklmnop'
const sendMail = vi.fn()
const saved = { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }

const INPUT = {
  to: 'billing@acme.nl',
  subject: 'Factuur NEO-2026-0001 — NeoInsent AI',
  text: 'Zie bijlage',
  attachment: { filename: 'NEO-2026-0001.pdf', path: '/data/invoices/2026/NEO-2026-0001.pdf' },
}

function smtpError(message: string, props: Record<string, unknown>): Error {
  return Object.assign(new Error(message), props)
}

async function caught(promise: Promise<unknown>): Promise<MailerError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(MailerError)
    return error as MailerError
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  process.env.GMAIL_USER = 'finance@neoinsentai.com'
  process.env.GMAIL_APP_PASSWORD = PASSWORD
  sendMail.mockReset().mockResolvedValue({ messageId: '<x@gmail>' })
  vi.mocked(nodemailer.createTransport).mockReset().mockReturnValue({ sendMail } as never)
})

afterEach(() => {
  for (const [key, value] of [['GMAIL_USER', saved.user], ['GMAIL_APP_PASSWORD', saved.pass]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('isEmailConfigured', () => {
  it('is true only when both variables are non-empty', () => {
    expect(isEmailConfigured()).toBe(true)
    process.env.GMAIL_APP_PASSWORD = '  '
    expect(isEmailConfigured()).toBe(false)
    delete process.env.GMAIL_APP_PASSWORD
    expect(isEmailConfigured()).toBe(false)
    process.env.GMAIL_APP_PASSWORD = PASSWORD
    process.env.GMAIL_USER = ''
    expect(isEmailConfigured()).toBe(false)
  })
})

describe('sendInvoiceEmail', () => {
  it('removes the spaces Google shows in the app password before logging in', async () => {
    process.env.GMAIL_APP_PASSWORD = ' abcd efgh\tijkl mnop '
    await sendInvoiceEmail(INPUT)
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: 'finance@neoinsentai.com', pass: 'abcdefghijklmnop' } }),
    )
  })

  it('sends through Gmail SMTP with timeouts, the PDF attached and a reply-to', async () => {
    await sendInvoiceEmail(INPUT)
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'finance@neoinsentai.com', pass: PASSWORD },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })
    expect(sendMail).toHaveBeenCalledWith({
      from: '"NeoInsent AI" <finance@neoinsentai.com>',
      replyTo: 'finance@neoinsentai.com',
      to: 'billing@acme.nl',
      subject: INPUT.subject,
      text: INPUT.text,
      attachments: [{ filename: 'NEO-2026-0001.pdf', path: INPUT.attachment.path, contentType: 'application/pdf' }],
    })
  })

  it('refuses without credentials and never builds a transport', async () => {
    delete process.env.GMAIL_APP_PASSWORD
    const error = await caught(sendInvoiceEmail(INPUT))
    expect(error.kind).toBe('not_configured')
    expect(nodemailer.createTransport).not.toHaveBeenCalled()
  })

  it('maps EAUTH to the Gmail login message', async () => {
    sendMail.mockRejectedValue(smtpError('Invalid login: 535-5.7.8 Username and Password not accepted', { code: 'EAUTH', responseCode: 535 }))
    const error = await caught(sendInvoiceEmail(INPUT))
    expect(error.kind).toBe('auth')
    expect(error.message).toBe(AUTH_FAILED_MESSAGE)
    expect(AUTH_FAILED_MESSAGE).toBe('Gmail rejected the login. Check GMAIL_USER and the app password in the .env file.')
  })

  it('maps a bare 535 response code to the Gmail login message', async () => {
    sendMail.mockRejectedValue(smtpError('rejected', { responseCode: 535 }))
    expect((await caught(sendInvoiceEmail(INPUT))).kind).toBe('auth')
  })

  it.each(['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'])(
    'maps %s to the connection message',
    async (code) => {
      sendMail.mockRejectedValue(smtpError('Connection timeout', { code }))
      const error = await caught(sendInvoiceEmail(INPUT))
      expect(error.kind).toBe('connection')
      expect(error.message).toBe(CONNECTION_FAILED_MESSAGE)
      expect(CONNECTION_FAILED_MESSAGE).toBe('Could not reach Gmail. Check your internet connection and try again.')
    },
  )

  it('maps anything else to a generic failure', async () => {
    sendMail.mockRejectedValue(smtpError('Message rejected', { code: 'EMESSAGE', responseCode: 552 }))
    const error = await caught(sendInvoiceEmail(INPUT))
    expect(error.kind).toBe('other')
    expect(error.message).toMatch(/could not be sent/)
  })

  it('never leaks the password, even when the underlying error contains it', async () => {
    const base64 = Buffer.from(`\u0000finance@neoinsentai.com\u0000${PASSWORD}`).toString('base64')
    sendMail.mockRejectedValue(
      smtpError(`Invalid login for finance@neoinsentai.com:${PASSWORD} (${base64})`, {
        code: 'EAUTH',
        responseCode: 535,
        response: `535 ${PASSWORD}`,
        command: `AUTH PLAIN ${base64}`,
      }),
    )
    const error = await caught(sendInvoiceEmail(INPUT))
    const everything = [error.message, error.stack, JSON.stringify(error), JSON.stringify(error.logDetail), String(error)].join('\n')
    expect(everything).not.toContain(PASSWORD)
    expect(everything).not.toContain(base64)
    expect(error.logDetail.code).toBe('EAUTH')
    expect(error.logDetail.message).toContain('[redacted]')
    expect(error).not.toHaveProperty('cause')
  })
})
