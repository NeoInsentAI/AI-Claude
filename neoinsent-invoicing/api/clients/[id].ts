import type { Request, Response } from 'express'
import { updateClient } from '../_lib/clientsRepo'
import { normalizeClientInput } from '../_lib/normalizeClientInput'
import { isUuid } from '../_lib/uuid'

const DATABASE_ERROR = 'Database error — please try again'

export default async function handler(req: Request, res: Response) {
  const id = req.params?.id
  if (typeof id !== 'string' || id === '') {
    res.status(400).json({ error: 'Invalid client id' })
    return
  }

  // Ids are UUIDs; anything else can't match a client, so skip the database.
  if (!isUuid(id)) {
    res.status(404).json({ error: 'Client not found' })
    return
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const result = normalizeClientInput(req.body)
  if (!result.ok) {
    res.status(400).json({ error: result.error })
    return
  }

  try {
    const client = await updateClient(id, result.value)
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }
    res.status(200).json({ client })
  } catch (error) {
    console.error('Failed to update client', error)
    res.status(500).json({ error: DATABASE_ERROR })
  }
}
