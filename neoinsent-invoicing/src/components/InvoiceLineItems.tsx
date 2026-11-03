import { computeInvoiceTotals, computeLine, type InvoiceLineInput, type LineComputed } from '../lib/invoiceMath'
import { useId } from 'react'
import { formatCurrency } from '../lib/format'
import { DecimalInput } from './DecimalInput'

export interface LineItemRow extends InvoiceLineInput {
  description: string
  /** Stable React key for rows added in the editor (keeps typed text with its row on removal). */
  key?: string
}

interface InvoiceLineItemsProps {
  items: LineItemRow[]
  onChange: (items: LineItemRow[]) => void
  defaultVatRate: number
  /** Reverse-charge invoices: every line is shown, computed and written at 0% VAT. */
  vatLocked?: boolean
}

/** The only rates the server accepts. */
const VAT_RATES = [21, 9, 0] as const

/**
 * `computeLine` throws on non-finite input, and huge inputs can overflow to Infinity; such a line
 * shows "—" and is left out of the totals.
 */
function tryComputeLine(item: LineItemRow): LineComputed | null {
  try {
    const line = computeLine(item)
    return Number.isFinite(line.lineTotal) ? line : null
  } catch {
    return null
  }
}

export function InvoiceLineItems({ items, onChange, defaultVatRate, vatLocked = false }: InvoiceLineItemsProps) {
  const noteId = useId()
  const effective = items.map((item) => (vatLocked ? { ...item, vatRate: 0 } : item))
  const computed = effective.map(tryComputeLine)
  const { subtotal, vatAmount, total } = computeInvoiceTotals(effective.filter((_, i) => computed[i] !== null))

  function updateItem(index: number, patch: Partial<LineItemRow>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch, ...(vatLocked ? { vatRate: 0 } : {}) } : item)),
    )
  }

  function addItem() {
    onChange([
      ...items,
      {
        description: '',
        quantity: 1,
        unitPrice: 0,
        vatRate: vatLocked ? 0 : defaultVatRate,
        key: crypto.randomUUID(),
      },
    ])
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption className="visually-hidden">Line items</caption>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>VAT %</th>
              <th>Line total</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const n = index + 1
              const line = computed[index]
              return (
                <tr key={item.key ?? index}>
                  <td>
                    <input
                      aria-label={`Description ${n}`}
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <DecimalInput
                      aria-label={`Quantity ${n}`}
                      value={item.quantity}
                      onChange={(quantity) => updateItem(index, { quantity })}
                    />
                  </td>
                  <td>
                    <DecimalInput
                      aria-label={`Unit price ${n}`}
                      value={item.unitPrice}
                      onChange={(unitPrice) => updateItem(index, { unitPrice })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`VAT rate ${n}`}
                      value={vatLocked ? 0 : item.vatRate}
                      disabled={vatLocked}
                      aria-describedby={vatLocked ? noteId : undefined}
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
      {vatLocked && <p id={noteId}>Reverse charge — VAT 0% (BTW verlegd)</p>}
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
