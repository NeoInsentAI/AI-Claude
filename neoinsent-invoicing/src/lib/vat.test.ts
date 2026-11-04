import { describe, expect, it } from 'vitest'
import {
  EU_COUNTRY_CODES,
  needsVatNote,
  determineVatTreatment,
  isInvoiceVatTreatment,
  isPlausibleVatNumber,
} from './vat'

describe('EU_COUNTRY_CODES', () => {
  it('has 26 entries and does not include NL', () => {
    expect(EU_COUNTRY_CODES).toHaveLength(26)
    expect(EU_COUNTRY_CODES).not.toContain('NL')
  })

  it('includes known member states', () => {
    expect(EU_COUNTRY_CODES).toContain('DE')
    expect(EU_COUNTRY_CODES).toContain('FR')
    expect(EU_COUNTRY_CODES).toContain('IE')
  })
})

describe('isPlausibleVatNumber', () => {
  it('accepts a country-prefixed alphanumeric VAT number', () => {
    expect(isPlausibleVatNumber('DE123456789')).toBe(true)
    expect(isPlausibleVatNumber('IE1234567X')).toBe(true)
  })

  it('rejects numbers without a 2-letter country prefix', () => {
    expect(isPlausibleVatNumber('123456789')).toBe(false)
  })

  it('rejects empty or too-short values', () => {
    expect(isPlausibleVatNumber('')).toBe(false)
    expect(isPlausibleVatNumber('DE')).toBe(false)
  })

  it('trims and uppercases before validating', () => {
    expect(isPlausibleVatNumber(' de123456789 ')).toBe(true)
  })

  it('returns false instead of throwing for non-string input', () => {
    expect(isPlausibleVatNumber(null as any)).toBe(false)
    expect(isPlausibleVatNumber(undefined as any)).toBe(false)
    expect(isPlausibleVatNumber(123456789 as any)).toBe(false)
  })
})

describe('isInvoiceVatTreatment', () => {
  it('returns true for the two storable treatments', () => {
    expect(isInvoiceVatTreatment('nl_standard')).toBe(true)
    expect(isInvoiceVatTreatment('eu_reverse_charge')).toBe(true)
  })

  it('returns false for the two non-storable treatments', () => {
    expect(isInvoiceVatTreatment('blocked_missing_vat_number')).toBe(false)
    expect(isInvoiceVatTreatment('not_supported')).toBe(false)
  })
})

describe('determineVatTreatment', () => {
  it('returns nl_standard for an NL client regardless of VAT number', () => {
    expect(determineVatTreatment('NL', null)).toEqual({ treatment: 'nl_standard', defaultRate: 21 })
    expect(determineVatTreatment('NL', 'NL001234567B01')).toEqual({
      treatment: 'nl_standard',
      defaultRate: 21,
    })
  })

  it('returns eu_reverse_charge for an EU client with a plausible VAT number', () => {
    expect(determineVatTreatment('DE', 'DE123456789')).toEqual({
      treatment: 'eu_reverse_charge',
      defaultRate: 0,
    })
  })

  it('returns blocked for an EU client with no VAT number', () => {
    expect(determineVatTreatment('DE', null)).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('returns blocked for an EU client with an implausible VAT number', () => {
    expect(determineVatTreatment('DE', '123')).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('returns not_supported for a non-EU, non-NL country', () => {
    expect(determineVatTreatment('US', null)).toEqual({
      treatment: 'not_supported',
      defaultRate: null,
    })
  })

  it('trims and uppercases both the country and the VAT number before matching', () => {
    expect(determineVatTreatment(' de ', 'de123456789')).toEqual({
      treatment: 'eu_reverse_charge',
      defaultRate: 0,
    })
  })

  it('blocks an EU client whose VAT number prefix does not match the declared country', () => {
    expect(determineVatTreatment('DE', 'IE1234567X')).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('expects the EL prefix for a Greek (GR) client, as Greek VAT numbers use EL', () => {
    expect(determineVatTreatment('GR', 'EL123456789')).toEqual({
      treatment: 'eu_reverse_charge',
      defaultRate: 0,
    })
    expect(determineVatTreatment(' gr ', 'el123456789')).toEqual({
      treatment: 'eu_reverse_charge',
      defaultRate: 0,
    })
  })

  it('blocks a Greek client whose VAT number uses the ISO prefix GR instead of EL', () => {
    expect(determineVatTreatment('GR', 'GR123456789')).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('does not accept an EL-prefixed VAT number for a non-Greek client', () => {
    expect(determineVatTreatment('DE', 'EL123456789')).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('returns not_supported instead of throwing for non-string clientCountry', () => {
    expect(determineVatTreatment(null as any, null)).toEqual({
      treatment: 'not_supported',
      defaultRate: null,
    })
    expect(determineVatTreatment(undefined as any, null)).toEqual({
      treatment: 'not_supported',
      defaultRate: null,
    })
    expect(determineVatTreatment(42 as any, null)).toEqual({
      treatment: 'not_supported',
      defaultRate: null,
    })
  })
})

describe('needsVatNote', () => {
  it('is true for a Dutch invoice with at least one 0% line', () => {
    expect(needsVatNote('nl_standard', [21, 0])).toBe(true)
    expect(needsVatNote('nl_standard', [0])).toBe(true)
  })

  it('is false for a Dutch invoice without 0% lines', () => {
    expect(needsVatNote('nl_standard', [21, 9])).toBe(false)
    expect(needsVatNote('nl_standard', [])).toBe(false)
  })

  it('is false for reverse charge (the reverse-charge note already explains it) and other treatments', () => {
    expect(needsVatNote('eu_reverse_charge', [0])).toBe(false)
    expect(needsVatNote('not_supported', [0])).toBe(false)
    expect(needsVatNote(null, [0])).toBe(false)
  })
})
