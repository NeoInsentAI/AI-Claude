-- Follow-up from Task 4 code review: prevent silent duplicate seeding on re-run.
alter table drills add constraint drills_category_title_key unique (category, title);
