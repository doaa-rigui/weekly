import { useMemo, useState } from 'react';
import { CalendarRange, Trash2 } from 'lucide-react';
import {
  DEFAULT_COLOR,
  DEFAULT_ICON,
  EVERY_DAY,
  HABIT_COLORS,
  HABIT_NAME_MAX,
  ICON_KEYS,
  WEEKDAY_LABELS,
  describeFrequency,
  formatShortDate,
  iconFor,
  isSameDay,
  isoDateOf,
  nextDueDate,
  ordinal,
  type Frequency,
  type Habit,
  type HabitDraft,
} from '@/lib/habits';
import {
  Field,
  GhostButton,
  INPUT_CLASS,
  Modal,
  PrimaryButton,
  Segmented,
  useAutoFocus,
} from './ui';

/**
 * Add and edit are the same dialog. They ask for exactly the same four things,
 * and keeping them apart would mean two copies of the frequency picker — which
 * is most of the form, and the part most likely to drift.
 */
export function HabitForm({
  editing,
  saving,
  onSubmit,
  onDelete,
  onClose,
}: {
  /** The habit being changed, or undefined when adding a new one. */
  editing?: Habit;
  saving: boolean;
  onSubmit: (draft: HabitDraft) => Promise<boolean>;
  /** Only offered when editing; the confirm prompt lives with the caller. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? DEFAULT_ICON);
  const [color, setColor] = useState(editing?.color ?? DEFAULT_COLOR);
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? EVERY_DAY);

  const nameRef = useAutoFocus<HTMLInputElement>();
  const trimmed = name.trim();
  const valid = trimmed.length > 0;

  const submit = async () => {
    if (!valid || saving) return;
    const ok = await onSubmit({ name: trimmed, icon, color, frequency });
    if (ok) onClose();
  };

  const Icon = iconFor(icon);

  return (
    <Modal
      title={editing ? 'Edit habit' : 'New habit'}
      subtitle={
        editing
          ? 'Changes apply from today. Days already logged keep what they say.'
          : 'Four things: what it is, how it looks, and when it comes round.'
      }
      width="lg"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* Deleting sits apart from saving, on the other side of the bar:
              they are the two ways out of this dialog and should not be
              neighbours. */}
          {onDelete ? (
            <GhostButton tone="danger" onClick={onDelete} disabled={saving}>
              <Trash2 className="h-4 w-4" />
              Delete habit
            </GhostButton>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={submit} disabled={!valid || saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create habit'}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* The habit as it will appear on Today, updating as the form is
            filled in — an icon and a colour are choices you can only really
            judge by seeing them in the row they will live in. */}
        <div className="flex items-center gap-3 rounded-2xl border border-clay-200/80 bg-clay-50 px-4 py-3.5">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-clay-900">
              {trimmed || 'Your new habit'}
            </p>
            <p className="truncate text-xs text-clay-500">{describeFrequency(frequency)}</p>
          </div>
        </div>

        <Field label="Name">
          <input
            ref={nameRef}
            value={name}
            maxLength={HABIT_NAME_MAX}
            placeholder="Read Quran"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
          <Field label="Icon">
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </Field>
          <Field label="Colour">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
        </div>

        <Field label="Frequency">
          <FrequencyPicker value={frequency} onChange={setFrequency} />
        </Field>
      </div>
    </Modal>
  );
}

// -- Icon and colour ---------------------------------------------------------

function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (icon: string) => void;
}) {
  return (
    // A scrolling grid rather than a dropdown: thirty icons are quicker to
    // recognise than to name, so they are all on screen at once.
    <div
      role="radiogroup"
      aria-label="Habit icon"
      className="grid max-h-36 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border border-clay-200 bg-clay-50/60 p-2"
    >
      {ICON_KEYS.map((key) => {
        const Icon = iconFor(key);
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={key}
            onClick={() => onChange(key)}
            className={`flex h-9 items-center justify-center rounded-lg transition-colors ${
              active ? 'bg-white shadow-[0_1px_2px_rgba(40,36,33,0.12)]' : 'hover:bg-white/70'
            }`}
            style={active ? { color } : undefined}
          >
            <Icon className={`h-[18px] w-[18px] ${active ? '' : 'text-clay-400'}`} />
          </button>
        );
      })}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Habit colour"
      className="grid grid-cols-5 gap-1.5 rounded-xl border border-clay-200 bg-clay-50/60 p-2"
    >
      {HABIT_COLORS.map((swatch) => {
        const active = swatch === value;
        return (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={swatch}
            onClick={() => onChange(swatch)}
            className={`h-7 w-7 rounded-lg transition-transform ${
              active ? 'ring-2 ring-clay-900/70 ring-offset-2 ring-offset-clay-50' : 'hover:scale-105'
            }`}
            style={{ backgroundColor: swatch }}
          />
        );
      })}
    </div>
  );
}

