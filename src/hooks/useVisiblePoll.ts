// Polling for public, aggregate endpoints (protocol stats, activity, heartbeat, the ticker tape).
// It runs `load` on mount and then every `intervalMs`, but only while the tab is visible: a hidden
// tab makes no requests, and coming back refreshes right away when the data is older than
// RETURN_REFRESH_MS, otherwise the clock resumes where it left off (so quick tab switches do not
// fire a request each). The interval never goes below MIN_POLL_MS: these routes are CDN-cached for
// 60 s, so polling faster only costs function invocations.
import { useEffect, useRef } from 'react';

export const MIN_POLL_MS = 120_000;
const RETURN_REFRESH_MS = 30_000;

export function useVisiblePoll(load: (signal: AbortSignal) => void, intervalMs = MIN_POLL_MS, enabled = true) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const period = Math.max(intervalMs, MIN_POLL_MS);
    const controller = new AbortController();
    let timer: number | undefined;
    let lastRun = 0;

    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (ms: number) => {
      clear();
      timer = window.setTimeout(run, ms);
    };
    function run() {
      lastRun = Date.now();
      loadRef.current(controller.signal);
      schedule(period);
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clear();
        return;
      }
      const age = Date.now() - lastRun;
      if (age >= Math.min(RETURN_REFRESH_MS, period)) run();
      else schedule(period - age);
    };

    if (document.visibilityState !== 'hidden') run();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clear();
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
