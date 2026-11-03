import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index'
import * as invoicesRepo from '../_lib/invoicesRepo'
import * as clientsRepo from '../_lib/clientsRepo'

vi.mock('../_lib/invoicesRepo')
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

const CLIENT_ID = '0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6f'

const nlClient = {
  id: CLIENT_ID,
  name: 'Acme BV',
  contact_person: null,
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
  kvk_number: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
}

const validBody = {
  client_id: CLIENT_ID,
  language: 'nl',
  vat_treatment: 'nl_standard',
  issue_date: '2026-11-02',
  due_date: '2026-11-16',
  items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 21 }],
}

describe('/api/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientsRepo.getClientById).mockResolvedValue(nlClient)
  })

  it('GET without filters lists all invoices', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([{ id: '1' } as any])
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: {} } as any, res)
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({})
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ invoices: [{ id: '1' }] })
  })

  it('GET with year+quarter narrows the date range', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([])
    const res = createMockRes()
    await handler(
      { method: 'GET', headers: {}, query: { year: '2026', quarter: '2' } } as any,
      res,
    )
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({
      fromDate: '2026-04-01',
      toDate: '2026-06-30',
    })
  })

  it('GET with only a year covers the whole year', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([])
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { year: '2026' } } as any, res)
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    })
  })

  it('GET rejects a year that is not 4 digits', async () => {
    for (const year of ['26', 'abcd', '20261', ['2026', '2027']]) {
      const res = createMockRes()
      await handler({ method: 'GET', headers: {}, query: { year } } as any, res)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: expect.stringMatching(/year/i) })
    }
    expect(invoicesRepo.listInvoices).not.toHaveBeenCalled()
  })

  it('GET rejects a year outside 2000-2100', async () => {
    for (const year of ['0000', '1999', '2101', '9999']) {
      const res = createMockRes()
      await handler({ method: 'GET', headers: {}, query: { year } } as any, res)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: 'Year must be between 2000 and 2100' })
    }
    expect(invoicesRepo.listInvoices).not.toHaveBeenCalled()
  })

  it('GET accepts the year bounds 2000 and 2100', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([])
    for (const year of ['2000', '2100']) {
      const res = createMockRes()
      await handler({ method: 'GET', headers: {}, query: { year } } as any, res)
      expect(res.statusCode).toBe(200)
    }
  })

  it('GET rejects a quarter outside 1-4', async () => {
    for (const quarter of ['0', '5', 'x', '1.5']) {
      const res = createMockRes()
      await handler(
        { method: 'GET', headers: {}, query: { year: '2026', quarter } } as any,
        res,
      )
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: expect.stringMatching(/quarter/i) })
    }
    expect(invoicesRepo.listInvoices).not.toHaveBeenCalled()
  })

  it('GET rejects a quarter without a year', async () => {
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { quarter: '2' } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(invoicesRepo.listInvoices).not.toHaveBeenCalled()
  })

  it('POST rejects an invoice with no line items', async () => {
    const res = createMockRes()
    await handler(
      { method: 'POST', headers: {}, body: { ...validBody, items: [] } } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: expect.stringMatching(/line item/i) })
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
  })

  it('POST creates a draft invoice with a valid body', async () => {
    vi.mocked(invoicesRepo.createDraftInvoice).mockResolvedValue({ id: '1', ...validBody } as any)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { ...validBody } } as any, res)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({ invoice: expect.objectContaining({ id: '1' }) })
    expect(invoicesRepo.createDraftInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, notes: null }),
    )
  })

  it('POST rejects an unknown client without creating an invoice', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue(null)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { ...validBody } } as any, res)
    expect(clientsRepo.getClientById).toHaveBeenCalledWith(CLIENT_ID)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Client not found' })
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
  })

  it('POST rejects a VAT treatment that does not match the client', async () => {
    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          ...validBody,
          vat_treatment: 'eu_reverse_charge',
          items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 0 }],
        },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "VAT treatment doesn't match this client (expected nl_standard)" })
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
  })

  it('POST explains when the client is missing a valid VAT number', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue({
      ...nlClient,
      country: 'DE',
      vat_number: null,
    })
    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          ...validBody,
          vat_treatment: 'eu_reverse_charge',
          items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 0 }],
        },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: expect.stringMatching(/valid VAT number/) })
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
  })

  it('POST explains when the client country is not supported', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue({ ...nlClient, country: 'US' })
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { ...validBody } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: expect.stringMatching(/isn't supported/) })
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
  })

  it('POST creates a reverse-charge draft for an EU client with a matching VAT number', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue({
      ...nlClient,
      country: 'DE',
      vat_number: 'DE123456789',
    })
    vi.mocked(invoicesRepo.createDraftInvoice).mockResolvedValue({ id: '2' } as any)
    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          ...validBody,
          vat_treatment: 'eu_reverse_charge',
          items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 0 }],
        },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(201)
    expect(invoicesRepo.createDraftInvoice).toHaveBeenCalledOnce()
  })

  it('POST returns a JSON 500 when loading the client fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(clientsRepo.getClientById).mockRejectedValue(new Error('connection refused'))
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { ...validBody } } as any, res)
    expect(res.statusCode).toBe(500)
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('GET returns a JSON 500 when the repo throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(invoicesRepo.listInvoices).mockRejectedValue(new Error('connection refused'))
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: {} } as any, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: expect.any(String) })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('POST returns a JSON 500 when the repo throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(invoicesRepo.createDraftInvoice).mockRejectedValue(new Error('connection refused'))
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { ...validBody } } as any, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: expect.any(String) })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('rejects unsupported methods', async () => {
    const res = createMockRes()
    await handler({ method: 'DELETE', headers: {}, query: {} } as any, res)
    expect(res.statusCode).toBe(405)
  })
})
