import { useState } from 'react';
import { Check, CircleSlash, Undo2, X } from 'lucide-react';
import { HABIT_NOTE_MAX, type HabitStatus } from '@/lib/habits';
import { GhostButton, INPUT_CLASS, Modal, PrimaryButton, STATUS_STYLES, useAutoFocus } from './ui';

/**
 * The three answers, and the one control that gives them. Shared by Today and
 * by a habit's history, so a day is changed the same way wherever it is seen.
 */
const CHOICES = [
  { status: 'done' as const, icon: Check, label: 'Done' },
  { status: 'skipped' as const, icon: CircleSlash, label: 'Skip' },
  { status: 'undone' as const, icon: X, label: 'Undone' },
];

/**
 * Three buttons rather than a checkbox that cycles: skipped and undone are
 * genuinely different answers, and a control you have to click twice to reach
 * the third one would make the honest answer the most expensive.
 *
 * Clicking the answer a day already has takes it back to pending. That is the
 * undo for a mis-click, and the reason nothing here needs a fourth button.
 */
export function StatusPicker({
  value,
  size = 'md',
  onChange,
}: {
  value: HabitStatus | null;
  size?: 'sm' | 'md';
  onChange: (status: HabitStatus | null) => void;
}) {
  const small = size === 'sm';

  return (
    <div
      role="group"
      aria-label="Status"
      className={`inline-flex gap-1 rounded-xl border border-clay-200 bg-clay-50 ${
        small ? 'p-0.5' : 'p-1'
      }`}
    >
      {CHOICES.map(({ status, icon: Icon, label }) => {
        const active = value === status;
        const style = STATUS_STYLES[status];
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            title={active ? `${label} — click again to clear` : style.verb}
            onClick={() => onChange(active ? null : status)}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors ${
              small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
            } ${
              active
                ? `${style.solid} text-white shadow-[0_1px_2px_rgba(40,36,33,0.15)]`
                : 'text-clay-500 hover:bg-white hover:text-clay-800'
            }`}
          >
            <Icon className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            {/* The label is dropped on the compact variant, where the row is
                already carrying a date and a habit name. */}
            {!small && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The optional "why not?". Offered when a habit is marked undone and dismissed
 * with Escape or by saving nothing — the note must never be the price of being
 * honest about a day, so every path out of this dialog leaves the habit undone.
 */
export function NoteDialog({
  habitName,
  initial,
  onSave,
  onClose,
}: {
  habitName: string;
  initial: string | null;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(initial ?? '');
  const ref = useAutoFocus<HTMLTextAreaElement>();

  const save = () => {
    onSave(note.trim());
    onClose();
  };

  return (
    <Modal
      title="Anything worth remembering?"
      subtitle={`${habitName} is marked undone for today. A note is optional.`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Skip the note</GhostButton>
          <PrimaryButton onClick={save}>Save note</PrimaryButton>
        </div>
      }
    >
      <textarea
        ref={ref}
        value={note}
        rows={3}
        maxLength={HABIT_NOTE_MAX}
        placeholder="I was too tired today."
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves, Shift+Enter breaks the line: this is one sentence
          // more often than it is a paragraph.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
        className={`${INPUT_CLASS} resize-none leading-relaxed`}
      />
      <p className="mt-2 text-right text-[11px] tabular-nums text-clay-400">
        {note.length}/{HABIT_NOTE_MAX}
      </p>
    </Modal>
  );
}

/** The note already on a day, with a way back into it. */
export function NoteLine({ note, onEdit }: { note: string; onEdit?: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      disabled={!onEdit}
      className="group/note flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-relaxed text-clay-500 transition-colors enabled:hover:bg-clay-50"
    >
      <Undo2 className="mt-0.5 h-3 w-3 shrink-0 -scale-x-100 text-clay-300" />
      <span className="italic">{note}</span>
    </button>
  );
}
