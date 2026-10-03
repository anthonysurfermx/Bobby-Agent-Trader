import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { loadConfigFromFile } from 'vite';
import { buildClientTelemetry } from './build-client-telemetry.mjs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { ClientTelemetry, afterVisibleFrame, CLIENT_HEARTBEAT_MS, type ClientReport } from '../src/lib/client-telemetry.ts';
import { normalizeAdminLive, normalizeOverview, isMissing } from '../src/lib/admin-client.ts';
import { label } from '../src/components/admin/bobby/format.ts';

let checks = 0;
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const ok = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const uuid = () => webcrypto.randomUUID();
async function buildEnvironment<T>(environment: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = environment;
  try { return await run(); }
  finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; }
}

let visible = true, allowed = true, now = '2026-10-03T12:00:00.000Z', credential = 'account-a';
const reports: Array<{ event: ClientReport; headers: Record<string, string>; signal: AbortSignal }> = [];
const timers = new Set<() => void>();
let blocking: ReturnType<typeof deferred<Record<string, string>>> | null = null;
const runtime = new ClientTelemetry({ allowed: () => allowed, visible: () => visible, uuid, now: () => now,
  headers: () => blocking?.promise ?? Promise.resolve({ Authorization: credential }),
  send: async (event, headers, signal) => { reports.push({ event, headers, signal }); },
  setTimeout: (fn) => { timers.add(fn); return fn; }, clearTimeout: (id) => { timers.delete(id as () => void); }, version: '1.6', build: 'verified-sha',
});
runtime.reconcile(); await flush();
eq(reports.map((r) => r.event.event), ['foreground'], 'initial visible opening is reported once');
runtime.reconcile(); runtime.reconcile(); await flush();
eq(reports.length, 1, 'SPA route reconciliation never creates duplicate foreground/visits');
runtime.heartbeat(); await flush();
eq([CLIENT_HEARTBEAT_MS, reports.at(-1)!.event.event], [30_000, 'heartbeat'], 'heartbeat cadence and current foreground event');
visible = false; runtime.reconcile(); runtime.heartbeat(); await flush();
eq(reports.map((r) => r.event.event), ['foreground', 'heartbeat', 'background'], 'hidden tab pauses heartbeat and emits ordered background');
visible = true; runtime.reconcile(); await flush();
ok(reports.every((r, index) => r.event.sequence === index + 1 && (!index || Date.parse(r.event.occurredAt) > Date.parse(reports[index - 1].event.occurredAt))), 'events keep ordered sequence and strictly monotonic captured times');
const request = runtime.beginRead(); await flush();
eq(reports.at(-1)!.event.requestId, request.requestId, 'read started carries the exact desk request identifier');
eq(runtime.received(request, null), null, 'missing receipt remains unmeasured');
eq(runtime.received(request, { requestId: uuid(), receipt: 'signed' }), null, 'mismatched request is not acknowledged');
eq(runtime.received(request, { requestId: request.requestId, receipt: 'a'.repeat(1025) }), null, 'oversized receipt is rejected');
const receipt = runtime.received(request, { requestId: request.requestId, receipt: 'signed-server-success' })!; await flush();
eq(reports.at(-1)!.event.event, 'read_received', 'receipt confirms reception separately from rendering');
runtime.rendered(receipt); runtime.rendered(receipt); await flush();
eq(reports.filter((r) => r.event.event === 'read_rendered').length, 1, 'render confirmation is deduplicated across rerenders');
const oldSession = reports.at(-1)!.event.sessionId;
blocking = deferred();
runtime.heartbeat(); runtime.beginRead();
credential = 'account-b'; const oldHeaders = blocking; blocking = null; runtime.identityChanged(); oldHeaders.resolve({ Authorization: 'account-a' });
await flush();
runtime.rendered(receipt); await flush();
eq(reports.filter((r) => r.event.event === 'read_rendered').length, 1, 'old account response cannot be rendered under a new credential');
ok(reports.at(-1)!.event.sessionId !== oldSession, 'account change isolates client session');
eq(reports.at(-1)!.headers.Authorization, 'account-b', 'queued old account events are dropped before credential acquisition completes');
allowed = false; runtime.reconcile(); await flush();
eq(reports.at(-1)!.event.event, 'background', 'entering admin withdraws the prior public foreground without tracking admin');
const count = reports.length; runtime.heartbeat(); runtime.beginRead(); await flush();
eq(reports.length, count, 'admin/default-disabled surfaces emit no new activity');
allowed = true; visible = true; runtime.reconcile(); await flush();
const pendingStart = reports.length;
blocking = deferred(); runtime.heartbeat(); now = '2026-10-03T12:00:30Z';
for (let i = 0; i < 50; i++) runtime.beginRead();
blocking.resolve({ Authorization: credential }); blocking = null; await flush();
ok(reports.length <= count + 22, 'queue is bounded instead of replaying every event after a delay');
ok(Date.parse(reports.slice(pendingStart).find((r) => r.event.event === 'heartbeat')!.event.occurredAt) < Date.parse(now), 'captured timestamps are not replaced by send time');
runtime.dispose(); runtime.heartbeat(); await flush();
eq(timers.size, 0, 'all send deadlines are cleaned up');

