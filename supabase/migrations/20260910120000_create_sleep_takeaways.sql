/*
# Sleep takeaways

A standing list of what you have learned about your own sleep — "working out
helps me sleep better", "using my phone before bed makes it difficult to
sleep". Lessons, kept so they can be re-read and acted on.

## Why this is not a note on a sleep period

`sleep_periods.note` already exists, and it is a different thing: a note there
belongs to one night ("I was stressed today") and is only ever read next to that
night. A takeaway is about sleep in general, outlives every entry, and would be
lost the moment the night it happened to be written on was deleted.

So they are separate tables, and a takeaway references no period and no night.

## The one extra field

`effect` records whether the thing helps or hurts, because that is the shape
these observations actually take — the two examples above are one of each — and
it lets the list be scanned by colour rather than read end to end. It defaults
to `neutral`, so an observation that is neither is never forced into a side.

1. New Tables
- `sleep_takeaways`
  - `id` (uuid, pk)
  - `user_id` (uuid, not null, default auth.uid()) — owner, cascading
  - `text` (text, not null) — the lesson, in the user's own words
  - `effect` (text, not null, default 'neutral') — 'helps' | 'hurts' | 'neutral'
  - `created_at` (timestamptz) — what the list is ordered by

2. Security
- RLS on `sleep_takeaways`, restricted to `user_id = auth.uid()` like every
  other table in this project.
*/

-- 1. The takeaways ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS sleep_takeaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  text text NOT NULL,
  effect text NOT NULL DEFAULT 'neutral',
  created_at timestamptz DEFAULT now(),
  -- An empty takeaway says nothing, and the app trims before writing.
  CONSTRAINT sleep_takeaways_text_not_blank CHECK (length(btrim(text)) > 0),
  CONSTRAINT sleep_takeaways_effect_known CHECK (effect IN ('helps', 'hurts', 'neutral'))
);

-- The list is one account's takeaways, newest first.
CREATE INDEX IF NOT EXISTS sleep_takeaways_user_id_created_at_idx
  ON sleep_takeaways (user_id, created_at DESC);

-- 2. Security ---------------------------------------------------------------

ALTER TABLE sleep_takeaways ENABLE ROW LEVEL SECURITY;

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
