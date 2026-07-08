import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function OnboardingPage() {
  const [dominantFoot, setDominantFoot] = useState<'left' | 'right' | ''>('')
  const [position, setPosition] = useState('')
  const [consent, setConsent] = useState(false)
  const navigate = useNavigate()

  const canSubmit = dominantFoot !== '' && consent

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase
      .from('profiles')
      .update({ dominant_foot: dominantFoot, position, consent_accepted_at: new Date().toISOString() })
      .eq('id', data.user.id)
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
      <button type="submit" disabled={!canSubmit}>Start training</button>
    </form>
  )
}