// Transient failures retry once with the original event and fresh credentials, then stop.
const attempts: ClientReport[] = []; let headerLookups = 0;
const retry = new ClientTelemetry({ allowed: () => true, visible: () => true, uuid, now: () => now,
  headers: async () => { headerLookups++; return { Authorization: 'fresh' }; },
  send: async (report) => { attempts.push(report); return { status: attempts.length === 1 ? 503 : 202 }; },
  setTimeout: (fn) => { timers.add(fn); return fn; }, clearTimeout: (id) => { timers.delete(id as () => void); },
});
retry.reconcile(); await flush();
eq(attempts.length, 2, '503 triggers exactly one retry');
eq(attempts[0], attempts[1], 'retry preserves eventId, capture time, session and sequence');
eq(headerLookups, 2, 'retry acquires credentials afresh');
retry.background(); retry.identityChanged(); await flush();
ok(Date.parse(attempts.at(-1)!.occurredAt) > Date.parse(attempts.at(-2)!.occurredAt) && attempts.at(-1)!.sessionId !== attempts.at(-2)!.sessionId, 'same-millisecond account transition keeps new-session foreground later than preceding background');
now = '2026-10-03T11:00:00Z'; retry.background(); await flush();
ok(Date.parse(attempts.at(-1)!.occurredAt) > Date.parse(attempts.at(-2)!.occurredAt), 'a backwards client clock cannot reorder captures within the page lifetime');
now = '2026-10-03T12:00:30Z';
retry.dispose();
// A first foreground rejected for clock skew must reopen presence, rather than heartbeat forever.
const calibratedReports: ClientReport[] = [];
const calibrated = new ClientTelemetry({ allowed: () => true, visible: () => true, uuid,
  now: () => '2026-10-03T12:10:00Z', headers: async () => ({}),
  send: async (report) => { calibratedReports.push(report); return new Response(null, { status: calibratedReports.length === 1 ? 400 : 204, headers: { Date: 'Sat, 03 Oct 2026 12:00:00 GMT' } }); },
  setTimeout: (fn) => { timers.add(fn); return fn; }, clearTimeout: (id) => { timers.delete(id as () => void); },
});
calibrated.reconcile(); await flush();
eq(calibratedReports.map((r) => r.event), ['foreground', 'foreground'], 'clock rejection opens one corrected foreground, never retries the rejected timestamp');
eq(calibratedReports.at(-1)!.occurredAt, '2026-10-03T12:00:00.000Z', 'server Date corrects an invalid future capture floor');
ok(calibratedReports[0].sessionId !== calibratedReports[1].sessionId, 'calibration opens a separate lifecycle epoch');
calibrated.heartbeat(); await flush();
eq([calibratedReports.at(-1)!.event, calibratedReports.at(-1)!.sequence], ['heartbeat', 2], 'later heartbeat renews the corrected foreground epoch');
calibrated.dispose();
let refusedAttempts = 0;
const refused = new ClientTelemetry({ allowed: () => true, visible: () => true, uuid, headers: async () => ({}),
  send: async () => { refusedAttempts++; return { status: 401 }; },
  setTimeout: (fn) => { timers.add(fn); return fn; }, clearTimeout: (id) => { timers.delete(id as () => void); },
});
refused.reconcile(); await flush(); eq(refusedAttempts, 1, 'authentication refusal is not retried'); refused.dispose();
let networkAttempts = 0;
const disconnected = new ClientTelemetry({ allowed: () => true, visible: () => true, uuid, headers: async () => ({}),
  send: async () => { networkAttempts++; throw new Error('offline'); },
  setTimeout: (fn) => { timers.add(fn); return fn; }, clearTimeout: (id) => { timers.delete(id as () => void); },
});
disconnected.reconcile(); await flush(); eq(networkAttempts, 2, 'network failure stops after one bounded retry'); disconnected.dispose();
let expiredLookups = 0; const deadlines = new Map<() => void, number>();
const hanging = new ClientTelemetry({ allowed: () => true, visible: () => true, uuid,
  headers: () => { expiredLookups++; return new Promise(() => {}); }, send: async () => { throw new Error('unexpected send'); },
  setTimeout: (fn, ms) => { deadlines.set(fn, ms); return fn; }, clearTimeout: (id) => { deadlines.delete(id as () => void); },
});
hanging.reconcile(); eq([...deadlines.values()], [4000], 'credential acquisition shares the four-second deadline');
[...deadlines.keys()][0](); await flush(); [...deadlines.keys()][0](); await flush();
eq([expiredLookups, deadlines.size], [2, 0], 'hanging credential lookup cannot block the queue indefinitely'); hanging.dispose();

