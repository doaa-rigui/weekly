import { useMemo, useState } from 'react';
import { Moon, StickyNote, Sunrise } from 'lucide-react';
import {
  NOTE_MAX,
  findOverlap,
  formatDuration,
  formatNightRange,
  formatNightRangeOf,
  formatTime,
  fromLocalInputValue,
  nightKeyOf,
  nightStartOf,
  suggestedDraftTimes,
  toLocalInputValue,
  validateDraft,
  type Night,
  type SleepDraft,
  type SleepPeriod,
} from '@/lib/sleep';
import { Modal } from './ui';

/**
 * Two times and an optional note. That is the whole form, on purpose — the
 * spec's own limit is that adding sleep must never become a chore, so there is
 * no mood, no quality rating, and no tags.
 *
 * What it does add is a running read-out of the night the entry will land in.
 * Without it, logging 6 AM → 7 AM is an act of faith that the app will file it
 * under last night rather than starting a new one; with it, the answer is on
 * screen before saving.
 */

/** Where a prefilled form starts from — used by "add sleep after Fajr". */
export type SleepPrefill = { start: Date; end: Date };

/**
 * What the entry will do to its night once saved. Held as data rather than
 * built inline, because editing doubles the cases: an entry can stay in its
 * night, move to another one, or move to a night that doesn't exist yet.
 */
type Preview = {
  minutes: number;
  /** Local midnight of the evening the entry will belong to. */
  evening: Date;
  /** The night it lands in, if that night already has entries. */
  existing: Night | null;
  /** Editing, and the times still fall inside the same night. */
  staying: boolean;
  /** What that night will total afterwards. */
  total: number;
  /** Which sleep period of that night this will be. */
  periodCount: number;
};

function Field({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  // A dark `color-scheme` is what makes the native picker and its calendar
  // icon legible on this background.
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-medium text-night-300">
        {icon}
        {label}
      </span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-night-600 bg-night-900 px-3 py-2.5 text-sm text-night-100 [color-scheme:dark] focus:border-dream-500 focus:outline-none"
      />
    </label>
  );
}

/** The one line explaining where the entry will land, in all five cases. */
function NightPreview({ preview, editing }: { preview: Preview; editing: boolean }) {
  const range = preview.existing
    ? formatNightRange(preview.existing)
    : formatNightRangeOf(preview.evening);
  const name = <span className="font-medium text-night-200">{range}</span>;
  const total = (
    <span className="font-medium text-dream-300">{formatDuration(preview.total)}</span>
  );

  if (editing && preview.staying) {
    return (
      <>
        Stays in the night of {name} — that night will total {total}.
      </>
    );
  }
  if (!preview.existing) {
    return (
      <>
        {editing ? 'Moves to a new night' : 'A new night'}: {name}.
      </>
    );
  }
  return (
    <>
      {editing ? 'Moves to' : 'Joins'} the night of {name} as sleep period{' '}
      {preview.periodCount} — that night will total {total}.
    </>
  );
}

