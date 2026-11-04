import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { icpCsvHandler, invoicesCsvHandler } from './tax'
import * as invoicesRepo from './_lib/invoicesRepo'
import { TaxReportDataError } from './_lib/taxReportError'

vi.mock('./_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.set = vi.fn((headers: Record<string, string>) => {
    Object.assign(res.headers, headers)
    return res
  })
  res.send = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

const REPORT: invoicesRepo.TaxReport = {
  btw: {
    r1a: { base: 210.01, vat: 44.1 },
    r1b: { base: 1059.97, vat: 95.4 },
    r1e: { base: 50 },
    r3b: { base: 2066.66 },
    vatDue: 139.5,
  },
  icp: [{ country: 'DE', vatNumber: 'DE123456789', clientName: 'Beispiel GmbH', servicesTotal: 1666.66 }],
  invoices: [
    {
      invoiceNumber: 'NEO-2026-0001',
      issueDate: '2026-10-01',
      clientName: 'Acme BV',
      clientCountry: 'NL',
      clientVatNumber: 'NL123456789B01',
      treatment: 'nl_standard',
      subtotal: 100,
      vatAmount: 21,
      total: 121,
      paid: false,
    },
  ],
  firstYear: 2025,
}

async function call(h: typeof handler, query: Record<string, unknown>, method = 'GET') {
  const res = createMockRes()
  await h({ method, headers: {}, query } as any, res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(invoicesRepo.taxReport).mockResolvedValue(REPORT)
})

describe('GET /api/tax', () => {
  it('returns the period, BTW figures, ICP rows, invoice count and first year', async () => {
    const res = await call(handler, { year: '2026', quarter: '4' })
    const range = { fromDate: '2026-10-01', toDate: '2026-12-31' }
    expect(invoicesRepo.taxReport).toHaveBeenCalledWith(range)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      period: { year: 2026, quarter: 4, ...range },
      btw: REPORT.btw,
      icp: REPORT.icp,
      invoiceCount: 1,
      firstYear: 2025,
    })
  })

  it('covers the whole year without a quarter', async () => {
    const res = await call(handler, { year: '2025' })
    expect(res.body.period).toEqual({ year: 2025, quarter: null, fromDate: '2025-01-01', toDate: '2025-12-31' })
  })

  it('requires a valid year and rejects a bad quarter', async () => {
    for (const query of [{}, { quarter: '1' }, { year: '26' }, { year: '2026', quarter: '5' }]) {
      const res = await call(handler, query)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: expect.stringMatching(/year|quarter/i) })
    }
    expect(invoicesRepo.taxReport).not.toHaveBeenCalled()
  })

  it('answers 500 with a generic message when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(invoicesRepo.taxReport).mockRejectedValue(new Error('disk I/O error'))
    const res = await call(handler, { year: '2026' })
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Database error — please try again' })
  })

  it('answers 500 with the specific message when the stored data can’t be reported', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const message = 'Invoice NEO-2026-0001 has a line at an unexpected VAT rate of 6%, so the tax records can’t be computed'
    vi.mocked(invoicesRepo.taxReport).mockRejectedValue(new TaxReportDataError(message))
    const res = await call(handler, { year: '2026' })
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: message })
  })
})

describe('GET /api/tax/invoices.csv and /api/tax/icp.csv', () => {
  it('serves the invoices CSV as a download named after the quarter', async () => {
    const res = await call(invoicesCsvHandler, { year: '2026', quarter: '4' })
    expect(res.statusCode).toBe(200)
    expect(res.headers).toMatchObject({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="neoinsent-facturen-2026-Q4.csv"',
      'Cache-Control': 'no-store',
    })
    expect(res.body.startsWith('﻿Factuurnummer;')).toBe(true)
    expect(res.body).toContain('NEO-2026-0001;01-10-2026;Acme BV;')
  })

  it('serves the ICP CSV, named after the year when there is no quarter', async () => {
    const res = await call(icpCsvHandler, { year: '2026' })
    expect(invoicesRepo.taxReport).toHaveBeenCalledWith({ fromDate: '2026-01-01', toDate: '2026-12-31' })
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="neoinsent-icp-2026.csv"')
    expect(res.body).toBe('﻿Landcode btw-nummer;Btw-nummer (zonder landcode);Klant;Diensten (excl. btw)\r\nDE;123456789;Beispiel GmbH;1666,66\r\n')
  })

  it('validates the period as JSON errors', async () => {
    const res = await call(icpCsvHandler, { quarter: '2' })
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: expect.stringMatching(/year/i) })
  })
})

describe('methods', () => {
  it('answers 405 for anything but GET on every tax route', async () => {
    for (const h of [handler, invoicesCsvHandler, icpCsvHandler]) {
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        expect((await call(h, { year: '2026' }, method)).statusCode).toBe(405)
      }
    }
    expect(invoicesRepo.taxReport).not.toHaveBeenCalled()
  })
})
