import { Planner } from '@/components/Planner';
import { SignIn } from '@/components/SignIn';
import { AuthProvider, useAuth } from '@/lib/auth';
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
 * Holds the account's planners and hands the open one to <Planner>. Keying on
 * the planner id means switching remounts the grid with a clean slate, rather
 * than showing the previous planner's blocks until the refetch lands.
 */
function Workspace({ userId }: { userId: string }) {
  const store = usePlanners(userId);

  if (store.loading) return <Spinner />;

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

  return <Planner key={store.active.id} plannerId={store.active.id} plannerStore={store} />;
}

function Gate() {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <SignIn />;

  // Keyed by user so switching accounts remounts with a clean slate rather
  // than showing the previous account's planners until the refetch lands.
  return <Workspace key={user.id} userId={user.id} />;
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
