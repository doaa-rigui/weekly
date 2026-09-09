import { Fragment, useMemo, useState } from 'react';
import {
  MINUTES_PER_DAY,
  describePeriod,
  formatClockOffset,
  formatDuration,
  formatNightRange,
  formatShortDate,
  formatTime,
  offsetInNight,
  type Consistency,
  type Night,
  type NightSlot,
  type Period,
} from '@/lib/sleep';
import { Chip, Segmented, useMeasuredWidth } from './ui';

/**
 * The 30-night visualisations. Four views of one dataset, because the
 * questions are different: *when* did I sleep, *how much*, *what schedule*,
 * *how regular*. Each answers one of them and none tries to answer all four.
 *
 * All of it is hand-drawn SVG at measured pixel widths rather than a charting
 * library scaled by `viewBox`. The reason is the timeline: thirty rows of a
 * night's shape need every row legible on a phone, which means the chart has to
 * know its real width and drop labels accordingly — a scaled `viewBox` would
 * just shrink the text.
 */

/**
 * Sleep is indigo; the sleep after waking for Fajr is dawn-coloured. That one
 * pairing is what makes a fragmented night readable at a glance across thirty
 * rows, so it is used identically in every view.
 */
const C = {
  first: '#7c8cf8',
  later: '#b3bdfd',
  fajr: '#f0a94c',
  awake: '#3d4a75',
  track: '#151d3a',
  grid: '#1d2748',
  gridStrong: '#3d4a75',
  axis: '#6b7aa8',
  label: '#98a4c9',
  bright: '#e7ebf7',
  earlier: '#5ecfb1',
  weekend: '#111a35',
} as const;

/** Which colour a period is drawn in, given where it falls in its night. */
function periodFill(night: Night, period: Period): string {
  if (period.index === 0) return C.first;
  return night.gaps[period.index - 1]?.fajr ? C.fajr : C.later;
}

// -- Scales ------------------------------------------------------------------

/**
 * The clock range the timeline and schedule views span, in minutes from each
 * night's own midnight — so 8 PM is 1200 and 7 AM the next morning is 1860.
 *
 * It always contains 8 PM → 8 AM, then stretches to fit whatever the data
 * actually did. A fixed window would clip an unusual night; a purely
 * data-driven one would rescale the whole chart because of a single late night,
 * and the eye reads that as the schedule having changed.
 */
type ClockWindow = { start: number; end: number };

const DEFAULT_WINDOW: ClockWindow = { start: 20 * 60, end: MINUTES_PER_DAY + 8 * 60 };

function clockWindowOf(slots: NightSlot[]): ClockWindow {
  let start = DEFAULT_WINDOW.start;
  let end = DEFAULT_WINDOW.end;
  for (const slot of slots) {
    if (!slot.night) continue;
    start = Math.min(start, offsetInNight(slot.night, slot.night.bedtime));
    end = Math.max(end, offsetInNight(slot.night, slot.night.finalWake));
  }
  // Out to whole hours, so gridlines land on the edges rather than near them.
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

/** Hour gridlines at a step wide enough that the labels don't collide. */
function hourTicks(win: ClockWindow, stepHours: number): number[] {
  const step = stepHours * 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(win.start / step) * step; t <= win.end; t += step) ticks.push(t);
  return ticks;
}

function clockStepFor(pixels: number, win: ClockWindow): number {
  const hours = (win.end - win.start) / 60;
  const perHour = pixels / hours;
  if (perHour > 46) return 2;
  if (perHour > 30) return 3;
  return 4;
}

/**
 * The day number alone, except on the 1st, which is named by its month — a
 * 30-night window crosses a month boundary, and without that anchor the "1"
 * following "31" says nothing about which month it starts.
 */
function compactDateLabel(date: Date): string {
  return date.getDate() === 1
    ? date.toLocaleDateString(undefined, { month: 'short' })
    : String(date.getDate());
}

/** Friday and Saturday evenings — the nights a schedule usually slips on. */
function isWeekendNight(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6;
}

/** How often to label the night axis, so 30 dates don't overlap. */
function labelEvery(pixels: number, count: number): number {
  const perSlot = pixels / Math.max(1, count);
  if (perSlot > 34) return 2;
  if (perSlot > 20) return 5;
  return 7;
}

// -- Chart 1: timeline -------------------------------------------------------

const ROW_HEIGHT = 15;
const BAR_HEIGHT = 9;
const AXIS_HEIGHT = 22;

