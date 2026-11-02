import { describe, expect, it } from 'vitest'
import {
  COOKIE_NAME,
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './cookies'

describe('serializeSessionCookie', () => {
  it('includes the token and security attributes', () => {
    const header = serializeSessionCookie('abc.def')
    expect(header).toContain(`${COOKIE_NAME}=abc.def`)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Strict')
  })
})

describe('serializeClearedSessionCookie', () => {
  it('expires the cookie immediately', () => {
    expect(serializeClearedSessionCookie()).toContain('Max-Age=0')
  })
})

describe('readSessionCookie', () => {
  it('reads the session token from a cookie header', () => {
    expect(readSessionCookie(`other=1; ${COOKIE_NAME}=abc.def; third=2`)).toBe('abc.def')
  })

  it('returns null when the cookie is absent', () => {
    expect(readSessionCookie('other=1')).toBeNull()
  })

  it('returns null for an empty or missing header', () => {
    expect(readSessionCookie(undefined)).toBeNull()
    expect(readSessionCookie('')).toBeNull()
  })
})
