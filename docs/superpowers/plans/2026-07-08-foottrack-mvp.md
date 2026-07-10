# FootTrack MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a working FootTrack MVP web app — record or upload a shooting/passing/first-touch clip, get in-browser pose-based feedback with a priority fix and drills, track progress over time, and follow a rule-based weekly plan.

**Architecture:** React + Vite + TypeScript PWA. Supabase (Postgres + Auth + Storage) as the only backend, called directly from the client with RLS-scoped rows. MediaPipe Pose Landmarker runs client-side (WASM) to extract pose landmarks from recorded/uploaded video; a pure-TypeScript rubric engine turns landmark geometry into scores and coaching feedback. No LLM, no server-side video pipeline — see the design doc for why.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + Testing Library, `@supabase/supabase-js`, `@mediapipe/tasks-vision`, React Router, `vite-plugin-pwa`, deployed to Vercel.

**Design doc:** `docs/superpowers/specs/2026-07-08-foottrack-mvp-design.md` — read this first for the data model, metric definitions, and the no-ball-tracking rationale (§3) before touching Phase 2.

**Project root:** `FootTrack/` (new subdirectory of this repo).

**Supabase project:** `FootTrack`, ref `cqmmikeofjnaenllsxkg`, region `eu-west-1` (already created).

---

## Phase 0: Project scaffolding & data layer

### Task 1: Scaffold the Vite + React + TypeScript project

**Files:**
- Create: `FootTrack/` (via Vite scaffold)
- Modify: `FootTrack/package.json`, `FootTrack/tsconfig.json`

- [ ] **Step 1: Scaffold the project**

Run:
```bash
cd /Users/sera/AI-Claude
npm create vite@latest FootTrack -- --template react-ts
cd FootTrack
npm install
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install @supabase/supabase-js @mediapipe/tasks-vision react-router-dom
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom vite-plugin-pwa
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

```ts
// FootTrack/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 4: Create test setup file**

```ts
// FootTrack/src/test/setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test script to `package.json`**

Add to `"scripts"`: `"test": "vitest run"`

- [ ] **Step 6: Verify the scaffold builds and tests run**

Run: `npm run build && npm run test`
Expected: build succeeds, Vitest reports "No test files found" (not an error at this stage — expected until Task 2).

- [ ] **Step 7: Commit**

```bash
cd /Users/sera/AI-Claude
git add FootTrack/
git commit -m "chore: scaffold FootTrack Vite/React/TS project"
```

### Task 2: Supabase client + environment config

**Files:**
- Create: `FootTrack/src/lib/supabase.ts`
- Create: `FootTrack/.env.local` (not committed)
- Create: `FootTrack/.env.example`
- Modify: `FootTrack/.gitignore`

- [ ] **Step 1: Get the project URL and anon key**

Run (via the Supabase MCP connector already used to create the project): call `get_project_url` and `get_publishable_keys` for project ref `cqmmikeofjnaenllsxkg`.

- [ ] **Step 2: Write `.env.example`**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Write `.env.local` with the real values (not committed)**

```
VITE_SUPABASE_URL=<value from get_project_url>
VITE_SUPABASE_ANON_KEY=<value from get_publishable_keys>
```

- [ ] **Step 4: Confirm `.env.local` is gitignored**

Check `FootTrack/.gitignore` contains `.env.local` (Vite's default template already includes `*.local` — verify, don't duplicate).

- [ ] **Step 5: Create the Supabase client**

```ts
// FootTrack/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient<Database>(url, anonKey)
```

(`database.types.ts` is generated in Task 4 — this file won't type-check until then, which is expected.)

- [ ] **Step 6: Commit**

```bash
git add FootTrack/.env.example FootTrack/.gitignore
git commit -m "chore: add Supabase client config"
```

Note: `.env.local` is untracked by design — do not add it.

### Task 3: Database schema migration

**Files:**
- Create: `FootTrack/supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

```sql
-- FootTrack/supabase/migrations/0001_init.sql

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  dominant_foot text check (dominant_foot in ('left','right')),
  "position" text,
  consent_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table drills (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('shooting','passing','first_touch','balance','weak_foot')),
  title text not null,
  objective text not null,
  level int not null check (level between 1 and 3),
  instructions text not null,
  targets_fault_tags text[] not null default '{}'
);

create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  skill text not null check (skill in ('shooting','passing','first_touch')),
  foot_focus text not null check (foot_focus in ('left','right')),
  video_storage_path text,
  status text not null default 'recorded' check (status in ('recorded','analyzing','complete','failed')),
  session_score int,
  created_at timestamptz not null default now()
);

create table rep_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references training_sessions(id) on delete cascade,
  rep_index int not null,
  foot text not null check (foot in ('left','right')),
  t_contact_ms int not null,
  metrics jsonb not null default '{}',
  quality_class text check (quality_class in ('clean','minor_fault','major_fault'))
);

create table skill_scores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  attribute text not null check (attribute in ('technique','balance','alignment','consistency','weak_foot_confidence')),
  skill text,
  value numeric not null,
  computed_at timestamptz not null default now()
);

create table feedback_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references training_sessions(id) on delete cascade,
  kind text not null check (kind in ('priority_fix','win','correction')),
  fault_tag text,
  copy text not null,
  drill_id uuid references drills(id),
  rank int not null default 0
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  focus_areas text[] not null default '{}',
  rationale text not null
);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  drill_id uuid not null references drills(id),
  target_day int not null check (target_day between 1 and 7),
  status text not null default 'pending' check (status in ('pending','done','skipped'))
);

-- Row Level Security: every user-owned table is scoped to auth.uid()

alter table profiles enable row level security;
alter table training_sessions enable row level security;
alter table rep_events enable row level security;
alter table skill_scores enable row level security;
alter table feedback_items enable row level security;
alter table plans enable row level security;
alter table plan_items enable row level security;
alter table drills enable row level security;

create policy "profiles: owner read/write" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "sessions: owner read/write" on training_sessions
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "rep_events: owner read/write via session" on rep_events
  for all using (
    exists (select 1 from training_sessions s where s.id = session_id and s.profile_id = auth.uid())
  ) with check (
    exists (select 1 from training_sessions s where s.id = session_id and s.profile_id = auth.uid())
  );

create policy "skill_scores: owner read/write" on skill_scores
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "feedback_items: owner read/write via session" on feedback_items
  for all using (
    exists (select 1 from training_sessions s where s.id = session_id and s.profile_id = auth.uid())
  ) with check (
    exists (select 1 from training_sessions s where s.id = session_id and s.profile_id = auth.uid())
  );

create policy "plans: owner read/write" on plans
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "plan_items: owner read/write via plan" on plan_items
  for all using (
    exists (select 1 from plans p where p.id = plan_id and p.profile_id = auth.uid())
  ) with check (
    exists (select 1 from plans p where p.id = plan_id and p.profile_id = auth.uid())
  );

-- Drills are shared reference data: everyone can read, nobody writes via the client
create policy "drills: anyone can read" on drills
  for select using (true);

-- Auto-create a profile row when a new auth user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP connector: call `apply_migration` for project ref `cqmmikeofjnaenllsxkg` with name `init` and the SQL above.

- [ ] **Step 3: Verify tables exist**

Call `list_tables` for the project and confirm all 8 tables (`profiles`, `drills`, `training_sessions`, `rep_events`, `skill_scores`, `feedback_items`, `plans`, `plan_items`) are present.

- [ ] **Step 4: Generate TypeScript types from the live schema**

Call `generate_typescript_types` for the project, save the output to `FootTrack/src/lib/database.types.ts`.

- [ ] **Step 5: Re-run the build to confirm `supabase.ts` now type-checks**

Run: `cd FootTrack && npm run build`
Expected: succeeds (Task 2's `supabase.ts` import of `database.types` now resolves).

- [ ] **Step 6: Commit**

```bash
git add FootTrack/supabase/migrations/0001_init.sql FootTrack/src/lib/database.types.ts
git commit -m "feat: add FootTrack database schema and RLS policies"
```

### Task 4: Seed the drill library

**Files:**
- Create: `FootTrack/supabase/seed/drills.sql`

- [ ] **Step 1: Write seed data — 4 shooting, 3 passing, 3 first-touch, 2 balance, 2 weak-foot drills, each tied to a real fault tag from the design doc's fault taxonomy (Task 12 defines the exact tag strings; this seed uses the same tag vocabulary so Task 12 can be cross-checked against it)**

```sql
-- FootTrack/supabase/seed/drills.sql
insert into drills (category, title, objective, level, instructions, targets_fault_tags) values
('shooting', 'Plant Target Reps', 'Build consistent plant-foot placement', 1,
 'Place a flat marker where your plant foot should land. 3 sets of 10 strikes at 60% power — the only goal is landing your plant foot on the marker every time. Power comes back only after 8/10 placement accuracy.',
 '{shooting_plant_inconsistent}'),
('shooting', 'Chest-Over-Ball Finishes', 'Build a stable, upright torso through contact', 1,
 'Short-range low-drive finishes from 8m, 3 sets of 8 per foot. Cue: chest finishes over the ball, not behind it.',
 '{shooting_torso_lean}'),
('shooting', 'Stick-the-Landing Finishes', 'Build a stable landing after the strike', 1,
 'Every strike must end frozen in a stable athletic stance for a 2-count. Power capped at 70% until 8/10 stable landings.',
 '{shooting_landing_unstable}'),
('shooting', 'Land-On-Your-Strike-Foot Drives', 'Fix a cut-off follow-through', 2,
 'Moderate-power drives where you must land on your striking foot beyond where the ball was. 3 sets of 10.',
 '{shooting_followthrough_short}'),
('passing', 'Metronome Wall Passing', 'Build repeatable passing posture under tempo', 1,
 'Two-touch wall passing at a fixed tempo, 3 sets of 20 per foot. Tempo increases only once posture holds.',
 '{passing_plant_inconsistent,passing_ankle_unstable}'),
('passing', 'Gate Finishing', 'Fix direction drift on passes', 2,
 'Pass through a narrow 2m cone gate 8m away, 3 sets of 8, alternating targets.',
 '{passing_direction_inconsistent}'),
('passing', 'Locked-Ankle Wall Drives', 'Fix a loose ankle at contact', 1,
 '5m from a wall, low driven passes with an exaggerated toes-down, ankle-locked finish held for a beat after each strike. 4 sets of 8 per foot.',
 '{passing_ankle_unstable}'),
('first_touch', 'Open-Hips Wall Receives', 'Build an open receiving stance', 1,
 'Pass to a wall at an angle, move to receive side-on with your back foot, first touch forward. 3 sets of 12.',
 '{first_touch_closed_stance}'),
('first_touch', 'Cushion-and-Settle Receives', 'Build a soft, controlled first touch', 1,
 'Receive rolling passes and let your knee and ankle give on contact instead of blocking the ball stiffly. 3 sets of 12.',
 '{first_touch_stiff_cushion}'),
('first_touch', 'Touch-and-Balance Holds', 'Build stability at the moment of receiving', 1,
 'Receive a pass and hold a stable stance for a 2-count before playing your next touch. 3 sets of 10.',
 '{first_touch_balance_unstable}'),
('balance', 'Single-Leg Ball Taps', 'General balance foundation', 1,
 'Hold a single-leg stance while tapping the ball side to side with your other foot, 3 sets of 20 seconds per leg.',
 '{shooting_balance_wobble,passing_balance_wobble,first_touch_balance_unstable}'),
('balance', 'Three-Step Rhythm Strikes', 'Fix an inconsistent approach', 2,
 'Fixed three-step approach from a marked start point, medium pace, 3 sets of 10. Scored on approach consistency, not power.',
 '{shooting_balance_wobble}'),
('weak_foot', 'Weak-Foot Ladder — Week 1', 'Close the technique gap on your weak foot', 1,
 'Slow-tempo passing and touch work on your weak foot only, quality gate 80% before adding pace. 3 sets of 15.',
 '{weak_foot_gap}'),
('weak_foot', 'Weak-Foot Ladder — Week 2', 'Add movement to weak-foot work', 2,
 'Same as Week 1 but receiving on the move. 3 sets of 15.',
 '{weak_foot_gap}');
```

- [ ] **Step 2: Run the seed**

Use the Supabase MCP connector's `execute_sql` for project ref `cqmmikeofjnaenllsxkg` with the contents of `drills.sql`.

- [ ] **Step 3: Verify**

Call `execute_sql` with `select category, count(*) from drills group by category;` and confirm 4/3/3/2/2 rows per category.

- [ ] **Step 4: Commit**

```bash
git add FootTrack/supabase/seed/drills.sql
git commit -m "feat: seed FootTrack drill library"
```

---

## Phase 1: Auth, routing shell, onboarding

### Task 5: Auth context and sign-up/sign-in

**Files:**
- Create: `FootTrack/src/auth/AuthContext.tsx`
- Create: `FootTrack/src/auth/AuthContext.test.tsx`
- Create: `FootTrack/src/auth/SignInPage.tsx`
- Create: `FootTrack/src/auth/SignUpPage.tsx`

- [ ] **Step 1: Write the failing test for the auth context**

```tsx
// FootTrack/src/auth/AuthContext.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

