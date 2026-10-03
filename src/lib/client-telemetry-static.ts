// Same first-party runtime for static home and Núcleo, without an auth/analytics SDK.
import { browserDeviceId } from './device-id';
import { CLIENT_HEARTBEAT_MS, ClientTelemetry, afterVisibleFrame, type TelemetryReceipt } from './client-telemetry';
declare const __CLIENT_VERSION__: string;
declare const __CLIENT_BUILD__: string;
declare const __CLIENT_TELEMETRY_ENABLED__: boolean;

const headers = () => ({ 'x-bobby-device': browserDeviceId(), 'x-bobby-platform': 'web' });
let pageActive = true;
const runtime = __CLIENT_TELEMETRY_ENABLED__ ? new ClientTelemetry({
  allowed: () => !/^(localhost|127\.|\[?::1\]?)/i.test(location.hostname) && !/^\/admin(?:\/|$)/.test(location.pathname),
  visible: () => pageActive && document.visibilityState === 'visible', uuid: () => crypto.randomUUID(), headers: async () => headers(),
  send: (report, credential, signal) => fetch('/api/client-telemetry', { method: 'POST', headers: { ...credential, 'Content-Type': 'application/json' }, body: JSON.stringify(report), signal, keepalive: true }),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id as number), version: __CLIENT_VERSION__, build: __CLIENT_BUILD__,
}) : null;
const watched = new Map<string, { selector: string; cleanup: () => void }>();
const api = {
  headers, deviceId: browserDeviceId, beginRead: () => runtime?.beginRead() ?? { requestId: crypto.randomUUID(), generation: -1 },
  received: (request: { requestId: string; generation: number }, raw: unknown) => runtime?.received(request, raw) ?? null,
  reportVisible: (receipt: TelemetryReceipt | null | undefined, selector: string, current: () => boolean, available: () => boolean = () => true) => {
    if (!runtime || !receipt || watched.get(receipt.requestId)?.selector === selector) return;
    watched.get(receipt.requestId)?.cleanup();
    watched.set(receipt.requestId, { selector, cleanup: afterVisibleFrame(() => document.querySelector(selector), () => runtime.rendered(receipt), current, available) });
    if (watched.size > 30) { const key = watched.keys().next().value!; watched.get(key)?.cleanup(); watched.delete(key); }
  },
};
(window as unknown as { BobbyClientTelemetry: typeof api }).BobbyClientTelemetry = api;
if (runtime) {
  document.addEventListener('visibilitychange', () => runtime.reconcile());
  window.addEventListener('pagehide', () => { pageActive = false; runtime.background(); });
  window.addEventListener('pageshow', () => { pageActive = true; runtime.reconcile(); });
  window.setInterval(() => runtime.heartbeat(), CLIENT_HEARTBEAT_MS);
  runtime.reconcile();
}
