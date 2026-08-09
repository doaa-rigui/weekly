/*
# Allow a 'free' day tag

Weekends and holidays need a third option alongside 'remote' and 'office'.
Only the CHECK constraint changes — the column, existing rows, and RLS
policies are untouched.

1. Modified Table
- `day_tags`
  - `tag` — accepted values widen from ('remote', 'office') to
    ('remote', 'office', 'free'). No existing row is affected, since every
    stored value is still valid under the wider constraint.

2. Security
- RLS and existing policies are unchanged.
*/

-- The original constraint was created inline, so Postgres auto-named it
-- day_tags_tag_check. Drop either name, then re-add explicitly named.
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_check;
ALTER TABLE day_tags DROP CONSTRAINT IF EXISTS day_tags_tag_valid;

ALTER TABLE day_tags
  ADD CONSTRAINT day_tags_tag_valid CHECK (tag IN ('remote', 'office', 'free'));
