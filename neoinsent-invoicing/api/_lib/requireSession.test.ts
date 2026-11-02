import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireSession } from './requireSession'
import { createSessionToken } from '../../src/lib/session'

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('requireSession', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('returns true for a valid session cookie', () => {
    const token = createSessionToken('test-secret')
    const req: any = { headers: { cookie: `ni_session=${token}` } }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns false and responds 401 with no cookie', () => {
    const req: any = { headers: {} }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns false and responds 401 with an invalid token', () => {
    const req: any = { headers: { cookie: 'ni_session=garbage' } }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns false and responds 500 when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET
    const req: any = { headers: {} }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(false)
    expect(res.statusCode).toBe(500)
  })
})
