/**
 * NeoInsent AI's fixed company details, printed on every invoice (and reused by e-mail).
 *
 * Deliberately has no OB-nummer: that number is derived from the owner's BSN, and the btw-id
 * (`vatNumber`) is the number Dutch invoices must show. Do not add it.
 */
export const COMPANY = {
  name: 'NeoInsent AI',
  addressLine: 'Wagenlaan 2',
  postalCode: '6225KE',
  city: 'Maastricht',
  country: 'NL',
  email: 'finance@neoinsentai.com',
  contactPerson: 'Esteban Seravalli',
  kvkNumber: '96887176',
  vatNumber: 'NL005235763B30',
  branchNumber: '000062171925',
  iban: 'NL62BUNQ2202589686',
  bic: 'BUNQNL2A',
} as const

/** IBAN in the usual groups of four for printing ("NL62 BUNQ 2202 5896 86"). */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}
