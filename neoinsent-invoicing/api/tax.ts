import type { Request, Response } from 'express'
import { taxReport, type TaxReport } from './_lib/invoicesRepo'
import { parsePeriodQuery, type Quarter } from './_lib/parsePeriodQuery'
import { icpCsv, invoicesCsv } from './_lib/taxCsv'
import { quarterDateRange } from '../src/lib/dateRanges'

const DATABASE_ERROR = 'Database error — please try again'

interface TaxPeriod {
  year: number
  quarter: Quarter | null
  fromDate: string
  toDate: string
}

/**
 * Shared front half of every tax route: GET only, `?year=YYYY[&quarter=1-4]` with the year
 * required, then the report for that period. Answers the request itself (and returns null) on
 * any failure.
 */
async function loadReport(req: Request, res: Response): Promise<{ period: TaxPeriod; report: TaxReport } | null> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return null
  }
  const parsed = parsePeriodQuery(req.query)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return null
  }
  if (parsed.value.year === undefined) {
    res.status(400).json({ error: 'A year is required' })
    return null
  }
  const { year } = parsed.value
  const quarter = parsed.value.quarter ?? null
  const range = quarterDateRange(year, quarter ?? undefined)
  try {
    return { period: { year, quarter, ...range }, report: await taxReport(range) }
  } catch (error) {
    console.error('Failed to load the tax records', error)
    res.status(500).json({ error: DATABASE_ERROR })
    return null
  }
}

/**
 * GET /api/tax?year=YYYY[&quarter=1-4] — the BTW return figures and ICP listing for a quarter
 * (or the whole year), plus the number of final invoices and the earliest year with one.
 */
export default async function handler(req: Request, res: Response) {
  const loaded = await loadReport(req, res)
  if (!loaded) return
  const { period, report } = loaded
  res.status(200).json({
    period,
    btw: report.btw,
    icp: report.icp,
    invoiceCount: report.invoices.length,
    firstYear: report.firstYear,
  })
}

function sendCsv(res: Response, name: string, period: TaxPeriod, body: string): void {
  const suffix = period.quarter === null ? `${period.year}` : `${period.year}-Q${period.quarter}`
  res
    .status(200)
    .set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="neoinsent-${name}-${suffix}.csv"`,
      'Cache-Control': 'no-store',
    })
    .send(body)
}

/** GET /api/tax/invoices.csv?year=YYYY[&quarter=1-4] — the period's final invoices for Excel. */
export async function invoicesCsvHandler(req: Request, res: Response) {
  const loaded = await loadReport(req, res)
  if (!loaded) return
  sendCsv(res, 'facturen', loaded.period, invoicesCsv(loaded.report.invoices))
}

/** GET /api/tax/icp.csv?year=YYYY[&quarter=1-4] — the period's ICP listing for Excel. */
export async function icpCsvHandler(req: Request, res: Response) {
  const loaded = await loadReport(req, res)
  if (!loaded) return
  sendCsv(res, 'icp', loaded.period, icpCsv(loaded.report.icp))
}
