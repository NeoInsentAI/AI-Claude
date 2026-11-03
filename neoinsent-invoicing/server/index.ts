/**
 * Starts NeoInsent Invoicing on this Mac: http://localhost:5174 (override with PORT).
 * Listens on 127.0.0.1 only, so nothing outside this computer can reach it.
 *
 *   npm start                 build the frontend, then run this
 *   npx tsx server/index.ts   run the server only (pair with `npm run dev` for development)
 */
import http from 'node:http'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
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

let dataDir: string
try {
  dataDir = getDataDir()
  getDb()
} catch (error) {
  fail(`Could not open the NeoInsent database: ${error instanceof Error ? error.message : String(error)}`)
}

const url = `http://localhost:${port}`
const server = http.createServer(createApp({ port }))

server.on('error', (error: NodeJS.ErrnoException) => {
  closeDb()
  if (error.code === 'EADDRINUSE') {
    console.log(`NeoInsent is already running — open ${url}`)
    process.exit(0)
  }
  fail(`Could not start the server: ${error.message}`)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`NeoInsent Invoicing is running — open ${url}`)
  console.log(`Data folder: ${dataDir}`)
  try {
    console.log(`Today's backup: ${rotateBackups(dataDir)}`)
  } catch (error) {
    console.warn('Warning: could not write the daily backup:', error)
  }
  console.log('Press Ctrl+C to stop.')
})

function shutdown(signal: string) {
  console.log(`\nStopping NeoInsent (${signal})…`)
  server.close()
  closeDb()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => shutdown(signal))
