-- Follow-up from Task 8 code review: the geometry primitive behind body-lean detection is
-- direction-agnostic (measures magnitude off vertical, not which way). The original
-- "shooting_lean_back" tag/copy claimed a direction the sensor can't actually see.
-- Renamed to shooting_torso_lean and the drill's objective updated to match.
update drills
set objective = 'Build a stable, upright torso through contact',
    targets_fault_tags = '{shooting_torso_lean}'
where title = 'Chest-Over-Ball Finishes';
