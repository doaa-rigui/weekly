import { useMemo, useState } from 'react';
import { ChartColumn, Flame, TrendingUp } from 'lucide-react';
import type { HabitSettings } from '@/lib/habitSettings';
import type { HabitStore } from '@/lib/habitStore';
import {
  addDays,
  bucketize,
  formatLongDate,
  formatPercent,
  iconFor,
  startOfDay,
  summarize,
  type Bucket,
  type Habit,
  type HabitStats,
} from '@/lib/habits';
import { Card, CardHeader, Chip, Empty, Segmented, Stat } from './ui';

/**
 * Stats. Everything Today deliberately leaves out.
 *
 * The page answers three questions in order, and stops: how is it going, when
 * did it go well or badly, and which habit is carrying or dragging the rest.
 * A fourth panel would have to earn its place by changing what the user does
 * next, and most metrics don't.
 */
const RANGES = [
  { value: 'week', label: 'Week', days: 7 },
  { value: 'month', label: 'Month', days: 30 },
  { value: 'quarter', label: '3 months', days: 90 },
  { value: 'year', label: 'Year', days: 365 },
] as const;

type Range = (typeof RANGES)[number]['value'];

export function Stats({
  store,
  settings,
  onOpenHabit,
}: {
  store: HabitStore;
  settings: HabitSettings;
  onOpenHabit: (habit: Habit) => void;
}) {
  const [range, setRange] = useState<Range>('month');
  const days = RANGES.find((r) => r.value === range)!.days;

  const today = useMemo(() => startOfDay(new Date()), []);
  const from = useMemo(() => addDays(today, -(days - 1)), [today, days]);

  const summary = useMemo(
    () => summarize(store.habits, store.entries, from, today, settings.weekStart === 'monday'),
    [store.habits, store.entries, from, today, settings.weekStart]
  );

  const buckets = useMemo(
    () => bucketize(summary.days, days > 120 ? 'month' : 'week', settings.weekStart === 'monday'),
    [summary.days, days, settings.weekStart]
  );

  if (store.habits.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Header range={range} onRange={setRange} />
        <Card className="mt-6">
          <Empty
            icon={<ChartColumn className="h-5 w-5" />}
            title="Nothing to measure yet"
            message="Once you have a habit or two and a few days behind you, this page fills in."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Header range={range} onRange={setRange} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Completion"
          value={formatPercent(summary.rate)}
          hint={`${summary.done} of ${summary.due - summary.skipped} due`}
        />
        <Stat
          label="Full days"
          value={`${summary.perfectDays}`}
          hint={`out of ${summary.days.filter((d) => d.due > 0).length} with habits due`}
        />
        <Stat
          label="Current run"
          value={`${summary.currentPerfectStreak}`}
          hint="consecutive full days"
          accent={summary.currentPerfectStreak > 0 ? 'text-done-600' : 'text-clay-900'}
        />
        <Stat label="Best run" value={`${summary.bestPerfectStreak}`} hint="in this range" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader
            title={days > 120 ? 'By month' : 'By week'}
            hint="Share of due habits kept. Skipped days are left out of both sides."
          />
          <div className="px-5 py-5">
            <TrendChart buckets={buckets} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="How days ended" />
            <div className="px-5 py-5">
              <SplitBar
                done={summary.done}
                skipped={summary.skipped}
                undone={summary.undone}
                pending={summary.pending}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Strong and weak" />
            <div className="space-y-2 px-5 py-4">
              {summary.best && summary.worst ? (
                <>
                  <PeriodLine label="Best" bucket={summary.best} tone="text-done-700" />
                  <PeriodLine label="Hardest" bucket={summary.worst} tone="text-undone-700" />
                </>
              ) : (
                <p className="text-sm text-clay-400">
                  Not enough history in this range to compare periods yet.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="By habit"
          hint={`${formatLongDate(from)} — ${formatLongDate(today)}`}
        />
        <ul className="divide-y divide-clay-200/70">
          {[...summary.perHabit]
            // Weakest first: the list is for finding what needs attention, and
            // the habit at 100% is not the one that does.
            .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2))
            .map((stats) => (
              <li key={stats.habit.id}>
                <HabitStatRow stats={stats} onOpen={() => onOpenHabit(stats.habit)} />
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function Header({ range, onRange }: { range: Range; onRange: (range: Range) => void }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-clay-900">Stats</h1>
        <p className="mt-1 text-sm text-clay-500">How it has actually been going.</p>
      </div>
      <Segmented options={RANGES} value={range} onChange={onRange} label="Range" />
    </header>
  );
}

/**
 * One column per week or month. Bars rather than a line: the buckets are
 * discrete periods, and a line between them would imply a Tuesday reading
 * halfway through that nobody took.
 */
function TrendChart({ buckets }: { buckets: Bucket[] }) {
  const rated = buckets.filter((bucket) => bucket.due > 0);

  if (rated.length === 0) {
    return <p className="py-8 text-center text-sm text-clay-400">Nothing was due in this range.</p>;
  }

  return (
    <div>
      <div className="flex h-44 items-end gap-1.5">
        {buckets.map((bucket) => {
          const rate = bucket.rate;
          const height = rate === null ? 0 : Math.max(rate * 100, 2);
          return (
            <div key={bucket.key} className="group flex h-full flex-1 flex-col justify-end gap-1.5">
              <div className="relative flex-1">
                {/* The empty part of the column is drawn too, so a short bar
                    reads as "20% of the way up" rather than as a small bar. */}
                <div className="absolute inset-x-0 bottom-0 top-0 rounded-md bg-clay-100/70" />
                <div
                  className="absolute inset-x-0 bottom-0 rounded-md bg-iris-400 transition-all group-hover:bg-iris-500"
                  style={{ height: `${height}%` }}
                  title={`${bucket.label}: ${formatPercent(rate)} — ${bucket.done} of ${
                    bucket.due - bucket.skipped
                  } due`}
                />
              </div>
              <span className="truncate text-center text-[10px] leading-none text-clay-400">
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The whole range's answers as one proportional bar. */
function SplitBar({
  done,
  skipped,
  undone,
  pending,
}: {
  done: number;
  skipped: number;
  undone: number;
  pending: number;
}) {
  const total = done + skipped + undone + pending;
  if (total === 0) {
    return <p className="py-4 text-center text-sm text-clay-400">Nothing logged in this range.</p>;
  }

  const parts = [
    { label: 'Done', count: done, className: 'bg-done-500', text: 'text-done-700' },
    { label: 'Skipped', count: skipped, className: 'bg-skipped-300', text: 'text-skipped-700' },
    { label: 'Undone', count: undone, className: 'bg-undone-400', text: 'text-undone-700' },
    { label: 'Unanswered', count: pending, className: 'bg-clay-200', text: 'text-clay-500' },
  ].filter((part) => part.count > 0);

  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-clay-100">
        {parts.map((part) => (
          <span
            key={part.label}
            className={`h-full rounded-full ${part.className}`}
            style={{ width: `${(part.count / total) * 100}%` }}
            title={`${part.label}: ${part.count}`}
          />
        ))}
      </div>
      <dl className="mt-3 space-y-1.5">
        {parts.map((part) => (
          <div key={part.label} className="flex items-center justify-between text-xs">
            <dt className="flex items-center gap-2 text-clay-500">
              <span className={`h-2 w-2 rounded-full ${part.className}`} />
              {part.label}
            </dt>
            <dd className={`font-medium tabular-nums ${part.text}`}>
              {part.count} · {Math.round((part.count / total) * 100)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PeriodLine({ label, bucket, tone }: { label: string; bucket: Bucket; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-clay-500">
        {label} · <span className="text-clay-700">{bucket.label}</span>
      </span>
      <span className={`font-semibold tabular-nums ${tone}`}>{formatPercent(bucket.rate)}</span>
    </div>
  );
}

function HabitStatRow({ stats, onOpen }: { stats: HabitStats; onOpen: () => void }) {
  const { habit } = stats;
  const Icon = iconFor(habit.icon);
  const percent = stats.rate === null ? 0 : Math.round(stats.rate * 100);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-clay-50/70"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${habit.color}1f`, color: habit.color }}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-clay-900">{habit.name}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-clay-700">
            {formatPercent(stats.rate)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-clay-100">
          <span
            className="block h-full rounded-full transition-all"
            style={{ width: `${percent}%`, backgroundColor: habit.color }}
          />
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-clay-400">
          <span>{stats.done} done</span>
          {stats.undone > 0 && <span>{stats.undone} undone</span>}
          {stats.skipped > 0 && <span>{stats.skipped} skipped</span>}
          <span>of {stats.due} due</span>
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {stats.currentStreak > 1 && (
          <Chip className="border-done-100 bg-done-50 text-done-700">
            <Flame className="h-3 w-3" />
            {stats.currentStreak}
          </Chip>
        )}
        {stats.bestStreak > 1 && (
          <Chip>
            <TrendingUp className="h-3 w-3" />
            best {stats.bestStreak}
          </Chip>
        )}
      </div>
    </button>
  );
}
