/*
# Make legacy hour columns nullable on planner_blocks

The app now stores block times as `start_minute` / `end_minute` (minutes from
midnight) for sub-hour precision. The older `hour_start` / `hour_end` columns
are still NOT NULL with no default, so new inserts that omit them fail with
"null value in column hour_start violates not-null constraint".

1. Modified Table
- `planner_blocks`
  - `hour_start` — relaxed from NOT NULL to nullable. Existing values retained.
  - `hour_end`   — relaxed from NOT NULL to nullable. Existing values retained.
  No data is deleted or rewritten; only the null constraint is dropped.

2. Security
- RLS and existing policies are unchanged.
*/

ALTER TABLE planner_blocks
  ALTER COLUMN hour_start DROP NOT NULL;

ALTER TABLE planner_blocks
  ALTER COLUMN hour_end DROP NOT NULL;
