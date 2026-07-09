import type { MetricResult } from '../analysis/types'
import type { Skill } from '../analysis/skillConfig'

const CONFIDENCE_FLOOR = 0.5

export interface FaultRule {
  tag: string
  skill: Skill
  metricKey: string
  direction: 'above' | 'below'
  threshold: number
  impact: number
  fixability: number
}

export interface DetectedFault {
  tag: string
  severity: number // how far past the threshold, normalized 0-1+
}

export interface AggregatedFault {
  tag: string
  frequency: number // 0-1, share of reps this fault appeared in
  avgSeverity: number
  priority: number
}

export const FAULT_RULES: FaultRule[] = [
  { tag: 'shooting_torso_lean', skill: 'shooting', metricKey: 'bodyLean', direction: 'above', threshold: 15, impact: 0.9, fixability: 0.8 },
  { tag: 'shooting_balance_wobble', skill: 'shooting', metricKey: 'balance', direction: 'above', threshold: 0.04, impact: 0.7, fixability: 0.7 },
  { tag: 'shooting_followthrough_short', skill: 'shooting', metricKey: 'followThrough', direction: 'below', threshold: 0.08, impact: 0.6, fixability: 0.7 },
  { tag: 'shooting_landing_unstable', skill: 'shooting', metricKey: 'landing', direction: 'above', threshold: 0.04, impact: 0.6, fixability: 0.6 },
  { tag: 'shooting_plant_inconsistent', skill: 'shooting', metricKey: 'plantConsistency', direction: 'above', threshold: 0.06, impact: 0.8, fixability: 0.9 },

  { tag: 'passing_plant_inconsistent', skill: 'passing', metricKey: 'plantConsistency', direction: 'above', threshold: 0.06, impact: 0.8, fixability: 0.9 },
  { tag: 'passing_ankle_unstable', skill: 'passing', metricKey: 'ankleLock', direction: 'above', threshold: 15, impact: 0.6, fixability: 0.6 },
  // directionConsistency is degrees of stddev in follow-through angle across the session's reps (see Task 15, computed via analysis/metrics.ts#repConsistency) — not the raw followThrough() distance metric, which is a different scale.
  { tag: 'passing_direction_inconsistent', skill: 'passing', metricKey: 'directionConsistency', direction: 'above', threshold: 12, impact: 0.6, fixability: 0.6 },
  { tag: 'passing_balance_wobble', skill: 'passing', metricKey: 'balance', direction: 'above', threshold: 0.04, impact: 0.6, fixability: 0.7 },

  { tag: 'first_touch_closed_stance', skill: 'first_touch', metricKey: 'orientation', direction: 'below', threshold: 15, impact: 0.7, fixability: 0.8 },
  { tag: 'first_touch_stiff_cushion', skill: 'first_touch', metricKey: 'cushioning', direction: 'below', threshold: 5, impact: 0.6, fixability: 0.6 },
  { tag: 'first_touch_balance_unstable', skill: 'first_touch', metricKey: 'balance', direction: 'above', threshold: 0.04, impact: 0.6, fixability: 0.7 },
]

export function detectFaults(skill: Skill, metrics: Record<string, MetricResult>): DetectedFault[] {
  const faults: DetectedFault[] = []
  for (const rule of FAULT_RULES) {
    if (rule.skill !== skill) continue
    const metric = metrics[rule.metricKey]
    if (!metric || metric.confidence < CONFIDENCE_FLOOR) continue

    const crossed = rule.direction === 'above' ? metric.value > rule.threshold : metric.value < rule.threshold
    if (!crossed) continue

    const severity =
      rule.direction === 'above'
        ? (metric.value - rule.threshold) / rule.threshold
        : (rule.threshold - metric.value) / rule.threshold
    faults.push({ tag: rule.tag, severity: Math.max(0, severity) })
  }
  return faults
}

export function aggregateFaults(perRepFaults: DetectedFault[][]): AggregatedFault[] {
  const totalReps = perRepFaults.length
  if (totalReps === 0) return []

  const byTag = new Map<string, DetectedFault[]>()
  for (const repFaults of perRepFaults) {
    for (const fault of repFaults) {
      const list = byTag.get(fault.tag) ?? []
      list.push(fault)
      byTag.set(fault.tag, list)
    }
  }

  const results: AggregatedFault[] = []
  for (const [tag, occurrences] of byTag) {
    const rule = FAULT_RULES.find((r) => r.tag === tag)!
    const frequency = occurrences.length / totalReps
    const avgSeverity = occurrences.reduce((a, o) => a + o.severity, 0) / occurrences.length
    const priority = rule.impact * frequency * rule.fixability
    results.push({ tag, frequency, avgSeverity, priority })
  }

  return results.sort((a, b) => b.priority - a.priority)
}
