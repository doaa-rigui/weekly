import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { APPS, getApp } from '@/lib/apps';
import { useView } from '@/lib/view';

/**
 * Moves between the apps that sit behind the one sign-in. It was a single
 * there-and-back button while there were only two of them; a menu keeps the
 * app bar the same size however many are added, and reads the list from
 * `@/lib/apps` so a new app appears here on its own.
 *
 * It renders in the palette of whichever app is currently open, because it
 * lives inside that app's bar — the trigger is the one thing held in common
 * across a switch, so it should look like it belongs to both.
 */
const TONES = {
  light: {
    trigger:
      'border-sage-200 text-sage-600 hover:border-sage-300 hover:bg-sage-100',
    chevron: 'text-sage-400',
    menu:
      'border-sage-200 bg-paper/95 shadow-[0_2px_6px_rgba(40,48,40,0.06),0_20px_44px_-24px_rgba(40,48,40,0.4)]',
    heading: 'text-sage-400',
    row: 'hover:bg-sage-50',
    rowActive: 'bg-sage-100',
    name: 'text-sage-700',
    nameActive: 'text-sage-900',
    description: 'text-sage-500',
    icon: 'text-sage-400',
    iconActive: 'text-moss-600',
  },
  dark: {
    trigger: 'border-night-600 text-night-300 hover:bg-night-800',
    chevron: 'text-night-500',
    menu:
      'border-night-700 bg-night-850/95 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]',
    heading: 'text-night-500',
    row: 'hover:bg-night-800',
    rowActive: 'bg-night-800',
    name: 'text-night-200',
    nameActive: 'text-night-100',
    description: 'text-night-400',
    icon: 'text-night-500',
    iconActive: 'text-dream-300',
  },
} as const;

export function AppSwitcher() {
  const { view, setView } = useView();
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = getApp(view);
  const tone = TONES[current.tone];
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch app"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${tone.trigger}`}
      >
        <CurrentIcon className="h-3.5 w-3.5" />
        {/* The icon carries it on narrow screens, where the bar is crowded. */}
        <span className="hidden sm:inline">{current.name}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${tone.chevron} ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        // Right-aligned: the trigger sits in the right-hand action group, so a
        // left-aligned panel would hang off the edge of the window.
        <div
          role="menu"
          className={`absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border backdrop-blur-sm ${tone.menu}`}
        >
          <p
            className={`px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider ${tone.heading}`}
          >
            Apps
          </p>
          <ul className="max-h-80 overflow-y-auto py-0.5 pb-1.5">
            {APPS.map((app) => {
              const isActive = app.id === view;
              const Icon = app.icon;
              return (
                <li key={app.id}>
                  <button
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setView(app.id);
                      setOpen(false);
                    }}
                    className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                      isActive ? tone.rowActive : tone.row
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${isActive ? tone.iconActive : tone.icon}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${
                          isActive ? `font-semibold ${tone.nameActive}` : tone.name
                        }`}
                      >
                        {app.name}
                      </span>
                      <span className={`block truncate text-[11px] ${tone.description}`}>
                        {app.description}
                      </span>
                    </span>
                    {isActive && <Check className={`h-4 w-4 shrink-0 ${tone.iconActive}`} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
