import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadTrends, type TrendTile } from '../progress/loadTrends'

export function ProgressPage() {
  const [tiles, setTiles] = useState<TrendTile[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()

        if (cancelled) return

        if (userError || !userData.user) {
          setError(true)
          return
        }

        const loaded = await loadTrends(userData.user.id)

        if (cancelled) return

        setTiles(loaded)
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

  if (error) return <p>Couldn't load your progress — try again.</p>

  const hasAnyData = tiles?.some((t) => t.value !== null) ?? false
  if (!hasAnyData) return <p>Progress needs data — record a couple of sessions and your first trends will appear here.</p>

  return (
    <div>
      <h1>Progress</h1>
      <ul>
        {tiles?.map((t) => (
          <li key={t.attribute}>
            <strong>{t.label}:</strong> {t.value === null ? 'Collecting data' : Math.round(t.value)}
          </li>
        ))}
      </ul>
    </div>
  )
}
