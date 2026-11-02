import { describe, expect, it, vi } from 'vitest'
import handler from './logout'

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

describe('POST /api/logout', () => {
  it('rejects non-POST methods', () => {
    const res = createMockRes()
    handler({ method: 'GET' } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('clears the session cookie', () => {
    const res = createMockRes()
    handler({ method: 'POST' } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0')
  })
})