export function SleepForm({
  nights,
  periods,
  prefill,
  editing,
  saving,
  onSubmit,
  onClose,
}: {
  /** Existing nights, so the form can say which one this entry joins. */
  nights: Night[];
  /** Existing periods, for the overlap check. */
  periods: SleepPeriod[];
  prefill?: SleepPrefill;
  /** The entry being corrected. Absent when adding a new one. */
  editing?: SleepPeriod;
  saving: boolean;
  onSubmit: (draft: SleepDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const initial = useMemo(() => {
    if (editing) {
      return { start: new Date(editing.started_at), end: new Date(editing.ended_at) };
    }
    return prefill ?? suggestedDraftTimes();
  }, [editing, prefill]);

  const [startValue, setStartValue] = useState(() => toLocalInputValue(initial.start));
  const [endValue, setEndValue] = useState(() => toLocalInputValue(initial.end));
  const [note, setNote] = useState(() => editing?.note ?? '');
  const [submitted, setSubmitted] = useState(false);

  const start = fromLocalInputValue(startValue);
  const end = fromLocalInputValue(endValue);

  const problem = validateDraft(start, end);
  // An entry cannot overlap itself, so the one being edited is excluded.
  const overlap =
    !problem && start && end ? findOverlap(periods, start, end, editing?.id) : null;
  const blocked = problem !== null || overlap !== null;

  /**
   * What this entry will do to its night. Recomputed as the fields change,
   * which is the point — the night an entry belongs to is derived, and derived
   * rules are only trustworthy when you can watch them work.
   */
  const preview = useMemo<Preview | null>(() => {
    if (!start || !end || end <= start) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const existing = nights.find((n) => n.key === nightKeyOf(start)) ?? null;

    // When editing, that night's stored total still counts this entry's *old*
    // times, so its own contribution comes out before the new one goes in —
    // otherwise correcting a time would appear to lengthen the night.
    const staying = editing
      ? (existing?.periods.find((p) => p.row.id === editing.id) ?? null)
      : null;
    const others = (existing?.totalMinutes ?? 0) - (staying?.minutes ?? 0);

    return {
      minutes,
      evening: nightStartOf(start),
      existing,
      staying: staying !== null,
      total: minutes + others,
      // An edit that stays in its night doesn't add a period; anything else does.
      periodCount: (existing?.periods.length ?? 0) + (staying ? 0 : 1),
    };
  }, [start, end, nights, editing]);

  const save = async () => {
    setSubmitted(true);
    if (blocked || !start || !end) return;
    if (await onSubmit({ started_at: start, ended_at: end, note })) onClose();
  };

  return (
    <Modal title={editing ? 'Edit sleep' : 'Add sleep'} onClose={onClose}>
      <div className="space-y-4">
        <Field
          label="Fell asleep"
          icon={<Moon className="h-3.5 w-3.5 text-dream-400" />}
          value={startValue}
          onChange={setStartValue}
        />
        <Field
          label="Woke up"
          icon={<Sunrise className="h-3.5 w-3.5 text-dawn-400" />}
          value={endValue}
          onChange={setEndValue}
        />

        {/* The duration is never typed — it is the one number the app owes you
            for the two you entered. */}
        {preview && (
          <div className="rounded-xl border border-night-700 bg-night-900/60 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-night-400">
                Duration
              </span>
              <span className="text-lg font-semibold tabular-nums text-dream-300">
                {formatDuration(preview.minutes)}
              </span>
            </div>
            <p className="mt-2 border-t border-night-700/70 pt-2 text-xs leading-relaxed text-night-400">
              <NightPreview preview={preview} editing={Boolean(editing)} />
            </p>
          </div>
        )}

        <label className="block">
          <span className="flex items-center gap-1.5 text-xs font-medium text-night-300">
            <StickyNote className="h-3.5 w-3.5 text-night-400" />
            Note
            <span className="font-normal text-night-500">optional</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            rows={2}
            placeholder="Had coffee too late…"
            className="mt-1.5 w-full resize-none rounded-xl border border-night-600 bg-night-900 px-3 py-2.5 text-sm text-night-100 placeholder:text-night-500 focus:border-dream-500 focus:outline-none"
          />
        </label>

        {/* Held back until the first save attempt, so the form doesn't scold
            you about an end time you haven't reached yet. */}
        {submitted && (problem || overlap) && (
          <p className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm font-medium text-rose-300">
            {problem ??
              (overlap
                ? `This overlaps sleep you already logged, ${formatTime(
                    new Date(overlap.started_at)
                  )}–${formatTime(new Date(overlap.ended_at))}.`
                : null)}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-night-600 px-4 py-2.5 text-sm font-medium text-night-200 transition-colors hover:bg-night-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-[1.4] rounded-full bg-dream-500 px-4 py-2.5 text-sm font-semibold text-night-950 transition-colors hover:bg-dream-400 disabled:opacity-60"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sleep'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
