import { useCallback, useEffect, useState } from 'react';

/**
 * The habit tracker's preferences. Deliberately in `localStorage` rather than
 * in Supabase: none of them is worth a row, a round trip or a migration, and
 * all of them are about how this browser draws the page rather than about what
 * the user has actually done.
 */
export type HabitSettings = {
  /** Which column a stats week starts in. The domain counts Monday-first. */
  weekStart: 'monday' | 'sunday';
  /**
   * Whether marking a habit undone opens the "why?" field straight away. The
   * note is optional either way — this only decides whether it is offered or
   * has to be asked for, which is the difference between a prompt and friction.
   */
  askWhyOnUndone: boolean;
  /** Show each habit's current streak on Today. Off by default: quieter. */
  showStreaksOnToday: boolean;
};

export const DEFAULT_SETTINGS: HabitSettings = {
  weekStart: 'monday',
  askWhyOnUndone: true,
  showStreaksOnToday: false,
};

const STORAGE_KEY = 'weekly-planner:habits:settings';

function read(): HabitSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<HabitSettings>;
    // Field by field, so a key added in a later version gets its default
    // rather than leaving the object short of it.
    return {
      weekStart: parsed.weekStart === 'sunday' ? 'sunday' : 'monday',
      askWhyOnUndone: parsed.askWhyOnUndone ?? DEFAULT_SETTINGS.askWhyOnUndone,
      showStreaksOnToday: parsed.showStreaksOnToday ?? DEFAULT_SETTINGS.showStreaksOnToday,
    };
  } catch {
    // Private-mode Safari and friends: losing the preference is fine, throwing isn't.
    return DEFAULT_SETTINGS;
  }
}

export function useHabitSettings() {
  const [settings, setSettings] = useState<HabitSettings>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* see read */
    }
  }, [settings]);

  const set = useCallback(<K extends keyof HabitSettings>(key: K, value: HabitSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { settings, set };
}
