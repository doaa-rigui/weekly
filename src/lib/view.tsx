import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The two halves of the app. They share an account and nothing else — no
 * planner reads sleep, no sleep reads a planner — so this is a switch between
 * two apps rather than a route into one.
 */
export type AppView = 'planner' | 'sleep';

const STORAGE_KEY = 'weekly-planner:view';

function readStored(): AppView {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'sleep' ? 'sleep' : 'planner';
  } catch {
    // Private-mode Safari and friends: losing the memory is fine, throwing isn't.
    return 'planner';
  }
}

type ViewState = { view: AppView; setView: (view: AppView) => void };

const ViewContext = createContext<ViewState | null>(null);

/** Remembers which half was open across reloads. */
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
