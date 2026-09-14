import { CalendarDays, ListChecks, MoonStar, type LucideIcon } from 'lucide-react';

/**
 * Every app behind the one sign-in. They share an account and nothing else —
 * no planner reads sleep, no sleep reads a planner — so this is a list of
 * separate apps rather than routes into one.
 *
 * Adding an app is meant to be two edits: a row here, and the branch in
 * <Gate> that mounts it. The switcher, the stored-view check and the labels
 * all read from this list, so none of them need touching.
 */
export type AppDefinition = {
  id: string;
  /** What the switcher calls it. Short — it sits in a crowded app bar. */
  name: string;
  /** One line under the name in the menu, saying what the app is for. */
  description: string;
  icon: LucideIcon;
  /**
   * Which half of the palette the app lives in. The switcher renders itself
   * to match whichever app is currently open, so it belongs to the bar it
   * sits in rather than looking pasted on.
   */
  tone: 'light' | 'dark';
};

export const APPS = [
  {
    id: 'planner',
    name: 'Planner',
    description: 'The reusable week grid',
    icon: CalendarDays,
    tone: 'light',
  },
  {
    id: 'habits',
    name: 'Habits',
    description: 'Today, one day at a time',
    icon: ListChecks,
    tone: 'light',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    description: 'Nightly log, charts and takeaways',
    icon: MoonStar,
    tone: 'dark',
  },
] as const satisfies readonly AppDefinition[];

export type AppId = (typeof APPS)[number]['id'];

/** The one every account lands in when nothing has been chosen yet. */
export const DEFAULT_APP_ID: AppId = 'planner';

export function isAppId(value: unknown): value is AppId {
  return APPS.some((app) => app.id === value);
}

export function getApp(id: AppId): AppDefinition {
  // `id` is narrowed to a known app, so this can only miss if APPS is empty.
  return APPS.find((app) => app.id === id) ?? APPS[0];
}
