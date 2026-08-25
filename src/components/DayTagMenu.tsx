import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { DAY_TAG_LABEL_MAX } from '@/lib/constants';
import type { DayTagStore } from '@/lib/dayTags';

/**
 * The tag pill's three shades, from the one colour a tag stores. The fixed
 * tags used to be a Tailwind trio — `bg-emerald-50 border-emerald-200
 * text-emerald-700` — and a pale wash with dark text sits far more quietly
 * above the grid than a solid block of colour would. Custom tags can't name
 * Tailwind classes, so the same three shades are mixed from the hex.
 */
function pillStyle(hex: string): React.CSSProperties {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  if ([r, g, b].some(Number.isNaN)) return {};

  // The stored colour is roughly a Tailwind 600, and the old pills read at 700
  // on 50 — so the label is darkened a step to keep that much contrast against
  // the wash behind it.
  const darker = [r, g, b].map((channel) => Math.round(channel * 0.78));

  return {
    color: `rgb(${darker.join(', ')})`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.32)`,
  };
}

/**
 * The tag on a day's header cell. The old three tags were a fixed cycle, but a
 * planner can now define as many as it likes — and cycling through eight is
 * worse than picking from a list, so this opens one.
 */
export function DayTagMenu({
  day,
  dayLabel,
  store,
  onOpenChange,
}: {
  day: number;
  dayLabel: string;
  store: DayTagStore;
  /**
   * The header cells all sit at the same z-index, and this menu is wider than
   * the column it belongs to — so the cell has to be lifted above its
   * neighbours while the menu is open, or they clip it.
   */
  onOpenChange: (open: boolean) => void;
}) {
  const { options, byId, tags, setTag, createOption, removeOption } = store;
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = tags[day] ? byId.get(tags[day]!) : undefined;

  const show = () => {
    setOpen(true);
    onOpenChange(true);
  };

  const close = () => {
    setOpen(false);
    setNaming(false);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (naming) return setNaming(false);
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, naming]);

  return (
    // w-full, so the pill's max-width has the day column to measure against.
    // Sized to its own content it would shrink-wrap the button, and a
    // percentage max-width would then cut a slice off the label at every
    // column width — "Remote" reading as "Rem…" with room to spare.
    <div ref={rootRef} className="relative flex w-full min-w-0 justify-center px-1">
      <button
        onClick={() => (open ? close() : show())}
        aria-expanded={open}
        title={current ? `${dayLabel}: ${current.label}` : `Tag ${dayLabel}`}
        className={`flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors sm:text-[11px] ${
          current
            ? ''
            : 'border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600'
        }`}
        style={current ? pillStyle(current.color) : undefined}
      >
        {current ? (
          // Label only. The fixed tags had an icon each, but a custom one has
          // nothing to draw — and the pill is already tinted its colour, so
          // spending 12px on a dot would only cost the label its last letters.
          <span className="truncate">{current.label}</span>
        ) : (
          <>
            <Plus className="h-3 w-3 shrink-0" />
            Tag
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          // Centred on the pill and above the grid: the header cell it sits in
          // is only a day column wide, so the menu has to overhang it.
          className="absolute left-1/2 top-full z-40 mt-1 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg"
        >
          <ul className="max-h-52 overflow-y-auto py-1">
            {options.map((option) => {
              const isCurrent = option.id === current?.id;
              return (
                <li key={option.id} className="group flex items-center">
                  <button
                    onClick={() => {
                      // Picking the tag a day already has clears it, so one
                      // control both sets and unsets.
                      setTag(day, isCurrent ? null : option.id);
                      close();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 transition-colors hover:bg-slate-50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                    <span className="truncate text-xs font-medium text-slate-700">
                      {option.label}
                    </span>
                    {isCurrent && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-900" />}
                  </button>
                  {/*
                    Removing a tag from the planner takes it off every day at
                    once, so it stays hidden until hover.
                  */}
                  <button
                    onClick={() => removeOption(option.id)}
                    title={`Remove “${option.label}” from this planner`}
                    aria-label={`Remove ${option.label} from this planner`}
                    className="mr-1 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}

            {options.length === 0 && !naming && (
              <li className="px-2.5 py-2 text-[11px] leading-snug text-slate-400">
                This planner has no tags yet.
              </li>
            )}
          </ul>

          <div className="border-t border-slate-100 p-1">
            {naming ? (
              <NewTagInput
                onSubmit={async (label) => {
                  const option = await createOption(label);
                  setNaming(false);
                  // Adding a tag from a day means you want it on that day.
                  if (option) {
                    setTag(day, option.id);
                    close();
                  }
                }}
                onCancel={() => setNaming(false)}
              />
            ) : (
              <button
                onClick={() => setNaming(true)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <Plus className="h-3.5 w-3.5" />
                New tag
              </button>
            )}
          </div>

          {current && !naming && (
            <button
              onClick={() => {
                setTag(day, null);
                close();
              }}
              className="w-full border-t border-slate-100 px-2.5 py-1.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              Clear this day
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewTagInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (label: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const cancelledRef = useRef(false);

  const submit = () => {
    if (cancelledRef.current) return;
    const trimmed = value.trim();
    if (!trimmed) return onCancel();
    onSubmit(trimmed);
  };

  const cancel = () => {
    cancelledRef.current = true;
    onCancel();
  };

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        maxLength={DAY_TAG_LABEL_MAX}
        placeholder="Deep clean"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
          }
        }}
        // Blur commits, so clicking straight onto another row keeps the name.
        onBlur={submit}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-900"
      />
      <button
        // onMouseDown, not onClick: the input's onBlur fires first and would
        // unmount this button before a click could land.
        onMouseDown={(e) => {
          e.preventDefault();
          cancel();
        }}
        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Cancel"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