// Post-commit frame checks cover hidden tabs, offscreen elements, hidden ancestors and cancellation.
const oldWindow = globalThis.window, oldDocument = globalThis.document;
const oldObserver = globalThis.MutationObserver;
const frames = new Map<number, () => void>(), listeners = new Map<string, Set<() => void>>(); let frameId = 0;
const mutations = new Set<() => void>();
const add = (key: string, fn: () => void) => { const set = listeners.get(key) ?? new Set(); set.add(fn); listeners.set(key, set); };
const remove = (key: string, fn: () => void) => listeners.get(key)?.delete(fn);
let hidden = true, offscreen = false, ancestorHidden = false, obsolete = false, occluded = false, nonInteractive = false, sheetOpen = false, rendered = 0, pointer = 'none';
const parent = { parentElement: null, hiddenParent: true };
const element = { isConnected: true, contains: () => false, parentElement: parent,
 style: { getPropertyValue: () => pointer, getPropertyPriority: () => '', setProperty: (_key: string, value: string) => { pointer = value; }, removeProperty: () => { pointer = ''; } },
 getBoundingClientRect: () => ({ width: 300, height: 100, top: offscreen ? 1000 : 10, bottom: offscreen ? 1100 : 110, left: 0, right: 300 }) };
Object.assign(globalThis, { MutationObserver: class { constructor(private fn: () => void) {} observe() { mutations.add(this.fn); } disconnect() { mutations.delete(this.fn); } takeRecords() { return []; } },
 document: { documentElement: {}, elementFromPoint: () => occluded || (nonInteractive && pointer !== 'auto') ? parent : element, get visibilityState() { return hidden ? 'hidden' : 'visible'; }, addEventListener: add, removeEventListener: remove }, window: {
  innerHeight: 800, innerWidth: 390, requestAnimationFrame: (fn: () => void) => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: (id: number) => frames.delete(id),
  getComputedStyle: (el: unknown) => ({ opacity: el === parent && ancestorHidden ? '0' : '1', visibility: 'visible', display: 'block', pointerEvents: el === element && nonInteractive ? 'none' : 'auto' }), addEventListener: add, removeEventListener: remove,
} });
const frame = () => { const copy = [...frames.values()]; frames.clear(); copy.forEach((fn) => fn()); };
const cleanup = afterVisibleFrame(() => element as unknown as Element, () => rendered++, () => !obsolete);
frame(); eq(rendered, 0, 'network completion never confirms hidden rendering');
hidden = false; ancestorHidden = true; listeners.get('visibilitychange')?.forEach((fn) => fn()); frame();
eq(rendered, 0, 'opacity zero on a transitioning ancestor is not a visible final');
ancestorHidden = false; offscreen = true; frame(); eq(rendered, 0, 'offscreen final result is not a presentation');
offscreen = false; frame(); eq(rendered, 1, 'one visible post-commit frame confirms final presentation');
frame(); eq(rendered, 1, 'visible render callback runs once');
cleanup();
const stop = afterVisibleFrame(() => element as unknown as Element, () => rendered++); stop(); frame(); eq(rendered, 1, 'unmount cancels a pending frame acknowledgement');
obsolete = true; afterVisibleFrame(() => element as unknown as Element, () => rendered++, () => !obsolete); frame(); eq(rendered, 1, 'obsolete responses never acknowledge a frame');
obsolete = false; occluded = true;
afterVisibleFrame(() => element as unknown as Element, () => rendered++);
for (let i = 0; i < 140; i++) frame();
eq([rendered, frames.size], [1, 0], 'a modal occluding the final response prevents presentation and stops active frame polling');
occluded = false; mutations.forEach((fn) => fn()); frame();
eq(rendered, 2, 'closing a modal after the initial two seconds resumes the actual visible-frame check');
eq(mutations.size, 0, 'successful acknowledgement disconnects DOM observers');
nonInteractive = true; sheetOpen = true;
afterVisibleFrame(() => element as unknown as Element, () => rendered++, () => true, () => !sheetOpen);
frame(); eq(rendered, 2, 'product sheet guard blocks presentation even for a non-interactive overlay');
sheetOpen = false; mutations.forEach((fn) => fn()); frame();
eq([rendered, pointer], [3, 'none'], 'static pointer-events-none text is verified at its paint position and remains non-interactive');
occluded = true; afterVisibleFrame(() => element as unknown as Element, () => rendered++); frame();
eq(rendered, 3, 'hit-test probe never promotes a text beneath a covering modal');
mutations.clear(); frames.clear();
Object.assign(globalThis, { window: oldWindow, document: oldDocument, MutationObserver: oldObserver });

