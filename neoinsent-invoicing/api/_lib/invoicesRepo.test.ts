import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraftInvoice, listInvoices, type DraftInvoiceInput } from './invoicesRepo'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

vi.mock('../../src/lib/supabaseAdmin')

type Result = { data: unknown; error: { message: string } | null }

// A minimal stand-in for the Supabase query builder. Every builder method is
// recorded as [table, method, ...args] and returns the builder, so chains work.
// Each from(table) takes the next queued result for that table (or
// { data: null, error: null }); the builder is that resolved promise, so both
// `.single()` and awaiting the chain directly yield it.
function createFakeSupabase() {
  const calls: unknown[][] = []
  const results: Record<string, Result[]> = {}

  function builder(table: string) {
    const result = results[table]?.shift() ?? { data: null, error: null }
    const b: any = Promise.resolve(result)
    for (const method of ['insert', 'select', 'delete', 'eq', 'order', 'gte', 'lte']) {
      b[method] = (...args: unknown[]) => {
        calls.push([table, method, ...args])
        return b
      }
    }
    b.single = () => b
    return b
  }

  const client = {
    from: (table: string) => {
      calls.push([table, 'from'])
      return builder(table)
    },
  }
  return {
    client,
    calls,
    queue: (table: string, result: Result) => (results[table] ??= []).push(result),
    callsTo: (table: string, method: string) =>
      calls.filter((c) => c[0] === table && c[1] === method).map((c) => c.slice(2)),
  }
}

const INVOICE_ID = 'inv-1'

const mixedDraft: DraftInvoiceInput = {
  client_id: 'client-1',
  language: 'nl',
  vat_treatment: 'nl_standard',
  issue_date: '2026-11-02',
  due_date: '2026-11-16',
  notes: null,
  items: [
    // 2 x 100.00 = 200.00, 21% VAT 42.00, line total 242.00
    { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
    // 3 x 19.99 = 59.97, 9% VAT 5.3973 -> 5.40, line total 65.37
    { description: 'Books', quantity: 3, unit_price: 19.99, vat_rate: 9 },
  ],
}

let fake: ReturnType<typeof createFakeSupabase>

beforeEach(() => {
  vi.clearAllMocks()
  fake = createFakeSupabase()
  vi.mocked(getSupabaseAdmin).mockReturnValue(fake.client as any)
})

describe('createDraftInvoice', () => {
  it('stores exact totals for a mixed 21%/9% draft and links the item rows', async () => {
    fake.queue('invoices', { data: { id: INVOICE_ID }, error: null })

    const invoice = await createDraftInvoice(mixedDraft)

    expect(invoice).toEqual({ id: INVOICE_ID })
    const [[invoiceRow]] = fake.callsTo('invoices', 'insert') as any
    expect(invoiceRow).toMatchObject({
      client_id: 'client-1',
      status: 'draft',
      subtotal: 259.97,
      vat_amount: 47.4,
      total: 307.37,
    })

    const [[itemRows]] = fake.callsTo('invoice_items', 'insert') as any
    expect(itemRows).toEqual([
      expect.objectContaining({ invoice_id: INVOICE_ID, line_total: 242, sort_order: 0 }),
      expect.objectContaining({ invoice_id: INVOICE_ID, line_total: 65.37, sort_order: 1 }),
    ])
    expect(fake.callsTo('invoices', 'delete')).toHaveLength(0)
  })

  it('removes the invoice and rethrows when the item insert fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.queue('invoices', { data: { id: INVOICE_ID }, error: null })
    fake.queue('invoice_items', { data: null, error: { message: 'items insert failed' } })

    await expect(createDraftInvoice(mixedDraft)).rejects.toThrow('items insert failed')

    expect(fake.callsTo('invoices', 'delete')).toHaveLength(1)
    expect(fake.callsTo('invoices', 'eq')).toEqual([['id', INVOICE_ID]])
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('listInvoices', () => {
  it('orders by issue date then creation time, newest first', async () => {
    fake.queue('invoices', { data: [], error: null })

    await listInvoices({ fromDate: '2026-01-01', toDate: '2026-03-31' })

    expect(fake.callsTo('invoices', 'order')).toEqual([
      ['issue_date', { ascending: false }],
      ['created_at', { ascending: false }],
    ])
    expect(fake.callsTo('invoices', 'gte')).toEqual([['issue_date', '2026-01-01']])
    expect(fake.callsTo('invoices', 'lte')).toEqual([['issue_date', '2026-03-31']])
  })
})
