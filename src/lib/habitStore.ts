import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { describeDbError } from './errors';
import {
  DEFAULT_COLOR,
  DEFAULT_ICON,
  HABIT_NAME_MAX,
  HABIT_NOTE_MAX,
  entryKey,
  isoDateOf,
  parseFrequency,
  type Habit,
  type HabitDraft,
  type HabitEntry,
  type HabitRecord,
  type HabitStatus,
} from './habits';

export type HabitStore = {
  /** Every habit, in the order the user dragged them into. */
  habits: Habit[];
  /** Every answered day, keyed `habitId:YYYY-MM-DD`. Absent = pending. */
  entries: Map<string, HabitEntry>;
  loading: boolean;
  /** True while a write is in flight, so buttons can say so. */
  saving: boolean;
  error: string | null;
  dismissError: () => void;
  create: (draft: HabitDraft) => Promise<boolean>;
  update: (id: string, draft: HabitDraft) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  /** Writes a whole new order in one round trip. */
  reorder: (idsInOrder: string[]) => Promise<boolean>;
  /**
   * Sets — or, passing `null`, clears — what was said about one habit on one
   * day. Clearing returns the day to pending, which is how a mis-click is
   * undone without inventing a fourth status.
   */
  setStatus: (
    habitId: string,
    date: Date,
    status: HabitStatus | null,
    note?: string | null
  ) => Promise<boolean>;
};

/** A draft as columns. Shared so an edit and an insert can't diverge. */
function columnsOf(draft: HabitDraft) {
  return {
    name: draft.name.trim().slice(0, HABIT_NAME_MAX),
    icon: draft.icon || DEFAULT_ICON,
    color: draft.color || DEFAULT_COLOR,
    frequency: draft.frequency,
  };
}

/** Parses the stored recurrence once, at the edge, so no component has to. */
function toHabit(row: HabitRecord): Habit {
  return { ...row, frequency: parseFrequency(row.frequency) };
}

function byOrder(a: Habit, b: Habit): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}

/**
 * One account's habits and their whole history.
 *
 * Both are loaded once and held in memory. The volume justifies it: ten habits
 * answered daily is a few thousand rows a year, which is smaller than a single
 * week of planner blocks — and every page needs a different slice of it. Stats
 * asking the database for each window it draws would mean a spinner on every
 * range change, for data that was already here.
 *
 * Writes are optimistic. Marking a habit done has to feel like ticking a box,
 * and a round trip to Supabase before the tick appears does not; on failure the
 * previous state is put back and the error is shown.
 */
