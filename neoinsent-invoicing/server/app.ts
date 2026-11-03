import fs from 'node:fs'
import path from 'node:path'
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express'
import clientsHandler from '../api/clients/index'
import clientHandler from '../api/clients/[id]'
import invoicesHandler from '../api/invoices/index'

type Handler = (req: Request, res: Response) => unknown

export interface AppOptions {
  /** The port the server listens on; only requests addressed to this port are accepted. */
  port: number
  /** The built frontend (defaults to `<repo>/dist`). */
  distDir?: string
}

const GENERIC_ERROR = 'Something went wrong'

/** Runs a route handler; anything it throws (sync or async) becomes a 500 JSON response. */
export function wrap(handler: Handler): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      console.error(`Unhandled error in ${req.method} ${req.originalUrl}`, error)
      if (res.headersSent) res.end()
      else res.status(500).json({ error: GENERIC_ERROR })
    }
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const SAME_SITE_FETCH = new Set(['same-origin', 'none'])

/** Sent on every response: no framing (clickjacking), no MIME sniffing, no cross-origin embedding. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
}

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set(SECURITY_HEADERS)
  next()
}

/** The media type of the request body, e.g. `application/json` (lowercased, parameters dropped). */
function mediaType(req: Request): string {
  return (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * The app runs on 127.0.0.1 with no login, so these checks are what keep other websites out:
 * - Host must be this server (a malicious site can point its own domain at 127.0.0.1 — DNS
 *   rebinding — but the browser then sends that domain as Host).
 * - Writes (any method but GET/HEAD/OPTIONS, on any path) must not carry a foreign Origin (blocks
 *   cross-site form posts and fetches). The check is path-independent on purpose: Express matching
 *   can differ from a prefix test (e.g. letter case), so no path may slip past it.
 * - Writes must not be marked cross-site by the browser (Sec-Fetch-Site), even without an Origin.
 * - Writes must be `Content-Type: application/json`. A cross-site page can only send that after a
 *   CORS preflight, and this server never approves preflights — so this holds even if a browser
 *   omits Origin. Body-less writes need the header too (`req.is()` would wave them through).
 */
function localhostOnly(port: number): RequestHandler {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`])
  const origins = new Set([...hosts].map((h) => `http://${h}`))
  return (req, res, next) => {
    const host = req.headers.host?.toLowerCase()
    if (!host || !hosts.has(host)) {
      res.status(403).json({ error: 'Forbidden: open the app at http://localhost:' + port })
      return
    }
    const origin = req.headers.origin
    if (!SAFE_METHODS.has(req.method) && origin !== undefined && !origins.has(origin.toLowerCase())) {
      res.status(403).json({ error: 'Forbidden: cross-site request' })
      return
    }
    if (!SAFE_METHODS.has(req.method)) {
      const site = req.headers['sec-fetch-site']
      if (typeof site === 'string' && !SAME_SITE_FETCH.has(site.toLowerCase())) {
        res.status(403).json({ error: 'Forbidden: cross-site request' })
        return
      }
      if (mediaType(req) !== 'application/json') {
        res.status(415).json({ error: 'Send JSON (Content-Type: application/json)' })
        return
      }
    }
    next()
  }
}

const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'Request body is not valid JSON',
  'entity.too.large': 'Request body is too large',
}

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  // body-parser errors (malformed JSON, body too large, …) carry a 4xx status. Their messages are
  // never echoed — only these fixed texts.
  const status = typeof err?.status === 'number' ? err.status : 500
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: CLIENT_ERROR_MESSAGES[err.type] ?? 'Bad request' })
    return
  }
  console.error(`Unhandled error in ${req.method} ${req.originalUrl}`, err)
  res.status(500).json({ error: GENERIC_ERROR })
}

export function createApp({ port, distDir = path.resolve(import.meta.dirname, '../dist') }: AppOptions): express.Express {
  const app = express()
  app.disable('x-powered-by')
  // `/API/clients` must not reach the `/api/clients` handler.
  app.set('case sensitive routing', true)
  app.set('strict routing', false)
  app.use(securityHeaders)
  app.use(localhostOnly(port))
  app.use(express.json({ limit: '1mb' }))

  // Lets a second launch tell whether this port is really NeoInsent.
  app.get('/api/health', (_req, res) => {
    res.json({ app: 'neoinsent' })
  })
  // Each handler checks req.method itself and answers 405 for the rest.
  app.all('/api/clients', wrap(clientsHandler))
  app.all('/api/clients/:id', wrap(clientHandler))
  app.all('/api/invoices', wrap(invoicesHandler))
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const indexHtml = path.join(distDir, 'index.html')
  app.use(express.static(distDir, { index: false }))
  app.get('/{*path}', (_req, res) => {
    if (!fs.existsSync(indexHtml)) {
      res.status(503).type('text').send('The app has not been built yet — run `npm start`.')
      return
    }
    // `root` keeps send's dotfile check to the file name, not dot folders above dist/.
    res.sendFile('index.html', { root: distDir })
  })
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use(errorHandler)
  return app
}
