import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { describeDbError } from './errors';

/**
 * What you have learned about your own sleep, as opposed to what happened on
 * one night.
 *
 * This is deliberately its own model with no link to a period or a night. A
 * note on a sleep period answers "what was going on that night"; a takeaway
 * answers "what do I now know" — it outlives every entry, and hanging it off
 * a row would mean losing the lesson when that night was deleted.
 */

/** Whether the observed thing helps sleep, hurts it, or is neither. */
export type TakeawayEffect = 'helps' | 'hurts' | 'neutral';

export type SleepTakeaway = {
  id: string;
  user_id: string;
  text: string;
  effect: TakeawayEffect;
  created_at: string;
};

/**
 * Long enough for a full observation — "using my phone before bed makes it
 * difficult to sleep" — and short enough that the list stays a list of
 * lessons rather than a diary.
 */
export const TAKEAWAY_MAX = 240;

/** The order they are written and read in. */
function newestFirst(a: SleepTakeaway, b: SleepTakeaway): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export type TakeawayStore = {
  takeaways: SleepTakeaway[];
  loading: boolean;
  /** True while a write is in flight, so buttons can say so. */
  saving: boolean;
  error: string | null;
  dismissError: () => void;
  /** Returns whether it landed, so the composer can keep the text on failure. */
  create: (text: string, effect: TakeawayEffect) => Promise<boolean>;
  update: (id: string, text: string, effect: TakeawayEffect) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
};

/**
 * One account's takeaways. A short list by nature — a handful of lessons, not
 * one per night — so it is fetched once and kept in memory.
 */
export function useTakeaways(userId: string): TakeawayStore {
  const [takeaways, setTakeaways] = useState<SleepTakeaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: err } = await supabase
        .from('sleep_takeaways')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (err) {
        console.error('Failed to load takeaways', err);
        setError(describeDbError('load your takeaways', err));
      } else {
        setTakeaways((data ?? []) as SleepTakeaway[]);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const create = useCallback(
    async (text: string, effect: TakeawayEffect): Promise<boolean> => {
      const trimmed = text.trim().slice(0, TAKEAWAY_MAX);
      // The database rejects a blank one too; this just saves the round trip.
      if (!trimmed) return false;

      setError(null);
      setSaving(true);
      const { data, error: err } = await supabase
        .from('sleep_takeaways')
        .insert({ user_id: userId, text: trimmed, effect })
        .select()
        .single();
      setSaving(false);

      if (err || !data) {
        console.error('Failed to add takeaway', err);
        setError(describeDbError('save that takeaway', err ?? { message: 'no row returned' }));
        return false;
      }

      setTakeaways((prev) => [data as SleepTakeaway, ...prev].sort(newestFirst));
      return true;
    },
    [userId]
  );

  const update = useCallback(
    async (id: string, text: string, effect: TakeawayEffect): Promise<boolean> => {
      const trimmed = text.trim().slice(0, TAKEAWAY_MAX);
      if (!trimmed) return false;

      setError(null);
      setSaving(true);
      const { data, error: err } = await supabase
        .from('sleep_takeaways')
        .update({ text: trimmed, effect })
        .eq('id', id)
        .select()
        .single();
      setSaving(false);

      if (err || !data) {
        console.error('Failed to update takeaway', err);
        setError(describeDbError('save that change', err ?? { message: 'no row returned' }));
        return false;
      }

      // Order is by `created_at`, which an edit doesn't touch, so a reworded
      // takeaway stays where it was rather than jumping to the top.
      setTakeaways((prev) => prev.map((t) => (t.id === id ? (data as SleepTakeaway) : t)));
      return true;
    },
    []
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    setSaving(true);
    const { error: err } = await supabase.from('sleep_takeaways').delete().eq('id', id);
    setSaving(false);

    if (err) {
      console.error('Failed to delete takeaway', err);
      setError(describeDbError('delete that takeaway', err));
      return false;
    }

    setTakeaways((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { takeaways, loading, saving, error, dismissError, create, update, remove };
}
