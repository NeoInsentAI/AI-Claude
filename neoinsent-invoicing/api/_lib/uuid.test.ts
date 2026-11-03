import { describe, expect, it } from 'vitest'
import { isUuid } from './uuid'

describe('isUuid', () => {
  it('accepts canonical UUIDs in any case', () => {
    expect(isUuid('0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6f')).toBe(true)
    expect(isUuid('0B8F3C2E-1D4A-4F6B-9C7E-2A1B3C4D5E6F')).toBe(true)
  })

  it('rejects malformed strings and non-strings', () => {
    for (const value of [
      '',
      '1',
      '0b8f3c2e1d4a4f6b9c7e2a1b3c4d5e6f',
      '0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6',
      '0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6g',
      ' 0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6f',
      42,
      null,
      undefined,
    ]) {
      expect(isUuid(value)).toBe(false)
    }
  })
})
