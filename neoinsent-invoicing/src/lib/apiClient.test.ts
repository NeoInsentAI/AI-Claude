import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './apiClient'

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) }),
    )
    await expect(apiFetch('/api/thing')).resolves.toEqual({ hello: 'world' })
  })

  it('throws ApiError with the server message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Bad input' }) }),
    )
    await expect(apiFetch('/api/thing')).rejects.toThrow('Bad input')
  })

  it('sends credentials and JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/thing', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/thing',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })
})

describe('ApiError', () => {
  it('carries the HTTP status', () => {
    const err = new ApiError('Nope', 404)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Nope')
  })
})
