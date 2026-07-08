# FootTrack — MVP Design

**Date:** 2026-07-08
**Relationship to prior work:** Scopes down the full "StrikeLab" product spec (`docs` conversation artifact, 17-section concept doc) into a single buildable first release, renamed **FootTrack** per user decision.
**Supabase project:** `FootTrack` (ref `cqmmikeofjnaenllsxkg`, region `eu-west-1`), org "neoinsentai's projects", free tier ($0/mo).

---

## 1. What's in scope (and explicitly not)

**In scope for this build:**
- 3 skills: instep-drive shooting, push pass, ground first touch
- Record-or-upload video → in-browser pose analysis → scored feedback with one priority fix
- Accounts (email/password), saved session history
- 5-tile progress dashboard (Technique, Balance, Alignment, Weak Foot Confidence, Consistency)
- Rule-based weekly adaptive training plan
- Small drill library (~12–15 drills) tied to the fault types the analyzer can actually detect

**Explicitly cut from this build** (fast-follows, not oversights):
- Coach mode, academy/team mode, billing/subscriptions, gamification (streaks/badges)
- LLM-generated coaching copy — MVP uses deterministic templates instead
- Server-side pose/video pipeline and ball detection — see §3 for why, and what that changes
- Parent-managed youth accounts / COPPA-grade consent flow — MVP is single adult-consent accounts only. A simple age-gate + consent checkbox is included at signup, but no parent-approval workflow. **Do not market this build to under-16s without adding that flow.**

---

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite, TypeScript, installable PWA | One codebase, works in any mobile browser, no app-store review needed to "launch" |
| Hosting | Vercel | Org is already a Vercel-integrated Supabase org |
| Backend | Supabase (Postgres + Auth + Storage) | Already connected in this environment; avoids hand-building a server for MVP |
| Pose estimation | MediaPipe Pose Landmarker (`@mediapipe/tasks-vision`), runs client-side via WASM | Free, proven, on-device — no video-processing infra to stand up or pay for |
| Feedback engine | Deterministic TypeScript rubric engine + copy templates | No LLM dependency, no API cost/latency, fully testable |

```
Browser (React PWA)
  ├─ Record/upload clip → local video element
  ├─ MediaPipe Pose Landmarker → per-frame landmarks (client-side, WASM)
  ├─ Rep segmentation (foot-speed peak detection)
  ├─ Metric computation (geometry over landmarks, per rep)
  ├─ Rubric engine → fault tags → priority fix + corrections + score
  ├─ Upload video clip → Supabase Storage
  └─ Write session/scores/feedback → Supabase Postgres (via Supabase JS client, RLS-scoped to auth.uid())

Supabase
  ├─ Auth (email/password)
  ├─ Postgres (profiles, sessions, rep_events, skill_scores, feedback_items, drills, plans)
  └─ Storage (video clips, private bucket, signed URLs)
```

