import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './dashboard'
import * as invoicesRepo from './_lib/invoicesRepo'

vi.mock('./_lib/invoicesRepo')

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

const SUMMARY: invoicesRepo.PeriodSummary = {
  invoiceCount: 1,
  subtotal: 100,
  vatAmount: 21,
  total: 121,
  vatByRate: [{ rate: 21, base: 100, vat: 21 }],
  reverseChargeRevenue: 0,
  unpaidCount: 1,
  unpaidTotal: 121,
}

const FINAL = { id: 'f1', status: 'final' } as invoicesRepo.InvoiceSummary
const DRAFT = { id: 'd1', status: 'draft' } as invoicesRepo.InvoiceSummary

async function get(query: Record<string, unknown>) {
  const res = createMockRes()
  await handler({ method: 'GET', headers: {}, query } as any, res)
  return res
}

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(invoicesRepo.summaryForPeriod).mockResolvedValue(SUMMARY)
    vi.mocked(invoicesRepo.listInvoices).mockImplementation(async (filter = {}) =>
      filter.status === 'draft' ? [DRAFT] : [FINAL],
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the period, its summary, its final invoices and all drafts', async () => {
    const res = await get({ year: '2026', quarter: '2' })

    const range = { fromDate: '2026-04-01', toDate: '2026-06-30' }
    expect(invoicesRepo.summaryForPeriod).toHaveBeenCalledWith(range)
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({ ...range, status: 'final' })
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({ status: 'draft' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      period: { year: 2026, quarter: 2, ...range },
      summary: SUMMARY,
      invoices: [FINAL],
      drafts: [DRAFT],
    })
  })

  it('covers the whole year when only a year is given', async () => {
    const res = await get({ year: '2025' })
    expect(res.body.period).toEqual({ year: 2025, quarter: null, fromDate: '2025-01-01', toDate: '2025-12-31' })
  })

  it('defaults to the whole current local year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 31 Dec, late evening local time: still 2026 here even where UTC is already 2027.
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30))
    const res = await get({})
    expect(res.body.period).toEqual({ year: 2026, quarter: null, fromDate: '2026-01-01', toDate: '2026-12-31' })
  })

  it('rejects a bad year, a bad quarter and a quarter without a year', async () => {
    for (const query of [
      { year: '26' },
      { year: ['2026', '2027'] },
      { year: '1999' },
      { year: '2101' },
      { year: '2026', quarter: '5' },
      { year: '2026', quarter: '0' },
      { quarter: '1' },
    ]) {
      const res = await get(query)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: expect.stringMatching(/year|quarter/i) })
    }
    expect(invoicesRepo.summaryForPeriod).not.toHaveBeenCalled()
    expect(invoicesRepo.listInvoices).not.toHaveBeenCalled()
  })

  it('answers 405 for anything but GET', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const res = createMockRes()
      await handler({ method, headers: {}, query: {} } as any, res)
      expect(res.statusCode).toBe(405)
    }
  })

  it('answers 500 with a generic message when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(invoicesRepo.summaryForPeriod).mockRejectedValue(new Error('disk I/O error'))
    const res = await get({ year: '2026' })
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Database error — please try again' })
  })
})
