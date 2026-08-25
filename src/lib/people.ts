import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type Person, type PlannerBlock } from './supabase';
import { describeDbError } from './errors';
import { PEOPLE_PALETTE, PERSON_NAME_MAX } from './constants';

export type PeopleStore = {
  people: Person[];
  /** Lookup for turning a block's stored ids into names and colours. */
  byId: Map<string, Person>;
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  /**
   * Adds a person, or returns the one already on the list under that name.
   * Typing a name that exists should tag them, not make a second copy.
   */
  create: (name: string) => Promise<Person | null>;
  /** Removes a person from the list and from every block tagging them. */
  remove: (id: string) => Promise<void>;
};

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * The account's list of people. Held above <Planner> so switching planners
 * doesn't refetch it — the same people turn up in every planner.
 */
export function usePeople(userId: string): PeopleStore {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: err } = await supabase
        .from('people')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (err) {
        console.error('Failed to load people', err);
        setError(describeDbError('load your people', err));
      } else {
        setPeople((data ?? []) as Person[]);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const create = useCallback(
    async (name: string): Promise<Person | null> => {
      const trimmed = name.trim().slice(0, PERSON_NAME_MAX);
      if (!trimmed) return null;

      const existing = people.find((p) => sameName(p.name, trimmed));
      if (existing) return existing;

      setError(null);
      const { data, error: err } = await supabase
        .from('people')
        .insert({
          user_id: userId,
          name: trimmed,
          // In order, so the first few people are easy to tell apart.
          color: PEOPLE_PALETTE[people.length % PEOPLE_PALETTE.length],
        })
        .select()
        .single();

      if (err || !data) {
        console.error('Failed to add person', err);
        setError(describeDbError('add that person', err ?? { message: 'no row returned' }));
        return null;
      }

      const person = data as Person;
      setPeople((prev) => [...prev, person]);
      return person;
    },
    [people, userId]
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);

      // Blocks hold ids in an array with no foreign key, so the blocks are
      // cleaned up here. The grid tolerates a leftover id either way, but a
      // reused list shouldn't carry ghosts.
      const { data: tagged, error: readErr } = await supabase
        .from('planner_blocks')
        .select('id, people')
        .contains('people', [id]);

      if (readErr) {
        console.error('Failed to find blocks tagging this person', readErr);
        setError(describeDbError('remove that person from their blocks', readErr));
        return;
      }

      const strips = ((tagged ?? []) as Pick<PlannerBlock, 'id' | 'people'>[]).map((row) =>
        supabase
          .from('planner_blocks')
          .update({ people: row.people.filter((p) => p !== id) })
          .eq('id', row.id)
      );

      const stripFailure = (await Promise.all(strips)).find((r) => r.error)?.error;
      if (stripFailure) {
        console.error('Failed to untag this person', stripFailure);
        setError(describeDbError('remove that person from their blocks', stripFailure));
        return;
      }

      const { error: err } = await supabase.from('people').delete().eq('id', id);
      if (err) {
        console.error('Failed to delete person', err);
        setError(describeDbError('delete that person', err));
        return;
      }
      setPeople((prev) => prev.filter((p) => p.id !== id));
    },
    []
  );

  const dismissError = useCallback(() => setError(null), []);

  return { people, byId, loading, error, dismissError, create, remove };
}