// Exercise the actual desk parser/transport, using scripted JSON and NDJSON replies with no paid calls.
const stub = (contents: string) => ({ contents, loader: 'ts' as const });
const deskBundle = await build({ entryPoints: [fileURLToPath(new URL('../src/components/nucleo/deskData.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'telemetry-desk-io', setup(b) {
  b.onResolve({ filter: /^@\// }, (args) => ({ path: args.path, namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => {
    if (path.endsWith('client-telemetry-browser')) return stub('export const beginClientRead=()=>globalThis.__readTest.begin(); export const receiveClientRead=(r,v)=>globalThis.__readTest.receive(r,v);');
    if (path.endsWith('access-client')) return stub('export const accessHeaders=async()=>({"x-bobby-device":"fixed-install","x-bobby-platform":"web"});');
    if (path.endsWith('i18n')) return stub('export const lang=()=>"en"; export const t=(en)=>en;');
    if (path.endsWith('desk-price')) return stub('export const deskPrice=(x)=>String(x);');
    return stub('export const deskJson=async()=>({ok:false,data:null});');
  });
} }] });
const desk = await import('data:text/javascript;base64,' + Buffer.from(deskBundle.outputFiles[0].text).toString('base64'));
let received = 0, requestBody: any;
const requestId = uuid();
Object.assign(globalThis, { __readTest: { begin: () => ({ requestId, generation: 4 }), receive: (request: any, value: any) => { received++; return value && value.requestId === request.requestId ? { ...value, generation: 4 } : null; } } });
const oldFetch = globalThis.fetch;
const final = { agents: { alpha: 'a', red: 'r', cio: 'c', verdict: 'wait' }, telemetry: { requestId, receipt: 'signed-receipt' } };
globalThis.fetch = async (_url, init) => { requestBody = JSON.parse(init!.body as string); return new Response(JSON.stringify(final), { headers: { 'content-type': 'application/json' } }); };
const json = await desk.runAgents('BTC', false, 'Read', new AbortController().signal);
eq([requestBody.requestId, json.telemetry.receipt, received], [requestId, 'signed-receipt', 1], 'plain JSON receipt is propagated from the actual desk transport');
globalThis.fetch = async () => new Response(JSON.stringify({ type: 'final', data: final }) + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
const ndjson = await desk.runAgents('BTC', false, 'Read', new AbortController().signal);
eq([ndjson.telemetry.receipt, received], ['signed-receipt', 2], 'NDJSON final.data receipt is propagated');
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
await desk.runAgents('BTC', false, 'Read', new AbortController().signal);
eq(received, 2, 'failed/refused response never confirms receipt');
globalThis.fetch = oldFetch;

// Compile the actual SPA entry with the actual Vite build definitions. All SDK/network IO is offline.
for (const environment of ['preview', 'production']) {
  const code = await buildEnvironment(environment, async () => {
    const config = await loadConfigFromFile({ command: 'build', mode: 'production' }, fileURLToPath(new URL('../vite.config.ts', import.meta.url)));
    assert.ok(config);
    eq(config.config.define?.__CLIENT_TELEMETRY_ENABLED__, JSON.stringify(environment !== 'preview'), 'Vite disables telemetry only in Preview builds');
    const definitions = Object.fromEntries(Object.entries(config.config.define ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/client-telemetry-browser.ts', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 'TelemetryEntry', platform: 'browser',
      define: { ...definitions, 'import.meta.env': JSON.stringify({ DEV: false }) }, plugins: [{ name: 'offline-browser-credentials', setup(b) {
        b.onResolve({ filter: /^\.\/(access-client|bobby-db-client|bobby-session|companions\/sync)$/ }, (args) => ({ path: args.path, namespace: 'offline' }));
        b.onLoad({ filter: /.*/, namespace: 'offline' }, ({ path }) => {
          if (path.endsWith('access-client')) return stub('export const accessHeaders=async()=>{globalThis.__harness.headers++;return {"x-bobby-device":"fixture-install","x-bobby-platform":"web"}};');
          if (path.endsWith('bobby-db-client')) return stub('export const bobbySupabase=()=>({auth:{onAuthStateChange:(cb)=>{globalThis.__harness.auth++;cb("INITIAL_SESSION",null)}}});');
          if (path.endsWith('bobby-session')) return stub('export const onSessionChange=()=>()=>{};');
          return stub('export const onProgressCredentialChange=()=>()=>{};');
        });
      } }] });
    return bundle.outputFiles[0].text;
  });
  const calls: string[] = [], events: Record<string, () => void> = {}, harness = { headers: 0, auth: 0 }; let pulse: (() => void) | undefined;
  const browserDocument = { visibilityState: 'visible', addEventListener: (name: string, fn: () => void) => { events[name] = fn; } };
  const context: any = { window: { setTimeout, clearTimeout, setInterval: (fn: () => void) => { pulse = fn; return 1; }, addEventListener: browserDocument.addEventListener }, document: browserDocument,
    history: { pushState() {}, replaceState() {} }, location: { hostname: 'offline-review.vercel.app', pathname: '/desk' }, crypto: webcrypto, AbortController, Promise, Date, Set, Map, __harness: harness,
    fetch: async (_url: string, init: any) => { calls.push(JSON.parse(init.body).event); return new Response(null, { status: 204 }); } };
  vm.runInNewContext(code, context); context.TelemetryEntry.startClientTelemetry(); await flush();
  const read = context.TelemetryEntry.beginClientRead();
  const confirmed = context.TelemetryEntry.receiveClientRead(read, { requestId: read.requestId, receipt: 'offline-signed-receipt' });
  context.TelemetryEntry.renderClientRead(confirmed ?? { ...read, receipt: 'offline-signed-receipt' });
  pulse?.(); browserDocument.visibilityState = 'hidden'; events.visibilitychange?.(); events.pagehide?.(); await flush();
  if (environment === 'preview') {
    eq(calls, [], 'actual Preview-compiled SPA emits no lifecycle or read events');
    eq([harness.auth, harness.headers, pulse], [0, 0, undefined], 'Preview SPA creates no auth listener, credential lookup or heartbeat timer');
  } else {
    for (const patch of [{ location: { hostname: 'bobbyprotocol.xyz', pathname: '/auth/callback' } }, { crypto: {} }]) {
      const bypassHarness = { headers: 0, auth: 0 }; let bypassTimers = 0;
      const bypassContext: any = { ...context, ...patch, __harness: bypassHarness, window: { ...context.window, setInterval: () => { bypassTimers++; return 1; } } };
      vm.runInNewContext(code, bypassContext); bypassContext.TelemetryEntry.startClientTelemetry();
      eq([bypassHarness.auth, bypassHarness.headers, bypassTimers], [0, 0, 0], 'auth callback/unsupported UUID bypass bootstrap before auth listener or timer');
    }
    ok(['foreground', 'read_started', 'read_received', 'read_rendered', 'heartbeat', 'background'].every((event) => calls.includes(event)), 'actual Production-compiled SPA preserves lifecycle and receipt reports');
    eq([context.TelemetryEntry.telemetryAllowed('localhost', '/'), context.TelemetryEntry.telemetryAllowed('bobbyprotocol.xyz', '/admin'), context.TelemetryEntry.telemetryAllowed('bobbyprotocol.xyz', '/', true)], [false, false, false], 'production gate retains localhost, admin and DEV exclusions');
  }
}

// Static bundle uses the same installation key and emits no visits or SDK traffic.
const staticCode = (await buildEnvironment('production', () => buildClientTelemetry(false))).outputFiles![0].text;
ok(staticCode.length < 14000 && !staticCode.includes('supabase'), 'static first-party bundle stays small without an auth SDK');
const staticFetches: any[] = [], staticListeners: Record<string, () => void> = {}, storage = new Map(); let heartbeat!: () => void;
const staticWindow: any = { setTimeout, clearTimeout, setInterval: (fn: () => void) => { heartbeat = fn; return 1; }, addEventListener: (name: string, fn: () => void) => { staticListeners[name] = fn; } };
const ctx: any = { window: staticWindow, document: { visibilityState: 'visible', addEventListener: (name: string, fn: () => void) => { staticListeners[name] = fn; } },
  location: { hostname: 'bobbyprotocol.xyz', pathname: '/' }, crypto: webcrypto, AbortController, Promise, Date, Set, Map,
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }, fetch: async (url: string, init: any) => { staticFetches.push({ url, init }); return new Response(null, { status: 204 }); } };
vm.runInNewContext(staticCode, ctx); await flush();
eq(staticFetches[0].url, '/api/client-telemetry', 'static home emits only to the same-origin first-party endpoint');
eq(staticFetches[0].init.headers['x-bobby-device'], staticWindow.BobbyClientTelemetry.headers()['x-bobby-device'], 'static access and reports use the same installation');
ok(staticFetches.every((r) => r.url !== '/api/track'), 'operational reporting never duplicates historical page visits');
staticListeners.pagehide(); await flush(); const afterHide = staticFetches.length; heartbeat(); await flush();
eq(staticFetches.length, afterHide, 'pagehide suspends foreground even before browser visibility changes');
staticListeners.pageshow(); await flush(); eq(JSON.parse(staticFetches.at(-1).init.body).event, 'foreground', 'bfcache restore reports visible foreground immediately');
const deniedWindow = { ...staticWindow };
const denied = { ...ctx, window: deniedWindow, localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } };
vm.runInNewContext(staticCode, denied); await flush();
eq(deniedWindow.BobbyClientTelemetry.deviceId(), deniedWindow.BobbyClientTelemetry.deviceId(), 'storage-unavailable installation fallback remains stable for the page lifetime');
const blocked = { ...ctx, location: { hostname: 'localhost', pathname: '/' } }; staticFetches.length = 0; vm.runInNewContext(staticCode, blocked); await flush();
eq(staticFetches.length, 0, 'default localhost static preview emits nothing');
const previewCode = (await buildEnvironment('preview', () => buildClientTelemetry(false))).outputFiles![0].text;
let previewTimer = 0; const previewCalls: string[] = [];
const previewContext: any = { ...ctx, location: { hostname: 'offline-review.vercel.app', pathname: '/nucleo/' },
  window: { ...staticWindow, setInterval: () => { previewTimer++; return 1; } },
  fetch: async (_url: string, init: any) => { previewCalls.push(JSON.parse(init.body).event); return new Response(null, { status: 204 }); } };
