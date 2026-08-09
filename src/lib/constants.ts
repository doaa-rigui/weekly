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
