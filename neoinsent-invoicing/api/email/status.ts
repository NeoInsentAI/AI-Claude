import type { Request, Response } from 'express'
import { emailSender, isEmailConfigured, NOT_CONFIGURED_MESSAGE } from '../_lib/mailer'

/**
 * GET /api/email/status — whether Gmail sending is set up, and from which address. When it is not,
 * `message` carries the setup instructions, so the page shows the server's own wording.
 */
export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!isEmailConfigured()) {
    res.status(200).json({ configured: false, from: emailSender(), message: NOT_CONFIGURED_MESSAGE })
    return
  }
  res.status(200).json({ configured: true, from: emailSender() })
}
