// Offline regressions for the dashboard's observation clocks and polling load.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { adminReadMeta, observeAdminSource, withAdminRead } from '../api/_lib/admin-read.ts';
import { normalizeAdminMeta } from '../src/lib/admin-client.ts';
import { LIVE_REFRESH_MS, CORE_REFRESH_MS, PROVIDER_REFRESH_MS, sourceNow, sourceState } from '../src/components/admin/bobby/live.ts';

let checks = 0;
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (actual: unknown, label: string) => { assert.ok(actual, label); checks++; };
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
try {
  const snapshotAt = new Date(now - 12_000).toISOString();
  const server = await withAdminRead(async () => {
    await observeAdminSource('live', async () => ({ snapshotAt, windows: {} }));
    now += 3_000; // Another source finishes after the SQL aggregate.
    return adminReadMeta();
  });
  eq(server.sources.live.fetchedAt, snapshotAt, 'SQL snapshot time is retained instead of response completion');
  eq(server.sources.live.cacheAgeMs, 15_000, 'source age includes time spent completing the other sources');
  eq(server.durationMs, 3_000, 'response latency and source observation age are different clocks');
  eq(server.partial, false, 'a fully observed source remains complete');

  const startedAt = now;
  const conservative = await withAdminRead(async () => {
    await observeAdminSource('overview', async () => { now += 4_000; return { accounts: {} }; });
    return adminReadMeta();
  });
  eq(conservative.sources.overview.fetchedAt, new Date(startedAt).toISOString(), 'sources without their own clock use the read start');
  eq(conservative.sources.overview.cacheAgeMs, 4_000, 'read latency cannot freshen an unstamped aggregate');

  const gaps = await withAdminRead(async () => {
    await observeAdminSource('apple', async () => ({ configured: false }));
    await observeAdminSource('badClock', async () => ({ fetchedAt: 'not a date' }));
    return adminReadMeta();
  });
  eq(gaps.partial, true, 'an unconfigured source or unknown observation time is incomplete coverage');
  eq([gaps.sources.apple.fetchedAt, gaps.sources.badClock.fetchedAt], [null, null], 'unconfigured and invalid clocks never become fresh response times');

  const fetchedAt = new Date(now - 15 * 60_000).toISOString();
  const cache = await withAdminRead(async () => {
    await observeAdminSource('searchConsole', async () => ({ fetchedAt, cacheTtlMs: 30 * 60_000, coveredTo: '2026-10-03' }));
    return adminReadMeta();
  });
  const normalized = normalizeAdminMeta(cache)!;
  eq(normalized.sources.searchConsole.fetchedAt, fetchedAt, 'client normalization preserves cached provider age');
  eq(normalized.sources.searchConsole.cacheTtlMs, 30 * 60_000, 'client preserves the explicit upstream cache policy');
  eq(sourceState(normalized.sources.searchConsole, 10 * 60_000, sourceNow(normalized)), 'fresh', 'a valid Google cache follows its stated policy');
  eq(sourceState(normalized.sources.searchConsole, 10 * 60_000, sourceNow(normalized, normalized.receivedAt! + 16 * 60_000)), 'stale', 'cache expiry cannot be extended by receiving a later response');
  const partialCache = { ...normalized.sources.searchConsole, status: 'partial' as const };
  eq(sourceState(partialCache, 10 * 60_000, sourceNow(normalized)), 'partial', 'a timely but incomplete report retains its coverage warning');
  eq(sourceState(partialCache, 10 * 60_000, sourceNow(normalized, normalized.receivedAt! + 16 * 60_000)), 'stale', 'partial coverage does not conceal an expired cached report');

  const oldestReportAt = new Date(now - 60 * 24 * 60 * 60_000).toISOString();
  const apple = await withAdminRead(async () => {
    await observeAdminSource('appStore', async () => ({ fetchedAt: new Date(now).toISOString(), oldestReportAt, coveredTo: '2026-10-03' }));
    return adminReadMeta();
  });
  const appleMeta = normalizeAdminMeta(apple)!;
  eq(appleMeta.sources.appStore.oldestReportAt, oldestReportAt, 'old historical Apple reports keep their original cache validation time');
  eq(appleMeta.sources.appStore.cacheAgeMs, 60 * 24 * 60 * 60_000, 'cache age tracks the content rather than the fresh cache retrieval');
  eq(sourceState(appleMeta.sources.appStore, 10 * 60_000, sourceNow(appleMeta)), 'fresh', 'consulting valid historical reports does not invalidate the selected range');

  const malformed = normalizeAdminMeta({ generatedAt: 'bad', durationMs: -20, partial: false, sources: {
    appStore: { status: 'not_configured', fetchedAt: new Date(now).toISOString() },
    unknown: { status: 'unexpected', fetchedAt: 'bad', cacheAgeMs: -1, cacheTtlMs: -1, missingDays: ['2026-10-03', 42] },
  } })!;
  eq([malformed.generatedAt, malformed.durationMs, malformed.partial], [null, null, true], 'malformed metadata cannot claim complete, fresh coverage');
  eq(malformed.sources.appStore.fetchedAt, null, 'not configured cannot acquire an observation timestamp from malformed data');
  eq([malformed.sources.unknown.status, malformed.sources.unknown.cacheAgeMs, malformed.sources.unknown.cacheTtlMs, malformed.sources.unknown.missingDays], ['error', undefined, undefined, ['2026-10-03']], 'invalid source status, negative durations and malformed days are withheld');
  eq([LIVE_REFRESH_MS, CORE_REFRESH_MS, PROVIDER_REFRESH_MS], [15_000, 30_000, 300_000], 'live, aggregates and external reports have separate cadences');

  // Execute the actual hook with deterministic time, React state slots and visibility events.
  type Effect = { run: () => void | (() => void); dependencies?: unknown[]; cleanup?: () => void };
  const slots: unknown[] = [], effects = new Map<number, Effect>(), queued: number[] = [];
  let cursor = 0;
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const harness = {
    useRef(value: unknown) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (next: unknown) => {
      slots[i] = typeof next === 'function' ? (next as (value: unknown) => unknown)(slots[i]) : next;
    }]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, old = slots[i] as { fn: unknown; deps: unknown[] } | undefined;
      if (!old || !same(old.deps, deps)) slots[i] = { fn, deps }; return (slots[i] as typeof old)!.fn; },
    useEffect(run: Effect['run'], deps?: unknown[]) { const i = cursor++, old = effects.get(i);
      if (!old || !same(old.dependencies, deps)) { queued.push(i); effects.set(i, { run, dependencies: deps, cleanup: old?.cleanup }); } },
  };
  const listeners = new Set<() => void>(), timers = new Set<() => void>();
  const documentMock = { visibilityState: 'visible', addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  Object.assign(globalThis, { __adminHooks: harness, document: documentMock, window: {
    setInterval: (fn: () => void) => { timers.add(fn); return fn; }, clearInterval: (fn: () => void) => timers.delete(fn),
  } });
  try {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/components/admin/bobby/useLoad.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node',
      plugins: [{ name: 'controlled-react', setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hooks' }));
        b.onLoad({ filter: /.*/, namespace: 'hooks' }, () => ({ contents: 'export const {useState,useRef,useCallback,useEffect} = globalThis.__adminHooks;', loader: 'js' }));
        b.onResolve({ filter: /^@\/lib\/admin-client$/ }, () => ({ path: 'errors', namespace: 'errors' }));
        b.onLoad({ filter: /.*/, namespace: 'errors' }, () => ({ contents: 'export class AdminError extends Error { constructor(status,code,message){ super(message);this.status=status;this.code=code; } }', loader: 'js' }));
      } }] });
    const { useLoad } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const requests: Array<{ signal: AbortSignal; resolve: (value: string) => void }> = [];
    let key = 'provider|30';
    const Render = () => { cursor = 0; const result = useLoad((signal: AbortSignal) => new Promise<string>((resolve) => requests.push({ signal, resolve })), key, { intervalMs: PROVIDER_REFRESH_MS });
      while (queued.length) { const effect = effects.get(queued.shift()!)!; effect.cleanup?.(); const cleanup = effect.run(); effect.cleanup = typeof cleanup === 'function' ? cleanup : undefined; } return result; };
    const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
    let state = Render(); await flush(); requests[0].resolve('A'); await flush(); state = Render();
    now += 10_000;
    documentMock.visibilityState = 'hidden'; for (const fn of timers) fn(); await flush();
    eq(requests.length, 1, 'hidden provider tab sends no scheduled request');
    documentMock.visibilityState = 'visible'; for (const fn of listeners) fn(); await flush();
    eq(requests.length, 1, 'briefly returning to providers does not bypass their five minute cadence');
    now += PROVIDER_REFRESH_MS;
    for (const fn of listeners) fn(); await flush();
    eq(requests.length, 2, 'returning after the cadence expires refreshes immediately');
    void state.reload(true); for (const fn of timers) fn(); await flush();
    eq(requests.length, 2, 'visibility, interval and manual reload deduplicate one in-flight request');
    requests[1].resolve('B'); await flush(); state = Render();
    void state.reload(true); await flush();
    eq(requests.length, 3, 'manual refresh bypasses the normal provider waiting period');
    key = 'provider|7'; state = Render(); await flush();
    ok(requests[2].signal.aborted, 'changing period aborts the old request');
    requests[3].resolve('C'); await flush(); requests[2].resolve('late old B'); await flush(); state = Render();
    eq([state.data, state.dataKey], ['C', 'provider|7'], 'an old period response cannot replace the current period');
    for (const effect of effects.values()) effect.cleanup?.();
    eq([timers.size, listeners.size], [0, 0], 'unmount removes provider polling and visibility listeners');
  } finally {
    Object.assign(globalThis, { window: oldWindow, document: oldDocument });
    delete (globalThis as Record<string, unknown>).__adminHooks;
  }
} finally { Date.now = realNow; }

console.log(`admin-compass-refresh: ${checks} checks passed (offline; no production requests)`);
