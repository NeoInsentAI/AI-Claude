import { isPlausibleVatNumber } from '../../src/lib/vat'
import type { NewClient } from './clientsRepo'

export type NormalizeClientInputResult =
  | { ok: true; value: NewClient }
  | { ok: false; error: string }

const REQUIRED_FIELDS = [
  'name', 'email', 'address_line', 'postal_code', 'city', 'country',
] as const

const COUNTRY_CODE = /^[A-Z]{2}$/
const EMAIL = /^[^\s@]+@[^\s@]+$/

function optionalTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// Validates and normalizes a client create payload before it is stored.
// Stored values are printed verbatim on invoices and the ICP report, so
// casing/whitespace is fixed here rather than at display time.
// Note: does NOT check that the VAT prefix matches the country —
// determineVatTreatment handles that and surfaces it on the invoice form.
export function normalizeClientInput(body: unknown): NormalizeClientInputResult {
  const input = (body !== null && typeof body === 'object' ? body : {}) as Record<string, unknown>

  const required: Partial<Record<(typeof REQUIRED_FIELDS)[number], string>> = {}
  const missing: string[] = []
  for (const key of REQUIRED_FIELDS) {
    const raw = input[key]
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (trimmed === '') missing.push(key)
    else required[key] = trimmed
  }
  if (missing.length > 0) {
    return { ok: false, error: `Missing fields: ${missing.join(', ')}` }
  }

  const country = required.country!.toUpperCase()
  if (!COUNTRY_CODE.test(country)) {
    return { ok: false, error: 'Country must be a 2-letter ISO code, e.g. NL' }
  }

  if (!EMAIL.test(required.email!)) {
    return { ok: false, error: 'Email address looks invalid' }
  }

  let vatNumber: string | null = null
  if (typeof input.vat_number === 'string') {
    const compact = input.vat_number.replace(/[\s.-]/g, '').toUpperCase()
    if (compact !== '') {
      if (!isPlausibleVatNumber(compact)) {
        return {
          ok: false,
          error:
            'VAT number looks invalid — expected a 2-letter country prefix followed by digits/letters, e.g. DE123456789',
        }
      }
      vatNumber = compact
    }
  }

  return {
    ok: true,
    value: {
      name: required.name!,
      contact_person: optionalTrimmed(input.contact_person),
      email: required.email!,
      address_line: required.address_line!,
      postal_code: required.postal_code!,
      city: required.city!,
      country,
      vat_number: vatNumber,
      kvk_number: optionalTrimmed(input.kvk_number),
    },
  }
}
