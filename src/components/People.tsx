import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { AVATARS_PER_BLOCK, PERSON_NAME_MAX, initialsOf } from '@/lib/constants';
import type { PeopleStore } from '@/lib/people';
import type { Person } from '@/lib/supabase';

/**
 * Resolves stored ids to people, dropping any that have since been deleted.
 * The list is treated as possibly absent: a block read from a database where
 * the migration hasn't run yet has no `people` column at all.
 */
function resolve(ids: string[] | undefined, byId: Map<string, Person>): Person[] {
  return (ids ?? []).map((id) => byId.get(id)).filter((p): p is Person => p !== undefined);
}

/**
 * The stack of initials drawn on a block. Overlapping, capped, and titled with
 * the full list — a block is only ever a few hundred pixels wide.
 */
export function PeopleAvatars({
  ids,
  byId,
  size = 'md',
}: {
  ids: string[] | undefined;
  byId: Map<string, Person>;
  size?: 'sm' | 'md';
}) {
  const people = resolve(ids, byId);
  if (people.length === 0) return null;

  const shown = people.slice(0, AVATARS_PER_BLOCK);
  const extra = people.length - shown.length;
  const box = size === 'sm' ? 'h-3.5 w-3.5 text-[7px]' : 'h-4 w-4 text-[8px]';

  return (
    <span
      className="flex shrink-0 items-center"
      title={`${people.length === 1 ? '' : `${people.length} people: `}${people
        .map((p) => p.name)
        .join(', ')}`}
    >
      {shown.map((person, i) => (
        <span
          key={person.id}
          // Overlapped, so three avatars cost about the width of two.
          className={`${box} ${
            i > 0 ? '-ml-1' : ''
          } flex items-center justify-center rounded-full font-bold uppercase leading-none text-white ring-1 ring-paper/70`}
          style={{ backgroundColor: person.color }}
        >
          {initialsOf(person.name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`${box} -ml-1 flex items-center justify-center rounded-full bg-sage-700 font-bold leading-none text-white ring-1 ring-paper/70`}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

/** One name as it appears in the edit panel: avatar, name, and a way off. */
function PersonChip({ person, onRemove }: { person: Person; onRemove: () => void }) {
  return (
    <span className="flex max-w-full items-center gap-1.5 rounded-full border border-sage-200 bg-sage-50 py-1 pl-1 pr-1.5 text-xs font-medium text-sage-700">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase leading-none text-white"
        style={{ backgroundColor: person.color }}
      >
        {initialsOf(person.name)}
      </span>
      <span className="truncate">{person.name}</span>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-full p-0.5 text-sage-400 transition-colors hover:bg-sage-200 hover:text-sage-700"
        aria-label={`Remove ${person.name} from this block`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * A Notion-style multi-select over the account's people. Tagging someone takes
 * one click, and a name that isn't on the list yet is added by typing it — no
 * sharing, no invites, nothing to set up first.
 */
export function PeoplePicker({
  selected,
  onChange,
  store,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  store: PeopleStore;
}) {
  const { people, byId, create, remove } = store;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Roster order, not click order, so the chips don't reshuffle as you edit.
  const chosen = people.filter((p) => selected.includes(p.id));

  const needle = query.trim().toLocaleLowerCase();
  const matches = needle
    ? people.filter((p) => p.name.toLocaleLowerCase().includes(needle))
    : people;
  // Typing a name that already exists should tag it, not offer a duplicate.
  const exactMatch = people.some((p) => p.name.toLocaleLowerCase() === needle);
  const canCreate = needle.length > 0 && !exactMatch;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // The edit panel scrolls, and this list opens downwards into it — bring it
    // into view rather than leaving it below the fold.
    panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  const addTyped = async () => {
    if (!canCreate || adding) return;
    setAdding(true);
    const person = await create(query);
    setAdding(false);
    if (!person) return;
    if (!selected.includes(person.id)) onChange([...selected, person.id]);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sage-500">
          People
        </span>
        {chosen.length > 0 && (
          <span className="text-xs font-medium text-sage-400">
            {chosen.length} tagged
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((person) => (
          <PersonChip
            key={person.id}
            person={person}
            onRemove={() => onChange(selected.filter((s) => s !== person.id))}
          />
        ))}
        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-sage-300 px-2.5 py-1 text-xs font-medium text-sage-500 transition-colors hover:border-sage-400 hover:bg-sage-50 hover:text-sage-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {chosen.length === 0 ? 'Tag someone' : 'Add'}
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-sage-200 bg-paper/95 backdrop-blur-sm shadow-[0_2px_6px_rgba(40,48,40,0.06),0_20px_44px_-24px_rgba(40,48,40,0.4)]"
        >
          <div className="border-b border-sage-100 p-1.5">
            <input
              ref={inputRef}
              value={query}
              maxLength={PERSON_NAME_MAX}
              placeholder="Search or type a name…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setOpen(false);
                  return;
                }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                // Enter takes the obvious action: tag the one name on screen,
                // or add the name that isn't on the list yet.
                if (canCreate) return void addTyped();
                if (matches.length === 1) {
                  toggle(matches[0].id);
                  setQuery('');
                }
              }}
              className="w-full rounded-lg border border-sage-200 px-2.5 py-1.5 text-sm text-sage-900 outline-none placeholder:text-sage-400 focus:border-sage-400"
            />
          </div>

          <ul className="max-h-44 overflow-y-auto py-1">
            {matches.map((person) => {
              const isSelected = selected.includes(person.id);
              return (
                <li key={person.id} className="group flex items-center">
                  <button
                    onClick={() => toggle(person.id)}
                    role="menuitemcheckbox"
                    aria-checked={isSelected}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-sage-50"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase leading-none text-white"
                      style={{ backgroundColor: person.color }}
                    >
                      {initialsOf(person.name)}
                    </span>
                    <span className="truncate text-sm text-sage-700">{person.name}</span>
                    {isSelected && <Check className="ml-auto h-4 w-4 shrink-0 text-sage-900" />}
                  </button>
                  {/*
                    Deleting is for fixing a typo in the list, so it stays
                    hidden until hover rather than sitting beside every name.
                  */}
                  <button
                    onClick={() => remove(person.id)}
                    title={`Remove ${person.name} from your people`}
                    aria-label={`Remove ${person.name} from your people`}
                    className="mr-1 rounded-md p-1.5 text-sage-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}

            {matches.length === 0 && !canCreate && (
              <li className="px-3 py-2 text-xs text-sage-400">
                No one on your list yet — type a name to add them.
              </li>
            )}
          </ul>

          {canCreate && (
            <button
              onClick={addTyped}
              disabled={adding}
              className="flex w-full items-center gap-2 border-t border-sage-100 px-2.5 py-2 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-50 disabled:opacity-60"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="truncate">Add “{query.trim()}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
