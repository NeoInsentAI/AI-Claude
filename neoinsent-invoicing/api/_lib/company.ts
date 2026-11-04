/**
 * NeoInsent AI's fixed company details, printed on every invoice (and reused by e-mail).
 *
 * Deliberately has no OB-nummer: that number is derived from the owner's BSN, and the btw-id
 * (`vatNumber`) is the number Dutch invoices must show. Do not add it.
 *
 * Not snapshotted per invoice: when the PDF of an older final invoice is missing, it is
 * re-generated with the details below as they are *now*. Changing them later (e.g. after a move)
 * therefore changes regenerated PDFs of older invoices — keep the existing PDFs safe (Time Machine)
 * so they never need re-generating.
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
