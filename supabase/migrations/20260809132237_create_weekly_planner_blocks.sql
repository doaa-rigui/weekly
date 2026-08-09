/*
# Create planner_blocks table (single-tenant, no auth)

This app is a reusable weekly planner: a 7-day x 24-hour grid
that is NOT tied to any specific date, month, or year. Users draw
blocks (events/activities) onto the grid by dragging, then give each
block a title and a color. The same plan can be applied to any week.

1. New Tables
- `planner_blocks`
  - `id` (uuid, primary key)
  - `title` (text, not null) — user label for the block, e.g. "Workout"
  - `color` (text, not null) — a hex color string, e.g. "#2563eb"
  - `day_start` (int, 0-6, not null) — first day index (0=Mon … 6=Sun)
  - `day_end` (int, 0-6, not null) — last day index (inclusive)
  - `hour_start` (int, 0-23, not null) — starting hour (inclusive)
  - `hour_end` (int, 0-24, not null) — ending hour (exclusive, so 24 = end of day)
  - `created_at` (timestamptz, default now())
  - Constraint: day_start <= day_end, hour_start < hour_end

2. Security
- Enable RLS on `planner_blocks`.
- Single-tenant / no-auth: allow anon + authenticated full CRUD.
  The data is intentionally shared/public (no sign-in screen).
*/

CREATE TABLE IF NOT EXISTS planner_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  day_start int NOT NULL CHECK (day_start BETWEEN 0 AND 6),
  day_end int NOT NULL CHECK (day_end BETWEEN 0 AND 6),
  hour_start int NOT NULL CHECK (hour_start BETWEEN 0 AND 23),
  hour_end int NOT NULL CHECK (hour_end BETWEEN 1 AND 24),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT day_range_valid CHECK (day_start <= day_end),
  CONSTRAINT hour_range_valid CHECK (hour_start < hour_end)
);

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
