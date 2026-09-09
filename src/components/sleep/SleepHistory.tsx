import { useCallback, useMemo, useState } from 'react';
import { MoonStar, Trash2 } from 'lucide-react';
import {
  describeNightAge,
  describePeriod,
  formatDuration,
  formatNightRange,
  formatTime,
  type Night,
} from '@/lib/sleep';
import { Card, Checkbox, Chip, ConfirmDialog, Empty } from './ui';

/**
 * Every entry ever logged, grouped by the night it belongs to.
 *
 * The grouping is the point rather than a nicety: a flat list of periods would
 * show `05:30` and `06:00` as two unrelated rows, and answering "did these
 * belong to the same night?" is most of why this page exists. So the night is
 * the heading and its total is stated once, with the periods indented under it
 * and the awake gaps drawn between them.
 */

/** A night's own periods, for the group-level checkbox. */
function periodIdsOf(night: Night): string[] {
  return night.periods.map((p) => p.row.id);
}

function NightGroup({
  night,
  selected,
  onToggleNight,
  onTogglePeriod,
  onDeleteOne,
}: {
  night: Night;
  selected: Set<string>;
  onToggleNight: (night: Night, checked: boolean) => void;
  onTogglePeriod: (id: string, checked: boolean) => void;
  onDeleteOne: (id: string) => void;
}) {
  const ids = periodIdsOf(night);
  const chosen = ids.filter((id) => selected.has(id)).length;

  return (
    <li className="border-b border-night-700/50 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-night-900/40 px-4 py-2.5">
        <Checkbox
          checked={chosen === ids.length}
          indeterminate={chosen > 0}
          onChange={(checked) => onToggleNight(night, checked)}
          label={`Select the night of ${formatNightRange(night)}`}
        />
        <div className="min-w-0 flex-1">
          {/* Allowed to wrap rather than truncate: a night is named by both of
              its dates, and dropping the second is what this page is for. */}
          <p className="text-sm font-semibold text-night-100">{formatNightRange(night)}</p>
          <p className="text-xs text-night-400">{describeNightAge(night)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {night.hasFajr && <Chip tone="dawn">Fajr</Chip>}
          {night.fragmented && (
            <Chip tone="neutral">
              {night.periods.length} periods
            </Chip>
          )}
          <span className="text-sm font-semibold tabular-nums text-dream-300">
            {formatDuration(night.totalMinutes)}
          </span>
        </div>
      </div>

      <ul>
        {night.periods.map((period) => {
          // The awake stretch that preceded this period, if it wasn't the first.
          const gapBefore = period.index > 0 ? night.gaps[period.index - 1] : null;

          return (
            <li key={period.row.id}>
              {gapBefore && (
                <div className="flex items-center gap-2 px-4 py-1 pl-11">
                  <span className="h-3 w-px bg-night-600" />
                  <span
                    className={`text-[11px] font-medium ${
                      gapBefore.fajr ? 'text-dawn-400' : 'text-night-400'
                    }`}
                  >
                    {gapBefore.fajr ? 'Awake for Fajr' : 'Awake'} ·{' '}
                    {formatDuration(gapBefore.minutes)} · {formatTime(gapBefore.from)}–
                    {formatTime(gapBefore.to)}
                  </span>
                </div>
              )}

              <div className="group flex items-start gap-3 px-4 py-2.5">
                <span className="pt-0.5">
                  <Checkbox
                    checked={selected.has(period.row.id)}
                    onChange={(checked) => onTogglePeriod(period.row.id, checked)}
                    label={`Select sleep from ${formatTime(period.start)}`}
                  />
                </span>

                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    period.index === 0
                      ? 'bg-dream-500'
                      : gapBefore?.fajr
                        ? 'bg-dawn-500'
                        : 'bg-dream-400'
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-sm tabular-nums text-night-100">
                      {formatTime(period.start)} → {formatTime(period.end)}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-night-300">
                      {formatDuration(period.minutes)}
                    </span>
                    <span className="text-[11px] text-night-500">
                      {describePeriod(night, period)}
                    </span>
                  </div>
                  {period.row.note && (
                    <p className="mt-1 text-xs leading-relaxed text-night-400">
                      {period.row.note}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => onDeleteOne(period.row.id)}
                  title="Delete this entry"
                  aria-label={`Delete sleep from ${formatTime(period.start)}`}
                  className="shrink-0 rounded-lg p-1.5 text-night-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function SleepHistory({
  nights,
  entryCount,
  busy,
  onDelete,
  onAdd,
}: {
  nights: Night[];
  /** Total periods logged — what "select all" is counted against. */
  entryCount: number;
  busy: boolean;
  onDelete: (ids: string[]) => Promise<boolean>;
  onAdd: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * What the confirmation is about: a specific id from a row's own bin, or the
   * whole selection. Holding the ids here rather than reading the selection at
   * confirm time is what makes the row-level bin work without first selecting
   * the row.
   */
  const [pending, setPending] = useState<string[] | null>(null);

  const allIds = useMemo(() => nights.flatMap(periodIdsOf), [nights]);

  const togglePeriod = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleNight = useCallback((night: Night, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of periodIdsOf(night)) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => setSelected(checked ? new Set(allIds) : new Set()),
    [allIds]
  );

  const confirmDelete = async () => {
    if (!pending) return;
    if (await onDelete(pending)) {
      // Only the deleted ids are dropped: a failed delete keeps the selection
      // so it can be retried without re-ticking thirty boxes.
      const gone = new Set(pending);
      setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
    }
    setPending(null);
  };

  if (nights.length === 0) {
    return (
      <Card>
        <Empty
          icon={<MoonStar className="h-5 w-5" />}
          title="No sleep logged yet"
          message="Add your first night and it will show up here, grouped by the night it belongs to."
          action={
            <button
              onClick={onAdd}
              className="rounded-full bg-dream-500 px-4 py-2 text-sm font-semibold text-night-950 transition-colors hover:bg-dream-400"
            >
              Add sleep
            </button>
          }
        />
      </Card>
    );
  }

  const count = selected.size;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-night-700/70 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5">
            <Checkbox
              checked={count === allIds.length && allIds.length > 0}
              indeterminate={count > 0}
              onChange={toggleAll}
              label="Select all entries"
            />
            <span className="text-xs font-medium text-night-300">Select all</span>
          </label>

          <span className="text-xs text-night-500">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'} across {nights.length}{' '}
            {nights.length === 1 ? 'night' : 'nights'}
          </span>

          {/* The destructive control only exists once there is something to
              destroy, so it can't be hit by reflex on an empty selection. */}
          {count > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs font-medium text-night-400 transition-colors hover:text-night-200"
              >
                Clear
              </button>
              <button
                onClick={() => setPending([...selected])}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {count}
              </button>
            </div>
          )}
        </div>

        <ul>
          {nights.map((night) => (
            <NightGroup
              key={night.key}
              night={night}
              selected={selected}
              onToggleNight={toggleNight}
              onTogglePeriod={togglePeriod}
              onDeleteOne={(id) => setPending([id])}
            />
          ))}
        </ul>
      </Card>

      {pending && (
        <ConfirmDialog
          title={pending.length === 1 ? 'Delete this entry?' : `Delete ${pending.length} entries?`}
          message={
            pending.length === 1
              ? 'This sleep period will be removed for good, and the totals for its night will change.'
              : `These ${pending.length} sleep periods will be removed for good. Any night they belonged to will be recalculated.`
          }
          confirmLabel={pending.length === 1 ? 'Delete' : `Delete ${pending.length}`}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
