export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const isWrite = method !== 'GET' && method !== 'HEAD'
  const headers = new Headers(options.headers)
  // The server only accepts writes sent as JSON (that is what keeps other websites out), so every
  // write carries the header — and a body, since a body-less request may drop it.
  if (isWrite && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const body = isWrite ? (options.body ?? '{}') : options.body
  const res = await fetch(path, {
    ...options,
    body,
    credentials: 'include',
    headers,
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // non-JSON body
    }
  }
  if (!res.ok) {
    const msg = (data as { error?: unknown } | null)?.error
    throw new ApiError(typeof msg === 'string' ? msg : `Request failed (${res.status})`, res.status)
  }
  if (data === null && res.status !== 204) {
    throw new ApiError('Unexpected response from server', res.status)
  }
  return data as T
}
