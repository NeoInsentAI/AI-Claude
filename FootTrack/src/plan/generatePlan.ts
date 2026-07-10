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

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const { data: plan, error } = await supabase
    .from('plans')
    .insert({ profile_id: profileId, week_start: weekStart.toISOString().slice(0, 10), focus_areas: focusAreas, rationale })
    .select()
    .single()
  if (error) throw error

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
