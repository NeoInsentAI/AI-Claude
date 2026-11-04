import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DecimalInput } from './DecimalInput'

/** Holds the value in state like a real parent form would. */
function Harness({ initial, onChange }: { initial: number; onChange: (n: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <DecimalInput
      aria-label="Amount"
      value={value}
      onChange={(n) => {
        setValue(n)
        onChange(n)
      }}
    />
  )
}

function input(): HTMLInputElement {
  return screen.getByLabelText('Amount') as HTMLInputElement
}

describe('DecimalInput', () => {
  it('is a text input with a decimal keyboard hint', () => {
    render(<DecimalInput aria-label="Amount" value={1} onChange={() => {}} />)
    expect(input().type).toBe('text')
    expect(input().inputMode).toBe('decimal')
  })

  it('shows a number with a comma decimal and no thousands separators', () => {
    render(<DecimalInput aria-label="Amount" value={1234.5} onChange={() => {}} />)
    expect(input().value).toBe('1234,5')
  })

  it('shows NaN as an empty field', () => {
    render(<DecimalInput aria-label="Amount" value={Number.NaN} onChange={() => {}} />)
    expect(input().value).toBe('')
  })

  it('accepts a Dutch decimal comma', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '12,50')
    expect(input().value).toBe('12,50')
    expect(onChange).toHaveBeenLastCalledWith(12.5)
  })

  it('accepts a decimal point', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '12.50')
    expect(input().value).toBe('12.50')
    expect(onChange).toHaveBeenLastCalledWith(12.5)
  })

  it('keeps a trailing comma while typing', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '12,')
    expect(input().value).toBe('12,')
    expect(onChange).toHaveBeenLastCalledWith(12)
  })

  it('leaves a cleared field empty and reports NaN', async () => {
    const onChange = vi.fn()
    render(<Harness initial={10} onChange={onChange} />)
    await userEvent.clear(input())
    expect(input().value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith(Number.NaN)
    await userEvent.type(input(), '5')
    expect(input().value).toBe('5')
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('ignores letters', async () => {
    const onChange = vi.fn()
    render(<Harness initial={7} onChange={onChange} />)
    await userEvent.type(input(), 'abc')
    expect(input().value).toBe('7')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops at two decimals', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)
    await userEvent.clear(input())
    await userEvent.type(input(), '1,234')
    expect(input().value).toBe('1,23')
    expect(onChange).toHaveBeenLastCalledWith(1.23)
  })

  it('shows an external value change', () => {
    const { rerender } = render(<DecimalInput aria-label="Amount" value={1} onChange={() => {}} />)
    rerender(<DecimalInput aria-label="Amount" value={2.75} onChange={() => {}} />)
    expect(input().value).toBe('2,75')
  })
})
