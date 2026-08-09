/*
# Add minute precision to planner blocks

The weekly planner previously stored only whole-hour start and end values.
This migration adds minute-based values so users can schedule at any minute,
including times such as 8:40 AM or 2:45 PM, without removing or renaming the
existing columns.

1. Modified Table
- `planner_blocks`
  - `start_minute` (integer, not null) — minutes after midnight for the start.
  - `end_minute` (integer, not null) — minutes after midnight for the end.
  - Existing `hour_start` and `hour_end` remain for compatibility and continue
    to store the corresponding rounded hour values.

2. Data Migration
- Existing rows are initialized from their current whole-hour values.
- No existing rows or columns are deleted.

3. Validation
- Start and end minutes must be between 0 and 1440.
- The end must be later than the start.

4. Security
- Existing RLS and anon/authenticated CRUD policies remain unchanged.
*/

ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS start_minute integer,
  ADD COLUMN IF NOT EXISTS end_minute integer;

UPDATE planner_blocks
SET
  start_minute = hour_start * 60,
  end_minute = hour_end * 60
WHERE start_minute IS NULL OR end_minute IS NULL;

ALTER TABLE planner_blocks
  ALTER COLUMN start_minute SET DEFAULT 0,
  ALTER COLUMN end_minute SET DEFAULT 60,
  ALTER COLUMN start_minute SET NOT NULL,
  ALTER COLUMN end_minute SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'start_minute_valid'
      AND conrelid = 'planner_blocks'::regclass
  ) THEN
    ALTER TABLE planner_blocks
      ADD CONSTRAINT start_minute_valid CHECK (start_minute BETWEEN 0 AND 1439);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'end_minute_valid'
      AND conrelid = 'planner_blocks'::regclass
  ) THEN
    ALTER TABLE planner_blocks
      ADD CONSTRAINT end_minute_valid CHECK (end_minute BETWEEN 1 AND 1440);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'minute_range_valid'
      AND conrelid = 'planner_blocks'::regclass
  ) THEN
    ALTER TABLE planner_blocks
      ADD CONSTRAINT minute_range_valid CHECK (start_minute < end_minute);
  END IF;
END $$;