Analysis runs entirely in the browser at record time — no background job queue needed for MVP. The UI shows a short "analyzing…" state (typically seconds, not minutes, since there's no upload-then-server-process round trip).

---

## 3. The no-ball-tracking tradeoff (read this before implementing §5)

The original spec's metrics assume a trained ball detector (plant-foot distance *from the ball*, first-touch distance *in ball-diameters*). Building a reliable ball detector is real applied-CV work and out of reach for this build. Every ball-relative metric below is reframed as a **pose-only equivalent**, generally trading "distance from the ball" for "rep-to-rep consistency." This is a deliberate, disclosed tradeoff — not a bug to fix later without revisiting the design. Adding lightweight ball tracking is a legitimate Phase 2 idea, out of scope now.

Event detection (segmenting a continuous clip into individual reps) uses foot-speed peak detection: the non-kicking or receiving foot/ankle landmark's velocity is tracked across frames; local maxima above a threshold, with a refractory window to prevent double-counting, mark candidate contact/touch moments. Optional stretch: cross-check each peak against the audio track's percussive transient (Web Audio API) for a small confidence boost — cut this first if the timeline is tight.

---

## 4. Data model (Supabase/Postgres)

All tables use `uuid` primary keys (`default gen_random_uuid()`) and RLS policies scoping rows to `auth.uid()` (via `profile_id`/`profiles.id = auth.uid()`).

```sql
profiles
  id uuid primary key references auth.users(id)
  email text
  display_name text
  dominant_foot text check (dominant_foot in ('left','right'))
  position text
  consent_accepted_at timestamptz
  created_at timestamptz default now()

training_sessions
  id uuid primary key default gen_random_uuid()
  profile_id uuid references profiles(id)
  skill text check (skill in ('shooting','passing','first_touch'))
  foot_focus text check (foot_focus in ('left','right'))
  video_storage_path text
  status text check (status in ('recorded','analyzing','complete','failed')) default 'recorded'
  session_score int
  created_at timestamptz default now()

rep_events
  id uuid primary key default gen_random_uuid()
  session_id uuid references training_sessions(id)
  rep_index int
  foot text
  t_contact_ms int
  metrics jsonb        -- { metric_name: { value, confidence } }
  quality_class text check (quality_class in ('clean','minor_fault','major_fault'))

skill_scores
  id uuid primary key default gen_random_uuid()
  profile_id uuid references profiles(id)
  attribute text check (attribute in ('technique','balance','alignment','consistency','weak_foot_confidence'))
  skill text
  value numeric
  computed_at timestamptz default now()

feedback_items
  id uuid primary key default gen_random_uuid()
  session_id uuid references training_sessions(id)
  kind text check (kind in ('priority_fix','win','correction'))
  fault_tag text
  copy text
  drill_id uuid references drills(id)
  rank int

drills
  id uuid primary key default gen_random_uuid()
  category text            -- 'shooting' | 'passing' | 'first_touch' | 'balance' | 'weak_foot'
  title text
  objective text
  level int check (level between 1 and 3)
  instructions text
  targets_fault_tags text[]

plans
  id uuid primary key default gen_random_uuid()
  profile_id uuid references profiles(id)
  week_start date
  focus_areas text[]
  rationale text

plan_items
  id uuid primary key default gen_random_uuid()
  plan_id uuid references plans(id)
  drill_id uuid references drills(id)
  target_day int
  status text check (status in ('pending','done','skipped')) default 'pending'
```

---

## 5. Per-skill metrics (pose-only)

| Skill | Metrics computed | Confidence tag |
|---|---|---|
| Shooting | Body lean at contact; pre-contact balance/wobble; follow-through length & direction; landing stability; plant-foot rep-to-rep consistency; hip-shoulder rotation; L/R symmetry (derived across sessions by foot_focus) | Direct, except hip rotation (Estimated — camera-angle dependent) |
| Passing | Torso lean at contact; plant-foot consistency; ankle-lock stability; follow-through vs. declared target direction; balance/landing | Direct, except ankle-lock (Estimated) |
| First touch | Receiving body orientation (open/closed stance); balance at receipt; cushioning motion quality; post-touch movement direction | Direct, except cushioning quality and post-touch direction (Estimated) |

Every metric stored in `rep_events.metrics` carries a `confidence` value (0–1, driven by landmark visibility scores from MediaPipe). Metrics below confidence 0.5 are excluded from scoring for that rep (shown in the UI as "not measured," never guessed), matching the original spec's threshold and "never guess" principle.

## 6. Scoring model

Same shape as the original spec — 0–100, self-referenced, EWMA-smoothed (α ≈ 0.3) across sessions — minus **Power Efficiency** (needed ball speed, which we don't have). Remaining attributes and rebalanced weights:

| Attribute | Weight |
|---|---|
| Technique | 30% |
| Balance | 18% |
| Body Alignment | 12% |
| Consistency | 18% |
| Weak Foot Confidence | 12% |
| Drill Completion | 10% |

Session score = 70% mechanics quality (rubric-scored per rep) + 20% rep-to-rep consistency + 10% drill task completion.

**Weak Foot Confidence** is a single account-wide attribute, not per-skill: it's computed from the technique-score gap between left-foot and right-foot reps *pooled across all 3 skills*, weighted by how much the weak foot is actually being used (a player who avoids their weak foot entirely should see that reflected, per the original spec's "honesty metric" principle).

## 7. Feedback engine

Deterministic pipeline, no LLM:
1. Per-rep metrics → fault taxonomy lookup (static table: metric threshold → fault tag)
2. Faults ranked by `impact × frequency × fixability` (impact/frequency measured; fixability is a static property per fault type)
3. Top fault → **priority fix** card, rendered from a copy template with the relevant numbers interpolated (mirrors the spec's "one main fix first" pattern)
4. Up to 2 more faults → **secondary corrections**
5. Up to 3 genuinely-earned positives → **wins** (never fabricated — if only 1–2 qualify, show fewer)
6. Each fault tag maps to 1 recommended drill from the library

## 8. Drill library

~12–15 drills, 3–4 per skill, each directly tied to a fault tag above (not the full 12-category library from the original spec). Plus 2–3 general balance/weak-foot drills to support the Weak Foot Confidence and Balance score attributes.

## 9. Weekly plan generator

Rule-based, runs on demand (e.g. Sunday or on-plan-expiry): reads last 1–2 weeks of `skill_scores` + most frequent `fault_tag`s from `feedback_items`, picks the 1–2 lowest-scoring/most-frequent areas as `focus_areas`, assembles 3 sessions for the week from the drill library, writes a templated one-sentence `rationale`. No LLM call.

## 10. Screens (IA)

Onboarding (goals, dominant foot, age/consent) → Home (today's suggested session) → Record (guided capture or file upload) → Feedback (score, priority fix, wins/corrections, skeleton overlay on the clip) → Progress (5 trend tiles + session history) → Plan (this week's drills) → Profile (account, sign out, delete my data).

## 11. Deployment / "launch"

Vite build with PWA manifest + service worker (installable to home screen) deployed to Vercel under a public URL. Supabase project already provisioned (see header). Env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) injected via Vercel project settings, not committed.

---

## 12. Open risks

- **MediaPipe accuracy in the wild:** phone framing, lighting, and single-camera angle all degrade landmark quality. Mitigated by per-metric confidence suppression (§5) and honest "Limited analysis" messaging in the UI — never silently guessing.
- **Rep segmentation without ball tracking:** foot-speed peak detection can misfire on fast non-strike movements. Mitigation: minimum peak prominence + refractory window; allow manual rep trim as a fallback if this proves unreliable in testing.
- **Browser performance:** running pose estimation on full video client-side on a mid-range phone browser needs to be tested early — if too slow, fall back to a lower analysis frame rate (e.g. 15fps instead of 30fps) before considering any server-side move.
