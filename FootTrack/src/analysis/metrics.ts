import type { PoseFrame } from './types'
import { LM } from './types'
import { angleFromVertical, angleBetweenVectors, distance, midpoint, stddev, landmarkConfidence } from './geometry'
import type { MetricResult } from './types'

export function bodyLeanAtContact(f: PoseFrame): MetricResult {
  const shoulderMid = midpoint(f.landmarks[LM.LEFT_SHOULDER], f.landmarks[LM.RIGHT_SHOULDER])
  const hipMid = midpoint(f.landmarks[LM.LEFT_HIP], f.landmarks[LM.RIGHT_HIP])
  const value = angleFromVertical(hipMid, shoulderMid)
  const confidence = landmarkConfidence([
    f.landmarks[LM.LEFT_SHOULDER], f.landmarks[LM.RIGHT_SHOULDER],
    f.landmarks[LM.LEFT_HIP], f.landmarks[LM.RIGHT_HIP],
  ])
  return { value, confidence }
}

export function preContactBalance(frames: PoseFrame[]): MetricResult {
  const hipXs = frames.map((f) => midpoint(f.landmarks[LM.LEFT_HIP], f.landmarks[LM.RIGHT_HIP]).x)
  const confidence = Math.min(...frames.map((f) =>
    landmarkConfidence([f.landmarks[LM.LEFT_HIP], f.landmarks[LM.RIGHT_HIP]])
  ))
  return { value: stddev(hipXs), confidence }
}

export function followThrough(frames: PoseFrame[], contactFrameIndex: number, ankleIndex: number): MetricResult {
  const contact = frames[contactFrameIndex]
  const later = frames[frames.length - 1]
  const value = distance(contact.landmarks[ankleIndex], later.landmarks[ankleIndex])
  const confidence = Math.min(
    landmarkConfidence([contact.landmarks[ankleIndex]]),
    landmarkConfidence([later.landmarks[ankleIndex]])
  )
  return { value, confidence }
}

export function landingStability(frames: PoseFrame[], contactFrameIndex: number): MetricResult {
  const postContact = frames.slice(contactFrameIndex)
  return preContactBalance(postContact)
}

/**
 * Takes the plant-foot x-position (relative to hip midpoint) for every rep in a session; returns their spread.
 * Thin, readably-named wrapper around the generic `repConsistency` (defined below `ankleLockDeviation`).
 */
export function plantFootConsistency(relativePositions: number[]): MetricResult {
  return repConsistency(relativePositions)
}

/**
 * Rotation of the hip line between a pre-swing frame and the contact frame. Always capped at Estimated-level
 * confidence — 2D image-plane rotation is an approximation of true 3D hip rotation (a single camera can't see
 * rotation toward/away from the lens, only foreshortening of the hip line's apparent width).
 */
export function hipRotation(preSwing: PoseFrame, contact: PoseFrame): MetricResult {
  const preVec = {
    x: preSwing.landmarks[LM.RIGHT_HIP].x - preSwing.landmarks[LM.LEFT_HIP].x,
    y: preSwing.landmarks[LM.RIGHT_HIP].y - preSwing.landmarks[LM.LEFT_HIP].y,
  }
  const contactVec = {
    x: contact.landmarks[LM.RIGHT_HIP].x - contact.landmarks[LM.LEFT_HIP].x,
    y: contact.landmarks[LM.RIGHT_HIP].y - contact.landmarks[LM.LEFT_HIP].y,
  }
  const value = angleBetweenVectors(preVec, contactVec)
  const rawConfidence = landmarkConfidence([
    preSwing.landmarks[LM.LEFT_HIP], preSwing.landmarks[LM.RIGHT_HIP],
    contact.landmarks[LM.LEFT_HIP], contact.landmarks[LM.RIGHT_HIP],
  ])
  return { value, confidence: Math.min(rawConfidence, 0.7) }
}

/**
 * Angle of the hip line relative to the image's horizontal axis — a proxy for open (side-on) vs closed
 * (square) receiving stance. 0 = hips level/parallel to the camera's horizontal (square-on); larger
 * magnitude = hips tilted toward the camera's depth axis (more side-on/open).
 */
export function receivingBodyOrientation(f: PoseFrame): MetricResult {
  const left = f.landmarks[LM.LEFT_HIP]
  const right = f.landmarks[LM.RIGHT_HIP]
  const radians = Math.atan2(right.y - left.y, right.x - left.x)
  const value = (radians * 180) / Math.PI
  const confidence = landmarkConfidence([left, right])
  return { value, confidence }
}

/**
 * Change in knee-flexion angle between a pre-touch frame and the touch frame. Positive = knee bending more
 * (cushioning give). Estimated confidence, capped at 0.7.
 */
export function cushioningMotion(
  before: PoseFrame,
  atTouch: PoseFrame,
  hipIdx: number,
  kneeIdx: number,
  ankleIdx: number
): MetricResult {
  const kneeAngle = (f: PoseFrame) => {
    const hip = f.landmarks[hipIdx]
    const knee = f.landmarks[kneeIdx]
    const ankle = f.landmarks[ankleIdx]
    const thigh = { x: hip.x - knee.x, y: hip.y - knee.y }
    const shin = { x: ankle.x - knee.x, y: ankle.y - knee.y }
    return angleBetweenVectors(thigh, shin)
  }
  const value = kneeAngle(before) - kneeAngle(atTouch)
  const confidence = Math.min(
    landmarkConfidence([before.landmarks[hipIdx], before.landmarks[kneeIdx], before.landmarks[ankleIdx]]),
    landmarkConfidence([atTouch.landmarks[hipIdx], atTouch.landmarks[kneeIdx], atTouch.landmarks[ankleIdx]]),
    0.7
  )
  return { value, confidence }
}

/**
 * Degrees of deviation of the ankle joint angle (knee-ankle-footIndex) from a "locked" extended reference of
 * 165 degrees at contact. Estimated confidence, capped at 0.7 — single-camera ankle angle is a rough proxy.
 */
export function ankleLockDeviation(f: PoseFrame, kneeIdx: number, ankleIdx: number, footIndexIdx: number): MetricResult {
  const knee = f.landmarks[kneeIdx]
  const ankle = f.landmarks[ankleIdx]
  const footIndex = f.landmarks[footIndexIdx]
  const shin = { x: knee.x - ankle.x, y: knee.y - ankle.y }
  const foot = { x: footIndex.x - ankle.x, y: footIndex.y - ankle.y }
  const jointAngle = angleBetweenVectors(shin, foot)
  const LOCKED_REFERENCE_DEG = 165
  const value = Math.abs(jointAngle - LOCKED_REFERENCE_DEG)
  const confidence = Math.min(landmarkConfidence([knee, ankle, footIndex]), 0.7)
  return { value, confidence }
}

/**
 * Generic rep-to-rep consistency: standard deviation of any numeric series (plant-foot position, follow-through
 * direction angle, etc). Confidence rises with sample size.
 */
export function repConsistency(values: number[]): MetricResult {
  return { value: stddev(values), confidence: values.length >= 3 ? 0.9 : 0.5 }
}
