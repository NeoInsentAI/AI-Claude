/**
 * Starts NeoInsent Invoicing on this Mac: http://127.0.0.1:5174 (override with PORT).
 * Listens on 127.0.0.1 only, so nothing outside this computer can reach it.
 *
 *   npm start                 build the frontend, then run this
 *   npm run server            run the server only (pair with `npm run dev` for development)
 */
import http from 'node:http'
import { loadEnvFileIfPresent, PROJECT_ENV_FILE } from './loadEnv'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// Load <project root>/.env (Gmail settings, optional PORT/NEOINSENT_DATA_DIR) before anything
// reads the environment. A missing file is fine: email then simply reports "not set up".
try {
  loadEnvFileIfPresent(PROJECT_ENV_FILE)
} catch (error) {
  fail(`Could not read ${PROJECT_ENV_FILE}: ${error instanceof Error ? error.message : String(error)}`)
}

// Check the runtime before importing anything that needs node:sqlite.
const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < 24) {
  fail(`NeoInsent needs Node.js 24 or newer (this is ${process.version}). Install it from https://nodejs.org and try again.`)
}
try {
  await import('node:sqlite')
} catch {
  fail(`This Node.js (${process.version}) has no built-in SQLite (node:sqlite). Install Node.js 24 or newer from https://nodejs.org.`)
}

const rawPort = process.env.PORT ?? '5174'
const port = Number(rawPort)
if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) fail(`PORT must be a number between 1 and 65535 (got "${rawPort}")`)

const { createApp } = await import('./app')
const { closeDb, getDataDir, getDb, rotateBackups } = await import('../api/_lib/db')

const url = `http://127.0.0.1:${port}`
const server = http.createServer(createApp({ port }))
const HOUR = 60 * 60 * 1000

/** Takes today's backup unless it already exists; a failed backup is logged, never fatal. */
function backup(dataDir: string, log = true): void {
  try {
    const file = rotateBackups(dataDir)
    if (log) console.log(`Today's backup: ${file}`)
  } catch (error) {
    console.warn('Warning: could not write the daily backup:', error)
  }
}

/** True if whatever answers on this port is a NeoInsent server. */
async function isNeoInsentRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    })
    const body = (await res.json()) as { app?: unknown }
    return body?.app === 'neoinsent'
  } catch {
    return false
  }
}

server.on('error', async (error: NodeJS.ErrnoException) => {
  // The database is only opened after listen succeeds, so there is nothing to close here.
  if (error.code === 'EADDRINUSE') {
    if (await isNeoInsentRunning()) {
      console.log(`NeoInsent is already running — open ${url}`)
      process.exit(0)
    }
    fail(`Port ${port} is used by another program — set PORT to a free port (e.g. PORT=5175 npm start).`)
  }
  fail(`Could not start the server: ${error.message}`)
})

// Listen first, then open the database: a second launch fails on the port before it can migrate
// the database under a running instance.
server.listen(port, '127.0.0.1', () => {
  let dataDir: string
  try {
    dataDir = getDataDir()
    getDb()
  } catch (error) {
    console.error(`Could not open the NeoInsent database: ${error instanceof Error ? error.message : String(error)}`)
    server.close()
    closeDb()
    process.exit(1)
  }
  console.log(`NeoInsent Invoicing is running — open ${url}`)
  console.log(`Data folder: ${dataDir}`)
  backup(dataDir)
  // Keep taking the daily backup while the app stays open across midnight.
  setInterval(() => backup(getDataDir(), false), HOUR).unref()
  console.log('Press Ctrl+C to stop.')
})

function shutdown(signal: string) {
  console.log(`\nStopping NeoInsent (${signal})…`)
  server.close()
  closeDb()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => shutdown(signal))