function Probe() {
  const { session, loading } = useAuth()
  if (loading) return <div>loading</div>
  return <div>{session ? 'signed-in' : 'signed-out'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports signed-out when there is no session', async () => {
    ;(supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
  })

  it('reports signed-in when a session exists', async () => {
    ;(supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('signed-in')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd FootTrack && npm run test -- AuthContext`
Expected: FAIL — `./AuthContext` has no exported member `AuthProvider`/`useAuth`.

- [ ] **Step 3: Implement the auth context**

```tsx
// FootTrack/src/auth/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd FootTrack && npm run test -- AuthContext`
Expected: PASS (2 tests)

- [ ] **Step 5: Build the sign-in and sign-up pages**

```tsx
// FootTrack/src/auth/SignInPage.tsx
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign in</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  )
}
```

```tsx
// FootTrack/src/auth/SignUpPage.tsx
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
```

- [ ] **Step 6: Commit**

```bash
git add FootTrack/src/auth/
git commit -m "feat: add auth context, sign-in and sign-up pages"
```

### Task 6: App routing shell and navigation

**Files:**
- Create: `FootTrack/src/App.tsx` (replace Vite default)
- Create: `FootTrack/src/routes/RequireAuth.tsx`
- Create: `FootTrack/src/routes/NavBar.tsx`

- [ ] **Step 1: Write the route guard**

```tsx
// FootTrack/src/routes/RequireAuth.tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/sign-in" replace />
  return <Outlet />
}
```

- [ ] **Step 2: Write the bottom nav**

```tsx
// FootTrack/src/routes/NavBar.tsx
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/home', label: 'Home' },
  { to: '/record', label: 'Record' },
  { to: '/progress', label: 'Progress' },
  { to: '/plan', label: 'Plan' },
  { to: '/profile', label: 'Profile' },
]

export function NavBar() {
  return (
    <nav aria-label="Main">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Wire routes in `App.tsx`** (screens referenced here are built in later tasks — this task creates minimal placeholder components inline so routing is testable now, and later tasks replace them with real implementations by editing the same import lines)

```tsx
// FootTrack/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'
import { RequireAuth } from './routes/RequireAuth'
import { NavBar } from './routes/NavBar'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { HomePage } from './screens/HomePage'
import { RecordPage } from './screens/RecordPage'
import { FeedbackPage } from './screens/FeedbackPage'
import { ProgressPage } from './screens/ProgressPage'
import { PlanPage } from './screens/PlanPage'
import { ProfilePage } from './screens/ProfilePage'

function AppShell() {
  return (
    <>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/feedback/:sessionId" element={<FeedbackPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <NavBar />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: Create placeholder screen components so the app compiles** (each is replaced with a real implementation in the task named in its comment)

```tsx
// FootTrack/src/onboarding/OnboardingPage.tsx — replaced in Task 7
export function OnboardingPage() { return <p>Onboarding</p> }
```
```tsx
// FootTrack/src/screens/HomePage.tsx — replaced in Task 16
export function HomePage() { return <p>Home</p> }
```
```tsx
// FootTrack/src/screens/RecordPage.tsx — replaced in Task 15
export function RecordPage() { return <p>Record</p> }
```
```tsx
// FootTrack/src/screens/FeedbackPage.tsx — replaced in Task 16
export function FeedbackPage() { return <p>Feedback</p> }
```
```tsx
// FootTrack/src/screens/ProgressPage.tsx — replaced in Task 17
export function ProgressPage() { return <p>Progress</p> }
```
```tsx
// FootTrack/src/screens/PlanPage.tsx — replaced in Task 18
export function PlanPage() { return <p>Plan</p> }
```
```tsx
// FootTrack/src/screens/ProfilePage.tsx — replaced in Task 19
export function ProfilePage() { return <p>Profile</p> }
```

- [ ] **Step 5: Verify the app builds and starts**

Run: `cd FootTrack && npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add FootTrack/src/App.tsx FootTrack/src/routes/ FootTrack/src/onboarding/ FootTrack/src/screens/
git commit -m "feat: add routing shell, nav, and placeholder screens"
```

### Task 7: Onboarding flow

**Files:**
- Modify: `FootTrack/src/onboarding/OnboardingPage.tsx`
- Create: `FootTrack/src/onboarding/OnboardingPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// FootTrack/src/onboarding/OnboardingPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingPage } from './OnboardingPage'

const updateMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: () => ({ update: (vals: unknown) => { updateMock(vals); return { eq: () => Promise.resolve({ error: null }) } } }),
  },
}))

describe('OnboardingPage', () => {
  it('requires accepting consent before submitting', () => {
    render(<OnboardingPage />)
    const submit = screen.getByRole('button', { name: /start training/i })
    expect(submit).toBeDisabled()
  })

  it('enables submit once dominant foot is chosen and consent is checked', () => {
    render(<OnboardingPage />)
    fireEvent.click(screen.getByLabelText(/right foot/i))
    fireEvent.click(screen.getByLabelText(/i confirm i am 16/i))
    expect(screen.getByRole('button', { name: /start training/i })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd FootTrack && npm run test -- OnboardingPage`
Expected: FAIL — placeholder component has no form controls.

- [ ] **Step 3: Implement the onboarding page**

```tsx
// FootTrack/src/onboarding/OnboardingPage.tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd FootTrack && npm run test -- OnboardingPage`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add FootTrack/src/onboarding/
git commit -m "feat: implement onboarding flow with age-gate consent"
```

---

## Phase 2: Pose estimation & geometry metrics engine

All code in this phase is pure TypeScript with no React/Supabase dependency — testable with synthetic landmark fixtures. This is the technical core described in design doc §3 and §5.

### Task 8: Landmark types and geometry helpers

**Files:**
- Create: `FootTrack/src/analysis/types.ts`
- Create: `FootTrack/src/analysis/geometry.ts`
- Create: `FootTrack/src/analysis/geometry.test.ts`

- [ ] **Step 1: Define shared types**

```ts
// FootTrack/src/analysis/types.ts
export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export interface PoseFrame {
  timestampMs: number
  landmarks: Landmark[] // indexed per MediaPipe BlazePose topology, length 33
}

// MediaPipe BlazePose landmark indices used by this app
export const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

export interface MetricResult {
  value: number
  confidence: number
}
```

- [ ] **Step 2: Write failing tests for the geometry helpers**

```ts
// FootTrack/src/analysis/geometry.test.ts
import { describe, it, expect } from 'vitest'
import { distance, midpoint, angleFromVertical, angleBetweenVectors, stddev, landmarkConfidence } from './geometry'
import type { Landmark } from './types'

const pt = (x: number, y: number, visibility = 1): Landmark => ({ x, y, z: 0, visibility })

describe('distance', () => {
  it('computes euclidean distance in the x-y plane', () => {
    expect(distance(pt(0, 0), pt(3, 4))).toBeCloseTo(5)
  })
})

describe('midpoint', () => {
  it('averages two points', () => {
    expect(midpoint(pt(0, 0), pt(2, 4))).toEqual(expect.objectContaining({ x: 1, y: 2 }))
  })
})

describe('angleFromVertical', () => {
  it('is 0 degrees for a perfectly vertical vector', () => {
    // shoulder above hip, same x -> vertical torso
    expect(angleFromVertical(pt(0.5, 0.2), pt(0.5, 0.6))).toBeCloseTo(0, 1)
  })
  it('is 90 degrees for a horizontal vector', () => {
    expect(angleFromVertical(pt(0.2, 0.5), pt(0.8, 0.5))).toBeCloseTo(90, 1)
  })
})

describe('angleBetweenVectors', () => {
  it('is 0 for identical directions', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0)
  })
  it('is 90 for perpendicular vectors', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90)
  })
  it('is 180 for opposite vectors', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180)
  })
})

describe('stddev', () => {
  it('is 0 for a constant series', () => {
    expect(stddev([5, 5, 5])).toBeCloseTo(0)
  })
  it('computes population standard deviation', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 0)
  })
})

