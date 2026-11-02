export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      // non-JSON body
    }
  }
  if (!res.ok) {
    const msg = (body as { error?: unknown } | null)?.error
    throw new ApiError(typeof msg === 'string' ? msg : `Request failed (${res.status})`, res.status)
  }
  if (body === null && res.status !== 204) {
    throw new ApiError('Unexpected response from server', res.status)
  }
  return body as T
}
