import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { describeDbError } from './errors';
import {
  groupIntoNights,
  summarize,
  NOTE_MAX,
  type Night,
  type SleepDraft,
  type SleepPeriod,
  type SleepSummary,
} from './sleep';

export type SleepStore = {
  /** Every logged period, newest first. */
  periods: SleepPeriod[];
  /** The same periods grouped into nights, newest night first. */
  nights: Night[];
  /** The dashboard's numbers, derived from `nights`. */
  summary: SleepSummary;
  loading: boolean;
  /** True while a write is in flight, so buttons can say so. */
  saving: boolean;
  error: string | null;
  dismissError: () => void;
  /** Adds a period. Returns whether it landed, so the form can stay open. */
  create: (draft: SleepDraft) => Promise<boolean>;
  /**
   * Rewrites one period's times and note. Changing the times can move it into
   * a different night, which needs no extra work here — the night it belongs
   * to is derived from `started_at` on every read.
   */
  update: (id: string, draft: SleepDraft) => Promise<boolean>;
  /** Deletes one or many periods in a single round trip. */
  remove: (ids: string[]) => Promise<boolean>;
};

/**
 * The whole sleep log for one account. It is small — one row per sleep, so a
 * few hundred a year — and every view needs a different slice of it, so it is
 * fetched once here and grouped in memory rather than queried per view.
 *
 * Nothing here touches the planners: the sleep tracker shares the account and
 * the sign-in, and nothing else.
 */
/** The load order, which the list is kept in so writes land where expected. */
function newestFirst(a: SleepPeriod, b: SleepPeriod): number {
  return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
}

/** A draft as columns. Shared so an edit and an insert can't diverge. */
function columnsOf(draft: SleepDraft) {
  const note = draft.note.trim().slice(0, NOTE_MAX);
  return {
    started_at: draft.started_at.toISOString(),
    ended_at: draft.ended_at.toISOString(),
    // Null rather than '' so "has a note" is one check everywhere.
    note: note || null,
  };
}

export function useSleep(userId: string): SleepStore {
  const [periods, setPeriods] = useState<SleepPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: err } = await supabase
        .from('sleep_periods')
        .select('*')
        .order('started_at', { ascending: false });
      if (cancelled) return;
      if (err) {
        console.error('Failed to load sleep', err);
        setError(describeDbError('load your sleep log', err));
      } else {
        setPeriods((data ?? []) as SleepPeriod[]);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const nights = useMemo(() => groupIntoNights(periods), [periods]);
  const summary = useMemo(() => summarize(nights), [nights]);

  const create = useCallback(
    async (draft: SleepDraft): Promise<boolean> => {
      setError(null);
      setSaving(true);

      const { data, error: err } = await supabase
        .from('sleep_periods')
        .insert({ user_id: userId, ...columnsOf(draft) })
        .select()
        .single();
      setSaving(false);

      if (err || !data) {
        console.error('Failed to add sleep', err);
        setError(describeDbError('save that sleep', err ?? { message: 'no row returned' }));
        return false;
      }

      // Kept newest-first to match the load order, so the new row lands where
      // the list already expects it rather than after a refetch.
      setPeriods((prev) => [data as SleepPeriod, ...prev].sort(newestFirst));
      return true;
    },
    [userId]
  );

  const update = useCallback(async (id: string, draft: SleepDraft): Promise<boolean> => {
    setError(null);
    setSaving(true);

    const { data, error: err } = await supabase
      .from('sleep_periods')
      .update(columnsOf(draft))
      .eq('id', id)
      .select()
      .single();
    setSaving(false);

    if (err || !data) {
      console.error('Failed to update sleep', err);
      setError(describeDbError('save that change', err ?? { message: 'no row returned' }));
      return false;
    }

    // Re-sorted, since editing the start time can move the row in the list —
    // and, when it crosses noon, into a different night entirely.
    setPeriods((prev) =>
      prev.map((p) => (p.id === id ? (data as SleepPeriod) : p)).sort(newestFirst)
    );
    return true;
  }, []);

  const remove = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    setError(null);
    setSaving(true);

    const { error: err } = await supabase.from('sleep_periods').delete().in('id', ids);
    setSaving(false);

    if (err) {
      console.error('Failed to delete sleep', err);
      setError(describeDbError(ids.length > 1 ? 'delete those entries' : 'delete that entry', err));
      return false;
    }

    const gone = new Set(ids);
    setPeriods((prev) => prev.filter((p) => !gone.has(p.id)));
    return true;
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    periods,
    nights,
    summary,
    loading,
    saving,
    error,
    dismissError,
    create,
    update,
    remove,
  };
}
