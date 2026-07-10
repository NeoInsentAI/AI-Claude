import { supabase } from '../lib/supabase'
import type { SessionAnalysis } from '../analysis/analyzeSession'
import type { Skill, Foot } from '../analysis/skillConfig'
import { updateEwma, weakFootConfidence } from '../feedback/scoring'
import type { Json } from '../lib/database.types'

export async function saveSessionResults(
  profileId: string,
  skill: Skill,
  footFocus: Foot,
  videoBlob: Blob,
  analysis: SessionAnalysis
): Promise<string> {
  const videoPath = `${profileId}/${crypto.randomUUID()}.webm`
  const { error: uploadError } = await supabase.storage.from('session-videos').upload(videoPath, videoBlob)
  if (uploadError) throw uploadError

  const { data: session, error: sessionError } = await supabase
    .from('training_sessions')
    .insert({
      profile_id: profileId,
      skill,
      foot_focus: footFocus,
      video_storage_path: videoPath,
      status: 'analyzing',
      session_score: analysis.sessionScoreValue,
    })
    .select()
    .single()
  if (sessionError) throw sessionError

  try {
    if (analysis.reps.length > 0) {
      const { error: repsError } = await supabase.from('rep_events').insert(
        analysis.reps.map((r) => ({
          session_id: session.id,
          rep_index: r.repIndex,
          foot: r.foot,
          t_contact_ms: r.contactTimestampMs,
          // MetricResult ({value, confidence}, both numbers) is plain JSON-serializable data. The generated
          // Json type isn't structurally satisfied by a named Record<string, MetricResult> interface type
          // (index-signature assignability isn't inferred the same way it is for fresh object literals), so
          // this cast is a typing-only fixup — the actual payload shape is unchanged.
          metrics: r.metrics as unknown as Json,
          quality_class: r.qualityClass,
        }))
      )
      if (repsError) throw repsError
    }

    const feedbackRows = await Promise.all(
      analysis.feedback.map(async (f) => ({
        session_id: session.id,
        kind: f.kind,
        fault_tag: f.faultTag,
        copy: f.copy,
        rank: f.rank,
        drill_id: await findDrillForFault(f.faultTag),
      }))
    )
    const { error: feedbackError } = await supabase.from('feedback_items').insert(feedbackRows)
    if (feedbackError) throw feedbackError

    const { error: completeError } = await supabase
      .from('training_sessions')
      .update({ status: 'complete' })
      .eq('id', session.id)
    if (completeError) throw completeError

    await updateSkillScores(profileId, skill, analysis)

    return session.id
  } catch (err) {
    // Best-effort: mark the session as failed so it doesn't sit around looking 'analyzing' forever.
    // Never let a failure here mask the original error — that's what the caller needs to see.
    try {
      await supabase.from('training_sessions').update({ status: 'failed' }).eq('id', session.id)
    } catch {
      // ignore — the original error below is what matters
    }
    throw err
  }
}

/** Looks up one drill whose targets_fault_tags includes this fault. Win items have faultTag: null and never get a drill. */
async function findDrillForFault(faultTag: string | null): Promise<string | null> {
  if (!faultTag) return null
  const { data } = await supabase
    .from('drills')
    .select('id')
    .contains('targets_fault_tags', [faultTag])
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function updateSkillScores(profileId: string, skill: Skill, analysis: SessionAnalysis) {
  const attributes: { attribute: string; newValue: number }[] = [
    { attribute: 'technique', newValue: analysis.mechanicsQuality * 100 },
    { attribute: 'consistency', newValue: analysis.consistency * 100 },
    { attribute: 'balance', newValue: analysis.balanceScore },
    { attribute: 'alignment', newValue: analysis.alignmentScore },
  ]

  for (const { attribute, newValue } of attributes) {
    const { data: previous } = await supabase
      .from('skill_scores')
      .select('value')
      .eq('profile_id', profileId)
      .eq('attribute', attribute)
      .eq('skill', skill)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const blended = updateEwma(previous?.value ?? null, newValue)
    await supabase.from('skill_scores').insert({ profile_id: profileId, attribute, skill, value: blended })
  }

  await updateWeakFootConfidence(profileId)
}

/**
 * weak_foot_confidence is account-wide (skill = null), pooled across all 3 skills, and recomputed fresh from
 * history each time rather than EWMA-blended — see design doc §6.
 *
 * The session this call is racing to score is already committed to `training_sessions` (inserted earlier in
 * `saveSessionResults`, before `updateSkillScores`/this function run) with its `session_score` set, so the
 * history query below already includes it. It must NOT also be pushed onto `sessions` by hand here — an
 * earlier version of this function did that using `mechanicsQuality * 100` (a different quantity than
 * `session_score`), which double-counted the current session under two inconsistent values every time a
 * session was saved and skewed weak_foot_confidence accordingly.
 */
async function updateWeakFootConfidence(profileId: string) {
  const { data: profile } = await supabase.from('profiles').select('dominant_foot').eq('id', profileId).single()
  if (!profile?.dominant_foot) return

  const { data: history } = await supabase
    .from('training_sessions')
    .select('foot_focus, session_score')
    .eq('profile_id', profileId)
    .not('session_score', 'is', null)

  const sessions = (history ?? []).map((s) => ({ foot: s.foot_focus as Foot, techniqueScore: s.session_score as number }))

  const result = weakFootConfidence(profile.dominant_foot as Foot, sessions)
  await supabase.from('skill_scores').insert({ profile_id: profileId, attribute: 'weak_foot_confidence', skill: null, value: result.value })
}
