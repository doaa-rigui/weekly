/**
 * The habit tracker's domain model. Everything here is pure: Today, Stats and
 * the habit list all read the same derived shapes, so a streak can never be
 * one number on one page and another number on the next.
 *
 * Two ideas carry the whole app.
 *
 * **A day is *due* or it isn't.** A habit that runs every weekday simply does
 * not exist on a Sunday — it is not an unfinished Sunday task. Every count in
 * this file divides by days a habit was actually due, never by calendar days,
 * because the alternative quietly punishes anyone whose habits aren't daily.
 *
 * **A day with no entry is pending, not failed.** `undone` is something the
 * user said out loud, optionally with a note. Today at 9am is not a bad day
 * yet, and the progress bar has to agree.
 */

/**
 * Four icons are aliased — `Map`, `Image`, `Video`, `Radio` — because they
 * share a name with a global this file or its neighbours use. `Map` is the
 * live one: `new Map()` in here would otherwise try to construct an SVG
 * component. The stored keys are unaffected; only the local binding moves.
 */
import {
  Activity,
  AlarmClock,
  Anchor,
  Apple,
  Archive,
  Armchair,
  Award,
  Axe,
  Baby,
  Banana,
  Bandage,
  Banknote,
  Bath,
  Bed,
  BedDouble,
  Beef,
  Beer,
  Bike,
  Bird,
  Book,
  BookMarked,
  BookOpen,
  Bookmark,
  Brain,
  BrainCog,
  Briefcase,
  BriefcaseMedical,
  Brush,
  Building2,
  Bus,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarHeart,
  Camera,
  Candy,
  Car,
  Carrot,
  Cat,
  ChartColumn,
  ChartPie,
  CheckCheck,
  ChefHat,
  Cherry,
  Church,
  Clapperboard,
  ClipboardList,
  Clock,
  Cloud,
  CloudRain,
  Code,
  Coffee,
  Coins,
  Compass,
  Cookie,
  CookingPot,
  CreditCard,
  Croissant,
  Cross,
  Crown,
  CupSoda,
  Database,
  Dog,
  DollarSign,
  Drill,
  Droplet,
  Droplets,
  Dumbbell,
  EggFried,
  Eraser,
  Facebook,
  Feather,
  FileText,
  Files,
  Film,
  Fish,
  Flag,
  Flame,
  Flower,
  Flower2,
  Folder,
  FolderOpen,
  Footprints,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  GlassWater,
  Glasses,
  Globe,
  GraduationCap,
  Grape,
  Guitar,
  Hammer,
  Hand,
  HandCoins,
  HandHeart,
  Headphones,
  Heart,
  HeartHandshake,
  HeartPulse,
  Highlighter,
  Home,
  Hourglass,
  House,
  IceCream,
  Image as ImageIcon,
  Inbox,
  Instagram,
  Keyboard,
  Lamp,
  LampDesk,
  Landmark,
  Languages,
  Laptop,
  Leaf,
  LeafyGreen,
  Library,
  Lightbulb,
  ListChecks,
  ListTodo,
  Mail,
  Map as MapIcon,
  MapPin,
  Medal,
  MessageCircle,
  MessageSquare,
  Mic,
  Milk,
  Monitor,
  Moon,
  MoonStar,
  Mountain,
  MountainSnow,
  Mouse,
  Music,
  Music2,
  Notebook,
  NotebookPen,
  Nut,
  Package,
  PaintBucket,
  Paintbrush,
  Palette,
  PawPrint,
  PenLine,
  PenTool,
  Pencil,
  PersonStanding,
  Phone,
  PhoneCall,
  Piano,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Printer,
  Rabbit,
  Radio as RadioIcon,
  Receipt,
  Recycle,
  Refrigerator,
  Ruler,
  Sailboat,
  Salad,
  Sandwich,
  School,
  Scissors,
  ScrollText,
  Send,
  Server,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Shovel,
  ShowerHead,
  Smartphone,
  SmartphoneCharging,
  Snowflake,
  Sofa,
  Soup,
  Sparkles,
  Sprout,
  Squirrel,
  Star,
  Stethoscope,
  StickyNote,
  Store,
  Sun,
  Sunrise,
  Sunset,
  Syringe,
  Tablet,
  Target,
  Tent,
  Terminal,
  Thermometer,
  Timer,
  TimerReset,
  Train,
  TramFront,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  TrendingUp,
  Trophy,
  Tv,
  Twitter,
  User,
  UserPlus,
  Users,
  Utensils,
  UtensilsCrossed,
  Video as VideoIcon,
  Wallet,
  Watch,
  Waves,
  Wheat,
  Wind,
  Wine,
  Wrench,
  Youtube,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// -- Rows --------------------------------------------------------------------

/** One of the three things the user can say about a habit on a given day. */
export type HabitStatus = 'done' | 'skipped' | 'undone';

/**
 * What a habit's day looks like once it has been answered. A day with no row
 * is *pending*, which is why so much of this file deals in
 * `HabitStatus | null` rather than in `HabitStatus`.
 */
export type HabitEntry = {
  id: string;
  user_id: string;
  habit_id: string;
  /** Local `YYYY-MM-DD`, written by the client — see the migration. */
  on_date: string;
  status: HabitStatus;
  /** Only ever set on `undone`, and optional even there. */
  note: string | null;
  updated_at: string;
};

/** One habit, exactly as stored. `frequency` is parsed before it is used. */
export type HabitRecord = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  frequency: unknown;
  anchor_date: string;
  sort_order: number;
  created_at: string;
};

