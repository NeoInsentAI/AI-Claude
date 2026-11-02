import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index'
import * as clientsRepo from '../_lib/clientsRepo'
import * as requireSessionModule from '../_lib/requireSession'

vi.mock('../_lib/requireSession')
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

const completeInput = {
  name: 'Acme BV',
  email: 'ap@acme.test',
  address_line: 'Main St 1',
  postal_code: '1000AA',
  city: 'Amsterdam',
  country: 'NL',
}

describe('/api/clients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('short-circuits when not authenticated', async () => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(false)
    const res = createMockRes()
    await handler({ method: 'GET', headers: {} } as any, res)
    expect(clientsRepo.listClients).not.toHaveBeenCalled()
  })

  it('does not create a client when not authenticated', async () => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(false)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { ...completeInput } } as any, res)
    expect(clientsRepo.createClient).not.toHaveBeenCalled()
  })

  it('GET lists clients', async () => {
    vi.mocked(clientsRepo.listClients).mockResolvedValue([{ id: '1', name: 'Acme' } as any])
    const res = createMockRes()
    await handler({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ clients: [{ id: '1', name: 'Acme' }] })
  })

  it('POST rejects a body missing required fields', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { name: 'Acme' } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(clientsRepo.createClient).not.toHaveBeenCalled()
  })

  it('POST creates a client with a complete body', async () => {
    const input = { ...completeInput }
    vi.mocked(clientsRepo.createClient).mockResolvedValue({ id: '1', ...input } as any)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: input } as any, res)
    expect(res.statusCode).toBe(201)
    expect(clientsRepo.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme BV', vat_number: null }),
    )
  })

  it('POST normalizes a lowercase country code to uppercase', async () => {
    const input = { ...completeInput, country: ' nl ' }
    vi.mocked(clientsRepo.createClient).mockResolvedValue({ id: '1', ...completeInput } as any)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: input } as any, res)
    expect(res.statusCode).toBe(201)
    expect(clientsRepo.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'NL' }),
    )
  })

  it('POST rejects a country that is not a 2-letter code', async () => {
    const input = { ...completeInput, country: 'Netherlands' }
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: input } as any, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: expect.stringMatching(/country/i) })
    expect(clientsRepo.createClient).not.toHaveBeenCalled()
  })

  it('rejects unsupported methods', async () => {
    const res = createMockRes()
    await handler({ method: 'DELETE', headers: {} } as any, res)
    expect(res.statusCode).toBe(405)
  })
})
