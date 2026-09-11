/**
 * The sleep tracker's domain model. Everything here is pure — the charts, the
 * dashboard and the history page all read the same derived shapes, so a night
 * can never look one way in the chart and another in the list.
 *
 * The central distinction, and the reason this file exists at all:
 *
 *   a *period* is one continuous stretch of sleep — one database row
 *   a *night*  is the group of periods that belong together
 *
 * Waking for Fajr and going back to bed is two periods of one night. Treating
 * a night as a row would make it two half-nights, and the fragmentation — the
 * thing actually worth seeing — would vanish into the averages.
 */

/** One continuous stretch of sleep, exactly as stored. */
export type SleepPeriod = {
  id: string;
  user_id: string;
  /** Fell asleep. */
  started_at: string;
  /** Woke up. Always after `started_at`; the database enforces it. */
  ended_at: string;
  note: string | null;
  created_at: string;
};

/** What the add-sleep form hands to the store. */
export type SleepDraft = {
  started_at: Date;
  ended_at: Date;
  note: string;
};

// -- Night boundaries --------------------------------------------------------

/**
 * A period starting before local noon belongs to the previous evening's night.
 *
 * This is what makes 06:00 → 07:00 the *second half* of last night rather than
 * the start of tonight. Noon is the quietest possible place to cut: almost
 * nobody falls asleep within a few hours of it, so the rule mislabels as little
 * as possible. An afternoon nap is filed under the night that follows it, which
 * is the honest reading — it is the day's first sleep, not last night's last.
 */
const NIGHT_CUTOFF_HOUR = 12;

/** Minutes in a day, and in an hour. Enough arithmetic here to name them. */
export const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;

/** Local `YYYY-MM-DD`. Not `toISOString`, which would shift across midnight. */
export function isoDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local midnight of the evening a period belongs to. */
export function nightStartOf(start: Date): Date {
  const evening = new Date(start);
  evening.setHours(0, 0, 0, 0);
  if (start.getHours() < NIGHT_CUTOFF_HOUR) evening.setDate(evening.getDate() - 1);
  return evening;
}

/** The `YYYY-MM-DD` a night is grouped and sorted by. */
export function nightKeyOf(start: Date): string {
  return isoDateOf(nightStartOf(start));
}

// -- Fajr ---------------------------------------------------------------------

/**
 * When a gap between two sleep periods reads as waking for Fajr rather than
 * as ordinary broken sleep: a short pre-dawn waking.
 *
 * Prayer times move through the year and with latitude, so this is a heuristic
 * and named as one — the app labels such a gap "Fajr" and every other gap
 * "Awake". What it never depends on is the *structural* fact, which is exact:
 * this is the gap before the night's second sleep period.
 */
const FAJR_WINDOW_START = 3 * MINUTES_PER_HOUR;
const FAJR_WINDOW_END = 7 * MINUTES_PER_HOUR + 30;
const FAJR_GAP_MAX_MINUTES = 150;

/** The awake stretch between two of a night's sleep periods. */
export type SleepGap = {
  /** Woke up — the end of the period before. */
  from: Date;
  /** Fell back asleep — the start of the period after. */
  to: Date;
  minutes: number;
  /** Whether this reads as waking for Fajr. See the constants above. */
  fajr: boolean;
};

function isFajrGap(from: Date, minutes: number): boolean {
  const minuteOfDay = from.getHours() * MINUTES_PER_HOUR + from.getMinutes();
  return (
    minutes <= FAJR_GAP_MAX_MINUTES &&
    minuteOfDay >= FAJR_WINDOW_START &&
    minuteOfDay <= FAJR_WINDOW_END
  );
}

// -- Derived shapes ----------------------------------------------------------

/** A stored period with the arithmetic already done. */
export type Period = {
  row: SleepPeriod;
  start: Date;
  end: Date;
  minutes: number;
  /**
   * 0 for the night's first sleep, 1 for the sleep after the first waking, and
   * so on. This is what "initial sleep" vs "sleep after Fajr" is drawn from.
   */
  index: number;
};

/** One night: the periods that belong together, and what they add up to. */
export type Night = {
  /** `YYYY-MM-DD` of the evening. Unique, and sorts chronologically. */
  key: string;
  /** Local midnight of the evening, for labelling and for chart offsets. */
  date: Date;
  /** Chronological. Always at least one. */
  periods: Period[];
  /** The awake stretches between them. One fewer than `periods`. */
  gaps: SleepGap[];
  /** Time actually asleep — the periods only, never the gaps. */
  totalMinutes: number;
  /** Fell asleep, the first time. */
  bedtime: Date;
  /** Woke up, the last time — the one that stuck. */
  finalWake: Date;
  /** More than one period: the night was broken. */
  fragmented: boolean;
  /** Whether any gap reads as Fajr. */
  hasFajr: boolean;
};

