/*
# Let one account hold several planners

Until now an account had exactly one week: every block and day tag hung off
`user_id`, so there was nowhere to put a second planner. Blocks and tags now
hang off a `planner_id` instead, and a `planners` row names each one ("Chores",
"Study", …). `user_id` stays on both tables — RLS still checks it directly,
which keeps the policies from having to join through `planners`.

Day tags are per-planner: a study week and a chores week each get their own
Remote/Office/Free row per weekday. Recent colours stay per-account, since a
colour you just used is worth offering whichever planner you are in.

1. New Tables
- `planners`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading on
    account deletion
  - `name` (text, not null) — what the switcher shows
  - `created_at` (timestamptz) — also the switcher's sort order

2. Modified Tables
- `planner_blocks`, `day_tags`
  - `planner_id` (uuid, not null) — cascading, so deleting a planner takes its
    blocks and tags with it
- `day_tags` — primary key moves from (user_id, day) to (planner_id, day)

3. Data Migration
- Every existing account gets a planner named 'My Planner', and its blocks and
  tags are assigned to it, so the week already built survives untouched.

4. Security
- RLS on `planners`, restricted to `user_id = auth.uid()` like every other
  table. The existing block and tag policies are unchanged.
*/

-- 1. The planners themselves ------------------------------------------------

CREATE TABLE IF NOT EXISTS planners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- The switcher lists one account's planners oldest-first.
CREATE INDEX IF NOT EXISTS planners_user_id_created_at_idx
  ON planners (user_id, created_at);

-- 2. Point blocks and tags at a planner -------------------------------------

ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS planner_id uuid REFERENCES planners (id) ON DELETE CASCADE;
ALTER TABLE day_tags
  ADD COLUMN IF NOT EXISTS planner_id uuid REFERENCES planners (id) ON DELETE CASCADE;

-- 3. Hand the existing week to a first planner ------------------------------
-- Every account gets one, whether or not it has rows yet, so the app never
-- has to open on an empty switcher.

INSERT INTO planners (user_id, name)
SELECT u.id, 'My Planner'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM planners p WHERE p.user_id = u.id);

UPDATE planner_blocks b
SET planner_id = (
  SELECT p.id FROM planners p
  WHERE p.user_id = b.user_id
  ORDER BY p.created_at, p.id
  LIMIT 1
)
WHERE b.planner_id IS NULL;

UPDATE day_tags t
SET planner_id = (
  SELECT p.id FROM planners p
  WHERE p.user_id = t.user_id
  ORDER BY p.created_at, p.id
  LIMIT 1
)
WHERE t.planner_id IS NULL;

ALTER TABLE planner_blocks ALTER COLUMN planner_id SET NOT NULL;
ALTER TABLE day_tags       ALTER COLUMN planner_id SET NOT NULL;

-- 4. Keys and indexes -------------------------------------------------------
-- A weekday tag is unique per planner now, not per account.

ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_pkey;
ALTER TABLE day_tags ADD CONSTRAINT day_tags_pkey PRIMARY KEY (planner_id, day);

CREATE INDEX IF NOT EXISTS planner_blocks_planner_id_idx ON planner_blocks (planner_id);

-- 5. Security ---------------------------------------------------------------

ALTER TABLE planners ENABLE ROW LEVEL SECURITY;

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
