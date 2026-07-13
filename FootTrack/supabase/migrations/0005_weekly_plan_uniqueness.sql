-- Follow-up from Task 18's code review: without a uniqueness guarantee on (profile_id, week_start),
-- two concurrent PlanPage mounts (e.g. two browser tabs) could both see "no plan for this week" and
-- each insert one, silently duplicating plans and plan_items. generateWeeklyPlan now catches the
-- 23505 unique-violation this constraint raises and returns the winning row's id instead.
alter table plans add constraint plans_profile_week_key unique (profile_id, week_start);
