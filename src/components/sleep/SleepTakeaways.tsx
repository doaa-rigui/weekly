import { useState } from 'react';
import { Lightbulb, Minus, Pencil, Plus, TrendingDown, TrendingUp, Trash2 } from 'lucide-react';
import { formatShortDate } from '@/lib/sleep';
import {
  TAKEAWAY_MAX,
  type SleepTakeaway,
  type TakeawayEffect,
  type TakeawayStore,
} from '@/lib/takeaways';
import { Card, ConfirmDialog, Empty } from './ui';

/**
 * The page for what you have learned about your own sleep.
 *
 * Writing is the primary action, so the composer sits at the top and is always
 * open — no button to press first. Editing happens in place rather than in a
 * dialog: these are one-line thoughts, and a modal for reworing six words is
 * more ceremony than the thing deserves.
 */

/** How each effect is drawn. One place, so the page can't disagree with itself. */
const EFFECTS: Record<
  TakeawayEffect,
  { label: string; icon: typeof TrendingUp; dot: string; text: string; chip: string }
> = {
  helps: {
    label: 'Helps',
    icon: TrendingUp,
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    chip: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300',
  },
  hurts: {
    label: 'Hurts',
    icon: TrendingDown,
    dot: 'bg-dawn-500',
    text: 'text-dawn-300',
    chip: 'border-dawn-500/40 bg-dawn-500/15 text-dawn-300',
  },
  neutral: {
    label: 'Just noting',
    icon: Minus,
    dot: 'bg-night-500',
    text: 'text-night-300',
    chip: 'border-night-600 bg-night-800 text-night-300',
  },
};

const ORDER: TakeawayEffect[] = ['helps', 'hurts', 'neutral'];

/** The three-way choice, used by both the composer and the inline editor. */
function EffectPicker({
  value,
  onChange,
}: {
  value: TakeawayEffect;
  onChange: (effect: TakeawayEffect) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Does this help or hurt your sleep?"
      className="inline-flex gap-0.5 rounded-full border border-night-700 bg-night-900/70 p-0.5"
    >
      {ORDER.map((effect) => {
        const spec = EFFECTS[effect];
        const Icon = spec.icon;
        const active = effect === value;
        return (
          <button
            key={effect}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(effect)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? `${spec.chip} border`
                : 'border border-transparent text-night-400 hover:bg-night-800 hover:text-night-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {spec.label}
          </button>
        );
      })}
    </div>
  );
}

/** A textarea sized for a sentence, with the remaining-characters hint. */
function TakeawayInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, TAKEAWAY_MAX))}
      placeholder={placeholder}
      rows={2}
      autoFocus={autoFocus}
      className="w-full resize-none rounded-xl border border-night-600 bg-night-900 px-3 py-2.5 text-sm leading-relaxed text-night-100 placeholder:text-night-500 focus:border-dream-500 focus:outline-none"
    />
  );
}