describe('landmarkConfidence', () => {
  it('returns the minimum visibility across the given landmarks', () => {
    expect(landmarkConfidence([pt(0, 0, 0.9), pt(0, 0, 0.4), pt(0, 0, 0.95)])).toBeCloseTo(0.4)
  })
  it('defaults missing visibility to 1', () => {
    expect(landmarkConfidence([{ x: 0, y: 0, z: 0 }])).toBe(1)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd FootTrack && npm run test -- geometry`
Expected: FAIL — `./geometry` module doesn't exist yet.

- [ ] **Step 4: Implement the geometry helpers**

```ts
// FootTrack/src/analysis/geometry.ts
import type { Landmark } from './types'

export interface Vec2 { x: number; y: number }

export function distance(a: Landmark | Vec2, b: Landmark | Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function midpoint(a: Landmark, b: Landmark): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Angle in degrees between the vector from `from` to `to` and the vertical (y) axis. 0 = perfectly vertical. */
export function angleFromVertical(from: Landmark | Vec2, to: Landmark | Vec2): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const radians = Math.atan2(Math.abs(dx), Math.abs(dy))
  return (radians * 180) / Math.PI
}

/** Angle in degrees between two direction vectors, 0-180. */
export function angleBetweenVectors(a: Vec2, b: Vec2): number {
  const dot = a.x * b.x + a.y * b.y
  const magA = Math.hypot(a.x, a.y)
  const magB = Math.hypot(b.x, b.y)
  if (magA === 0 || magB === 0) return 0
  const cos = Math.min(1, Math.max(-1, dot / (magA * magB)))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Population standard deviation. */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Confidence for a metric is the weakest visibility among the landmarks it depends on. */
export function landmarkConfidence(landmarks: Landmark[]): number {
  return Math.min(...landmarks.map((l) => l.visibility ?? 1))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd FootTrack && npm run test -- geometry`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add FootTrack/src/analysis/types.ts FootTrack/src/analysis/geometry.ts FootTrack/src/analysis/geometry.test.ts
git commit -m "feat: add pose landmark types and geometry helpers"
```

### Task 9: Rep segmentation via foot-speed peak detection

**Files:**
- Create: `FootTrack/src/analysis/segmentReps.ts`
- Create: `FootTrack/src/analysis/segmentReps.test.ts`

- [ ] **Step 1: Write a synthetic-fixture test builder and failing tests**

```ts
// FootTrack/src/analysis/segmentReps.test.ts
import { describe, it, expect } from 'vitest'
import { segmentReps } from './segmentReps'
import { LM } from './types'
import type { PoseFrame, Landmark } from './types'

/** Builds a still frame with every landmark at a base position, 33 entries. */
function stillFrame(t: number, overrides: Partial<Record<number, Landmark>> = {}): PoseFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))
  for (const [i, lm] of Object.entries(overrides)) landmarks[Number(i)] = lm
  return { timestampMs: t, landmarks }
}

/** Simulates one ankle swinging out to x=0.8 and back over `frames` samples, spaced `stepMs` apart, centered at `centerMs`. */
function swing(centerMs: number, stepMs: number, ankleIndex: number): PoseFrame[] {
  const offsets = [-3, -2, -1, 0, 1, 2, 3]
  return offsets.map((o) => {
    const x = 0.5 + Math.max(0, 0.3 - Math.abs(o) * 0.1) // peaks at o=0
    return stillFrame(centerMs + o * stepMs, { [ankleIndex]: { x, y: 0.5, z: 0, visibility: 1 } })
  })
}

describe('segmentReps', () => {
  it('returns no reps for a still clip', () => {
    const frames = Array.from({ length: 10 }, (_, i) => stillFrame(i * 33))
    expect(segmentReps(frames, LM.RIGHT_ANKLE)).toEqual([])
  })

  it('detects a single rep from one swing', () => {
    const frames = swing(500, 33, LM.RIGHT_ANKLE)
    const reps = segmentReps(frames, LM.RIGHT_ANKLE)
    expect(reps).toHaveLength(1)
    expect(reps[0].contactTimestampMs).toBeCloseTo(500, -1)
  })

  it('detects two reps separated by more than the refractory window', () => {
    const frames = [...swing(500, 33, LM.RIGHT_ANKLE), ...swing(2500, 33, LM.RIGHT_ANKLE)]
    const reps = segmentReps(frames, LM.RIGHT_ANKLE)
    expect(reps).toHaveLength(2)
  })

  it('merges near-duplicate peaks inside the refractory window into one rep', () => {
    const frames = [...swing(500, 33, LM.RIGHT_ANKLE), ...swing(650, 33, LM.RIGHT_ANKLE)]
    const reps = segmentReps(frames, LM.RIGHT_ANKLE)
    expect(reps).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd FootTrack && npm run test -- segmentReps`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement rep segmentation**

```ts
// FootTrack/src/analysis/segmentReps.ts
import type { PoseFrame } from './types'
import { distance } from './geometry'

export interface RepWindow {
  contactFrameIndex: number
  contactTimestampMs: number
  startFrameIndex: number
  endFrameIndex: number
}

const VELOCITY_THRESHOLD = 0.15 // normalized units/second — tuned against real clips in Task 15's manual QA pass
const REFRACTORY_MS = 400
const WINDOW_MS = 500 // how far before/after contact a rep's analysis window extends

/** Segments a continuous clip into individual reps by finding local maxima in the tracked ankle's speed. */
export function segmentReps(frames: PoseFrame[], ankleLandmarkIndex: number): RepWindow[] {
  if (frames.length < 3) return []

  const velocities: number[] = [0]
  for (let i = 1; i < frames.length; i++) {
    const dtSeconds = (frames[i].timestampMs - frames[i - 1].timestampMs) / 1000
    const d = distance(frames[i].landmarks[ankleLandmarkIndex], frames[i - 1].landmarks[ankleLandmarkIndex])
    velocities.push(dtSeconds > 0 ? d / dtSeconds : 0)
  }

  const peakIndices: number[] = []
  for (let i = 1; i < velocities.length - 1; i++) {
    if (
      velocities[i] > VELOCITY_THRESHOLD &&
      velocities[i] >= velocities[i - 1] &&
      velocities[i] >= velocities[i + 1]
    ) {
      peakIndices.push(i)
    }
  }

  const mergedPeaks: number[] = []
  for (const idx of peakIndices) {
    const last = mergedPeaks[mergedPeaks.length - 1]
    if (last === undefined || frames[idx].timestampMs - frames[last].timestampMs > REFRACTORY_MS) {
      mergedPeaks.push(idx)
    } else if (velocities[idx] > velocities[last]) {
      mergedPeaks[mergedPeaks.length - 1] = idx // keep the higher peak
    }
  }

  return mergedPeaks.map((contactFrameIndex) => {
    const contactTimestampMs = frames[contactFrameIndex].timestampMs
    const startFrameIndex = findFrameAtOrAfter(frames, contactTimestampMs - WINDOW_MS)
    const endFrameIndex = findFrameAtOrBefore(frames, contactTimestampMs + WINDOW_MS)
    return { contactFrameIndex, contactTimestampMs, startFrameIndex, endFrameIndex }
  })
}

function findFrameAtOrAfter(frames: PoseFrame[], ms: number): number {
  const idx = frames.findIndex((f) => f.timestampMs >= ms)
  return idx === -1 ? 0 : idx
}

function findFrameAtOrBefore(frames: PoseFrame[], ms: number): number {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].timestampMs <= ms) return i
  }
  return frames.length - 1
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd FootTrack && npm run test -- segmentReps`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add FootTrack/src/analysis/segmentReps.ts FootTrack/src/analysis/segmentReps.test.ts
git commit -m "feat: add rep segmentation via foot-speed peak detection"
```

### Task 10: Per-skill metric functions

**Files:**
- Create: `FootTrack/src/analysis/metrics.ts`
- Create: `FootTrack/src/analysis/metrics.test.ts`

- [ ] **Step 1: Write failing tests covering one representative case per metric**

```ts
// FootTrack/src/analysis/metrics.test.ts
import { describe, it, expect } from 'vitest'
import {
  bodyLeanAtContact,
  preContactBalance,
  followThrough,
  landingStability,
  plantFootConsistency,
  hipRotation,
  receivingBodyOrientation,
  cushioningMotion,
  ankleLockDeviation,
  repConsistency,
} from './metrics'
import { LM } from './types'
import type { PoseFrame, Landmark } from './types'

function frame(t: number, overrides: Partial<Record<number, Landmark>>): PoseFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))
  for (const [i, lm] of Object.entries(overrides)) landmarks[Number(i)] = lm
  return { timestampMs: t, landmarks }
}
const lm = (x: number, y: number, v = 1): Landmark => ({ x, y, z: 0, visibility: v })

describe('bodyLeanAtContact', () => {
  it('is near 0 for an upright torso', () => {
    const f = frame(0, {
      [LM.LEFT_SHOULDER]: lm(0.48, 0.2), [LM.RIGHT_SHOULDER]: lm(0.52, 0.2),
      [LM.LEFT_HIP]: lm(0.48, 0.6), [LM.RIGHT_HIP]: lm(0.52, 0.6),
    })
    const result = bodyLeanAtContact(f)
    expect(result.value).toBeLessThan(5)
    expect(result.confidence).toBe(1)
  })

  it('is large for a strongly backward-leaning torso', () => {
    const f = frame(0, {
      [LM.LEFT_SHOULDER]: lm(0.2, 0.25), [LM.RIGHT_SHOULDER]: lm(0.24, 0.25),
      [LM.LEFT_HIP]: lm(0.48, 0.6), [LM.RIGHT_HIP]: lm(0.52, 0.6),
    })
    expect(bodyLeanAtContact(f).value).toBeGreaterThan(20)
  })
})

describe('preContactBalance', () => {
  it('reports low wobble for a steady hip position', () => {
    const frames = [0, 33, 66, 99].map((t) =>
      frame(t, { [LM.LEFT_HIP]: lm(0.5, 0.6), [LM.RIGHT_HIP]: lm(0.54, 0.6) })
    )
    expect(preContactBalance(frames).value).toBeLessThan(0.01)
  })

  it('reports high wobble for a swaying hip position', () => {
    const xs = [0.4, 0.6, 0.42, 0.58]
    const frames = xs.map((x, i) => frame(i * 33, { [LM.LEFT_HIP]: lm(x, 0.6), [LM.RIGHT_HIP]: lm(x + 0.04, 0.6) }))
    expect(preContactBalance(frames).value).toBeGreaterThan(0.05)
  })
})

describe('followThrough', () => {
  it('measures displacement of the striking ankle after contact', () => {
    const frames = [0, 100, 200, 300].map((t) =>
      frame(t, { [LM.RIGHT_ANKLE]: lm(0.5 + t / 1000, 0.9) })
    )
    const result = followThrough(frames, 0, LM.RIGHT_ANKLE)
    expect(result.value).toBeCloseTo(0.3, 1)
  })
})

describe('landingStability', () => {
  it('reports low wobble when the hip stays put after contact', () => {
    const frames = [0, 100, 200].map((t) => frame(t, { [LM.LEFT_HIP]: lm(0.5, 0.6), [LM.RIGHT_HIP]: lm(0.54, 0.6) }))
    expect(landingStability(frames, 0).value).toBeLessThan(0.01)
  })
})

describe('plantFootConsistency', () => {
  it('is 0 when the plant foot lands in the same relative spot every rep', () => {
    const positions = [0.3, 0.3, 0.3, 0.3]
    expect(plantFootConsistency(positions).value).toBeCloseTo(0)
  })
  it('is greater than 0 when plant-foot position varies across reps', () => {
    expect(plantFootConsistency([0.2, 0.35, 0.25, 0.4]).value).toBeGreaterThan(0.05)
  })
})

describe('hipRotation', () => {
  it('is always tagged Estimated-level confidence (capped below 0.7) since it is camera-angle dependent', () => {
    const preSwing = frame(0, { [LM.LEFT_HIP]: lm(0.4, 0.6), [LM.RIGHT_HIP]: lm(0.6, 0.6) })
    const contact = frame(300, { [LM.LEFT_HIP]: lm(0.45, 0.6), [LM.RIGHT_HIP]: lm(0.65, 0.6) })
    expect(hipRotation(preSwing, contact).confidence).toBeLessThanOrEqual(0.7)
  })
})

describe('receivingBodyOrientation', () => {
  it('reports near 0 degrees for a square-to-camera stance', () => {
    const f = frame(0, { [LM.LEFT_HIP]: lm(0.4, 0.6), [LM.RIGHT_HIP]: lm(0.6, 0.6) })
    expect(Math.abs(receivingBodyOrientation(f).value)).toBeLessThan(5)
  })
  it('reports a large angle for an open, side-on stance', () => {
    const f = frame(0, { [LM.LEFT_HIP]: lm(0.48, 0.55), [LM.RIGHT_HIP]: lm(0.52, 0.65) })
    expect(Math.abs(receivingBodyOrientation(f).value)).toBeGreaterThan(30)
  })
})

describe('cushioningMotion', () => {
  it('detects increasing knee flexion as a cushioning give', () => {
    const before = frame(0, {
      [LM.RIGHT_HIP]: lm(0.5, 0.5), [LM.RIGHT_KNEE]: lm(0.5, 0.7), [LM.RIGHT_ANKLE]: lm(0.5, 0.9),
    })
    const atTouch = frame(200, {
      [LM.RIGHT_HIP]: lm(0.5, 0.5), [LM.RIGHT_KNEE]: lm(0.56, 0.68), [LM.RIGHT_ANKLE]: lm(0.5, 0.9),
    })
    expect(cushioningMotion(before, atTouch, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE).value).toBeGreaterThan(0)
  })
})

describe('ankleLockDeviation', () => {
  it('is near 0 when the ankle joint is close to the locked reference angle', () => {
    // knee above ankle, foot-index continuing the shin's line downward — a pointed/plantarflexed
    // "locked" ankle, roughly 175 degrees (verified: cos = -0.15/0.1505 -> ~175.4deg)
    const f = frame(0, {
      [LM.RIGHT_KNEE]: lm(0.5, 0.3), [LM.RIGHT_ANKLE]: lm(0.5, 0.9), [LM.RIGHT_FOOT_INDEX]: lm(0.52, 1.15),
    })
    expect(ankleLockDeviation(f, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX).value).toBeLessThan(30)
  })
  it('caps confidence at 0.7 since it is an Estimated signal', () => {
    const f = frame(0, {
      [LM.RIGHT_KNEE]: lm(0.5, 0.3), [LM.RIGHT_ANKLE]: lm(0.5, 0.9), [LM.RIGHT_FOOT_INDEX]: lm(0.52, 1.15),
    })
    expect(ankleLockDeviation(f, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX).confidence).toBeLessThanOrEqual(0.7)
  })
})

describe('repConsistency', () => {
  it('is 0 for identical values and greater than 0 for varying values', () => {
    expect(repConsistency([10, 10, 10]).value).toBeCloseTo(0)
    expect(repConsistency([5, 20, 8, 25]).value).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd FootTrack && npm run test -- metrics`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the metric functions**

```ts
// FootTrack/src/analysis/metrics.ts
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

/** Takes the plant-foot x-position (relative to hip midpoint) for every rep in a session; returns their spread. Thin, readably-named wrapper around the generic `repConsistency` (defined below `ankleLockDeviation`). */
export function plantFootConsistency(relativePositions: number[]): MetricResult {
  return repConsistency(relativePositions)
}

/** Rotation of the hip line between a pre-swing frame and the contact frame. Always capped at Estimated-level confidence — 2D image-plane rotation is an approximation of true 3D hip rotation. */
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

/** Angle of the hip line relative to the image's horizontal axis — a proxy for open (side-on) vs closed (square) receiving stance. */
export function receivingBodyOrientation(f: PoseFrame): MetricResult {
  const left = f.landmarks[LM.LEFT_HIP]
  const right = f.landmarks[LM.RIGHT_HIP]
  const radians = Math.atan2(right.y - left.y, right.x - left.x)
  const value = (radians * 180) / Math.PI
  const confidence = landmarkConfidence([left, right])
  return { value, confidence }
}

/** Change in knee-flexion angle between a pre-touch frame and the touch frame. Positive = knee bending more (cushioning). Estimated confidence, capped at 0.7. */
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

/** Degrees of deviation of the ankle joint angle (knee-ankle-footIndex) from a "locked" extended reference of 165 degrees at contact. Estimated confidence, capped at 0.7 — single-camera ankle angle is a rough proxy. */
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

/** Generic rep-to-rep consistency: standard deviation of any numeric series (plant-foot position, follow-through direction angle, etc). Confidence rises with sample size. */
export function repConsistency(values: number[]): MetricResult {
  return { value: stddev(values), confidence: values.length >= 3 ? 0.9 : 0.5 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd FootTrack && npm run test -- metrics`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add FootTrack/src/analysis/metrics.ts FootTrack/src/analysis/metrics.test.ts
git commit -m "feat: add per-skill pose geometry metric functions"
```

### Task 11: MediaPipe Pose Landmarker integration

**Files:**
- Create: `FootTrack/src/analysis/poseLandmarker.ts`
- Create: `FootTrack/src/analysis/skillConfig.ts`

- [ ] **Step 1: Implement the landmarker wrapper** (this wraps a browser-only API and is verified via manual QA in Task 15, not unit tests — MediaPipe's WASM runtime doesn't run in jsdom)

```ts
// FootTrack/src/analysis/poseLandmarker.ts
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseFrame } from './types'

let landmarkerPromise: Promise<PoseLandmarker> | null = null

function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    // WASM fileset version pinned to match the installed npm package exactly (not @latest) —
    // the JS API and its WASM binary are a matched pair; drifting them apart is a silent runtime risk.
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
      // A failed init (e.g. CDN network blip) must not permanently poison the singleton —
      // reset so the next caller can retry instead of every future call re-throwing forever.
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
```

- [ ] **Step 2: Define per-skill metric configuration tying skills to the striking/focus landmark**

```ts
// FootTrack/src/analysis/skillConfig.ts
import { LM } from './types'

export type Skill = 'shooting' | 'passing' | 'first_touch'
export type Foot = 'left' | 'right'

export function ankleIndexFor(foot: Foot): number {
  return foot === 'left' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE
}

export function kneeIndexFor(foot: Foot): number {
  return foot === 'left' ? LM.LEFT_KNEE : LM.RIGHT_KNEE
}

export function hipIndexFor(foot: Foot): number {
  return foot === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP
}

export const SKILL_LABELS: Record<Skill, string> = {
  shooting: 'Shooting — Instep Drive',
  passing: 'Passing — Push Pass',
  first_touch: 'First Touch — Ground Ball',
}
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd FootTrack && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add FootTrack/src/analysis/poseLandmarker.ts FootTrack/src/analysis/skillConfig.ts
git commit -m "feat: integrate MediaPipe Pose Landmarker and per-skill config"
```

---

## Phase 3: Fault taxonomy, feedback engine, scoring

### Task 12: Fault taxonomy and detection

**Files:**
- Create: `FootTrack/src/feedback/faultTaxonomy.ts`
- Create: `FootTrack/src/feedback/faultTaxonomy.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// FootTrack/src/feedback/faultTaxonomy.test.ts
import { describe, it, expect } from 'vitest'
import { detectFaults, aggregateFaults } from './faultTaxonomy'
import type { MetricResult } from '../analysis/types'

const m = (value: number, confidence = 1): MetricResult => ({ value, confidence })

describe('detectFaults', () => {
  it('flags shooting_torso_lean when body lean exceeds the threshold', () => {
    const faults = detectFaults('shooting', { bodyLean: m(22), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) })
    expect(faults.map((f) => f.tag)).toContain('shooting_torso_lean')
  })

  it('does not flag shooting_torso_lean for an upright torso', () => {
    const faults = detectFaults('shooting', { bodyLean: m(4), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) })
    expect(faults.map((f) => f.tag)).not.toContain('shooting_torso_lean')
  })

  it('ignores a metric below the confidence floor', () => {
    const faults = detectFaults('shooting', { bodyLean: m(22, 0.3), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) })
    expect(faults.map((f) => f.tag)).not.toContain('shooting_torso_lean')
  })

  it('flags first_touch_closed_stance for a near-zero receiving angle', () => {
    const faults = detectFaults('first_touch', { orientation: m(3), balance: m(0.01), cushioning: m(6) })
    expect(faults.map((f) => f.tag)).toContain('first_touch_closed_stance')
  })
})

describe('aggregateFaults', () => {
  it('ranks the most frequent, highest-impact fault first', () => {
    const perRep = [
      detectFaults('shooting', { bodyLean: m(22), balance: m(0.08), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) }),
      detectFaults('shooting', { bodyLean: m(21), balance: m(0.07), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) }),
      detectFaults('shooting', { bodyLean: m(3), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.02) }),
    ]
    const ranked = aggregateFaults(perRep)
    expect(ranked[0].tag).toBe('shooting_torso_lean')
    expect(ranked[0].frequency).toBeCloseTo(2 / 3)
  })

  it('returns an empty list when no faults were detected', () => {
    const perRep = [detectFaults('shooting', { bodyLean: m(2), balance: m(0.01), followThrough: m(0.2), landing: m(0.01), plantConsistency: m(0.01) })]
    expect(aggregateFaults(perRep)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd FootTrack && npm run test -- faultTaxonomy`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the fault taxonomy**

```ts
// FootTrack/src/feedback/faultTaxonomy.ts
import type { MetricResult } from '../analysis/types'
import type { Skill } from '../analysis/skillConfig'

const CONFIDENCE_FLOOR = 0.5

export interface FaultRule {
  tag: string
  skill: Skill
  metricKey: string
  direction: 'above' | 'below'
  threshold: number
  impact: number
  fixability: number
}

export interface DetectedFault {
  tag: string
  severity: number // how far past the threshold, normalized 0-1+
}

export interface AggregatedFault {
  tag: string
  frequency: number // 0-1, share of reps this fault appeared in
  avgSeverity: number
  priority: number
}

export const FAULT_RULES: FaultRule[] = [
  { tag: 'shooting_torso_lean', skill: 'shooting', metricKey: 'bodyLean', direction: 'above', threshold: 15, impact: 0.9, fixability: 0.8 },
  { tag: 'shooting_balance_wobble', skill: 'shooting', metricKey: 'balance', direction: 'above', threshold: 0.04, impact: 0.7, fixability: 0.7 },
  { tag: 'shooting_followthrough_short', skill: 'shooting', metricKey: 'followThrough', direction: 'below', threshold: 0.08, impact: 0.6, fixability: 0.7 },
  { tag: 'shooting_landing_unstable', skill: 'shooting', metricKey: 'landing', direction: 'above', threshold: 0.04, impact: 0.6, fixability: 0.6 },
  { tag: 'shooting_plant_inconsistent', skill: 'shooting', metricKey: 'plantConsistency', direction: 'above', threshold: 0.06, impact: 0.8, fixability: 0.9 },

  { tag: 'passing_plant_inconsistent', skill: 'passing', metricKey: 'plantConsistency', direction: 'above', threshold: 0.06, impact: 0.8, fixability: 0.9 },
  { tag: 'passing_ankle_unstable', skill: 'passing', metricKey: 'ankleLock', direction: 'above', threshold: 15, impact: 0.6, fixability: 0.6 },
  // directionConsistency is degrees of stddev in follow-through angle across the session's reps (see Task 15, computed via analysis/metrics.ts#repConsistency) — not the raw followThrough() distance metric, which is a different scale.
  { tag: 'passing_direction_inconsistent', skill: 'passing', metricKey: 'directionConsistency', direction: 'above', threshold: 12, impact: 0.6, fixability: 0.6 },
  { tag: 'passing_balance_wobble', skill: 'passing', metricKey: 'balance', direction: 'above', threshold: 0.04, impact: 0.6, fixability: 0.7 },

  // orientation must already be a non-negative magnitude by the time it reaches this rule — receivingBodyOrientation()
  // itself returns a *signed* angle (sign depends on which way the player is turned), and a plain "below 15" comparison
  // on a signed value would wrongly flag a mirrored open stance (large negative angle) as closed. Task 15's caller is
  // responsible for passing Math.abs(...) here — see the comment at that call site.
  { tag: 'first_touch_closed_stance', skill: 'first_touch', metricKey: 'orientation', direction: 'below', threshold: 15, impact: 0.7, fixability: 0.8 },
  { tag: 'first_touch_stiff_cushion', skill: 'first_touch', metricKey: 'cushioning', direction: 'below', threshold: 5, impact: 0.6, fixability: 0.6 },
  { tag: 'first_touch_balance_unstable', skill: 'first_touch', metricKey: 'balance', direction: 'above', threshold: 0.04, impact: 0.6, fixability: 0.7 },
]

export function detectFaults(skill: Skill, metrics: Record<string, MetricResult>): DetectedFault[] {
  const faults: DetectedFault[] = []
  for (const rule of FAULT_RULES) {
    if (rule.skill !== skill) continue
    const metric = metrics[rule.metricKey]
    if (!metric || metric.confidence < CONFIDENCE_FLOOR) continue

    const crossed = rule.direction === 'above' ? metric.value > rule.threshold : metric.value < rule.threshold
    if (!crossed) continue

    const severity =
      rule.direction === 'above'
        ? (metric.value - rule.threshold) / rule.threshold
        : (rule.threshold - metric.value) / rule.threshold
    faults.push({ tag: rule.tag, severity: Math.max(0, severity) })
  }
  return faults
}

export function aggregateFaults(perRepFaults: DetectedFault[][]): AggregatedFault[] {
  const totalReps = perRepFaults.length
  if (totalReps === 0) return []

  const byTag = new Map<string, DetectedFault[]>()
  for (const repFaults of perRepFaults) {
    for (const fault of repFaults) {
      const list = byTag.get(fault.tag) ?? []
      list.push(fault)
      byTag.set(fault.tag, list)
    }
  }

  const results: AggregatedFault[] = []
  for (const [tag, occurrences] of byTag) {
    const rule = FAULT_RULES.find((r) => r.tag === tag)!
    const frequency = occurrences.length / totalReps
    const avgSeverity = occurrences.reduce((a, o) => a + o.severity, 0) / occurrences.length
    const priority = rule.impact * frequency * rule.fixability
    results.push({ tag, frequency, avgSeverity, priority })
  }

  return results.sort((a, b) => b.priority - a.priority)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd FootTrack && npm run test -- faultTaxonomy`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add FootTrack/src/feedback/faultTaxonomy.ts FootTrack/src/feedback/faultTaxonomy.test.ts
git commit -m "feat: add fault taxonomy, detection, and priority ranking"
```

### Task 13: Feedback copy generation

**Files:**
- Create: `FootTrack/src/feedback/generateFeedback.ts`
- Create: `FootTrack/src/feedback/generateFeedback.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// FootTrack/src/feedback/generateFeedback.test.ts
import { describe, it, expect } from 'vitest'
import { generateFeedback } from './generateFeedback'
import type { AggregatedFault } from './faultTaxonomy'

describe('generateFeedback', () => {
  it('puts the highest-priority fault first as the priority fix', () => {
    const faults: AggregatedFault[] = [
      { tag: 'shooting_torso_lean', frequency: 0.7, avgSeverity: 0.5, priority: 0.5 },
      { tag: 'shooting_balance_wobble', frequency: 0.3, avgSeverity: 0.2, priority: 0.1 },
    ]
    const items = generateFeedback(faults)
    expect(items[0].kind).toBe('priority_fix')
    expect(items[0].faultTag).toBe('shooting_torso_lean')
    expect(items[0].copy.length).toBeGreaterThan(0)
  })

  it('caps corrections at 2 items beyond the priority fix', () => {
    const faults: AggregatedFault[] = [
      { tag: 'shooting_torso_lean', frequency: 0.9, avgSeverity: 0.5, priority: 0.9 },
      { tag: 'shooting_balance_wobble', frequency: 0.6, avgSeverity: 0.4, priority: 0.6 },
      { tag: 'shooting_landing_unstable', frequency: 0.5, avgSeverity: 0.3, priority: 0.4 },
      { tag: 'shooting_plant_inconsistent', frequency: 0.4, avgSeverity: 0.2, priority: 0.2 },
    ]
    const items = generateFeedback(faults)
    const corrections = items.filter((i) => i.kind === 'correction')
    expect(corrections).toHaveLength(2)
  })

  it('returns only a "clean session" win when there are no faults', () => {
    const items = generateFeedback([])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('win')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd FootTrack && npm run test -- generateFeedback`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement feedback generation**

```ts
// FootTrack/src/feedback/generateFeedback.ts
import type { AggregatedFault } from './faultTaxonomy'

export interface FeedbackItemDraft {
  kind: 'priority_fix' | 'win' | 'correction'
  faultTag: string | null
  copy: string
  rank: number
}

const COPY_TEMPLATES: Record<string, (f: AggregatedFault) => string> = {
  shooting_torso_lean: (f) =>
    `Your torso is pulling well off vertical on ${Math.round(f.frequency * 100)}% of your strikes — that instability is costing you accuracy. Focus on staying tall and balanced through contact.`,
  shooting_balance_wobble: (f) =>
    `Your balance wavers before contact on ${Math.round(f.frequency * 100)}% of reps. A steadier approach will make everything downstream more consistent.`,
  shooting_followthrough_short: () =>
    `You're stopping your leg almost at the ball — a stab, not a swing. Let your leg carry on toward the target.`,
  shooting_landing_unstable: (f) =>
    `You're landing unbalanced on ${Math.round(f.frequency * 100)}% of shots. In a game that costs you the next action.`,
  shooting_plant_inconsistent: (f) =>
    `Your plant-foot placement varies rep to rep — that inconsistency is costing you accuracy more than power ever would.`,
  passing_plant_inconsistent: () => `Your plant foot lands in a different spot almost every pass. Lock that in first, before worrying about power.`,
  passing_ankle_unstable: () => `Your ankle looks loose through contact — lock it and point your toes down through the pass.`,
  passing_direction_inconsistent: () => `Your follow-through direction varies a lot between passes — that's showing up as inconsistent accuracy.`,
  passing_balance_wobble: () => `Your balance wavers before you strike the pass. Settle your base first.`,
  first_touch_closed_stance: () => `You're receiving mostly square to the ball. Try arriving side-on so your first touch can go forward.`,
  first_touch_stiff_cushion: () => `Your first touch looks stiff — let your ankle and knee give a little on contact to control the ball softer.`,
  first_touch_balance_unstable: () => `You're unsteady at the moment you receive the ball. Settle your base before the ball arrives.`,
}

const WIN_TEMPLATES: Record<string, (f: AggregatedFault) => string> = {
  shooting_torso_lean: () => `Your torso stayed upright and balanced on most of your strikes.`,
  shooting_balance_wobble: () => `Your pre-contact balance was steady across the session.`,
  shooting_followthrough_short: () => `Your follow-through carried all the way through the target line.`,
  shooting_landing_unstable: () => `You stuck your landing cleanly on most shots.`,
  shooting_plant_inconsistent: () => `Your plant-foot placement was consistent rep to rep.`,
  passing_plant_inconsistent: () => `Your plant-foot placement was consistent across passes.`,
  passing_ankle_unstable: () => `Your ankle stayed locked through contact.`,
  passing_direction_inconsistent: () => `Your passes held a consistent line.`,
  passing_balance_wobble: () => `You stayed balanced through your passing.`,
  first_touch_closed_stance: () => `You opened your body well before receiving.`,
  first_touch_stiff_cushion: () => `Your first touch had a nice soft cushion.`,
  first_touch_balance_unstable: () => `You stayed steady at the moment of receiving.`,
}

/** All fault tags this session could plausibly have shown, per skill — used to mine genuine wins (faults that were checked for but not present). Kept in sync with faultTaxonomy.FAULT_RULES tags by convention; Task 14 wires the real per-session tag list through generateSessionFeedback. */
export function generateFeedback(rankedFaults: AggregatedFault[], checkedTags: string[] = []): FeedbackItemDraft[] {
  if (rankedFaults.length === 0) {
    return [{ kind: 'win', faultTag: null, copy: 'Clean session — no significant technique faults detected.', rank: 0 }]
  }

  const items: FeedbackItemDraft[] = []
  const [priorityFault, ...rest] = rankedFaults

  items.push({
    kind: 'priority_fix',
    faultTag: priorityFault.tag,
    copy: COPY_TEMPLATES[priorityFault.tag]?.(priorityFault) ?? `Focus on fixing: ${priorityFault.tag}`,
    rank: 0,
  })

  rest.slice(0, 2).forEach((fault, i) => {
    items.push({
      kind: 'correction',
      faultTag: fault.tag,
      copy: COPY_TEMPLATES[fault.tag]?.(fault) ?? `Also work on: ${fault.tag}`,
      rank: i + 1,
    })
  })

  const faultTagsPresent = new Set(rankedFaults.map((f) => f.tag))
  const wins = checkedTags
    .filter((tag) => !faultTagsPresent.has(tag) && WIN_TEMPLATES[tag])
    .slice(0, 3)
    .map((tag, i) => ({ kind: 'win' as const, faultTag: tag, copy: WIN_TEMPLATES[tag]({ tag, frequency: 0, avgSeverity: 0, priority: 0 }), rank: i }))
  items.push(...wins)

  return items
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd FootTrack && npm run test -- generateFeedback`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add FootTrack/src/feedback/generateFeedback.ts FootTrack/src/feedback/generateFeedback.test.ts
git commit -m "feat: add feedback copy generation with priority-fix pattern"
```

### Task 14: Scoring engine — session score, EWMA skill scores, weak foot confidence

**Files:**
- Create: `FootTrack/src/feedback/scoring.ts`
- Create: `FootTrack/src/feedback/scoring.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// FootTrack/src/feedback/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { sessionScore, updateEwma, weakFootConfidence } from './scoring'

describe('sessionScore', () => {
  it('scores 100 for perfect mechanics, perfect consistency, and full completion', () => {
    expect(sessionScore({ mechanicsQuality: 1, consistency: 1, completion: 1 })).toBe(100)
  })
  it('weights mechanics 70%, consistency 20%, completion 10%', () => {
    expect(sessionScore({ mechanicsQuality: 0.5, consistency: 0.5, completion: 0.5 })).toBe(50)
  })
  it('rounds to the nearest integer', () => {
    expect(sessionScore({ mechanicsQuality: 0.83, consistency: 0.6, completion: 1 })).toBe(Math.round((0.83 * 0.7 + 0.6 * 0.2 + 1 * 0.1) * 100))
  })
})

describe('updateEwma', () => {
  it('takes the new value directly when there is no previous value', () => {
    expect(updateEwma(null, 80)).toBe(80)
  })
  it('blends 30% new / 70% previous', () => {
    expect(updateEwma(60, 90)).toBeCloseTo(60 * 0.7 + 90 * 0.3)
  })
})

describe('weakFootConfidence', () => {
  it('returns 0 when the weak foot has never been used', () => {
    const result = weakFootConfidence('right', [
      { foot: 'right', techniqueScore: 80 },
      { foot: 'right', techniqueScore: 85 },
    ])
    expect(result.value).toBe(0)
  })

  it('scores higher when weak-foot technique is close to strong-foot technique AND usage share is high', () => {
    const highUsageCloseGap = weakFootConfidence('right', [
      { foot: 'right', techniqueScore: 80 }, { foot: 'left', techniqueScore: 75 },
      { foot: 'right', techniqueScore: 80 }, { foot: 'left', techniqueScore: 75 },
    ])
    const lowUsageBigGap = weakFootConfidence('right', [
      { foot: 'right', techniqueScore: 80 }, { foot: 'right', techniqueScore: 80 },
      { foot: 'right', techniqueScore: 80 }, { foot: 'left', techniqueScore: 40 },
    ])
    expect(highUsageCloseGap.value).toBeGreaterThan(lowUsageBigGap.value)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd FootTrack && npm run test -- scoring`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the scoring engine**

```ts
// FootTrack/src/feedback/scoring.ts
import type { Foot } from '../analysis/skillConfig'
import type { MetricResult } from '../analysis/types'

const EWMA_ALPHA = 0.3

export function sessionScore(input: { mechanicsQuality: number; consistency: number; completion: number }): number {
  const raw = input.mechanicsQuality * 0.7 + input.consistency * 0.2 + input.completion * 0.1
  return Math.round(raw * 100)
}

export function updateEwma(previous: number | null, newValue: number): number {
  if (previous === null) return newValue
  return previous * (1 - EWMA_ALPHA) + newValue * EWMA_ALPHA
}

export function weakFootConfidence(
  dominantFoot: Foot,
  sessions: { foot: Foot; techniqueScore: number }[]
): MetricResult {
  const weakFoot: Foot = dominantFoot === 'left' ? 'right' : 'left'
  const weakReps = sessions.filter((s) => s.foot === weakFoot)
  const strongReps = sessions.filter((s) => s.foot === dominantFoot)

  if (weakReps.length === 0) return { value: 0, confidence: 1 }
  if (strongReps.length === 0) return { value: 0, confidence: 0.3 }

  const weakAvg = weakReps.reduce((a, s) => a + s.techniqueScore, 0) / weakReps.length
  const strongAvg = strongReps.reduce((a, s) => a + s.techniqueScore, 0) / strongReps.length
  const techniqueRatio = Math.min(1, weakAvg / strongAvg)

  const usageShare = weakReps.length / (weakReps.length + strongReps.length)
  const value = 100 * techniqueRatio * (0.5 + 0.5 * usageShare)

  return { value, confidence: weakReps.length >= 5 ? 0.9 : 0.6 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd FootTrack && npm run test -- scoring`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add FootTrack/src/feedback/scoring.ts FootTrack/src/feedback/scoring.test.ts
git commit -m "feat: add session scoring, EWMA trend updates, and weak-foot confidence"
```

---

## Phase 4: Record and Feedback screens

### Task 15: Analysis orchestration, persistence, and the Record screen

This task wires Phases 2–3 together end to end. The orchestration function (`analyzeSession`) composes already-unit-tested pure functions, so it's verified by a TypeScript build check plus a manual QA pass with a real recorded clip rather than a synthetic-fixture test suite (recreating MediaPipe's WASM output by hand would test the fixture, not the code).

**Files:**
- Create: `FootTrack/src/analysis/analyzeSession.ts`
- Create: `FootTrack/src/session/saveSessionResults.ts`
- Modify: `FootTrack/src/screens/RecordPage.tsx`

- [ ] **Step 1: Implement the analysis orchestration**

```ts
// FootTrack/src/analysis/analyzeSession.ts
import { extractPoseFrames } from './poseLandmarker'
import { segmentReps, type RepWindow } from './segmentReps'
import * as M from './metrics'
import { LM } from './types'
import type { PoseFrame, MetricResult } from './types'
import { ankleIndexFor, kneeIndexFor, hipIndexFor, type Skill, type Foot } from './skillConfig'
import { detectFaults, aggregateFaults, FAULT_RULES } from '../feedback/faultTaxonomy'
import { generateFeedback, type FeedbackItemDraft } from '../feedback/generateFeedback'
import { sessionScore } from '../feedback/scoring'

export interface AnalyzedRep {
  repIndex: number
  contactTimestampMs: number
  foot: Foot
  metrics: Record<string, MetricResult>
  qualityClass: 'clean' | 'minor_fault' | 'major_fault'
}

export interface SessionAnalysis {
  reps: AnalyzedRep[]
  sessionScoreValue: number
  feedback: FeedbackItemDraft[]
  mechanicsQuality: number
  consistency: number
  balanceScore: number   // 0-100, higher = steadier
  alignmentScore: number // 0-100, higher = better body-lean/orientation control
}

/** Maps a "lower raw value is better" metric onto a 0-100 score. Values at or below `good` score 100; at or above `bad` score 0; linear between. Requires good < bad. */
function toScore(value: number, good: number, bad: number): number {
  const clamped = Math.min(bad, Math.max(good, value))
  return Math.round(100 * (1 - (clamped - good) / (bad - good)))
}

/** Same as `toScore` but for "higher raw value is better" metrics (e.g. an open receiving-stance angle). Requires bad < good. */
function toScoreHigherIsBetter(value: number, bad: number, good: number): number {
  return toScore(-value, -good, -bad)
}

const TARGET_REPS: Record<Skill, number> = { shooting: 10, passing: 10, first_touch: 10 }

export async function analyzeSession(video: HTMLVideoElement, skill: Skill, footFocus: Foot): Promise<SessionAnalysis> {
  const frames = await extractPoseFrames(video)
  const ankleIdx = ankleIndexFor(footFocus)
  const repWindows = segmentReps(frames, ankleIdx)

  const rawPerRep = repWindows.map((rep) => computeSingleRepMetrics(skill, footFocus, frames, rep))

  const plantConsistency = M.repConsistency(rawPerRep.map((r) => r.plantFootX))
  const directionConsistency = M.repConsistency(rawPerRep.map((r) => r.followThroughAngle))

  const analyzedReps: AnalyzedRep[] = rawPerRep.map((r, i) => {
    const metrics: Record<string, MetricResult> = { ...r.metrics, plantConsistency }
    if (skill === 'passing') metrics.directionConsistency = directionConsistency
    const faults = detectFaults(skill, metrics)
    const qualityClass = faults.some((f) => f.severity > 0.5) ? 'major_fault' : faults.length > 0 ? 'minor_fault' : 'clean'
    return { repIndex: i, contactTimestampMs: repWindows[i].contactTimestampMs, foot: footFocus, metrics, qualityClass }
  })

  const perRepFaults = analyzedReps.map((r) => detectFaults(skill, r.metrics))
  const rankedFaults = aggregateFaults(perRepFaults)
  const checkedTags = FAULT_RULES.filter((r) => r.skill === skill).map((r) => r.tag)
  const feedback = generateFeedback(rankedFaults, checkedTags)

  const cleanShare = analyzedReps.length === 0 ? 0 : analyzedReps.filter((r) => r.qualityClass === 'clean').length / analyzedReps.length
  const consistency = 1 - Math.min(1, plantConsistency.value / 0.15)
  const completion = Math.min(1, analyzedReps.length / TARGET_REPS[skill])
  const sessionScoreValue = sessionScore({ mechanicsQuality: cleanShare, consistency, completion })

  // Balance and alignment scores average each rep's balance/lean-family metric (whichever the skill computed) onto a 0-100 scale.
  // Thresholds mirror the fault taxonomy's own good/bad boundaries (Task 12) so a fault-triggering rep also visibly drags the trend down.
  const balanceValues = analyzedReps.map((r) => r.metrics.balance?.value).filter((v): v is number => v !== undefined)
  const balanceScore = balanceValues.length === 0 ? 50 : Math.round(balanceValues.reduce((a, v) => a + toScore(v, 0.01, 0.08), 0) / balanceValues.length)

  // shooting/passing: alignment tracks body lean (lower is better). first_touch: alignment tracks how open the receiving
  // stance is (higher is better) — metrics.orientation is already a non-negative magnitude (abs'd at the source above).
  const alignmentValues =
    skill === 'first_touch'
      ? analyzedReps.map((r) => r.metrics.orientation?.value).filter((v): v is number => v !== undefined)
      : analyzedReps.map((r) => r.metrics.bodyLean?.value).filter((v): v is number => v !== undefined)
  const alignmentScore =
    alignmentValues.length === 0
      ? 50
      : Math.round(
          alignmentValues.reduce(
            (a, v) => a + (skill === 'first_touch' ? toScoreHigherIsBetter(v, 5, 45) : toScore(v, 2, 25)),
            0
          ) / alignmentValues.length
        )

  return { reps: analyzedReps, sessionScoreValue, feedback, mechanicsQuality: cleanShare, consistency, balanceScore, alignmentScore }
}

function computeSingleRepMetrics(skill: Skill, foot: Foot, frames: PoseFrame[], rep: RepWindow) {
  const windowFrames = frames.slice(rep.startFrameIndex, rep.endFrameIndex + 1)
  const contactIdxInWindow = rep.contactFrameIndex - rep.startFrameIndex
  const contactFrame = frames[rep.contactFrameIndex]
  const ankleIdx = ankleIndexFor(foot)
  const kneeIdx = kneeIndexFor(foot)
  const hipIdx = hipIndexFor(foot)
  const footIndexIdx = foot === 'left' ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX

  const hipMidX = (contactFrame.landmarks[LM.LEFT_HIP].x + contactFrame.landmarks[LM.RIGHT_HIP].x) / 2
  const plantFootX = contactFrame.landmarks[ankleIdx].x - hipMidX
  const endFrame = frames[rep.endFrameIndex]
  const followThroughAngle =
    Math.atan2(endFrame.landmarks[ankleIdx].y - contactFrame.landmarks[ankleIdx].y, endFrame.landmarks[ankleIdx].x - contactFrame.landmarks[ankleIdx].x) *
    (180 / Math.PI)

  if (skill === 'shooting') {
    return {
      plantFootX,
      followThroughAngle,
      metrics: {
        bodyLean: M.bodyLeanAtContact(contactFrame),
        balance: M.preContactBalance(windowFrames.slice(0, contactIdxInWindow + 1)),
        followThrough: M.followThrough(windowFrames, contactIdxInWindow, ankleIdx),
        landing: M.landingStability(windowFrames, contactIdxInWindow),
        hipRotation: M.hipRotation(windowFrames[0], contactFrame),
      },
    }
  }
  if (skill === 'passing') {
    return {
      plantFootX,
      followThroughAngle,
      metrics: {
        bodyLean: M.bodyLeanAtContact(contactFrame),
        balance: M.preContactBalance(windowFrames.slice(0, contactIdxInWindow + 1)),
        ankleLock: M.ankleLockDeviation(contactFrame, kneeIdx, ankleIdx, footIndexIdx),
      },
    }
  }
  // receivingBodyOrientation returns a signed angle (0 = square, sign depends on which way the player
  // is turned). Task 12's first_touch_closed_stance rule does a plain "below threshold" comparison,
  // which only works on a non-negative magnitude — a mirrored open stance would otherwise read as a
  // large *negative* value and get wrongly flagged as closed. Store the absolute value here so every
  // downstream consumer (fault detection, alignment scoring) sees a consistent non-negative convention.
  const orientationRaw = M.receivingBodyOrientation(contactFrame)
  return {
    plantFootX,
    followThroughAngle,
    metrics: {
      orientation: { value: Math.abs(orientationRaw.value), confidence: orientationRaw.confidence },
      balance: M.preContactBalance(windowFrames.slice(0, contactIdxInWindow + 1)),
      cushioning: M.cushioningMotion(windowFrames[0], contactFrame, hipIdx, kneeIdx, ankleIdx),
    },
  }
}
```

- [ ] **Step 2: Verify the orchestration compiles**

Run: `cd FootTrack && npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Implement persistence — upload video, write session/reps/feedback, update skill scores**

```ts
// FootTrack/src/session/saveSessionResults.ts
import { supabase } from '../lib/supabase'
import type { SessionAnalysis } from '../analysis/analyzeSession'
import type { Skill, Foot } from '../analysis/skillConfig'
import { updateEwma, weakFootConfidence } from '../feedback/scoring'

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
      status: 'complete',
      session_score: analysis.sessionScoreValue,
    })
    .select()
    .single()
  if (sessionError) throw sessionError

  if (analysis.reps.length > 0) {
    const { error: repsError } = await supabase.from('rep_events').insert(
      analysis.reps.map((r) => ({
        session_id: session.id,
        rep_index: r.repIndex,
        foot: r.foot,
        t_contact_ms: r.contactTimestampMs,
        metrics: r.metrics,
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

  await updateSkillScores(profileId, skill, footFocus, analysis)

  return session.id
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

async function updateSkillScores(profileId: string, skill: Skill, footFocus: Foot, analysis: SessionAnalysis) {
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

  await updateWeakFootConfidence(profileId, footFocus, skill, analysis.mechanicsQuality * 100)
}

/** weak_foot_confidence is account-wide (skill = null), pooled across all 3 skills, and recomputed fresh from history each time rather than EWMA-blended — see design doc §6. */
async function updateWeakFootConfidence(profileId: string, footFocus: Foot, skill: Skill, techniqueScoreThisSession: number) {
  const { data: profile } = await supabase.from('profiles').select('dominant_foot').eq('id', profileId).single()
  if (!profile?.dominant_foot) return

  const { data: history } = await supabase
    .from('training_sessions')
    .select('foot_focus, session_score')
    .eq('profile_id', profileId)
    .not('session_score', 'is', null)

  const sessions = (history ?? []).map((s) => ({ foot: s.foot_focus as Foot, techniqueScore: s.session_score as number }))
  sessions.push({ foot: footFocus, techniqueScore: techniqueScoreThisSession })

  const result = weakFootConfidence(profile.dominant_foot as Foot, sessions)
  await supabase.from('skill_scores').insert({ profile_id: profileId, attribute: 'weak_foot_confidence', skill: null, value: result.value })
}
```

- [ ] **Step 4: Implement the Record screen**

```tsx
// FootTrack/src/screens/RecordPage.tsx
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
```

- [ ] **Step 5: Create the private storage bucket**

Use the Supabase MCP connector's `execute_sql` for project ref `cqmmikeofjnaenllsxkg`:
```sql
insert into storage.buckets (id, name, public) values ('session-videos', 'session-videos', false);

create policy "session videos: owner read/write"
on storage.objects for all
using (bucket_id = 'session-videos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'session-videos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 6: Verify the app builds**

Run: `cd FootTrack && npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual QA** — record a real ~15-second clip of yourself doing 5-6 slow instep-drive strikes against a wall, side-on to the camera. Run it through the Record screen. Confirm: reps are detected (not 0, not wildly over-counted), a session appears in Supabase (`select * from training_sessions order by created_at desc limit 1;` via `execute_sql`), and no console errors. If rep detection is badly off, adjust `VELOCITY_THRESHOLD` in `segmentReps.ts` (Task 9) before moving on — this is the single most failure-prone constant in the whole pipeline, exactly as flagged in the design doc's risks section. Also specifically watch for **phantom reps**: `segmentReps()` (Task 9) never checks landmark `visibility` before computing velocity, so a low-confidence frame (occlusion, motion blur, momentary tracking loss) can produce a spurious position jump that reads as a fake rep. If this shows up on real footage, the fix is to skip frames below a visibility floor before computing velocity in `segmentReps.ts`, not just tune the threshold constant.

- [ ] **Step 8: Commit**

```bash
git add FootTrack/src/analysis/analyzeSession.ts FootTrack/src/session/ FootTrack/src/screens/RecordPage.tsx
git commit -m "feat: wire pose analysis, scoring, and persistence into the Record screen"
```

### Task 16: Home and Feedback screens

**Files:**
- Modify: `FootTrack/src/screens/HomePage.tsx`
- Modify: `FootTrack/src/screens/FeedbackPage.tsx`
- Create: `FootTrack/src/screens/FeedbackPage.test.tsx`

- [ ] **Step 1: Implement the Home screen**

```tsx
// FootTrack/src/screens/HomePage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SKILL_LABELS } from '../analysis/skillConfig'

interface LatestSession {
  id: string
  skill: keyof typeof SKILL_LABELS
  session_score: number | null
  created_at: string
}

export function HomePage() {
  const [latest, setLatest] = useState<LatestSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('training_sessions')
      .select('id, skill, session_score, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setLatest(data)
        setLoading(false)
      })
  }, [])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>FootTrack</h1>
      {!latest ? (
        <>
          <p>Record your baseline session to get started — about 10 reps, any of the 3 skills.</p>
          <Link to="/record">Record my baseline session</Link>
        </>
      ) : (
        <>
          <p>
            Last session: {SKILL_LABELS[latest.skill]} — score {latest.session_score ?? '—'}
          </p>
          <Link to={`/feedback/${latest.id}`}>View feedback</Link>
        </>
      )}
      <Link to="/record">Record a new session</Link>
    </div>
  )
}
```

- [ ] **Step 2: Write the failing test for the Feedback screen**

```tsx
// FootTrack/src/screens/FeedbackPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FeedbackPage } from './FeedbackPage'

vi.mock('../lib/supabase', () => {
  const session = { id: 's1', skill: 'shooting', session_score: 74, created_at: '2026-07-08T00:00:00Z' }
  const feedback = [
    { id: 'f1', kind: 'priority_fix', fault_tag: 'shooting_torso_lean', copy: 'Lean forward more.', rank: 0 },
    { id: 'f2', kind: 'win', fault_tag: null, copy: 'Great follow-through.', rank: 0 },
  ]
  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => (table === 'training_sessions' ? Promise.resolve({ data: session, error: null }) : undefined),
            order: () => Promise.resolve({ data: table === 'feedback_items' ? feedback : [], error: null }),
          }),
        }),
      }),
    },
  }
})

describe('FeedbackPage', () => {
  it('shows the session score and the priority fix before other feedback', async () => {
    render(
      <MemoryRouter initialEntries={['/feedback/s1']}>
        <Routes><Route path="/feedback/:sessionId" element={<FeedbackPage />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('74')).toBeInTheDocument())
    expect(screen.getByText('Lean forward more.')).toBeInTheDocument()
    expect(screen.getByText('Great follow-through.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd FootTrack && npm run test -- FeedbackPage`
Expected: FAIL — placeholder component renders only "Feedback".

- [ ] **Step 4: Implement the Feedback screen**

```tsx
// FootTrack/src/screens/FeedbackPage.tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface SessionRow {
  id: string
  skill: string
  session_score: number | null
  created_at: string
}
interface FeedbackRow {
  id: string
  kind: 'priority_fix' | 'win' | 'correction'
  fault_tag: string | null
  copy: string
  rank: number
  drills: { title: string; objective: string; instructions: string } | null
}

export function FeedbackPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])

  useEffect(() => {
    if (!sessionId) return
    supabase.from('training_sessions').select('id, skill, session_score, created_at').eq('id', sessionId).single()
      .then(({ data }) => setSession(data))
    supabase.from('feedback_items').select('id, kind, fault_tag, copy, rank, drills(title, objective, instructions)').eq('session_id', sessionId).order('rank')
      .then(({ data }) => setFeedback((data as unknown as FeedbackRow[]) ?? []))
  }, [sessionId])

  if (!session) return <p>Loading feedback…</p>

  const priorityFix = feedback.find((f) => f.kind === 'priority_fix')
  const corrections = feedback.filter((f) => f.kind === 'correction')
  const wins = feedback.filter((f) => f.kind === 'win')

  return (
    <div>
      <h1>{session.session_score ?? '—'}</h1>
      <p>Session score</p>

      {priorityFix && (
        <section aria-label="Priority fix">
          <h2>Fix this first</h2>
          <p>{priorityFix.copy}</p>
          {priorityFix.drills && (
            <div>
              <strong>Fix it: {priorityFix.drills.title}</strong>
              <p>{priorityFix.drills.instructions}</p>
            </div>
          )}
        </section>
      )}

      {wins.length > 0 && (
        <section aria-label="Wins">
          <h2>Top wins</h2>
          <ul>{wins.map((w) => <li key={w.id}>{w.copy}</li>)}</ul>
        </section>
      )}

      {corrections.length > 0 && (
        <section aria-label="More corrections">
          <h2>More corrections ({corrections.length})</h2>
          <ul>
            {corrections.map((c) => (
              <li key={c.id}>
                {c.copy}
                {c.drills && <> — <em>{c.drills.title}</em></>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd FootTrack && npm run test -- FeedbackPage`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add FootTrack/src/screens/HomePage.tsx FootTrack/src/screens/FeedbackPage.tsx FootTrack/src/screens/FeedbackPage.test.tsx
git commit -m "feat: implement Home and Feedback screens"
```

---

## Phase 5: Progress, weekly plan, profile

### Task 17: Progress screen — 5 trend tiles

**Files:**
- Create: `FootTrack/src/progress/loadTrends.ts`
- Create: `FootTrack/src/progress/loadTrends.test.ts`
- Modify: `FootTrack/src/screens/ProgressPage.tsx`

- [ ] **Step 1: Write the failing test for the trend-loading/aggregation logic** (pure function — takes raw rows, returns tile values; the Supabase query itself is a thin wrapper verified by manual QA like Task 15)

```ts
// FootTrack/src/progress/loadTrends.test.ts
import { describe, it, expect } from 'vitest'
import { buildTrendTiles } from './loadTrends'

describe('buildTrendTiles', () => {
  it('averages the latest per-skill value for account-wide attributes', () => {
    const rows = [
      { attribute: 'technique', skill: 'shooting', value: 80, computed_at: '2026-07-01' },
      { attribute: 'technique', skill: 'passing', value: 60, computed_at: '2026-07-01' },
      { attribute: 'technique', skill: 'first_touch', value: 70, computed_at: '2026-07-01' },
    ]
    const tiles = buildTrendTiles(rows)
    const technique = tiles.find((t) => t.attribute === 'technique')
    expect(technique?.value).toBeCloseTo(70)
  })

  it('takes weak_foot_confidence directly since it has no per-skill split', () => {
    const rows = [{ attribute: 'weak_foot_confidence', skill: null, value: 42, computed_at: '2026-07-01' }]
    const tiles = buildTrendTiles(rows)
    expect(tiles.find((t) => t.attribute === 'weak_foot_confidence')?.value).toBe(42)
  })

  it('only uses the most recent row per (attribute, skill) pair', () => {
    const rows = [
      { attribute: 'technique', skill: 'shooting', value: 50, computed_at: '2026-07-01' },
      { attribute: 'technique', skill: 'shooting', value: 90, computed_at: '2026-07-05' },
    ]
    expect(buildTrendTiles(rows).find((t) => t.attribute === 'technique')?.value).toBe(90)
  })

  it('returns null for a tile with no data yet', () => {
    expect(buildTrendTiles([]).find((t) => t.attribute === 'balance')?.value).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd FootTrack && npm run test -- loadTrends`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement trend aggregation and the Supabase query wrapper**

```ts
// FootTrack/src/progress/loadTrends.ts
import { supabase } from '../lib/supabase'

export interface SkillScoreRow {
  attribute: string
  skill: string | null
  value: number
  computed_at: string
}

export interface TrendTile {
  attribute: 'technique' | 'balance' | 'alignment' | 'consistency' | 'weak_foot_confidence'
  label: string
  value: number | null
}

const TILE_LABELS: Record<TrendTile['attribute'], string> = {
  technique: 'Technique',
  balance: 'Balance',
  alignment: 'Body Alignment',
  consistency: 'Consistency',
  weak_foot_confidence: 'Weak Foot Confidence',
}

export function buildTrendTiles(rows: SkillScoreRow[]): TrendTile[] {
  const latestByKey = new Map<string, SkillScoreRow>()
  for (const row of rows) {
    const key = `${row.attribute}:${row.skill ?? 'account'}`
    const existing = latestByKey.get(key)
    if (!existing || row.computed_at > existing.computed_at) latestByKey.set(key, row)
  }

  return (Object.keys(TILE_LABELS) as TrendTile['attribute'][]).map((attribute) => {
    if (attribute === 'weak_foot_confidence') {
      const row = latestByKey.get('weak_foot_confidence:account')
      return { attribute, label: TILE_LABELS[attribute], value: row?.value ?? null }
    }
    const perSkillValues = ['shooting', 'passing', 'first_touch']
      .map((skill) => latestByKey.get(`${attribute}:${skill}`)?.value)
      .filter((v): v is number => v !== undefined)
    const value = perSkillValues.length === 0 ? null : perSkillValues.reduce((a, v) => a + v, 0) / perSkillValues.length
    return { attribute, label: TILE_LABELS[attribute], value }
  })
}

export async function loadTrends(profileId: string): Promise<TrendTile[]> {
  const { data, error } = await supabase
    .from('skill_scores')
    .select('attribute, skill, value, computed_at')
    .eq('profile_id', profileId)
  if (error) throw error
  return buildTrendTiles(data ?? [])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd FootTrack && npm run test -- loadTrends`
Expected: PASS (4 tests)

- [ ] **Step 5: Implement the Progress screen**

```tsx
// FootTrack/src/screens/ProgressPage.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadTrends, type TrendTile } from '../progress/loadTrends'

export function ProgressPage() {
  const [tiles, setTiles] = useState<TrendTile[] | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      loadTrends(data.user.id).then(setTiles)
    })
  }, [])

  if (!tiles) return <p>Loading…</p>

  const hasAnyData = tiles.some((t) => t.value !== null)
  if (!hasAnyData) return <p>Progress needs data — record a couple of sessions and your first trends will appear here.</p>

  return (
    <div>
      <h1>Progress</h1>
      <ul>
        {tiles.map((t) => (
          <li key={t.attribute}>
            <strong>{t.label}:</strong> {t.value === null ? 'Collecting data' : Math.round(t.value)}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add FootTrack/src/progress/ FootTrack/src/screens/ProgressPage.tsx
git commit -m "feat: implement Progress screen with 5 trend tiles"
```

### Task 18: Weekly plan generator and Plan screen

**Files:**
- Create: `FootTrack/src/plan/generatePlan.ts`
- Create: `FootTrack/src/plan/generatePlan.test.ts`
- Modify: `FootTrack/src/screens/PlanPage.tsx`

- [ ] **Step 1: Write the failing test for the pure plan-selection logic**

```ts
// FootTrack/src/plan/generatePlan.test.ts
import { describe, it, expect } from 'vitest'
import { chooseFocusAreas } from './generatePlan'

describe('chooseFocusAreas', () => {
  it('picks the 1-2 lowest-scoring skills as focus areas', () => {
    const scores = [
      { skill: 'shooting', technique: 85 },
      { skill: 'passing', technique: 50 },
      { skill: 'first_touch', technique: 65 },
    ]
    expect(chooseFocusAreas(scores)).toEqual(['passing', 'first_touch'])
  })

  it('falls back to all 3 skills evenly when there is no score history', () => {
    expect(chooseFocusAreas([])).toEqual(['shooting', 'passing', 'first_touch'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd FootTrack && npm run test -- generatePlan`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the plan generator**

```ts
// FootTrack/src/plan/generatePlan.ts
import { supabase } from '../lib/supabase'
import type { Skill } from '../analysis/skillConfig'

const ALL_SKILLS: Skill[] = ['shooting', 'passing', 'first_touch']

export function chooseFocusAreas(scores: { skill: Skill; technique: number }[]): Skill[] {
  if (scores.length === 0) return ALL_SKILLS
  return [...scores].sort((a, b) => a.technique - b.technique).slice(0, 2).map((s) => s.skill)
}

export async function generateWeeklyPlan(profileId: string): Promise<string> {
  const { data: rows } = await supabase
    .from('skill_scores')
    .select('skill, value, computed_at')
    .eq('profile_id', profileId)
    .eq('attribute', 'technique')
    .not('skill', 'is', null)
    .order('computed_at', { ascending: false })

  const latestPerSkill = new Map<string, number>()
  for (const row of rows ?? []) {
    if (!latestPerSkill.has(row.skill as string)) latestPerSkill.set(row.skill as string, row.value)
  }
  const scores = Array.from(latestPerSkill.entries()).map(([skill, technique]) => ({ skill: skill as Skill, technique }))
  const focusAreas = chooseFocusAreas(scores)

  const rationale =
    scores.length === 0
      ? `Starting with all 3 skills this week to build your baseline.`
      : `Focusing on ${focusAreas.join(' and ')} this week — your lowest technique scores right now.`

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const { data: plan, error } = await supabase
    .from('plans')
    .insert({ profile_id: profileId, week_start: weekStart.toISOString().slice(0, 10), focus_areas: focusAreas, rationale })
    .select()
    .single()
  if (error) throw error

  const { data: drills } = await supabase.from('drills').select('id, category').in('category', focusAreas)
  const chosen = (drills ?? []).slice(0, 3)

  // Weak-foot drills live in their own category and are never one of focusAreas (which is always shooting/passing/first_touch),
  // so without this they'd never be reachable — cross-checked against the account-wide weak_foot_confidence score instead.
  const { data: weakFootScore } = await supabase
    .from('skill_scores')
    .select('value')
    .eq('profile_id', profileId)
    .eq('attribute', 'weak_foot_confidence')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (weakFootScore && weakFootScore.value < 65) {
    const { data: weakFootDrills } = await supabase.from('drills').select('id').eq('category', 'weak_foot').limit(1)
    if (weakFootDrills && weakFootDrills.length > 0) chosen.push({ id: weakFootDrills[0].id, category: 'weak_foot' })
  }

  if (chosen.length > 0) {
    await supabase.from('plan_items').insert(
      chosen.map((d, i) => ({ plan_id: plan.id, drill_id: d.id, target_day: (i + 1) * 2 }))
    )
  }

  return plan.id
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd FootTrack && npm run test -- generatePlan`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the Plan screen**

```tsx
// FootTrack/src/screens/PlanPage.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateWeeklyPlan } from '../plan/generatePlan'

interface PlanItemRow {
  id: string
  target_day: number
  status: string
  drills: { title: string; objective: string } | null
}
interface PlanRow {
  id: string
  rationale: string
  focus_areas: string[]
}

export function PlanPage() {
  const [plan, setPlan] = useState<PlanRow | null>(null)
  const [items, setItems] = useState<PlanItemRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const { data: existing } = await supabase
      .from('plans')
      .select('id, rationale, focus_areas')
      .eq('profile_id', userData.user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    let currentPlan = existing
    if (!currentPlan) {
      const planId = await generateWeeklyPlan(userData.user.id)
      const { data: created } = await supabase.from('plans').select('id, rationale, focus_areas').eq('id', planId).single()
      currentPlan = created
    }
    setPlan(currentPlan)

    if (currentPlan) {
      const { data: planItems } = await supabase
        .from('plan_items')
        .select('id, target_day, status, drills(title, objective)')
        .eq('plan_id', currentPlan.id)
        .order('target_day')
      setItems((planItems as unknown as PlanItemRow[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <p>Loading…</p>
  if (!plan) return <p>Couldn't load your plan.</p>

  return (
    <div>
      <h1>This week's plan</h1>
      <p>{plan.rationale}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.drills?.title} — {item.drills?.objective} (day {item.target_day})
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add FootTrack/src/plan/ FootTrack/src/screens/PlanPage.tsx
git commit -m "feat: implement rule-based weekly plan generator and Plan screen"
```

### Task 19: Profile screen

**Files:**
- Modify: `FootTrack/src/screens/ProfilePage.tsx`

- [ ] **Step 1: Implement the Profile screen**

```tsx
// FootTrack/src/screens/ProfilePage.tsx
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
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('email, dominant_foot, position').eq('id', data.user.id).single()
        .then(({ data: row }) => setProfile(row))
    })
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
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    // training_sessions cascade-deletes rep_events and feedback_items; plans cascade-deletes plan_items (see 0001_init.sql)
    await supabase.from('training_sessions').delete().eq('profile_id', data.user.id)
    await supabase.from('plans').delete().eq('profile_id', data.user.id)
    await supabase.from('skill_scores').delete().eq('profile_id', data.user.id)
    await handleSignOut()
  }

  if (!profile) return <p>Loading…</p>

  return (
    <div>
      <h1>Profile</h1>
      <p>{profile.email}</p>
      <p>Dominant foot: {profile.dominant_foot ?? '—'}</p>
      <p>Position: {profile.position ?? '—'}</p>
      <button onClick={handleSignOut}>Sign out</button>
      <button onClick={handleDeleteMyData}>Delete my data</button>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd FootTrack && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add FootTrack/src/screens/ProfilePage.tsx
git commit -m "feat: implement Profile screen with sign-out and data deletion"
```

---

## Phase 6: PWA packaging and deployment

### Task 20: PWA manifest and installability

**Files:**
- Modify: `FootTrack/vite.config.ts`
- Create: `FootTrack/public/icon-192.png`, `FootTrack/public/icon-512.png` (placeholder app icons)

- [ ] **Step 1: Add the PWA plugin to Vite config**

```ts
// FootTrack/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FootTrack',
        short_name: 'FootTrack',
        description: 'AI-assisted football technique training',
        theme_color: '#0E9E86',
        background_color: '#0E9E86',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 2: Add placeholder icons**

Run:
```bash
cd FootTrack
mkdir -p public
# Simple solid-color placeholder icons — swap for real branded icons before a public launch.
node -e "
const fs = require('fs');
// minimal 1x1 PNG, browsers will scale it; replace with real icons before shipping publicly
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('public/icon-192.png', png);
fs.writeFileSync('public/icon-512.png', png);
"
```

Note: this step requires Node.js locally (confirm with `node --version` — if unavailable, generate the two placeholder PNGs with any image tool instead; they just need to exist at those paths with those two sizes before a real launch).

- [ ] **Step 3: Verify the build produces a manifest and service worker**

Run: `cd FootTrack && npm run build`
Expected: succeeds; `dist/manifest.webmanifest` and `dist/sw.js` exist.

- [ ] **Step 4: Commit**

```bash
git add FootTrack/vite.config.ts FootTrack/public/icon-192.png FootTrack/public/icon-512.png
git commit -m "feat: add PWA manifest and service worker for installability"
```

### Task 21: Deploy to Vercel

**Files:**
- Create: `FootTrack/vercel.json`

- [ ] **Step 1: Add SPA rewrite config so client-side routes work on refresh**

```json
// FootTrack/vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Commit**

```bash
git add FootTrack/vercel.json
git commit -m "chore: add Vercel SPA rewrite config"
```

- [ ] **Step 3: Deploy**

Run (from `FootTrack/`, requires the Vercel CLI — `npm i -g vercel` if not already installed):
```bash
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

When prompted, paste the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` values from `.env.local` (Task 2).

- [ ] **Step 4: Verify the live deployment**

Open the printed production URL. Confirm: sign-up works, onboarding completes, the Record screen loads and requests camera/file access, and — most importantly — the whole record → analyze → feedback loop works end to end against the live Supabase project on a real phone browser, not just desktop (framing checks and camera capture behave differently on mobile).

- [ ] **Step 5: Update the design doc with the live URL**

Add a line to `docs/superpowers/specs/2026-07-08-foottrack-mvp-design.md` §11 with the deployed URL, then commit:

```bash
git add docs/superpowers/specs/2026-07-08-foottrack-mvp-design.md
git commit -m "docs: record FootTrack production URL"
```

---

## Plan self-review notes

**Spec coverage:** §1 scope (3 skills, accounts, history, dashboard, plan) → Tasks 1-21 cover all of it; explicitly-cut items (coach mode, billing, LLM copy, youth consent flow) are not implemented, matching the design doc. §2 architecture → Tasks 1-3, 20-21. §3 no-ball-tracking → Tasks 9-14 implement the pose-only reframing throughout. §4 data model → Task 3. §5 per-skill metrics → Tasks 10, 15. §6 scoring → Tasks 14, 15 (extended to cover all 5 dashboard attributes, not just the 2 in the original draft — see the two inline fixes above). §7 feedback engine → Tasks 12-13. §8 drill library → Task 4. §9 plan generator → Task 18. §10 screens → Tasks 5-7, 15-19. §11 deployment → Tasks 20-21.

**Fixed during authoring (not left as follow-ups):** the `passing_direction_inconsistent` fault rule originally reused the `followThrough` metric key at the wrong scale — corrected to a dedicated `directionConsistency` metric. The `ankleLockDeviation` metric referenced by the passing fault rules didn't exist in Task 10 — added it, plus a generic `repConsistency` helper. `updateSkillScores` originally only persisted 2 of the 5 attributes the Progress screen needs — extended to compute and persist Balance and Alignment per session, and to recompute account-wide Weak Foot Confidence after every session.

**Known simplifications, disclosed rather than silent:**
- `TARGET_REPS` (Task 15) is a flat constant per skill rather than plan-driven, and passing's declared-target-direction concept from the original StrikeLab spec was dropped in favor of direction *consistency* — both are deliberate MVP scope cuts.
- Task 15's Record screen uses a native `<input type="file" accept="video/*" capture="environment">` rather than a custom in-app guided-capture UI (live framing silhouette, countdown, rep-tick audio) described in the design doc's IA section. On mobile this still opens the OS camera directly, so recording works — it just isn't a bespoke guided experience. Building that custom camera UI is a reasonable Phase 2 follow-up, not included here to keep this plan's scope achievable.
- `sampleIntervalMs = 33` in `extractPoseFrames` (Task 11) processes video roughly frame-by-frame; on a long clip or a slow phone this could be slow, since each sample does a `video.currentTime` seek-and-wait round trip. If Task 15's manual QA pass shows this is too slow in practice, drop to `sampleIntervalMs = 66` (≈15fps) first, per the design doc's own risk note (§12), before considering anything more drastic.

**Follow-up flagged during Task 2 code review (not a blocker, tracked for a later task):** `supabase.ts` throws at module-load time if env vars are missing — correct for local dev (Vite's overlay catches it), but in a deployed build this fails silently in every user's browser as a blank screen (no React ErrorBoundary catches a top-level module-eval throw), and `vite-plugin-pwa`'s service worker can cache that broken bundle. Worth adding, in a later task once the app shell exists: build-time env validation (so a misconfigured deploy fails at build/CI instead of at runtime) and a top-level ErrorBoundary with a friendly fallback.

**Fixed after Task 4's code review surfaced a real structural gap (not a Task 4 defect — Task 4's seed data was correct; the gap was in how later tasks were specced to consume it):** `targets_fault_tags` had no reader anywhere in the original draft of Tasks 13/15 — `feedback_items` was inserted without ever setting `drill_id`, so the "Fix It" drill prescription (design doc §7) was never actually wired up. Fixed: Task 15's `saveSessionResults` now looks up a matching drill per fault tag (`findDrillForFault`, using Postgres `contains` on `targets_fault_tags`) and sets `drill_id` on each feedback item; Task 16's Feedback screen now joins and displays the drill. Separately, `weak_foot` category drills were unreachable by both the fault-tag route (no fault rule ever produces `weak_foot_gap`) and the weekly-plan route (`generateWeeklyPlan`'s category filter is always shooting/passing/first_touch) — fixed by having Task 18's plan generator also check the account's `weak_foot_confidence` score and append a weak-foot drill when it's below 65. `balance` category drills didn't need an equivalent fix — they're already reachable via the fault-tag route (`shooting_balance_wobble` etc. are real `FAULT_RULES` tags).

**Fixed after Task 6's code review:** the plan's own `AppShell` reference code rendered `<NavBar />` unconditionally, visible on `/sign-in`/`/sign-up` before any session existed. Fixed in the implementation (not re-edited above, since Task 6 is done) — `AppShell` now calls `useAuth()` and renders `{session && <NavBar />}`. Anyone touching `AppShell` in a later task should preserve that conditional.

**Backlog item flagged during Task 7's code review, not fixed (needs its own design decision, not a quick patch):** there's no first-run enforcement routing a new user to `/onboarding` before `/home` — `RequireAuth` only checks session presence, not profile completeness, and the catch-all route sends unknown paths to `/home` rather than `/onboarding`. A user can reach the app with `dominant_foot: null` forever if they never manually visit `/onboarding`. Worth deciding before Tasks 15/16 (which assume a populated `dominant_foot` for foot-focus defaults) whether to: (a) have `RequireAuth` also check `profiles.dominant_foot is null` and redirect to onboarding, or (b) have the Home screen (Task 16) detect it and prompt inline. Not blocking this build, but shouldn't be forgotten.

**Critical fix from Task 8's code review — real, not theoretical, caught before it shipped false coaching claims:** `angleFromVertical()` is mathematically direction-agnostic (uses `Math.abs()` on both axes, so it measures magnitude of lean, never which way). The original draft of Task 12/13 had a fault tag `shooting_lean_back` with copy asserting "you're leaning back... shots flying high" — a specific direction this metric structurally cannot detect. A player leaning *forward* would trigger the identical value and get told the opposite of the truth. Traced forward through Tasks 12/13/4 (drill seed, KPI wording) before any of that code existed and fixed at the source: renamed the tag to `shooting_torso_lean` throughout, rewrote the copy to claim only "off vertical / instability," not a direction, and updated the already-seeded "Chest-Over-Ball Finishes" drill's objective to match (its `targets_fault_tags` in the live DB was updated to match — see below). Considered and rejected a signed-lean approach (deriving a reference "forward" direction from the striking foot's swing velocity) as too much unproven cross-task complexity to add this late; direction-agnostic is the honest, shippable choice for MVP, consistent with the product's own "never claim what you can't measure" principle. `landmarkConfidence([])` also had a related latent risk (`Infinity` instead of `0`, which would have silently defeated the Task 12 confidence-floor exclusion) — fixed in the implemented code, not just the plan.

**Serious bug caught and fixed during Task 10's review (the most significant one so far):** the plan's own `ankleLockDeviation` test fixture had a wrong inline comment/coordinates — it claimed to encode "roughly 165 degrees" but the given coordinates actually computed ~104°. The first fix attempt changed the production `LOCKED_REFERENCE_DEG` constant from 165 to 90 to match the broken fixture, which would have inverted the metric's real-world meaning (a genuinely locked/pointed ankle would score as "unstable" and vice versa) once Task 12's `passing_ankle_unstable` fault rule consumed it. Caught via independent geometric re-derivation, cross-checked against Task 12's already-specified fault polarity, and corrected: reverted the constant to 165 (confirmed anatomically correct — locked/plantarflexed reads ~165-180°, neutral/flat reads ~90-110°) and fixed the test fixture instead (now genuinely ~175°, verified with worked arithmetic, not threshold-scraping). Fixed in both the implemented code and this plan document (the fixture coordinates/comment above) so the plan doesn't stay a regression trap for anyone treating it as ground truth later.

**Real integration bug caught during Task 12's review, fixed before Task 15 (its only consumer) was built:** `receivingBodyOrientation()` (Task 10) returns a *signed* angle — sign depends on which way the player is turned, magnitude indicates how open/closed the stance is. The `first_touch_closed_stance` fault rule does a plain `direction: 'below', threshold: 15` comparison, which only behaves correctly against a non-negative magnitude. Left as originally planned, a mirrored open stance (e.g. a large *negative* angle like -45°) would satisfy `-45 < 15` and get wrongly flagged as closed — the opposite of correct. Fixed at the source: Task 15's `computeSingleRepMetrics` now stores `Math.abs(...)` of the raw orientation value for the `orientation` metric key (with a comment explaining why), and the already-redundant `Math.abs()` in the alignment-score calculation was simplified since the value is now abs'd upstream. Documented the contract directly in `FAULT_RULES` too, both in the plan and in the already-committed Task 12 code, so it can't silently regress if this rule is ever touched again.

**Forward-looking notes from Task 12's code review, to keep in mind when building Tasks 13/15 (not blockers, no code changed here):** (1) `aggregateFaults([])` and "every metric came in under the confidence floor for every rep" produce the identical empty-array output, which Task 13 currently turns into the same "Clean session — no significant technique faults detected" copy either way — conflating genuine cleanliness with insufficient signal, which is exactly the thing this codebase's confidence-honesty principle exists to prevent. Worth tracking a coverage signal (share of reps/metrics that cleared the confidence floor) through to Task 13 so a low-coverage session gets a neutral "not enough signal" message instead. (2) `detectFaults`'s `Record<string, MetricResult>` signature means a metric-key typo at the Task 15 call site (this already happened once during authoring — `passing_direction_inconsistent` briefly pointed at the wrong key) fails completely silently, no error, just under-detection. Worth a dev-time sanity check when Task 15 wires up real calls to `detectFaults` per skill.

**Task 13 code-review fixes (applied to the implemented code, not re-transcribed here — the plan's Task 13 code block is now slightly behind the actual `generateFeedback.ts` and that's fine, treat the code as authoritative from this point forward):** 4 of the 12 coaching copy templates (`shooting_balance_wobble`, `shooting_landing_unstable`, `shooting_plant_inconsistent`, `passing_direction_inconsistent`) were diagnosis-only with no actionable directive, inconsistent with the other 8 — each now ends with a concrete cue, and a grammar fragment in `shooting_landing_unstable` was fixed. Also added an exhaustiveness test asserting every `FAULT_RULES` tag has both a `COPY_TEMPLATES` and `WIN_TEMPLATES` entry (exported both maps to make this testable), so a future fault added without matching copy fails loudly instead of leaking a raw tag string to the athlete.

**Task 14 code review, fixed:** `weakFootConfidence`'s `strongAvg <= 0` degenerate-denominator guard now has explicit test coverage for both sub-cases, and its `confidence` is correctly dropped to 0.3 (matching the `strongReps.length === 0` branch's precedent) instead of reporting a normal-looking confidence for a broken baseline. Two forward-looking notes, not acted on now: (1) `EWMA_ALPHA` is a single shared constant across all EWMA-blended attributes in Task 15 — reasonable for MVP since they're similarly-scaled/noisy signals, but `updateEwma` has no room for a per-attribute alpha later without a signature change; cheap to add an optional third parameter now if this is worth doing. (2) Task 15's `updateWeakFootConfidence` recomputes from an unbounded full-history query on every session save — fine at MVP scale, but not the most scalable pattern long-term (an incremental aggregate would scale better than full recompute).

**Task 15 fixes (code is now authoritative for `saveSessionResults.ts`/`RecordPage.tsx`, not re-transcribed here):** self-review caught and fixed a real data-corruption bug — `updateWeakFootConfidence` queried session history that already included the just-saved session, then manually pushed a *second* duplicate entry for it under a different score formula, double-counting every session's contribution to `weak_foot_confidence` from day one. Fixed by removing the redundant push. Code review then caught three more Important gaps in the core loop, all fixed: (1) `training_sessions.status` was set to `'complete'` as the very first write, before reps/feedback existed — a mid-pipeline failure left a row that looked done but wasn't, with no idempotency-safe retry path; now inserted as `'analyzing'`, flipped to `'complete'` only after everything succeeds, and downgraded to `'failed'` on any error, plus the Record screen now clears the selected file on error so a retry can't silently re-run the whole pipeline against stale state. (2) Video metadata loading had no `error` listener, so a corrupt/unsupported file would hang the UI on "Analyzing…" forever — fixed with a proper resolve/reject pattern. (3) `@mediapipe/tasks-vision` was bundled into the main app entry (594kB/172kB gzip, over Vite's warning threshold) — fixed by lazy-loading the Record route, restoring the main bundle to ~442kB/127kB gzip with MediaPipe in its own chunk.

**Task 16 fixes (code is now authoritative for these two screens):** the exact "stuck forever on a loading message" bug class Task 15 fixed on the write side (video load hang) reappeared on the read side — `FeedbackPage` discarded fetch errors and had no fallback for a nonexistent/RLS-denied session, so any failure rendered as an infinite "Loading feedback…". Worse, it never read the `status` lifecycle Task 15 built, so a `'failed'` session (real score, zero feedback rows — exactly the mid-pipeline-failure case that lifecycle exists to represent) rendered as a silently-empty feedback page, indistinguishable from genuine cleanliness. Both fixed: proper error/not-found state with a way back to `/home`, and explicit `'analyzing'`/`'failed'`/`'complete'` branches with appropriate messaging and recovery links. `HomePage` had the same swallowed-error gap (a failed fetch showed the "you have no sessions yet" empty state to a returning user, actively wrong messaging) — fixed the same way. 3 new tests added covering the error/failed/analyzing states.

**Task 17 backlog notes (no code changes, non-blocking):** `buildTrendTiles` computes `perSkillValues.length` (how many of the 3 skills fed a tile's average) and discards it — a tile built from just 1 skill looks identical to one built from all 3, the same "misleadingly confident number" problem `weakFootConfidence`'s tiered confidence exists to avoid. Fixable client-side with a `sampleSize` field, no schema change needed. The deeper version of this gap: `MetricResult.confidence` (computed throughout the analysis pipeline) never reaches `skill_scores` — `updateSkillScores`/`updateWeakFootConfidence` only persist `{ value }`, and the table has no confidence/sample-count column at all. That's a Task 1/14/15 architectural gap, not something Task 17 could fix alone — worth a `skill_scores.confidence` column in a future migration.

**Task 18 fixes and a bigger backlog item.** Fixed: a real, high-likelihood bug where a 4th plan item (3 category drills + a conditional weak-foot drill — common given live drill counts and typical weak-foot underuse) computed `target_day: 8`, violating the `plan_items` CHECK constraint and silently failing the whole batched insert, leaving users with a plan that has zero drills. Fixed with a capped `targetDayFor()` helper plus proper error-checking on that insert (which had been silently swallowing errors — the same root cause that let the target_day bug hide in the first place).

**Not fixed, tracked as a real follow-up:** code review found the "weekly" plan generator isn't actually weekly yet — `PlanPage`'s "does a plan exist" query has no `week_start` filter, so a user gets exactly one plan ever, shown forever, never regenerated. There's also a genuine UTC-conversion bug in the `weekStart` calculation (`toISOString()` after local-time `setDate`/`getDay()` can flip the stored date near local midnight depending on timezone offset) that's currently inert only because nothing re-reads `week_start` to gate regeneration — it becomes live the moment the week-filter gap is fixed. And there's no unique constraint on `plans(profile_id, week_start)`, so concurrent tabs could create duplicate plan rows. These three are one coherent gap (real weekly regeneration), not three unrelated ones, and worth a dedicated follow-up task before real users return in week 2.

**Task 19 fix — real privacy-claim gap, caught before shipping:** the "delete my data" confirm dialog promised to delete "your sessions, videos, scores, and plans," but the delete flow only ever removed DB rows — the uploaded video files in the `session-videos` Storage bucket were never touched, so the app's most sensitive data category (video of the player) silently survived a "permanent deletion." Fixed: the flow now lists and removes the user's video files from Storage first, checked with the same throw-on-error rigor as the three DB deletes, before signing out. Also added a `deleting` state disabling both buttons mid-flow. **Not fixed, left as a product decision, not an autonomous fix:** `window.confirm()` as the sole friction for an irreversible multi-table-plus-storage delete is thin for an action this severe (standard practice elsewhere is a typed confirmation phrase) — and the `profiles` row / account itself is never deleted, so "delete my data" leaves the account fully intact and re-usable, which is defensible given the dialog's literal wording but worth stating on-screen rather than leaving implicit. Both flagged for the product owner, not resolved here.

**Type consistency check:** verified that every cross-file call site (`analyzeSession` → `metrics.ts` functions, `saveSessionResults` → `analyzeSession`'s `SessionAnalysis` shape → the `rep_events`/`feedback_items`/`skill_scores` column names from Task 3's schema, `generatePlan` → `drills`/`plans`/`plan_items` columns) uses matching parameter order, field names, and types. No mismatches found beyond the two fixed inline above.

