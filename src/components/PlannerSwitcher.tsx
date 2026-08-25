import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PLANNER_NAME_MAX, type PlannerStore } from '@/lib/planners';
import type { PlannerRecord } from '@/lib/supabase';

/**
 * Which row, if any, has taken over the menu. Renaming and deleting both
 * happen in place, so at most one row can be busy at a time.
 */
type RowMode = { kind: 'renaming'; id: string } | { kind: 'deleting'; id: string } | null;

/**
 * The planner list hangs off the app-bar title rather than a sidebar or a tab
 * strip: the week grid needs every pixel of width it can get, and the day
 * columns are already tight. The title doubles as the "which planner am I in"
 * readout, so switching costs no layout at all.
 */
export function PlannerSwitcher({ store }: { store: PlannerStore }) {
  const { planners, active, select, create, rename, duplicate, remove } = store;
  const [open, setOpen] = useState(false);
  const [rowMode, setRowMode] = useState<RowMode>(null);
  const [creating, setCreating] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setRowMode(null);
    setCreating(false);
  };

  // A menu that outlives a click elsewhere on the page reads as stuck.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // An open name field commits on blur, so blur it here: closing the menu
      // first would unmount it and throw the typed name away.
      (document.activeElement as HTMLElement | null)?.blur();
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape backs out of a rename or a delete prompt one step at a time,
      // so a mistyped name doesn't also cost you the open menu.
      if (rowMode || creating) {
        setRowMode(null);
        setCreating(false);
        return;
      }
      close();
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, rowMode, creating]);

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

          <div className="border-t border-slate-100 p-1">
            {creating ? (
              <NameInput
                placeholder="Chores planner"
                onSubmit={(name) => {
                  create(name);
                  close();
                }}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <button
                onClick={() => {
                  setRowMode(null);
                  setCreating(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <Plus className="h-4 w-4" />
                New planner
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
          label={
            isOnlyPlanner ? 'Your last planner cannot be deleted' : `Delete ${planner.name}`
          }
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
