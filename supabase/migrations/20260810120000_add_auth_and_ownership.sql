/*
# Give every row an owner and lock the tables to that owner

Until now the app had no sign-in: the anon key could read and write every
row, so anyone with the URL shared one week. Each table gains a `user_id`
and its policies change from "anon may do anything" to "you may only touch
your own rows".

## Run order matters

Sign up in the app BEFORE running this file. The existing week has no owner
yet, and this migration hands it to the oldest account in `auth.users` — so
that account has to exist first. If no account exists and there is data to
assign, the migration aborts rather than guessing or deleting.

1. Modified Tables
- `planner_blocks`, `day_tags`, `recent_colors`
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading on
    account deletion. The default means inserts never have to send it.
- `day_tags` — primary key widens from (day) to (user_id, day); two people
  must be able to tag the same weekday.
- `recent_colors` — primary key widens from (kind, color) to
  (user_id, kind, color), for the same reason.

2. Data Migration
- Existing rows are assigned to the oldest account, preserving the week that
  was built before sign-in existed.

3. Security
- RLS policies replaced: `authenticated` only, and every one of them
  restricted to `user_id = auth.uid()`. The anon role loses all access.
*/

-- 1. Ownership column -------------------------------------------------------

ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;
ALTER TABLE day_tags
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;
ALTER TABLE recent_colors
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Inserts from the app never need to send user_id.
ALTER TABLE planner_blocks ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE day_tags ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE recent_colors ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Hand the pre-auth data to the first account ----------------------------

DO $$
DECLARE
  owner_id uuid;
  orphans boolean;
BEGIN
  SELECT id INTO owner_id FROM auth.users ORDER BY created_at LIMIT 1;

  SELECT
    EXISTS (SELECT 1 FROM planner_blocks WHERE user_id IS NULL)
    OR EXISTS (SELECT 1 FROM day_tags WHERE user_id IS NULL)
    OR EXISTS (SELECT 1 FROM recent_colors WHERE user_id IS NULL)
  INTO orphans;

  IF owner_id IS NULL AND orphans THEN
    RAISE EXCEPTION
      'No account exists yet, so the existing week has nobody to belong to. Sign up in the app first, then re-run this migration.';
  END IF;

  IF owner_id IS NOT NULL THEN
    UPDATE planner_blocks SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE day_tags       SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE recent_colors  SET user_id = owner_id WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE planner_blocks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE day_tags       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recent_colors  ALTER COLUMN user_id SET NOT NULL;

-- 3. Keys and indexes -------------------------------------------------------
-- A weekday tag and a remembered colour are unique per person, not globally.

ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_pkey;
ALTER TABLE day_tags ADD CONSTRAINT day_tags_pkey PRIMARY KEY (user_id, day);

ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_pkey;
ALTER TABLE recent_colors
  ADD CONSTRAINT recent_colors_pkey PRIMARY KEY (user_id, kind, color);

CREATE INDEX IF NOT EXISTS planner_blocks_user_id_idx ON planner_blocks (user_id);

-- 4. Security ---------------------------------------------------------------
-- Out with the shared-everything policies.

DROP POLICY IF EXISTS "anon_select_blocks" ON planner_blocks;
DROP POLICY IF EXISTS "anon_insert_blocks" ON planner_blocks;
DROP POLICY IF EXISTS "anon_update_blocks" ON planner_blocks;
DROP POLICY IF EXISTS "anon_delete_blocks" ON planner_blocks;

DROP POLICY IF EXISTS "anon_select_day_tags" ON day_tags;
DROP POLICY IF EXISTS "anon_insert_day_tags" ON day_tags;
DROP POLICY IF EXISTS "anon_update_day_tags" ON day_tags;
DROP POLICY IF EXISTS "anon_delete_day_tags" ON day_tags;

DROP POLICY IF EXISTS "anon_select_recent_colors" ON recent_colors;
DROP POLICY IF EXISTS "anon_insert_recent_colors" ON recent_colors;
DROP POLICY IF EXISTS "anon_update_recent_colors" ON recent_colors;
DROP POLICY IF EXISTS "anon_delete_recent_colors" ON recent_colors;

ALTER TABLE planner_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_colors  ENABLE ROW LEVEL SECURITY;

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
