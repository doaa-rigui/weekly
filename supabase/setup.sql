/*
  One-shot setup for a fresh Supabase project.

  This is the three files in ./migrations squashed into a single script,
  already in the correct order. Paste it into the Supabase SQL Editor
  (Dashboard -> SQL Editor -> New query) and run it once.

  Safe to re-run: every statement is idempotent.
*/

-- 1. Table ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS planner_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  day_start int NOT NULL CHECK (day_start BETWEEN 0 AND 6),
  day_end int NOT NULL CHECK (day_end BETWEEN 0 AND 6),
  hour_start int CHECK (hour_start BETWEEN 0 AND 23),
  hour_end int CHECK (hour_end BETWEEN 1 AND 24),
  start_minute int NOT NULL DEFAULT 0,
  end_minute int NOT NULL DEFAULT 60,
  series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  text_color text NOT NULL DEFAULT '#ffffff',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT day_range_valid CHECK (day_start <= day_end),
  CONSTRAINT hour_range_valid CHECK (hour_start < hour_end)
);

-- Columns, in case the table already existed from an older revision.
ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS start_minute int,
  ADD COLUMN IF NOT EXISTS end_minute int,
  ADD COLUMN IF NOT EXISTS series_id uuid,
  ADD COLUMN IF NOT EXISTS text_color text NOT NULL DEFAULT '#ffffff';

-- Rows sharing a series_id are one repeat of the same block across days.
UPDATE planner_blocks SET series_id = gen_random_uuid() WHERE series_id IS NULL;

ALTER TABLE planner_blocks
  ALTER COLUMN series_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN series_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS planner_blocks_series_id_idx ON planner_blocks (series_id);

UPDATE planner_blocks
SET start_minute = hour_start * 60,
    end_minute   = hour_end * 60
WHERE start_minute IS NULL OR end_minute IS NULL;

ALTER TABLE planner_blocks
  ALTER COLUMN start_minute SET DEFAULT 0,
  ALTER COLUMN end_minute   SET DEFAULT 60,
  ALTER COLUMN start_minute SET NOT NULL,
  ALTER COLUMN end_minute   SET NOT NULL;

-- The app writes minutes; the legacy hour columns are derived and optional.
ALTER TABLE planner_blocks ALTER COLUMN hour_start DROP NOT NULL;
ALTER TABLE planner_blocks ALTER COLUMN hour_end   DROP NOT NULL;

-- 2. Constraints ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'start_minute_valid' AND conrelid = 'planner_blocks'::regclass
  ) THEN
    ALTER TABLE planner_blocks
      ADD CONSTRAINT start_minute_valid CHECK (start_minute BETWEEN 0 AND 1439);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'end_minute_valid' AND conrelid = 'planner_blocks'::regclass
  ) THEN
    ALTER TABLE planner_blocks
      ADD CONSTRAINT end_minute_valid CHECK (end_minute BETWEEN 1 AND 1440);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'minute_range_valid' AND conrelid = 'planner_blocks'::regclass
  ) THEN
    ALTER TABLE planner_blocks
      ADD CONSTRAINT minute_range_valid CHECK (start_minute < end_minute);
  END IF;
END $$;

-- 3. Day tags ---------------------------------------------------------------
-- One optional 'remote' / 'office' / 'free' tag per weekday index (0=Mon … 6=Sun).

CREATE TABLE IF NOT EXISTS day_tags (
  day int PRIMARY KEY CHECK (day BETWEEN 0 AND 6),
  tag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Stated separately so the accepted values can widen without recreating the table.
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_check;
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_valid;
ALTER TABLE day_tags
  ADD CONSTRAINT day_tags_tag_valid CHECK (tag IN ('remote', 'office', 'free'));

-- 3b. Recent colours --------------------------------------------------------
-- The five most recently applied custom colours, kept per picker.

CREATE TABLE IF NOT EXISTS recent_colors (
  kind text NOT NULL,
  color text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, color)
);

ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_kind_check;
ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_kind_valid;
ALTER TABLE recent_colors
  ADD CONSTRAINT recent_colors_kind_valid CHECK (kind IN ('block', 'text'));

CREATE INDEX IF NOT EXISTS recent_colors_kind_used_at_idx
  ON recent_colors (kind, used_at DESC);

-- 4. Security ---------------------------------------------------------------
-- Single-tenant, no sign-in screen: anon gets full CRUD on purpose.

ALTER TABLE planner_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_blocks" ON planner_blocks;
CREATE POLICY "anon_select_blocks" ON planner_blocks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blocks" ON planner_blocks;
CREATE POLICY "anon_insert_blocks" ON planner_blocks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_blocks" ON planner_blocks;
CREATE POLICY "anon_update_blocks" ON planner_blocks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blocks" ON planner_blocks;
CREATE POLICY "anon_delete_blocks" ON planner_blocks FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE day_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_day_tags" ON day_tags;
CREATE POLICY "anon_select_day_tags" ON day_tags FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_day_tags" ON day_tags;
CREATE POLICY "anon_insert_day_tags" ON day_tags FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_day_tags" ON day_tags;
CREATE POLICY "anon_update_day_tags" ON day_tags FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_day_tags" ON day_tags;
CREATE POLICY "anon_delete_day_tags" ON day_tags FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE recent_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recent_colors" ON recent_colors;
CREATE POLICY "anon_select_recent_colors" ON recent_colors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recent_colors" ON recent_colors;
CREATE POLICY "anon_insert_recent_colors" ON recent_colors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recent_colors" ON recent_colors;
CREATE POLICY "anon_update_recent_colors" ON recent_colors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recent_colors" ON recent_colors;
CREATE POLICY "anon_delete_recent_colors" ON recent_colors FOR DELETE
  TO anon, authenticated USING (true);
