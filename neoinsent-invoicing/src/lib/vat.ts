// The 26 other EU member states. The Netherlands is always the domestic case
// and is deliberately excluded here — see determineVatTreatment.
export const EU_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const

export type VatTreatment =
  | 'nl_standard'
  | 'eu_reverse_charge'
  // Covers three cases, any of which blocks reverse-charge treatment:
  // (1) no VAT number was given, (2) the VAT number doesn't match the
  // plausible-format check, or (3) the VAT number's own country prefix
  // doesn't match the client's declared country (e.g. a DE client with
  // an IE-prefixed VAT number — a likely data-entry mistake). Greek VAT
  // numbers use EL, not the ISO code GR (see vatPrefixForCountry).
  | 'blocked_missing_vat_number'
  | 'not_supported'

export interface VatDetermination {
  treatment: VatTreatment
  defaultRate: 21 | 0 | null
}

// The subset of VatTreatment that is actually storable on an invoice row —
// 'blocked_missing_vat_number' and 'not_supported' are form-validation states
// that never reach the database. Used by api/_lib/invoicesRepo.ts (a later task).
export type InvoiceVatTreatment = Extract<VatTreatment, 'nl_standard' | 'eu_reverse_charge'>

// Runtime type guard for InvoiceVatTreatment. Callers that received a
// VatTreatment from untyped/deserialized input (e.g. an API route) should
// use this instead of an `as InvoiceVatTreatment` cast, which would
// silently type-check even for 'blocked_missing_vat_number' or
// 'not_supported' values.
export function isInvoiceVatTreatment(t: VatTreatment): t is InvoiceVatTreatment {
  return t === 'nl_standard' || t === 'eu_reverse_charge'
}

// A Dutch (nl_standard) invoice may have 0% lines (reported in BTW rubriek 1e), but the invoice
// must then say why no VAT applies: the VAT note. Reverse-charge invoices already print their own
// note, so they never need one. Drafts may be saved without it; finalizing requires it.
export function needsVatNote(treatment: VatTreatment | null, vatRates: readonly number[]): boolean {
  return treatment === 'nl_standard' && vatRates.some((rate) => rate === 0)
}

export const MAX_VAT_NOTE_LENGTH = 200

export const VAT_NOTE_REQUIRED =
  'Add a VAT note explaining why a line has 0% VAT (e.g. the legal basis) — edit the draft to add it.'

// The prefix a country's VAT numbers start with. That's the ISO country code everywhere except
// Greece, whose VAT numbers use EL (the client country stays the ISO code GR).
export function vatPrefixForCountry(country: string): string {
  const code = country.trim().toUpperCase()
  return code === 'GR' ? 'EL' : code
}

// Format check only (no VIES lookup, per spec): 2-letter country prefix
// followed by at least 2 more alphanumeric characters.
export function isPlausibleVatNumber(value: string): boolean {
  if (typeof value !== 'string') {
    return false
  }
  return /^[A-Z]{2}[A-Z0-9]{2,}$/.test(value.trim().toUpperCase())
}

// Branches: NL client -> nl_standard at 21%. EU client (non-NL) with a VAT
// number that is plausibly formatted AND whose country prefix matches the
// declared client country -> eu_reverse_charge at 0%. EU client (non-NL)
// without such a matching, plausible VAT number -> blocked_missing_vat_number.
// Anything else (non-EU, non-NL country) -> not_supported.
export function determineVatTreatment(
  clientCountry: string,
  clientVatNumber: string | null,
): VatDetermination {
  if (typeof clientCountry !== 'string' || clientCountry.trim() === '') {
    return { treatment: 'not_supported', defaultRate: null }
  }

  const country = clientCountry.trim().toUpperCase()

  if (country === 'NL') {
    return { treatment: 'nl_standard', defaultRate: 21 }
  }

  if ((EU_COUNTRY_CODES as readonly string[]).includes(country)) {
    if (
      clientVatNumber &&
      isPlausibleVatNumber(clientVatNumber) &&
      clientVatNumber.trim().toUpperCase().startsWith(vatPrefixForCountry(country))
    ) {
      return { treatment: 'eu_reverse_charge', defaultRate: 0 }
    }
    return { treatment: 'blocked_missing_vat_number', defaultRate: null }
  }

  return { treatment: 'not_supported', defaultRate: null }
}
