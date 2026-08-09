import { useState } from 'react';
import type { BlockDraft } from '@/lib/supabase';
import {
  DAYS,
  FULL_DAYS,
  PALETTE,
  TEXT_PALETTE,
  MINUTES_PER_DAY,
  type ColorKind,
} from '@/lib/constants';
import { formatTime, summarizeDays } from './Planner';
import { X, Trash2, Check, Repeat } from 'lucide-react';

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
      className={`relative flex h-9 items-center justify-center rounded-lg border transition-transform hover:scale-105 ${
        selected ? 'ring-2 ring-slate-900 ring-offset-1' : ''
      } ${light ? 'border-slate-200' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
      aria-label={`Select color ${color}`}
      aria-pressed={selected}
    >
      {selected && <Check className={`h-4 w-4 ${light ? 'text-slate-900' : 'text-white'}`} />}
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
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="grid grid-cols-6 gap-2">
        {[...palette, ...extras].map((c) => (
          <Swatch key={c} color={c} selected={value === c} onSelect={() => onChange(c)} />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
          aria-label={`${label} custom picker`}
        />
        <span className="text-sm text-slate-500">Pick a custom color</span>
      </div>
    </div>
  );
}

export function EditPanel({
  draft,
  recentColors,
  isEditing,
  onSave,
  onDelete,
  onClose,
}: {
  draft: BlockDraft;
  recentColors: Record<ColorKind, string[]>;
  isEditing: boolean;
  onSave: (d: BlockDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [color, setColor] = useState(draft.color);
  const [textColor, setTextColor] = useState(draft.text_color);
  const [days, setDays] = useState<number[]>(draft.days);

  const startHM = toHourMin(draft.start_minute);
  const endHM = toHourMin(draft.end_minute);
  const [startH, setStartH] = useState(startHM.h);
  const [startM, setStartM] = useState(startHM.m);
  const [endH, setEndH] = useState(endHM.h);
  const [endM, setEndM] = useState(endHM.m);

  const startMinute = startH * 60 + startM;
  const endMinute = endH * 60 + endM;
  const repeats = days.length > 1;

  const dayLabel = days.length === 1 ? FULL_DAYS[days[0]] : summarizeDays(days);

  // Every row covers a single day, so the end must always follow the start.
  const endInvalid = endMinute <= startMinute;
  const noDays = days.length === 0;

  const toggleDay = (day: number) =>
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );

  const handleSave = () => {
    if (noDays || endInvalid) return;
    onSave({
      title: title.trim() || 'Untitled',
      color,
      text_color: textColor,
      start_minute: startMinute,
      end_minute: endMinute,
      days,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview header — shows the block exactly as it will be drawn */}
        <div className="relative px-6 py-5" style={{ backgroundColor: color, color: textColor }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider opacity-80">{dayLabel}</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold">{title || 'Untitled'}</h2>
              <p className="mt-0.5 text-sm opacity-90">
                {formatTime(startMinute)} – {formatTime(endMinute)}
                {repeats && ` · repeats on ${days.length} days`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning Workout"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

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
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Repeat className="h-3.5 w-3.5" />
                Repeats on
              </label>
              <span className="text-xs font-medium text-slate-400">{summarizeDays(days)}</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => {
                const active = days.includes(i);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDay(i)}
                    aria-pressed={active}
                    title={FULL_DAYS[i]}
                    className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time range: hour + minute */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Start time
              </label>
              <div className="flex gap-2">
                <select
                  value={startH}
                  onChange={(e) => setStartH(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
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
                  className="w-20 rounded-lg border border-slate-200 px-2 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                End time
              </label>
              <div className="flex gap-2">
                <select
                  value={endH}
                  onChange={(e) => setEndH(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
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
                  className="w-20 rounded-lg border border-slate-200 px-2 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
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
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div>
            {isEditing && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={endInvalid || noDays}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isEditing ? 'Save changes' : 'Add block'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
