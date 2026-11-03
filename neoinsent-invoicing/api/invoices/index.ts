import type { Request, Response } from 'express'
import { checkClientForDraft } from '../_lib/checkClientForDraft'
import { createDraftInvoice, listInvoices, type ListInvoicesFilter } from '../_lib/invoicesRepo'
import { validateDraftInvoice } from '../_lib/validateDraftInvoice'
import { quarterDateRange } from '../../src/lib/dateRanges'

const DATABASE_ERROR = 'Database error — please try again'
const MIN_YEAR = 2000
const MAX_YEAR = 2100

type FilterResult = { ok: true; value: ListInvoicesFilter } | { ok: false; error: string }

// ?year=YYYY narrows to that year; adding &quarter=1..4 narrows to that quarter.
function parseListFilter(query: Request['query']): FilterResult {
  const { year, quarter } = query ?? {}
  if (year === undefined) {
    if (quarter !== undefined) return { ok: false, error: 'A quarter filter needs a year' }
    return { ok: true, value: {} }
  }
  if (typeof year !== 'string' || !/^\d{4}$/.test(year)) {
    return { ok: false, error: 'Year must be a 4-digit number' }
  }
  const yearNumber = Number(year)
  if (yearNumber < MIN_YEAR || yearNumber > MAX_YEAR) {
    return { ok: false, error: `Year must be between ${MIN_YEAR} and ${MAX_YEAR}` }
  }
  let q: 1 | 2 | 3 | 4 | undefined
  if (quarter !== undefined) {
    if (typeof quarter !== 'string' || !/^[1-4]$/.test(quarter)) {
      return { ok: false, error: 'Quarter must be 1, 2, 3 or 4' }
    }
    q = Number(quarter) as 1 | 2 | 3 | 4
  }
  return { ok: true, value: quarterDateRange(yearNumber, q) }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    const filter = parseListFilter(req.query)
    if (!filter.ok) {
      res.status(400).json({ error: filter.error })
      return
    }
    try {
      const invoices = await listInvoices(filter.value)
      res.status(200).json({ invoices })
    } catch (error) {
      console.error('Failed to list invoices', error)
      res.status(500).json({ error: DATABASE_ERROR })
    }
    return
  }

  if (req.method === 'POST') {
    const result = validateDraftInvoice(req.body)
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    try {
      const check = await checkClientForDraft(result.value.client_id, result.value.vat_treatment)
      if (!check.ok) {
        res.status(400).json({ error: check.error })
        return
      }

      const invoice = await createDraftInvoice(result.value)
      res.status(201).json({ invoice })
    } catch (error) {
      console.error('Failed to create invoice', error)
      res.status(500).json({ error: DATABASE_ERROR })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
