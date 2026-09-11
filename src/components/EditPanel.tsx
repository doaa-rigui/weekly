import { useState } from 'react';
import type { BlockDraft } from '@/lib/supabase';
import {
  PALETTE,
  TEXT_PALETTE,
  MINUTES_PER_DAY,
  summarizeDays,
  type ColorKind,
  type DayLabel,
} from '@/lib/constants';
import type { PeopleStore } from '@/lib/people';
import { PeopleAvatars, PeoplePicker } from './People';
import { formatTime } from './Planner';
import { X, Trash2, Check, Repeat, Loader2 } from 'lucide-react';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function toHourMin(min: number): { h: number; m: number } {
  const c = Math.max(0, Math.min(min, MINUTES_PER_DAY));
  return { h: Math.floor(c / 60), m: c % 60 };
}

/** Perceived brightness, so a swatch's tick mark stays visible on it. */
function isLight(hex: string): boolean {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  if (full.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  if ([r, g, b].some(Number.isNaN)) return false;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

function Swatch({
  color,
  selected,
  onSelect,
}: {
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const light = isLight(color);
  return (
    <button
      onClick={onSelect}
      className={`relative flex h-8 items-center justify-center rounded-lg border transition-transform hover:scale-105 ${
        selected ? 'ring-2 ring-sage-900 ring-offset-1' : ''
      } ${light ? 'border-sage-200' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
      aria-label={`Select color ${color}`}
      aria-pressed={selected}
    >
      {selected && <Check className={`h-4 w-4 ${light ? 'text-sage-900' : 'text-white'}`} />}
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
  palette,
  recent,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  palette: readonly string[];
  recent: string[];
}) {
  // A recent colour that's since been added to the presets would show twice.
  const extras = recent.filter((c) => !palette.includes(c));

  return (
    <div>
      {/* The custom picker rides on the label row rather than below the
          swatches, which keeps the whole panel within one screen. */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-sage-500">
          {label}
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-sage-500 transition-colors hover:text-sage-900">
          Custom
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-sage-200 bg-paper p-0.5"
            aria-label={`${label} custom picker`}
          />
        </label>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {[...palette, ...extras].map((c) => (
          <Swatch key={c} color={c} selected={value === c} onSelect={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}

export function EditPanel({
  draft,
  recentColors,
  peopleStore,
  dayLabels,
  isEditing,
  onSave,
  onDelete,
  onClose,
}: {
  draft: BlockDraft;
  recentColors: Record<ColorKind, string[]>;
  peopleStore: PeopleStore;
  /** The open planner's columns — a fortnight has fourteen, not seven. */
  dayLabels: DayLabel[];
  isEditing: boolean;
  onSave: (d: BlockDraft) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [color, setColor] = useState(draft.color);
  const [textColor, setTextColor] = useState(draft.text_color);
  const [days, setDays] = useState<number[]>(draft.days);
  const [people, setPeople] = useState<string[]>(draft.people);
  // Which write is in flight, so the panel can't be double-submitted or
  // closed out from under a request that is still running.
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);

  const startHM = toHourMin(draft.start_minute);
  const endHM = toHourMin(draft.end_minute);
  const [startH, setStartH] = useState(startHM.h);
  const [startM, setStartM] = useState(startHM.m);
  const [endH, setEndH] = useState(endHM.h);
  const [endM, setEndM] = useState(endHM.m);

  const startMinute = startH * 60 + startM;
  const endMinute = endH * 60 + endM;
  const repeats = days.length > 1;

  const dayLabel =
    days.length === 1 ? (dayLabels[days[0]]?.full ?? 'Day 1') : summarizeDays(days, dayLabels);

  // Every row covers a single day, so the end must always follow the start.
  const endInvalid = endMinute <= startMinute;
  const noDays = days.length === 0;

  const toggleDay = (day: number) =>
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );

  const busy = pending !== null;

  const run = async (kind: 'save' | 'delete', action: () => void | Promise<void>) => {
    if (busy) return;
    setPending(kind);
    try {
      await action();
    } finally {
      // A successful save unmounts this panel; setting state on an unmounted
      // component is a no-op, and on failure it re-enables the buttons.
      setPending(null);
    }
  };

  const handleSave = () => {
    if (noDays || endInvalid || busy) return;
    run('save', () =>
      onSave({
        title: title.trim() || 'Untitled',
        color,
        text_color: textColor,
        start_minute: startMinute,
        end_minute: endMinute,
        days,
        // Someone deleted from the list while this panel was open shouldn't be
        // written back onto the block as a dangling id.
        people: people.filter((id) => peopleStore.byId.has(id)),
      })
    );
  };

  const handleDelete = () => run('delete', onDelete);

  const handleClose = () => {
    if (!busy) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-sage-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-sage-200 bg-paper/95 backdrop-blur-md shadow-[0_-4px_40px_rgba(40,48,40,0.25)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview header — shows the block exactly as it will be drawn */}
        <div
          className="relative shrink-0 px-6 py-4"
          style={{ backgroundColor: color, color: textColor }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider opacity-80">{dayLabel}</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold">{title || 'Untitled'}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm opacity-90">
                <span className="truncate">
                  {formatTime(startMinute)} – {formatTime(endMinute)}
                  {repeats && ` · repeats on ${days.length} days`}
                </span>
                <PeopleAvatars ids={people} byId={peopleStore.byId} />
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={busy}
              className="rounded-lg p-1.5 opacity-70 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrolls on its own so the preview header and the action bar stay put. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-sage-500">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning Workout"
              autoFocus
              className="w-full rounded-lg border border-sage-200 px-3 py-2 text-sm text-sage-900 outline-none transition-colors placeholder:text-sage-400 focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <PeoplePicker selected={people} onChange={setPeople} store={peopleStore} />

          <ColorField
            label="Block color"
            value={color}
            onChange={setColor}
            palette={PALETTE}
            recent={recentColors.block}
          />

          <ColorField
            label="Text color"
            value={textColor}
            onChange={setTextColor}
            palette={TEXT_PALETTE}
            recent={recentColors.text}
          />

          {/* Repeat days */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sage-500">
                <Repeat className="h-3.5 w-3.5" />
                Repeats on
              </label>
              <span className="text-xs font-medium text-sage-400">
                {summarizeDays(days, dayLabels)}
              </span>
            </div>
            {/* Seven to a row, so a fortnight reads as two weeks stacked. */}
            <div className="grid grid-cols-7 gap-1.5">
              {dayLabels.map((label, i) => {
                const active = days.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    aria-pressed={active}
                    title={label.full}
                    className={`rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-moss-600 bg-moss-600 text-white'
                        : 'border-sage-200 text-sage-500 hover:border-sage-300 hover:bg-sage-50'
                    }`}
                  >
                    {label.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time range: hour + minute */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-sage-500">
                Start time
              </label>
              <div className="flex gap-2">
                <select
                  value={startH}
                  onChange={(e) => setStartH(Number(e.target.value))}
                  className="w-full rounded-lg border border-sage-200 px-3 py-2 text-sm text-sage-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
                >
                  {HOURS_24.map((h) => (
                    <option key={h} value={h}>
                      {formatTime(h * 60).replace(/:[0-9]+/, '')}
                    </option>
                  ))}
                </select>
                <select
                  value={startM}
                  onChange={(e) => setStartM(Number(e.target.value))}
                  className="w-20 rounded-lg border border-sage-200 px-2 py-2 text-sm text-sage-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      :{String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-sage-500">
                End time
              </label>
              <div className="flex gap-2">
                <select
                  value={endH}
                  onChange={(e) => setEndH(Number(e.target.value))}
                  className="w-full rounded-lg border border-sage-200 px-3 py-2 text-sm text-sage-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
                >
                  {HOURS_24.map((h) => (
                    <option key={h} value={h}>
                      {formatTime(h * 60).replace(/:[0-9]+/, '')}
                    </option>
                  ))}
                </select>
                <select
                  value={endM}
                  onChange={(e) => setEndM(Number(e.target.value))}
                  className="w-20 rounded-lg border border-sage-200 px-2 py-2 text-sm text-sage-900 outline-none focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      :{String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {endInvalid && (
            <p className="text-xs font-medium text-red-600">
              End time must be after the start time.
            </p>
          )}
          {noDays && (
            <p className="text-xs font-medium text-red-600">
              Pick at least one day for this block.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-sage-100 px-6 py-3">
          <div>
            {isEditing && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {pending === 'delete' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {pending === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-sage-600 transition-colors hover:bg-sage-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={endInvalid || noDays || busy}
              className="flex items-center gap-1.5 rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-moss-600"
            >
              {pending === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending === 'save' ? 'Saving…' : isEditing ? 'Save changes' : 'Add block'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
