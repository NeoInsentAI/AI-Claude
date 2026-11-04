import { describe, expect, it } from 'vitest'
import type { LineItemRow } from '../components/InvoiceLineItems'
import {
  addDaysIso,
  canSave,
  itemsForApi,
  normalizeRatesForTreatment,
  rowsFromInvoiceItems,
  todayLocalIso,
  trimmedOrNull,
  type InvoiceFormState,
} from './invoiceForm'

describe('todayLocalIso', () => {
  it('uses the local calendar date', () => {
    expect(todayLocalIso(new Date(2026, 10, 3, 14, 30))).toBe('2026-11-03')
  })

  it('stays on the local date just after midnight', () => {
    // 00:05 local time; toISOString() would give the previous day east of UTC.
    expect(todayLocalIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })

  it('stays on the local date just before midnight', () => {
    expect(todayLocalIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('zero-pads month and day', () => {
    expect(todayLocalIso(new Date(2026, 1, 7, 12))).toBe('2026-02-07')
  })
})

describe('addDaysIso', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-11-20', 14)).toBe('2026-12-04')
  })

  it('adds days across a year boundary', () => {
    expect(addDaysIso('2026-12-25', 14)).toBe('2027-01-08')
  })

  it('handles the DST switch without drifting a day', () => {
    // Europe/Amsterdam leaves DST on 2026-10-25.
    expect(addDaysIso('2026-10-20', 14)).toBe('2026-11-03')
    expect(addDaysIso('2026-03-25', 14)).toBe('2026-04-08')
  })
})

const ROWS: LineItemRow[] = [
  { key: 'a', description: 'Consulting', quantity: 2, unitPrice: 100, vatRate: 21 },
  { key: 'b', description: 'Books', quantity: 1, unitPrice: 25.5, vatRate: 9 },
]

describe('trimmedOrNull', () => {
  it('trims text and turns empty or blank text into null', () => {
    expect(trimmedOrNull('  October 2026 ')).toBe('October 2026')
    expect(trimmedOrNull('')).toBeNull()
    expect(trimmedOrNull('   ')).toBeNull()
  })
})

describe('rowsFromInvoiceItems / itemsForApi', () => {
  it('maps snake_case items to editor rows with keys', () => {
    const rows = rowsFromInvoiceItems([
      { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
      { description: 'Books', quantity: 1, unit_price: 25.5, vat_rate: 9 },
    ])
    expect(rows.map(({ key: _key, ...rest }) => rest)).toEqual([
      { description: 'Consulting', quantity: 2, unitPrice: 100, vatRate: 21 },
      { description: 'Books', quantity: 1, unitPrice: 25.5, vatRate: 9 },
    ])
    expect(rows[0].key).toBeTruthy()
    expect(rows[0].key).not.toBe(rows[1].key)
  })

  it('maps rows to API items, dropping the key and trimming descriptions', () => {
    expect(itemsForApi([{ ...ROWS[0], description: '  Consulting  ' }])).toEqual([
      { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
    ])
  })

  it('round-trips', () => {
    const items = [
      { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
      { description: 'Books', quantity: 1.5, unit_price: 25.5, vat_rate: 9 },
    ]
    expect(itemsForApi(rowsFromInvoiceItems(items))).toEqual(items)
  })
})

describe('normalizeRatesForTreatment', () => {
  it('forces every line to 0% for reverse charge', () => {
    const out = normalizeRatesForTreatment(ROWS, 'eu_reverse_charge', 'nl_standard')
    expect(out.map((r) => r.vatRate)).toEqual([0, 0])
    expect(out.map((r) => r.description)).toEqual(['Consulting', 'Books'])
  })

  it('resets every line to 21% when switching from reverse charge to NL standard', () => {
    const zeroed = ROWS.map((r) => ({ ...r, vatRate: 0 }))
    expect(normalizeRatesForTreatment(zeroed, 'nl_standard', 'eu_reverse_charge').map((r) => r.vatRate)).toEqual([
      21, 21,
    ])
  })

  it('keeps chosen rates when staying on NL standard', () => {
    expect(normalizeRatesForTreatment(ROWS, 'nl_standard', 'nl_standard')).toEqual(ROWS)
  })

  it('keeps rates when moving to a treatment that cannot be saved', () => {
    expect(normalizeRatesForTreatment(ROWS, 'blocked_missing_vat_number', 'nl_standard')).toEqual(ROWS)
  })
})

const CLIENT = {
  id: '1',
  name: 'Acme BV',
  email: 'ap@acme.test',
  address_line: 'Main St 1',
  postal_code: '1000AA',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: null,
  kvk_number: null,
  contact_person: null,
}

function state(patch: Partial<InvoiceFormState> = {}): InvoiceFormState {
  return {
    client: CLIENT,
    treatment: 'nl_standard',
    rows: ROWS,
    issueDate: '2026-11-03',
    dueDate: '2026-11-17',
    ...patch,
  }
}

describe('canSave', () => {
  it('accepts a complete form', () => {
    expect(canSave(state())).toEqual({ ok: true })
  })

  it('accepts a due date equal to the issue date', () => {
    expect(canSave(state({ dueDate: '2026-11-03' }))).toEqual({ ok: true })
  })

  it('accepts a zero unit price', () => {
    expect(canSave(state({ rows: [{ ...ROWS[0], unitPrice: 0 }] }))).toEqual({ ok: true })
  })

  it('names the offending line for amount checks', () => {
    expect(canSave(state({ rows: [ROWS[0], { ...ROWS[1], quantity: 0 }] }))).toEqual({
      ok: false,
      reason: 'Line 2: quantity must be more than 0.',
    })
    expect(canSave(state({ rows: [ROWS[0], { ...ROWS[1], unitPrice: -1 }] }))).toEqual({
      ok: false,
      reason: "Line 2: price can't be negative.",
    })
  })

  it.each([
    ['no client', { client: null, treatment: null }, /client/i],
    ['blocked treatment', { treatment: 'blocked_missing_vat_number' as const }, /VAT number/i],
    ['unsupported country', { treatment: 'not_supported' as const }, /country/i],
    ['no lines', { rows: [] }, /line/i],
    ['empty description', { rows: [{ ...ROWS[0], description: '   ' }] }, /description/i],
    ['non-finite amount', { rows: [{ ...ROWS[0], quantity: Number.NaN }] }, /amount/i],
    ['infinite total', { rows: [{ ...ROWS[0], quantity: 1e308, unitPrice: 1e308 }] }, /amount/i],
    ['zero quantity', { rows: [{ ...ROWS[0], quantity: 0 }] }, /quantity must be more than 0/],
    ['negative quantity', { rows: [{ ...ROWS[0], quantity: -1 }] }, /quantity must be more than 0/],
    ['negative unit price', { rows: [{ ...ROWS[0], unitPrice: -5 }] }, /price can't be negative/],
    ['due before issue', { dueDate: '2026-11-02' }, /due date/i],
    ['missing issue date', { issueDate: '' }, /issue date/i],
    ['missing due date', { dueDate: '' }, /due date/i],
  ])('rejects %s', (_name, patch, reason) => {
    const result = canSave(state(patch))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(reason)
  })
})
