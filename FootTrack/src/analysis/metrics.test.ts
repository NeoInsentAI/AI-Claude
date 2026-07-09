import { describe, it, expect } from 'vitest'
import {
  bodyLeanAtContact,
  preContactBalance,
  followThrough,
  landingStability,
  plantFootConsistency,
  hipRotation,
  receivingBodyOrientation,
  cushioningMotion,
  ankleLockDeviation,
  repConsistency,
} from './metrics'
import { LM } from './types'
import type { PoseFrame, Landmark } from './types'

function frame(t: number, overrides: Partial<Record<number, Landmark>>): PoseFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))
  for (const [i, lm] of Object.entries(overrides)) landmarks[Number(i)] = lm as Landmark
  return { timestampMs: t, landmarks }
}
const lm = (x: number, y: number, v = 1): Landmark => ({ x, y, z: 0, visibility: v })

describe('bodyLeanAtContact', () => {
  it('is near 0 for an upright torso', () => {
    const f = frame(0, {
      [LM.LEFT_SHOULDER]: lm(0.48, 0.2), [LM.RIGHT_SHOULDER]: lm(0.52, 0.2),
      [LM.LEFT_HIP]: lm(0.48, 0.6), [LM.RIGHT_HIP]: lm(0.52, 0.6),
    })
    const result = bodyLeanAtContact(f)
    expect(result.value).toBeLessThan(5)
    expect(result.confidence).toBe(1)
  })

  it('is large for a strongly backward-leaning torso', () => {
    const f = frame(0, {
      [LM.LEFT_SHOULDER]: lm(0.2, 0.25), [LM.RIGHT_SHOULDER]: lm(0.24, 0.25),
      [LM.LEFT_HIP]: lm(0.48, 0.6), [LM.RIGHT_HIP]: lm(0.52, 0.6),
    })
    expect(bodyLeanAtContact(f).value).toBeGreaterThan(20)
  })
})

describe('preContactBalance', () => {
  it('reports low wobble for a steady hip position', () => {
    const frames = [0, 33, 66, 99].map((t) =>
      frame(t, { [LM.LEFT_HIP]: lm(0.5, 0.6), [LM.RIGHT_HIP]: lm(0.54, 0.6) })
    )
    expect(preContactBalance(frames).value).toBeLessThan(0.01)
  })

  it('reports high wobble for a swaying hip position', () => {
    const xs = [0.4, 0.6, 0.42, 0.58]
    const frames = xs.map((x, i) => frame(i * 33, { [LM.LEFT_HIP]: lm(x, 0.6), [LM.RIGHT_HIP]: lm(x + 0.04, 0.6) }))
    expect(preContactBalance(frames).value).toBeGreaterThan(0.05)
  })
})

describe('followThrough', () => {
  it('measures displacement of the striking ankle after contact', () => {
    const frames = [0, 100, 200, 300].map((t) =>
      frame(t, { [LM.RIGHT_ANKLE]: lm(0.5 + t / 1000, 0.9) })
    )
    const result = followThrough(frames, 0, LM.RIGHT_ANKLE)
    expect(result.value).toBeCloseTo(0.3, 1)
  })
})

describe('landingStability', () => {
  it('reports low wobble when the hip stays put after contact', () => {
    const frames = [0, 100, 200].map((t) => frame(t, { [LM.LEFT_HIP]: lm(0.5, 0.6), [LM.RIGHT_HIP]: lm(0.54, 0.6) }))
    expect(landingStability(frames, 0).value).toBeLessThan(0.01)
  })
})

describe('plantFootConsistency', () => {
  it('is 0 when the plant foot lands in the same relative spot every rep', () => {
    const positions = [0.3, 0.3, 0.3, 0.3]
    expect(plantFootConsistency(positions).value).toBeCloseTo(0)
  })
  it('is greater than 0 when plant-foot position varies across reps', () => {
    expect(plantFootConsistency([0.2, 0.35, 0.25, 0.4]).value).toBeGreaterThan(0.05)
  })
})

describe('hipRotation', () => {
  it('is always tagged Estimated-level confidence (capped below 0.7) since it is camera-angle dependent', () => {
    const preSwing = frame(0, { [LM.LEFT_HIP]: lm(0.4, 0.6), [LM.RIGHT_HIP]: lm(0.6, 0.6) })
    const contact = frame(300, { [LM.LEFT_HIP]: lm(0.45, 0.6), [LM.RIGHT_HIP]: lm(0.65, 0.6) })
    expect(hipRotation(preSwing, contact).confidence).toBeLessThanOrEqual(0.7)
  })
})

describe('receivingBodyOrientation', () => {
  it('reports near 0 degrees for a square-to-camera stance', () => {
    const f = frame(0, { [LM.LEFT_HIP]: lm(0.4, 0.6), [LM.RIGHT_HIP]: lm(0.6, 0.6) })
    expect(Math.abs(receivingBodyOrientation(f).value)).toBeLessThan(5)
  })
  it('reports a large angle for an open, side-on stance', () => {
    const f = frame(0, { [LM.LEFT_HIP]: lm(0.48, 0.55), [LM.RIGHT_HIP]: lm(0.52, 0.65) })
    expect(Math.abs(receivingBodyOrientation(f).value)).toBeGreaterThan(30)
  })
})

describe('cushioningMotion', () => {
  it('detects increasing knee flexion as a cushioning give', () => {
    const before = frame(0, {
      [LM.RIGHT_HIP]: lm(0.5, 0.5), [LM.RIGHT_KNEE]: lm(0.5, 0.7), [LM.RIGHT_ANKLE]: lm(0.5, 0.9),
    })
    const atTouch = frame(200, {
      [LM.RIGHT_HIP]: lm(0.5, 0.5), [LM.RIGHT_KNEE]: lm(0.56, 0.68), [LM.RIGHT_ANKLE]: lm(0.5, 0.9),
    })
    expect(cushioningMotion(before, atTouch, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE).value).toBeGreaterThan(0)
  })
})

describe('ankleLockDeviation', () => {
  it('is near 0 when the ankle joint is close to the locked reference angle', () => {
    const f = frame(0, {
      [LM.RIGHT_KNEE]: lm(0.5, 0.3), [LM.RIGHT_ANKLE]: lm(0.5, 0.9), [LM.RIGHT_FOOT_INDEX]: lm(0.58, 0.92),
    })
    expect(ankleLockDeviation(f, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX).value).toBeLessThan(30)
  })
  it('caps confidence at 0.7 since it is an Estimated signal', () => {
    const f = frame(0, {
      [LM.RIGHT_KNEE]: lm(0.5, 0.3), [LM.RIGHT_ANKLE]: lm(0.5, 0.9), [LM.RIGHT_FOOT_INDEX]: lm(0.58, 0.92),
    })
    expect(ankleLockDeviation(f, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX).confidence).toBeLessThanOrEqual(0.7)
  })
})

describe('repConsistency', () => {
  it('is 0 for identical values and greater than 0 for varying values', () => {
    expect(repConsistency([10, 10, 10]).value).toBeCloseTo(0)
    expect(repConsistency([5, 20, 8, 25]).value).toBeGreaterThan(5)
  })
})
