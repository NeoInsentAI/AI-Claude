import { describe, it, expect } from 'vitest'
import { distance, midpoint, angleFromVertical, angleBetweenVectors, stddev, landmarkConfidence } from './geometry'
import type { Landmark } from './types'

const pt = (x: number, y: number, visibility = 1): Landmark => ({ x, y, z: 0, visibility })

describe('distance', () => {
  it('computes euclidean distance in the x-y plane', () => {
    expect(distance(pt(0, 0), pt(3, 4))).toBeCloseTo(5)
  })
})

describe('midpoint', () => {
  it('averages two points', () => {
    expect(midpoint(pt(0, 0), pt(2, 4))).toEqual(expect.objectContaining({ x: 1, y: 2 }))
  })
})

describe('angleFromVertical', () => {
  it('is 0 degrees for a perfectly vertical vector', () => {
    // shoulder above hip, same x -> vertical torso
    expect(angleFromVertical(pt(0.5, 0.2), pt(0.5, 0.6))).toBeCloseTo(0, 1)
  })
  it('is 90 degrees for a horizontal vector', () => {
    expect(angleFromVertical(pt(0.2, 0.5), pt(0.8, 0.5))).toBeCloseTo(90, 1)
  })
})

describe('angleBetweenVectors', () => {
  it('is 0 for identical directions', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0)
  })
  it('is 90 for perpendicular vectors', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90)
  })
  it('is 180 for opposite vectors', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180)
  })
  it('is 0 for a zero-magnitude vector (documented, not undefined, behavior)', () => {
    expect(angleBetweenVectors({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0)
  })
})

describe('stddev', () => {
  it('is 0 for a constant series', () => {
    expect(stddev([5, 5, 5])).toBeCloseTo(0)
  })
  it('computes population standard deviation', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 0)
  })
})

describe('landmarkConfidence', () => {
  it('returns the minimum visibility across the given landmarks', () => {
    expect(landmarkConfidence([pt(0, 0, 0.9), pt(0, 0, 0.4), pt(0, 0, 0.95)])).toBeCloseTo(0.4)
  })
  it('defaults missing visibility to 1', () => {
    expect(landmarkConfidence([{ x: 0, y: 0, z: 0 }])).toBe(1)
  })
  it('returns 0 (minimum confidence) for an empty landmarks array', () => {
    expect(landmarkConfidence([])).toBe(0)
  })
})
