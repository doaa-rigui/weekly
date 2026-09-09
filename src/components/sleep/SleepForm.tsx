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

export function SleepForm({
  nights,
  periods,
  prefill,
  saving,
  onSubmit,
  onClose,
}: {
  /** Existing nights, so the form can say which one this entry joins. */
  nights: Night[];
  /** Existing periods, for the overlap check. */
  periods: SleepPeriod[];
  prefill?: SleepPrefill;
  saving: boolean;
  onSubmit: (draft: SleepDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const initial = useMemo(() => prefill ?? suggestedDraftTimes(), [prefill]);
  const [startValue, setStartValue] = useState(() => toLocalInputValue(initial.start));
  const [endValue, setEndValue] = useState(() => toLocalInputValue(initial.end));
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const start = fromLocalInputValue(startValue);
  const end = fromLocalInputValue(endValue);

  const problem = validateDraft(start, end);
  const overlap = !problem && start && end ? findOverlap(periods, start, end) : null;
  const blocked = problem !== null || overlap !== null;

  /**
   * What this entry will do to its night. Recomputed as the fields change,
   * which is the point — the night an entry belongs to is derived, and derived
   * rules are only trustworthy when you can watch them work.
   */
  const preview = useMemo(() => {
    if (!start || !end || end <= start) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const evening = nightStartOf(start);
    const existing = nights.find((n) => n.key === nightKeyOf(start)) ?? null;
    return {
      minutes,
      evening,
      existing,
      total: minutes + (existing?.totalMinutes ?? 0),
      periodCount: (existing?.periods.length ?? 0) + 1,
    };
  }, [start, end, nights]);

  const save = async () => {
    setSubmitted(true);
    if (blocked || !start || !end) return;
    if (await onSubmit({ started_at: start, ended_at: end, note })) onClose();
  };

  return (
    <Modal title="Add sleep" onClose={onClose}>
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
              {preview.existing ? (
                <>
                  Joins the night of{' '}
                  <span className="font-medium text-night-200">
                    {formatNightRange(preview.existing)}
                  </span>{' '}
                  as sleep period {preview.periodCount} — that night will total{' '}
                  <span className="font-medium text-dream-300">
                    {formatDuration(preview.total)}
                  </span>
                  .
                </>
              ) : (
                <>
                  A new night:{' '}
                  <span className="font-medium text-night-200">
                    {formatNightRangeOf(preview.evening)}
                  </span>
                  .
                </>
              )}
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
            {saving ? 'Saving…' : 'Save sleep'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
