/*
  One-shot setup for a fresh Supabase project.

  This is every file in ./migrations squashed into a single script, already in
  the correct order. Paste it into the Supabase SQL Editor
  (Dashboard -> SQL Editor -> New query) and run it once.

  Safe to re-run: every statement is idempotent.

  NOTE: this is the fresh-project script. If you already have data from before
  sign-in existed, do NOT run this — run the files in ./migrations in order, so
  20260810120000_add_auth_and_ownership.sql can hand your existing week to your
  account instead of leaving it ownerless.
*/

-- 1. Planners ---------------------------------------------------------------
-- One account can keep several planners (chores, study, …). Blocks and day
-- tags belong to a planner; recent colours stay per account.

CREATE TABLE IF NOT EXISTS planners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- The switcher lists one account's planners oldest-first.
CREATE INDEX IF NOT EXISTS planners_user_id_created_at_idx
  ON planners (user_id, created_at);

-- 2. People ---------------------------------------------------------------
-- Names you can tag on a block, per account. No sharing and no invites: a
-- person here is a multi-select option, not a user.

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz DEFAULT now()
);

-- "Marie" and "marie" are the same person.
CREATE UNIQUE INDEX IF NOT EXISTS people_user_id_name_idx ON people (user_id, lower(name));
CREATE INDEX IF NOT EXISTS people_user_id_created_at_idx ON people (user_id, created_at);

-- 3. Blocks -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS planner_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  planner_id uuid NOT NULL REFERENCES planners (id) ON DELETE CASCADE,
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
  -- Who is on this block. An array, not a join table: a repeating block is
  -- several rows rewritten day by day, and the array travels with the row.
  people uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT day_range_valid CHECK (day_start <= day_end),
  CONSTRAINT hour_range_valid CHECK (hour_start < hour_end)
);

CREATE INDEX IF NOT EXISTS planner_blocks_series_id_idx ON planner_blocks (series_id);
CREATE INDEX IF NOT EXISTS planner_blocks_user_id_idx ON planner_blocks (user_id);
CREATE INDEX IF NOT EXISTS planner_blocks_planner_id_idx ON planner_blocks (planner_id);
-- Deleting a person has to find every block mentioning them.
CREATE INDEX IF NOT EXISTS planner_blocks_people_idx ON planner_blocks USING gin (people);

-- 4. Day tags ---------------------------------------------------------------
-- One optional 'remote' / 'office' / 'free' tag per weekday index (0=Mon … 6=Sun),
-- per planner: a study week and a chores week each tag their own days.

CREATE TABLE IF NOT EXISTS day_tags (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  planner_id uuid NOT NULL REFERENCES planners (id) ON DELETE CASCADE,
  day int NOT NULL CHECK (day BETWEEN 0 AND 6),
  tag text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (planner_id, day)
);

-- Stated separately so the accepted values can widen without recreating the table.
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_check;
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_valid;
ALTER TABLE day_tags
  ADD CONSTRAINT day_tags_tag_valid CHECK (tag IN ('remote', 'office', 'free'));

-- 5. Recent colours ---------------------------------------------------------
-- The five most recently applied custom colours, kept per picker, per person.

CREATE TABLE IF NOT EXISTS recent_colors (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  color text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, color)
);

ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_kind_check;
ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_kind_valid;
ALTER TABLE recent_colors
  ADD CONSTRAINT recent_colors_kind_valid CHECK (kind IN ('block', 'text'));

CREATE INDEX IF NOT EXISTS recent_colors_kind_used_at_idx
  ON recent_colors (user_id, kind, used_at DESC);

-- 6. Security ---------------------------------------------------------------
-- Signed in, and only your own rows. The anon role gets nothing.

ALTER TABLE planners       ENABLE ROW LEVEL SECURITY;
ALTER TABLE people         ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_colors  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_planners_select" ON planners;
CREATE POLICY "own_planners_select" ON planners FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_planners_insert" ON planners;
CREATE POLICY "own_planners_insert" ON planners FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_planners_update" ON planners;
CREATE POLICY "own_planners_update" ON planners FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_planners_delete" ON planners;
CREATE POLICY "own_planners_delete" ON planners FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_people_select" ON people;
CREATE POLICY "own_people_select" ON people FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_people_insert" ON people;
CREATE POLICY "own_people_insert" ON people FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_people_update" ON people;
CREATE POLICY "own_people_update" ON people FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_people_delete" ON people;
CREATE POLICY "own_people_delete" ON people FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_blocks_select" ON planner_blocks;
CREATE POLICY "own_blocks_select" ON planner_blocks FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_blocks_insert" ON planner_blocks;
CREATE POLICY "own_blocks_insert" ON planner_blocks FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_blocks_update" ON planner_blocks;
CREATE POLICY "own_blocks_update" ON planner_blocks FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_blocks_delete" ON planner_blocks;
CREATE POLICY "own_blocks_delete" ON planner_blocks FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tags_select" ON day_tags;
CREATE POLICY "own_day_tags_select" ON day_tags FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tags_insert" ON day_tags;
CREATE POLICY "own_day_tags_insert" ON day_tags FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tags_update" ON day_tags;
CREATE POLICY "own_day_tags_update" ON day_tags FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tags_delete" ON day_tags;
CREATE POLICY "own_day_tags_delete" ON day_tags FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_recent_colors_select" ON recent_colors;
CREATE POLICY "own_recent_colors_select" ON recent_colors FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_recent_colors_insert" ON recent_colors;
CREATE POLICY "own_recent_colors_insert" ON recent_colors FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_recent_colors_update" ON recent_colors;
CREATE POLICY "own_recent_colors_update" ON recent_colors FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_recent_colors_delete" ON recent_colors;
CREATE POLICY "own_recent_colors_delete" ON recent_colors FOR DELETE
  TO authenticated USING (user_id = auth.uid());
