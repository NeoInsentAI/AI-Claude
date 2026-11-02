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

// Format check only (no VIES lookup, per spec): 2-letter country prefix
// followed by at least 2 more alphanumeric characters.
export function isPlausibleVatNumber(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{2,}$/.test(value.trim().toUpperCase())
}

export function determineVatTreatment(
  clientCountry: string,
  clientVatNumber: string | null,
): VatDetermination {
  const country = clientCountry.trim().toUpperCase()

  if (country === 'NL') {
    return { treatment: 'nl_standard', defaultRate: 21 }
  }

  if ((EU_COUNTRY_CODES as readonly string[]).includes(country)) {
    if (clientVatNumber && isPlausibleVatNumber(clientVatNumber)) {
      return { treatment: 'eu_reverse_charge', defaultRate: 0 }
    }
    return { treatment: 'blocked_missing_vat_number', defaultRate: null }
  }

  return { treatment: 'not_supported', defaultRate: null }
}
