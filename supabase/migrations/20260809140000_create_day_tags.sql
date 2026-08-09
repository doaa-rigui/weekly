/*
# Tag each weekday as remote or office

The planner is a reusable week template, so a tag belongs to a day *index*
(0=Mon … 6=Sun) rather than to a calendar date. At most one tag per day, so
the day index is the primary key and the app upserts on it. Removing a tag
deletes the row instead of storing a third "none" value.

1. New Tables
- `day_tags`
  - `day` (int, primary key, 0-6) — day index, 0=Mon … 6=Sun
  - `tag` (text, not null) — either 'remote' or 'office'
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `day_tags`.
- Single-tenant / no-auth, matching `planner_blocks`: allow anon +
  authenticated full CRUD.
*/

CREATE TABLE IF NOT EXISTS day_tags (
  day int PRIMARY KEY CHECK (day BETWEEN 0 AND 6),
  tag text NOT NULL CHECK (tag IN ('remote', 'office')),
  created_at timestamptz DEFAULT now()
);

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
