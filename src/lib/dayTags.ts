import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type DayTag, type DayTagOption } from './supabase';
import { describeDbError } from './errors';
import { DAY_TAG_LABEL_MAX, DAY_TAG_PALETTE } from './constants';

/** Which tag each day carries, by day index. Days without one are absent. */
export type DayTagMap = Partial<Record<number, string>>;

export type DayTagStore = {
  /** The planner's own tags, in the order the picker lists them. */
  options: DayTagOption[];
  byId: Map<string, DayTagOption>;
  tags: DayTagMap;
  error: string | null;
  dismissError: () => void;
  /** Tags a day, or clears it when passed null. */
  setTag: (day: number, optionId: string | null) => Promise<void>;
  /** Adds a tag to this planner, or returns the one already under that label. */
  createOption: (label: string) => Promise<DayTagOption | null>;
  /** Drops a tag from the planner, clearing it off every day that carried it. */
  removeOption: (id: string) => Promise<void>;
};

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * A planner's day tags: the list it defines, and which day carries what. Both
 * belong to the planner, so this reloads when the open planner changes.
 */
export function useDayTags(userId: string, plannerId: string): DayTagStore {
  const [options, setOptions] = useState<DayTagOption[]>([]);
  const [tags, setTags] = useState<DayTagMap>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [optionRes, tagRes] = await Promise.all([
        supabase
          .from('day_tag_options')
          .select('*')
          .eq('planner_id', plannerId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase.from('day_tags').select('*').eq('planner_id', plannerId),
      ]);
      if (cancelled) return;

      const failure = optionRes.error ?? tagRes.error;
      if (failure) {
        console.error('Failed to load day tags', failure);
        setError(describeDbError('load day tags', failure));
        return;
      }

      setOptions((optionRes.data ?? []) as DayTagOption[]);
      const map: DayTagMap = {};
      for (const row of (tagRes.data ?? []) as DayTag[]) map[row.day] = row.option_id;
      setTags(map);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [plannerId]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const setTag = useCallback(
    async (day: number, optionId: string | null) => {
      const previous = tags;

      // Optimistic: a tag is a one-click toggle on a header cell, so it should
      // land under the cursor rather than after the round trip.
      setTags((prev) => {
        const next = { ...prev };
        if (optionId) next[day] = optionId;
        else delete next[day];
        return next;
      });
      setError(null);

      const { error: err } = optionId
        ? await supabase.from('day_tags').upsert(
            {
              user_id: userId,
              planner_id: plannerId,
              day,
              option_id: optionId,
            },
            { onConflict: 'planner_id,day' }
          )
        : await supabase.from('day_tags').delete().eq('planner_id', plannerId).eq('day', day);

      if (err) {
        console.error('Failed to save day tag', err);
        setError(describeDbError('save day tag', err));
        setTags(previous);
      }
    },
    [plannerId, tags, userId]
  );

  const createOption = useCallback(
    async (label: string): Promise<DayTagOption | null> => {
      const trimmed = label.trim().slice(0, DAY_TAG_LABEL_MAX);
      if (!trimmed) return null;

      const existing = options.find((o) => sameLabel(o.label, trimmed));
      if (existing) return existing;

      setError(null);
      const { data, error: err } = await supabase
        .from('day_tag_options')
        .insert({
          user_id: userId,
          planner_id: plannerId,
          label: trimmed,
          // In order, so the first few tags are easy to tell apart.
          color: DAY_TAG_PALETTE[options.length % DAY_TAG_PALETTE.length],
          sort_order: options.length,
        })
        .select()
        .single();

      if (err || !data) {
        console.error('Failed to add day tag', err);
        setError(describeDbError('add that tag', err ?? { message: 'no row returned' }));
        return null;
      }

      const option = data as DayTagOption;
      setOptions((prev) => [...prev, option]);
      return option;
    },
    [options, plannerId, userId]
  );

  const removeOption = useCallback(async (id: string) => {
    setError(null);
    const { error: err } = await supabase.from('day_tag_options').delete().eq('id', id);
    if (err) {
      console.error('Failed to delete day tag', err);
      setError(describeDbError('delete that tag', err));
      return;
    }

    setOptions((prev) => prev.filter((o) => o.id !== id));
    // The rows in day_tags went with it (the reference cascades), so the days
    // that carried this tag are cleared here too.
    setTags((prev) => {
      const next: DayTagMap = {};
      for (const [day, optionId] of Object.entries(prev)) {
        if (optionId !== id) next[Number(day)] = optionId;
      }
      return next;
    });
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    options,
    byId,
    tags,
    error,
    dismissError,
    setTag,
    createOption,
    removeOption,
  };
}
