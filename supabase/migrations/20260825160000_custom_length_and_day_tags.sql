/*
# Planners of any length, with their own day tags

Two things were hardcoded to one week of office life: the grid was always seven
columns, and a day could only be tagged Remote, Office or Free. A chores
planner wants neither — it might run a fortnight and tag days Deep clean,
Restock, Reset.

1. New Tables
- `day_tag_options`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading
  - `planner_id` (uuid, not null) — the tags belong to one planner, cascading
  - `label` (text, not null) — unique per planner, case-insensitively
  - `color` (text, not null) — the pill colour, handed out by the app
  - `sort_order` (int, not null) — the order the picker lists them in
  - `created_at` (timestamptz)

2. Modified Tables
- `planners`
  - `day_count` (int, not null, default 7) — how many columns the grid draws,
    1 to 31. Existing planners stay at a week.
- `planner_blocks` — `day_start` / `day_end` may now reach 30, not just 6
- `day_tags`
  - `option_id` (uuid, not null) — which of the planner's tags this is,
    replacing the old fixed `tag` text. Cascades, so deleting a tag from a
    planner clears it off the days that carried it.
  - `day` may now reach 30
  - `tag` is dropped, along with the check that pinned it to three values

3. Data Migration
- Every existing planner gets Remote, Office and Free as its own three tag
  options, and the days already tagged are pointed at them. Nothing visible
  changes for a week planner that was already in use.

4. Security
- RLS on `day_tag_options`, restricted to `user_id = auth.uid()`.
*/

-- 1. How long a planner runs ------------------------------------------------

ALTER TABLE planners
  ADD COLUMN IF NOT EXISTS day_count int NOT NULL DEFAULT 7;

ALTER TABLE planners DROP CONSTRAINT IF EXISTS planners_day_count_valid;
ALTER TABLE planners
  ADD CONSTRAINT planners_day_count_valid CHECK (day_count BETWEEN 1 AND 31);

-- Blocks and tags can now sit on any of those days. The old bounds came from
-- inline column checks, which Postgres named for us — and the name differs
-- depending on which script created the table, so they are looked up by what
-- they constrain rather than by name. A stale 0..6 check left in place would
-- reject every day past the first week.

DO $$
DECLARE
  victim record;
BEGIN
  FOR victim IN
    SELECT c.conrelid::regclass AS table_name, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('planner_blocks'::regclass, 'day_tags'::regclass)
      -- Only the single-column day bounds; day_start <= day_end still holds.
      AND pg_get_constraintdef(c.oid) LIKE '%BETWEEN 0 AND 6%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', victim.table_name, victim.conname);
  END LOOP;
END $$;

ALTER TABLE planner_blocks DROP CONSTRAINT IF EXISTS planner_blocks_day_start_valid;
ALTER TABLE planner_blocks DROP CONSTRAINT IF EXISTS planner_blocks_day_end_valid;
ALTER TABLE planner_blocks
  ADD CONSTRAINT planner_blocks_day_start_valid CHECK (day_start BETWEEN 0 AND 30);
ALTER TABLE planner_blocks
  ADD CONSTRAINT planner_blocks_day_end_valid CHECK (day_end BETWEEN 0 AND 30);

ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_day_valid;
ALTER TABLE day_tags
  ADD CONSTRAINT day_tags_day_valid CHECK (day BETWEEN 0 AND 30);

-- 2. A planner's own tags ---------------------------------------------------

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

-- 3. Point the tagged days at those options ---------------------------------

ALTER TABLE day_tags
  ADD COLUMN IF NOT EXISTS option_id uuid REFERENCES day_tag_options (id) ON DELETE CASCADE;

DO $$
BEGIN
  -- Only worth doing while the old text column is still here.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'day_tags' AND column_name = 'tag'
  ) THEN
    -- Give every existing planner the three tags it used to have built in.
    INSERT INTO day_tag_options (user_id, planner_id, label, color, sort_order)
    SELECT p.user_id, p.id, d.label, d.color, d.sort_order
    FROM planners p
    CROSS JOIN (
      VALUES ('Remote', '#059669', 0), ('Office', '#4f46e5', 1), ('Free', '#d97706', 2)
    ) AS d(label, color, sort_order)
    ON CONFLICT DO NOTHING;

    UPDATE day_tags t
    SET option_id = o.id
    FROM day_tag_options o
    WHERE o.planner_id = t.planner_id
      AND lower(o.label) = lower(t.tag)
      AND t.option_id IS NULL;

    -- A tag value outside those three has nowhere to go; the day loses it
    -- rather than the migration failing.
    DELETE FROM day_tags WHERE option_id IS NULL;
  END IF;
END $$;

ALTER TABLE day_tags ALTER COLUMN option_id SET NOT NULL;

ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_valid;
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_check;
ALTER TABLE day_tags DROP COLUMN IF EXISTS tag;

-- 4. Security ---------------------------------------------------------------

ALTER TABLE day_tag_options ENABLE ROW LEVEL SECURITY;

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
