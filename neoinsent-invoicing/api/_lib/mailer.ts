import nodemailer from 'nodemailer'
import { COMPANY } from './company'

// Sends email through the company's Google Workspace mailbox (GMAIL_USER, e.g.
// finance@neoinsentai.com) over Gmail SMTP with an app password (GMAIL_APP_PASSWORD), both read
// from the environment (server/index.ts loads them from .env). Sent mail lands in that mailbox's
// Sent folder. The password never appears in an error, a log line or a response.

export const NOT_CONFIGURED_MESSAGE =
  "Email isn't set up yet — add your Gmail app password to the .env file (see README)."
export const AUTH_FAILED_MESSAGE = 'Gmail rejected the login. Check GMAIL_USER and the app password in the .env file.'
export const CONNECTION_FAILED_MESSAGE = 'Could not reach Gmail. Check your internet connection and try again.'
export const SEND_FAILED_MESSAGE = 'The email could not be sent — Gmail refused it. Try again later.'

export type MailerErrorKind = 'not_configured' | 'auth' | 'connection' | 'other'

/** What may be logged about a failed send: SMTP codes and a message with secrets removed. */
export interface MailerLogDetail {
  code?: string
  responseCode?: number
  command?: string
  message: string
}

/**
 * A failed send. `message` is safe to show the user; `logDetail` is safe to log. Deliberately
 * carries no `cause`: the underlying nodemailer error can echo credentials.
 */
export class MailerError extends Error {
  readonly kind: MailerErrorKind
  readonly logDetail: MailerLogDetail

  constructor(kind: MailerErrorKind, message: string, logDetail: MailerLogDetail = { message }) {
    super(message)
    this.name = 'MailerError'
    this.kind = kind
    this.logDetail = logDetail
  }
}

const CONNECTION_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ESOCKET',
  'EDNS',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
])

function credentials(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER?.trim() ?? ''
  const pass = process.env.GMAIL_APP_PASSWORD?.trim() ?? ''
  return user && pass ? { user, pass } : null
}

/** True when both GMAIL_USER and GMAIL_APP_PASSWORD are set (non-empty). */
export function isEmailConfigured(): boolean {
  return credentials() !== null
}

/** The sending address when email is configured, else null. Never the password. */
export function emailSender(): string | null {
  return credentials()?.user ?? null
}

/** Removes the password (plain, without spaces, and as it appears base64-encoded in SMTP AUTH). */
function redactor(user: string, pass: string): (text: string) => string {
  const secrets = new Set<string>()
  for (const p of [pass, pass.replace(/\s+/g, '')]) {
    if (!p) continue
    secrets.add(p)
    secrets.add(Buffer.from(p).toString('base64'))
    secrets.add(Buffer.from(`\u0000${user}\u0000${p}`).toString('base64'))
  }
  const ordered = [...secrets].sort((a, b) => b.length - a.length)
  return (text) => ordered.reduce((acc, secret) => acc.split(secret).join('[redacted]'), text)
}

function toMailerError(error: unknown, redact: (text: string) => string): MailerError {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown
    responseCode?: unknown
    command?: unknown
    message?: unknown
  }
  const code = typeof e.code === 'string' ? e.code : undefined
  const responseCode = typeof e.responseCode === 'number' ? e.responseCode : undefined
  const logDetail: MailerLogDetail = {
    code,
    responseCode,
    command: typeof e.command === 'string' ? redact(e.command) : undefined,
    message: redact(typeof e.message === 'string' ? e.message : String(error)),
  }
  if (code === 'EAUTH' || responseCode === 535) return new MailerError('auth', AUTH_FAILED_MESSAGE, logDetail)
  if (code && CONNECTION_CODES.has(code)) return new MailerError('connection', CONNECTION_FAILED_MESSAGE, logDetail)
  return new MailerError('other', SEND_FAILED_MESSAGE, logDetail)
}

export interface InvoiceEmail {
  to: string
  subject: string
  text: string
  attachment: { filename: string; path: string }
}

/** Sends the email via Gmail SMTP. Rejects only with a MailerError. */
export async function sendInvoiceEmail({ to, subject, text, attachment }: InvoiceEmail): Promise<void> {
  const creds = credentials()
  if (!creds) throw new MailerError('not_configured', NOT_CONFIGURED_MESSAGE)
  const redact = redactor(creds.user, creds.pass)
  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })
    await transport.sendMail({
      from: `"${COMPANY.name}" <${creds.user}>`,
      replyTo: COMPANY.email,
      to,
      subject,
      text,
      attachments: [{ filename: attachment.filename, path: attachment.path, contentType: 'application/pdf' }],
    })
  } catch (error) {
    throw toMailerError(error, redact)
  }
}
