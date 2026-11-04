import type { Request, Response } from 'express'
import { emailSender, isEmailConfigured } from '../_lib/mailer'

/** GET /api/email/status — whether Gmail sending is set up, and from which address. */
export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  res.status(200).json({ configured: isEmailConfigured(), from: emailSender() })
}
