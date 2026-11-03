import { describe, expect, it } from 'vitest'
import { clientForInvoice, type ClientDetails } from './clientForInvoice'

const LIVE: ClientDetails = {
  name: 'Acme BV',
  contact_person: 'Jan',
  email: 'ap@acme.test',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: null,
  kvk_number: '12345678',
}

const SNAPSHOT: ClientDetails = { ...LIVE, name: 'Acme BV (at finalize)', email: 'old@acme.test' }

describe('clientForInvoice', () => {
  it('returns the live client for a draft', () => {
    expect(clientForInvoice({ status: 'draft', client: LIVE, client_snapshot: null })).toBe(LIVE)
  })

  it('returns the snapshot for a final invoice', () => {
    expect(clientForInvoice({ status: 'final', client: LIVE, client_snapshot: SNAPSHOT })).toBe(SNAPSHOT)
  })

  it('still returns the snapshot after the live client was edited', () => {
    const edited = { ...LIVE, name: 'Acme Holding BV', email: 'new@acme.test' }
    const result = clientForInvoice({ status: 'final', client: edited, client_snapshot: SNAPSHOT })
    expect(result).toBe(SNAPSHOT)
    expect(result?.email).toBe('old@acme.test')
  })

  it('falls back to the live client for a final invoice without a snapshot', () => {
    expect(clientForInvoice({ status: 'final', client: LIVE, client_snapshot: null })).toBe(LIVE)
  })
})
