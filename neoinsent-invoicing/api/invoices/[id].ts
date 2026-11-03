import type { Request, Response } from 'express'
import { checkClientForDraft } from '../_lib/checkClientForDraft'
import { getInvoice, replaceDraftInvoice } from '../_lib/invoicesRepo'
import { isUuid } from '../_lib/uuid'
import { validateDraftInvoice } from '../_lib/validateDraftInvoice'

const DATABASE_ERROR = 'Database error — please try again'
const NOT_FOUND = 'Invoice not found'
const LOCKED = 'This invoice is finalized and can no longer be edited'

async function getOne(id: string, res: Response) {
  try {
    const invoice = await getInvoice(id)
    if (!invoice) {
      res.status(404).json({ error: NOT_FOUND })
      return
    }
    res.status(200).json({ invoice })
  } catch (error) {
    console.error('Failed to load invoice', error)
    res.status(500).json({ error: DATABASE_ERROR })
  }
}

async function replaceDraft(id: string, body: unknown, res: Response) {
  const result = validateDraftInvoice(body)
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
    const outcome = await replaceDraftInvoice(id, result.value)
    if (outcome === 'not_found') {
      res.status(404).json({ error: NOT_FOUND })
      return
    }
    if (outcome === 'locked') {
      res.status(409).json({ error: LOCKED })
      return
    }
    res.status(200).json({ invoice: outcome })
  } catch (error) {
    console.error('Failed to update invoice', error)
    res.status(500).json({ error: DATABASE_ERROR })
  }
}

export default async function handler(req: Request, res: Response) {
  const id = req.params?.id
  // Ids are UUIDs; anything else can't match an invoice, so skip the database.
  if (typeof id !== 'string' || !isUuid(id)) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }

  if (req.method === 'GET') {
    await getOne(id, res)
    return
  }
  if (req.method === 'PATCH') {
    await replaceDraft(id, req.body, res)
    return
  }
  res.status(405).json({ error: 'Method not allowed' })
}
