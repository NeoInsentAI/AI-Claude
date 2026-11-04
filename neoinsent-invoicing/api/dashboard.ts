import type { Request, Response } from 'express'
import { listInvoices, summaryForPeriod } from './_lib/invoicesRepo'
import { parsePeriodQuery } from './_lib/parsePeriodQuery'
import { quarterDateRange } from '../src/lib/dateRanges'

const DATABASE_ERROR = 'Database error — please try again'

/**
 * GET /api/dashboard?year=YYYY[&quarter=1-4] — the start page's data: totals and final invoices
 * for the period (default: the whole current local year), plus every draft regardless of date.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const parsed = parsePeriodQuery(req.query)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const year = parsed.value.year ?? new Date().getFullYear()
  const quarter = parsed.value.quarter ?? null
  const range = quarterDateRange(year, quarter ?? undefined)
  try {
    const summary = await summaryForPeriod(range)
    const invoices = await listInvoices({ ...range, status: 'final' })
    const drafts = await listInvoices({ status: 'draft' })
    res.status(200).json({ period: { year, quarter, ...range }, summary, invoices, drafts })
  } catch (error) {
    console.error('Failed to load the dashboard', error)
    res.status(500).json({ error: DATABASE_ERROR })
  }
}
