import { useMemo, useState } from 'react';
import {
  ChartColumn,
  ListChecks,
  Loader2,
  Settings as SettingsIcon,
  Sun,
  X,
} from 'lucide-react';
import { AppSwitcher } from '@/components/AppSwitcher';
import { useHabitSettings } from '@/lib/habitSettings';
import { useHabits } from '@/lib/habitStore';
import {
  itemsFor,
  progressOf,
  startOfDay,
  type Habit,
  type HabitDraft,
} from '@/lib/habits';
import { ConfirmDialog } from './ui';
import { HabitDetail } from './HabitDetail';
import { HabitForm } from './HabitForm';
import { HabitsPage } from './HabitsPage';
import { SettingsPage } from './SettingsPage';
import { Stats } from './Stats';
import { Today } from './Today';

/**
 * The habit tracker's shell: a sidebar, four pages, and the dialogs that can
 * open over any of them.
 *
 * A sidebar rather than the tab strip the other two apps use, because this one
 * has four destinations rather than three and one of them — Today — is where
 * the user should land and return. A rail that stays put makes "back to today"
 * a single click from anywhere, which a tab strip that scrolls with the page
 * does not.
 */
const PAGES = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'stats', label: 'Stats', icon: ChartColumn },
  { id: 'habits', label: 'Habits', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

type PageId = (typeof PAGES)[number]['id'];

/** Which dialog is open. At most one, and each carries what it needs. */
type Overlay =
  | { kind: 'adding' }
  | { kind: 'editing'; habit: Habit }
  | { kind: 'viewing'; habit: Habit }
  | { kind: 'deleting'; habit: Habit }
  | null;

export function HabitsApp({ userId }: { userId: string }) {
  const store = useHabits(userId);
  const { settings, set } = useHabitSettings();

  const [page, setPage] = useState<PageId>('today');
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Shown in the rail beside Today, so the one number that matters is on
  // screen from every page without putting stats on all of them.
  const todayProgress = useMemo(() => {
    const date = startOfDay(new Date());
    return progressOf(itemsFor(store.habits, store.entries, date));
  }, [store.habits, store.entries]);

  const submit = async (draft: HabitDraft): Promise<boolean> => {
    if (overlay?.kind === 'editing') return store.update(overlay.habit.id, draft);
    return store.create(draft);
  };

  return (
    <div className="flex min-h-screen bg-clay-100/60 text-clay-900">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-clay-200 bg-clay-50 px-3 py-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iris-500 text-white shadow-[0_6px_16px_-8px_rgba(112,115,181,0.9)]">
            <ListChecks className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">Habits</p>
            <p className="truncate text-[11px] text-clay-400">One day at a time</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {PAGES.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            const primary = id === 'today';
            return (
              <button
                key={id}
                onClick={() => setPage(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-white font-semibold text-clay-900 shadow-[0_1px_2px_rgba(40,36,33,0.08)]'
                    : 'font-medium text-clay-500 hover:bg-white/70 hover:text-clay-800'
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    active ? 'text-iris-600' : 'text-clay-400'
                  }`}
                />
                <span className="flex-1 text-left">{label}</span>
                {/* Today carries its own progress, which is both the emphasis
                    it deserves and a reason to look at the rail at all. */}
                {primary && todayProgress.due > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                      todayProgress.percent === 100
                        ? 'bg-done-100 text-done-700'
                        : 'bg-clay-200/70 text-clay-600'
                    }`}
                  >
                    {todayProgress.done}/{todayProgress.target}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <p className="px-2.5 pt-4 text-[11px] leading-relaxed text-clay-400">
          Focus on today. Everything behind it is on Stats.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The same bar the planner and the sleep tracker carry, in this app's
            palette: it is the one thing that stays put across a switch. */}
        <header className="sticky top-0 z-30 border-b border-clay-200 bg-clay-50/85 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            {/* The rail is hidden on a narrow window, so the page tabs come
                back here rather than disappearing with it. */}
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto md:hidden">
              {PAGES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setPage(id)}
                  aria-current={page === id ? 'page' : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    page === id ? 'bg-white text-clay-900 shadow-sm' : 'text-clay-500'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </nav>
            <p className="hidden truncate text-sm font-medium text-clay-500 md:block">
              {PAGES.find((p) => p.id === page)?.label}
            </p>
            <AppSwitcher />
          </div>
        </header>

        <main className="flex-1 px-5 py-7 lg:px-8">
          {store.error && (
            <div className="mx-auto mb-4 flex max-w-5xl items-start gap-2 rounded-xl border border-undone-100 bg-undone-50 px-4 py-3 text-sm font-medium text-undone-700">
              <span className="flex-1">{store.error}</span>
              <button onClick={store.dismissError} aria-label="Dismiss" className="shrink-0">
                <X className="mt-0.5 h-4 w-4" />
              </button>
            </div>
          )}

          {store.loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-clay-400" />
            </div>
          ) : page === 'today' ? (
            <Today
              store={store}
              settings={settings}
              onAdd={() => setOverlay({ kind: 'adding' })}
              onOpenHabit={(habit) => setOverlay({ kind: 'viewing', habit })}
            />
          ) : page === 'stats' ? (
            <Stats
              store={store}
              settings={settings}
              onOpenHabit={(habit) => setOverlay({ kind: 'viewing', habit })}
            />
          ) : page === 'habits' ? (
            <HabitsPage
              store={store}
              onAdd={() => setOverlay({ kind: 'adding' })}
              onEdit={(habit) => setOverlay({ kind: 'editing', habit })}
              onOpen={(habit) => setOverlay({ kind: 'viewing', habit })}
            />
          ) : (
            <SettingsPage store={store} settings={settings} onChange={set} />
          )}
        </main>
      </div>

      {(overlay?.kind === 'adding' || overlay?.kind === 'editing') && (
        <HabitForm
          // Keyed so opening a second habit rebuilds the form with its values
          // rather than keeping the first one's in the fields.
          key={overlay.kind === 'editing' ? overlay.habit.id : 'new'}
          editing={overlay.kind === 'editing' ? overlay.habit : undefined}
          saving={store.saving}
          onSubmit={submit}
          onDelete={
            overlay.kind === 'editing'
              ? () => setOverlay({ kind: 'deleting', habit: overlay.habit })
              : undefined
          }
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.kind === 'viewing' && (
        <HabitDetail
          habit={
            // Re-read from the store so an edit made in this panel is reflected
            // in it, rather than showing the habit as it was when it opened.
            store.habits.find((habit) => habit.id === overlay.habit.id) ?? overlay.habit
          }
          store={store}
          onEdit={() => setOverlay({ kind: 'editing', habit: overlay.habit })}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay?.kind === 'deleting' && (
        <ConfirmDialog
          title={`Delete “${overlay.habit.name}”?`}
          message="Every day logged against it goes too, and none of it can be recovered."
          confirmLabel="Delete habit"
          busy={store.saving}
          onCancel={() => setOverlay({ kind: 'editing', habit: overlay.habit })}
          onConfirm={async () => {
            const ok = await store.remove(overlay.habit.id);
            if (ok) setOverlay(null);
          }}
        />
      )}
    </div>
  );
}
