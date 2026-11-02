import { describe, expect, it } from 'vitest'
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from './session'

describe('hashPassword / verifyPassword', () => {
  it('verifies a matching password', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('rejects a non-matching password', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })
})

describe('createSessionToken / verifySessionToken', () => {
  const secret = 'test-session-secret'

  it('verifies a freshly created token', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    expect(verifySessionToken(token, secret, now + 1000)).toBe(true)
  })

  it('rejects a token signed with a different secret', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    expect(verifySessionToken(token, 'other-secret', now + 1000)).toBe(false)
  })

  it('rejects an expired token', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000
    expect(verifySessionToken(token, secret, now + THIRTY_ONE_DAYS_MS)).toBe(false)
  })

  it('rejects a malformed token', () => {
    expect(verifySessionToken('not-a-real-token', secret)).toBe(false)
    expect(verifySessionToken('', secret)).toBe(false)
  })

  it('rejects a token with a tampered expiry', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    const [, signature] = token.split('.')
    const tampered = `${now + 999999999}.${signature}`
    expect(verifySessionToken(tampered, secret, now + 1000)).toBe(false)
  })
})
