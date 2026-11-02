import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../_lib/requireSession'
import { createClient, listClients, type NewClient } from '../_lib/clientsRepo'

const REQUIRED_FIELDS: (keyof NewClient)[] = [
  'name', 'email', 'address_line', 'postal_code', 'city', 'country',
]

const COUNTRY_CODE = /^[A-Z]{2}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return

  if (req.method === 'GET') {
    const clients = await listClients()
    res.status(200).json({ clients })
    return
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Partial<NewClient>
    const missing = REQUIRED_FIELDS.filter((key) => !body[key])
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` })
      return
    }
    const country = String(body.country).trim().toUpperCase()
    if (!COUNTRY_CODE.test(country)) {
      res.status(400).json({ error: 'Country must be a 2-letter ISO code, e.g. NL' })
      return
    }
    const client = await createClient({
      name: body.name!,
      contact_person: body.contact_person ?? null,
      email: body.email!,
      address_line: body.address_line!,
      postal_code: body.postal_code!,
      city: body.city!,
      country,
      vat_number: body.vat_number ?? null,
      kvk_number: body.kvk_number ?? null,
    })
    res.status(201).json({ client })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
