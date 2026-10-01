import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminError } from '@/lib/admin-client';

export function toAdminError(e: unknown): AdminError {
  if (e instanceof AdminError) return e;
  return new AdminError(0, 'unknown', e instanceof Error ? e.message : 'Algo falló. Inténtalo de nuevo.');
}

/**
 * Loads `load()` whenever `key` changes. `reload(true)` refreshes in the background, keeping the data on
 * screen; a failed refresh keeps the last good data and reports the error. Late answers are ignored.
 */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data: T | null; error: AdminError | null; loading: boolean }>({ data: null, error: null, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const reload = useCallback(async (quiet = false) => {
    const id = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ data: s.data, error: toAdminError(e), loading: false }));
    }
  }, []);

  useEffect(() => { void reload(); }, [key, reload]);
  return { ...state, reload };
}