/** A habit with its recurrence already parsed. What every component works with. */
export type Habit = Omit<HabitRecord, 'frequency'> & { frequency: Frequency };

/** What the add/edit form hands to the store. */
export type HabitDraft = {
  name: string;
  icon: string;
  color: string;
  frequency: Frequency;
};

export const HABIT_NAME_MAX = 60;
export const HABIT_NOTE_MAX = 240;

// -- Recurrence ---------------------------------------------------------------

/**
 * Weekdays are 0 = Monday … 6 = Sunday, not JavaScript's 0 = Sunday. A week
 * that starts on Monday puts the weekend at the end where the user sees it,
 * and every `weekdays` array in the database is written in these terms.
 */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Monday-first weekday index of a date. */
export function weekdayOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Every schedule the app can express, in three shapes. "Every day", "every
 * Monday", "every weekday" and "every weekend" are all the first shape with a
 * different set — which is why the form offers one named schedule and one
 * editor rather than a row of shortcuts in front of the same three shapes.
 */
export type Frequency =
  /** On these weekdays, every week. */
  | { kind: 'weekly'; weekdays: number[] }
  /**
   * Every `every` days, counted from the habit's anchor date; or every `every`
   * weeks, on `weekdays` within the weeks that land on the cycle.
   */
  | { kind: 'interval'; unit: 'day' | 'week'; every: number; weekdays: number[] }
  /** On these days of the month, clamped to the length of short months. */
  | { kind: 'monthly'; days: number[] };

export const EVERY_DAY: Frequency = { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] };

/**
 * Reads a `frequency` column. Anything unrecognised — a row from a newer
 * version of the app, or one edited by hand — falls back to daily rather than
 * throwing: a habit that shows up too often is a visible, fixable problem; a
 * Today page that crashes is not.
 */
export function parseFrequency(value: unknown): Frequency {
  if (!value || typeof value !== 'object') return EVERY_DAY;
  const raw = value as Record<string, unknown>;

  const weekdays = cleanDayList(raw.weekdays, 0, 6);

  if (raw.kind === 'weekly') {
    return weekdays.length > 0 ? { kind: 'weekly', weekdays } : EVERY_DAY;
  }

  if (raw.kind === 'interval') {
    const unit = raw.unit === 'week' ? 'week' : 'day';
    const every = clampInt(raw.every, 1, 365, 2);
    // A weekly interval with no weekdays would never come due at all.
    if (unit === 'week' && weekdays.length === 0) return EVERY_DAY;
    return { kind: 'interval', unit, every, weekdays: unit === 'week' ? weekdays : [] };
  }

  if (raw.kind === 'monthly') {
    const days = cleanDayList(raw.days, 1, 31);
    return days.length > 0 ? { kind: 'monthly', days } : { kind: 'monthly', days: [1] };
  }

  return EVERY_DAY;
}

