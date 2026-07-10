import { supabase } from '../lib/supabase'

export interface SkillScoreRow {
  attribute: string
  skill: string | null
  value: number
  computed_at: string
}

export interface TrendTile {
  attribute: 'technique' | 'balance' | 'alignment' | 'consistency' | 'weak_foot_confidence'
  label: string
  value: number | null
}

const TILE_LABELS: Record<TrendTile['attribute'], string> = {
  technique: 'Technique',
  balance: 'Balance',
  alignment: 'Body Alignment',
  consistency: 'Consistency',
  weak_foot_confidence: 'Weak Foot Confidence',
}

export function buildTrendTiles(rows: SkillScoreRow[]): TrendTile[] {
  const latestByKey = new Map<string, SkillScoreRow>()
  for (const row of rows) {
    const key = `${row.attribute}:${row.skill ?? 'account'}`
    const existing = latestByKey.get(key)
    if (!existing || row.computed_at > existing.computed_at) latestByKey.set(key, row)
  }

  return (Object.keys(TILE_LABELS) as TrendTile['attribute'][]).map((attribute) => {
    if (attribute === 'weak_foot_confidence') {
      const row = latestByKey.get('weak_foot_confidence:account')
      return { attribute, label: TILE_LABELS[attribute], value: row?.value ?? null }
    }
    const perSkillValues = ['shooting', 'passing', 'first_touch']
      .map((skill) => latestByKey.get(`${attribute}:${skill}`)?.value)
      .filter((v): v is number => v !== undefined)
    const value = perSkillValues.length === 0 ? null : perSkillValues.reduce((a, v) => a + v, 0) / perSkillValues.length
    return { attribute, label: TILE_LABELS[attribute], value }
  })
}

export async function loadTrends(profileId: string): Promise<TrendTile[]> {
  const { data, error } = await supabase
    .from('skill_scores')
    .select('attribute, skill, value, computed_at')
    .eq('profile_id', profileId)
  if (error) throw error
  return buildTrendTiles(data ?? [])
}
