export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const FULL_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * Which column of `DAYS` a date falls in. `DAYS` is Monday-first, while
 * `Date#getDay` counts from Sunday, so the two need shifting apart.
 */
export function dayIndexOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Milliseconds until the next local midnight, when the marker has to move on. */
export function msUntilNextMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/** Longest day-tag label the picker will store, so pills stay pill-shaped. */
export const DAY_TAG_LABEL_MAX = 24;

/**
 * Pill colours for a planner's day tags, handed out in order as they are
 * added. Mid-weight, so white text sits on them and they don't shout over the
 * blocks in the grid.
 *
 * Drawn from the garden the rest of the app is painted in: the hues are still
 * spread right around the wheel so eight tags stay tellable apart, but each
 * one is pulled towards the page's green-grey instead of running at full
 * saturation. A pure `#dc2626` on this paper reads as an alarm.
 */
export const DAY_TAG_PALETTE = [
  '#5c7f63',
  '#3f7d78',
  '#3d6b96',
  '#6b5f9e',
  '#8e5486',
  '#a9556a',
  '#6f7d33',
  '#2f7350',
] as const;

/** Lower bound, upper bound and default for how many days a planner runs. */
export const MIN_PLANNER_DAYS = 1;
export const MAX_PLANNER_DAYS = 31;
export const DEFAULT_PLANNER_DAYS = 7;

/** The lengths worth one click in the create panel. */
export const PLANNER_LENGTH_PRESETS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
] as const;

/**
 * Below this the day columns stop being usable, so a long planner scrolls
 * sideways instead of squeezing.
 */
export const MIN_DAY_COLUMN_WIDTH = 72;

/**
 * Weekday names only mean something when the planner's length lines up with a
 * week — seven days, a fortnight, three weeks. A ten-day planner is numbered
 * days instead, since calling day 8 "Monday" would be a lie.
 */
export function isWeekBased(dayCount: number): boolean {
  return dayCount <= 7 || dayCount % 7 === 0;
}

export type DayLabel = {
  /** Column heading: "Mon", or "D8" when the planner isn't week-shaped. */
  short: string;
  /** Spelled out, for titles and the edit panel: "Monday, week 2". */
  full: string;
  /** 1-based, and only shown once a planner runs longer than a week. */
  week: number;
};

/**
 * What each column of a planner is called. Monday-first, cycling through the
 * weekdays for as many weeks as the planner runs.
 */
export function dayLabelsFor(dayCount: number): DayLabel[] {
  const weekBased = isWeekBased(dayCount);
  const weeks = Math.ceil(dayCount / 7);

  return Array.from({ length: dayCount }, (_, i) => {
    const week = Math.floor(i / 7) + 1;
    if (!weekBased) {
      return { short: `D${i + 1}`, full: `Day ${i + 1}`, week };
    }
    const name = FULL_DAYS[i % 7];
    return {
      short: DAYS[i % 7],
      full: weeks > 1 ? `${name}, week ${week}` : name,
      week,
    };
  });
}

/**
 * "Every day", "Mon – Fri" for a run, otherwise "Mon, Wed, Fri". Takes the
 * planner's own labels, since a fortnight has two Mondays and a numbered
 * planner has no weekdays at all.
 */
export function summarizeDays(days: number[], labels: DayLabel[]): string {
  if (days.length === 0) return 'No days';
  const sorted = [...days].sort((a, b) => a - b);
  const name = (day: number) => labels[day]?.short ?? `D${day + 1}`;

  if (sorted.length === labels.length && labels.length > 0) return 'Every day';
  const isRun = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isRun && sorted.length > 2) return `${name(sorted[0])} – ${name(sorted[sorted.length - 1])}`;
  return sorted.map(name).join(', ');
}

/** Total minutes in a day. */
export const MINUTES_PER_DAY = 1440;

/** Each hour row is 48px tall. */
export const HOUR_HEIGHT = 48;

/** Each quarter-hour slot is 12px tall. */
export const SLOT_HEIGHT = HOUR_HEIGHT / 4; // 12px

/** Number of minutes per slot. */
export const SLOT_MINUTES = 15;

/** Total number of slots per day (96 for 15-min granularity). */
export const SLOTS_PER_DAY = MINUTES_PER_DAY / SLOT_MINUTES;

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Width of the left-hand time gutter column, in px. */
export const GUTTER_WIDTH = 56;

/** Height of the day-name header row, in px. */
export const HEADER_HEIGHT = 68;

/** Which picker a remembered custom colour came from. */
export type ColorKind = 'block' | 'text';

/** How many custom colours to remember per picker. */
export const RECENT_COLOR_LIMIT = 5;

export const DEFAULT_TEXT_COLOR = '#ffffff';

/**
 * Readable label colours: light ones for dark blocks, dark ones for pale
 * blocks. The greys in between are the page's own sage ramp, so a label never
 * introduces a neutral the rest of the planner doesn't use.
 */
export const TEXT_PALETTE = ['#ffffff', '#f4f6f2', '#d8e0d3', '#6c7d68', '#354034', '#000000'];

/**
 * One row of six in the picker, so the edit panel stays short enough to fit on
 * screen. Hues are spread wide apart to keep adjacent blocks distinguishable;
 * anything else is reachable through the custom picker.
 *
 * Garden weights rather than the primaries: every one is dark enough to carry
 * white text, and none is more saturated than the moss the app accents with —
 * a grid of them should look like a planted week, not a paint box.
 */
export const PALETTE = ['#4f7157', '#3b6f6b', '#3f6491', '#6b5183', '#9c4f61', '#6f7d33'];

/**
 * Avatar colours for tagged people, handed out in order as people are added so
 * two names in the same block rarely look alike. A step darker than the block
 * palette they sit on top of, and dark enough for white initials.
 */
export const PEOPLE_PALETTE = [
  '#3f6b52',
  '#2f6b66',
  '#34608a',
  '#5a5290',
  '#7a4a76',
  '#8f4757',
  '#667a2e',
  '#2b5f43',
] as const;

/** Longest name the picker will store, so avatars and chips stay in shape. */
export const PERSON_NAME_MAX = 32;

/** How many avatars a block shows before collapsing the rest into "+N". */
export const AVATARS_PER_BLOCK = 3;

/** "Marie Curie" -> "MC", "dodo" -> "D". What an avatar shows. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? '');
  return letters.join('').toUpperCase();
}