function cleanDayList(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const item of value) {
    const n = Math.trunc(Number(item));
    if (Number.isFinite(n) && n >= min && n <= max) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * A recurrence and the day it counts from. Taking this rather than a whole
 * `Habit` lets the add-habit form preview a schedule that has no row yet.
 */
export type Schedule = { frequency: Frequency; anchor_date: string };

/** Whether `habit` is scheduled on `date`. The one question Today asks. */
export function isDueOn(habit: Schedule, date: Date): boolean {
  const freq = habit.frequency;
  const anchor = parseIsoDate(habit.anchor_date);

  // A habit created on Thursday has no opinion about the Wednesday before it,
  // and counting it as a miss would hand every new habit a broken streak.
  if (startOfDay(date) < startOfDay(anchor)) return false;

  switch (freq.kind) {
    case 'weekly':
      return freq.weekdays.includes(weekdayOf(date));

    case 'interval': {
      if (freq.unit === 'day') {
        return daysBetween(anchor, date) % freq.every === 0;
      }
      if (!freq.weekdays.includes(weekdayOf(date))) return false;
      // Counted in whole weeks from the anchor's own week, so "every 2 weeks"
      // means the same fortnight however far into it the habit was created.
      const weeks = Math.floor(daysBetween(startOfWeek(anchor), startOfWeek(date)) / 7);
      return weeks % freq.every === 0;
    }

    case 'monthly': {
      const day = date.getDate();
      const lastDay = daysInMonth(date);
      // The 31st falls on the 30th in a short month rather than being skipped:
      // "every month" should mean every month.
      return freq.days.some((d) => Math.min(d, lastDay) === day);
    }
  }
}

/**
 * The next day a schedule comes due, at or after `from`. Bounded at a year
 * because every recurrence the app can express repeats within one — a bound is
 * cheaper than proving termination for a shape added later.
 */
export function nextDueDate(schedule: Schedule, from: Date): Date | null {
  for (let i = 0; i < 366; i += 1) {
    const day = addDays(startOfDay(from), i);
    if (isDueOn(schedule, day)) return day;
  }
  return null;
}

/** "Every weekday", "Every 2 weeks on Tue", "On the 1st and 15th". */
export function describeFrequency(freq: Frequency): string {
  switch (freq.kind) {
    case 'weekly': {
      const set = freq.weekdays;
      if (set.length === 7) return 'Every day';
      if (isSameSet(set, [0, 1, 2, 3, 4])) return 'Every weekday';
      if (isSameSet(set, [5, 6])) return 'Every weekend';
      if (set.length === 1) return `Every ${WEEKDAY_NAMES[set[0]]}`;
      return `Every ${set.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
    }
    case 'interval': {
      if (freq.unit === 'day') {
        return freq.every === 1 ? 'Every day' : `Every ${freq.every} days`;
      }
      const days = freq.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ');
      return freq.every === 1 ? `Every week on ${days}` : `Every ${freq.every} weeks on ${days}`;
    }
    case 'monthly': {
      if (freq.days.length === 1) return `Monthly on the ${ordinal(freq.days[0])}`;
      return `Monthly on the ${freq.days.map(ordinal).join(', ')}`;
    }
  }
}

function isSameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// -- Dates --------------------------------------------------------------------

/**
 * Local `YYYY-MM-DD`. Not `toISOString`, which is UTC and would file anything
 * logged late in the evening under tomorrow for half the world.
 */
export function isoDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The inverse, read as a local date rather than as UTC midnight. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Monday of `date`'s week. The domain is Monday-first throughout. */
export function startOfWeek(date: Date): Date {
  return addDays(startOfDay(date), -weekdayOf(date));
}

export function startOfMonth(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(1);
  return copy;
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Whole days from `a` to `b`, immune to daylight saving: both ends are pinned
 * to local midnight first, and the rounding absorbs the 23- and 25-hour days.
 */
export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return isoDateOf(a) === isoDateOf(b);
}

/** Every date from `from` to `to`, inclusive, oldest first. */
export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = startOfDay(from); d <= startOfDay(to); d = addDays(d, 1)) days.push(d);
  return days;
}

const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function formatLongDate(date: Date): string {
  return LONG_DATE.format(date);
}

export function formatShortDate(date: Date): string {
  return SHORT_DATE.format(date);
}

/** "Today", "Yesterday", or the date — for a history list that is mostly recent. */
export function formatRelativeDay(date: Date, today: Date): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatShortDate(date);
}

// -- Icons and colours --------------------------------------------------------

/**
 * The icons a habit can wear, grouped the way someone looking for one would
 * think about it. A fixed set rather than free text: the column stores a key,
 * and an unknown key has to render as *something*, so the set that can be
 * chosen is the set that can be drawn.
 *
 * Named imports rather than `import * as`: the star form would defeat
 * tree-shaking and pull all fifteen hundred of lucide's icons into the bundle
 * to use two hundred of them.
 */
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Activity,
  AlarmClock,
  Anchor,
  Apple,
  Archive,
  Armchair,
  Award,
  Axe,
  Baby,
  Banana,
  Bandage,
  Banknote,
  Bath,
  Bed,
  BedDouble,
  Beef,
  Beer,
  Bike,
  Bird,
  Book,
  BookMarked,
  BookOpen,
  Bookmark,
  Brain,
  BrainCog,
  Briefcase,
  BriefcaseMedical,
  Brush,
  Building2,
  Bus,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarHeart,
  Camera,
  Candy,
  Car,
  Carrot,
  Cat,
  ChartColumn,
  ChartPie,
  CheckCheck,
  ChefHat,
  Cherry,
  Church,
  Clapperboard,
  ClipboardList,
  Clock,
  Cloud,
  CloudRain,
  Code,
  Coffee,
  Coins,
  Compass,
  Cookie,
  CookingPot,
  CreditCard,
  Croissant,
  Cross,
  Crown,
  CupSoda,
  Database,
  Dog,
  DollarSign,
  Drill,
  Droplet,
  Droplets,
  Dumbbell,
  EggFried,
  Eraser,
  Facebook,
  Feather,
  FileText,
  Files,
  Film,
  Fish,
  Flag,
  Flame,
  Flower,
  Flower2,
  Folder,
  FolderOpen,
  Footprints,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  GlassWater,
  Glasses,
  Globe,
  GraduationCap,
  Grape,
  Guitar,
  Hammer,
  Hand,
  HandCoins,
  HandHeart,
  Headphones,
  Heart,
  HeartHandshake,
  HeartPulse,
  Highlighter,
  Home,
  Hourglass,
  House,
  IceCream,
  Image: ImageIcon,
  Inbox,
  Instagram,
  Keyboard,
  Lamp,
  LampDesk,
  Landmark,
  Languages,
  Laptop,
  Leaf,
  LeafyGreen,
  Library,
  Lightbulb,
  ListChecks,
  ListTodo,
  Mail,
  Map: MapIcon,
  MapPin,
  Medal,
  MessageCircle,
  MessageSquare,
  Mic,
  Milk,
  Monitor,
  Moon,
  MoonStar,
  Mountain,
  MountainSnow,
  Mouse,
  Music,
  Music2,
  Notebook,
  NotebookPen,
  Nut,
  Package,
  PaintBucket,
  Paintbrush,
  Palette,
  PawPrint,
  PenLine,
  PenTool,
  Pencil,
  PersonStanding,
  Phone,
  PhoneCall,
  Piano,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Printer,
  Rabbit,
  Radio: RadioIcon,
  Receipt,
  Recycle,
  Refrigerator,
  Ruler,
  Sailboat,
  Salad,
  Sandwich,
  School,
  Scissors,
  ScrollText,
  Send,
  Server,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Shovel,
  ShowerHead,
  Smartphone,
  SmartphoneCharging,
  Snowflake,
  Sofa,
  Soup,
  Sparkles,
  Sprout,
  Squirrel,
  Star,
  Stethoscope,
  StickyNote,
  Store,
  Sun,
  Sunrise,
  Sunset,
  Syringe,
  Tablet,
  Target,
  Tent,
  Terminal,
  Thermometer,
  Timer,
  TimerReset,
  Train,
  TramFront,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  TrendingUp,
  Trophy,
  Tv,
  Twitter,
  User,
  UserPlus,
  Users,
  Utensils,
  UtensilsCrossed,
  Video: VideoIcon,
  Wallet,
  Watch,
  Waves,
  Wheat,
  Wind,
  Wine,
  Wrench,
  Youtube,
  Zap,
};

/** The groups the picker lists, in the order it lists them. */
export const ICON_GROUPS: { name: string; keys: string[] }[] = [
  {
    name: "Faith & reflection",
    keys: [
      'BookOpen',
      'BookMarked',
      'Book',
      'Bookmark',
      'ScrollText',
      'Church',
      'Landmark',
      'Moon',
      'MoonStar',
      'Sunrise',
      'Sunset',
      'Star',
      'Sparkles',
      'Feather',
      'Hand',
      'HandHeart',
      'HeartHandshake',
      'Heart',
      'HandCoins',
      'Gift',
      'Gem',
      'Crown',
      'Compass',
    ],
  },
  {
    name: "Mind & learning",
    keys: [
      'Brain',
      'BrainCog',
      'Lightbulb',
      'GraduationCap',
      'School',
      'Library',
      'Notebook',
      'NotebookPen',
      'StickyNote',
      'PenLine',
      'PenTool',
      'Pencil',
      'Highlighter',
      'Eraser',
      'Ruler',
      'Calculator',
      'Languages',
      'Glasses',
      'FileText',
      'Files',
      'Archive',
      'Folder',
      'FolderOpen',
    ],
  },
  {
    name: "Movement",
    keys: [
      'Dumbbell',
      'Bike',
      'Footprints',
      'PersonStanding',
      'Activity',
      'HeartPulse',
      'Waves',
      'Mountain',
      'MountainSnow',
      'Tent',
      'Sailboat',
      'Ship',
      'Anchor',
      'Trophy',
      'Medal',
      'Award',
      'Target',
      'Flag',
      'Zap',
    ],
  },
  {
    name: "Health & body",
    keys: [
      'Pill',
      'Stethoscope',
      'Syringe',
      'Thermometer',
      'Bandage',
      'Cross',
      'BriefcaseMedical',
      'ShowerHead',
      'Bath',
      'Bed',
      'BedDouble',
      'Snowflake',
      'Flame',
      'Droplet',
      'Droplets',
      'Scissors',
      'Brush',
    ],
  },
  {
    name: "Food & drink",
    keys: [
      'GlassWater',
      'CupSoda',
      'Coffee',
      'Milk',
      'Wine',
      'Beer',
      'Apple',
      'Banana',
      'Cherry',
      'Grape',
      'Carrot',
      'Salad',
      'Soup',
      'Sandwich',
      'Pizza',
      'EggFried',
      'Fish',
      'Beef',
      'Croissant',
      'Cookie',
      'IceCream',
      'Candy',
      'Popcorn',
      'Wheat',
      'Nut',
      'Utensils',
      'UtensilsCrossed',
      'ChefHat',
      'CookingPot',
      'Refrigerator',
    ],
  },
  {
    name: "Home & chores",
    keys: [
      'House',
      'Home',
      'Sofa',
      'Armchair',
      'Lamp',
      'LampDesk',
      'Store',
      'ShoppingCart',
      'ShoppingBag',
      'Package',
      'Shirt',
      'Recycle',
      'Trash2',
      'Hammer',
      'Wrench',
      'Drill',
      'Axe',
      'Shovel',
      'Printer',
      'Inbox',
    ],
  },
  {
    name: "Nature & outdoors",
    keys: [
      'Sprout',
      'Flower',
      'Flower2',
      'Leaf',
      'LeafyGreen',
      'Trees',
      'TreePine',
      'TreeDeciduous',
      'Sun',
      'Cloud',
      'CloudRain',
      'Wind',
      'Globe',
      'Map',
      'MapPin',
      'Plane',
      'Car',
      'Bus',
      'Train',
      'TramFront',
      'Fuel',
    ],
  },
  {
    name: "Screens & media",
    keys: [
      'Smartphone',
      'SmartphoneCharging',
      'Tablet',
      'Laptop',
      'Monitor',
      'Tv',
      'Gamepad2',
      'Headphones',
      'Music',
      'Music2',
      'Mic',
      'Guitar',
      'Piano',
      'Radio',
      'Film',
      'Clapperboard',
      'Camera',
      'Image',
      'Video',
      'Youtube',
      'Instagram',
      'Twitter',
      'Facebook',
    ],
  },
  {
    name: "People & pets",
    keys: [
      'Users',
      'User',
      'UserPlus',
      'Baby',
      'Dog',
      'Cat',
      'Bird',
      'Rabbit',
      'Squirrel',
      'PawPrint',
      'MessageSquare',
      'MessageCircle',
      'Mail',
      'Send',
      'Phone',
      'PhoneCall',
    ],
  },
  {
    name: "Making things",
    keys: [
      'Paintbrush',
      'Palette',
      'PaintBucket',
      'Code',
      'Terminal',
      'Database',
      'Server',
      'Keyboard',
      'Mouse',
    ],
  },
  {
    name: "Work & money",
    keys: [
      'Briefcase',
      'Building2',
      'Wallet',
      'PiggyBank',
      'CreditCard',
      'Coins',
      'Banknote',
      'DollarSign',
      'Receipt',
      'TrendingUp',
      'ChartColumn',
      'ChartPie',
      'ClipboardList',
      'ListChecks',
      'ListTodo',
      'CheckCheck',
    ],
  },
  {
    name: "Time & goals",
    keys: [
      'Timer',
      'TimerReset',
      'Hourglass',
      'AlarmClock',
      'Clock',
      'Watch',
      'Calendar',
      'CalendarCheck',
      'CalendarDays',
      'CalendarHeart',
    ],
  },
];

/**
 * Extra search terms for icons whose name is not what anyone would type —
 * "fajr" should find the sunrise, "quran" the scroll, "zakat" the coins. Only
 * the icons that need it are listed; the rest are found by their own name.
 */
const ICON_KEYWORDS: Record<string, string> = {
  Activity: 'exercise pulse cardio',
  AlarmClock: 'wake early alarm',
  Anchor: 'steady ground',
  Apple: 'fruit healthy eat',
  Archive: 'organise store tidy',
  Armchair: 'rest read sit',
  Award: 'goal win achievement',
  Axe: 'chop outdoors',
  Baby: 'child care family',
  Banana: 'fruit snack',
  Bandage: 'injury recovery care',
  Banknote: 'money budget cash',
  Bath: 'bath wash soak',
  Bed: 'sleep rest nap',
  BedDouble: 'sleep rest bedtime',
  Beef: 'protein meat',
  Beer: 'drink alcohol',
  Bike: 'cycle ride exercise',
  Bird: 'pet nature',
  Book: 'read reading study',
  Bookmark: 'save read later',
  BookMarked: 'read study revise',
  BookOpen: 'read reading quran study',
  Brain: 'focus think memory mindful',
  BrainCog: 'focus deep work think',
  Briefcase: 'work job office',
  BriefcaseMedical: 'health doctor appointment',
  Brush: 'groom hair teeth brush',
  Building2: 'office work commute',
  Bus: 'commute transport',
  Calculator: 'maths budget count',
  Calendar: 'plan schedule',
  CalendarCheck: 'plan review appointment',
  CalendarDays: 'plan schedule',
  CalendarHeart: 'plan date anniversary',
  Camera: 'photo picture shoot',
  Candy: 'sugar sweets treat',
  Car: 'drive commute trip',
  Carrot: 'vegetable healthy',
  Cat: 'pet care',
  ChartColumn: 'track measure review',
  ChartPie: 'budget review measure',
  CheckCheck: 'done complete tick',
  ChefHat: 'cook meal prep',
  Cherry: 'fruit snack',
  Church: 'mosque prayer worship salah masjid',
  Clapperboard: 'movie film watch',
  ClipboardList: 'plan checklist review',
  Clock: 'time routine',
  Cloud: 'weather calm',
  CloudRain: 'weather rain',
  Code: 'programming build practice',
  Coffee: 'drink caffeine morning',
  Coins: 'money save charity',
  Compass: 'direction purpose qibla',
  Cookie: 'treat sugar snack',
  CookingPot: 'cook meal prep',
  CreditCard: 'money spend budget',
  Croissant: 'breakfast treat',
  Cross: 'health first aid',
  Crown: 'discipline mastery',
  CupSoda: 'drink soft sugar',
  Database: 'data practice study',
  Dog: 'pet walk',
  DollarSign: 'money budget spend',
  Drill: 'diy build fix',
  Droplet: 'water hydrate drink',
  Droplets: 'water hydrate drink wudu',
  Dumbbell: 'gym workout lift strength',
  EggFried: 'breakfast protein cook',
  Eraser: 'undo correct',
  Facebook: 'social media screen',
  Feather: 'write light gentle',
  Files: 'documents organise',
  FileText: 'document write notes',
  Film: 'movie watch',
  Fish: 'food omega pet',
  Flag: 'goal milestone',
  Flame: 'streak energy warm',
  Flower: 'garden nature plant',
  Flower2: 'garden nature plant',
  Folder: 'organise files tidy',
  FolderOpen: 'organise files tidy',
  Footprints: 'walk steps run',
  Fuel: 'car errand petrol',
  Gamepad2: 'games gaming play',
  Gem: 'value precious rare',
  Gift: 'give present kindness',
  Glasses: 'read focus study',
  GlassWater: 'water drink hydrate',
  Globe: 'world travel language',
  GraduationCap: 'study learn course',
  Grape: 'fruit snack',
  Guitar: 'practice instrument music',
  Hammer: 'diy fix build',
  Hand: 'dua prayer raise',
  HandCoins: 'charity giving money zakat',
  HandHeart: 'charity sadaqah giving kindness',
  Headphones: 'listen podcast music audiobook',
  Heart: 'love care self',
  HeartHandshake: 'charity kindness help',
  HeartPulse: 'cardio health heart',
  Highlighter: 'study notes mark',
  Home: 'home tidy chores',
  Hourglass: 'patience wait time',
  House: 'home tidy chores',
  IceCream: 'treat sugar',
  Image: 'photo picture',
  Inbox: 'email tidy zero',
  Instagram: 'social media screen',
  Keyboard: 'type practice write',
  Lamp: 'evening light',
  LampDesk: 'study desk work',
  Landmark: 'mosque prayer temple',
  Languages: 'language learn translate vocabulary arabic',
  Laptop: 'work screen computer',
  Leaf: 'nature plant green',
  LeafyGreen: 'vegetables greens healthy',
  Library: 'read study books',
  Lightbulb: 'idea learn insight',
  ListChecks: 'checklist tasks todo',
  ListTodo: 'tasks todo plan',
  Mail: 'email inbox write',
  Map: 'travel explore plan',
  MapPin: 'place location visit',
  Medal: 'goal win achievement',
  MessageCircle: 'text chat message call',
  MessageSquare: 'text chat message',
  Mic: 'speak record podcast voice',
  Milk: 'drink dairy',
  Monitor: 'screen computer work',
  Moon: 'night sleep isha',
  MoonStar: 'night ramadan fasting',
  Mountain: 'hike climb outdoors',
  MountainSnow: 'hike climb outdoors',
  Mouse: 'computer',
  Music: 'practice listen song',
  Music2: 'song listen practice',
  Notebook: 'journal notes write',
  NotebookPen: 'journal diary write notes',
  Nut: 'snack protein',
  Package: 'parcel errand delivery',
  Paintbrush: 'art paint draw',
  PaintBucket: 'art paint colour',
  Palette: 'art paint draw colour',
  PawPrint: 'pet dog cat walk',
  Pencil: 'write draw note',
  PenLine: 'journal write diary',
  PenTool: 'design draw write',
  PersonStanding: 'stand posture stretch walk',
  Phone: 'call ring family',
  PhoneCall: 'call family friends',
  Piano: 'practice instrument music',
  PiggyBank: 'save saving money',
  Pill: 'medication vitamins supplement',
  Pizza: 'treat meal',
  Plane: 'travel flight trip',
  Popcorn: 'snack film',
  Printer: 'print admin',
  Rabbit: 'pet',
  Radio: 'listen news',
  Receipt: 'expenses budget track',
  Recycle: 'sort waste tidy',
  Refrigerator: 'kitchen food tidy',
  Ruler: 'measure plan',
  Sailboat: 'sail water outdoors',
  Salad: 'vegetables healthy lunch',
  Sandwich: 'lunch meal',
  School: 'study class learn',
  Scissors: 'trim groom cut',
  ScrollText: 'quran scripture verse recite',
  Send: 'send message reply',
  Server: 'data build',
  Ship: 'travel water',
  Shirt: 'laundry clothes dress',
  ShoppingBag: 'shop errand groceries',
  ShoppingCart: 'groceries shopping errand',
  Shovel: 'garden dig',
  ShowerHead: 'shower wash clean',
  Smartphone: 'phone social media screen scrolling',
  SmartphoneCharging: 'phone charge screen time',
  Snowflake: 'cold shower winter',
  Sofa: 'rest living room tidy',
  Soup: 'meal warm',
  Sparkles: 'general anything new',
  Sprout: 'grow new start seedling',
  Squirrel: 'nature',
  Star: 'favourite special',
  Stethoscope: 'health checkup doctor',
  StickyNote: 'note reminder',
  Store: 'shop errand',
  Sun: 'daylight outside morning',
  Sunrise: 'morning fajr dawn early wake',
  Sunset: 'evening maghrib dusk',
  Syringe: 'injection health',
  Tablet: 'screen read',
  Target: 'goal aim focus',
  Tent: 'camp outdoors',
  Terminal: 'programming shell code',
  Thermometer: 'health temperature',
  Timer: 'pomodoro focus session',
  TimerReset: 'pomodoro restart focus',
  Train: 'commute transport',
  TramFront: 'commute transport',
  Trash2: 'bin rubbish declutter tidy',
  TreeDeciduous: 'nature outside',
  TreePine: 'nature outside forest',
  Trees: 'nature walk outside forest',
  TrendingUp: 'progress improve grow',
  Trophy: 'goal win achievement',
  Tv: 'television watch screen binge',
  Twitter: 'social media screen',
  User: 'me self personal',
  UserPlus: 'meet connect reach out',
  Users: 'family friends people social',
  Utensils: 'meal eat lunch',
  UtensilsCrossed: 'meal eat dinner',
  Video: 'video watch record',
  Wallet: 'budget money spend',
  Watch: 'time track',
  Waves: 'swim sea calm',
  Wheat: 'bread grain',
  Wind: 'breathe air fresh',
  Wine: 'drink alcohol',
  Wrench: 'fix maintain diy',
  Youtube: 'video watch screen',
  Zap: 'energy quick burst',
};

export const ICONS: Record<string, LucideIcon> = ICON_COMPONENTS;
export const DEFAULT_ICON = 'Sparkles';

/** Falls back rather than rendering a hole where the icon should be. */
export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? ICONS[DEFAULT_ICON];
}

/** `'BookOpen'` → `'book open'`, so a name can be searched as words. */
function wordsOf(key: string): string {
  return key
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .toLowerCase();
}

/**
 * The groups, filtered to what matches `query`. Every word in the query has to
 * match something — the name, its group, or a keyword — so "read morning"
 * narrows rather than widening to everything that is either.
 */
export function searchIcons(query: string): { name: string; keys: string[] }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return ICON_GROUPS;

  return ICON_GROUPS.map((group) => ({
    name: group.name,
    keys: group.keys.filter((key) => {
      const haystack = `${wordsOf(key)} ${group.name.toLowerCase()} ${ICON_KEYWORDS[key] ?? ''}`;
      return terms.every((term) => haystack.includes(term));
    }),
  })).filter((group) => group.keys.length > 0);
}

/**
 * The swatches a habit can be tinted with — muted, and all at roughly the same
 * weight, so a list of eight habits reads as a list rather than as a ranking
 * with the brightest one on top.
 */
export const HABIT_COLORS = [
  '#7073b5', // iris
  '#5a9b6c', // moss
  '#4f8a93', // teal
  '#c29a4f', // honey
  '#bf6b6b', // clay rose
  '#9a6aa8', // plum
  '#5b7fb0', // slate blue
  '#a1794f', // caramel
  '#6f8f5a', // olive
  '#837b6e', // stone
] as const;

export const DEFAULT_COLOR = HABIT_COLORS[0];

/**
 * Suggestions for an empty tracker. Not seeded into a new account — an app
 * that fills itself with habits you did not choose is an app you start by
 * deleting things — but offered on the empty state, where the hardest part is
 * the first one.
 */
export const STARTER_HABITS: HabitDraft[] = [
  { name: 'Read Quran', icon: 'BookOpen', color: HABIT_COLORS[1], frequency: EVERY_DAY },
  { name: 'Drink water', icon: 'Droplets', color: HABIT_COLORS[2], frequency: EVERY_DAY },
  {
    name: 'Workout',
    icon: 'Dumbbell',
    color: HABIT_COLORS[4],
    frequency: { kind: 'weekly', weekdays: [0, 2, 4] },
  },
  { name: 'Journal', icon: 'PenLine', color: HABIT_COLORS[5], frequency: EVERY_DAY },
  {
    name: 'No social media',
    icon: 'Smartphone',
    color: HABIT_COLORS[3],
    frequency: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4] },
  },
];

// -- Today --------------------------------------------------------------------

/** One habit as Today shows it: the habit, plus what was said about it. */
export type TodayItem = {
  habit: Habit;
  /** `null` while the day is still pending. */
  status: HabitStatus | null;
  note: string | null;
};

/**
 * How today is going.
 *
 * `target` deliberately excludes what was skipped. Skipping is an intentional
 * "not today", so leaving it in the denominator would make 100% unreachable
 * the moment the user is honest about a rest day — which is exactly the moment
 * the page should stay encouraging. The skipped count is reported separately
 * so nothing is hidden.
 */
export type DayProgress = {
  due: number;
  done: number;
  skipped: number;
  undone: number;
  pending: number;
  /** Habits that still count towards 100% today: `due - skipped`. */
  target: number;
  /** 0–100. A day with nothing left to do is 100, not 0. */
  percent: number;
};

export function progressOf(items: TodayItem[]): DayProgress {
  let done = 0;
  let skipped = 0;
  let undone = 0;
  for (const item of items) {
    if (item.status === 'done') done += 1;
    else if (item.status === 'skipped') skipped += 1;
    else if (item.status === 'undone') undone += 1;
  }
  const due = items.length;
  const target = due - skipped;
  return {
    due,
    done,
    skipped,
    undone,
    pending: due - done - skipped - undone,
    target,
    // An entirely skipped day is a finished day, not a failed one.
    percent: target === 0 ? (due === 0 ? 0 : 100) : Math.round((done / target) * 100),
  };
}

/** Builds Today's list: the habits due on `date`, in the user's own order. */
export function itemsFor(
  habits: Habit[],
  entries: Map<string, HabitEntry>,
  date: Date
): TodayItem[] {
  const iso = isoDateOf(date);
  return habits
    .filter((habit) => isDueOn(habit, date))
    .map((habit) => {
      const entry = entries.get(entryKey(habit.id, iso));
      return { habit, status: entry?.status ?? null, note: entry?.note ?? null };
    });
}

/** How entries are keyed in memory: one answer per habit per day. */
export function entryKey(habitId: string, isoDate: string): string {
  return `${habitId}:${isoDate}`;
}

// -- Stats --------------------------------------------------------------------

/** One day's totals across every habit due that day. */
export type DayTotals = {
  date: Date;
  iso: string;
  due: number;
  done: number;
  skipped: number;
  undone: number;
  pending: number;
  /** `done / (due - skipped)`, or null on a day nothing was due. */
  rate: number | null;
};

export function totalsFor(
  habits: Habit[],
  entries: Map<string, HabitEntry>,
  date: Date
): DayTotals {
  const items = itemsFor(habits, entries, date);
  const progress = progressOf(items);
  return {
    date,
    iso: isoDateOf(date),
    due: progress.due,
    done: progress.done,
    skipped: progress.skipped,
    undone: progress.undone,
    pending: progress.pending,
    rate: progress.target === 0 ? null : progress.done / progress.target,
  };
}

/**
 * A habit's record over a window: how often it came due, how often it was
 * kept, and the streaks either side of that.
 */
export type HabitStats = {
  habit: Habit;
  due: number;
  done: number;
  skipped: number;
  undone: number;
  pending: number;
  /** 0–1 over `done / (due - skipped)`, or null if it was never due. */
  rate: number | null;
  /** Consecutive due days ending today (or yesterday) that were kept. */
  currentStreak: number;
  /** The longest such run anywhere in the window. */
  bestStreak: number;
};

/**
 * Streaks count *due* days, not calendar days, and a skip neither breaks a
 * streak nor extends it — a rest day you chose is not a day you failed. A
 * pending day (today, before it has been answered) is treated the same way, so
 * an unanswered morning doesn't read as a broken streak until it is answered.
 */
export function statsFor(
  habit: Habit,
  entries: Map<string, HabitEntry>,
  from: Date,
  to: Date
): HabitStats {
  let due = 0;
  let done = 0;
  let skipped = 0;
  let undone = 0;
  let pending = 0;

  let run = 0;
  let best = 0;
  // Walked oldest-first, so `run` at the end of the loop is the streak that
  // reaches the newest day in the window.
  for (const date of eachDay(from, to)) {
    if (!isDueOn(habit, date)) continue;
    due += 1;
    const entry = entries.get(entryKey(habit.id, isoDateOf(date)));
    switch (entry?.status) {
      case 'done':
        done += 1;
        run += 1;
        best = Math.max(best, run);
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'undone':
        undone += 1;
        run = 0;
        break;
      default:
        pending += 1;
        break;
    }
  }

  const target = due - skipped;
  return {
    habit,
    due,
    done,
    skipped,
    undone,
    pending,
    rate: target === 0 ? null : done / target,
    currentStreak: run,
    bestStreak: best,
  };
}

/** A bucket of days — a week, a month — with its own completion rate. */
export type Bucket = {
  /** Local ISO date of the first day in the bucket; identifies it. */
  key: string;
  label: string;
  days: DayTotals[];
  due: number;
  done: number;
  skipped: number;
  undone: number;
  rate: number | null;
};

/**
 * Groups days into weeks or months. Rates are computed over the bucket's own
 * totals rather than averaged from the daily rates, so a week with one habit
 * due on Monday and eight due on Tuesday weighs Tuesday properly.
 */
export function bucketize(
  days: DayTotals[],
  by: 'week' | 'month',
  weekStartsMonday: boolean
): Bucket[] {
  const buckets = new Map<string, Bucket>();

  for (const day of days) {
    const start =
      by === 'month'
        ? startOfMonth(day.date)
        : weekStartsMonday
          ? startOfWeek(day.date)
          : addDays(startOfDay(day.date), -day.date.getDay());
    const key = isoDateOf(start);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label:
          by === 'month'
            ? start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
            : formatShortDate(start),
        days: [],
        due: 0,
        done: 0,
        skipped: 0,
        undone: 0,
        rate: null,
      };
      buckets.set(key, bucket);
    }

    bucket.days.push(day);
    bucket.due += day.due;
    bucket.done += day.done;
    bucket.skipped += day.skipped;
    bucket.undone += day.undone;
  }

  const list = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const bucket of list) {
    const target = bucket.due - bucket.skipped;
    bucket.rate = target === 0 ? null : bucket.done / target;
  }
  return list;
}

/** Everything the Stats page draws, derived in one pass over the window. */
export type StatsSummary = {
  from: Date;
  to: Date;
  days: DayTotals[];
  perHabit: HabitStats[];
  due: number;
  done: number;
  skipped: number;
  undone: number;
  pending: number;
  /** Overall completion across the window, or null if nothing was ever due. */
  rate: number | null;
  /** Days where everything due was done or deliberately skipped. */
  perfectDays: number;
  /** Consecutive perfect days ending at the newest day in the window. */
  currentPerfectStreak: number;
  bestPerfectStreak: number;
  best: Bucket | null;
  worst: Bucket | null;
};

export function summarize(
  habits: Habit[],
  entries: Map<string, HabitEntry>,
  from: Date,
  to: Date,
  weekStartsMonday: boolean
): StatsSummary {
  const days = eachDay(from, to).map((date) => totalsFor(habits, entries, date));

  let due = 0;
  let done = 0;
  let skipped = 0;
  let undone = 0;
  let pending = 0;
  let perfectDays = 0;
  let perfectRun = 0;
  let bestPerfectRun = 0;

  for (const day of days) {
    due += day.due;
    done += day.done;
    skipped += day.skipped;
    undone += day.undone;
    pending += day.pending;

    // A day nothing was due neither counts as perfect nor breaks a run of
    // them: a Sunday with no habits shouldn't reset a fortnight of good days.
    if (day.due === 0) continue;
    if (day.rate === null || day.rate === 1) {
      perfectDays += 1;
      perfectRun += 1;
      bestPerfectRun = Math.max(bestPerfectRun, perfectRun);
    } else if (day.pending > 0 && day.undone === 0) {
      // Still open — today, mid-morning. Neither perfect nor broken yet.
      continue;
    } else {
      perfectRun = 0;
    }
  }

  // Weekly buckets on a short window, monthly on a long one: fifty-two bars is
  // a texture, not a trend.
  const span = daysBetween(from, to);
  const buckets = bucketize(days, span > 120 ? 'month' : 'week', weekStartsMonday);
  const rated = buckets.filter((b) => b.rate !== null && b.due > 0);

  const target = due - skipped;
  return {
    from,
    to,
    days,
    perHabit: habits.map((habit) => statsFor(habit, entries, from, to)),
    due,
    done,
    skipped,
    undone,
    pending,
    rate: target === 0 ? null : done / target,
    perfectDays,
    currentPerfectStreak: perfectRun,
    bestPerfectStreak: bestPerfectRun,
    best: rated.length > 1 ? rated.reduce((a, b) => (b.rate! > a.rate! ? b : a)) : null,
    worst: rated.length > 1 ? rated.reduce((a, b) => (b.rate! < a.rate! ? b : a)) : null,
  };
}

/** `0.62` → `62%`. Null ranges read as an em dash rather than as 0%. */
export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
