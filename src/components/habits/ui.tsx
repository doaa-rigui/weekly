import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { HabitStatus } from '@/lib/habits';

/**
 * The small shared pieces of the habit tracker's interface. Kept together so
 * the clay palette is applied in one place and the pages can't drift apart —
 * the same reason the sleep tracker keeps its own `ui.tsx`.
 */

/** Closes on Escape. Every overlay here is dismissible that way. */
function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * A centred dialog. This app is desktop-first, so unlike the sleep tracker's
 * modal it stays centred at every width rather than becoming a bottom sheet:
 * the forms here are wide — a week of weekday toggles, a grid of icons — and a
 * sheet would make them scroll for no gain.
 */
export function Modal({
  title,
  subtitle,
  width = 'md',
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  width?: 'md' | 'lg';
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scroll area, so Save stays reachable on a long form. */
  footer?: ReactNode;
}) {
  useEscape(onClose);

  // The page behind must not scroll under a dialog, or dismissing it lands the
  // reader somewhere else than where they opened it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-clay-900/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-clay-200 bg-white shadow-[0_24px_64px_-24px_rgba(40,36,33,0.35)] ${
          width === 'lg' ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-clay-200/80 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-clay-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-clay-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-0.5 rounded-lg p-1.5 text-clay-400 transition-colors hover:bg-clay-100 hover:text-clay-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="border-t border-clay-200/80 bg-clay-50/60 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The gate in front of anything that deletes. Spells out what goes with it:
 * deleting a habit takes its history, and that is not obvious from the button.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscape(onCancel);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-clay-900/35 backdrop-blur-[2px]" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal
        aria-label={title}
        className="relative w-full max-w-sm rounded-2xl border border-clay-200 bg-white p-5 shadow-[0_24px_64px_-24px_rgba(40,36,33,0.35)]"
      >
        <h2 className="text-base font-semibold text-clay-900">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-clay-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-clay-200 px-4 py-2 text-sm font-medium text-clay-600 transition-colors hover:bg-clay-100"
          >
            Keep it
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-undone-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-undone-700 disabled:opacity-60"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A soft rounded panel. Every page here is built out of these. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-clay-200/80 bg-white shadow-[0_1px_2px_rgba(40,36,33,0.04),0_8px_24px_-16px_rgba(40,36,33,0.18)] ${className}`}
    >
      {children}
    </section>
  );
}

/** A card's heading row, with room for a control on the right. */
export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-clay-200/70 px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-clay-900">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-clay-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** One number with its label. The stats headline row is four of these. */
export function Stat({
  label,
  value,
  hint,
  accent = 'text-clay-900',
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-clay-200/80 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(40,36,33,0.04)]">
      <p className="text-[11px] font-medium uppercase tracking-wider text-clay-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-clay-500">{hint}</p>}
    </div>
  );
}

/** A segmented control, used for the stats range and the frequency modes. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-xl border border-clay-200 bg-clay-100/70 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-white text-clay-900 shadow-[0_1px_2px_rgba(40,36,33,0.10)]'
                : 'text-clay-500 hover:text-clay-800'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The empty state, for a fresh account and for a day with nothing due. */
export function Empty({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-100 text-clay-400">
        {icon}
      </div>
      <p className="mt-4 text-sm font-semibold text-clay-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-clay-500">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** The one loud button on a page. There is rarely more than one. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-iris-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(40,36,33,0.10)] transition-colors hover:bg-iris-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Everything else: cancel, secondary actions, toolbar buttons. */
export function GhostButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger';
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === 'danger'
          ? 'border-undone-100 text-undone-600 hover:bg-undone-50'
          : 'border-clay-200 text-clay-600 hover:bg-clay-100 hover:text-clay-900'
      }`}
    >
      {children}
    </button>
  );
}

/** A labelled field. Keeps every form in the app on the same rhythm. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-clay-400">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-clay-400">{hint}</p>}
    </div>
  );
}

/** A switch. Settings is a column of these. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-iris-500' : 'bg-clay-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

// -- Status ------------------------------------------------------------------

/**
 * How each of the three states is drawn, in one place. Colour alone would not
 * be enough — the three also differ in fill, in border and in label, so the
 * page is readable to anyone who doesn't separate green from red.
 */
export const STATUS_STYLES: Record<
  HabitStatus,
  { label: string; verb: string; chip: string; solid: string; text: string; dot: string }
> = {
  done: {
    label: 'Done',
    verb: 'Mark done',
    chip: 'border-done-100 bg-done-50 text-done-700',
    solid: 'bg-done-500',
    text: 'text-done-700',
    dot: 'bg-done-500',
  },
  skipped: {
    label: 'Skipped',
    verb: 'Skip today',
    chip: 'border-skipped-100 bg-skipped-50 text-skipped-700',
    solid: 'bg-skipped-500',
    text: 'text-skipped-700',
    dot: 'bg-skipped-500',
  },
  undone: {
    label: 'Undone',
    verb: 'Mark undone',
    chip: 'border-undone-100 bg-undone-50 text-undone-700',
    solid: 'bg-undone-500',
    text: 'text-undone-700',
    dot: 'bg-undone-500',
  },
};

/** A small pill. Used for statuses, frequencies and counts. */
export function Chip({
  children,
  className = 'border-clay-200 bg-clay-50 text-clay-600',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Moves focus into an overlay when it opens and hands it back on close.
 * Every dialog here is reachable by keyboard, and without this the tab order
 * would carry on behind the backdrop.
 */
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    // Deferred a frame: focusing during the mount that opens the dialog fights
    // the click that opened it on Safari.
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  return ref;
}

/** The text input used throughout. One class string, one look. */
export const INPUT_CLASS =
  'w-full rounded-xl border border-clay-200 bg-white px-3.5 py-2.5 text-sm text-clay-900 outline-none transition-colors placeholder:text-clay-400 focus:border-iris-400 focus:ring-4 focus:ring-iris-100';
