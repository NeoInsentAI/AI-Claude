import { afterEach, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from './supabaseAdmin'

describe('getSupabaseAdmin', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it('throws when env vars are missing', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => getSupabaseAdmin()).toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  })

  it('returns a client when env vars are set', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    expect(() => getSupabaseAdmin()).not.toThrow()
  })
})
