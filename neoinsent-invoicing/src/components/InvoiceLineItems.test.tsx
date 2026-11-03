import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InvoiceLineItems, type LineItemRow } from './InvoiceLineItems'

const ITEMS: LineItemRow[] = [{ description: 'Consulting', quantity: 10, unitPrice: 100, vatRate: 21 }]

/** Keeps the items in state so typing behaves as it does in a real form. */
function Harness({ initial, onChange }: { initial: LineItemRow[]; onChange: (items: LineItemRow[]) => void }) {
  const [items, setItems] = useState(initial)
  return (
    <InvoiceLineItems
      items={items}
      defaultVatRate={21}
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
    expect(onChange).toHaveBeenCalledWith([...ITEMS, { description: '', quantity: 1, unitPrice: 0, vatRate: 0 }])
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

  it('treats a cleared quantity as 0 and keeps the totals finite', async () => {
    const onChange = vi.fn()
    render(<Harness initial={ITEMS} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Quantity 1'))
    expect(onChange).toHaveBeenLastCalledWith([{ ...ITEMS[0], quantity: 0 }])
    expect(screen.getByTestId('invoice-total').textContent).toMatch(/0,00/)
    expect(screen.getByTestId('invoice-total').textContent).not.toMatch(/NaN/)
  })

  it('shows a dash for a line it cannot compute and leaves it out of the totals', () => {
    const items: LineItemRow[] = [ITEMS[0], { description: 'Broken', quantity: Number.NaN, unitPrice: 50, vatRate: 21 }]
    render(<InvoiceLineItems items={items} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.getByTestId('line-total-2').textContent).toBe('—')
    expect(screen.getByTestId('invoice-total').textContent).toMatch(/1\.210,00/)
  })
})
