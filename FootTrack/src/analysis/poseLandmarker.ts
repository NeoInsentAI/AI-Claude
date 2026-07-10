import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseFrame } from './types'

let landmarkerPromise: Promise<PoseLandmarker> | null = null

function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    )
      .then((files) =>
        PoseLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
        })
      )
      .catch((e) => {
        landmarkerPromise = null
        throw e
      })
  }
  return landmarkerPromise
}

/** Extracts a PoseFrame roughly every `sampleIntervalMs` from an already-loaded, paused-capable HTMLVideoElement. */
export async function extractPoseFrames(
  video: HTMLVideoElement,
  sampleIntervalMs = 33
): Promise<PoseFrame[]> {
  const landmarker = await getLandmarker()
  const frames: PoseFrame[] = []
  const durationMs = video.duration * 1000

  for (let t = 0; t <= durationMs; t += sampleIntervalMs) {
    await seekTo(video, t / 1000)
    const result = landmarker.detectForVideo(video, t)
    if (result.landmarks.length > 0) {
      frames.push({
        timestampMs: t,
        landmarks: result.landmarks[0].map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
      })
    }
  }
  return frames
}

function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = seconds
  })
}
