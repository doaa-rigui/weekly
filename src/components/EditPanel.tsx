import { useState } from 'react';
import type { BlockDraft } from '@/lib/supabase';
import { DAYS, FULL_DAYS, PALETTE, MINUTES_PER_DAY } from '@/lib/constants';
import { formatTime } from './Planner';
import { X, Trash2, Check } from 'lucide-react';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function toHourMin(min: number): { h: number; m: number } {
  const c = Math.max(0, Math.min(min, MINUTES_PER_DAY));
  return { h: Math.floor(c / 60), m: c % 60 };
}

export function EditPanel({
  draft,
  isEditing,
  onSave,
  onDelete,
  onClose,
}: {
  draft: BlockDraft;
  isEditing: boolean;
  onSave: (d: BlockDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [color, setColor] = useState(draft.color);
  const [dayStart, setDayStart] = useState(draft.day_start);
  const [dayEnd, setDayEnd] = useState(draft.day_end);

  const startHM = toHourMin(draft.start_minute);
  const endHM = toHourMin(draft.end_minute);
  const [startH, setStartH] = useState(startHM.h);
  const [startM, setStartM] = useState(startHM.m);
  const [endH, setEndH] = useState(endHM.h);
  const [endM, setEndM] = useState(endHM.m);

  const startMinute = startH * 60 + startM;
  const endMinute = endH * 60 + endM;
  const spansDays = dayEnd > dayStart;

  const dayLabel =
    dayStart === dayEnd
      ? FULL_DAYS[dayStart]
      : `${FULL_DAYS[dayStart]} – ${FULL_DAYS[dayEnd]}`;

  const endInvalid = endMinute <= startMinute && dayStart === dayEnd;

  const handleSave = () => {
    let em = endH * 60 + endM;
    if (em <= startMinute && dayStart === dayEnd) em = startMinute + 15;
    onSave({
      title: title.trim() || 'Untitled',
      color,
      day_start: dayStart,
      day_end: dayEnd,
      start_minute: startMinute,
      end_minute: em,
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
        {/* Preview header */}
        <div className="relative px-6 py-5 text-white" style={{ backgroundColor: color }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider opacity-80">{dayLabel}</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold">{title || 'Untitled'}</h2>
              <p className="mt-0.5 text-sm opacity-90">
                {formatTime(startMinute)} – {formatTime(endMinute)}
                {spansDays && ' · across multiple days'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
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

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Color
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`relative flex h-9 items-center justify-center rounded-lg transition-transform hover:scale-105 ${
                    color === c ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                >
                  {color === c && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                aria-label="Custom color picker"
              />
              <span className="text-sm text-slate-500">
                Pick a custom color
              </span>
            </div>
          </div>

          {/* Day range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                From day
              </label>
              <select
                value={dayStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDayStart(v);
                  if (v > dayEnd) setDayEnd(v);
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {FULL_DAYS[i]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                To day
              </label>
              <select
                value={dayEnd}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDayEnd(v);
                  if (v < dayStart) setDayStart(v);
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {FULL_DAYS[i]}
                  </option>
                ))}
              </select>
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
              End time must be after the start time on the same day.
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
              disabled={endInvalid}
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