// -- Frequency ---------------------------------------------------------------

/**
 * The named schedules, and the shape each one stands for. They are points in
 * the same space Custom opens up rather than a parallel set of special cases,
 * which is what lets the picker show the right preset when an existing habit
 * is opened for editing.
 */
const PRESETS: { id: string; label: string; make: (current: Frequency) => Frequency }[] = [
  { id: 'daily', label: 'Every day', make: () => ({ kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }) },
  { id: 'weekdays', label: 'Every weekday', make: () => ({ kind: 'weekly', weekdays: [0, 1, 2, 3, 4] }) },
  { id: 'weekend', label: 'Every weekend', make: () => ({ kind: 'weekly', weekdays: [5, 6] }) },
  {
    id: 'weekly',
    label: 'Certain days',
    // Carries the current selection over where it can, so picking "Certain
    // days" after "Every weekend" starts from Sat/Sun rather than from blank.
    make: (current) => ({
      kind: 'weekly',
      weekdays: weekdaysOf(current).length > 0 ? weekdaysOf(current) : [0],
    }),
  },
  {
    id: 'fortnightly',
    label: 'Every 2 weeks',
    make: (current) => ({
      kind: 'interval',
      unit: 'week',
      every: 2,
      weekdays: weekdaysOf(current).slice(0, 1).length > 0 ? weekdaysOf(current).slice(0, 1) : [0],
    }),
  },
  { id: 'monthly', label: 'Every month', make: () => ({ kind: 'monthly', days: [1] }) },
];

function weekdaysOf(freq: Frequency): number[] {
  return freq.kind === 'monthly' ? [] : freq.weekdays;
}

/** Which preset a frequency is, or 'custom' when it is none of them. */
function presetOf(freq: Frequency): string {
  if (freq.kind === 'weekly') {
    const set = freq.weekdays.join(',');
    if (set === '0,1,2,3,4,5,6') return 'daily';
    if (set === '0,1,2,3,4') return 'weekdays';
    if (set === '5,6') return 'weekend';
    return 'weekly';
  }
  if (freq.kind === 'interval' && freq.unit === 'week' && freq.every === 2) return 'fortnightly';
  if (freq.kind === 'monthly' && freq.days.length === 1) return 'monthly';
  return 'custom';
}

const CUSTOM_MODES = [
  { value: 'weekly', label: 'Days of the week' },
  { value: 'days', label: 'Every N days' },
  { value: 'weeks', label: 'Every N weeks' },
  { value: 'monthly', label: 'Days of the month' },
] as const;

type CustomMode = (typeof CUSTOM_MODES)[number]['value'];

function modeOf(freq: Frequency): CustomMode {
  if (freq.kind === 'monthly') return 'monthly';
  if (freq.kind === 'interval') return freq.unit === 'day' ? 'days' : 'weeks';
  return 'weekly';
}

/**
 * The whole recurrence editor: six named schedules, and a Custom panel that
 * opens the shape underneath them. The preview line at the bottom is doing
 * real work — "every 2 weeks" is ambiguous until you can see which Tuesdays
 * it actually means.
 */
