import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './[id]'
import * as clientsRepo from '../_lib/clientsRepo'

vi.mock('../_lib/clientsRepo')

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

const CLIENT_ID = '0b6f8c1e-3d2a-4f5b-9c7d-1e2f3a4b5c6d'

const completeInput = {
  name: 'Globex GmbH',
  email: 'ap@globex.test',
  address_line: 'Hauptstr 1',
  postal_code: '10115',
  city: 'Berlin',
  country: 'DE',
}

function patchReq(body: unknown, id: unknown = CLIENT_ID) {
  return { method: 'PATCH', headers: {}, params: { id }, body } as any
}

describe('/api/clients/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects non-PATCH methods with 405', async () => {
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, params: { id: CLIENT_ID } } as any, res)
    expect(res.statusCode).toBe(405)
    expect(clientsRepo.updateClient).not.toHaveBeenCalled()
  })

  it('rejects a missing or non-string id with 400', async () => {
    const res = createMockRes()
    await handler(patchReq({ ...completeInput }, ['a', 'b']), res)
    expect(res.statusCode).toBe(400)
    expect(clientsRepo.updateClient).not.toHaveBeenCalled()
  })

  it('returns 404 for a malformed id without calling the repo', async () => {
    const res = createMockRes()
    await handler(patchReq({ ...completeInput }, 'not-a-uuid'), res)
    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Client not found' })
    expect(clientsRepo.updateClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid body with 400', async () => {
    const res = createMockRes()
    await handler(patchReq({ name: 'Globex' }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: expect.stringMatching(/missing fields/i) })
    expect(clientsRepo.updateClient).not.toHaveBeenCalled()
  })

  it('returns 404 when the client does not exist', async () => {
    vi.mocked(clientsRepo.updateClient).mockResolvedValue(null)
    const res = createMockRes()
    await handler(patchReq({ ...completeInput }), res)
    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Client not found' })
  })

  it('updates the client with normalized input', async () => {
    const updated = { id: CLIENT_ID, ...completeInput, vat_number: 'DE123456789' }
    vi.mocked(clientsRepo.updateClient).mockResolvedValue(updated as any)
    const res = createMockRes()
    await handler(patchReq({ ...completeInput, country: ' de ', vat_number: ' de 123.456.789 ' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ client: updated })
    expect(clientsRepo.updateClient).toHaveBeenCalledWith(
      CLIENT_ID,
      expect.objectContaining({ country: 'DE', vat_number: 'DE123456789', kvk_number: null }),
    )
  })

  it('returns a JSON 500 when the repo throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(clientsRepo.updateClient).mockRejectedValue(new Error('connection refused'))
    const res = createMockRes()
    await handler(patchReq({ ...completeInput }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Database error — please try again' })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
