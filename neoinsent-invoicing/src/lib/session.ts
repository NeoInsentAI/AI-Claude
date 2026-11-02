import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex')
}

export function verifyPassword(candidate: string, expectedHash: string): boolean {
  const candidateHash = hashPassword(candidate)
  return safeEqualHex(candidateHash, expectedHash)
}

export function createSessionToken(secret: string, now: number = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS
  const signature = sign(String(expiresAt), secret)
  return `${expiresAt}.${signature}`
}

export function verifySessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expiresAtRaw, signature] = parts
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt)) return false
  if (expiresAt < now) return false
  const expectedSignature = sign(expiresAtRaw, secret)
  return safeEqualHex(signature, expectedSignature)
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
