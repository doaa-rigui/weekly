import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PLANNER_NAME_MAX, type PlannerStore } from '@/lib/planners';
import {
  DEFAULT_PLANNER_DAYS,
  MAX_PLANNER_DAYS,
  MIN_PLANNER_DAYS,
  PLANNER_LENGTH_PRESETS,
  isWeekBased,
} from '@/lib/constants';
import type { PlannerRecord } from '@/lib/supabase';

/**
 * Which row, if any, has taken over the menu. Renaming and deleting both
 * happen in place, so at most one row can be busy at a time.
 */
type RowMode = { kind: 'renaming'; id: string } | { kind: 'deleting'; id: string } | null;

/** "2 weeks" reads better than "14 days" when the length divides evenly. */
function describeLength(dayCount: number): string {
  if (dayCount % 7 === 0) {
    const weeks = dayCount / 7;
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  return dayCount === 1 ? '1 day' : `${dayCount} days`;
}

/**
 * The planner list hangs off the app-bar title rather than a sidebar or a tab
 * strip: the week grid needs every pixel of width it can get, and the day
 * columns are already tight. The title doubles as the "which planner am I in"
 * readout, so switching costs no layout at all.
 */
export function PlannerSwitcher({ store }: { store: PlannerStore }) {
  const { planners, active, select, rename, duplicate, remove } = store;
  const [open, setOpen] = useState(false);
  const [rowMode, setRowMode] = useState<RowMode>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setRowMode(null);
  };

  useDismiss({
    open,
    rootRef,
    onDismiss: close,
    // Escape backs out of a rename or a delete prompt one step at a time, so a
    // mistyped name doesn't also cost you the open menu.
    onEscape: () => {
      if (rowMode) {
        setRowMode(null);
        return;
      }
      close();
      triggerRef.current?.focus();
    },
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch planner"
        className="group -ml-1.5 flex max-w-[60vw] items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left transition-colors hover:bg-slate-100 sm:max-w-none"
      >
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
          {active?.name ?? 'Weekly Planner'}
        </h1>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          // Wider than the trigger so long names have room, and above the
          // sticky week header the grid pins under the app bar.
          className="absolute left-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Planners
          </p>

          <ul className="max-h-72 overflow-y-auto py-0.5">
            {planners.map((planner) => (
              <li key={planner.id}>
                <PlannerRow
                  planner={planner}
                  isActive={planner.id === active?.id}
                  isOnlyPlanner={planners.length === 1}
                  mode={rowMode?.id === planner.id ? rowMode.kind : null}
                  onSelect={() => {
                    select(planner.id);
                    close();
                  }}
                  onStartRename={() => setRowMode({ kind: 'renaming', id: planner.id })}
                  onRename={(name) => {
                    rename(planner.id, name);
                    setRowMode(null);
                  }}
                  onStartDelete={() => setRowMode({ kind: 'deleting', id: planner.id })}
                  onDelete={() => {
                    remove(planner.id);
                    setRowMode(null);
                  }}
                  onDuplicate={() => {
                    duplicate(planner.id);
                    close();
                  }}
                  onCancel={() => setRowMode(null)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Creating lives in the app bar rather than at the foot of the switcher: it is
 * an action on the account, not a way of choosing between planners, and it is
 * the one thing you may want when no menu is open.
 */
export function NewPlannerButton({
  onCreate,
}: {
  onCreate: (name: string, dayCount: number) => void;
}) {
  const [naming, setNaming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => setNaming(false);

  useDismiss({
    open: naming,
    rootRef,
    onDismiss: close,
    onEscape: () => {
      close();
      triggerRef.current?.focus();
    },
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setNaming((prev) => !prev)}
        aria-expanded={naming}
        title="Create a new planner"
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100"
      >
        <Plus className="h-3.5 w-3.5" />
        {/* The icon carries it on narrow screens, where the bar is crowded. */}
        <span className="hidden sm:inline">New planner</span>
      </button>

      {naming && (
        // Right-aligned: the button sits in the right-hand action group, so a
        // left-aligned panel would hang off the edge of the window.
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <NewPlannerForm
            onSubmit={(name, dayCount) => {
              onCreate(name, dayCount);
              close();
            }}
            onCancel={close}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Name and length, together: how many days a planner runs can't be changed
 * afterwards without deciding what happens to the blocks on the days that go
 * away, so it is asked for up front.
 */
function NewPlannerForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, dayCount: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [dayCount, setDayCount] = useState<number>(DEFAULT_PLANNER_DAYS);
  // A preset covers the common cases; the field is for everything else.
  const [custom, setCustom] = useState(false);

  const valid = dayCount >= MIN_PLANNER_DAYS && dayCount <= MAX_PLANNER_DAYS;

  const submit = () => {
    if (!valid) return;
    onSubmit(name.trim() || 'New planner', dayCount);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Name
        </label>
        <input
          autoFocus
          value={name}
          maxLength={PLANNER_NAME_MAX}
          placeholder="Chores planner"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            // The panel's own listener closes on Escape; nothing to stop here.
          }}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-900"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Length
        </label>
        <div className="flex gap-1.5">
          {PLANNER_LENGTH_PRESETS.map((preset) => {
            const active = !custom && dayCount === preset.days;
            return (
              <button
                key={preset.days}
                onClick={() => {
                  setCustom(false);
                  setDayCount(preset.days);
                }}
                aria-pressed={active}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            onClick={() => setCustom(true)}
            aria-pressed={custom}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
              custom
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            Custom
          </button>
        </div>

        {custom && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              autoFocus
              min={MIN_PLANNER_DAYS}
              max={MAX_PLANNER_DAYS}
              value={dayCount}
              onChange={(e) => setDayCount(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
            <span className="text-xs text-slate-500">
              days ({MIN_PLANNER_DAYS}–{MAX_PLANNER_DAYS})
            </span>
          </div>
        )}

        {/* Weekday names only fit a planner whose length lines up with a week. */}
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          {isWeekBased(dayCount) && valid
            ? 'Columns are named after the weekdays, starting Monday.'
            : 'Columns are numbered Day 1 onwards.'}
        </p>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!valid}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create planner
        </button>
      </div>
    </div>
  );
}

/**
 * Closes a popover on a click outside it or on Escape. Shared by the switcher
 * and the create button — both hold a name field that commits on blur, which
 * is why the outside click blurs before it closes.
 */
function useDismiss({
  open,
  rootRef,
  onDismiss,
  onEscape,
}: {
  open: boolean;
  rootRef: React.RefObject<HTMLElement | null>;
  onDismiss: () => void;
  onEscape: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // An open name field commits on blur, so blur it here: closing first
      // would unmount the field and throw the typed name away.
      (document.activeElement as HTMLElement | null)?.blur();
      onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // onEscape closes over the current row mode, so it is refreshed each render.
  }, [open, rootRef, onDismiss, onEscape]);
}

function PlannerRow({
  planner,
  isActive,
  isOnlyPlanner,
  mode,
  onSelect,
  onStartRename,
  onRename,
  onStartDelete,
  onDelete,
  onDuplicate,
  onCancel,
}: {
  planner: PlannerRecord;
  isActive: boolean;
  isOnlyPlanner: boolean;
  mode: 'renaming' | 'deleting' | null;
  onSelect: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onStartDelete: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
}) {
  if (mode === 'renaming') {
    return (
      <div className="px-1">
        <NameInput initial={planner.name} onSubmit={onRename} onCancel={onCancel} />
      </div>
    );
  }

  if (mode === 'deleting') {
    return (
      <div className="mx-1 flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700">
        <span className="min-w-0 flex-1 truncate">Delete “{planner.name}”?</span>
        <button
          onClick={onDelete}
          className="rounded-full bg-red-600 px-2 py-1 font-semibold text-white transition-colors hover:bg-red-700"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="rounded-full px-1.5 py-1 transition-colors hover:bg-red-100"
          aria-label="Keep this planner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    // The row itself is the switch target; its actions sit on top of it, so
    // this is a div with a button inside rather than nested buttons.
    <div
      className={`group mx-1 flex items-center rounded-lg transition-colors ${
        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
      }`}
    >
      <button
        role="menuitemradio"
        aria-checked={isActive}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
      >
        {isActive ? (
          <Check className="h-4 w-4 shrink-0 text-slate-900" />
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span
          className={`truncate text-sm ${
            isActive ? 'font-semibold text-slate-900' : 'text-slate-700'
          }`}
        >
          {planner.name}
        </span>
        {/* Only worth saying when it isn't the plain week everything defaults to. */}
        {planner.day_count !== DEFAULT_PLANNER_DAYS && (
          <span className="shrink-0 text-[10px] font-medium text-slate-400">
            {describeLength(planner.day_count)}
          </span>
        )}
      </button>

      {/*
        Hidden until the row is hovered or something inside it has focus, so
        the list reads as names rather than as three icons per line. Keyboard
        users reach them through focus-within.
      */}
      <span className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <RowAction label={`Rename ${planner.name}`} onClick={onStartRename} icon={Pencil} />
        <RowAction label={`Duplicate ${planner.name}`} onClick={onDuplicate} icon={Copy} />
        <RowAction
          label={isOnlyPlanner ? 'Your last planner cannot be deleted' : `Delete ${planner.name}`}
          onClick={onStartDelete}
          icon={Trash2}
          disabled={isOnlyPlanner}
          danger
        />
      </span>
    </div>
  );
}

function RowAction({
  label,
  onClick,
  icon: Icon,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Pencil;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 text-slate-400 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 ${
        danger ? 'hover:bg-red-100 hover:text-red-600' : 'hover:bg-slate-200 hover:text-slate-700'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** Shared by "new planner" and inline rename: type a name, Enter commits. */
function NameInput({
  initial = '',
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // Blur commits, so a cancel has to say so — otherwise dismissing the field
  // would immediately re-save through the blur it causes.
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

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
    <div className="flex items-center gap-1 py-0.5">
      <input
        ref={inputRef}
        autoFocus
        value={value}
        maxLength={PLANNER_NAME_MAX}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          // Escape backs out of the field only. Stopping it here keeps the
          // menu's own listener from closing the whole menu as well.
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
          }
        }}
        // Blurring out of the field is a commit, not a discard: clicking
        // straight onto another row would otherwise throw the name away.
        onBlur={submit}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
      />
      <button
        // onMouseDown, not onClick: the input's onBlur fires first and would
        // unmount this button before a click could land on it.
        onMouseDown={(e) => {
          e.preventDefault();
          cancel();
        }}
        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
