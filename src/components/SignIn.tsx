import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarDays, Loader2 } from 'lucide-react';

type Mode = 'signin' | 'signup';

export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    const { data, error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setPending(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // With "Confirm email" on (the Supabase default) sign-up returns a user
    // but no session — nothing happens on screen unless we say why.
    if (mode === 'signup' && !data.session) {
      setNotice('Check your email for a confirmation link, then sign in.');
      setMode('signin');
      setPassword('');
    }
    // On success the auth listener in AuthProvider swaps this screen out.
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setNotice(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sage-100 bg-garden-glow bg-no-repeat px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-moss-500/15 text-moss-600">
            <CalendarDays className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-sage-900">
            Weekly Planner
          </h1>
          <p className="mt-1 text-sm text-sage-500">
            {mode === 'signin' ? 'Sign in to open your week' : 'Create an account to start'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-sage-200 bg-paper/95 p-6 backdrop-blur-sm shadow-[0_2px_6px_rgba(40,48,40,0.06),0_20px_44px_-24px_rgba(40,48,40,0.4)]"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-sage-500"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-lg border border-sage-200 px-3 py-2.5 text-sm text-sage-900 outline-none transition-colors placeholder:text-sage-400 focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-sage-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full rounded-lg border border-sage-200 px-3 py-2.5 text-sm text-sage-900 outline-none transition-colors placeholder:text-sage-400 focus:border-sage-400 focus:ring-2 focus:ring-moss-500/15"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-moss-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-moss-600"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending
              ? mode === 'signin'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-sage-500">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={switchMode}
            className="font-semibold text-sage-900 underline-offset-2 hover:underline"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
