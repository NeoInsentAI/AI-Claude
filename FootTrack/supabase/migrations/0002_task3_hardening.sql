-- Follow-up hardening from Task 3 code review: FK indexes (RLS subquery + cascade-delete performance)
-- and pinning search_path / revoking public EXECUTE on the SECURITY DEFINER trigger function.

create index if not exists idx_training_sessions_profile_id on training_sessions(profile_id);
create index if not exists idx_rep_events_session_id       on rep_events(session_id);
create index if not exists idx_skill_scores_profile_id     on skill_scores(profile_id);
create index if not exists idx_plans_profile_id            on plans(profile_id);
create index if not exists idx_plan_items_plan_id          on plan_items(plan_id);
create index if not exists idx_plan_items_drill_id         on plan_items(drill_id);
create index if not exists idx_feedback_items_session_id   on feedback_items(session_id);
create index if not exists idx_feedback_items_drill_id     on feedback_items(drill_id);

alter function public.handle_new_user() set search_path = '';
revoke all on function public.handle_new_user() from public;
-- Supabase grants EXECUTE on public-schema functions to anon/authenticated directly (not just via PUBLIC),
-- so the PUBLIC revoke above doesn't fully close this off — revoke from those roles explicitly too.
revoke execute on function public.handle_new_user() from anon, authenticated;