vm.runInNewContext(previewCode, previewContext);
const previewRead = previewContext.window.BobbyClientTelemetry.beginRead();
const previewReceipt = previewContext.window.BobbyClientTelemetry.received(previewRead, { requestId: previewRead.requestId, receipt: 'offline-signed-receipt' });
previewContext.window.BobbyClientTelemetry.reportVisible(previewReceipt ?? { ...previewRead, receipt: 'offline-signed-receipt' }, '#final', () => true);
await flush();
eq([previewCalls, previewTimer, previewReceipt], [[], 0, null], 'actual Preview-compiled static bundle emits no lifecycle/read events and creates no heartbeat');
eq(previewContext.window.BobbyClientTelemetry.headers()['x-bobby-platform'], 'web', 'Preview static access headers remain available without telemetry');

// Additive client cohort fields keep legacy response coverage unknown rather than globally flipping flags.
const legacy = normalizeAdminLive({ live: {} }); eq(legacy.live?.client, null, 'phase1/old response does not imply measured client telemetry');
const cw = { minutes: 15, since: now, foreground: 1, background: 0, started: 1, received: 1, rendered: 0, webviewTerminations: 0, reportedInstalls: 1, reportedAccounts: 0 };
const cp = { presence: { reportedForegroundInstalls: 1, reportedForegroundAccounts: 0, reportedForegroundSessions: 1, latestReportAt: now }, windows: { '15m': cw, '1h': cw, '24h': cw }, latest: {}, coverage: { rolloutSince: now, readStartedSince: now, readReceivedSince: now, readRenderedSince: null }, builds: [{ appVersion: '1.6', appBuild: '55', reportedInstalls24h: 1 }] };
const live = normalizeAdminLive({ live: { client: { presenceTtlSeconds: 90, coverage: { protocolVersion: 1 }, platforms: { ios: cp, web: cp } } } });
eq([live.live?.client?.platforms.ios.windows['15m'].rendered, live.live?.client?.platforms.ios.coverage.readRenderedSince], [0, null], 'zero stored rendered counts without observed channel coverage remains explicitly unmeasured');
eq(live.live?.coverage.clientRendered, false, 'new-client reports never flip legacy/global client rendering coverage');
const missingClient = normalizeAdminLive({ live: { client: { coverage: { protocolVersion: 1 }, platforms: { ios: cp, web: { ...cp, presence: {} } } } } });
ok(isMissing(missingClient.missing, 'client.platforms.web.presence.reportedForegroundInstalls'), 'omitted per-platform presence is marked missing, never silently verified zero');
const recovered = normalizeAdminLive({ live: { client: { coverage: { protocolVersion: 1 }, platforms: { ios: cp, web: cp }, health: { status: 'recovered', error: 'storage_unavailable', lastErrorAt: now, lastReportAt: '2026-10-03T12:01:00Z', authenticated: true, recovered: true } } } });
eq([recovered.live?.client?.health?.status, recovered.live?.client?.health?.error], ['recovered', 'storage_unavailable'], 'recovery preserves historical error without relabeling it current failure');
const accounts = normalizeOverview({ overview: { accounts: { byProvider: { apple: 1, twitter: 2, other: 3, unknown: 4 } } } });
eq(accounts.overview?.accounts.byProvider, { apple: 1, twitter: 2, other: 3, unknown: 4 }, 'verified provider distribution keeps Twitter, other and unknown account counts');
eq([label('twitter'), label('other'), label('unknown')], ['Twitter / X', 'Otro proveedor', 'Sin dato'], 'non-Apple/Google providers retain truthful labels');
console.log(`test-client-telemetry-ui: ${checks} checks passed`);
