import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminError } from '@/lib/admin-client';

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
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data: T | null; dataKey: string | null; error: AdminError | null; loading: boolean }>({ data: null, dataKey: null, error: null, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  keyRef.current = key;
  const seq = useRef(0);

  const reload = useCallback(async (quiet = false) => {
    const id = ++seq.current;
    const forKey = keyRef.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadRef.current();
      if (id === seq.current) setState({ data, dataKey: forKey, error: null, loading: false });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, error: toAdminError(e), loading: false }));
    }
  }, []);

  useEffect(() => { void reload(); }, [key, reload]);
  return { ...state, stale: state.dataKey !== key, reload };
}
