import type { Landmark } from './types'

export interface Vec2 { x: number; y: number }

export function distance(a: Landmark | Vec2, b: Landmark | Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function midpoint(a: Landmark, b: Landmark): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Angle in degrees between the vector from `from` to `to` and the vertical (y) axis. 0 = perfectly vertical.
 *
 * Deliberately magnitude-only: both components are folded with Math.abs() before atan2, so the result is an
 * unsigned [0°, 90°] value and cannot indicate which way the lean goes (left/right or forward/backward).
 * Determining direction would require a reference direction this function doesn't have. Callers needing
 * directional coaching copy must not claim a specific lean direction from this value alone.
 */
export function angleFromVertical(from: Landmark | Vec2, to: Landmark | Vec2): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const radians = Math.atan2(Math.abs(dx), Math.abs(dy))
  return (radians * 180) / Math.PI
}

/** Angle in degrees between two direction vectors, 0-180. */
export function angleBetweenVectors(a: Vec2, b: Vec2): number {
  const dot = a.x * b.x + a.y * b.y
  const magA = Math.hypot(a.x, a.y)
  const magB = Math.hypot(b.x, b.y)
  if (magA === 0 || magB === 0) return 0
  const cos = Math.min(1, Math.max(-1, dot / (magA * magB)))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Population standard deviation. */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Confidence for a metric is the weakest visibility among the landmarks it depends on. */
export function landmarkConfidence(landmarks: Landmark[]): number {
  if (landmarks.length === 0) return 0
  return Math.min(...landmarks.map((l) => l.visibility ?? 1))
}
