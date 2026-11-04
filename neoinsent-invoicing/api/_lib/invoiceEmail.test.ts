import { describe, expect, it } from 'vitest'
import { defaultInvoiceEmail, invoiceRecipient } from './invoiceEmail'

const BASE = {
  invoiceNumber: 'NEO-2026-0007',
  total: 1210,
  dueDate: '2026-12-02',
  clientName: 'Acme BV',
  contactPerson: null,
}

// formatCurrency uses a non-breaking space after the euro sign.
const AMOUNT = '€ 1.210,00'

describe('defaultInvoiceEmail (Dutch)', () => {
  it('has the Dutch subject', () => {
    const { subject } = defaultInvoiceEmail({ ...BASE, language: 'nl' })
    expect(subject).toBe('Factuur NEO-2026-0007 — NeoInsent AI')
  })

  it('greets the contact person when there is one', () => {
    const { text } = defaultInvoiceEmail({ ...BASE, language: 'nl', contactPerson: 'Jan de Vries' })
    expect(text.startsWith('Beste Jan de Vries,\n')).toBe(true)
  })

  it('greets the client by name otherwise', () => {
    const { text } = defaultInvoiceEmail({ ...BASE, language: 'nl', contactPerson: '  ' })
    expect(text.startsWith('Beste Acme BV,\n')).toBe(true)
  })

  it('states amount, due date, attachment, IBAN and reference, and signs off', () => {
    const { text } = defaultInvoiceEmail({ ...BASE, language: 'nl' })
    expect(text).toContain(AMOUNT)
    expect(text).toContain('02-12-2026')
    expect(text).toContain('bijlage')
    expect(text).toContain('NL62 BUNQ 2202 5896 86')
    expect(text).toContain('o.v.v. NEO-2026-0007')
    expect(text.endsWith('Met vriendelijke groet,\nEsteban Seravalli\nNeoInsent AI')).toBe(true)
  })
})

describe('defaultInvoiceEmail (English)', () => {
  it('has the English subject', () => {
    const { subject } = defaultInvoiceEmail({ ...BASE, language: 'en' })
    expect(subject).toBe('Invoice NEO-2026-0007 — NeoInsent AI')
  })

  it('greets the contact person, else the client', () => {
    expect(defaultInvoiceEmail({ ...BASE, language: 'en', contactPerson: 'Jane Doe' }).text).toMatch(/^Dear Jane Doe,\n/)
    expect(defaultInvoiceEmail({ ...BASE, language: 'en' }).text).toMatch(/^Dear Acme BV,\n/)
  })

  it('states amount, due date, attachment, IBAN and reference, and signs off', () => {
    const { text } = defaultInvoiceEmail({ ...BASE, language: 'en' })
    expect(text).toContain(AMOUNT)
    expect(text).toContain('02-12-2026')
    expect(text).toContain('attached')
    expect(text).toContain('NL62 BUNQ 2202 5896 86')
    expect(text).toContain('BUNQNL2A')
    expect(text).toContain('quoting NEO-2026-0007')
    expect(text.endsWith('Kind regards,\nEsteban Seravalli\nNeoInsent AI')).toBe(true)
  })
})

describe('invoiceRecipient', () => {
  const client = { email: 'live@acme.nl' }
  it('uses the snapshot email of a final invoice, not the live client', () => {
    expect(
      invoiceRecipient({ status: 'final', client_snapshot: { email: ' billing@acme.nl ' }, client }),
    ).toBe('billing@acme.nl')
  })

  it('is null when the snapshot has no email', () => {
    expect(invoiceRecipient({ status: 'final', client_snapshot: { email: '' }, client })).toBeNull()
    expect(invoiceRecipient({ status: 'final', client_snapshot: null, client })).toBeNull()
  })
})