/**
 * One row per night, drawn against a shared clock. This is the view the whole
 * feature is for: a fragmented night is visibly two bars with a bright gap, a
 * drifting bedtime is a leading edge that slopes, and a run of short nights is
 * a block of short bars — none of which needs a single entry to be opened.
 */
function TimelineChart({
  slots,
  width,
  activeKey,
  onHover,
}: {
  slots: NightSlot[];
  width: number;
  activeKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const win = useMemo(() => clockWindowOf(slots), [slots]);

  const labelW = width < 520 ? 30 : 62;
  const padRight = 10;
  const plotW = Math.max(80, width - labelW - padRight);
  const height = AXIS_HEIGHT + slots.length * ROW_HEIGHT + 4;

  const xAt = (offset: number) =>
    labelW + ((offset - win.start) / (win.end - win.start)) * plotW;

  const ticks = hourTicks(win, clockStepFor(plotW, win));
  const showDates = width >= 520;

  return (
    <svg width={width} height={height} role="img" aria-label="Sleep timeline, last 30 nights">
      {/* Clock gridlines. Midnight is drawn brighter — it is the line every
          bedtime is unconsciously measured against. */}
      {ticks.map((tick) => {
        const midnight = tick % MINUTES_PER_DAY === 0;
        return (
          <Fragment key={tick}>
            <line
              x1={xAt(tick)}
              x2={xAt(tick)}
              y1={AXIS_HEIGHT - 6}
              y2={height - 4}
              stroke={midnight ? C.gridStrong : C.grid}
              strokeWidth={1}
            />
            <text
              x={xAt(tick)}
              y={11}
              textAnchor="middle"
              fontSize={9.5}
              fill={midnight ? C.label : C.axis}
              fontWeight={midnight ? 600 : 400}
            >
              {formatClockOffset(tick)}
            </text>
          </Fragment>
        );
      })}

      {slots.map((slot, i) => {
        const top = AXIS_HEIGHT + i * ROW_HEIGHT;
        const barY = top + (ROW_HEIGHT - BAR_HEIGHT) / 2;
        const active = slot.key === activeKey;
        const night = slot.night;

        return (
          <g
            key={slot.key}
            onMouseEnter={() => onHover(slot.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onHover(slot.key)}
            style={{ cursor: night ? 'pointer' : 'default' }}
          >
            {/* Hit area, and the weekend / hover shading. */}
            <rect
              x={0}
              y={top}
              width={Math.max(width, 1)}
              height={ROW_HEIGHT}
              fill={active ? '#1b2547' : isWeekendNight(slot.date) ? C.weekend : 'transparent'}
            />

            <text
              x={showDates ? labelW - 8 : labelW - 6}
              y={top + ROW_HEIGHT / 2 + 3.2}
              textAnchor="end"
              fontSize={9.5}
              fill={active ? C.bright : C.axis}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {showDates ? formatShortDate(slot.date) : compactDateLabel(slot.date)}
            </text>

            {night ? (
              <>
                {/* The night's full span, so the gaps read as holes in
                    something rather than as absence. */}
                <rect
                  x={xAt(offsetInNight(night, night.bedtime))}
                  y={barY}
                  width={Math.max(
                    1,
                    xAt(offsetInNight(night, night.finalWake)) -
                      xAt(offsetInNight(night, night.bedtime))
                  )}
                  height={BAR_HEIGHT}
                  rx={BAR_HEIGHT / 2}
                  fill={C.track}
                />

                {night.gaps.map((gap) => {
                  const x1 = xAt(offsetInNight(night, gap.from));
                  const x2 = xAt(offsetInNight(night, gap.to));
                  const mid = (x1 + x2) / 2;
                  const y = barY + BAR_HEIGHT / 2;
                  return (
                    <Fragment key={gap.from.getTime()}>
                      <line
                        x1={x1}
                        x2={x2}
                        y1={y}
                        y2={y}
                        stroke={gap.fajr ? C.fajr : C.awake}
                        strokeWidth={1.5}
                        strokeDasharray="2 2"
                        opacity={gap.fajr ? 0.9 : 0.7}
                      />
                      {gap.fajr && <circle cx={mid} cy={y} r={2.2} fill={C.fajr} />}
                    </Fragment>
                  );
                })}

                {night.periods.map((period) => {
                  const x = xAt(offsetInNight(night, period.start));
                  const w = Math.max(1.5, xAt(offsetInNight(night, period.end)) - x);
                  return (
                    <rect
                      key={period.row.id}
                      x={x}
                      y={barY}
                      width={w}
                      height={BAR_HEIGHT}
                      rx={Math.min(BAR_HEIGHT / 2, w / 2)}
                      fill={periodFill(night, period)}
                      opacity={activeKey && !active ? 0.55 : 1}
                    />
                  );
                })}
              </>
            ) : (
              /* Nothing logged. An empty row rather than a closed-up gap, so a
                 missed night can't be mistaken for a night without sleep. */
              <line
                x1={labelW + 4}
                x2={labelW + plotW}
                y1={top + ROW_HEIGHT / 2}
                y2={top + ROW_HEIGHT / 2}
                stroke={C.awake}
                strokeWidth={1}
                strokeDasharray="1 4"
                opacity={0.8}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// -- Chart 2: duration -------------------------------------------------------

const DURATION_HEIGHT = 232;
/** The y axis always reaches at least this, so short nights look short. */
const DURATION_MIN_HOURS = 10;

/**
 * Total hours per night, stacked by period so a 7½-hour night taken in one
 * stretch and the same 7½ hours broken by Fajr are not the same bar.
 */
function DurationChart({
  slots,
  width,
  average,
  activeKey,
  onHover,
}: {
  slots: NightSlot[];
  width: number;
  average: number | null;
  activeKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const padLeft = 32;
  const padTop = 10;
  const padBottom = 22;
  const plotW = Math.max(60, width - padLeft - 8);
  const plotH = DURATION_HEIGHT - padTop - padBottom;

  const peak = Math.max(...slots.map((s) => s.night?.totalMinutes ?? 0), 0);
  const maxHours = Math.max(DURATION_MIN_HOURS, Math.ceil(peak / 60));
  const maxMinutes = maxHours * 60;

  const colW = plotW / slots.length;
  const barW = Math.max(3, colW - Math.max(1.5, colW * 0.22));
  const xAt = (i: number) => padLeft + (i + 0.5) * colW;
  const yAt = (minutes: number) => padTop + plotH * (1 - minutes / maxMinutes);

  // Roughly five gridlines, on a whole number of hours.
  const hourStep = Math.max(2, Math.ceil(maxHours / 5));
  const gridHours = [];
  for (let h = 0; h <= maxHours; h += hourStep) gridHours.push(h);

  const stride = labelEvery(plotW, slots.length);

  return (
    <svg width={width} height={DURATION_HEIGHT} role="img" aria-label="Hours slept per night">
      {gridHours.map((h) => (
        <Fragment key={h}>
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yAt(h * 60)}
            y2={yAt(h * 60)}
            stroke={C.grid}
            strokeWidth={1}
          />
          <text x={padLeft - 7} y={yAt(h * 60) + 3.2} textAnchor="end" fontSize={9.5} fill={C.axis}>
            {h}h
          </text>
        </Fragment>
      ))}

      {slots.map((slot, i) => {
        const night = slot.night;
        const active = slot.key === activeKey;
        const x = xAt(i) - barW / 2;

        if (!night) {
          return (
            <circle key={slot.key} cx={xAt(i)} cy={yAt(0)} r={1.4} fill={C.awake} />
          );
        }

        // Stacked from the baseline up, in the order the periods happened.
        let stacked = 0;
        return (
          <g
            key={slot.key}
            onMouseEnter={() => onHover(slot.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onHover(slot.key)}
            style={{ cursor: 'pointer' }}
          >
            {night.periods.map((period) => {
              const y = yAt(stacked + period.minutes);
              const h = Math.max(1, plotH * (period.minutes / maxMinutes));
              stacked += period.minutes;
              return (
                <rect
                  key={period.row.id}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={Math.min(2.5, barW / 2)}
                  fill={periodFill(night, period)}
                  opacity={activeKey && !active ? 0.5 : 1}
                />
              );
            })}
          </g>
        );
      })}

      <line
        x1={padLeft}
        x2={padLeft + plotW}
        y1={yAt(0)}
        y2={yAt(0)}
        stroke={C.gridStrong}
        strokeWidth={1}
      />

      {/* Drawn after the bars, since SVG paints in document order and this is
          a reference line they are meant to be read against. It carries no
          label of its own — at 30 bars there is nowhere to put one that isn't
          on top of a bar, so the caption above the chart names it instead. */}
      {average !== null && (
        <line
          x1={padLeft}
          x2={padLeft + plotW}
          y1={yAt(average)}
          y2={yAt(average)}
          stroke={C.first}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.75}
        />
      )}

      {slots.map((slot, i) =>
        i % stride === 0 ? (
          <text
            key={slot.key}
            x={xAt(i)}
            y={DURATION_HEIGHT - 7}
            textAnchor="middle"
            fontSize={9.5}
            fill={C.axis}
          >
            {formatShortDate(slot.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// -- Chart 3: schedule -------------------------------------------------------

const SCHEDULE_HEIGHT = 260;

/**
 * Bedtime and final wake-up as two lines with the night shaded between them.
 * Duration is the *thickness* of the band here, which puts the question the
 * other way round: not how long, but whether the whole window is sliding.
 */
function ScheduleChart({
  slots,
  width,
  activeKey,
  onHover,
}: {
  slots: NightSlot[];
  width: number;
  activeKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const win = useMemo(() => clockWindowOf(slots), [slots]);

  const padLeft = width < 520 ? 44 : 54;
  const padTop = 10;
  const padBottom = 22;
  const plotW = Math.max(60, width - padLeft - 10);
  const plotH = SCHEDULE_HEIGHT - padTop - padBottom;

  const colW = plotW / slots.length;
  const xAt = (i: number) => padLeft + (i + 0.5) * colW;
  // Evening at the top, morning at the bottom — the direction a night runs.
  const yAt = (offset: number) => padTop + ((offset - win.start) / (win.end - win.start)) * plotH;

  const ticks = hourTicks(win, clockStepFor(plotH, win));
  const stride = labelEvery(plotW, slots.length);

  /**
   * Runs of consecutive logged nights. The lines are broken across a missing
   * night rather than drawn through it, since a line through a hole is a claim
   * about a night we have no data for.
   */
  const runs = useMemo(() => {
    const out: { i: number; night: Night }[][] = [];
    let current: { i: number; night: Night }[] = [];
    slots.forEach((slot, i) => {
      if (slot.night) {
        current.push({ i, night: slot.night });
      } else if (current.length) {
        out.push(current);
        current = [];
      }
    });
    if (current.length) out.push(current);
    return out;
  }, [slots]);

  return (
    <svg width={width} height={SCHEDULE_HEIGHT} role="img" aria-label="Bedtime and wake-up time">
      {ticks.map((tick) => {
        const midnight = tick % MINUTES_PER_DAY === 0;
        return (
          <Fragment key={tick}>
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke={midnight ? C.gridStrong : C.grid}
              strokeWidth={1}
            />
            <text
              x={padLeft - 7}
              y={yAt(tick) + 3.2}
              textAnchor="end"
              fontSize={9.5}
              fill={midnight ? C.label : C.axis}
            >
              {formatClockOffset(tick)}
            </text>
          </Fragment>
        );
      })}

      {runs.map((run) => {
        const key = `run-${run[0].i}`;

        // A lone night has no width to shade, so it becomes a bar instead of a
        // zero-area path.
        if (run.length === 1) {
          const { i, night } = run[0];
          const top = yAt(offsetInNight(night, night.bedtime));
          const bottom = yAt(offsetInNight(night, night.finalWake));
          const w = Math.max(2, colW * 0.5);
          return (
            <rect
              key={key}
              x={xAt(i) - w / 2}
              y={top}
              width={w}
              height={Math.max(1, bottom - top)}
              fill={C.first}
              opacity={0.28}
            />
          );
        }

        const bed = run.map(({ i, night }) => `${xAt(i)},${yAt(offsetInNight(night, night.bedtime))}`);
        const wake = run
          .map(({ i, night }) => `${xAt(i)},${yAt(offsetInNight(night, night.finalWake))}`)
          .reverse();

        return (
          <Fragment key={key}>
            <path d={`M${bed.join('L')}L${wake.join('L')}Z`} fill={C.first} opacity={0.18} />
            <polyline points={bed.join(' ')} fill="none" stroke={C.first} strokeWidth={1.5} />
            <polyline points={wake.join(' ')} fill="none" stroke={C.fajr} strokeWidth={1.5} />
          </Fragment>
        );
      })}

      {slots.map((slot, i) => {
        const night = slot.night;
        if (!night) return null;
        const active = slot.key === activeKey;
        return (
          <g
            key={slot.key}
            onMouseEnter={() => onHover(slot.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onHover(slot.key)}
            style={{ cursor: 'pointer' }}
          >
            {/* A full-height hit area, so the row is easy to reach on a phone. */}
            <rect x={xAt(i) - colW / 2} y={padTop} width={colW} height={plotH} fill="transparent" />
            <circle
              cx={xAt(i)}
              cy={yAt(offsetInNight(night, night.bedtime))}
              r={active ? 3.4 : 2.1}
              fill={C.first}
            />
            <circle
              cx={xAt(i)}
              cy={yAt(offsetInNight(night, night.finalWake))}
              r={active ? 3.4 : 2.1}
              fill={C.fajr}
            />
          </g>
        );
      })}

      {slots.map((slot, i) =>
        i % stride === 0 ? (
          <text
            key={slot.key}
            x={xAt(i)}
            y={SCHEDULE_HEIGHT - 7}
            textAnchor="middle"
            fontSize={9.5}
            fill={C.axis}
          >
            {formatShortDate(slot.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// -- Chart 4: consistency ----------------------------------------------------

const LANE_HEIGHT = 96;
const CONSISTENCY_HEIGHT = LANE_HEIGHT * 2 + 34;
/** The axis reaches at least an hour either side, so small drift looks small. */
const MIN_DEVIATION = 60;

/**
 * How far each night strayed from its own median, as a stem above or below the
 * line. Two lanes, because bedtime and wake-up drift independently — a steady
 * alarm with a wandering bedtime is a specific and common problem, and it is
 * invisible in any view that only shows totals.
 */
function ConsistencyChart({
  slots,
  width,
  consistency,
  activeKey,
  onHover,
}: {
  slots: NightSlot[];
  width: number;
  consistency: Consistency;
  activeKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const padLeft = width < 520 ? 34 : 44;
  const plotW = Math.max(60, width - padLeft - 10);
  const colW = plotW / slots.length;
  const xAt = (i: number) => padLeft + (i + 0.5) * colW;

  const lanes = [
    { title: 'Bedtime', median: consistency.medianBedtime, pick: (n: Night) => n.bedtime },
    { title: 'Wake-up', median: consistency.medianWake, pick: (n: Night) => n.finalWake },
  ] as const;

  const widest = Math.max(
    MIN_DEVIATION,
    ...slots.flatMap((slot) =>
      slot.night
        ? lanes.map((lane) => Math.abs(offsetInNight(slot.night!, lane.pick(slot.night!)) - lane.median))
        : []
    )
  );
  // Rounded up to a whole half-hour, so the edge labels read "+1h 30m" — an
  // axis — rather than "+1h 4m", which reads as a measurement of something.
  const spread = Math.ceil(widest / 30) * 30;

  const stride = labelEvery(plotW, slots.length);

  return (
    <svg width={width} height={CONSISTENCY_HEIGHT} role="img" aria-label="Schedule consistency">
      {lanes.map((lane, laneIndex) => {
        const top = laneIndex * LANE_HEIGHT + 14;
        const zero = top + LANE_HEIGHT / 2 - 7;
        const half = LANE_HEIGHT / 2 - 16;
        const yAt = (deviation: number) => zero - (deviation / spread) * half;

        return (
          <Fragment key={lane.title}>
            <text x={padLeft} y={top - 2} fontSize={10} fill={C.label} fontWeight={600}>
              {lane.title}
              <tspan fill={C.axis} fontWeight={400}>
                {'  '}usually {formatClockOffset(lane.median)}
              </tspan>
            </text>

            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={zero}
              y2={zero}
              stroke={C.gridStrong}
              strokeWidth={1}
            />
            {[spread, -spread].map((edge) => (
              <Fragment key={edge}>
                <line
                  x1={padLeft}
                  x2={padLeft + plotW}
                  y1={yAt(edge)}
                  y2={yAt(edge)}
                  stroke={C.grid}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <text x={padLeft - 6} y={yAt(edge) + 3.2} textAnchor="end" fontSize={9} fill={C.axis}>
                  {edge > 0 ? '+' : '−'}
                  {formatDuration(Math.abs(edge))}
                </text>
              </Fragment>
            ))}

            {slots.map((slot, i) => {
              const night = slot.night;
              if (!night) return null;
              const deviation = offsetInNight(night, lane.pick(night)) - lane.median;
              const active = slot.key === activeKey;
              // Clamped, so one wild night is still drawn at the edge rather
              // than off the lane and out of the picture.
              const y = yAt(Math.max(-spread, Math.min(spread, deviation)));
              const color = deviation > 0 ? C.first : C.earlier;

              return (
                <g
                  key={slot.key}
                  onMouseEnter={() => onHover(slot.key)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onHover(slot.key)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={xAt(i) - colW / 2}
                    y={top}
                    width={colW}
                    height={LANE_HEIGHT - 14}
                    fill="transparent"
                  />
                  <line
                    x1={xAt(i)}
                    x2={xAt(i)}
                    y1={zero}
                    y2={y}
                    stroke={color}
                    strokeWidth={active ? 2.2 : 1.4}
                    opacity={activeKey && !active ? 0.45 : 0.85}
                  />
                  <circle
                    cx={xAt(i)}
                    cy={y}
                    r={active ? 3.2 : 2}
                    fill={color}
                    opacity={activeKey && !active ? 0.45 : 1}
                  />
                </g>
              );
            })}
          </Fragment>
        );
      })}

      {slots.map((slot, i) =>
        i % stride === 0 ? (
          <text
            key={slot.key}
            x={xAt(i)}
            y={CONSISTENCY_HEIGHT - 6}
            textAnchor="middle"
            fontSize={9.5}
            fill={C.axis}
          >
            {formatShortDate(slot.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// -- The card ----------------------------------------------------------------

const MODES = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'duration', label: 'Duration' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'consistency', label: 'Consistency' },
] as const;

type Mode = (typeof MODES)[number]['value'];

/** What each view is for, said once, under its own tabs. */
function captionFor(mode: Mode, average: number | null): string {
  switch (mode) {
    case 'timeline':
      return 'Every night against the same clock. Dashes are time awake; amber is Fajr.';
    case 'duration':
      // The dashed reference line is named here rather than on the chart,
      // where 30 bars leave no room for a label.
      return average !== null
        ? `Hours per night, stacked by sleep period. The dashed line is your average, ${formatDuration(average)}.`
        : 'Hours per night, stacked by sleep period.';
    case 'schedule':
      return 'Indigo is bedtime, amber is your final wake-up. The band is the night.';
    case 'consistency':
      return 'How far each night strayed from your own median.';
  }
}

/** The legend. Three colours carry the whole feature, so they are named. */
function Legend({ mode }: { mode: Mode }) {
  const items =
    mode === 'consistency'
      ? [
          { color: C.first, label: 'Later than usual' },
          { color: C.earlier, label: 'Earlier than usual' },
        ]
      : mode === 'schedule'
        ? [
            { color: C.first, label: 'Bedtime' },
            { color: C.fajr, label: 'Final wake-up' },
          ]
        : [
            { color: C.first, label: 'First sleep' },
            { color: C.fajr, label: 'After Fajr' },
            { color: C.later, label: 'Back to sleep' },
            { color: C.awake, label: 'Awake' },
          ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-night-400">
          <span className="h-2 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The night the cursor is on, spelled out. A thirty-row chart is for spotting
 * the pattern; this line is for confirming what the row you noticed actually
 * says, without leaving for the history page.
 */
function Inspector({ slot }: { slot: NightSlot | null }) {
  if (!slot) {
    return (
      <p className="text-xs text-night-400">Hover or tap a night to read it.</p>
    );
  }
  if (!slot.night) {
    return (
      <p className="text-xs text-night-400">
        <span className="font-medium text-night-300">{formatShortDate(slot.date)}</span> — nothing
        logged.
      </p>
    );
  }

  const night = slot.night;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="font-semibold text-night-100">{formatNightRange(night)}</span>
      <span className="font-semibold tabular-nums text-dream-300">
        {formatDuration(night.totalMinutes)}
      </span>
      {night.periods.map((period) => (
        <span key={period.row.id} className="tabular-nums text-night-300">
          <span className="text-night-400">{describePeriod(night, period)} </span>
          {formatTime(period.start)}–{formatTime(period.end)}
        </span>
      ))}
      {night.gaps.map((gap) => (
        <Chip key={gap.from.getTime()} tone={gap.fajr ? 'dawn' : 'neutral'}>
          {gap.fajr ? 'Fajr' : 'Awake'} {formatDuration(gap.minutes)}
        </Chip>
      ))}
    </div>
  );
}

/**
 * The 30-night chart and its view switcher. The hovered night is held here
 * rather than inside each chart, so switching views keeps your place.
 */
export function SleepChartCard({
  slots,
  average,
  consistency,
}: {
  slots: NightSlot[];
  /** Mean nightly sleep, for the duration view's reference line. */
  average: number | null;
  consistency: Consistency | null;
}) {
  const [mode, setMode] = useState<Mode>('timeline');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const active = activeKey ? slots.find((s) => s.key === activeKey) ?? null : null;

  return (
    <section className="rounded-2xl border border-night-700/70 bg-night-850/70 p-4 backdrop-blur-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-night-100">Last 30 nights</h2>
          <p className="mt-0.5 text-xs text-night-400">{captionFor(mode, average)}</p>
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
          <Segmented options={MODES} value={mode} onChange={setMode} label="Visualisation" />
        </div>
      </div>

      <div className="mt-3 min-h-[18px]">
        <Inspector slot={active} />
      </div>

      {/* Measured, not scaled: see the note at the top of this file. */}
      <div ref={ref} className="mt-2 w-full">
        {width > 0 &&
          (mode === 'timeline' ? (
            <TimelineChart
              slots={slots}
              width={width}
              activeKey={activeKey}
              onHover={setActiveKey}
            />
          ) : mode === 'duration' ? (
            <DurationChart
              slots={slots}
              width={width}
              average={average}
              activeKey={activeKey}
              onHover={setActiveKey}
            />
          ) : mode === 'schedule' ? (
            <ScheduleChart
              slots={slots}
              width={width}
              activeKey={activeKey}
              onHover={setActiveKey}
            />
          ) : consistency ? (
            <ConsistencyChart
              slots={slots}
              width={width}
              consistency={consistency}
              activeKey={activeKey}
              onHover={setActiveKey}
            />
          ) : (
            <p className="py-10 text-center text-sm text-night-400">
              Log three nights and this will show how regular your schedule is.
            </p>
          ))}
      </div>

      <div className="mt-3 border-t border-night-700/60 pt-3">
        <Legend mode={mode} />
      </div>
    </section>
  );
}

/**
 * One night drawn on its own, at the same clock scale logic as the timeline —
 * the dashboard's hero. Periods, the gaps between them, and their labels.
 */
export function NightStrip({ night }: { night: Night }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const start = offsetInNight(night, night.bedtime);
  const end = offsetInNight(night, night.finalWake);
  const span = Math.max(1, end - start);
  const height = 46;
  const barY = 14;
  const barH = 18;

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Last night's sleep periods">
          <rect x={0} y={barY} width={width} height={barH} rx={barH / 2} fill={C.track} />

          {night.gaps.map((gap) => {
            const x1 = ((offsetInNight(night, gap.from) - start) / span) * width;
            const x2 = ((offsetInNight(night, gap.to) - start) / span) * width;
            const y = barY + barH / 2;
            return (
              <Fragment key={gap.from.getTime()}>
                <line
                  x1={x1}
                  x2={x2}
                  y1={y}
                  y2={y}
                  stroke={gap.fajr ? C.fajr : C.awake}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={barY - 4}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={gap.fajr ? C.fajr : C.axis}
                >
                  {gap.fajr ? 'Fajr' : 'Awake'} {formatDuration(gap.minutes)}
                </text>
              </Fragment>
            );
          })}

          {night.periods.map((period) => {
            const x = ((offsetInNight(night, period.start) - start) / span) * width;
            const w = Math.max(
              2,
              ((offsetInNight(night, period.end) - start) / span) * width - x
            );
            // Labels are dropped from any segment too narrow to hold them,
            // rather than overflowing into the neighbouring one.
            const roomy = w > 62;
            return (
              <Fragment key={period.row.id}>
                <rect
                  x={x}
                  y={barY}
                  width={w}
                  height={barH}
                  rx={Math.min(barH / 2, w / 2)}
                  fill={periodFill(night, period)}
                />
                {roomy && (
                  <text
                    x={x + w / 2}
                    y={barY + barH / 2 + 3.4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="#0b1020"
                  >
                    {formatDuration(period.minutes)}
                  </text>
                )}
                <text x={x} y={height - 2} fontSize={9.5} fill={C.axis}>
                  {formatTime(period.start)}
                </text>
              </Fragment>
            );
          })}

          <text x={width} y={height - 2} textAnchor="end" fontSize={9.5} fill={C.axis}>
            {formatTime(night.finalWake)}
          </text>
        </svg>
      )}
    </div>
  );
}
