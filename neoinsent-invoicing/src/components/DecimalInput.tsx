import { useState, type InputHTMLAttributes } from 'react'

type PassThroughProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'value' | 'onChange'>

interface DecimalInputProps extends PassThroughProps {
  /** The current number; NaN shows an empty field. */
  value: number
  /** Called with the parsed number, or NaN when the field is emptied. */
  onChange: (value: number) => void
}

/** What may be in the box while typing: digits, one `.` or `,`, at most two decimals. */
const PARTIAL_DECIMAL = /^-?\d*([.,]\d{0,2})?$/

/** Parses Dutch (`12,5`) or English (`12.5`) decimal text; empty or partial text like "-" is NaN. */
function parseDecimal(text: string): number {
  const normalized = text.trim().replace(',', '.')
  if (normalized === '' || normalized === '-' || normalized === '.' || normalized === '-.') return Number.NaN
  return Number(normalized)
}

/** Shows a number with a comma decimal and no thousands separators (12.5 → "12,5"). */
function formatDecimal(value: number): string {
  return Number.isFinite(value) ? String(value).replace('.', ',') : ''
}

/**
 * A text field for decimal amounts that accepts a Dutch decimal comma. It keeps the typed text
 * itself, so partial input like "12," is not overwritten, and an empty field stays empty.
 */
export function DecimalInput({ value, onChange, ...rest }: DecimalInputProps) {
  const [text, setText] = useState(() => formatDecimal(value))
  const [syncedValue, setSyncedValue] = useState(value)

  // Re-sync from props when the value changes from outside and no longer matches the text.
  if (!Object.is(value, syncedValue)) {
    setSyncedValue(value)
    if (!Object.is(parseDecimal(text), value)) setText(formatDecimal(value))
  }

  function handleChange(next: string) {
    if (!PARTIAL_DECIMAL.test(next.trim())) return
    setText(next)
    const parsed = parseDecimal(next)
    if (next.trim() === '') {
      setSyncedValue(Number.NaN)
      onChange(Number.NaN)
    } else if (Number.isFinite(parsed)) {
      setSyncedValue(parsed)
      onChange(parsed)
    }
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
    />
  )
}
