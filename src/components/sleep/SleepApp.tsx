import { useMemo, useState } from 'react';
import { Loader2, LogOut, MoonStar, Plus, X } from 'lucide-react';
import { AppSwitcher } from '@/components/AppSwitcher';
import { useAuth } from '@/lib/auth';
import { useSleep } from '@/lib/sleepStore';
import { useTakeaways } from '@/lib/takeaways';
import { nightSlots, type SleepPeriod } from '@/lib/sleep';
import { SleepDashboard } from './SleepDashboard';
import { SleepForm, type SleepPrefill } from './SleepForm';
import { SleepHistory } from './SleepHistory';
import { SleepTakeaways } from './SleepTakeaways';
import { Segmented } from './ui';

/**
 * The sleep tracker's shell: the header, the three pages, and the add-sleep
 * panel. It owns nothing but which page is showing and whether the form is
 * open — the nightly log lives in `useSleep` and the standing lessons in
 * `useTakeaways`, so no two pages can disagree about either.
 *
 * The dark palette is deliberate and confined to this half of the app. The
 * planner is a daytime tool and stays light; a sleep log is read last thing at
 * night and first thing in the morning.
 */

const PAGES = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'history', label: 'History' },
  { value: 'takeaways', label: 'Takeaways' },
] as const;

type Page = (typeof PAGES)[number]['value'];

export function SleepApp({ userId }: { userId: string }) {
  const { user, signOut } = useAuth();
  const store = useSleep(userId);
  const takeaways = useTakeaways(userId);

  const [page, setPage] = useState<Page>('dashboard');
  /**
   * `null` means closed. An open form carries either a prefill or the entry it
   * is correcting, so adding, continuing a night, and editing are all the same
   * panel rather than three.
   */
  const [form, setForm] = useState<{
    prefill?: SleepPrefill;
    editing?: SleepPeriod;
  } | null>(null);

  const slots = useMemo(() => nightSlots(store.nights), [store.nights]);

  /**
   * Each page waits only on what it actually shows. The dashboard needs both,
   * since it previews the takeaways and would otherwise flash its "nothing
   * here yet" prompt before they arrive.
   */
  const loading =
    page === 'history'
      ? store.loading
      : page === 'takeaways'
        ? takeaways.loading
        : store.loading || takeaways.loading;

  return (
    <div className="min-h-screen bg-night-900 bg-night-glow bg-no-repeat">
      <header className="sticky top-0 z-30 border-b border-night-700/60 bg-night-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 xl:max-w-[1600px]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dream-500/15 text-dream-300">
              <MoonStar className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-night-100">Sleep</h1>
              <p className="truncate text-xs text-night-400">
                🌙 Rest well, wake gently 🌙
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setForm({})}
              className="inline-flex items-center gap-1.5 rounded-full bg-dream-500 px-3.5 py-2 text-xs font-semibold text-night-950 transition-colors hover:bg-dream-400"
            >
              <Plus className="h-4 w-4" />
              Add sleep
            </button>
            {/* Out to the other apps behind this sign-in. They share an
                account and nothing else, so this is the only link between
                them. */}
            <AppSwitcher />
            <button
              onClick={signOut}
              title={`Sign out${user?.email ? ` (${user.email})` : ''}`}
              aria-label="Sign out"
              className="rounded-full border border-night-600 p-2 text-night-400 transition-colors hover:bg-night-800 hover:text-night-200"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Wide, because the dashboard puts a rail either side of its chart on a
          desktop and needs the room for all three. The other two pages are
          lists to be read: they stay centred at a reading width inside it
          rather than stretching to the full span. */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 xl:max-w-[1600px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Segmented options={PAGES} value={page} onChange={setPage} label="Sleep pages" />
          {page !== 'takeaways' && store.periods.length > 0 && (
            <span className="text-xs text-night-500">
              {store.periods.length} {store.periods.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {(store.error ?? takeaways.error) && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">
            <span className="flex-1">{store.error ?? takeaways.error}</span>
            <button
              onClick={store.error ? store.dismissError : takeaways.dismissError}
              aria-label="Dismiss"
              className="shrink-0"
            >
              <X className="mt-0.5 h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-night-500" />
          </div>
        ) : page === 'dashboard' ? (
          <SleepDashboard
            summary={store.summary}
            slots={slots}
            takeaways={takeaways.takeaways}
            onOpenTakeaways={() => setPage('takeaways')}
            onAdd={(prefill) => setForm({ prefill })}
          />
        ) : page === 'takeaways' ? (
          <div className="mx-auto max-w-5xl">
            <SleepTakeaways store={takeaways} />
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            <SleepHistory
              nights={store.nights}
              entryCount={store.periods.length}
              busy={store.saving}
              onDelete={store.remove}
              onEdit={(row) => setForm({ editing: row })}
              onAdd={() => setForm({})}
            />
          </div>
        )}
      </main>

      {form && (
        <SleepForm
          nights={store.nights}
          periods={store.periods}
          prefill={form.prefill}
          editing={form.editing}
          saving={store.saving}
          onSubmit={(draft) =>
            form.editing ? store.update(form.editing.id, draft) : store.create(draft)
          }
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
