import type { VercelRequest, VercelResponse } from '@vercel/node'
import { serializeSessionCookie } from '../src/lib/cookies'
import { createSessionToken, verifyPassword } from '../src/lib/session'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const expectedHash = process.env.APP_PASSWORD_HASH
  const secret = process.env.SESSION_SECRET
  if (!expectedHash || !secret) {
    res.status(500).json({ error: 'Server is not configured' })
    return
  }

  const { password } = (req.body ?? {}) as { password?: unknown }
  if (typeof password !== 'string' || !verifyPassword(password, expectedHash)) {
    res.status(401).json({ error: 'Incorrect password' })
    return
  }

  res.setHeader('Set-Cookie', serializeSessionCookie(createSessionToken(secret)))
  res.status(200).json({ ok: true })
}
