import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, type PlannerBlock, type DayTag, type PlannerRecord } from './supabase';
import { describeDbError } from './errors';

/** What a brand-new account's first planner is called. */
export const DEFAULT_PLANNER_NAME = 'My Planner';

/** Longest name the switcher can show without the row wrapping. */
export const PLANNER_NAME_MAX = 40;

/** Remembers which planner was open, per account, across reloads. */
function activeKey(userId: string): string {
  return `weekly-planner:active-planner:${userId}`;
}

function readStoredActive(userId: string): string | null {
  try {
    return localStorage.getItem(activeKey(userId));
  } catch {
    // Private-mode Safari and friends: losing the memory is fine, throwing isn't.
    return null;
  }
}

function storeActive(userId: string, plannerId: string): void {
  try {
    localStorage.setItem(activeKey(userId), plannerId);
  } catch {
    /* see readStoredActive */
  }
}

export type PlannerStore = {
  planners: PlannerRecord[];
  /** The open planner. Null only while the first load is still in flight. */
  active: PlannerRecord | null;
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  select: (id: string) => void;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  /** Copies a planner's blocks and day tags into a new one beside it. */
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Owns the list of planners and which one is open. Blocks and day tags are
 * loaded by <Planner> itself, keyed on the active planner, so switching is a
 * remount rather than a merge of two weeks' state.
 */
export function usePlanners(userId: string): PlannerStore {
  const [planners, setPlanners] = useState<PlannerRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => readStoredActive(userId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // StrictMode runs the load effect twice in dev; without this the empty-list
  // case would seed two "My Planner" rows.
  const seedingRef = useRef(false);

  const fetchPlanners = useCallback(async (): Promise<PlannerRecord[]> => {
    const { data, error: err } = await supabase
      .from('planners')
      .select('*')
      .order('created_at', { ascending: true });
    if (err) {
      console.error('Failed to load planners', err);
      setError(describeDbError('load your planners', err));
      return [];
    }
    const rows = (data ?? []) as PlannerRecord[];
    setPlanners(rows);
    return rows;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const rows = await fetchPlanners();
      if (cancelled) return;

      // A fresh account, or one whose planners were all deleted elsewhere.
      if (rows.length === 0 && !seedingRef.current) {
        seedingRef.current = true;
        const { data, error: err } = await supabase
          .from('planners')
          .insert({ user_id: userId, name: DEFAULT_PLANNER_NAME })
          .select()
          .single();
        seedingRef.current = false;
        if (cancelled) return;
        if (err) {
          console.error('Failed to create the first planner', err);
          setError(describeDbError('create your first planner', err));
        } else if (data) {
          setPlanners([data as PlannerRecord]);
          setActiveId(data.id);
        }
      }

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchPlanners, userId]);

  // The stored id can point at a planner deleted from another tab, so it is
  // only ever a hint — the list decides what is actually open.
  const active = useMemo(
    () => planners.find((p) => p.id === activeId) ?? planners[0] ?? null,
    [planners, activeId]
  );

  useEffect(() => {
    if (active) storeActive(userId, active.id);
  }, [active, userId]);

  const select = useCallback(
    (id: string) => {
      setActiveId(id);
      storeActive(userId, id);
    },
    [userId]
  );

  const create = useCallback(
    async (name: string) => {
      setError(null);
      const { data, error: err } = await supabase
        .from('planners')
        .insert({ user_id: userId, name: name.trim().slice(0, PLANNER_NAME_MAX) })
        .select()
        .single();
      if (err || !data) {
        console.error('Failed to create planner', err);
        setError(describeDbError('create the planner', err ?? { message: 'no row returned' }));
        return;
      }
      setPlanners((prev) => [...prev, data as PlannerRecord]);
      select(data.id);
    },
    [select, userId]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim().slice(0, PLANNER_NAME_MAX);
      if (!trimmed) return;
      setError(null);

      // Optimistic: the name is the switcher's own label, so it should change
      // under the cursor rather than after the round trip.
      const previous = planners;
      setPlanners((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));

      const { error: err } = await supabase.from('planners').update({ name: trimmed }).eq('id', id);
      if (err) {
        console.error('Failed to rename planner', err);
        setError(describeDbError('rename the planner', err));
        setPlanners(previous);
      }
    },
    [planners]
  );

  const duplicate = useCallback(
    async (id: string) => {
      const source = planners.find((p) => p.id === id);
      if (!source) return;
      setError(null);

      const { data: created, error: createErr } = await supabase
        .from('planners')
        .insert({ user_id: userId, name: `${source.name} copy`.slice(0, PLANNER_NAME_MAX) })
        .select()
        .single();
      if (createErr || !created) {
        console.error('Failed to duplicate planner', createErr);
        setError(
          describeDbError('duplicate the planner', createErr ?? { message: 'no row returned' })
        );
        return;
      }
      const copy = created as PlannerRecord;

      const [blockRes, tagRes] = await Promise.all([
        supabase.from('planner_blocks').select('*').eq('planner_id', id),
        supabase.from('day_tags').select('*').eq('planner_id', id),
      ]);

      const readFailure = blockRes.error ?? tagRes.error;
      if (readFailure) {
        console.error('Failed to read the planner being duplicated', readFailure);
        setError(describeDbError('copy the planner contents', readFailure));
        // The new planner exists but is empty. Showing it beats a silent
        // half-copy — the user can see what happened and delete it.
        setPlanners((prev) => [...prev, copy]);
        select(copy.id);
        return;
      }

      // A series spans several rows, so each old series id maps to one new one
      // — otherwise editing the copy would reach back into the original.
      const seriesIds = new Map<string, string>();
      const blockRows = ((blockRes.data ?? []) as PlannerBlock[]).map((b) => {
        let seriesId = seriesIds.get(b.series_id);
        if (!seriesId) {
          seriesId = crypto.randomUUID();
          seriesIds.set(b.series_id, seriesId);
        }
        return {
          user_id: userId,
          planner_id: copy.id,
          title: b.title,
          color: b.color,
          text_color: b.text_color,
          day_start: b.day_start,
          day_end: b.day_end,
          start_minute: b.start_minute,
          end_minute: b.end_minute,
          // Legacy columns, kept in sync so older readers still work.
          hour_start: Math.floor(b.start_minute / 60),
          hour_end: Math.ceil(b.end_minute / 60),
          series_id: seriesId,
        };
      });

      const tagRows = ((tagRes.data ?? []) as DayTag[]).map((t) => ({
        user_id: userId,
        planner_id: copy.id,
        day: t.day,
        tag: t.tag,
      }));

      const writes = await Promise.all([
        blockRows.length
          ? supabase.from('planner_blocks').insert(blockRows)
          : Promise.resolve({ error: null }),
        tagRows.length
          ? supabase.from('day_tags').insert(tagRows)
          : Promise.resolve({ error: null }),
      ]);

      const writeFailure = writes.find((r) => r.error)?.error;
      if (writeFailure) {
        console.error('Failed to write the duplicated planner', writeFailure);
        setError(describeDbError('copy the planner contents', writeFailure));
      }

      setPlanners((prev) => [...prev, copy]);
      select(copy.id);
    },
    [planners, select, userId]
  );

  const remove = useCallback(
    async (id: string) => {
      // The app has nothing to show without a planner, so the last one stays.
      if (planners.length <= 1) return;
      setError(null);

      const { error: err } = await supabase.from('planners').delete().eq('id', id);
      if (err) {
        console.error('Failed to delete planner', err);
        setError(describeDbError('delete the planner', err));
        return;
      }

      const remaining = planners.filter((p) => p.id !== id);
      setPlanners(remaining);
      // Deleting the open planner falls back to its neighbour rather than
      // leaving the grid pointed at a row that is gone.
      if (id === active?.id) select(remaining[0].id);
    },
    [active?.id, planners, select]
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    planners,
    active,
    loading,
    error,
    dismissError,
    select,
    create,
    rename,
    duplicate,
    remove,
  };
}
