import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else setDone(true)
  }

  if (done) return <p>Check your email to confirm your account, then sign in.</p>

  return (
    <form onSubmit={handleSubmit}>
      <h1>Create account</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Create account</button>
    </form>
  )
}