export function useHabits(userId: string): HabitStore {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<Map<string, HabitEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [habitsResult, entriesResult] = await Promise.all([
        supabase.from('habits').select('*').order('sort_order').order('created_at'),
        supabase.from('habit_entries').select('*'),
      ]);
      if (cancelled) return;

      const failure = habitsResult.error ?? entriesResult.error;
      if (failure) {
        console.error('Failed to load habits', failure);
        setError(describeDbError('load your habits', failure));
        setLoading(false);
        return;
      }

      setHabits(((habitsResult.data ?? []) as HabitRecord[]).map(toHabit).sort(byOrder));
      setEntries(indexEntries((entriesResult.data ?? []) as HabitEntry[]));
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const create = useCallback(
    async (draft: HabitDraft): Promise<boolean> => {
      setError(null);
      setSaving(true);

      // Appended, not prepended: a new habit joins the end of a list whose
      // order the user chose, rather than displacing what they put on top.
      const sortOrder = habits.reduce((max, h) => Math.max(max, h.sort_order), -1) + 1;

      const { data, error: err } = await supabase
        .from('habits')
        .insert({
          user_id: userId,
          ...columnsOf(draft),
          sort_order: sortOrder,
          // "Every 2 weeks" counts from today, not from some epoch.
          anchor_date: isoDateOf(new Date()),
        })
        .select()
        .single();
      setSaving(false);

      if (err || !data) {
        console.error('Failed to create habit', err);
        setError(describeDbError('save that habit', err ?? { message: 'no row returned' }));
        return false;
      }

      setHabits((prev) => [...prev, toHabit(data as HabitRecord)].sort(byOrder));
      return true;
    },
    [habits, userId]
  );

  const update = useCallback(async (id: string, draft: HabitDraft): Promise<boolean> => {
    setError(null);
    setSaving(true);

    const { data, error: err } = await supabase
      .from('habits')
      .update(columnsOf(draft))
      .eq('id', id)
      .select()
      .single();
    setSaving(false);

    if (err || !data) {
      console.error('Failed to update habit', err);
      setError(describeDbError('save that change', err ?? { message: 'no row returned' }));
      return false;
    }

    setHabits((prev) =>
      prev.map((habit) => (habit.id === id ? toHabit(data as HabitRecord) : habit)).sort(byOrder)
    );
    return true;
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    setSaving(true);

    const { error: err } = await supabase.from('habits').delete().eq('id', id);
    setSaving(false);

    if (err) {
      console.error('Failed to delete habit', err);
      setError(describeDbError('delete that habit', err));
      return false;
    }

    setHabits((prev) => prev.filter((habit) => habit.id !== id));
    // The database cascades; this keeps the copy in memory from disagreeing
    // with it until the next reload.
    setEntries((prev) => {
      const next = new Map(prev);
      for (const [key, entry] of prev) if (entry.habit_id === id) next.delete(key);
      return next;
    });
    return true;
  }, []);

  const reorder = useCallback(
    async (idsInOrder: string[]): Promise<boolean> => {
      const previous = habits;

      // Applied first: a list that snaps back to the old order while the write
      // lands makes a drag feel like it failed even when it didn't.
      const position = new Map(idsInOrder.map((id, index) => [id, index]));
      const reordered = habits
        .map((habit) => ({ ...habit, sort_order: position.get(habit.id) ?? habit.sort_order }))
        .sort(byOrder);
      setHabits(reordered);

      setError(null);
      setSaving(true);
      // One round trip rather than one per habit. `upsert` needs every NOT NULL
      // column, so whole rows go back — which is also what keeps a concurrent
      // edit in another tab from being half-overwritten by a stale name.
      const { error: err } = await supabase.from('habits').upsert(
        reordered.map((habit) => ({
          id: habit.id,
          user_id: habit.user_id,
          name: habit.name,
          icon: habit.icon,
          color: habit.color,
          frequency: habit.frequency,
          anchor_date: habit.anchor_date,
          sort_order: habit.sort_order,
        }))
      );
      setSaving(false);

      if (err) {
        console.error('Failed to reorder habits', err);
        setError(describeDbError('save that order', err));
        setHabits(previous);
        return false;
      }
      return true;
    },
    [habits]
  );

  const setStatus = useCallback(
    async (
      habitId: string,
      date: Date,
      status: HabitStatus | null,
      note?: string | null
    ): Promise<boolean> => {
      const iso = isoDateOf(date);
      const key = entryKey(habitId, iso);
      const previous = entries;

      // Optimistic: the tick has to land under the cursor, not after a round
      // trip. A failure puts the old answer back and says why.
      setEntries((prev) => {
        const next = new Map(prev);
        if (status === null) {
          next.delete(key);
        } else {
          const existing = prev.get(key);
          next.set(key, {
            id: existing?.id ?? `pending:${key}`,
            user_id: userId,
            habit_id: habitId,
            on_date: iso,
            status,
            note: cleanNote(status, note, existing?.note),
            updated_at: new Date().toISOString(),
          });
        }
        return next;
      });
      setError(null);

      if (status === null) {
        const { error: err } = await supabase
          .from('habit_entries')
          .delete()
          .eq('habit_id', habitId)
          .eq('on_date', iso);
        if (err) {
          console.error('Failed to clear entry', err);
          setError(describeDbError('clear that day', err));
          setEntries(previous);
          return false;
        }
        return true;
      }

      const { data, error: err } = await supabase
        .from('habit_entries')
        .upsert(
          {
            user_id: userId,
            habit_id: habitId,
            on_date: iso,
            status,
            note: cleanNote(status, note, previous.get(key)?.note),
            updated_at: new Date().toISOString(),
          },
          // The unique constraint from the migration: answering twice is a
          // correction to one row, not a second row.
          { onConflict: 'habit_id,on_date' }
        )
        .select()
        .single();

      if (err || !data) {
        console.error('Failed to save entry', err);
        setError(describeDbError('save that', err ?? { message: 'no row returned' }));
        setEntries(previous);
        return false;
      }

      // Replaces the placeholder with the real row, so a later edit has an id.
      setEntries((prev) => {
        const next = new Map(prev);
        next.set(key, data as HabitEntry);
        return next;
      });
      return true;
    },
    [entries, userId]
  );

  const dismissError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({
      habits,
      entries,
      loading,
      saving,
      error,
      dismissError,
      create,
      update,
      remove,
      reorder,
      setStatus,
    }),
    [
      habits,
      entries,
      loading,
      saving,
      error,
      dismissError,
      create,
      update,
      remove,
      reorder,
      setStatus,
    ]
  );
}

function indexEntries(rows: HabitEntry[]): Map<string, HabitEntry> {
  const map = new Map<string, HabitEntry>();
  for (const row of rows) map.set(entryKey(row.habit_id, row.on_date), row);
  return map;
}

/**
 * A note only means anything on an `undone`: it is the "why not". Marking a
 * habit done afterwards drops it rather than leaving yesterday's excuse
 * attached to a day that went fine.
 *
 * `undefined` means "leave whatever is there" — status buttons pass nothing,
 * the note field passes a string.
 */
function cleanNote(
  status: HabitStatus,
  note: string | null | undefined,
  existing: string | null | undefined
): string | null {
  if (status !== 'undone') return null;
  const value = note === undefined ? (existing ?? '') : (note ?? '');
  const trimmed = value.trim().slice(0, HABIT_NOTE_MAX);
  return trimmed || null;
}
