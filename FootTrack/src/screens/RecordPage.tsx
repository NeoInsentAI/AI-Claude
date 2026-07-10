import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { analyzeSession } from '../analysis/analyzeSession'
import { saveSessionResults } from '../session/saveSessionResults'
import { SKILL_LABELS, type Skill, type Foot } from '../analysis/skillConfig'

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
      await new Promise((resolve) => { videoRef.current!.onloadedmetadata = resolve })

      const analysis = await analyzeSession(videoRef.current, skill, footFocus)
      const sessionId = await saveSessionResults(userData.user.id, skill, footFocus, file, analysis)

      URL.revokeObjectURL(objectUrl)
      navigate(`/feedback/${sessionId}`)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Analysis failed')
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
