import { Planner } from '@/components/Planner';
import { SignIn } from '@/components/SignIn';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) return <SignIn />;

  // Keyed by user so switching accounts remounts with a clean slate rather
  // than showing the previous week until the refetch lands.
  return <Planner key={user.id} />;
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
