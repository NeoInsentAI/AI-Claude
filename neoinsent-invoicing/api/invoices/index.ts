import type { Request, Response } from 'express'
import { checkClientForDraft } from '../_lib/checkClientForDraft'
import { createDraftInvoice, listInvoices, type ListInvoicesFilter } from '../_lib/invoicesRepo'
import { parsePeriodQuery } from '../_lib/parsePeriodQuery'
import { validateDraftInvoice } from '../_lib/validateDraftInvoice'
import { quarterDateRange } from '../../src/lib/dateRanges'

const DATABASE_ERROR = 'Database error — please try again'

type FilterResult = { ok: true; value: ListInvoicesFilter } | { ok: false; error: string }

// ?year=YYYY narrows to that year; adding &quarter=1..4 narrows to that quarter.
function parseListFilter(query: Request['query']): FilterResult {
  const parsed = parsePeriodQuery(query)
  if (!parsed.ok) return parsed
  const { year, quarter } = parsed.value
  return { ok: true, value: year === undefined ? {} : quarterDateRange(year, quarter) }
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
