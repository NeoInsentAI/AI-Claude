import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function OnboardingPage() {
  const [dominantFoot, setDominantFoot] = useState<'left' | 'right' | ''>('')
  const [position, setPosition] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const canSubmit = dominantFoot !== '' && consent

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      setError('We could not verify your account. Please sign in again and retry.')
      return
    }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ dominant_foot: dominantFoot, position: position || null, consent_accepted_at: new Date().toISOString() })
      .eq('id', data.user.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    navigate('/home')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Tell us about your game</h1>
      <fieldset>
        <legend>Dominant foot</legend>
        <label>
          <input type="radio" name="foot" value="left" checked={dominantFoot === 'left'} onChange={() => setDominantFoot('left')} />
          Left foot
        </label>
        <label>
          <input type="radio" name="foot" value="right" checked={dominantFoot === 'right'} onChange={() => setDominantFoot('right')} />
          Right foot
        </label>
      </fieldset>
      <label>
        Position (optional)
        <input value={position} onChange={(e) => setPosition(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        I confirm I am 16 or older, or have a parent/guardian's permission to use this app
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={!canSubmit}>Start training</button>
    </form>
  )
}
