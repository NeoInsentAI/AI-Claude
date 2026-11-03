import { describe, expect, it } from 'vitest'
import { validateDraftInvoice } from './validateDraftInvoice'

const CLIENT_ID = '0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6f'

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    client_id: CLIENT_ID,
    language: 'nl',
    vat_treatment: 'nl_standard',
    issue_date: '2026-11-02',
    due_date: '2026-11-16',
    notes: '  Thanks!  ',
    items: [{ description: ' Consulting ', quantity: 2, unit_price: 100, vat_rate: 21 }],
    ...overrides,
  }
}

function item(overrides: Record<string, unknown> = {}) {
  return { description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 21, ...overrides }
}

function expectError(body: unknown, pattern: RegExp) {
  const result = validateDraftInvoice(body)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toMatch(pattern)
}

describe('validateDraftInvoice', () => {
  it('accepts a valid body and normalizes it', () => {
    const result = validateDraftInvoice({ ...validBody(), extra: 'ignored' })
    expect(result).toEqual({
      ok: true,
      value: {
        client_id: CLIENT_ID,
        language: 'nl',
        vat_treatment: 'nl_standard',
        issue_date: '2026-11-02',
        due_date: '2026-11-16',
        notes: 'Thanks!',
        items: [{ description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 }],
      },
    })
  })

  it('drops unknown keys on items', () => {
    const result = validateDraftInvoice(validBody({ items: [item({ id: 'x', line_total: 999 })] }))
    expect(result.ok && result.value.items[0]).toEqual({
      description: 'Consulting',
      quantity: 1,
      unit_price: 100,
      vat_rate: 21,
    })
  })

  it('rejects a non-object body', () => {
    expectError(null, /client/i)
    expectError('nope', /client/i)
  })

  it('rejects a missing or non-UUID client_id', () => {
    expectError(validBody({ client_id: undefined }), /client/i)
    expectError(validBody({ client_id: '1' }), /client/i)
    expectError(validBody({ client_id: 42 }), /client/i)
  })

  it('rejects an unknown language', () => {
    expectError(validBody({ language: 'de' }), /language/i)
    expectError(validBody({ language: undefined }), /language/i)
  })

  it('rejects a VAT treatment that cannot be stored on an invoice', () => {
    expectError(validBody({ vat_treatment: 'blocked_missing_vat_number' }), /vat treatment/i)
    expectError(validBody({ vat_treatment: 'not_supported' }), /vat treatment/i)
    expectError(validBody({ vat_treatment: 7 }), /vat treatment/i)
  })

  it('rejects malformed or impossible dates', () => {
    expectError(validBody({ issue_date: '2026-1-2' }), /issue date/i)
    expectError(validBody({ issue_date: '2026-02-30' }), /issue date/i)
    expectError(validBody({ issue_date: undefined }), /issue date/i)
    expectError(validBody({ due_date: '16-11-2026' }), /due date/i)
    expectError(validBody({ due_date: '2026-13-01' }), /due date/i)
  })

  it('accepts a leap day', () => {
    const result = validateDraftInvoice(
      validBody({ issue_date: '2028-02-29', due_date: '2028-03-14' }),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a due date before the issue date', () => {
    expectError(validBody({ issue_date: '2026-11-02', due_date: '2026-11-01' }), /due date/i)
  })

  it('accepts a due date equal to the issue date', () => {
    const result = validateDraftInvoice(
      validBody({ issue_date: '2026-11-02', due_date: '2026-11-02' }),
    )
    expect(result.ok).toBe(true)
  })

  it('turns missing, non-string, or blank notes into null', () => {
    for (const notes of [undefined, null, 5, '   ']) {
      const result = validateDraftInvoice(validBody({ notes }))
      expect(result.ok && result.value.notes).toBeNull()
    }
  })

  it('rejects missing, empty, or oversized items', () => {
    expectError(validBody({ items: undefined }), /line item/i)
    expectError(validBody({ items: [] }), /line item/i)
    expectError(validBody({ items: Array.from({ length: 101 }, () => item()) }), /100/)
  })

  it('accepts exactly 100 items', () => {
    const result = validateDraftInvoice(validBody({ items: Array.from({ length: 100 }, () => item()) }))
    expect(result.ok).toBe(true)
  })

  it('rejects an item that is not an object', () => {
    expectError(validBody({ items: [item(), null] }), /^Line 2:/)
  })

  it('rejects a blank or missing description and names the line', () => {
    expectError(validBody({ items: [item(), item({ description: '   ' })] }), /^Line 2: description/)
    expectError(validBody({ items: [item({ description: 5 })] }), /^Line 1: description/)
  })

  it('rejects a non-positive or non-finite quantity', () => {
    for (const quantity of [0, -1, Infinity, NaN, '2', undefined]) {
      expectError(
        validBody({ items: [item(), item({ quantity })] }),
        /^Line 2: quantity must be a positive number$/,
      )
    }
  })

  it('rejects a negative or non-finite unit price but allows zero', () => {
    for (const unit_price of [-0.01, Infinity, NaN, '100', undefined]) {
      expectError(validBody({ items: [item({ unit_price })] }), /^Line 1: unit price/)
    }
    expect(validateDraftInvoice(validBody({ items: [item({ unit_price: 0 })] })).ok).toBe(true)
  })

  it('rejects a VAT rate other than 0, 9 or 21', () => {
    for (const vat_rate of [6, 20, '21', undefined]) {
      expectError(validBody({ items: [item({ vat_rate })] }), /^Line 1: VAT rate/)
    }
    for (const vat_rate of [0, 9, 21]) {
      expect(validateDraftInvoice(validBody({ items: [item({ vat_rate })] })).ok).toBe(true)
    }
  })

  it('requires 0% VAT on every line of a reverse-charge invoice', () => {
    expectError(
      validBody({
        vat_treatment: 'eu_reverse_charge',
        items: [item({ vat_rate: 0 }), item({ vat_rate: 21 })],
      }),
      /^Reverse-charge invoices must use 0% VAT on every line$/,
    )
    const ok = validateDraftInvoice(
      validBody({ vat_treatment: 'eu_reverse_charge', items: [item({ vat_rate: 0 })] }),
    )
    expect(ok.ok).toBe(true)
  })
})
