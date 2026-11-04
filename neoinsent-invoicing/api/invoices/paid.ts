import type { Request, Response } from 'express'
import { setInvoicePaid } from '../_lib/invoicesRepo'
import { isUuid } from '../_lib/uuid'

const NOT_FOUND = 'Invoice not found'

/** POST /api/invoices/:id/paid with `{ paid: boolean }` — marks a final invoice paid or unpaid. */
export default async function handler(req: Request, res: Response) {
  const id = req.params?.id
  if (typeof id !== 'string' || !isUuid(id)) {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const body: unknown = req.body
  const paid =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as { paid?: unknown }).paid : undefined
  if (typeof paid !== 'boolean') {
    res.status(400).json({ error: 'Send { "paid": true } or { "paid": false }' })
    return
  }

  let result
  try {
    result = await setInvoicePaid(id, paid)
  } catch (error) {
    console.error('Failed to update paid status', error)
    res.status(500).json({ error: 'Database error — please try again' })
    return
  }
  if (result === 'not_found') {
    res.status(404).json({ error: NOT_FOUND })
    return
  }
  if (result === 'not_final') {
    res.status(409).json({ error: 'Only finalized invoices can be marked paid' })
    return
  }
  res.status(200).json({ invoice: result })
}
