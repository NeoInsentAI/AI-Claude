import { describe, expect, it } from 'vitest'
import { normalizeClientInput } from './normalizeClientInput'

const completeInput = {
  name: 'Acme BV',
  email: 'ap@acme.test',
  address_line: 'Main St 1',
  postal_code: '1000AA',
  city: 'Amsterdam',
  country: 'NL',
}

describe('normalizeClientInput', () => {
  it('passes a valid complete input through, trimmed', () => {
    const result = normalizeClientInput({
      name: '  Acme BV ',
      email: ' ap@acme.test ',
      address_line: ' Main St 1 ',
      postal_code: ' 1000AA ',
      city: ' Amsterdam ',
      country: ' NL ',
      contact_person: ' Jan ',
      vat_number: ' NL123456789B01 ',
      kvk_number: ' 12345678 ',
      extra: 'ignored',
    })
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Acme BV',
        email: 'ap@acme.test',
        address_line: 'Main St 1',
        postal_code: '1000AA',
        city: 'Amsterdam',
        country: 'NL',
        contact_person: 'Jan',
        vat_number: 'NL123456789B01',
        kvk_number: '12345678',
      },
    })
  })

  it('rejects a blank-string required field as missing', () => {
    const result = normalizeClientInput({ ...completeInput, city: '   ' })
    expect(result).toEqual({ ok: false, error: 'Missing fields: city' })
  })

  it('rejects a non-string required field as missing', () => {
    const result = normalizeClientInput({ ...completeInput, name: 42, postal_code: {} })
    expect(result).toEqual({ ok: false, error: 'Missing fields: name, postal_code' })
  })

  it('reports all missing fields for a non-object body', () => {
    const result = normalizeClientInput(undefined)
    expect(result).toEqual({
      ok: false,
      error: 'Missing fields: name, email, address_line, postal_code, city, country',
    })
  })

  it('normalizes a lowercase/padded country code', () => {
    const result = normalizeClientInput({ ...completeInput, country: ' de ' })
    expect(result.ok && result.value.country).toBe('DE')
  })

  it('rejects an invalid country', () => {
    const result = normalizeClientInput({ ...completeInput, country: 'Netherlands' })
    expect(result).toEqual({ ok: false, error: 'Country must be a 2-letter ISO code, e.g. NL' })
  })

  it.each(['a@b.nl,c@d.nl', 'a@b.nl;c@d.nl', 'a,b@c.nl', 'a@b.nl, c@d.nl', 'a@nodot', 'a@b.nl;'])(
    'rejects %j (one address only, with a dotted domain)',
    (email) => {
      expect(normalizeClientInput({ ...completeInput, email })).toEqual({
        ok: false,
        error: 'Email address looks invalid',
      })
    },
  )

  it('rejects an invalid email', () => {
    const result = normalizeClientInput({ ...completeInput, email: 'not an email' })
    expect(result).toEqual({ ok: false, error: 'Email address looks invalid' })
  })

  it('strips spaces, dots and dashes from the VAT number and uppercases it', () => {
    const result = normalizeClientInput({ ...completeInput, vat_number: ' de 123.456.789 ' })
    expect(result.ok && result.value.vat_number).toBe('DE123456789')
    const dashed = normalizeClientInput({ ...completeInput, vat_number: 'DE 123.456-789' })
    expect(dashed.ok && dashed.value.vat_number).toBe('DE123456789')
  })

  it('rejects an implausible VAT number', () => {
    const result = normalizeClientInput({ ...completeInput, vat_number: '12345' })
    expect(result).toEqual({
      ok: false,
      error:
        'VAT number looks invalid — expected a 2-letter country prefix followed by digits/letters, e.g. DE123456789',
    })
  })

  it('stores empty-string vat/kvk/contact as null', () => {
    const result = normalizeClientInput({
      ...completeInput,
      vat_number: '',
      kvk_number: '  ',
      contact_person: '',
    })
    expect(result.ok && result.value).toMatchObject({
      vat_number: null,
      kvk_number: null,
      contact_person: null,
    })
  })

  it('stores missing optional fields as null', () => {
    const result = normalizeClientInput({ ...completeInput })
    expect(result.ok && result.value).toMatchObject({
      vat_number: null,
      kvk_number: null,
      contact_person: null,
    })
  })
})
