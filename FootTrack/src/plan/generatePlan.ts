import { supabase } from '../lib/supabase'
import type { Skill } from '../analysis/skillConfig'

const ALL_SKILLS: Skill[] = ['shooting', 'passing', 'first_touch']

export function chooseFocusAreas(scores: { skill: Skill; technique: number }[]): Skill[] {
  if (scores.length === 0) return ALL_SKILLS
  return [...scores].sort((a, b) => a.technique - b.technique).slice(0, 2).map((s) => s.skill)
}

/** Spreads plan items across the week, capped at day 7 (the plan_items.target_day CHECK constraint's max) regardless of how many items there are. */
export function targetDayFor(index: number): number {
  return Math.min(7, (index + 1) * 2)
}

/**
 * The current week's start (most recent Sunday) as a YYYY-MM-DD string, computed entirely in
 * LOCAL calendar terms. Deliberately avoids `toISOString()`: that converts the instant to UTC
 * first, so for any non-UTC timezone there's a window near local midnight where the rendered
 * date flips by one day (e.g. 1:00 AM Sunday in UTC+5:30 renders as Saturday's date).
 */
export function currentWeekStartISO(now: Date = new Date()): string {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const y = sunday.getFullYear()
  const m = String(sunday.getMonth() + 1).padStart(2, '0')
  const d = String(sunday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function generateWeeklyPlan(profileId: string): Promise<string> {
  const { data: rows } = await supabase
    .from('skill_scores')
    .select('skill, value, computed_at')
    .eq('profile_id', profileId)
    .eq('attribute', 'technique')
    .not('skill', 'is', null)
    .order('computed_at', { ascending: false })

  const latestPerSkill = new Map<string, number>()
  for (const row of rows ?? []) {
    if (!latestPerSkill.has(row.skill as string)) latestPerSkill.set(row.skill as string, row.value)
  }
  const scores = Array.from(latestPerSkill.entries()).map(([skill, technique]) => ({ skill: skill as Skill, technique }))
  const focusAreas = chooseFocusAreas(scores)

  const rationale =
    scores.length === 0
      ? `Starting with all 3 skills this week to build your baseline.`
      : `Focusing on ${focusAreas.join(' and ')} this week — your lowest technique scores right now.`

  const weekStart = currentWeekStartISO()

  const { data: plan, error } = await supabase
    .from('plans')
    .insert({ profile_id: profileId, week_start: weekStart, focus_areas: focusAreas, rationale })
    .select()
    .single()
  if (error) {
    // 23505 = unique_violation on plans(profile_id, week_start): a concurrent call (second tab,
    // fast double-mount) already created this week's plan — and its items — between our check and
    // insert. Return the existing plan instead of failing or duplicating.
    if (error.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('plans')
        .select('id')
        .eq('profile_id', profileId)
        .eq('week_start', weekStart)
        .single()
      if (existingError) throw existingError
      return existing.id
    }
    throw error
  }

  const { data: drills } = await supabase.from('drills').select('id, category').in('category', focusAreas)
  const chosen = (drills ?? []).slice(0, 3)

  // Weak-foot drills live in their own category and are never one of focusAreas (which is always shooting/passing/first_touch),
  // so without this they'd never be reachable — cross-checked against the account-wide weak_foot_confidence score instead.
  const { data: weakFootScore } = await supabase
    .from('skill_scores')
    .select('value')
    .eq('profile_id', profileId)
    .eq('attribute', 'weak_foot_confidence')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (weakFootScore && weakFootScore.value < 65) {
    const { data: weakFootDrills } = await supabase.from('drills').select('id').eq('category', 'weak_foot').limit(1)
    if (weakFootDrills && weakFootDrills.length > 0) chosen.push({ id: weakFootDrills[0].id, category: 'weak_foot' })
  }

  if (chosen.length > 0) {
    const { error: itemsError } = await supabase.from('plan_items').insert(
      chosen.map((d, i) => ({ plan_id: plan.id, drill_id: d.id, target_day: targetDayFor(i) }))
    )
    // The target_day=8 CHECK-constraint failure that motivated this task's fix commit was exactly
    // this class of bug: an unchecked insert here silently left a `plans` row with zero items and
    // no error anywhere. Don't let a *different* cause of the same insert failing regress to the
    // same silent symptom.
    if (itemsError) throw itemsError
  }

  return plan.id
}
