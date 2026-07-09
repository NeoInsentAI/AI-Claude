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

/** Simulates one ankle swinging out to x=0.8 and back over `frames` samples, spaced `stepMs` apart, centered at `centerMs`. */
function swing(centerMs: number, stepMs: number, ankleIndex: number): PoseFrame[] {
  const offsets = [-3, -2, -1, 0, 1, 2, 3]
  return offsets.map((o) => {
    const x = 0.5 + Math.max(0, 0.3 - Math.abs(o) * 0.1) // peaks at o=0
    return stillFrame(centerMs + o * stepMs, { [ankleIndex]: { x, y: 0.5, z: 0, visibility: 1 } })
  })
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
