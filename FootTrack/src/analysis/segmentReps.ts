import type { PoseFrame } from './types'
import { distance } from './geometry'

export interface RepWindow {
  contactFrameIndex: number
  contactTimestampMs: number
  startFrameIndex: number
  endFrameIndex: number
}

const VELOCITY_THRESHOLD = 0.15 // normalized units/second — tuned against real clips in Task 15's manual QA pass
const REFRACTORY_MS = 400
const WINDOW_MS = 500 // how far before/after contact a rep's analysis window extends

/** Segments a continuous clip into individual reps by finding local maxima in the tracked ankle's speed. */
export function segmentReps(frames: PoseFrame[], ankleLandmarkIndex: number): RepWindow[] {
  if (frames.length < 3) return []

  const velocities: number[] = [0]
  for (let i = 1; i < frames.length; i++) {
    const dtSeconds = (frames[i].timestampMs - frames[i - 1].timestampMs) / 1000
    const d = distance(frames[i].landmarks[ankleLandmarkIndex], frames[i - 1].landmarks[ankleLandmarkIndex])
    velocities.push(dtSeconds > 0 ? d / dtSeconds : 0)
  }

  const peakIndices: number[] = []
  for (let i = 1; i < velocities.length - 1; i++) {
    if (
      velocities[i] > VELOCITY_THRESHOLD &&
      velocities[i] >= velocities[i - 1] &&
      velocities[i] >= velocities[i + 1]
    ) {
      peakIndices.push(i)
    }
  }

  const mergedPeaks: number[] = []
  for (const idx of peakIndices) {
    const last = mergedPeaks[mergedPeaks.length - 1]
    if (last === undefined || frames[idx].timestampMs - frames[last].timestampMs > REFRACTORY_MS) {
      mergedPeaks.push(idx)
    } else if (velocities[idx] > velocities[last]) {
      mergedPeaks[mergedPeaks.length - 1] = idx // keep the higher peak
    }
  }

  return mergedPeaks.map((contactFrameIndex) => {
    const contactTimestampMs = frames[contactFrameIndex].timestampMs
    const startFrameIndex = findFrameAtOrAfter(frames, contactTimestampMs - WINDOW_MS)
    const endFrameIndex = findFrameAtOrBefore(frames, contactTimestampMs + WINDOW_MS)
    return { contactFrameIndex, contactTimestampMs, startFrameIndex, endFrameIndex }
  })
}

function findFrameAtOrAfter(frames: PoseFrame[], ms: number): number {
  const idx = frames.findIndex((f) => f.timestampMs >= ms)
  return idx === -1 ? 0 : idx
}

function findFrameAtOrBefore(frames: PoseFrame[], ms: number): number {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].timestampMs <= ms) return i
  }
  return frames.length - 1
}
