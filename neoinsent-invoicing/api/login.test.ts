import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './login'
import { hashPassword } from '../src/lib/session'

function createMockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.setHeader = vi.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  return res
}

describe('POST /api/login', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD_HASH = hashPassword('correct-horse-battery-staple')
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('rejects non-POST methods', () => {
    const res = createMockRes()
    handler({ method: 'GET' } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('rejects a wrong password', () => {
    const res = createMockRes()
    handler({ method: 'POST', body: { password: 'wrong' } } as any, res)
    expect(res.statusCode).toBe(401)
  })

  it('sets a session cookie on the correct password', () => {
    const res = createMockRes()
    handler({ method: 'POST', body: { password: 'correct-horse-battery-staple' } } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('ni_session=')
    expect(res.headers['Set-Cookie']).toContain('HttpOnly')
  })

  it('returns 500 when server env vars are missing', () => {
    delete process.env.APP_PASSWORD_HASH
    const res = createMockRes()
    handler({ method: 'POST', body: { password: 'anything' } } as any, res)
    expect(res.statusCode).toBe(500)
  })
})
