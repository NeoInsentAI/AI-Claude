/** The client fields printed on an invoice (same shape as the stored client snapshot). */
export interface ClientDetails {
  name: string
  contact_person: string | null
  email: string
  address_line: string
  postal_code: string
  city: string
  country: string
  vat_number: string | null
  kvk_number: string | null
}

/** Structural input so both the server repos and the frontend can call this without coupling. */
export interface InvoiceClientSource<C extends ClientDetails = ClientDetails> {
  status: 'draft' | 'final'
  /** The live client row (null if it could not be loaded). */
  client: C | null
  client_snapshot: ClientDetails | null
}

/**
 * The client details to show or print for an invoice: a final invoice uses the snapshot taken
 * when it was finalized (issued invoices never change); a draft uses the live client.
 */
export function clientForInvoice<C extends ClientDetails>(
  invoice: InvoiceClientSource<C>,
): ClientDetails | null {
  if (invoice.status === 'final') {
    if (invoice.client_snapshot) return invoice.client_snapshot
    // Data-integrity signal: every final invoice should carry the snapshot taken at finalize.
    console.warn('clientForInvoice: final invoice has no client_snapshot; falling back to the live client')
  }
  return invoice.client
}
