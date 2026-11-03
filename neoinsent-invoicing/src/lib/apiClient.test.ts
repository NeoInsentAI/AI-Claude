import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './apiClient'

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) }
}

function textResponse(text: string, status: number) {
  return { ok: status < 400, status, text: async () => text }
}

const HTML = '<!doctype html><html><body>index</body></html>'

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' })))
    await expect(apiFetch('/api/thing')).resolves.toEqual({ hello: 'world' })
  })

  it('throws ApiError with the server message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Bad input' }, 400)))
    await expect(apiFetch('/api/thing')).rejects.toThrow('Bad input')
  })

  it('sends credentials and JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/thing', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/thing',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('sends JSON content type and an empty JSON body on a body-less write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('', 204))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/thing/1', { method: 'DELETE' })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(init.body).toBe('{}')
  })

  it('keeps caller headers (plain object or Headers) when adding the content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/thing', { method: 'POST', body: '{}', headers: { 'X-Test': 'a' } })
    await apiFetch('/api/thing', { method: 'PATCH', headers: new Headers({ 'X-Test': 'b' }) })
    const h1 = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    const h2 = (fetchMock.mock.calls[1][1] as RequestInit).headers as Headers
    expect(h1.get('X-Test')).toBe('a')
    expect(h1.get('Content-Type')).toBe('application/json')
    expect(h2.get('X-Test')).toBe('b')
    expect(h2.get('Content-Type')).toBe('application/json')
  })

  it('sends no content type or body on GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/thing')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Headers).has('Content-Type')).toBe(false)
    expect(init.body).toBeUndefined()
  })

  it('rejects with the status in the message when an error response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse(HTML, 500)))
    const err = await apiFetch('/api/thing').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toContain('500')
    expect((err as ApiError).status).toBe(500)
  })

  it('rejects when a successful response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse(HTML, 200)))
    await expect(apiFetch('/api/thing')).rejects.toThrow('Unexpected response from server')
  })

  it('resolves on 204 with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('', 204)))
    await expect(apiFetch('/api/thing', { method: 'DELETE' })).resolves.toBeNull()
  })
})

describe('ApiError', () => {
  it('carries the HTTP status', () => {
    const err = new ApiError('Nope', 404)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Nope')
  })
})
