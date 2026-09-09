import { ArrowDownRight, ArrowUpRight, Minus, Moon, MoonStar, Plus, Sunrise } from 'lucide-react';
import {
  describeNightAge,
  formatDuration,
  formatNightRange,
  formatTime,
  type Night,
  type NightSlot,
  type SleepSummary,
} from '@/lib/sleep';
import { NightStrip, SleepChartCard } from './SleepCharts';
import { Card, Chip, Empty, Stat } from './ui';
import type { SleepPrefill } from './SleepForm';

/**
 * Everything worth knowing at a glance, in the order it is wanted: what last
 * night was, then how the week compares, then the thirty-night picture.
 *
 * The hero is a single night rather than an aggregate because that is the
 * question actually being asked on waking up — the averages are context for it,
 * not the headline.
 */

/** Whether the last week is up, down, or level on the week before. */
function Trend({ minutes }: { minutes: number }) {
  // Under a quarter of an hour either way is noise, not a trend.
  const flat = Math.abs(minutes) < 15;
  const up = minutes > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? 'text-night-400' : up ? 'text-emerald-400' : 'text-dawn-400';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {flat ? 'Steady' : `${up ? '+' : '−'}${formatDuration(Math.abs(minutes))}`}
    </span>
  );
}

/** The one number the dashboard exists for, and the night behind it. */
function LastNightCard({
  night,
  onAddPeriod,
}: {
  night: Night;
  onAddPeriod: (prefill: SleepPrefill) => void;
}) {
  const notes = night.periods.filter((p) => p.row.note);
  const afterFajr = night.periods.find(
    (p) => p.index > 0 && night.gaps[p.index - 1]?.fajr
  );

  /**
   * Prefills a further period starting where this night currently ends — the
   * shape of the Fajr case, where the second entry is logged after the first
   * has already been saved.
   */
  const continueNight = () => {
    const start = new Date(night.finalWake);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    onAddPeriod({ start, end });
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-dream-400">
            {describeNightAge(night)}
          </p>
          <p className="mt-0.5 text-xs text-night-400">{formatNightRange(night)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {night.hasFajr && <Chip tone="dawn">Woke for Fajr</Chip>}
          {night.fragmented && <Chip tone="dream">{night.periods.length} sleep periods</Chip>}
        </div>
      </div>

      <p className="mt-3 text-4xl font-semibold tabular-nums text-night-100">
        {formatDuration(night.totalMinutes)}
      </p>

      {/* The night's shape, so a broken night is never reported as a total
          alone — which is exactly the reading the spec set out to avoid. */}
      <div className="mt-4">
        <NightStrip night={night} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-night-700/60 pt-4 sm:grid-cols-4">
        <div>
          <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-night-400">
            <Moon className="h-3 w-3 text-dream-400" />
            Bedtime
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-night-100">
            {formatTime(night.bedtime)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-night-400">
            <Sunrise className="h-3 w-3 text-dawn-400" />
            Final wake-up
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-night-100">
            {formatTime(night.finalWake)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-night-400">
            First sleep
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-night-100">
            {formatDuration(night.periods[0].minutes)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-night-400">
            After Fajr
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-night-100">
            {afterFajr ? formatDuration(afterFajr.minutes) : '—'}
          </dd>
        </div>
      </dl>

      {notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-night-700/60 pt-4">
          {notes.map((period) => (
            <li key={period.row.id} className="text-xs leading-relaxed text-night-300">
              <span className="text-night-500">{formatTime(period.start)} · </span>
              {period.row.note}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={continueNight}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-night-600 px-3 py-1.5 text-xs font-medium text-night-300 transition-colors hover:border-dream-500/60 hover:text-dream-300"
      >
        <Plus className="h-3.5 w-3.5" />
        Add another period to this night
      </button>
    </Card>
  );
}

export function SleepDashboard({
  summary,
  slots,
  onAdd,
}: {
  summary: SleepSummary;
  /** The 30-night window, oldest first, holes included. */
  slots: NightSlot[];
  onAdd: (prefill?: SleepPrefill) => void;
}) {
  const { latest, consistency } = summary;

  if (!latest) {
    return (
      <Card>
        <Empty
          icon={<MoonStar className="h-5 w-5" />}
          title="Let's see your sleep"
          message="Log one night and the dashboard fills in. Log a week and the patterns start showing."
          action={
            <button
              onClick={() => onAdd()}
              className="inline-flex items-center gap-1.5 rounded-full bg-dream-500 px-4 py-2 text-sm font-semibold text-night-950 transition-colors hover:bg-dream-400"
            >
              <Plus className="h-4 w-4" />
              Add sleep
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <LastNightCard night={latest} onAddPeriod={onAdd} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Last 7 nights"
          value={summary.weekAverage !== null ? formatDuration(summary.weekAverage) : '—'}
          hint="average per night"
        />
        <div className="rounded-2xl border border-night-700/70 bg-night-850/70 px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-night-400">Trend</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-night-100">
            {summary.monthAverage !== null ? formatDuration(summary.monthAverage) : '—'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-night-400">
            {summary.trendMinutes !== null ? (
              <>
                <Trend minutes={summary.trendMinutes} />
                <span>vs previous week</span>
              </>
            ) : (
              <span>30-night average</span>
            )}
          </p>
        </div>
        <Stat
          label="Consistency"
          value={consistency ? `${consistency.score}` : '—'}
          hint={
            consistency
              ? `bed ±${formatDuration(consistency.bedtimeDrift)} · wake ±${formatDuration(
                  consistency.wakeDrift
                )}`
              : 'needs 3 nights'
          }
          accent={
            consistency && consistency.score >= 70
              ? 'text-emerald-400'
              : consistency && consistency.score >= 40
                ? 'text-dawn-400'
                : 'text-night-100'
          }
        />
        <Stat
          label="Broken nights"
          value={`${summary.fragmentedNights}`}
          hint={`of ${summary.loggedNights} logged`}
        />
      </div>

      <SleepChartCard
        slots={slots}
        average={summary.monthAverage}
        consistency={consistency}
      />
    </div>
  );
}
