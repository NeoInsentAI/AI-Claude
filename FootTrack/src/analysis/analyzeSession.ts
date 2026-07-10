import { extractPoseFrames } from './poseLandmarker'
import { segmentReps, type RepWindow } from './segmentReps'
import * as M from './metrics'
import { LM } from './types'
import type { PoseFrame, MetricResult } from './types'
import { ankleIndexFor, kneeIndexFor, hipIndexFor, type Skill, type Foot } from './skillConfig'
import { detectFaults, aggregateFaults, FAULT_RULES } from '../feedback/faultTaxonomy'
import { generateFeedback, type FeedbackItemDraft } from '../feedback/generateFeedback'
import { sessionScore } from '../feedback/scoring'

export interface AnalyzedRep {
  repIndex: number
  contactTimestampMs: number
  foot: Foot
  metrics: Record<string, MetricResult>
  qualityClass: 'clean' | 'minor_fault' | 'major_fault'
}

export interface SessionAnalysis {
  reps: AnalyzedRep[]
  sessionScoreValue: number
  feedback: FeedbackItemDraft[]
  mechanicsQuality: number
  consistency: number
  balanceScore: number   // 0-100, higher = steadier
  alignmentScore: number // 0-100, higher = better body-lean/orientation control
}

/** Maps a "lower raw value is better" metric onto a 0-100 score. Values at or below `good` score 100; at or above `bad` score 0; linear between. Requires good < bad. */
function toScore(value: number, good: number, bad: number): number {
  const clamped = Math.min(bad, Math.max(good, value))
  return Math.round(100 * (1 - (clamped - good) / (bad - good)))
}

/** Same as `toScore` but for "higher raw value is better" metrics (e.g. an open receiving-stance angle). Requires bad < good. */
function toScoreHigherIsBetter(value: number, bad: number, good: number): number {
  return toScore(-value, -good, -bad)
}

const TARGET_REPS: Record<Skill, number> = { shooting: 10, passing: 10, first_touch: 10 }

export async function analyzeSession(video: HTMLVideoElement, skill: Skill, footFocus: Foot): Promise<SessionAnalysis> {
  const frames = await extractPoseFrames(video)
  const ankleIdx = ankleIndexFor(footFocus)
  const repWindows = segmentReps(frames, ankleIdx)

  const rawPerRep = repWindows.map((rep) => computeSingleRepMetrics(skill, footFocus, frames, rep))

  const plantConsistency = M.repConsistency(rawPerRep.map((r) => r.plantFootX))
  const directionConsistency = M.repConsistency(rawPerRep.map((r) => r.followThroughAngle))

  const analyzedReps: AnalyzedRep[] = rawPerRep.map((r, i) => {
    const metrics: Record<string, MetricResult> = { ...r.metrics, plantConsistency }
    if (skill === 'passing') metrics.directionConsistency = directionConsistency
    const faults = detectFaults(skill, metrics)
    const qualityClass = faults.some((f) => f.severity > 0.5) ? 'major_fault' : faults.length > 0 ? 'minor_fault' : 'clean'
    return { repIndex: i, contactTimestampMs: repWindows[i].contactTimestampMs, foot: footFocus, metrics, qualityClass }
  })

  const perRepFaults = analyzedReps.map((r) => detectFaults(skill, r.metrics))
  const rankedFaults = aggregateFaults(perRepFaults)
  const checkedTags = FAULT_RULES.filter((r) => r.skill === skill).map((r) => r.tag)
  const feedback = generateFeedback(rankedFaults, checkedTags)

  const cleanShare = analyzedReps.length === 0 ? 0 : analyzedReps.filter((r) => r.qualityClass === 'clean').length / analyzedReps.length
  const consistency = 1 - Math.min(1, plantConsistency.value / 0.15)
  const completion = Math.min(1, analyzedReps.length / TARGET_REPS[skill])
  const sessionScoreValue = sessionScore({ mechanicsQuality: cleanShare, consistency, completion })

  // Balance and alignment scores average each rep's balance/lean-family metric (whichever the skill computed) onto a 0-100 scale.
  // Thresholds mirror the fault taxonomy's own good/bad boundaries (Task 12) so a fault-triggering rep also visibly drags the trend down.
  const balanceValues = analyzedReps.map((r) => r.metrics.balance?.value).filter((v): v is number => v !== undefined)
  const balanceScore = balanceValues.length === 0 ? 50 : Math.round(balanceValues.reduce((a, v) => a + toScore(v, 0.01, 0.08), 0) / balanceValues.length)

  // shooting/passing: alignment tracks body lean (lower is better). first_touch: alignment tracks how open the receiving
  // stance is (higher is better) — metrics.orientation is already a non-negative magnitude (abs'd at the source above).
  const alignmentValues =
    skill === 'first_touch'
      ? analyzedReps.map((r) => r.metrics.orientation?.value).filter((v): v is number => v !== undefined)
      : analyzedReps.map((r) => r.metrics.bodyLean?.value).filter((v): v is number => v !== undefined)
  const alignmentScore =
    alignmentValues.length === 0
      ? 50
      : Math.round(
          alignmentValues.reduce(
            (a, v) => a + (skill === 'first_touch' ? toScoreHigherIsBetter(v, 5, 45) : toScore(v, 2, 25)),
            0
          ) / alignmentValues.length
        )

  return { reps: analyzedReps, sessionScoreValue, feedback, mechanicsQuality: cleanShare, consistency, balanceScore, alignmentScore }
}

