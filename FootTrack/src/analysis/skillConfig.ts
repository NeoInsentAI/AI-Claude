import { LM } from './types'

export type Skill = 'shooting' | 'passing' | 'first_touch'
export type Foot = 'left' | 'right'

export function ankleIndexFor(foot: Foot): number {
  return foot === 'left' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE
}

export function kneeIndexFor(foot: Foot): number {
  return foot === 'left' ? LM.LEFT_KNEE : LM.RIGHT_KNEE
}

export function hipIndexFor(foot: Foot): number {
  return foot === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP
}

export const SKILL_LABELS: Record<Skill, string> = {
  shooting: 'Shooting — Instep Drive',
  passing: 'Passing — Push Pass',
  first_touch: 'First Touch — Ground Ball',
}
