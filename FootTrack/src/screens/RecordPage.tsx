import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { analyzeSession } from '../analysis/analyzeSession'
import { saveSessionResults } from '../session/saveSessionResults'
import { SKILL_LABELS, type Skill, type Foot } from '../analysis/skillConfig'

/** Resolves once the video's metadata has loaded, or rejects if the browser fires an `error` event instead
 *  (corrupt file, zero-byte upload, unsupported codec) — without this, a bad file leaves the caller awaiting
 *  a promise that never settles. */
function loadVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoadedMetadata = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
      reject(new Error('Could not load video — the file may be corrupt or in an unsupported format'))
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('error', onError)
  })
}

export function RecordPage() {
  const [skill, setSkill] = useState<Skill>('shooting')
  const [footFocus, setFootFocus] = useState<Foot>('right')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const navigate = useNavigate()

  async function handleAnalyze() {
    if (!file || !videoRef.current) return
    setStatus('analyzing')
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not signed in')

      const objectUrl = URL.createObjectURL(file)
      videoRef.current.src = objectUrl
      await loadVideoMetadata(videoRef.current)

      const analysis = await analyzeSession(videoRef.current, skill, footFocus)
      const sessionId = await saveSessionResults(userData.user.id, skill, footFocus, file, analysis)

      URL.revokeObjectURL(objectUrl)
      navigate(`/feedback/${sessionId}`)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Analysis failed')
      // Force the user to explicitly re-select/re-confirm the video before retrying, rather than letting a
      // one-tap retry silently re-run the whole pipeline (re-extract frames, re-upload, insert a second
      // session, double-apply EWMA blending) against the same stale file.
      setFile(null)
    }
  }

  return (
    <div>
      <h1>Record a session</h1>
      <label>
        Skill
        <select value={skill} onChange={(e) => setSkill(e.target.value as Skill)}>
          {Object.entries(SKILL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Which foot are you training?</legend>
        <label>
          <input type="radio" checked={footFocus === 'left'} onChange={() => setFootFocus('left')} /> Left
        </label>
        <label>
          <input type="radio" checked={footFocus === 'right'} onChange={() => setFootFocus('right')} /> Right
        </label>
      </fieldset>
      <input
        type="file"
        accept="video/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
      <button onClick={handleAnalyze} disabled={!file || status === 'analyzing'}>
        {status === 'analyzing' ? 'Analyzing… this takes a few seconds' : 'Analyze'}
      </button>
      {status === 'error' && <p role="alert">{errorMessage}</p>}
    </div>
  )
}
