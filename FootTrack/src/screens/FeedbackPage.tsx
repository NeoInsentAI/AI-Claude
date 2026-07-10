import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface SessionRow {
  id: string
  skill: string
  session_score: number | null
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

  useEffect(() => {
    if (!sessionId) return
    supabase.from('training_sessions').select('id, skill, session_score, created_at').eq('id', sessionId).single()
      .then(({ data }) => setSession(data))
    supabase.from('feedback_items').select('id, kind, fault_tag, copy, rank, drills(title, objective, instructions)').eq('session_id', sessionId).order('rank')
      .then(({ data }) => setFeedback((data as unknown as FeedbackRow[]) ?? []))
  }, [sessionId])

  if (!session) return <p>Loading feedback…</p>

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
