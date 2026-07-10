import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

function Probe() {
  const { session, loading } = useAuth()
  if (loading) return <div>loading</div>
  return <div>{session ? 'signed-in' : 'signed-out'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports signed-out when there is no session', async () => {
    ;(supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
  })

  it('reports signed-in when a session exists', async () => {
    ;(supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('signed-in')).toBeInTheDocument())
  })

  it('updates when onAuthStateChange fires with a new session', async () => {
    ;(supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())

    const onChangeCallback = (supabase.auth.onAuthStateChange as any).mock.calls[0][0]
    act(() => {
      onChangeCallback('SIGNED_IN', { user: { id: 'u2' } })
    })

    await waitFor(() => expect(screen.getByText('signed-in')).toBeInTheDocument())
  })
})
