import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../_lib/requireSession'
import { createClient, listClients } from '../_lib/clientsRepo'
import { normalizeClientInput } from '../_lib/normalizeClientInput'

const DATABASE_ERROR = 'Database error — please try again'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return

  if (req.method === 'GET') {
    try {
      const clients = await listClients()
      res.status(200).json({ clients })
    } catch (error) {
      console.error('Failed to list clients', error)
      res.status(500).json({ error: DATABASE_ERROR })
    }
    return
  }

  if (req.method === 'POST') {
    const result = normalizeClientInput(req.body)
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    try {
      const client = await createClient(result.value)
      res.status(201).json({ client })
    } catch (error) {
      console.error('Failed to create client', error)
      res.status(500).json({ error: DATABASE_ERROR })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
