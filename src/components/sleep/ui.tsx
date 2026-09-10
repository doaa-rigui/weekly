import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { X } from 'lucide-react';

/**
 * The small shared pieces of the sleep tracker's interface. Kept together so
 * the dark palette is applied in one place and the panels can't drift apart.
 */

/**
 * The pixel width of an element, kept current as it resizes.
 *
 * The charts need this because they are drawn in real pixels rather than scaled
 * from a fixed `viewBox`: a 30-row chart squeezed into a phone by
 * `preserveAspectRatio` would shrink its labels into illegibility. Measuring
 * instead lets each chart decide what to drop at narrow widths.
 */
export function useMeasuredWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Measured before paint on the first pass, so the chart isn't drawn once
    // at zero width and then again at the real one.
    setWidth(node.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

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
 * A centred panel on desktop that becomes a bottom sheet on a phone — where a
 * centred dialog fights the on-screen keyboard and a sheet doesn't.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscape(onClose);

  // The page behind must not scroll under a sheet, or dismissing it lands the
  // reader somewhere else than where they opened it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-night-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-night-700 bg-night-850 shadow-2xl shadow-night-950/60 sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-night-700/70 px-5 py-4">
          <h2 className="text-base font-semibold text-night-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-night-400 transition-colors hover:bg-night-700 hover:text-night-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * The gate in front of anything that deletes. Deliberately spells out how much
 * is about to go, because "Delete" on its own doesn't say whether it means the
 * one row that was clicked or all thirty that were selected.
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-night-950/75 backdrop-blur-sm" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal
        aria-label={title}
        className="relative w-full max-w-sm rounded-2xl border border-night-700 bg-night-850 p-5 shadow-2xl shadow-night-950/60"
      >
        <h2 className="text-base font-semibold text-night-100">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-night-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-night-600 px-4 py-2 text-sm font-medium text-night-200 transition-colors hover:bg-night-700"
          >
            Keep it
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-400 disabled:opacity-60"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A titled panel. The dashboard and history are both built out of these. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-night-700/70 bg-night-850/70 backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * One number with its label. The dashboard's secondary row is two of these,
 * deliberately shorter than the cards around them: they are context for last
 * night and for the chart, so they should cost a glance and little height.
 */
export function Stat({
  label,
  value,
  hint,
  accent = 'text-night-100',
}: {
  label: string;
  value: string;
  /** Free-form, so a caller can put a trend arrow in it. */
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-night-700/70 bg-night-850/70 px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-night-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold leading-tight tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-night-400">{hint}</p>}
    </div>
  );
}

/** A small pill. Used for "Fajr", "Broken sleep", counts, and the like. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'dream' | 'dawn';
}) {
  const tones = {
    neutral: 'border-night-600 bg-night-800 text-night-300',
    dream: 'border-dream-500/40 bg-dream-500/15 text-dream-300',
    dawn: 'border-dawn-500/40 bg-dawn-500/15 text-dawn-300',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * A segmented control, used for both the page tabs and the chart modes. Values
 * are compared by identity, so callers pass their own union of literals.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-full border border-night-700 bg-night-900/70 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-dream-500/20 text-dream-300 shadow-sm'
                : 'text-night-400 hover:bg-night-800 hover:text-night-200'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The empty state, for a fresh account and for a filtered-to-nothing list. */
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
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-night-700 bg-night-800 text-dream-400">
        {icon}
      </div>
      <p className="mt-4 text-sm font-semibold text-night-100">{title}</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-night-400">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A checkbox styled for the dark side of the app. */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` has no attribute — it can only be set on the node.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);

  const handle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked),
    [onChange]
  );

  // Native rather than a restyled box: `accent-color` plus a dark
  // `color-scheme` gives a correct tick and a correct dash for the
  // indeterminate state, neither of which `appearance-none` can draw.
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={handle}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer accent-dream-500 [color-scheme:dark]"
    />
  );
}
