import type { Request, Response } from 'express'
import { dashboardData } from './_lib/invoicesRepo'
import { parsePeriodQuery } from './_lib/parsePeriodQuery'
import { quarterDateRange } from '../src/lib/dateRanges'
import { todayLocalIso } from '../src/lib/invoiceForm'

const DATABASE_ERROR = 'Database error — please try again'

/**
 * GET /api/dashboard?year=YYYY[&quarter=1-4] — the start page's data: totals and final invoices
 * for the period (default: the whole current local year), plus every draft and every unpaid final
 * invoice regardless of date, and the earliest year with a final invoice (for the year picker).
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
    const data = await dashboardData({ ...range, today: todayLocalIso() })
    res.status(200).json({ period: { year, quarter, ...range }, ...data })
  } catch (error) {
    console.error('Failed to load the dashboard', error)
    res.status(500).json({ error: DATABASE_ERROR })
  }
}
