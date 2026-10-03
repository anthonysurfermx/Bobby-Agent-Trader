import { accessHeaders } from './access-client';
import { bobbySupabase } from './bobby-db-client';
import { onSessionChange } from './bobby-session';
import { onProgressCredentialChange } from './companions/sync';
import { CLIENT_HEARTBEAT_MS, ClientTelemetry, type TelemetryReceipt } from './client-telemetry';
declare const __CLIENT_TELEMETRY_ENABLED__: boolean;

export function telemetryAllowed(host: string, path: string, dev = false) {
  return __CLIENT_TELEMETRY_ENABLED__ && !dev && !/^(localhost|127\.|\[?::1\]?)/i.test(host) && !/^\/admin(?:\/|$)/.test(path);
}
let runtime: ClientTelemetry | null = null;
export function startClientTelemetry() {
  if (!__CLIENT_TELEMETRY_ENABLED__ || runtime || typeof window === 'undefined' || /^\/auth\/callback(?:\/|$)/.test(location.pathname) || typeof crypto.randomUUID !== 'function') return;
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  let identityReady = false, pageActive = true;
  runtime = new ClientTelemetry({
    allowed: () => identityReady && telemetryAllowed(location.hostname, location.pathname, env.DEV === true), visible: () => pageActive && document.visibilityState === 'visible',
    uuid: () => crypto.randomUUID(), headers: accessHeaders,
    send: (report, headers, signal) => fetch('/api/client-telemetry', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(report), signal, keepalive: true }),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id as number),
    version: typeof env.VITE_APP_VERSION === 'string' ? env.VITE_APP_VERSION : undefined,
    build: typeof env.VITE_APP_BUILD === 'string' ? env.VITE_APP_BUILD : undefined,
  });
  const reconcile = () => runtime?.reconcile();
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', () => { pageActive = false; runtime?.background(); });
  window.addEventListener('pageshow', () => { pageActive = true; reconcile(); });
  window.addEventListener('popstate', reconcile);
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args); reconcile(); return result;
    } as History['pushState'];
  }
  window.setInterval(() => runtime?.heartbeat(), CLIENT_HEARTBEAT_MS);
  // Account changes synchronously invalidate queued reports and in-flight credential acquisition.
  let owner: string | null | undefined;
  const auth = bobbySupabase().auth;
  auth.onAuthStateChange((_event, session) => {
    identityReady = true;
    const next = session?.user.id ?? null;
    if (owner !== next) { owner = next; runtime?.identityChanged(); }
  });
  onSessionChange(() => { if (!owner) runtime?.identityChanged(); });
  onProgressCredentialChange(() => { if (!owner) runtime?.identityChanged(); });
  window.addEventListener('storage', (event) => { if (event.key?.startsWith('bobby_session:') || event.key === 'bobby:device:v1') runtime?.identityChanged(); });
  runtime.reconcile();
}
export const beginClientRead = () => runtime?.beginRead() ?? { requestId: crypto.randomUUID(), generation: -1 };
export const receiveClientRead = (request: { requestId: string; generation: number }, raw: unknown) => runtime?.received(request, raw) ?? null;
export const renderClientRead = (receipt: TelemetryReceipt) => runtime?.rendered(receipt);
