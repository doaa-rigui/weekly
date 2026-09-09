/*
# Sleep tracker

A sleep log that sits beside the planners rather than inside one: nothing here
references `planners`, and nothing in the planner references this.

## The one modelling decision

A **night** is not a row. A row is a single **sleep period** — one continuous
stretch of being asleep. A night is the group of periods that belong together,
which matters because waking for Fajr and going back to sleep is two periods of
one night, not two nights:

    22:38 -> 05:30   period 1
    05:30 -> 06:00   awake (Fajr) — not stored, it is the gap between rows
    06:00 -> 07:00   period 2

The grouping is *derived*, not stored (see `nightKeyOf` in src/lib/sleep.ts): a
period starting before local noon belongs to the previous evening's night. That
keeps the rule in one place and lets it be corrected later without a migration
to rewrite every row — which a stored `night_date` column would need.

Times are `timestamptz`. The app renders them in the browser's zone, so a night
reads back with the wall-clock times it was entered with.

1. New Tables
- `sleep_periods`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading
  - `started_at` (timestamptz, not null) — fell asleep
  - `ended_at` (timestamptz, not null) — woke up; must be after `started_at`
  - `note` (text, nullable) — "had coffee too late"; optional by design
  - `created_at` (timestamptz)

2. Security
- RLS on `sleep_periods`, restricted to `user_id = auth.uid()` like every
  other table in this project.
*/

-- 1. The periods ------------------------------------------------------------

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

-- 2. Security ---------------------------------------------------------------

ALTER TABLE sleep_periods ENABLE ROW LEVEL SECURITY;

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
