import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { HabitStore } from '@/lib/habitStore';
import {
  WEEKDAY_LABELS,
  addDays,
  describeFrequency,
  formatLongDate,
  formatPercent,
  formatRelativeDay,
  iconFor,
  isDueOn,
  isSameDay,
  isoDateOf,
  entryKey,
  startOfDay,
  startOfWeek,
  statsFor,
  type Habit,
  type HabitStatus,
} from '@/lib/habits';
import { GhostButton, Modal, STATUS_STYLES } from './ui';
import { NoteDialog, NoteLine, StatusPicker } from './StatusControls';

/** How far back the grid reaches. A season is enough to see a shape in. */
const WEEKS_SHOWN = 18;

/**
 * One habit's record: what it is, how it has gone, and every day it came due.
 *
 * The grid is the point of this panel. A completion rate says 78%; a grid says
 * *which* 22% — three bad weeks in February, or a Thursday problem — and those
 * are different problems with different fixes.
 */
export function HabitDetail({
  habit,
  store,
  onEdit,
  onClose,
}: {
  habit: Habit;
  store: HabitStore;
  onEdit: () => void;
  onClose: () => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const from = useMemo(() => addDays(startOfWeek(today), -(WEEKS_SHOWN - 1) * 7), [today]);

  const [selected, setSelected] = useState<Date>(today);
  const [noting, setNoting] = useState(false);

  const stats = useMemo(
    () => statsFor(habit, store.entries, from, today),
    [habit, store.entries, from, today]
  );

  const selectedEntry = store.entries.get(entryKey(habit.id, isoDateOf(selected)));
  const selectedDue = isDueOn(habit, selected);
  const Icon = iconFor(habit.icon);

  // Newest first, and only the days that actually say something: a list of
  // "nothing happened" is not a history.
  const recent = useMemo(() => {
    const rows = [];
    for (let day = today; day >= from; day = addDays(day, -1)) {
      const entry = store.entries.get(entryKey(habit.id, isoDateOf(day)));
      if (entry) rows.push({ date: day, entry });
      if (rows.length >= 14) break;
    }
    return rows;
  }, [habit.id, store.entries, from, today]);

  return (
    <Modal
      title={habit.name}
      subtitle={describeFrequency(habit.frequency)}
      width="lg"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-clay-400">Last {WEEKS_SHOWN} weeks</p>
          <GhostButton onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit habit
          </GhostButton>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${habit.color}1f`, color: habit.color }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="grid flex-1 grid-cols-3 gap-3">
            <MiniStat label="Kept" value={formatPercent(stats.rate)} />
            <MiniStat label="Streak" value={`${stats.currentStreak}`} hint={`best ${stats.bestStreak}`} />
            <MiniStat label="Due" value={`${stats.due}`} hint={`${stats.done} done`} />
          </div>
        </div>

        <HistoryGrid
          habit={habit}
          entries={store.entries}
          from={from}
          today={today}
          selected={selected}
          onSelect={setSelected}
        />

        {/* The selected day is editable from here, so a day missed on a busy
            evening can be answered later without hunting for it. */}
        <div className="rounded-2xl border border-clay-200/80 bg-clay-50/70 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-clay-900">
                {isSameDay(selected, today) ? 'Today' : formatLongDate(selected)}
              </p>
              <p className="mt-0.5 text-xs text-clay-500">
                {selectedDue ? 'Due this day' : 'Not scheduled this day'}
              </p>
            </div>
            {selectedDue && (
              <StatusPicker
                value={selectedEntry?.status ?? null}
                onChange={(status) => {
                  store.setStatus(habit.id, selected, status);
                  if (status === 'undone') setNoting(true);
                }}
              />
            )}
          </div>
          {selectedEntry?.note && (
            <div className="mt-1">
              <NoteLine note={selectedEntry.note} onEdit={() => setNoting(true)} />
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-clay-400">
            Recent days
          </p>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-clay-400">Nothing logged yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-clay-200/70 overflow-hidden rounded-xl border border-clay-200/80">
              {recent.map(({ date, entry }) => {
                const style = STATUS_STYLES[entry.status];
                return (
                  <li key={entry.id} className="flex items-start gap-3 bg-white px-3.5 py-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm text-clay-700">
                        <span className="font-medium">{formatRelativeDay(date, today)}</span>
                        <span className={`text-xs ${style.text}`}>{style.label}</span>
                      </p>
                      {entry.note && (
                        <p className="mt-0.5 text-xs italic leading-relaxed text-clay-500">
                          {entry.note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {noting && (
        <NoteDialog
          habitName={habit.name}
          initial={selectedEntry?.note ?? null}
          onSave={(note) => store.setStatus(habit.id, selected, 'undone', note)}
          onClose={() => setNoting(false)}
        />
      )}
    </Modal>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-clay-200/80 bg-white px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-clay-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums text-clay-900">{value}</p>
      {hint && <p className="text-[11px] text-clay-400">{hint}</p>}
    </div>
  );
}

/**
 * Weeks as columns, weekdays as rows. Days the habit was never due are left
 * blank rather than drawn grey: a habit that runs on Tuesdays should look like
 * a row of Tuesdays, not like five-sevenths of a failure.
 */
function HistoryGrid({
  habit,
  entries,
  from,
  today,
  selected,
  onSelect,
}: {
  habit: Habit;
  entries: HabitStore['entries'];
  from: Date;
  today: Date;
  selected: Date;
  onSelect: (date: Date) => void;
}) {
  const weeks = useMemo(() => {
    return Array.from({ length: WEEKS_SHOWN }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(from, w * 7 + d))
    );
  }, [from]);

  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between py-[1px] text-[10px] leading-none text-clay-300">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="h-[14px] leading-[14px]">
            {label[0]}
          </span>
        ))}
      </div>
      <div className="flex flex-1 gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week) => (
          <div key={isoDateOf(week[0])} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <GridCell
                key={isoDateOf(day)}
                habit={habit}
                date={day}
                entries={entries}
                today={today}
                selected={isSameDay(day, selected)}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GridCell({
  habit,
  date,
  entries,
  today,
  selected,
  onSelect,
}: {
  habit: Habit;
  date: Date;
  entries: HabitStore['entries'];
  today: Date;
  selected: boolean;
  onSelect: (date: Date) => void;
}) {
  const future = date > today;
  const due = !future && isDueOn(habit, date);
  const status: HabitStatus | undefined = entries.get(entryKey(habit.id, isoDateOf(date)))?.status;

  const fill = !due
    ? 'bg-clay-50'
    : status === 'done'
      ? 'bg-done-500'
      : status === 'skipped'
        ? 'bg-skipped-300'
        : status === 'undone'
          ? 'bg-undone-400'
          : 'bg-clay-200';

  const label = `${formatLongDate(date)} — ${
    future ? 'still to come' : !due ? 'not scheduled' : status ? STATUS_STYLES[status].label : 'no answer'
  }`;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={future}
      onClick={() => onSelect(date)}
      className={`h-[14px] w-[14px] rounded-[3px] transition-transform disabled:opacity-30 ${fill} ${
        selected ? 'ring-2 ring-clay-900/60 ring-offset-1' : 'hover:scale-125'
      }`}
    />
  );
}
