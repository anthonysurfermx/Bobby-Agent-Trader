import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminError } from '@/lib/admin-client';
import { LoadGeneration } from './live';

export function toAdminError(e: unknown): AdminError {
  if (e instanceof AdminError) return e;
  return new AdminError(0, 'unknown', e instanceof Error ? e.message : 'Algo falló. Inténtalo de nuevo.');
}

/**
 * Loads `load()` whenever `key` changes. `reload(true)` refreshes in the background, keeping the data on
 * screen; a failed refresh keeps the last good data and reports the error (show it, see StaleBanner).
 * `dataKey` is the key the data was loaded for: `stale` is true while the data belongs to another key
 * (another period, an older refresh) — consumers that must never mix ranges check it.
 */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, key: string, options: {
  intervalMs?: number; merge?: (previous: T | null, next: T) => T;
} = {}) {
  const [state, setState] = useState<{ data: T | null; dataKey: string | null; error: AdminError | null; loading: boolean; updatedAt: string | null }>({ data: null, dataKey: null, error: null, loading: true, updatedAt: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  const generation = useRef(new LoadGeneration());
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const mergeRef = useRef(options.merge);
  mergeRef.current = options.merge;
  // Invalidate during render: a response can resolve before the new key's effect runs.
  if (keyRef.current !== key) { keyRef.current = key; generation.current.invalidate(); }

  const reload = useCallback((quiet = false): Promise<void> => {
    if (pending.current) return pending.current;
    const id = generation.current.next();
    const forKey = keyRef.current;
    const abort = new AbortController();
    controller.current = abort;
    setState((s) => ({ ...s, loading: true, error: quiet ? s.error : null }));
    const work = Promise.resolve().then(async () => {
      try {
        const data = await loadRef.current(abort.signal);
        if (generation.current.accepts(id) && keyRef.current === forKey && !abort.signal.aborted) {
          setState((s) => ({ data: mergeRef.current ? mergeRef.current(s.dataKey === forKey ? s.data : null, data) : data,
            dataKey: forKey, error: null, loading: false, updatedAt: new Date().toISOString() }));
        }
      } catch (e) {
        if (generation.current.accepts(id) && keyRef.current === forKey && !abort.signal.aborted) {
          setState((s) => ({ ...s, error: toAdminError(e), loading: false }));
        }
      } finally {
        if (pending.current === work) pending.current = null;
        if (controller.current === abort) controller.current = null;
      }
    });
    pending.current = work;
    return work;
  }, []);

  useEffect(() => {
    // A changed key aborts the previous GET, then starts the new one. The old request cannot publish.
    controller.current?.abort();
    pending.current = null;
    void reload();
    return () => { generation.current.invalidate(); controller.current?.abort(); pending.current = null; };
  }, [key, reload]);
  useEffect(() => {
    if (!options.intervalMs) return;
    const tick = () => { if (document.visibilityState === 'visible') void reload(true); };
    const timer = window.setInterval(tick, options.intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [options.intervalMs, reload]);
  return { ...state, stale: state.dataKey !== key, reload };
}
