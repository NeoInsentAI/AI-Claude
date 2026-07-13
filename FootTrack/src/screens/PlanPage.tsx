import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { currentWeekStartISO, generateWeeklyPlan } from '../plan/generatePlan'

interface PlanItemRow {
  id: string
  target_day: number
  status: string
  drills: { title: string; objective: string } | null
}

interface PlanRow {
  id: string
  rationale: string
  focus_areas: string[]
}

export function PlanPage() {
  const [plan, setPlan] = useState<PlanRow | null>(null)
  const [items, setItems] = useState<PlanItemRow[]>([])
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

        // Scoped to THIS week — an older plan existing must not stop a fresh one from being
        // generated, otherwise the "weekly" plan is really a one-time plan shown forever.
        const { data: existing, error: existingError } = await supabase
          .from('plans')
          .select('id, rationale, focus_areas')
          .eq('profile_id', userData.user.id)
          .eq('week_start', currentWeekStartISO())
          .maybeSingle()

        if (cancelled) return
        if (existingError) throw existingError

        let currentPlan = existing
        if (!currentPlan) {
          const planId = await generateWeeklyPlan(userData.user.id)

          if (cancelled) return

          const { data: created, error: createdError } = await supabase
            .from('plans')
            .select('id, rationale, focus_areas')
            .eq('id', planId)
            .single()

          if (cancelled) return
          if (createdError) throw createdError

          currentPlan = created
        }

        if (!currentPlan) {
          setError(true)
          return
        }

        setPlan(currentPlan)

        const { data: planItems, error: itemsError } = await supabase
          .from('plan_items')
          .select('id, target_day, status, drills(title, objective)')
          .eq('plan_id', currentPlan.id)
          .order('target_day')

        if (cancelled) return
        if (itemsError) throw itemsError

        setItems((planItems as unknown as PlanItemRow[]) ?? [])
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

  if (error || !plan) return <p>Couldn't load your plan — try again.</p>

  return (
    <div>
      <h1>This week's plan</h1>
      <p>{plan.rationale}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.drills?.title} — {item.drills?.objective} (day {item.target_day})
          </li>
        ))}
      </ul>
    </div>
  )
}
