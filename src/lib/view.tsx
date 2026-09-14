import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_APP_ID, isAppId, type AppId } from '@/lib/apps';

/**
 * Which of the apps in `@/lib/apps` is open. They share an account and
 * nothing else, so this is a switch between apps rather than a route into
 * one — and the set of them lives in the registry, not here.
 */
export type AppView = AppId;

const STORAGE_KEY = 'weekly-planner:view';

function readStored(): AppView {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // An id left behind by an app that has since been removed falls back
    // rather than mounting nothing.
    return isAppId(stored) ? stored : DEFAULT_APP_ID;
  } catch {
    // Private-mode Safari and friends: losing the memory is fine, throwing isn't.
    return DEFAULT_APP_ID;
  }
}

type ViewState = { view: AppView; setView: (view: AppView) => void };

const ViewContext = createContext<ViewState | null>(null);

/** Remembers which app was open across reloads. */
export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<AppView>(readStored);

  const setView = useCallback((next: AppView) => {
    setViewState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* see readStored */
    }
  }, []);

  const value = useMemo(() => ({ view, setView }), [view, setView]);
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useView(): ViewState {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used inside <ViewProvider>');
  return ctx;
}
