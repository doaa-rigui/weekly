import { ArrowDownRight, ArrowUpRight, Minus, MoonStar, Plus } from 'lucide-react';
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
import { TakeawaysPreview } from './SleepTakeaways';
import { Card, Chip, Empty, Stat } from './ui';
import type { SleepPrefill } from './SleepForm';
import type { SleepTakeaway } from '@/lib/takeaways';

/**
 * Everything worth knowing at a glance, in the order it is wanted: what last
 * night was, then how the week compares, then the thirty-night picture, then
 * what has been learned from it.
 *
 * Last night and the two averages are deliberately kept to a few lines each.
 * They answer their question in one look and then get out of the way — the
 * height belongs to the thirty-night chart and the takeaways, which are the
 * two things here that are read rather than glanced at.
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

/**
 * Last night in a few lines: the total, the shape of the night, and a way to
 * add a period to it.
 *
 * The bedtime, the wake-up and each period's length are already written on the
 * strip, so they are not repeated as a row of statistics underneath it — that
 * row was most of the card's height and none of its information.
 */
function LastNightCard({
  night,
  onAddPeriod,
}: {
  night: Night;
  onAddPeriod: (prefill: SleepPrefill) => void;
}) {
  const notes = night.periods.filter((p) => p.row.note);
  const afterFajr = night.periods.find((p) => p.index > 0 && night.gaps[p.index - 1]?.fajr);

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
    <Card className="p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <p className="text-3xl font-semibold leading-none tabular-nums text-night-100">
            {formatDuration(night.totalMinutes)}
          </p>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dream-400">
              {describeNightAge(night)}
            </p>
            <p className="text-[11px] text-night-400">{formatNightRange(night)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {night.hasFajr && (
            <Chip tone="dawn">
              Woke for Fajr{afterFajr ? ` · +${formatDuration(afterFajr.minutes)}` : ''}
            </Chip>
          )}
          {night.fragmented && <Chip tone="dream">{night.periods.length} sleep periods</Chip>}
          <button
            onClick={continueNight}
            title="Add another period to this night"
            className="inline-flex items-center gap-1 rounded-full border border-night-600 px-2.5 py-1 text-[11px] font-medium text-night-300 transition-colors hover:border-dream-500/60 hover:text-dream-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Add period
          </button>
        </div>
      </div>

      {/* The night's shape, so a broken night is never reported as a total
          alone — which is exactly the reading the spec set out to avoid. */}
      <div className="mt-2.5">
        <NightStrip night={night} />
      </div>

      {notes.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t border-night-700/60 pt-2.5">
          {notes.map((period) => (
            <li key={period.row.id} className="text-xs leading-relaxed text-night-300">
              <span className="text-night-500">{formatTime(period.start)} · </span>
              {period.row.note}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SleepDashboard({
  summary,
  slots,
  takeaways,
  onOpenTakeaways,
  onAdd,
}: {
  summary: SleepSummary;
  /** The 30-night window, oldest first, holes included. */
  slots: NightSlot[];
  takeaways: SleepTakeaway[];
  onOpenTakeaways: () => void;
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
    <div className="space-y-3">
      {/* The averages are context for last night rather than headlines of
          their own, so they sit beside it in a narrow column — two short
          tiles, not a row of cards taking a band of the page to themselves.
          Below `lg` there isn't the width for that, and they drop under it. */}
      <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LastNightCard night={latest} onAddPeriod={onAdd} />

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1 lg:grid-rows-2">
          <Stat
            label="Last 7 nights"
            value={summary.weekAverage !== null ? formatDuration(summary.weekAverage) : '—'}
            hint="average per night"
          />
          <Stat
            label="Trend"
            value={summary.monthAverage !== null ? formatDuration(summary.monthAverage) : '—'}
            hint={
              summary.trendMinutes !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Trend minutes={summary.trendMinutes} />
                  vs previous week
                </span>
              ) : (
                '30-night average'
              )
            }
          />
        </div>
      </div>

      <SleepChartCard slots={slots} average={summary.monthAverage} consistency={consistency} />

      <TakeawaysPreview takeaways={takeaways} onOpen={onOpenTakeaways} />
    </div>
  );
}