function buildNight(key: string, rows: SleepPeriod[]): Night {
  const periods: Period[] = rows
    .map((row) => {
      const start = new Date(row.started_at);
      const end = new Date(row.ended_at);
      return {
        row,
        start,
        end,
        minutes: Math.round((end.getTime() - start.getTime()) / 60000),
        index: 0,
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((p, i) => ({ ...p, index: i }));

  const gaps: SleepGap[] = [];
  for (let i = 1; i < periods.length; i += 1) {
    const from = periods[i - 1].end;
    const to = periods[i].start;
    const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
    // Overlapping or touching rows leave no gap to draw.
    if (minutes <= 0) continue;
    gaps.push({ from, to, minutes, fajr: isFajrGap(from, minutes) });
  }

  return {
    key,
    date: nightStartOf(periods[0].start),
    periods,
    gaps,
    totalMinutes: periods.reduce((sum, p) => sum + p.minutes, 0),
    bedtime: periods[0].start,
    finalWake: periods[periods.length - 1].end,
    fragmented: periods.length > 1,
    hasFajr: gaps.some((g) => g.fajr),
  };
}

/**
 * Groups periods into nights, newest night first — the order both the chart
 * and the history page want, since the most recent night is the interesting one.
 */
export function groupIntoNights(rows: SleepPeriod[]): Night[] {
  const byKey = new Map<string, SleepPeriod[]>();
  for (const row of rows) {
    const key = nightKeyOf(new Date(row.started_at));
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return [...byKey.entries()]
    .map(([key, group]) => buildNight(key, group))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

// -- Chart windows -----------------------------------------------------------

/** How many nights the headline visualisation covers. */
export const CHART_NIGHTS = 30;

/**
 * The last `count` calendar nights ending tonight, oldest first, with a `null`
 * wherever nothing was logged.
 *
 * Charts need the gaps. Plotting only the nights that exist would quietly close
 * up a missed night and draw a false trend line across it; a hole in the row is
 * the truth, and reads as one.
 */
export type NightSlot = { key: string; date: Date; night: Night | null };

export function nightSlots(nights: Night[], count = CHART_NIGHTS, now = new Date()): NightSlot[] {
  const byKey = new Map(nights.map((n) => [n.key, n]));
  // Tonight is the night currently in progress: before noon, that is still
  // yesterday evening's, so the same cutoff decides it.
  const latest = nightStartOf(now);

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(latest);
    date.setDate(date.getDate() - (count - 1 - i));
    const key = isoDateOf(date);
    return { key, date, night: byKey.get(key) ?? null };
  });
}

/**
 * Minutes from a night's own midnight. Bedtime at 22:38 is 1358; waking at
 * 07:00 the next morning is 1860, not 420 — which is what lets one night be
 * drawn as a single unbroken run across the timeline instead of wrapping.
 */
export function offsetInNight(night: Night, at: Date): number {
  return Math.round((at.getTime() - night.date.getTime()) / 60000);
}

// -- Formatting --------------------------------------------------------------

/** `7h 30m`, `45m`, `8h`. What a duration looks like everywhere in the app. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / MINUTES_PER_HOUR);
  const m = total % MINUTES_PER_HOUR;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** `10:38 PM`. */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** `10:38 PM` from minutes past a night's midnight — for chart axis labels. */
export function formatClockOffset(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(wrapped / MINUTES_PER_HOUR);
  const m = wrapped % MINUTES_PER_HOUR;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** `Sep 9`. */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `Tue, Sep 9`. */
export function formatWeekdayDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * How a night is named: `Tue, Sep 9 → Wed, Sep 10`, because a night belongs to
 * two dates and naming only one of them is how people end up looking at the
 * wrong row. Takes the evening date, so the add-sleep form can name a night
 * that doesn't exist yet.
 */
export function formatNightRangeOf(evening: Date): string {
  const morning = new Date(evening);
  morning.setDate(morning.getDate() + 1);
  return `${formatWeekdayDate(evening)} → ${formatWeekdayDate(morning)}`;
}

export function formatNightRange(night: Night): string {
  return formatNightRangeOf(night.date);
}

/**
 * `Sep 9 → Sep 10`. The same two dates without their weekdays, for places
 * that already name the day some other way — the history page shows it beside
 * a date badge, where "Wed" would be said twice.
 */
export function formatNightRangeCompact(night: Night): string {
  const morning = new Date(night.date);
  morning.setDate(morning.getDate() + 1);
  return `${formatShortDate(night.date)} → ${formatShortDate(morning)}`;
}

/** `Wed`. The weekday alone, for the history page's date badge. */
export function formatWeekdayShort(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

/** `Last night`, `Tonight`, `2 nights ago`, else the date. */
export function describeNightAge(night: Night, now = new Date()): string {
  return describeNightRecency(night, now) ?? formatShortDate(night.date);
}

/**
 * `Tonight`, `Last night`, `2 nights ago` — or null once the night is far
 * enough back that counting nights stops meaning anything.
 *
 * Separate from `describeNightAge` because a caller that already shows the
 * date needs to know whether there is anything *else* to say: the history
 * page's night cards carry a date badge, and falling back to the date there
 * would print it three times in one heading.
 */
export function describeNightRecency(night: Night, now = new Date()): string | null {
  const today = nightStartOf(now);
  const days = Math.round((today.getTime() - night.date.getTime()) / 86400000);
  if (days <= 0) return 'Tonight';
  if (days === 1) return 'Last night';
  if (days < 7) return `${days} nights ago`;
  return null;
}

/** What a period is called, given where it falls in its night. */
export function describePeriod(night: Night, period: Period): string {
  if (period.index === 0) return night.fragmented ? 'First sleep' : 'Sleep';
  const gapBefore = night.gaps[period.index - 1];
  if (gapBefore?.fajr) return 'After Fajr';
  return period.index === 1 ? 'Back to sleep' : `Sleep ${period.index + 1}`;
}

// -- Statistics --------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Mean absolute deviation from the median — minutes of typical drift. */
function drift(values: number[]): number {
  if (values.length < 2) return 0;
  const mid = median(values);
  return mean(values.map((v) => Math.abs(v - mid)));
}

/**
 * The drift at which consistency reads as 0. Two hours of typical wander in
 * when you go to bed is a schedule that isn't one, so that is the floor.
 */
const DRIFT_FLOOR_MINUTES = 120;

/** 0–100. Higher is a more regular schedule. */
function scoreFromDrift(driftMinutes: number): number {
  return Math.round(Math.max(0, 1 - driftMinutes / DRIFT_FLOOR_MINUTES) * 100);
}

/**
 * How regular a schedule is, from how far bedtimes and final wake-ups wander
 * from their own median. Offsets are measured from each night's midnight, so
 * midnight-crossing bedtimes compare without wrapping.
 */
export type Consistency = {
  /** 0–100, the two halves averaged. */
  score: number;
  /** Typical minutes away from the median bedtime. */
  bedtimeDrift: number;
  /** Typical minutes away from the median wake time. */
  wakeDrift: number;
  /** Minutes past midnight, so `formatClockOffset` can name them. */
  medianBedtime: number;
  medianWake: number;
  /** How many nights the numbers are based on. */
  nights: number;
};

export function consistencyOf(nights: Night[]): Consistency | null {
  if (nights.length < 3) return null;
  const bedtimes = nights.map((n) => offsetInNight(n, n.bedtime));
  const wakes = nights.map((n) => offsetInNight(n, n.finalWake));
  const bedtimeDrift = drift(bedtimes);
  const wakeDrift = drift(wakes);

  return {
    score: Math.round((scoreFromDrift(bedtimeDrift) + scoreFromDrift(wakeDrift)) / 2),
    bedtimeDrift: Math.round(bedtimeDrift),
    wakeDrift: Math.round(wakeDrift),
    medianBedtime: Math.round(median(bedtimes)),
    medianWake: Math.round(median(wakes)),
    nights: nights.length,
  };
}

/** The window the trend compares against the one before it. */
const TREND_WINDOW_NIGHTS = 7;

/** The dashboard's at-a-glance numbers. */
export type SleepSummary = {
  /** The most recent night logged, or null on a fresh account. */
  latest: Night | null;
  /** Mean nightly sleep over the last week of *logged* nights. */
  weekAverage: number | null;
  /** Mean nightly sleep over the whole 30-night window. */
  monthAverage: number | null;
  /**
   * Minutes the last week differs from the week before. Null until there are
   * two weeks to compare, since a trend from one week is just a number.
   */
  trendMinutes: number | null;
  /**
   * The typical clock times of the 30-night window, as minutes past the
   * night's own midnight — so `formatClockOffset` names them, and an 11 PM
   * bedtime averages as 11 PM rather than wrapping through noon. Null until
   * there is a night to average.
   */
  averageBedtime: number | null;
  averageWake: number | null;
  /** Nights logged in the 30-night window. */
  loggedNights: number;
  /** How many of those were broken. */
  fragmentedNights: number;
  consistency: Consistency | null;
};

/**
 * `nights` is expected newest-first, as `groupIntoNights` returns it. Averages
 * count logged nights only: a missed night is a night we know nothing about,
 * and averaging it in as zero would read as insomnia.
 */
export function summarize(nights: Night[]): SleepSummary {
  const window = nights.slice(0, CHART_NIGHTS);
  const recent = window.slice(0, TREND_WINDOW_NIGHTS);
  const previous = window.slice(TREND_WINDOW_NIGHTS, TREND_WINDOW_NIGHTS * 2);

  const durations = (group: Night[]) => group.map((n) => n.totalMinutes);
  const weekAverage = recent.length ? Math.round(mean(durations(recent))) : null;

  return {
    latest: nights[0] ?? null,
    weekAverage,
    monthAverage: window.length ? Math.round(mean(durations(window))) : null,
    trendMinutes:
      weekAverage !== null && previous.length >= 3
        ? Math.round(weekAverage - mean(durations(previous)))
        : null,
    averageBedtime: window.length
      ? Math.round(mean(window.map((n) => offsetInNight(n, n.bedtime))))
      : null,
    averageWake: window.length
      ? Math.round(mean(window.map((n) => offsetInNight(n, n.finalWake))))
      : null,
    loggedNights: window.length,
    fragmentedNights: window.filter((n) => n.fragmented).length,
    consistency: consistencyOf(window),
  };
}

// -- Form helpers ------------------------------------------------------------

/** `<input type="datetime-local">` speaks local `YYYY-MM-DDTHH:mm`. */
export function toLocalInputValue(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${isoDateOf(date)}T${hh}:${mm}`;
}

/** Reads that same format back. Null while the field is empty or half-typed. */
export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Longest note kept, so the history rows and the form stay in proportion. */
export const NOTE_MAX = 280;

/**
 * Why a draft can't be saved, or null when it can. One message at a time: the
 * form has three fields and stacking errors on all of them helps nobody.
 */
export function validateDraft(start: Date | null, end: Date | null): string | null {
  if (!start) return 'Pick when you fell asleep.';
  if (!end) return 'Pick when you woke up.';
  if (end.getTime() <= start.getTime()) return 'Wake-up has to come after falling asleep.';
  const minutes = (end.getTime() - start.getTime()) / 60000;
  // Past this it is far more likely a mistyped date than a real sleep.
  if (minutes > MINUTES_PER_DAY) return "That's over 24 hours — check the dates.";
  return null;
}

/**
 * The already-logged period a new one would collide with, if any.
 *
 * Worth blocking rather than warning about: two overlapping periods would both
 * be counted, so the night's total would exceed the time between its bedtime
 * and its final wake-up, and every average built on it would be wrong.
 */
export function findOverlap(
  rows: SleepPeriod[],
  start: Date,
  end: Date,
  /** The row being edited, which cannot collide with itself. */
  ignoreId?: string
): SleepPeriod | null {
  const from = start.getTime();
  const to = end.getTime();
  return (
    rows.find((row) => {
      if (row.id === ignoreId) return false;
      const rowFrom = new Date(row.started_at).getTime();
      const rowTo = new Date(row.ended_at).getTime();
      // Touching end-to-end is fine — that is exactly how a night's second
      // period begins. Only a genuine overlap counts.
      return from < rowTo && to > rowFrom;
    }) ?? null
  );
}

/**
 * A sensible pair of times for a fresh form: last night, bedtime to wake-up,
 * so the common case is a glance and a save rather than four fields of typing.
 */
export function suggestedDraftTimes(now = new Date()): { start: Date; end: Date } {
  const evening = nightStartOf(now);
  const start = new Date(evening);
  start.setHours(23, 0, 0, 0);
  const end = new Date(evening);
  end.setDate(end.getDate() + 1);
  end.setHours(7, 0, 0, 0);
  return { start, end };
}
