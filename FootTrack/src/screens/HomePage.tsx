import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SKILL_LABELS } from '../analysis/skillConfig'

interface LatestSession {
  id: string
  skill: keyof typeof SKILL_LABELS
  session_score: number | null
  created_at: string
}

export function HomePage() {
  const [latest, setLatest] = useState<LatestSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const { data, error: fetchError } = await supabase
          .from('training_sessions')
          .select('id, skill, session_score, created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return

        if (fetchError) {
          setError(true)
          return
        }

        // The generated `training_sessions.skill` column type is a plain `string` (no DB enum backs it),
        // narrower than that here purely for typing convenience — the value itself is always one of the
        // three skill keys, since that's all `saveSessionResults` ever writes.
        setLatest(data as LatestSession | null)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>FootTrack</h1>
      {error ? (
        <p>Couldn't load your sessions — try again.</p>
      ) : !latest ? (
        <>
          <p>Record your baseline session to get started — about 10 reps, any of the 3 skills.</p>
          <Link to="/record">Record my baseline session</Link>
        </>
      ) : (
        <>
          <p>
            Last session: {SKILL_LABELS[latest.skill]} — score {latest.session_score ?? '—'}
          </p>
          <Link to={`/feedback/${latest.id}`}>View feedback</Link>
        </>
      )}
      <Link to="/record">Record a new session</Link>
    </div>
  )
}
