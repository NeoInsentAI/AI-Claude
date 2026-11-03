import { getClientById } from './clientsRepo'
import { determineVatTreatment, type InvoiceVatTreatment, type VatTreatment } from '../../src/lib/vat'

export type ClientCheck = { ok: true } | { ok: false; error: string }

/** Explains why the draft's VAT treatment doesn't fit the client as stored now. */
export function vatMismatchMessage(expected: VatTreatment): string {
  switch (expected) {
    case 'blocked_missing_vat_number':
      return 'This client needs a valid VAT number matching their country before you can invoice them'
    case 'not_supported':
      return "This client's country isn't supported for invoicing"
    default:
      return `VAT treatment doesn't match this client (expected ${expected})`
  }
}

/**
 * Re-checks a draft against the stored client: catches an unknown client id and a stale or
 * tampered VAT treatment. Repository errors propagate to the caller. Finalize re-checks again.
 */
export async function checkClientForDraft(
  clientId: string,
  vatTreatment: InvoiceVatTreatment,
): Promise<ClientCheck> {
  const client = await getClientById(clientId)
  if (!client) return { ok: false, error: 'Client not found' }
  const expected = determineVatTreatment(client.country, client.vat_number).treatment
  if (expected !== vatTreatment) return { ok: false, error: vatMismatchMessage(expected) }
  return { ok: true }
}
