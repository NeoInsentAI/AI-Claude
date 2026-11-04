import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InvoiceLineItems, type LineItemRow } from './InvoiceLineItems'

const ITEMS: LineItemRow[] = [{ description: 'Consulting', quantity: 10, unitPrice: 100, vatRate: 21 }]

/** Keeps the items in state so typing behaves as it does in a real form. */
function Harness({
  initial,
  onChange,
  vatLocked = false,
}: {
  initial: LineItemRow[]
  onChange: (items: LineItemRow[]) => void
  vatLocked?: boolean
}) {
  const [items, setItems] = useState(initial)
  return (
    <InvoiceLineItems
      items={items}
      defaultVatRate={21}
      vatLocked={vatLocked}
      onChange={(next) => {
        setItems(next)
        onChange(next)
      }}
    />
  )
}

describe('InvoiceLineItems', () => {
  it('shows computed totals for the given items', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.getByTestId('invoice-subtotal').textContent).toMatch(/1\.000,00/)
    expect(screen.getByTestId('invoice-vat').textContent).toMatch(/210,00/)
    expect(screen.getByTestId('invoice-total').textContent).toMatch(/1\.210,00/)
    // Per-line total is VAT-inclusive.
    expect(screen.getByTestId('line-total-1').textContent).toMatch(/1\.210,00/)
  })

  it('adds a new blank line with the default VAT rate', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={0} />)
    await userEvent.click(screen.getByText('+ Add line'))
    expect(onChange).toHaveBeenCalledWith([
      ...ITEMS,
      { description: '', quantity: 1, unitPrice: 0, vatRate: 0, key: expect.any(String) },
    ])
  })

  it('removes a line', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={21} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('updates a field on an existing line', async () => {
    const onChange = vi.fn()
    render(<Harness initial={ITEMS} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Quantity 1'))
    await userEvent.type(screen.getByLabelText('Quantity 1'), '5')
    expect(onChange).toHaveBeenLastCalledWith([{ ...ITEMS[0], quantity: 5 }])
  })

  it('offers only the 21%, 9% and 0% VAT rates', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} />)
    const select = screen.getByLabelText('VAT rate 1') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map((o) => o.textContent)).toEqual(['21%', '9%', '0%'])
    expect(select.value).toBe('21')
  })

  it('selecting 9% calls onChange with vatRate 9', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={21} />)
    await userEvent.selectOptions(screen.getByLabelText('VAT rate 1'), '9%')
    expect(onChange).toHaveBeenCalledWith([{ ...ITEMS[0], vatRate: 9 }])
  })

  it('disables the VAT select and shows 0% when vatLocked', () => {
    const items = [{ ...ITEMS[0], vatRate: 0 }]
    render(<InvoiceLineItems items={items} onChange={() => {}} defaultVatRate={0} vatLocked />)
    const select = screen.getByLabelText('VAT rate 1') as HTMLSelectElement
    expect(select).toBeDisabled()
    expect(select.value).toBe('0')
  })

  it('leaves a cleared quantity empty and shows a dash for the line', async () => {
    const onChange = vi.fn()
    render(<Harness initial={ITEMS} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Quantity 1'))
    expect((screen.getByLabelText('Quantity 1') as HTMLInputElement).value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith([{ ...ITEMS[0], quantity: Number.NaN }])
    expect(screen.getByTestId('line-total-1').textContent).toBe('—')
    expect(screen.getByTestId('invoice-total').textContent).toMatch(/0,00/)
    expect(screen.getByTestId('invoice-total').textContent).not.toMatch(/NaN/)
  })

  it('accepts a Dutch decimal comma in the unit price', async () => {
    const onChange = vi.fn()
    render(<Harness initial={[{ description: 'Hour', quantity: 1, unitPrice: 0, vatRate: 21 }]} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Unit price 1'))
    await userEvent.type(screen.getByLabelText('Unit price 1'), '12,50')
    expect(onChange).toHaveBeenLastCalledWith([{ description: 'Hour', quantity: 1, unitPrice: 12.5, vatRate: 21 }])
    expect(screen.getByTestId('line-total-1').textContent).toMatch(/15,13/)
  })

  it('accepts a decimal point in the unit price', async () => {
    render(<Harness initial={[{ description: 'Hour', quantity: 1, unitPrice: 0, vatRate: 21 }]} onChange={() => {}} />)
    await userEvent.clear(screen.getByLabelText('Unit price 1'))
    await userEvent.type(screen.getByLabelText('Unit price 1'), '12.50')
    expect(screen.getByTestId('line-total-1').textContent).toMatch(/15,13/)
  })

  it('keeps partial text with its row when an earlier row is removed', async () => {
    const rows: LineItemRow[] = [
      { key: 'a', description: 'A', quantity: 1, unitPrice: 10, vatRate: 21 },
      { key: 'b', description: 'B', quantity: 1, unitPrice: 20, vatRate: 21 },
      { key: 'c', description: 'C', quantity: 1, unitPrice: 30, vatRate: 21 },
    ]
    render(<Harness initial={rows} onChange={() => {}} />)
    await userEvent.clear(screen.getByLabelText('Unit price 3'))
    await userEvent.type(screen.getByLabelText('Unit price 3'), '12,')
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 2' }))
    expect((screen.getByLabelText('Description 2') as HTMLInputElement).value).toBe('C')
    expect((screen.getByLabelText('Unit price 2') as HTMLInputElement).value).toBe('12,')
  })

  it('computes the totals at 0% VAT when vatLocked, whatever the stored rate', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} vatLocked />)
    expect(screen.getByTestId('invoice-vat').textContent).toMatch(/0,00/)
    expect(screen.getByTestId('invoice-total').textContent).toBe(screen.getByTestId('invoice-subtotal').textContent)
    expect(screen.getByTestId('line-total-1').textContent).toMatch(/1\.000,00/)
  })

  it('adds and edits lines with vatRate 0 when vatLocked', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={21} vatLocked />)
    await userEvent.click(screen.getByText('+ Add line'))
    expect(onChange.mock.lastCall?.[0][1]).toMatchObject({ vatRate: 0 })
    await userEvent.type(screen.getByLabelText('Description 1'), 'x')
    expect(onChange.mock.lastCall?.[0][0]).toMatchObject({ vatRate: 0 })
  })

  it('shows a reverse-charge note linked to the VAT selects when vatLocked', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} vatLocked />)
    const note = screen.getByText('Reverse charge — VAT 0% (BTW verlegd)')
    expect(note).toBeVisible()
    expect(note.id).not.toBe('')
    expect(screen.getByLabelText('VAT rate 1')).toHaveAttribute('aria-describedby', note.id)
  })

  it('has no reverse-charge note when not locked', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.queryByText('Reverse charge — VAT 0% (BTW verlegd)')).toBeNull()
    expect(screen.getByLabelText('VAT rate 1')).not.toHaveAttribute('aria-describedby')
  })

  it('shows a dash instead of an overflowing amount', () => {
    const items: LineItemRow[] = [ITEMS[0], { description: 'Huge', quantity: 1e200, unitPrice: 1e200, vatRate: 21 }]
    render(<InvoiceLineItems items={items} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.getByTestId('line-total-2').textContent).toBe('—')
    expect(screen.getByTestId('invoice-total').textContent).toMatch(/1\.210,00/)
  })

  it('labels the table and the actions column', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.getByRole('table', { name: 'Line items' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
  })

  it('shows a dash for a line it cannot compute and leaves it out of the totals', () => {
    const items: LineItemRow[] = [ITEMS[0], { description: 'Broken', quantity: Number.NaN, unitPrice: 50, vatRate: 21 }]
    render(<InvoiceLineItems items={items} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.getByTestId('line-total-2').textContent).toBe('—')
    expect(screen.getByTestId('invoice-total').textContent).toMatch(/1\.210,00/)
  })
})