export function FrequencyPicker({
  value,
  onChange,
}: {
  value: Frequency;
  onChange: (freq: Frequency) => void;
}) {
  const preset = presetOf(value);
  const [custom, setCustom] = useState(preset === 'custom');
  const mode = modeOf(value);

  // Previewed against a habit starting today, which is what a new one does.
  // Editing an existing habit keeps its own anchor, so this is a hint about
  // the shape of the schedule rather than a promise about its exact dates.
  const upcoming = useMemo(() => {
    const schedule = { frequency: value, anchor_date: isoDateOf(new Date()) };
    const dates: Date[] = [];
    let cursor = new Date();
    for (let i = 0; i < 4; i += 1) {
      const next = nextDueDate(schedule, cursor);
      if (!next) break;
      dates.push(next);
      cursor = new Date(next.getTime() + 86_400_000);
    }
    return dates;
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((option) => {
          const active = !custom && preset === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustom(false);
                onChange(option.make(value));
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-iris-200 bg-iris-50 text-iris-700'
                  : 'border-clay-200 text-clay-600 hover:bg-clay-100'
              }`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom || preset === 'custom'}
          onClick={() => setCustom(true)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            custom || preset === 'custom'
              ? 'border-iris-200 bg-iris-50 text-iris-700'
              : 'border-clay-200 text-clay-600 hover:bg-clay-100'
          }`}
        >
          Custom…
        </button>
      </div>

      {/* The days a preset leaves open are asked for inline rather than
          hidden behind Custom: "certain days" and "every 2 weeks" are not
          finished schedules on their own. */}
      {!custom && preset === 'weekly' && value.kind === 'weekly' && (
        <WeekdayPicker
          value={value.weekdays}
          onChange={(weekdays) => onChange({ kind: 'weekly', weekdays })}
        />
      )}

      {!custom && preset === 'fortnightly' && value.kind === 'interval' && (
        <WeekdayPicker
          value={value.weekdays}
          onChange={(weekdays) => onChange({ ...value, weekdays })}
        />
      )}

      {!custom && preset === 'monthly' && value.kind === 'monthly' && (
        <MonthDayPicker value={value.days} onChange={(days) => onChange({ kind: 'monthly', days })} />
      )}

      {(custom || preset === 'custom') && (
        <div className="space-y-3 rounded-xl border border-clay-200 bg-clay-50/60 p-3">
          <Segmented
            options={CUSTOM_MODES}
            value={mode}
            onChange={(next) => onChange(blankFor(next, value))}
            label="Custom recurrence"
          />

          {mode === 'weekly' && value.kind === 'weekly' && (
            <WeekdayPicker
              value={value.weekdays}
              onChange={(weekdays) => onChange({ kind: 'weekly', weekdays })}
            />
          )}

          {mode === 'days' && value.kind === 'interval' && (
            <IntervalInput
              unit="day"
              every={value.every}
              onChange={(every) => onChange({ kind: 'interval', unit: 'day', every, weekdays: [] })}
            />
          )}

          {mode === 'weeks' && value.kind === 'interval' && (
            <div className="space-y-3">
              <IntervalInput
                unit="week"
                every={value.every}
                onChange={(every) => onChange({ ...value, every })}
              />
              <WeekdayPicker
                value={value.weekdays}
                onChange={(weekdays) => onChange({ ...value, weekdays })}
              />
            </div>
          )}

          {mode === 'monthly' && value.kind === 'monthly' && (
            <MonthDayPicker
              value={value.days}
              onChange={(days) => onChange({ kind: 'monthly', days })}
            />
          )}
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-clay-500">
        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-clay-400" />
        <span className="font-medium text-clay-700">{describeFrequency(value)}</span>
        {upcoming.length > 0 && (
          <span>
            · next{' '}
            {upcoming
              .map((date) => (isSameDay(date, new Date()) ? 'today' : formatShortDate(date)))
              .join(', ')}
          </span>
        )}
      </p>
    </div>
  );
}

/** A sensible starting point when the custom mode changes under the user. */
function blankFor(mode: CustomMode, current: Frequency): Frequency {
  const weekdays = weekdaysOf(current);
  switch (mode) {
    case 'weekly':
      return { kind: 'weekly', weekdays: weekdays.length > 0 ? weekdays : [0] };
    case 'days':
      return { kind: 'interval', unit: 'day', every: 3, weekdays: [] };
    case 'weeks':
      return {
        kind: 'interval',
        unit: 'week',
        every: 2,
        weekdays: weekdays.length > 0 ? weekdays : [0],
      };
    case 'monthly':
      return { kind: 'monthly', days: [1] };
  }
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    // Never empty: a habit due on no days at all would silently vanish from
    // Today with nothing to explain why.
    onChange(next.length > 0 ? next.sort((a, b) => a - b) : value);
  };

  return (
    <div className="flex gap-1.5">
      {WEEKDAY_LABELS.map((label, day) => {
        const active = value.includes(day);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(day)}
            className={`h-9 flex-1 rounded-lg border text-xs font-semibold transition-colors ${
              active
                ? 'border-iris-300 bg-iris-500 text-white'
                : 'border-clay-200 bg-white text-clay-500 hover:bg-clay-100'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function IntervalInput({
  unit,
  every,
  onChange,
}: {
  unit: 'day' | 'week';
  every: number;
  onChange: (every: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-clay-600">
      <span>Every</span>
      <input
        type="number"
        min={1}
        max={unit === 'day' ? 365 : 52}
        value={every}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(unit === 'day' ? 365 : 52, Math.max(1, n)));
        }}
        className="w-20 rounded-xl border border-clay-200 bg-white px-3 py-2 text-sm tabular-nums text-clay-900 outline-none focus:border-iris-400 focus:ring-4 focus:ring-iris-100"
      />
      <span>{unit === 'day' ? (every === 1 ? 'day' : 'days') : every === 1 ? 'week' : 'weeks'}</span>
    </div>
  );
}

function MonthDayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    onChange(next.length > 0 ? next.sort((a, b) => a - b) : value);
  };

  return (
    <div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const active = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              aria-label={`${ordinal(day)} of the month`}
              onClick={() => toggle(day)}
              className={`h-8 rounded-lg border text-[11px] font-semibold tabular-nums transition-colors ${
                active
                  ? 'border-iris-300 bg-iris-500 text-white'
                  : 'border-clay-200 bg-white text-clay-500 hover:bg-clay-100'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      {value.some((day) => day > 28) && (
        <p className="mt-2 text-xs text-clay-400">
          In shorter months, the {ordinal(Math.max(...value))} falls on the last day.
        </p>
      )}
    </div>
  );
}
