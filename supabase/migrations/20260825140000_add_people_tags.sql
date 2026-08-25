/*
# Tag people on blocks

Who is responsible for a block. Deliberately not sharing or inviting: a person
here is just a name on your own list, like a Notion multi-select option, so
tagging someone costs one click and no account.

The list is per-account rather than per-planner — the same people turn up in a
chores week and a study week — while the assignment lives on the block.

1. New Tables
- `people`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading
  - `name` (text, not null) — unique per account, case-insensitively, so
    typing a name that already exists picks it instead of adding a twin
  - `color` (text, not null) — the avatar colour, handed out by the app
  - `created_at` (timestamptz)

2. Modified Tables
- `planner_blocks`
  - `people` (uuid[], not null, default '{}') — who is on this block

  An array rather than a join table: a block that repeats is several rows
  sharing a `series_id`, and the edit panel rewrites those rows day by day. A
  join table would have to be reconciled on every one of those writes, whereas
  the array travels with the row it belongs to. The trade is no foreign key,
  so deleting a person strips their id from the blocks (see lib/people.ts) and
  the grid ignores any id it doesn't recognise.

3. Security
- RLS on `people`, restricted to `user_id = auth.uid()` like every other table.
*/

-- 1. The people -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz DEFAULT now()
);

-- "Marie" and "marie" are the same person.
CREATE UNIQUE INDEX IF NOT EXISTS people_user_id_name_idx ON people (user_id, lower(name));

-- The picker lists one account's people oldest-first.
CREATE INDEX IF NOT EXISTS people_user_id_created_at_idx ON people (user_id, created_at);

-- 2. Who is on a block ------------------------------------------------------

ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS people uuid[] NOT NULL DEFAULT '{}';

-- Deleting a person has to find every block mentioning them.
CREATE INDEX IF NOT EXISTS planner_blocks_people_idx ON planner_blocks USING gin (people);

-- 3. Security ---------------------------------------------------------------

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

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
