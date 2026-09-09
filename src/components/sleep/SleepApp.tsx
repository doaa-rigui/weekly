import { useMemo, useState } from 'react';
import { CalendarDays, Loader2, LogOut, MoonStar, Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useView } from '@/lib/view';
import { useSleep } from '@/lib/sleepStore';
import { nightSlots } from '@/lib/sleep';
import { SleepDashboard } from './SleepDashboard';
import { SleepForm, type SleepPrefill } from './SleepForm';
import { SleepHistory } from './SleepHistory';
import { Segmented } from './ui';

/**
 * The sleep tracker's shell: the header, the two pages, and the add-sleep
 * panel. It owns nothing but which page is showing and whether the form is
 * open — everything about sleep itself lives in `useSleep`, so the dashboard
 * and the history page can never disagree about a night.
 *
 * The dark palette is deliberate and confined to this half of the app. The
 * planner is a daytime tool and stays light; a sleep log is read last thing at
 * night and first thing in the morning.
 */

const PAGES = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'history', label: 'History' },
] as const;

type Page = (typeof PAGES)[number]['value'];

export function SleepApp({ userId }: { userId: string }) {
  const { user, signOut } = useAuth();
  const { setView } = useView();
  const store = useSleep(userId);

  const [page, setPage] = useState<Page>('dashboard');
  /**
   * `null` means closed. An open form carries its prefill, so "add another
   * period to this night" and the plain "Add sleep" button are the same panel
   * rather than two.
   */
  const [form, setForm] = useState<{ prefill?: SleepPrefill } | null>(null);

  const slots = useMemo(() => nightSlots(store.nights), [store.nights]);

  return (
    <div className="min-h-screen bg-night-900 bg-night-glow bg-no-repeat">
      <header className="sticky top-0 z-30 border-b border-night-700/60 bg-night-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
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
            {/* Back to the other half of the app. They share an account and
                nothing else, so this is the only link between them. */}
            <button
              onClick={() => setView('planner')}
              title="Open the planner"
              className="inline-flex items-center gap-1.5 rounded-full border border-night-600 px-3 py-1.5 text-xs font-medium text-night-300 transition-colors hover:bg-night-800"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Planner</span>
            </button>
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

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Segmented options={PAGES} value={page} onChange={setPage} label="Sleep pages" />
          {store.periods.length > 0 && (
            <span className="text-xs text-night-500">
              {store.periods.length} {store.periods.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {store.error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">
            <span className="flex-1">{store.error}</span>
            <button onClick={store.dismissError} aria-label="Dismiss" className="shrink-0">
              <X className="mt-0.5 h-4 w-4" />
            </button>
          </div>
        )}

        {store.loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-night-500" />
          </div>
        ) : page === 'dashboard' ? (
          <SleepDashboard
            summary={store.summary}
            slots={slots}
            onAdd={(prefill) => setForm({ prefill })}
          />
        ) : (
          <SleepHistory
            nights={store.nights}
            entryCount={store.periods.length}
            busy={store.saving}
            onDelete={store.remove}
            onAdd={() => setForm({})}
          />
        )}
      </main>

      {form && (
        <SleepForm
          nights={store.nights}
          periods={store.periods}
          prefill={form.prefill}
          saving={store.saving}
          onSubmit={store.create}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
