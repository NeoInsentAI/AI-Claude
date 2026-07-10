import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface ProfileRow {
  email: string
  dominant_foot: string | null
  position: string | null
}

export function ProfilePage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()

        if (cancelled) return

        if (userError || !userData.user) {
          setError(true)
          return
        }

        const { data: row, error: profileError } = await supabase
          .from('profiles')
          .select('email, dominant_foot, position')
          .eq('id', userData.user.id)
          .single()

        if (cancelled) return
        if (profileError) throw profileError

        setProfile(row)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/sign-in')
  }

  async function handleDeleteMyData() {
    const confirmed = window.confirm(
      'This permanently deletes your sessions, videos, scores, and plans. This cannot be undone. Continue?'
    )
    if (!confirmed) return

    setDeleteError(false)
    setDeleting(true)

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        setDeleteError(true)
        return
      }

      const { data: videoFiles, error: listVideosError } = await supabase.storage
        .from('session-videos')
        .list(userData.user.id)
      if (listVideosError) throw listVideosError
      if (videoFiles && videoFiles.length > 0) {
        const { error: removeVideosError } = await supabase.storage
          .from('session-videos')
          .remove(videoFiles.map((f) => `${userData.user.id}/${f.name}`))
        if (removeVideosError) throw removeVideosError
      }

      // training_sessions cascade-deletes rep_events and feedback_items; plans cascade-deletes plan_items (see 0001_init.sql)
      const { error: sessionsError } = await supabase
        .from('training_sessions')
        .delete()
        .eq('profile_id', userData.user.id)
      if (sessionsError) throw sessionsError

      const { error: plansError } = await supabase.from('plans').delete().eq('profile_id', userData.user.id)
      if (plansError) throw plansError

      const { error: scoresError } = await supabase
        .from('skill_scores')
        .delete()
        .eq('profile_id', userData.user.id)
      if (scoresError) throw scoresError

      await handleSignOut()
    } catch {
      setDeleteError(true)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <p>Loading…</p>

  if (error || !profile) return <p>Couldn't load your profile — try again.</p>

  return (
    <div>
      <h1>Profile</h1>
      <p>{profile.email}</p>
      <p>Dominant foot: {profile.dominant_foot ?? '—'}</p>
      <p>Position: {profile.position ?? '—'}</p>
      <button onClick={handleSignOut} disabled={deleting}>
        Sign out
      </button>
      <button onClick={handleDeleteMyData} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete my data'}
      </button>
      {deleteError && (
        <p>Couldn't delete all of your data — some of it may still exist. Please try again or contact support.</p>
      )}
    </div>
  )
}
