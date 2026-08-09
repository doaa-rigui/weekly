/*
# Group repeated blocks into a series

Dragging horizontally across days now *repeats* a block on each day rather
than drawing one wide box across them. Each day gets its own row, and the
rows created together share a `series_id` so editing or deleting can act on
the whole repeat at once.

Every row therefore describes exactly one day: `day_start` = `day_end`. The
two columns are kept (rather than collapsed into a single `day`) so existing
rows, constraints, and the legacy hour columns stay valid.

1. Modified Table
- `planner_blocks`
  - `series_id` (uuid, not null) — rows sharing a value are one repeat.
    Existing rows each become a series of their own.

2. Data Migration
- Any legacy row spanning several days is expanded into one row per day,
  all sharing that row's `series_id`. No block is lost: a Mon-Wed block
  becomes three rows covering Mon, Tue and Wed at the same time.

3. Security
- RLS and existing policies are unchanged.
*/

ALTER TABLE planner_blocks
  ADD COLUMN IF NOT EXISTS series_id uuid;

-- Existing blocks each become a single-row series.
UPDATE planner_blocks SET series_id = gen_random_uuid() WHERE series_id IS NULL;

ALTER TABLE planner_blocks
  ALTER COLUMN series_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN series_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS planner_blocks_series_id_idx ON planner_blocks (series_id);

-- Expand any multi-day row into one row per day, keeping its series_id.
INSERT INTO planner_blocks (
  title, color, day_start, day_end, hour_start, hour_end,
  start_minute, end_minute, series_id
)
SELECT
  b.title, b.color, d.day, d.day, b.hour_start, b.hour_end,
  b.start_minute, b.end_minute, b.series_id
FROM planner_blocks b
CROSS JOIN LATERAL generate_series(b.day_start + 1, b.day_end) AS d(day)
WHERE b.day_end > b.day_start;

-- Collapse the originals onto their first day.
UPDATE planner_blocks SET day_end = day_start WHERE day_end > day_start;