/** The always-open composer at the top of the page. */
function Composer({ store }: { store: TakeawayStore }) {
  const [text, setText] = useState('');
  const [effect, setEffect] = useState<TakeawayEffect>('helps');

  const save = async () => {
    // The text is only cleared once the write has landed, so a failure
    // doesn't lose what was typed.
    if (await store.create(text, effect)) {
      setText('');
      setEffect('helps');
    }
  };

  return (
    <Card className="p-4">
      <TakeawayInput
        value={text}
        onChange={setText}
        placeholder="Working out helps me sleep better…"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <EffectPicker value={effect} onChange={setEffect} />
        <div className="ml-auto flex items-center gap-3">
          {text.length > TAKEAWAY_MAX - 40 && (
            <span className="text-xs tabular-nums text-night-500">
              {TAKEAWAY_MAX - text.length}
            </span>
          )}
          <button
            onClick={save}
            disabled={!text.trim() || store.saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-dream-500 px-4 py-2 text-sm font-semibold text-night-950 transition-colors hover:bg-dream-400 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            {store.saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </Card>
  );
}

/** One takeaway, either read-only or being edited in place. */
function TakeawayRow({
  takeaway,
  store,
  onAskDelete,
}: {
  takeaway: SleepTakeaway;
  store: TakeawayStore;
  onAskDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(takeaway.text);
  const [effect, setEffect] = useState<TakeawayEffect>(takeaway.effect);

  const spec = EFFECTS[takeaway.effect];

  const startEditing = () => {
    // Re-seeded from the row each time, so a cancelled edit leaves nothing
    // behind for the next one.
    setText(takeaway.text);
    setEffect(takeaway.effect);
    setEditing(true);
  };

  const save = async () => {
    if (await store.update(takeaway.id, text, effect)) setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-2xl border border-dream-500/40 bg-night-850/70 p-4">
        <TakeawayInput value={text} onChange={setText} autoFocus />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <EffectPicker value={effect} onChange={setEffect} />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-full border border-night-600 px-3.5 py-1.5 text-xs font-medium text-night-300 transition-colors hover:bg-night-700"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!text.trim() || store.saving}
              className="rounded-full bg-dream-500 px-3.5 py-1.5 text-xs font-semibold text-night-950 transition-colors hover:bg-dream-400 disabled:opacity-40"
            >
              {store.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 rounded-2xl border border-night-700/70 bg-night-850/70 px-4 py-3.5">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${spec.dot}`} />

      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-night-100">
          {takeaway.text}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-night-500">
          <span className={spec.text}>{spec.label}</span>
          <span aria-hidden>·</span>
          {formatShortDate(new Date(takeaway.created_at))}
        </p>
      </div>

      {/* Revealed on hover on a pointer device, always visible on a touch one. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={startEditing}
          title="Edit this takeaway"
          aria-label="Edit this takeaway"
          className="rounded-lg p-1.5 text-night-500 transition-colors hover:bg-dream-500/15 hover:text-dream-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onAskDelete}
          title="Delete this takeaway"
          aria-label="Delete this takeaway"
          className="rounded-lg p-1.5 text-night-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function SleepTakeaways({ store }: { store: TakeawayStore }) {
  const [pending, setPending] = useState<SleepTakeaway | null>(null);

  const confirmDelete = async () => {
    if (!pending) return;
    await store.remove(pending.id);
    setPending(null);
  };

  return (
    <div className="space-y-4">
      <Composer store={store} />

      {store.takeaways.length === 0 ? (
        <Card>
          <Empty
            icon={<Lightbulb className="h-5 w-5" />}
            title="What have you noticed?"
            message="Keep the things that actually change your sleep here — “working out helps me sleep better”, “using my phone before bed makes it difficult to sleep”. They stay put as your nightly entries come and go."
          />
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {store.takeaways.map((takeaway) => (
            <TakeawayRow
              key={takeaway.id}
              takeaway={takeaway}
              store={store}
              onAskDelete={() => setPending(takeaway)}
            />
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title="Delete this takeaway?"
          message={`“${pending.text}” will be removed for good.`}
          confirmLabel="Delete"
          busy={store.saving}
          onCancel={() => setPending(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/**
 * The dashboard's glimpse of the list. A lesson you never see changes nothing,
 * so the most recent few sit under the charts with a way through to the rest.
 */
export function TakeawaysPreview({
  takeaways,
  onOpen,
}: {
  takeaways: SleepTakeaway[];
  onOpen: () => void;
}) {
  const shown = takeaways.slice(0, 3);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-night-100">
          <Lightbulb className="h-4 w-4 text-dream-400" />
          What you've learned
        </h2>
        <button
          onClick={onOpen}
          className="shrink-0 rounded-full border border-night-600 px-3 py-1.5 text-xs font-medium text-night-300 transition-colors hover:bg-night-700 hover:text-night-100"
        >
          {takeaways.length > 0 ? 'All takeaways' : 'Add one'}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-night-400">
          Noticed something that changes how you sleep? Keep it here so it's still around next
          month.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((takeaway) => {
            const spec = EFFECTS[takeaway.effect];
            return (
              <li key={takeaway.id} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${spec.dot}`} />
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-night-300">
                  {takeaway.text}
                </p>
              </li>
            );
          })}
          {takeaways.length > shown.length && (
            <li className="pl-[18px] text-[11px] text-night-500">
              +{takeaways.length - shown.length} more
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
