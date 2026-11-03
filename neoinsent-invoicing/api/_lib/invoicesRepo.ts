import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { computeInvoiceTotals, computeLine } from '../../src/lib/invoiceMath'
import type { InvoiceVatTreatment } from '../../src/lib/vat'

export interface InvoiceItemInput {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export interface DraftInvoiceInput {
  client_id: string
  language: 'nl' | 'en'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  due_date: string
  notes: string | null
  items: InvoiceItemInput[]
}

export interface InvoiceSummary {
  id: string
  invoice_number: string | null
  client_id: string
  status: 'draft' | 'final'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  subtotal: number
  vat_amount: number
  total: number
  paid: boolean
}

// invoiceMath works in camelCase; DB/API items are snake_case.
function toLineInput(item: InvoiceItemInput) {
  return { quantity: item.quantity, unitPrice: item.unit_price, vatRate: item.vat_rate }
}

export async function createDraftInvoice(input: DraftInvoiceInput) {
  const totals = computeInvoiceTotals(input.items.map(toLineInput))
  const admin = getSupabaseAdmin()

  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .insert({
      client_id: input.client_id,
      status: 'draft',
      language: input.language,
      vat_treatment: input.vat_treatment,
      issue_date: input.issue_date,
      due_date: input.due_date,
      notes: input.notes,
      subtotal: totals.subtotal,
      vat_amount: totals.vatAmount,
      total: totals.total,
    })
    .select()
    .single()
  if (invoiceError) throw new Error(invoiceError.message)

  const itemRows = input.items.map((item, index) => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    vat_rate: item.vat_rate,
    line_total: computeLine(toLineInput(item)).lineTotal,
    sort_order: index,
  }))
  const { error: itemsError } = await admin.from('invoice_items').insert(itemRows)
  if (itemsError) {
    // No transaction across the two inserts: remove the invoice so a failed
    // create doesn't leave an orphan draft with no lines.
    const { error: cleanupError } = await admin.from('invoices').delete().eq('id', invoice.id)
    if (cleanupError) {
      console.error(`Failed to remove orphan draft invoice ${invoice.id}`, cleanupError)
    }
    throw new Error(itemsError.message)
  }

  return invoice
}

export interface ListInvoicesFilter {
  fromDate?: string
  toDate?: string
}

export async function listInvoices(filter: ListInvoicesFilter = {}): Promise<InvoiceSummary[]> {
  let query = getSupabaseAdmin()
    .from('invoices')
    .select(
      'id, invoice_number, client_id, status, vat_treatment, issue_date, subtotal, vat_amount, total, paid',
    )
    .order('issue_date', { ascending: false })
    // Tie-breaker so invoices sharing an issue date list in a stable order.
    .order('created_at', { ascending: false })

  if (filter.fromDate) query = query.gte('issue_date', filter.fromDate)
  if (filter.toDate) query = query.lte('issue_date', filter.toDate)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as InvoiceSummary[]
}
