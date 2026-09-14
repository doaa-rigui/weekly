import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, ListChecks, Plus, Sparkles } from 'lucide-react';
import type { HabitSettings } from '@/lib/habitSettings';
import type { HabitStore } from '@/lib/habitStore';
import {
  STARTER_HABITS,
  addDays,
  describeFrequency,
  formatLongDate,
  iconFor,
  itemsFor,
  progressOf,
  startOfDay,
  statsFor,
  type Habit,
  type HabitDraft,
  type HabitStatus,
  type TodayItem,
} from '@/lib/habits';
import { Card, Chip, Empty, PrimaryButton, STATUS_STYLES } from './ui';
import { NoteDialog, NoteLine, StatusPicker } from './StatusControls';

/**
 * Today. The heart of the app, and the page it opens on.
 *
 * Everything here answers one question — *what is left today?* — so the only
 * numbers on the page are today's own. Trends, streaks and history live on
 * Stats, one click away, where they can be read on purpose rather than while
 * trying to remember whether the water is ticked.
 */
export function Today({
  store,
  settings,
  onAdd,
  onOpenHabit,
}: {
  store: HabitStore;
  settings: HabitSettings;
  onAdd: () => void;
  onOpenHabit: (habit: Habit) => void;
}) {
  /**
   * Which day is on screen. Today almost always — but a habit answered in the
   * morning is often logged at night, and a day boundary is a poor reason to
   * lose yesterday. One step back is enough; further back is Stats.
   */
  const [offset, setOffset] = useState(0);
  const date = useMemo(() => addDays(startOfDay(new Date()), offset), [offset]);
  const isToday = offset === 0;

  /** The habit whose "why not?" is open. Never blocks the status itself. */
  const [noting, setNoting] = useState<TodayItem | null>(null);

  const items = useMemo(
    () => itemsFor(store.habits, store.entries, date),
    [store.habits, store.entries, date]
  );
  const progress = useMemo(() => progressOf(items), [items]);

  const setStatus = (item: TodayItem, status: HabitStatus | null) => {
    store.setStatus(item.habit.id, date, status);
    // The note is offered *after* the status is already saved, so dismissing
    // the prompt still leaves the day answered.
    if (status === 'undone' && settings.askWhyOnUndone) {
      setNoting({ ...item, status, note: item.note });
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-clay-900">
              {isToday ? 'Today' : offset === -1 ? 'Yesterday' : formatLongDate(date)}
            </h1>
            {/* Two steps, not a calendar: this page is about the day you are
                in. Anything older is a question for Stats. */}
            <div className="flex items-center gap-0.5">
              <DayStep
                label="Previous day"
                icon={ChevronLeft}
                disabled={offset <= -1}
                onClick={() => setOffset((o) => o - 1)}
              />
              <DayStep
                label="Next day"
                icon={ChevronRight}
                disabled={offset >= 0}
                onClick={() => setOffset((o) => o + 1)}
              />
            </div>
          </div>
          <p className="mt-1 text-sm text-clay-500">{formatLongDate(date)}</p>
        </div>

        <PrimaryButton onClick={onAdd}>
          <Plus className="h-4 w-4" />
          New habit
        </PrimaryButton>
      </header>

      <div className="mt-6 space-y-4">
        <ProgressCard progress={progress} isToday={isToday} />

        <Card>
          {items.length === 0 ? (
            store.habits.length === 0 ? (
              <Empty
                icon={<Sparkles className="h-5 w-5" />}
                title="Nothing here yet"
                message="Add the first habit you want to keep — or start from one of these and change it later."
                action={
                  <div className="flex flex-col items-center gap-4">
                    <PrimaryButton onClick={onAdd}>
                      <Plus className="h-4 w-4" />
                      Add your first habit
                    </PrimaryButton>
                    <Starters
                      onPick={(draft) => store.create(draft)}
                      disabled={store.saving}
                    />
                  </div>
                }
              />
            ) : (
              <Empty
                icon={<ListChecks className="h-5 w-5" />}
                title="A clear day"
                message={`Nothing is due ${isToday ? 'today' : 'that day'}. Rest is part of the plan.`}
              />
            )
          ) : (
            <ul className="divide-y divide-clay-200/70">
              {items.map((item) => (
                <li key={item.habit.id}>
                  <HabitRow
                    item={item}
                    date={date}
                    showStreak={settings.showStreaksOnToday}
                    entries={store.entries}
                    onStatus={(status) => setStatus(item, status)}
                    onEditNote={() => setNoting(item)}
                    onOpen={() => onOpenHabit(item.habit)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {noting && (
        <NoteDialog
          habitName={noting.habit.name}
          initial={noting.note}
          onSave={(note) => store.setStatus(noting.habit.id, date, 'undone', note)}
          onClose={() => setNoting(null)}
        />
      )}
    </div>
  );
}

/**
 * One-click habits for an empty tracker. They are ordinary habits once added —
 * same name, icon, colour and schedule as if they had been typed — so this is
 * a shortcut past the blank form rather than a separate kind of thing.
 */
function Starters({
  onPick,
  disabled,
}: {
  onPick: (draft: HabitDraft) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {STARTER_HABITS.map((draft) => {
        const Icon = iconFor(draft.icon);
        return (
          <button
            key={draft.name}
            type="button"
            disabled={disabled}
            onClick={() => onPick(draft)}
            title={`Add “${draft.name}” — ${describeFrequency(draft.frequency)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-clay-200 bg-white px-3 py-1.5 text-xs font-medium text-clay-600 transition-colors hover:border-clay-300 hover:bg-clay-50 disabled:opacity-50"
          >
            <Icon className="h-3.5 w-3.5" style={{ color: draft.color }} />
            {draft.name}
          </button>
        );
      })}
    </div>
  );
}

function DayStep({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof ChevronLeft;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg p-1.5 text-clay-400 transition-colors hover:bg-clay-100 hover:text-clay-700 disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * The day's one number, made as large as it deserves to be. The bar underneath
 * is segmented rather than a single fill, because "three done, one skipped,
 * one still open" is a different day from "three done, two missed" and the
 * percentage alone cannot tell them apart.
 */
function ProgressCard({
  progress,
  isToday,
}: {
  progress: ReturnType<typeof progressOf>;
  isToday: boolean;
}) {
  const { due, done, skipped, undone, pending, target, percent } = progress;
  const complete = due > 0 && pending === 0 && undone === 0;

  return (
    <Card className="px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-clay-400">
            {isToday ? "Today's progress" : 'That day'}
          </p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="text-4xl font-semibold leading-none tabular-nums text-clay-900">
              {percent}%
            </span>
            <span className="text-sm text-clay-500">
              {due === 0 ? 'nothing due' : `${done} / ${target} habits completed`}
            </span>
          </p>
        </div>

        {/* The encouragement is a sentence, not a trophy: one calm line that
            says where the day stands and what would finish it. */}
        <p className="text-sm text-clay-500">
          {due === 0
            ? 'A clear day.'
            : complete
              ? isToday
                ? 'That is the whole day. Well done.'
                : 'Everything answered.'
              : pending > 0
                ? `${pending} left${undone > 0 ? `, ${undone} marked undone` : ''}.`
                : `${undone} marked undone.`}
        </p>
      </div>

      <div
        className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-clay-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Today's completion"
      >
        <Segment count={done} total={due} className="bg-done-500" />
        <Segment count={skipped} total={due} className="bg-skipped-300" />
        <Segment count={undone} total={due} className="bg-undone-400" />
      </div>

      {due > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-clay-500">
          <Legend className="bg-done-500" label={`${done} done`} />
          {skipped > 0 && (
            <Legend
              className="bg-skipped-300"
              label={`${skipped} skipped · not counted against today`}
            />
          )}
          {undone > 0 && <Legend className="bg-undone-400" label={`${undone} undone`} />}
          {pending > 0 && <Legend className="bg-clay-200" label={`${pending} still open`} />}
        </div>
      )}
    </Card>
  );
}

function Segment({ count, total, className }: { count: number; total: number; className: string }) {
  if (count === 0 || total === 0) return null;
  return (
    <span className={`h-full rounded-full ${className}`} style={{ width: `${(count / total) * 100}%` }} />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/**
 * One habit's row. The status control sits at the right edge where the eye
 * ends up after reading the name, and the whole left side opens the habit's
 * history — so the row is both the thing you tick and the way into its record.
 */
function HabitRow({
  item,
  date,
  showStreak,
  entries,
  onStatus,
  onEditNote,
  onOpen,
}: {
  item: TodayItem;
  date: Date;
  showStreak: boolean;
  entries: HabitStore['entries'];
  onStatus: (status: HabitStatus | null) => void;
  onEditNote: () => void;
  onOpen: () => void;
}) {
  const { habit, status, note } = item;
  const Icon = iconFor(habit.icon);
  const style = status ? STATUS_STYLES[status] : null;

  // Only computed when it will be shown, and only over the window a streak can
  // plausibly reach back into.
  const streak = useMemo(() => {
    if (!showStreak) return 0;
    return statsFor(habit, entries, addDays(date, -180), date).currentStreak;
  }, [showStreak, habit, entries, date]);

  return (
    <div className="group px-5 py-3.5 transition-colors hover:bg-clay-50/70">
      <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onOpen}
        title={`Open ${habit.name}`}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
          style={{ backgroundColor: `${habit.color}1f`, color: habit.color }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span
              className={`truncate text-sm font-medium ${
                status === 'done' ? 'text-clay-400 line-through' : 'text-clay-900'
              }`}
            >
              {habit.name}
            </span>
            {style && <Chip className={style.chip}>{style.label}</Chip>}
            {streak > 1 && (
              <Chip className="border-clay-200 bg-clay-50 text-clay-500">
                <Flame className="h-3 w-3" />
                {streak}
              </Chip>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-clay-400">
            {describeFrequency(habit.frequency)}
          </span>
        </span>
      </button>

        <div className="shrink-0">
          <StatusPicker value={status} onChange={onStatus} />
        </div>
      </div>

      {/* The note sits under the row rather than beside it: it is a sentence,
          and a sentence squeezed into a column is unreadable. */}
      {note && status === 'undone' && (
        <div className="ml-[3.375rem] mt-1 max-w-xl">
          <NoteLine note={note} onEdit={onEditNote} />
        </div>
      )}
    </div>
  );
}
