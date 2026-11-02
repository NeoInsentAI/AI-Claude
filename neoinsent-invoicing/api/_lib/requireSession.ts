import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSessionCookie } from '../../src/lib/cookies'
import { verifySessionToken } from '../../src/lib/session'

// Keep this synchronous: if it ever returns a Promise, `if (!requireSession(...))` is always false and auth silently turns off.
export function requireSession(req: VercelRequest, res: VercelResponse): boolean {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    res.status(500).json({ error: 'Server is not configured' })
    return false
  }
  const token = readSessionCookie(req.headers.cookie)
  if (!token || !verifySessionToken(token, secret)) {
    res.status(401).json({ error: 'Not authenticated' })
    return false
  }
  return true
}
