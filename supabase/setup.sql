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
  -- How many day columns the grid draws: a week, a fortnight, whatever fits.
  day_count int NOT NULL DEFAULT 7 CHECK (day_count BETWEEN 1 AND 31),
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
  day_start int NOT NULL CHECK (day_start BETWEEN 0 AND 30),
  day_end int NOT NULL CHECK (day_end BETWEEN 0 AND 30),
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
-- Each planner writes its own tags — Remote / Office / Free for a work week,
-- Deep clean / Restock / Reset for a chores one — and a day carries at most
-- one of them.

CREATE TABLE IF NOT EXISTS day_tag_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  planner_id uuid NOT NULL REFERENCES planners (id) ON DELETE CASCADE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- "Reset" and "reset" are the same tag.
CREATE UNIQUE INDEX IF NOT EXISTS day_tag_options_planner_label_idx
  ON day_tag_options (planner_id, lower(label));
CREATE INDEX IF NOT EXISTS day_tag_options_planner_sort_idx
  ON day_tag_options (planner_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS day_tags (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  planner_id uuid NOT NULL REFERENCES planners (id) ON DELETE CASCADE,
  day int NOT NULL CHECK (day BETWEEN 0 AND 30),
  -- Cascading, so deleting a tag clears it off the days that carried it.
  option_id uuid NOT NULL REFERENCES day_tag_options (id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (planner_id, day)
);

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

-- 6. Sleep periods ----------------------------------------------------------
-- The sleep tracker, which stands apart from the planners: one row is one
-- continuous stretch of sleep. A *night* is a group of these rows and is
-- derived, not stored, so waking for Fajr and going back to sleep reads as two
-- periods of one night (see src/lib/sleep.ts).

CREATE TABLE IF NOT EXISTS sleep_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  -- A period with no duration, or a negative one, has nothing to visualise.
  CONSTRAINT sleep_periods_ends_after_start CHECK (ended_at > started_at)
);

-- Every read is "one account's periods, newest first, since a cutoff".
CREATE INDEX IF NOT EXISTS sleep_periods_user_id_started_at_idx
  ON sleep_periods (user_id, started_at DESC);

-- 7. Sleep takeaways --------------------------------------------------------
-- What you have learned about your own sleep, kept apart from the nightly log:
-- a note on a sleep period belongs to one night, a takeaway is a standing
-- lesson that outlives every entry.

CREATE TABLE IF NOT EXISTS sleep_takeaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  text text NOT NULL,
  -- Whether the thing helps or hurts, so the list can be scanned by colour.
  effect text NOT NULL DEFAULT 'neutral',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT sleep_takeaways_text_not_blank CHECK (length(btrim(text)) > 0),
  CONSTRAINT sleep_takeaways_effect_known CHECK (effect IN ('helps', 'hurts', 'neutral'))
);

-- The list is one account's takeaways, newest first.
CREATE INDEX IF NOT EXISTS sleep_takeaways_user_id_created_at_idx
  ON sleep_takeaways (user_id, created_at DESC);

-- 8. Habits -----------------------------------------------------------------
-- The habit tracker. A recurrence is a jsonb value rather than a set of
-- columns, so a new kind of schedule costs no migration; see
-- supabase/migrations/20260914120000_create_habits.sql for the shapes.

CREATE TABLE IF NOT EXISTS habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Sparkles',
  color text NOT NULL DEFAULT '#7073b5',
  frequency jsonb NOT NULL DEFAULT '{"kind":"weekly","weekdays":[0,1,2,3,4,5,6]}'::jsonb,
  anchor_date date NOT NULL DEFAULT CURRENT_DATE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT habits_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS habits_user_id_sort_order_idx
  ON habits (user_id, sort_order, created_at);

-- 9. Habit entries ----------------------------------------------------------
-- One answer per habit per day. No row means the day is still pending: an
-- "undone" is something the user said, not the absence of a "done".

CREATE TABLE IF NOT EXISTS habit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  on_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('done', 'skipped', 'undone')),
  note text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT habit_entries_one_per_day UNIQUE (habit_id, on_date)
);

CREATE INDEX IF NOT EXISTS habit_entries_user_id_on_date_idx
  ON habit_entries (user_id, on_date DESC);

-- 10. Security ---------------------------------------------------------------
-- Signed in, and only your own rows. The anon role gets nothing.

ALTER TABLE planners       ENABLE ROW LEVEL SECURITY;
ALTER TABLE people         ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_tag_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_colors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_periods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_takeaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_entries  ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "own_day_tag_options_select" ON day_tag_options;
CREATE POLICY "own_day_tag_options_select" ON day_tag_options FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tag_options_insert" ON day_tag_options;
CREATE POLICY "own_day_tag_options_insert" ON day_tag_options FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tag_options_update" ON day_tag_options;
CREATE POLICY "own_day_tag_options_update" ON day_tag_options FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_day_tag_options_delete" ON day_tag_options;
CREATE POLICY "own_day_tag_options_delete" ON day_tag_options FOR DELETE
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

DROP POLICY IF EXISTS "own_sleep_select" ON sleep_periods;
CREATE POLICY "own_sleep_select" ON sleep_periods FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_sleep_insert" ON sleep_periods;
CREATE POLICY "own_sleep_insert" ON sleep_periods FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_sleep_update" ON sleep_periods;
CREATE POLICY "own_sleep_update" ON sleep_periods FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_sleep_delete" ON sleep_periods;
CREATE POLICY "own_sleep_delete" ON sleep_periods FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_takeaways_select" ON sleep_takeaways;
CREATE POLICY "own_takeaways_select" ON sleep_takeaways FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_takeaways_insert" ON sleep_takeaways;
CREATE POLICY "own_takeaways_insert" ON sleep_takeaways FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_takeaways_update" ON sleep_takeaways;
CREATE POLICY "own_takeaways_update" ON sleep_takeaways FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_takeaways_delete" ON sleep_takeaways;
CREATE POLICY "own_takeaways_delete" ON sleep_takeaways FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habits_select" ON habits;
CREATE POLICY "own_habits_select" ON habits FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habits_insert" ON habits;
CREATE POLICY "own_habits_insert" ON habits FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habits_update" ON habits;
CREATE POLICY "own_habits_update" ON habits FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habits_delete" ON habits;
CREATE POLICY "own_habits_delete" ON habits FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habit_entries_select" ON habit_entries;
CREATE POLICY "own_habit_entries_select" ON habit_entries FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habit_entries_insert" ON habit_entries;
CREATE POLICY "own_habit_entries_insert" ON habit_entries FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habit_entries_update" ON habit_entries;
CREATE POLICY "own_habit_entries_update" ON habit_entries FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own_habit_entries_delete" ON habit_entries;
CREATE POLICY "own_habit_entries_delete" ON habit_entries FOR DELETE
  TO authenticated USING (user_id = auth.uid());
