import type { AggregatedFault } from './faultTaxonomy'

export interface FeedbackItemDraft {
  kind: 'priority_fix' | 'win' | 'correction'
  faultTag: string | null
  copy: string
  rank: number
}

const COPY_TEMPLATES: Record<string, (f: AggregatedFault) => string> = {
  shooting_torso_lean: (f) =>
    `Your torso is pulling well off vertical on ${Math.round(f.frequency * 100)}% of your strikes — that instability is costing you accuracy. Focus on staying tall and balanced through contact.`,
  shooting_balance_wobble: (f) =>
    `Your balance wavers before contact on ${Math.round(f.frequency * 100)}% of reps. A steadier approach will make everything downstream more consistent.`,
  shooting_followthrough_short: () =>
    `You're stopping your leg almost at the ball — a stab, not a swing. Let your leg carry on toward the target.`,
  shooting_landing_unstable: (f) =>
    `You're landing unbalanced on ${Math.round(f.frequency * 100)}% of shots. In a game that costs you the next action.`,
  shooting_plant_inconsistent: () =>
    `Your plant-foot placement varies rep to rep — that inconsistency is costing you accuracy more than power ever would.`,
  passing_plant_inconsistent: () => `Your plant foot lands in a different spot almost every pass. Lock that in first, before worrying about power.`,
  passing_ankle_unstable: () => `Your ankle looks loose through contact — lock it and point your toes down through the pass.`,
  passing_direction_inconsistent: () => `Your follow-through direction varies a lot between passes — that's showing up as inconsistent accuracy.`,
  passing_balance_wobble: () => `Your balance wavers before you strike the pass. Settle your base first.`,
  first_touch_closed_stance: () => `You're receiving mostly square to the ball. Try arriving side-on so your first touch can go forward.`,
  first_touch_stiff_cushion: () => `Your first touch looks stiff — let your ankle and knee give a little on contact to control the ball softer.`,
  first_touch_balance_unstable: () => `You're unsteady at the moment you receive the ball. Settle your base before the ball arrives.`,
}

const WIN_TEMPLATES: Record<string, (f: AggregatedFault) => string> = {
  shooting_torso_lean: () => `Your torso stayed upright and balanced on most of your strikes.`,
  shooting_balance_wobble: () => `Your pre-contact balance was steady across the session.`,
  shooting_followthrough_short: () => `Your follow-through carried all the way through the target line.`,
  shooting_landing_unstable: () => `You stuck your landing cleanly on most shots.`,
  shooting_plant_inconsistent: () => `Your plant-foot placement was consistent rep to rep.`,
  passing_plant_inconsistent: () => `Your plant-foot placement was consistent across passes.`,
  passing_ankle_unstable: () => `Your ankle stayed locked through contact.`,
  passing_direction_inconsistent: () => `Your passes held a consistent line.`,
  passing_balance_wobble: () => `You stayed balanced through your passing.`,
  first_touch_closed_stance: () => `You opened your body well before receiving.`,
  first_touch_stiff_cushion: () => `Your first touch had a nice soft cushion.`,
  first_touch_balance_unstable: () => `You stayed steady at the moment of receiving.`,
}

/** All fault tags this session could plausibly have shown, per skill — used to mine genuine wins (faults that were checked for but not present). Kept in sync with faultTaxonomy.FAULT_RULES tags by convention; Task 14 wires the real per-session tag list through. */
export function generateFeedback(rankedFaults: AggregatedFault[], checkedTags: string[] = []): FeedbackItemDraft[] {
  if (rankedFaults.length === 0) {
    return [{ kind: 'win', faultTag: null, copy: 'Clean session — no significant technique faults detected.', rank: 0 }]
  }

  const items: FeedbackItemDraft[] = []
  const [priorityFault, ...rest] = rankedFaults

  items.push({
    kind: 'priority_fix',
    faultTag: priorityFault.tag,
    copy: COPY_TEMPLATES[priorityFault.tag]?.(priorityFault) ?? `Focus on fixing: ${priorityFault.tag}`,
    rank: 0,
  })

  rest.slice(0, 2).forEach((fault, i) => {
    items.push({
      kind: 'correction',
      faultTag: fault.tag,
      copy: COPY_TEMPLATES[fault.tag]?.(fault) ?? `Also work on: ${fault.tag}`,
      rank: i + 1,
    })
  })

  const faultTagsPresent = new Set(rankedFaults.map((f) => f.tag))
  const wins = checkedTags
    .filter((tag) => !faultTagsPresent.has(tag) && WIN_TEMPLATES[tag])
    .slice(0, 3)
    .map((tag, i) => ({ kind: 'win' as const, faultTag: tag, copy: WIN_TEMPLATES[tag]({ tag, frequency: 0, avgSeverity: 0, priority: 0 }), rank: i }))
  items.push(...wins)

  return items
}
