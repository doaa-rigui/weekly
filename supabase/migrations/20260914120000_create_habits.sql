/*
# Habit tracker

The third app behind the one sign-in. Like the sleep log it stands alone:
nothing here references `planners` or `sleep_periods`, and nothing there
references this.

## The two modelling decisions

**1. A recurrence is a value, not a set of columns.**

`frequency` is `jsonb` holding one of three shapes, all of them small:

    { "kind": "weekly",   "weekdays": [0,1,2,3,4] }     -- Mon–Fri; 0 = Monday
    { "kind": "interval", "unit": "week", "every": 2, "weekdays": [2] }
    { "kind": "monthly",  "days": [1, 15] }

"Every day", "every Monday", "every weekday", "every weekend" are all the
first shape with a different set — which is why the UI can offer one named
schedule and one editor rather than a row of shortcuts standing in front of
the same three shapes. Columns would have meant a migration for every
recurrence the app learns to express, and a row of nulls for each of the ones
it already knows.

The app never trusts the shape blindly: `parseFrequency` in src/lib/habits.ts
falls back to daily on anything it does not recognise, so a hand-edited row
cannot break the Today page.

**2. A habit's day is a row only once it has been acted on.**

`habit_entries` holds a row per (habit, day) with a status of done / skipped /
undone. No row means *pending* — due today and not yet answered — which is the
state every habit starts each day in. Writing a "pending" row at midnight for
every habit would need a scheduler the app does not have, and would turn an
empty tracker into thousands of rows saying nothing happened.

This is also why `undone` is stored rather than inferred: "I did not do it" is
something the user says, optionally with a note explaining why, and that is a
different fact from "the day is not over yet".

`on_date` is a `date` in the user's own local reckoning, written by the client.
The alternative — a timestamp, bucketed by the server — would move a habit into
the wrong day for anyone who travels or logs something near midnight.

1. New Tables
- `habits`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading
  - `name` (text, not null)
  - `icon` (text, not null) — a key from ICONS in src/lib/habits.ts
  - `color` (text, not null) — hex, from the same file's swatches
  - `frequency` (jsonb, not null) — see above
  - `anchor_date` (date, not null) — what "every 2 weeks" counts from
  - `sort_order` (int, not null) — the order the user dragged them into
  - `created_at` (timestamptz)
- `habit_entries`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid())
  - `habit_id` (uuid, not null) — cascades, so deleting a habit takes its history
  - `on_date` (date, not null) — the user's local day
  - `status` (text, not null) — 'done' | 'skipped' | 'undone'
  - `note` (text, nullable) — only ever set on 'undone'; optional by design
  - `updated_at` (timestamptz)
  - unique on (`habit_id`, `on_date`) — one answer per habit per day

2. Security
- RLS on both tables, restricted to `user_id = auth.uid()` like every other
  table in this project.
*/

-- 1. The habits -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Sparkles',
  color text NOT NULL DEFAULT '#7073b5',
  frequency jsonb NOT NULL DEFAULT '{"kind":"weekly","weekdays":[0,1,2,3,4,5,6]}'::jsonb,
  -- What an interval recurrence counts from. Defaults to the day the habit was
  -- made, which is what "every 2 weeks, starting now" means.
  anchor_date date NOT NULL DEFAULT CURRENT_DATE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT habits_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- The list is always "one account's habits, in the order they were dragged
-- into". `created_at` breaks ties, so two habits sharing an order still come
-- back in a stable sequence rather than a random one.
CREATE INDEX IF NOT EXISTS habits_user_id_sort_order_idx
  ON habits (user_id, sort_order, created_at);

-- 2. The daily answers ------------------------------------------------------

CREATE TABLE IF NOT EXISTS habit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  on_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('done', 'skipped', 'undone')),
  note text,
  updated_at timestamptz DEFAULT now(),
  -- One answer per habit per day: marking it done twice is a correction, not a
  -- second entry. The upsert in the client relies on this.
  CONSTRAINT habit_entries_one_per_day UNIQUE (habit_id, on_date)
);

-- Today reads one day across every habit; Stats reads a date range. Both are
-- this index.
CREATE INDEX IF NOT EXISTS habit_entries_user_id_on_date_idx
  ON habit_entries (user_id, on_date DESC);

-- 3. Security ---------------------------------------------------------------

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE habit_entries ENABLE ROW LEVEL SECURITY;

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
