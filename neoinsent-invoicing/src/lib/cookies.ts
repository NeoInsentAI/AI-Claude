export const COOKIE_NAME = 'ni_session'

export function serializeSessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ].join('; ')
}

export function serializeClearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

export function readSessionCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === COOKIE_NAME) {
      return rawValue.join('=') || null
    }
  }
  return null
}
