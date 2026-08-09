/*
# Per-block text colour, and a short list of recently used custom colours

Blocks were always drawn with white text, which is unreadable on a light
background colour. The text colour becomes a per-block value, defaulting to
white so every existing block looks exactly as it did.

Separately, custom colours picked from the colour input were lost as soon as
the panel closed. The five most recent are now kept per picker, so 'block'
and 'text' each keep their own list — otherwise the black and white picked
for text would quickly push every block colour out.

1. Modified Table
- `planner_blocks`
  - `text_color` (text, not null, default '#ffffff') — hex colour for the
    block's label. Existing rows keep white.

2. New Tables
- `recent_colors`
  - `kind` (text) — which picker the colour came from: 'block' or 'text'
  - `color` (text) — the hex value
  - `used_at` (timestamptz, default now()) — last time it was applied
  - Primary key (kind, color), so re-using a colour refreshes it in place
    instead of adding a duplicate.

3. Security
- Enable RLS on `recent_colors`, matching the other tables: anon +
  authenticated get full CRUD.
*/

ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS text_color text NOT NULL DEFAULT '#ffffff';

CREATE TABLE IF NOT EXISTS recent_colors (
  kind text NOT NULL,
  color text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, color)
);

-- Named separately so the set of pickers can widen without recreating the table.
ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_kind_check;
ALTER TABLE recent_colors DROP CONSTRAINT IF EXISTS recent_colors_kind_valid;
ALTER TABLE recent_colors
  ADD CONSTRAINT recent_colors_kind_valid CHECK (kind IN ('block', 'text'));

-- The app reads these newest-first and trims past the fifth.
CREATE INDEX IF NOT EXISTS recent_colors_kind_used_at_idx
  ON recent_colors (kind, used_at DESC);

ALTER TABLE recent_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recent_colors" ON recent_colors;
CREATE POLICY "anon_select_recent_colors" ON recent_colors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recent_colors" ON recent_colors;
CREATE POLICY "anon_insert_recent_colors" ON recent_colors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recent_colors" ON recent_colors;
CREATE POLICY "anon_update_recent_colors" ON recent_colors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recent_colors" ON recent_colors;
CREATE POLICY "anon_delete_recent_colors" ON recent_colors FOR DELETE
  TO anon, authenticated USING (true);
