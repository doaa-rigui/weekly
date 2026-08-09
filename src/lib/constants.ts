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

export type DayTagValue = 'remote' | 'office' | 'free';

/** Clicking a day's tag steps through this list and wraps back to null (no tag). */
export const DAY_TAG_CYCLE: (DayTagValue | null)[] = ['remote', 'office', 'free', null];

export const DAY_TAG_STYLES: Record<DayTagValue, { label: string; className: string }> = {
  remote: { label: 'Remote', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  office: { label: 'Office', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  free: { label: 'Free', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

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

export const PALETTE = [
  '#2563eb',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#4f46e5',
  '#0d9488',
  '#65a30d',
  '#ea580c',
  '#9333ea',
];