function computeSingleRepMetrics(
  skill: Skill,
  foot: Foot,
  frames: PoseFrame[],
  rep: RepWindow
): { plantFootX: number; followThroughAngle: number; metrics: Record<string, MetricResult> } {
  const windowFrames = frames.slice(rep.startFrameIndex, rep.endFrameIndex + 1)
  const contactIdxInWindow = rep.contactFrameIndex - rep.startFrameIndex
  const contactFrame = frames[rep.contactFrameIndex]
  const ankleIdx = ankleIndexFor(foot)
  const kneeIdx = kneeIndexFor(foot)
  const hipIdx = hipIndexFor(foot)
  const footIndexIdx = foot === 'left' ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX

  const hipMidX = (contactFrame.landmarks[LM.LEFT_HIP].x + contactFrame.landmarks[LM.RIGHT_HIP].x) / 2
  const plantFootX = contactFrame.landmarks[ankleIdx].x - hipMidX
  const endFrame = frames[rep.endFrameIndex]
  const followThroughAngle =
    Math.atan2(endFrame.landmarks[ankleIdx].y - contactFrame.landmarks[ankleIdx].y, endFrame.landmarks[ankleIdx].x - contactFrame.landmarks[ankleIdx].x) *
    (180 / Math.PI)

  if (skill === 'shooting') {
    return {
      plantFootX,
      followThroughAngle,
      metrics: {
        bodyLean: M.bodyLeanAtContact(contactFrame),
        balance: M.preContactBalance(windowFrames.slice(0, contactIdxInWindow + 1)),
        followThrough: M.followThrough(windowFrames, contactIdxInWindow, ankleIdx),
        landing: M.landingStability(windowFrames, contactIdxInWindow),
        hipRotation: M.hipRotation(windowFrames[0], contactFrame),
      },
    }
  }
  if (skill === 'passing') {
    return {
      plantFootX,
      followThroughAngle,
      metrics: {
        bodyLean: M.bodyLeanAtContact(contactFrame),
        balance: M.preContactBalance(windowFrames.slice(0, contactIdxInWindow + 1)),
        ankleLock: M.ankleLockDeviation(contactFrame, kneeIdx, ankleIdx, footIndexIdx),
      },
    }
  }
  // receivingBodyOrientation returns a signed angle (0 = square, sign depends on which way the player
  // is turned). Task 12's first_touch_closed_stance rule does a plain "below threshold" comparison,
  // which only works on a non-negative magnitude — a mirrored open stance would otherwise read as a
  // large *negative* value and get wrongly flagged as closed. Store the absolute value here so every
  // downstream consumer (fault detection, alignment scoring) sees a consistent non-negative convention.
  const orientationRaw = M.receivingBodyOrientation(contactFrame)
  return {
    plantFootX,
    followThroughAngle,
    metrics: {
      orientation: { value: Math.abs(orientationRaw.value), confidence: orientationRaw.confidence },
      balance: M.preContactBalance(windowFrames.slice(0, contactIdxInWindow + 1)),
      cushioning: M.cushioningMotion(windowFrames[0], contactFrame, hipIdx, kneeIdx, ankleIdx),
    },
  }
}
