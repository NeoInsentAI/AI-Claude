import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './[id]'
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

const INVOICE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
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

const invoice = { id: INVOICE_ID, status: 'draft', items: [] } as any

function req(method: string, id = INVOICE_ID, body?: unknown) {
  return { method, params: { id }, headers: {}, query: {}, body } as any
}

describe('/api/invoices/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientsRepo.getClientById).mockResolvedValue(nlClient)
  })

  it('answers 404 for a non-UUID id without touching the database', async () => {
    const res = createMockRes()
    await handler(req('GET', 'not-a-uuid'), res)
    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Invoice not found' })
    expect(invoicesRepo.getInvoice).not.toHaveBeenCalled()
  })

  describe('GET', () => {
    it('returns the invoice', async () => {
      vi.mocked(invoicesRepo.getInvoice).mockResolvedValue(invoice)
      const res = createMockRes()
      await handler(req('GET'), res)
      expect(invoicesRepo.getInvoice).toHaveBeenCalledWith(INVOICE_ID)
      expect(res.statusCode).toBe(200)
      expect(res.body).toEqual({ invoice })
    })

    it('answers 404 for an unknown invoice', async () => {
      vi.mocked(invoicesRepo.getInvoice).mockResolvedValue(null)
      const res = createMockRes()
      await handler(req('GET'), res)
      expect(res.statusCode).toBe(404)
      expect(res.body).toEqual({ error: 'Invoice not found' })
    })

    it('answers 500 JSON when the repository throws', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(invoicesRepo.getInvoice).mockRejectedValue(new Error('disk full'))
      const res = createMockRes()
      await handler(req('GET'), res)
      expect(res.statusCode).toBe(500)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('PATCH', () => {
    it('rejects an invalid body with 400 and does not touch the repositories', async () => {
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, { ...validBody, items: [] }), res)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(clientsRepo.getClientById).not.toHaveBeenCalled()
      expect(invoicesRepo.replaceDraftInvoice).not.toHaveBeenCalled()
    })

    it('rejects an unknown client with 400', async () => {
      vi.mocked(clientsRepo.getClientById).mockResolvedValue(null)
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, validBody), res)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: 'Client not found' })
      expect(invoicesRepo.replaceDraftInvoice).not.toHaveBeenCalled()
    })

    it('rejects a VAT treatment that does not match the client with 400', async () => {
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, {
        ...validBody,
        vat_treatment: 'eu_reverse_charge',
        items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 0 }],
      }), res)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: "VAT treatment doesn't match this client (expected nl_standard)" })
      expect(invoicesRepo.replaceDraftInvoice).not.toHaveBeenCalled()
    })

    it('answers 404 when the invoice does not exist', async () => {
      vi.mocked(invoicesRepo.replaceDraftInvoice).mockResolvedValue('not_found')
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, validBody), res)
      expect(res.statusCode).toBe(404)
      expect(res.body).toEqual({ error: 'Invoice not found' })
    })

    it('answers 409 when the invoice is final', async () => {
      vi.mocked(invoicesRepo.replaceDraftInvoice).mockResolvedValue('locked')
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, validBody), res)
      expect(res.statusCode).toBe(409)
      expect(res.body).toEqual({ error: 'This invoice is finalized and can no longer be edited' })
    })

    it('replaces the draft and returns it', async () => {
      vi.mocked(invoicesRepo.replaceDraftInvoice).mockResolvedValue(invoice)
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, validBody), res)
      expect(invoicesRepo.replaceDraftInvoice).toHaveBeenCalledWith(
        INVOICE_ID,
        expect.objectContaining({ client_id: CLIENT_ID, vat_treatment: 'nl_standard', notes: null }),
      )
      expect(res.statusCode).toBe(200)
      expect(res.body).toEqual({ invoice })
    })

    it('answers 500 JSON when the repository throws', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(invoicesRepo.replaceDraftInvoice).mockRejectedValue(new Error('disk full'))
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, validBody), res)
      expect(res.statusCode).toBe(500)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('answers 500 JSON when the client lookup throws', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(clientsRepo.getClientById).mockRejectedValue(new Error('disk full'))
      const res = createMockRes()
      await handler(req('PATCH', INVOICE_ID, validBody), res)
      expect(res.statusCode).toBe(500)
      expect(invoicesRepo.replaceDraftInvoice).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  it('answers 405 for other methods', async () => {
    const res = createMockRes()
    await handler(req('DELETE'), res)
    expect(res.statusCode).toBe(405)
    expect(res.body).toEqual({ error: 'Method not allowed' })
  })
})
