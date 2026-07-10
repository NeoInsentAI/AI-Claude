import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface SessionRow {
  id: string
  skill: string
  session_score: number | null
  status: string
  created_at: string
}
interface FeedbackRow {
  id: string
  kind: 'priority_fix' | 'win' | 'correction'
  fault_tag: string | null
  copy: string
  rank: number
  drills: { title: string; objective: string; instructions: string } | null
}

export function FeedbackPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    const id = sessionId

    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(false)
      try {
        const [sessionResult, feedbackResult] = await Promise.all([
          supabase
            .from('training_sessions')
            .select('id, skill, session_score, status, created_at')
            .eq('id', id)
            .single(),
          supabase
            .from('feedback_items')
            .select('id, kind, fault_tag, copy, rank, drills(title, objective, instructions)')
            .eq('session_id', id)
            .order('rank'),
        ])

        if (cancelled) return

        if (sessionResult.error || !sessionResult.data) {
          setSession(null)
          setLoadError(true)
          return
        }

        setSession(sessionResult.data as SessionRow)
        setFeedback((feedbackResult.data as unknown as FeedbackRow[]) ?? [])
      } catch {
        if (!cancelled) {
          setSession(null)
          setLoadError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (loading) return <p>Loading feedback…</p>

  if (loadError || !session) {
    return (
      <div>
        <p>Couldn't load this session.</p>
        <Link to="/home">Back to home</Link>
      </div>
    )
  }

  if (session.status === 'analyzing') {
    return <p>Still analyzing your session… check back in a minute.</p>
  }

  if (session.status === 'failed') {
    return (
      <div>
        <p>This session couldn't be fully analyzed. Try recording again.</p>
        <Link to="/record">Record a new session</Link>
      </div>
    )
  }

  const priorityFix = feedback.find((f) => f.kind === 'priority_fix')
  const corrections = feedback.filter((f) => f.kind === 'correction')
  const wins = feedback.filter((f) => f.kind === 'win')

  return (
    <div>
      <h1>{session.session_score ?? '—'}</h1>
      <p>Session score</p>

      {priorityFix && (
        <section aria-label="Priority fix">
          <h2>Fix this first</h2>
          <p>{priorityFix.copy}</p>
          {priorityFix.drills && (
            <div>
              <strong>Fix it: {priorityFix.drills.title}</strong>
              <p>{priorityFix.drills.instructions}</p>
            </div>
          )}
        </section>
      )}

      {wins.length > 0 && (
        <section aria-label="Wins">
          <h2>Top wins</h2>
          <ul>{wins.map((w) => <li key={w.id}>{w.copy}</li>)}</ul>
        </section>
      )}

      {corrections.length > 0 && (
        <section aria-label="More corrections">
          <h2>More corrections ({corrections.length})</h2>
          <ul>
            {corrections.map((c) => (
              <li key={c.id}>
                {c.copy}
                {c.drills && <> — <em>{c.drills.title}</em></>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
