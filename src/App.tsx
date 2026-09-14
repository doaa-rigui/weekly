import { Planner } from '@/components/Planner';
import { SignIn } from '@/components/SignIn';
import { SleepApp } from '@/components/sleep/SleepApp';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ViewProvider, useView } from '@/lib/view';
import { usePeople } from '@/lib/people';
import { usePlanners } from '@/lib/planners';
import { Loader2 } from 'lucide-react';

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}

/**
 * Holds what belongs to the account rather than to one week — the planners and
 * the people who can be tagged — and hands the open planner to <Planner>.
 * Keying on the planner id means switching remounts the grid with a clean
 * slate, rather than showing the previous planner's blocks until the refetch
 * lands. The people outlive that remount, since they are the same everywhere.
 */
function Workspace({ userId }: { userId: string }) {
  const store = usePlanners(userId);
  const people = usePeople(userId);

  // Waiting on the people too, so avatars are drawn with the first blocks
  // rather than popping in a moment later.
  if (store.loading || people.loading) return <Spinner />;

  // Every account is given a planner on first load, so this only happens when
  // that write failed — and the store's error explains why.
  if (!store.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <p className="max-w-md rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
          {store.error ?? 'No planner could be opened. Reload to try again.'}
        </p>
      </div>
    );
  }

  return (
    <Planner
      key={store.active.id}
      planner={store.active}
      plannerStore={store}
      peopleStore={people}
    />
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const { view } = useView();

  if (loading) return <Spinner />;
  if (!user) return <SignIn />;

  // Several apps behind one sign-in: they share an account and nothing else,
  // so this is a switch rather than a route. Each app listed in '@/lib/apps'
  // needs a branch here — the switcher reads that list and needs no edit.
  // Keyed by user so switching accounts remounts with a clean slate rather
  // than showing the previous account's data until the refetch lands.
  switch (view) {
    case 'sleep':
      return <SleepApp key={user.id} userId={user.id} />;
    case 'planner':
      return <Workspace key={user.id} userId={user.id} />;
  }
}

function App() {
  return (
    <AuthProvider>
      <ViewProvider>
        <Gate />
      </ViewProvider>
    </AuthProvider>
  );
}

export default App;
