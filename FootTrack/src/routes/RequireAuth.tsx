import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

type OnboardingStatus = 'unknown' | 'incomplete' | 'complete'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const [onboarding, setOnboarding] = useState<OnboardingStatus>('unknown')
  // Once complete, a profile never becomes incomplete again — latch it so we don't
  // refetch (and flash a loading state) on every navigation.
  const completeRef = useRef(false)

  useEffect(() => {
    if (!session || completeRef.current) return
    let cancelled = false

    async function check() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('dominant_foot')
          .eq('id', session!.user.id)
          .single()

        if (cancelled) return

        // Fail open on fetch errors: onboarding enforcement is a nudge, not a security
        // boundary — a transient failure must never lock a signed-in user out of the app.
        if (error || data?.dominant_foot) {
          completeRef.current = true
          setOnboarding('complete')
        } else {
          setOnboarding('incomplete')
        }
      } catch {
        if (!cancelled) {
          completeRef.current = true
          setOnboarding('complete')
        }
      }
    }

    check()
    return () => {
      cancelled = true
    }
    // location.pathname is a deliberate dependency: after OnboardingPage saves and navigates
    // to /home, this re-checks and finds dominant_foot set, clearing the redirect.
  }, [session, location.pathname])

  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/sign-in" replace />
  if (onboarding === 'unknown') return <p>Loading…</p>
  if (onboarding === 'incomplete' && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}
