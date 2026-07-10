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
