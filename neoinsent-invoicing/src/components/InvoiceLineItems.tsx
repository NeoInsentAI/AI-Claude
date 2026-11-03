import { computeInvoiceTotals, computeLine, type InvoiceLineInput, type LineComputed } from '../lib/invoiceMath'
import { formatCurrency } from '../lib/format'

export interface LineItemRow extends InvoiceLineInput {
  description: string
}

interface InvoiceLineItemsProps {
  items: LineItemRow[]
  onChange: (items: LineItemRow[]) => void
  defaultVatRate: number
  /** Reverse-charge invoices: the VAT rate is fixed at 0% (the parent sets the rates to 0). */
  vatLocked?: boolean
}

/** The only rates the server accepts. */
const VAT_RATES = [21, 9, 0] as const

/** An empty number field counts as 0 rather than NaN; the server validates the real values. */
function toNumber(value: string): number {
  return value.trim() === '' ? 0 : Number(value)
}

/** Shows a non-finite number as an empty field instead of passing NaN to React. */
function inputValue(value: number): number | '' {
  return Number.isFinite(value) ? value : ''
}

/** `computeLine` throws on non-finite input; such a line shows "—" and is left out of the totals. */
function tryComputeLine(item: LineItemRow): LineComputed | null {
  try {
    return computeLine(item)
  } catch {
    return null
  }
}

export function InvoiceLineItems({ items, onChange, defaultVatRate, vatLocked = false }: InvoiceLineItemsProps) {
  const computed = items.map(tryComputeLine)
  const { subtotal, vatAmount, total } = computeInvoiceTotals(items.filter((_, i) => computed[i] !== null))

  function updateItem(index: number, patch: Partial<LineItemRow>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addItem() {
    onChange([...items, { description: '', quantity: 1, unitPrice: 0, vatRate: defaultVatRate }])
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>VAT %</th>
              <th>Line total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const n = index + 1
              const line = computed[index]
              return (
                <tr key={index}>
                  <td>
                    <input
                      aria-label={`Description ${n}`}
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Quantity ${n}`}
                      type="number"
                      step="0.01"
                      min="0.01"
                      inputMode="decimal"
                      value={inputValue(item.quantity)}
                      onChange={(e) => updateItem(index, { quantity: toNumber(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Unit price ${n}`}
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={inputValue(item.unitPrice)}
                      onChange={(e) => updateItem(index, { unitPrice: toNumber(e.target.value) })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`VAT rate ${n}`}
                      value={vatLocked ? 0 : item.vatRate}
                      disabled={vatLocked}
                      onChange={(e) => updateItem(index, { vatRate: Number(e.target.value) })}
                    >
                      {VAT_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num" data-testid={`line-total-${n}`}>
                    {line ? formatCurrency(line.lineTotal) : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Remove line ${n}`}
                      onClick={() => removeItem(index)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn" onClick={addItem}>
        + Add line
      </button>
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <div>
          Subtotal:{' '}
          <span className="num" data-testid="invoice-subtotal">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <div>
          VAT:{' '}
          <span className="num" data-testid="invoice-vat">
            {formatCurrency(vatAmount)}
          </span>
        </div>
        <div>
          <b>
            Total:{' '}
            <span className="num" data-testid="invoice-total">
              {formatCurrency(total)}
            </span>
          </b>
        </div>
      </div>
    </div>
  )
}
