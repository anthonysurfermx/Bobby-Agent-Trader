// First-party funnel events for the owner dashboard (api/track.ts → bobby_events). No cookies: the same
// install id the read meter uses (access-client deviceId), a short surface name, the referrer host and
// utm_source. Fire-and-forget; never blocks or breaks a page.
import { accessHeaders, deviceId } from '@/lib/access-client';

export type TrackEvent = 'visit' | 'desk_entered' | 'appstore_click' | 'signin_start' | 'paywall_view' | 'purchase_start';

const SURFACES: Array<[RegExp, string]> = [
  [/^\/desk/, 'desk'], [/^\/redeem/, 'redeem'], [/^\/signin/, 'signin'], [/^\/protocol/, 'protocol'],
  [/^\/support/, 'support'], [/^\/privacy/, 'privacy'], [/^\/terms/, 'terms'], [/^\/app(-[ab])?(\/|$)/, 'app'],
  [/^\/agentic-world\/bobby/, 'bobby'], [/^\/nucleo/, 'nucleo'], [/^\/auth\/callback/, 'auth'],
];
export const surfaceOf = (path: string): string | null => {
  if (path.startsWith('/admin')) return null; // the dashboard does not count itself
  if (path === '/' || /^\/home(?:\/|$)/.test(path)) return 'home';
  return SURFACES.find(([re]) => re.test(path))?.[1] ?? 'other';
};

let pending = Promise.resolve();

export function track(event: TrackEvent, surface?: string | null) {
  try {
    if (typeof window === 'undefined' || /^(localhost|127\.)/.test(location.hostname)) return;
    const params = new URLSearchParams(location.search);
    const body = JSON.stringify({
      event, surface: surface ?? surfaceOf(location.pathname), device: deviceId(), platform: 'web',
      referrer: document.referrer || undefined, utm: params.get('utm_source') ?? undefined,
    });
    // Beacon cannot carry verified credentials. Queue requests so a direct /desk view stores its site visit
    // before the separately mounted Desk event, using the same install and the server-resolved account.
    pending = pending.then(async () => {
      const controller = new AbortController();
      await new Promise<void>((resolve) => {
        // A stalled auth lookup or network request must release the queue for later funnel steps.
        const timer = window.setTimeout(() => { controller.abort(); resolve(); }, 4000);
        void accessHeaders().then((headers) => fetch('/api/track', { method: 'POST', body, keepalive: true,
          signal: controller.signal, headers: { 'Content-Type': 'text/plain', ...headers } }))
          .catch(() => {}).finally(() => { window.clearTimeout(timer); resolve(); });
      });
    }).catch(() => {});
  } catch { /* analytics never breaks the page */ }
}

/** One visit per path per page view of the SPA, plus App Store link clicks anywhere. */
export function startTracking() {
  let last = '';
  const visit = () => {
    const path = location.pathname;
    const surface = surfaceOf(path);
    if (!surface || path === last) return;
    last = path;
    track('visit', surface);
  };
  visit();
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      queueMicrotask(visit);
      return result;
    } as History['pushState'];
  }
  window.addEventListener('popstate', visit);
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href*="apps.apple.com"]');
    if (link) track('appstore_click');
  }, { capture: true });
}
