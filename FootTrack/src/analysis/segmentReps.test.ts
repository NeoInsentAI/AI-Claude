import { describe, it, expect } from 'vitest'
import { segmentReps } from './segmentReps'
import { LM } from './types'
import type { PoseFrame, Landmark } from './types'

/** Builds a still frame with every landmark at a base position, 33 entries. */
function stillFrame(t: number, overrides: Partial<Record<number, Landmark>> = {}): PoseFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))
  for (const [i, lm] of Object.entries(overrides)) if (lm) landmarks[Number(i)] = lm
  return { timestampMs: t, landmarks }
}

/**
 * Simulates one ankle swinging out and back over 7 frames spaced `stepMs` apart, centered at `centerMs`.
 *
 * The frame-to-frame |dx| magnitudes are deliberately asymmetric — strictly increasing into the
 * peak (0.04 < 0.08 < 0.14) and strictly decreasing out of it (0.14 > 0.13 > 0.09 > 0.04) — rather
 * than a symmetric `0.3 - |offset| * 0.1` triangle. A symmetric triangle produces identical
 * frame-to-frame deltas on both sides of the center, which is a tied velocity plateau under exact
 * math; it only "worked" before via microscopic IEEE-754 rounding noise nudging one side higher.
 * This profile has a genuine, by-construction single maximum (verified: the peak beats its
 * neighbors by ~0.3-1.8 units/s, many orders of magnitude above floating-point noise) at the
 * transition landing on offset 0, i.e. timestamp === centerMs.
 */
function swing(centerMs: number, stepMs: number, ankleIndex: number): PoseFrame[] {
  const offsets = [-3, -2, -1, 0, 1, 2, 3]
  const deltas = [0.04, 0.08, 0.14, -0.13, -0.09, -0.04] // |dx| ramps up then down, peak at index 3
  const xs = [0.5]
  for (const d of deltas) xs.push(xs[xs.length - 1] + d)
  return offsets.map((o, i) => stillFrame(centerMs + o * stepMs, { [ankleIndex]: { x: xs[i], y: 0.5, z: 0, visibility: 1 } }))
}

describe('segmentReps', () => {
  it('returns no reps for a still clip', () => {
    const frames = Array.from({ length: 10 }, (_, i) => stillFrame(i * 33))
    expect(segmentReps(frames, LM.RIGHT_ANKLE)).toEqual([])
  })

  it('detects a single rep from one swing', () => {
    const frames = swing(500, 33, LM.RIGHT_ANKLE)
    const reps = segmentReps(frames, LM.RIGHT_ANKLE)
    expect(reps).toHaveLength(1)
    expect(reps[0].contactTimestampMs).toBeCloseTo(500, -1)
  })

  it('detects two reps separated by more than the refractory window', () => {
    const frames = [...swing(500, 33, LM.RIGHT_ANKLE), ...swing(2500, 33, LM.RIGHT_ANKLE)]
    const reps = segmentReps(frames, LM.RIGHT_ANKLE)
    expect(reps).toHaveLength(2)
  })

  it('merges near-duplicate peaks inside the refractory window into one rep', () => {
    const frames = [...swing(500, 33, LM.RIGHT_ANKLE), ...swing(650, 33, LM.RIGHT_ANKLE)]
    const reps = segmentReps(frames, LM.RIGHT_ANKLE)
    expect(reps).toHaveLength(1)
  })
})
