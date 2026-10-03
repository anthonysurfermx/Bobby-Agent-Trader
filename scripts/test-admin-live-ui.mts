// The owner dashboard's pure UI layer after the r2 truth audit: the normalizers keep "not sent" apart from zero
// (F17, F01), deltas never compare days whose coverage is unknown (F17), cost dates and the reads caption follow
// UTC and the team switch (F18), the commercial class is named apart from access (F01), a $0 balance mark never
// heals a credit alert (F07), and the dev fixtures (?mock, ?mock=bare, ?mock=partial) agree with that contract.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { normalizeOverview, normalizeGrowth, normalizeLifecycle, normalizeAudience, normalizeMembers, normalizeUser, isMissing } = await import('../src/lib/admin-client.ts');
const { compareSeries, windowDelta } = await import('../src/components/admin/bobby/deltas.ts');
const { todayUtc, teamReadsCaption, teamOut, geoText, teamReason, commercialLabel, fmtDays } = await import('../src/components/admin/bobby/format.ts');
const { llmProviderState, integrationChecks } = await import('../src/components/admin/bobby/health.ts');
const { mockAdminFetch } = await import('../src/components/admin/bobby/mock.ts');
const { normalizeAdminMeta, normalizeAdminIntegrations, normalizeAdminLive } = await import('../src/lib/admin-client.ts');
const { sourceState, mergeProviderSnapshots, composeAudience, composeOverview, CORE_REFRESH_MS, PROVIDER_REFRESH_MS } = await import('../src/components/admin/bobby/live.ts');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

// ---------------------------------------------------------------- fixtures
const DAYS = Array.from({ length: 14 }, (_, i) => `2026-09-${String(17 + i).padStart(2, '0')}`).concat(['2026-10-01']).slice(-14);
const series = (v: number) => DAYS.map(() => v);
function rawOverview(extra: { subscriptions?: Record<string, unknown>; revenue?: Record<string, unknown>; coverage?: unknown; deskRuns?: Record<string, unknown>; root?: Record<string, unknown> } = {}) {
  return {
    overview: {
      days: DAYS, since: DAYS[0], includeInternal: false,
      accounts: { total: 10, new: 2, internal: 1, wallets: 0, active7d: 3, byProvider: { apple: 10 }, daily: series(1) },
      activity: {
        reads: 140, readsInternal: 0, readsDaily: { web: series(6), ios: series(4), android: series(0) }, levels: {}, activeReaders7d: 4,
        activeReaders7dSplit: { accounts: 2, guests: 2 }, lastRead: {}, activation: { accounts: 2, activated: 1, medianMinutes: null, measuredSince: null, beforeCoverage: 0 },
      },
      funnel: { web: { visitors: 9, deskVisitors: 4, appStoreClicks: 1, signinStarts: 1, paywallViews: 0 }, ios: { paywallViews: 0 }, visitsDaily: series(9), topSurfaces: [], topReferrers: [] },
      subscriptions: { active: 1, paid: 0, trialing: 0, byStatus: { active: 1 }, byProvider: { apple: 1 }, giftedPro: 0, ...extra.subscriptions },
      revenue: {
        grossUsd: 0, netUsd: 0, refundsUsd: 0, unattributedGrossUsd: 0, unattributedEvents: 0, unattributedRefundsUsd: 0, unattributedNetUsd: 0, unconvertedEvents: 0,
        newSubscriptions: 0, newPaying: 0, renewals: 0, cancellations: 0, expirations: 0,
        sandboxEvents: 0, internalEvents: 0, daily: series(5), ...extra.revenue,
      },
      llm: {
        providers: { anthropic: {}, openai: {} }, daily: DAYS.map(() => ({ anthropic: 1, openai: 1 })), bySurface: [],
        deskRuns: { runs: 10, finished: 8, byDay: [], ...extra.deskRuns }, guard: { day: 1, month: 2 },
      },
      coupons: { active: 0, redemptions: 0, giftedReadsLeft: 0 },
      coverage: extra.coverage === undefined
        ? { eventsSince: '2026-09-01T00:00:00Z', readsSince: '2026-09-01T00:00:00Z', purchasesSince: '2026-09-01T00:00:00Z', ledgerSince: '2026-09-01T00:00:00Z', ledgerSurfaces: ['desk'] }
        : extra.coverage,
    },
    integrations: { revenuecat: { configured: false }, appStore: { configured: false }, llmCaps: {}, health: null, paywall: true, missing: [] },
    growth: null, insights: [], ...extra.root,
  };
}

// Operational snapshots preserve missing coverage and partial source failures; polling never invents health.
{
  const get = async (view: string, mode = 'admin') => (await mockAdminFetch(mode, 'GET', new URLSearchParams({ view, days: '30' }))).json();
  const live = normalizeAdminLive(await get('live'));
  ok(live.live?.snapshotAt && live.live.windows['15m'].web.completed > 0, 'live: server snapshot and actual emitted count');
  eq(live.live?.coverage.clientRendered, false, 'live: server completion never becomes client rendering evidence');
  eq(live.live?.coverage.onlinePresence, false, 'live: observed devices never become online people');
  eq(live.missing, [], 'live: fixture supplies all required operational fields');
  const bare = normalizeAdminLive(await get('live', 'bare'));
  eq(bare.live?.coverage.outcomeCoverageSince, null, 'live: no records has unknown observed coverage');
  eq(normalizeAdminLive({ live: {} }).missing.includes('windows'), true, 'live: missing windows recorded, never silent zero');
  eq(normalizeAdminLive({}).live, null, 'live: omitted RPC is unavailable');
  const meta = normalizeAdminMeta({ generatedAt: '2026-10-03T09:00:00Z', durationMs: '18', partial: false, sources: {
    overview: { status: 'ok', fetchedAt: '2026-10-03T09:00:00Z' }, growth: { status: 'error', fetchedAt: null, error: 'timeout' },
  } })!;
  eq([meta.durationMs, meta.sources.growth.status], [18, 'error'], 'metadata: latency numeric strings and partial failures are preserved');
  eq(sourceState(meta.sources.overview, 90_000, Date.parse('2026-10-03T09:00:45Z')), 'fresh', 'fresh only within its source freshness window');
  eq(sourceState(meta.sources.overview, 90_000, Date.parse('2026-10-03T09:02:00Z')), 'stale', 'old source reports stale');
  eq(sourceState({ status: 'ok', fetchedAt: null }, 90_000), 'unknown', 'successful response without timestamp remains unverified freshness');
  const prior = normalizeAdminIntegrations(await get('integrations'));
  const failed = normalizeAdminIntegrations({ integrations: { appStore: { configured: true, error: 'timeout' }, revenuecat: { configured: true, error: '429' } }, searchConsole: null,
    meta: { generatedAt: '2026-10-03T09:10:00Z', partial: true, sources: { appStore: { status: 'error', fetchedAt: null, error: 'timeout' }, revenuecat: { status: 'error', fetchedAt: null, error: '429' }, searchConsole: { status: 'error', fetchedAt: null } } } });
  const kept = mergeProviderSnapshots(prior, failed);
  eq(kept.integrations.appStore.totals, prior.integrations.appStore.totals, 'provider error retains previous report values');
  eq(kept.meta?.sources.appStore.fetchedAt, prior.meta?.sources.appStore.fetchedAt, 'provider error retains original report timestamp');
  eq(kept.meta?.sources.appStore.status, 'error', 'provider retained report is visibly an error snapshot');
  eq(kept.searchConsole?.totals, prior.searchConsole?.totals, 'provider failure retains prior Search Console facts');
  eq(kept.searchConsole?.error, 'source_unavailable', 'Search Console retains the latest read failure beside its prior facts');
  const gaps = normalizeAdminIntegrations({ integrations: { appStore: { configured: true, downloads: [2, null, 0], totals: null }, revenuecat: { configured: false } } });
  eq(gaps.integrations.appStore.downloads, [2, null, 0], 'Apple pending day remains null, distinct from observed zero');
  eq(gaps.integrations.appStore.totals, undefined, 'Apple no published report is never total zero');
  const search = normalizeAdminIntegrations({ integrations: {}, searchConsole: { configured: true, clicks: [0, null, 2], impressions: [3, null, 8], partial: true,
    incompleteDays: ['2026-10-02'], missingDays: ['2026-10-01'], timeZone: 'America/Los_Angeles' } });
  eq(search.searchConsole?.clicks, [0, null, 2], 'Google zero is observed; absent daily row remains null');
  eq([search.searchConsole?.partial, search.searchConsole?.incompleteDays], [true, ['2026-10-02']], 'Google provisional coverage survives normalization');
  eq(commercialLabel('unverified', 'unknown_period'), 'Sin verificar · periodo sin verificar', 'membership unknown period is explicit');
  eq([CORE_REFRESH_MS, PROVIDER_REFRESH_MS], [30_000, 300_000], 'first-party fast and external provider slow cadence');
  const core = normalizeAudience({ geo: {}, appStore: null, searchConsole: null });
  const combined = composeAudience(core, { providersLoaded: true, integrations: prior.integrations, searchConsole: prior.searchConsole } as never);
  ok(!isMissing(combined.missing, 'appStore'), 'audience composes deferred provider data from the shared provider response');
  const observed = normalizeOverview(await get('overview'));
  const fresh = composeOverview(observed, prior);
  ok(fresh.insights.some((i) => i.id === 'credit-openai'), 'shared rules keep recorded LLM evidence as deterministic findings');
  const oldCore = { ...observed, meta: { ...observed.meta!, sources: { ...observed.meta!.sources, overview: { status: 'error' as const, fetchedAt: observed.meta!.generatedAt } } } };
  const uncertain = composeOverview(oldCore, prior);
  eq([uncertain.insights, uncertain.insightsUnavailable], [[], true], 'failed core refresh cannot diagnose current state from retained old values');
  const providerFailure = mergeProviderSnapshots(prior, { ...prior, meta: { ...prior.meta!, sources: Object.fromEntries(Object.entries(prior.meta!.sources).map(([k, v]) => [k, { ...v, status: 'error' as const }])) } });
  const safe = composeOverview(observed, providerFailure);
  ok(!safe.insights.some((i) => ['web-cannot-pay', 'ios-gap', 'appstore-country', 'gsc-visibility'].includes(i.id) || i.id.startsWith('gsc-ctr-')), 'failed providers do not produce fresh diagnoses from retained aggregates');
  ok(safe.insights.some((i) => i.id === 'paywall-off'), 'current core environment configuration remains authoritative when providers fail');
  eq(integrationChecks(safe.integrations, safe.searchConsole, safe.overview).find((r) => r.id === 'rcMetrics')?.status, 'error', 'retained RevenueCat values cannot claim a current successful connection after a failed refresh');
  eq(integrationChecks({ ...prior.integrations, revenuecat: { configured: true } }, null).find((r) => r.id === 'rcMetrics')?.status, 'warn', 'configured RevenueCat without a confirmed query stays unverified');
  const unattributed = normalizeOverview(rawOverview({ revenue: { unattributedGrossUsd: '7.99', unattributedEvents: '2', unattributedRefundsUsd: '2.99', unattributedNetUsd: '5' } }));
  eq([unattributed.overview.revenue.unattributedGrossUsd, unattributed.overview.revenue.unattributedEvents, unattributed.overview.revenue.unattributedRefundsUsd, unattributed.overview.revenue.unattributedNetUsd], [7.99, 2, 2.99, 5], 'money awaiting identity reconciliation remains separate from external totals');
  const legacyMoney = rawOverview();
  delete (legacyMoney.overview.revenue as Record<string, unknown>).unattributedEvents;
  ok(isMissing(normalizeOverview(legacyMoney).overview.missing, 'revenue.unattributedEvents'), 'omitted unattributed evidence is unknown, never a verified zero');
  const unownedCore = { ...observed, overview: { ...observed.overview, subscriptions: { ...observed.overview.subscriptions, paidVerified: 0, unverified: 0 }, revenue: { ...observed.overview.revenue, grossUsd: 0, unattributedGrossUsd: 7.99, unattributedEvents: 2 } } };
  const unownedFindings = composeOverview(unownedCore, prior).insights;
  ok(unownedFindings.some((i) => i.id === 'revenue-unattributed'), 'unattributed records produce an actionable reconciliation finding');
  ok(!unownedFindings.some((i) => i.id === 'no-payers'), 'external zero cannot diagnose no money when unattributed receipts exist');
  eq(normalizeOverview(rawOverview({ revenue: { unconvertedEvents: '3' } })).overview.revenue.unconvertedEvents, 3, 'missing USD price is an explicit pending amount count, without guessed FX');
  const pendingUsd = { ...unownedCore, overview: { ...unownedCore.overview, revenue: { ...unownedCore.overview.revenue, unattributedEvents: 0, unattributedGrossUsd: 0, unconvertedEvents: 2 } } };
  const pendingFindings = composeOverview(pendingUsd, prior).insights;
  ok(pendingFindings.some((i) => i.id === 'revenue-unconverted') && !pendingFindings.some((i) => i.id === 'no-payers'), 'events lacking a confirmed USD amount require reconciliation instead of a no-payment diagnosis');
  const missingUsd = { ...pendingUsd, overview: { ...pendingUsd.overview, missing: [...pendingUsd.overview.missing, 'revenue.unconvertedEvents'] } };
  ok(!composeOverview(missingUsd, prior).insights.some((i) => i.id === 'no-payers'), 'unknown USD reconciliation coverage cannot support a no-payment diagnosis');
}

// Run the real useLoad hook with controlled React hooks and browser scheduling. No network, timers or paid AI.
{
  type Effect = { run: () => void | (() => void); dependencies?: unknown[]; cleanup?: () => void };
  const slots: unknown[] = [], effects = new Map<number, Effect>();
  let cursor = 0, setters = 0;
  const queued: number[] = [];
  const equalDeps = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const harness = {
    useRef(value: unknown) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (next: unknown) => {
      setters++; slots[i] = typeof next === 'function' ? (next as (v: unknown) => unknown)(slots[i]) : next;
    }]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, old = slots[i] as { fn: unknown; deps: unknown[] } | undefined;
      if (!old || !equalDeps(old.deps, deps)) slots[i] = { fn, deps }; return (slots[i] as typeof old)!.fn; },
    useEffect(run: Effect['run'], deps?: unknown[]) { const i = cursor++, old = effects.get(i);
      if (!old || !equalDeps(old.dependencies, deps)) { queued.push(i); effects.set(i, { run, dependencies: deps, cleanup: old?.cleanup }); } },
  };
  const listeners = new Set<() => void>(), timers = new Set<() => void>();
  const documentMock = { visibilityState: 'visible', addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  Object.assign(globalThis, { __adminHooks: harness, document: documentMock, window: {
    setInterval: (fn: () => void) => { timers.add(fn); return fn; }, clearInterval: (fn: () => void) => timers.delete(fn),
  } });
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/components/admin/bobby/useLoad.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'controlled-react', setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hooks' }));
      b.onLoad({ filter: /.*/, namespace: 'hooks' }, () => ({ contents: 'export const {useState,useRef,useCallback,useEffect} = globalThis.__adminHooks;', loader: 'js' }));
      b.onResolve({ filter: /^@\/lib\/admin-client$/ }, () => ({ path: 'errors', namespace: 'errors' }));
      b.onLoad({ filter: /.*/, namespace: 'errors' }, () => ({ contents: 'export class AdminError extends Error { constructor(status,code,message){ super(message);this.status=status;this.code=code; } }', loader: 'js' }));
    } }] });
  const { useLoad: useControlledLoad } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const requests: Array<{ key: string; signal: AbortSignal; resolve: (v: string) => void; reject: (e: Error) => void }> = [];
  let key = '30|ext';
  const RenderHarness = () => { cursor = 0; const result = useControlledLoad((signal: AbortSignal) => new Promise<string>((resolve, reject) => requests.push({ key, signal, resolve, reject })), key, { intervalMs: 30_000 });
    while (queued.length) { const effect = effects.get(queued.shift()!)!; effect.cleanup?.(); const cleanup = effect.run(); effect.cleanup = typeof cleanup === 'function' ? cleanup : undefined; } return result; };
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  let state = RenderHarness(); await flush();
  eq(requests.length, 1, 'hook: mount starts one request');
  void state.reload(true); void state.reload(true); await flush();
  eq(requests.length, 1, 'hook: concurrent reloads share the active request');
  requests[0].resolve('snapshot A'); await flush(); state = RenderHarness();
  eq([state.data, state.dataKey, state.loading], ['snapshot A', '30|ext', false], 'hook: confirmed response committed for its own range/filter');
  void state.reload(true); await flush(); state = RenderHarness();
  eq([state.data, state.loading], ['snapshot A', true], 'hook: background refresh visibly loads while retaining old data');
  requests[1].reject(new Error('network unavailable')); await flush(); state = RenderHarness();
  eq([state.data, state.error.message, state.loading], ['snapshot A', 'network unavailable', false], 'hook: refresh failure retains data and exposes error');
  documentMock.visibilityState = 'hidden'; for (const tick of timers) tick(); await flush();
  eq(requests.length, 2, 'hook: hidden document skips scheduled refresh');
  documentMock.visibilityState = 'visible'; for (const tick of listeners) tick(); await flush();
  eq(requests.length, 3, 'hook: visibility return refreshes once');
  key = '7|all'; state = RenderHarness(); await flush();
  eq(requests[2].signal.aborted, true, 'hook: range/team switch aborts previous request');
  eq(state.stale, true, 'hook: previous range cannot masquerade as selected range');
  requests[3].resolve('snapshot B'); await flush(); state = RenderHarness();
  requests[2].resolve('late old snapshot'); await flush(); state = RenderHarness();
  eq([state.data, state.dataKey], ['snapshot B', '7|all'], 'hook: late old response cannot overwrite current period/filter');
  void state.reload(true); await flush();
  for (const effect of effects.values()) effect.cleanup?.();
  eq(requests[4].signal.aborted, true, 'hook: unmount aborts request');
  const writesBefore = setters; requests[4].resolve('after unmount'); await flush();
  eq(setters, writesBefore, 'hook: unmount prevents late state publication');
  eq([timers.size, listeners.size], [0, 0], 'hook: cleanup removes all polling and visibility listeners');
  Object.assign(globalThis, { window: oldWindow, document: oldDocument });
  delete (globalThis as Record<string, unknown>).__adminHooks;
}


// ---------------------------------------------------------------- F01 · normalizeOverview: access vs verified payers
{
  // An older server (no commercial keys): the verified figures are unknown ("—"), never a zero.
  const old = normalizeOverview(rawOverview());
  ok(isMissing(old.overview.missing, 'subscriptions.paidVerified'), 'F01: absent paidVerified is recorded as missing');
  ok(isMissing(old.overview.missing, 'subscriptions.unverified'), 'F01: absent unverified is missing');
  ok(isMissing(old.overview.missing, 'subscriptions.test'), 'F01: absent test is missing');
  ok(isMissing(old.overview.missing, 'subscriptions.byEnvironment'), 'F01: absent byEnvironment is missing');
  ok(isMissing(old.overview.missing, 'revenue.payingInPeriod'), 'F13: absent payingInPeriod is missing');
  ok(isMissing(old.overview.missing, 'revenue.unknownEnvEvents'), 'F01: absent unknownEnvEvents is missing');
  ok(!isMissing(old.overview.missing, 'subscriptions.active'), 'access count is still read');
  eq(old.overview.llm.deskRuns.lastFinishedAt, null, 'F02: absent lastFinishedAt is null');
  eq(old.internalMarkFailed, false, 'F10: a response without the flag is not a failed mark');

  // The r2 server: Postgres numerics may arrive as strings.
  const r2 = normalizeOverview(rawOverview({
    subscriptions: {
      paid: 0, paidVerified: '0', unverified: '1', test: 0, unverifiedReasons: { unknown_environment: '1', no_charge: 0, unknown_period: 0 },
      testReasons: { sandbox: 0, trial: 0 }, byEnvironment: { unknown: '1' },
    },
    revenue: { payingInPeriod: '1', unknownEnvEvents: 2 },
    deskRuns: { lastFinishedAt: '2026-10-02T11:00:00Z', lastUnfinishedAt: '2026-10-02T10:00:00Z' },
    root: { internalMarkFailed: true },
  }));
  const s = r2.overview.subscriptions;
  eq([s.active, s.paidVerified, s.unverified, s.test], [1, 0, 1, 0], 'F01: one live membership, unverified, no verified payer');
  eq(s.unverifiedReasons, { unknown_environment: 1, no_charge: 0, unknown_period: 0 }, 'F01: unverified reasons');
  eq(s.testReasons, { sandbox: 0, trial: 0 }, 'F01: test reasons');
  eq(s.byEnvironment, { unknown: 1 }, 'F01: live subscriptions by environment');
  eq([r2.overview.revenue.payingInPeriod, r2.overview.revenue.unknownEnvEvents], [1, 2], 'F13/F01: payingInPeriod and unknown-environment events');
  eq(r2.overview.llm.deskRuns.lastFinishedAt, '2026-10-02T11:00:00Z', 'F02: lastFinishedAt');
  eq(r2.overview.llm.deskRuns.lastUnfinishedAt, '2026-10-02T10:00:00Z', 'F02: lastUnfinishedAt');
  eq(r2.internalMarkFailed, true, 'F10: the failed mark reaches the page');
  for (const path of ['subscriptions.paidVerified', 'subscriptions.unverified', 'subscriptions.test', 'subscriptions.unverifiedReasons', 'subscriptions.byEnvironment', 'revenue.payingInPeriod']) {
    ok(!isMissing(r2.overview.missing, path), `F01: ${path} is not missing when sent`);
  }

  // The credit alert carries whether Resend accepted the owner's email (accepted is not delivered).
  const withEmail = normalizeOverview({ ...rawOverview(), overview: { ...rawOverview().overview, llm: { ...rawOverview().overview.llm, providers: {
    anthropic: {}, openai: { lastCreditAlert: '2026-10-02T10:00:00Z', creditAlert: { code: 'insufficient_quota', endpoint: 'desk', email: { accepted: false, error: 'not_configured' } } },
  } } } });
  eq(withEmail.overview.llm.providers.openai.creditAlert?.email, { accepted: false, id: null, error: 'not_configured' }, 'D6: credit alert email result');
  eq(withEmail.overview.llm.providers.anthropic.creditAlert, null, 'no alert, no payload');
}

// ---------------------------------------------------------------- growth: abandoned and verified Pro are unknown when absent
{
  const base = { people: { stages: {} }, outcomes: { delivered: 3, failed: 1 } };
  const old = normalizeGrowth(base)!;
  eq(old.outcomes.abandoned, null, 'F11: absent abandoned is unknown, not 0');
  eq(old.people.proPaidVerified, null, 'F01: absent proPaidVerified is unknown');
  const r2 = normalizeGrowth({ people: { stages: { pro: 2 }, proPaidVerified: '0', proInactivePaid: 0 }, outcomes: { delivered: 3, failed: 1, abandoned: '2' } })!;
  eq([r2.outcomes.abandoned, r2.outcomes.failed], [2, 1], 'F11: abandoned is read apart from failed');
  eq([r2.people.stages.pro, r2.people.proPaidVerified, r2.people.proInactivePaid], [2, 0, 0], 'F01: Pro access vs verified paid');
}

// ---------------------------------------------------------------- F01 / F08 · normalizeMembers
{
  const m = normalizeMembers({
    includeInternal: false,
    subscriptions: [
      { identityId: 'a', email: 'a@x.com', provider: 'apple', status: 'active', active: true, environment: 'unknown', periodType: 'unknown', storeCheckedAt: null,
        commercial: 'unverified', commercialReason: 'unknown_environment', firstChargeAt: '2026-10-01T10:00:00Z', lastChargeAt: '2026-10-01T10:00:00Z', internal: false },
      { identityId: 'b', provider: 'apple', status: 'active', active: true, environment: 'production', periodType: 'normal', storeCheckedAt: '2026-10-02T09:00:00Z',
        commercial: 'paid', commercialReason: null, firstChargeAt: '2026-08-01T00:00:00Z', internal: false },
      { identityId: 'c', provider: 'stripe', status: 'active', commercial: 'bogus', commercialReason: 'bogus' },
    ],
    grants: [{ identityId: 'g', source: 'admin', proUntil: '2027-01-01T00:00:00Z', active: true, internal: false }],
    excluded: { subscriptions: '1', grants: 0 },
    totals: { live: 2, paidVerified: 1, unverified: 1, test: 0 },
    internalMarkFailed: false,
  });
  const [a, b, c] = m.subscriptions;
  eq([a.commercial, a.commercialReason, a.environment, a.periodType, a.storeCheckedAt], ['unverified', 'unknown_environment', 'unknown', 'unknown', null], 'F01: unverified row');
  eq([a.firstChargeAt, a.internal], ['2026-10-01T10:00:00Z', false], 'F01: charge evidence and team flag');
  eq([b.commercial, b.commercialReason, b.storeCheckedAt], ['paid', null, '2026-10-02T09:00:00Z'], 'F01: verified paid row');
  eq([c.commercial, c.commercialReason], [null, null], 'an unknown class is not guessed');
  eq(m.excluded, { subscriptions: 1, grants: 0 }, 'F08: team rows left out are counted');
  eq(m.totals, { live: 2, paidVerified: 1, unverified: 1, test: 0 }, 'F01: totals over the returned rows');
  eq([m.includeInternal, m.grants[0].internal, m.missing], [false, false, []], 'F08: mode and nothing missing');
  const old = normalizeMembers({ subscriptions: [{ identityId: 'a', status: 'active', active: true }], grants: [] });
  eq(old.subscriptions[0].commercial, null, 'F01: an old server row has no class (shown "—")');
  ok(isMissing(old.missing, 'totals.paidVerified') && isMissing(old.missing, 'excluded'), 'F08: absent totals / excluded are missing, not 0');
  ok(isMissing(normalizeMembers({}).missing, 'subscriptions'), 'an empty body is not "no subscriptions"');
}

// ---------------------------------------------------------------- F17 · normalizeAudience
{
  const empty = normalizeAudience({});
  ok(empty.missing.includes('geo'), 'F17: HTTP 200 without geo ⇒ missing ⊇ geo');
  ok(isMissing(empty.missing, 'geo.web.located'), 'F17: located visitors unknown, not 0');
  ok(empty.missing.includes('searchConsole') && empty.missing.includes('appStore'), 'F17: absent providers are missing, not "not connected"');

  const noLocated = normalizeAudience({ geo: { web: { devices: 3, measurable: 3, located: 2 }, countries: [], regions: [], purchases: [], purchasesSince: null }, searchConsole: { configured: false }, appStore: { configured: true, countries: [], partial: true, missingDays: ['2026-09-01', '2026-09-02'] } });
  ok(isMissing(noLocated.missing, 'geo.web.beforeLocation') && isMissing(noLocated.missing, 'geo.located'), 'F17: each absent field is missing');
  ok(!isMissing(noLocated.missing, 'geo.web.located'), 'a sent field is not missing');
  eq(noLocated.geo.purchasesSince, null, 'F01: purchasesSince null = no purchase event ever (measured fact)');
  ok(!isMissing(noLocated.missing, 'geo.purchasesSince'), 'F01: null purchasesSince was sent');
  eq([noLocated.appStore.partial, noLocated.appStore.missingDays], [true, ['2026-09-01', '2026-09-02']], 'F16: Apple partial and its missing days');
  ok(isMissing(normalizeAudience({ geo: { web: {}, countries: [], regions: [], purchases: [] } }).missing, 'geo.purchasesSince'), 'F01: absent purchasesSince is unknown, not "never"');
  eq(normalizeAudience({ internalMarkFailed: true }).internalMarkFailed, true, 'F10: audience carries the flag');
}

// ---------------------------------------------------------------- F12 / F01 · normalizeLifecycle
{
  const old = normalizeLifecycle({ economics: { revenue: { grossUsd: 0, mrrNetUsd: null } } });
  eq([old.economics.revenue.mrrNetUsd, old.economics.revenue.mrrGrossUsd], [null, null], 'F12: MRR null stays null (never $0)');
  ok(isMissing(old.missing, 'economics.revenue.paidVerified'), 'F01: absent paidVerified is missing');
  ok(isMissing(old.missing, 'economics.revenue.measured'), 'F01: absent measured is missing');
  eq(old.economics.revenue.measured, false, 'F01: not measured unless the server says so');
  eq(old.economics.revenue.unconvertedEvents, null, 'economics USD conversion coverage omitted stays unknown');
  eq(normalizeLifecycle({ economics: { revenue: { unconvertedEvents: '2' } } }).economics.revenue.unconvertedEvents, 2, 'economics retains the pending USD event count');
  const r2 = normalizeLifecycle({
    internalMarkFailed: true,
    economics: { revenue: {
      mrrNetUsd: '0', mrrGrossUsd: 0, paidVerified: 0, unverifiedSubscriptions: '1', testSubscriptions: 0, liveSubscriptions: 1,
      payingInPeriod: 1, purchasesSince: '2026-10-01T10:00:00Z', measured: true, takehome: 0,
    } },
  });
  const rv = r2.economics.revenue;
  eq([rv.mrrNetUsd, rv.paidVerified, rv.unverifiedSubscriptions, rv.liveSubscriptions, rv.payingInPeriod], [0, 0, 1, 1, 1], 'F01: verified-only MRR and the counts beside it');
  eq([rv.purchasesSince, rv.measured, rv.takehome], ['2026-10-01T10:00:00Z', true, 0], 'F12: a 0 take-home stays 0');
  eq(r2.internalMarkFailed, true, 'F10: lifecycle carries the flag');
}

// ---------------------------------------------------------------- F17 · deltas never compare unknown coverage
{
  const known = normalizeOverview(rawOverview()).overview;
  const cmpKnown = compareSeries(known);
  ok(windowDelta(cmpKnown.reads, 7) !== null, 'control: covered reads give a delta');
  ok(windowDelta(cmpKnown.revenue, 7) !== null, 'control: covered revenue gives a delta');

  const unknown = normalizeOverview(rawOverview({ coverage: null })).overview;
  eq(unknown.coverage, null, 'coverage not sent');
  ok(isMissing(unknown.missing, 'coverage'), 'F17: absent coverage is missing');
  const cmp = compareSeries(unknown);
  for (const k of ['reads', 'web', 'ios', 'revenue', 'visits', 'llm', 'anthropic', 'openai'] as const) {
    eq(windowDelta(cmp[k], 7), null, `F17: coverage unknown ⇒ no ${k} delta`);
  }
  // A source that never had rows (null since) is NaN too, as before.
  const noPurchases = normalizeOverview(rawOverview({ coverage: { eventsSince: '2026-09-01T00:00:00Z', readsSince: '2026-09-01T00:00:00Z', purchasesSince: null, ledgerSince: '2026-09-01T00:00:00Z' } })).overview;
  eq(windowDelta(compareSeries(noPurchases).revenue, 7), null, 'no purchase event ever ⇒ no revenue delta');
}

// ---------------------------------------------------------------- F18 · UTC dates and the reads caption
{
  eq(todayUtc(new Date('2026-10-02T00:30:00+01:00')), '2026-10-01', 'F18: 00:30 in Lisbon is still Oct 1 in UTC');
  eq(todayUtc(new Date('2026-10-01T23:30:00-06:00')), '2026-10-02', 'F18: 23:30 in Mexico City is already Oct 2 in UTC');
  eq(teamReadsCaption(false, 0), 'sin las del equipo (0 en el periodo)', 'F18: team out with 0 team reads never says "incluye"');
  eq(teamReadsCaption(false, 6), 'sin 6 del equipo', 'F18: team out with team reads');
  eq(teamReadsCaption(true, 0), 'incluye las del equipo', 'F18: team in');
  eq(fmtDays([]), '—', 'no days');
}

// ---------------------------------------------------------------- F10 · a failed /admin mark never claims a verified exclusion
{
  eq(teamReadsCaption(false, 0, true), 'sin las del equipo · sin verificar', 'F10: 0 team reads with a failed mark is not "(0 en el periodo)"');
  eq(teamReadsCaption(false, 6, true), 'sin 6 del equipo · sin verificar', 'F10: team reads with a failed mark');
  eq(teamReadsCaption(true, 6, true), 'incluye las del equipo', 'F10: with the team included the mark does not matter');
  eq([teamOut(false), teamOut(true), teamOut(true, '3 del equipo, fuera')], ['sin el equipo', 'sin el equipo · sin verificar', '3 del equipo, fuera · sin verificar'], 'F10: every "sin el equipo" caption gains "sin verificar"');
}

// ---------------------------------------------------------------- F17 · an absent count is "—", never 0
{
  const raw = rawOverview();
  delete (raw.overview.activity as Record<string, unknown>).readsInternal;
  const o = normalizeOverview(raw).overview;
  ok(isMissing(o.missing, 'activity.readsInternal'), 'F17: absent readsInternal is recorded as missing');
  eq(teamReadsCaption(false, isMissing(o.missing, 'activity.readsInternal') ? null : o.activity.readsInternal), 'sin las del equipo (— en el periodo)', 'F17: …and the caption says "—", not "0 en el periodo"');
  // The audit's case: HTTP 200 without geo.
  const none = normalizeAudience({});
  const miss = (p: string) => isMissing(none.missing, p);
  const t = geoText(none.geo, miss, 30, null);
  eq([t.countriesCount, t.located, t.noLocation], ['—', 'dato no disponible', 'dato no disponible'], 'F17: no geo ⇒ "—" countries (not "0 países · n=0") and no captions with zeros');
  // geo present, but web.devices and web.measurable absent.
  const part = normalizeAudience({ geo: { since: '2026-09-02', days: 30, locatedSince: null, web: { located: 2, beforeLocation: 1 }, countries: [{ country: 'MX', visitors: 2, readers: 1, accounts: 0, pro: 0 }], regions: [], located: { total: 2, withRegion: 0 }, purchases: [], purchasesSince: null } });
  const pm = (p: string) => isMissing(part.missing, p);
  const t2 = geoText(part.geo, pm, 30, null);
  ok(pm('geo.web.devices') && pm('geo.web.measurable'), 'F17: the absent web counts are missing');
  eq([t2.located, t2.noLocation, t2.countriesCount], ['dato no disponible', 'dato no disponible', '1 países · n=2'], 'F17: no "de 0 instalaciones", no zero branch; the countries that came are counted');
  const sent = normalizeAudience({ geo: { since: '2026-09-02', days: 30, locatedSince: '2026-09-20T10:00:00Z', web: { devices: 9, measurable: 4, located: 3, beforeLocation: 3 }, countries: [], regions: [], located: { total: 3, withRegion: 0 }, purchases: [], purchasesSince: null } });
  const t3 = geoText(sent.geo, (p) => isMissing(sent.missing, p), 30, '20 sept 26, 10:00');
  eq([t3.located, t3.noLocation, t3.countriesCount], ['3/4 (muestra pequeña) de los que llegaron desde el 20 sept 26, 10:00 · 30d', 'llegaron antes del 20 sept 26, 10:00, cuando aún no se registraba · de 9 nuevos', '0 países · n=0'],
    'F17: what the server sent (zeros included) is shown as sent');
}

// ---------------------------------------------------------------- D2 · why an account is the team's
{
  const u = normalizeUser({ id: '0b8f0a52-0000-4000-8000-00000000000b', is_team: true, team_seed: 'install_mark', team_seed_ref: 'ab12cd34ef' });
  eq([u.is_team, u.team_seed, u.team_seed_ref], [true, 'install_mark', 'ab12cd34ef'], 'D2: the provenance passes through');
  eq(teamReason(u), 'por estar ligada a una instalación marcada (ab12cd34ef…)', 'D2: in words');
  eq(teamReason(normalizeUser({ id: 'x1', team_seed: 'email', team_seed_ref: 'x1' })), 'por su email (lista de emails del equipo)', 'D2: its own email');
  eq(teamReason(normalizeUser({ id: 'x1', team_seed: 'admin', team_seed_ref: '0b8f0a52-0000-4000-8000-00000000ad01' })), 'por estar ligada a una cuenta admin (0b8f0a52…)', 'D2: chained to an admin account');
  eq(teamReason(normalizeUser({ id: 'x1', team_seed: 'network', team_seed_ref: 'cd34ef56ab' })), 'por estar ligada a una red del equipo (cd34ef56ab…)', 'D2: a team network');
  eq([normalizeUser({ id: 'x1', team_seed: 'bogus' }).team_seed, teamReason(normalizeUser({ id: 'x1' }))], [null, null], 'D2: an unknown or absent seed is no reason');
}

// ---------------------------------------------------------------- F01 / D4 · the new keys
{
  const o = normalizeOverview(rawOverview({ revenue: { unverifiedGrossUsd: '4.99' }, deskRuns: { abandoned: 3 } })).overview;
  eq([o.revenue.unverifiedGrossUsd, o.llm.deskRuns.abandoned], [4.99, 3], 'F01/D4: unverified money and abandoned runs are read');
  const old = normalizeOverview(rawOverview()).overview;
  ok(isMissing(old.missing, 'revenue.unverifiedGrossUsd') && old.llm.deskRuns.abandoned === null, 'F01/D4: an older server: unknown, never 0');
}

// ---------------------------------------------------------------- F01 · commercial class labels
{
  eq(commercialLabel('paid', null), 'Pagando (verificado)', 'paid');
  eq(commercialLabel('unverified', 'unknown_environment'), 'Sin verificar · entorno desconocido', 'unverified · env');
  eq(commercialLabel('unverified', 'no_charge'), 'Sin verificar · sin cobro registrado', 'unverified · no charge');
  eq(commercialLabel('test', 'sandbox'), 'De prueba · sandbox', 'test · sandbox');
  eq(commercialLabel('test', 'trial'), 'De prueba · periodo de prueba', 'test · trial');
  eq(commercialLabel('inactive', null), 'Inactiva', 'inactive');
  eq(commercialLabel(null), '—', 'not classified');
}

// ---------------------------------------------------------------- F07 · a $0 balance mark never heals the credit alert
{
  const stats = (over: Record<string, unknown>) => normalizeOverview({ ...rawOverview(), overview: { ...rawOverview().overview, llm: { ...rawOverview().overview.llm, providers: { anthropic: {}, openai: over } } } })
    .overview.llm.providers.openai;
  const alerted = { lastCreditAlert: '2026-10-02T10:00:00Z', creditAlert: { code: 'insufficient_quota', endpoint: 'desk' }, lastOk: '2026-10-02T09:00:00Z', calls24h: 0, failures24h: 0 };
  eq(llmProviderState(stats({ ...alerted, balanceMark: { amount: 0, at: '2026-10-02T11:00:00Z' }, estimatedLeft: 0 })).key, 'no_credit', 'F07: $0 balance mark after the alert keeps "Sin crédito"');
  eq(llmProviderState(stats({ ...alerted, balanceMark: { amount: 50, at: '2026-10-02T11:00:00Z' }, estimatedLeft: 50 })).key, 'no_credit', 'F07: any balance mark is not a top-up');
  ok(llmProviderState(stats({ ...alerted, lastTopup: '2026-10-02T11:00:00Z' })).key !== 'no_credit', 'F07: a real top-up after the alert heals it');
  ok(llmProviderState(stats({ ...alerted, lastOk: '2026-10-02T12:00:00Z' })).key !== 'no_credit', 'F07: an OK call or probe after the alert heals it');
  // Same rule as the "Dónde mejorar" insight (strictly after): the panel and the diagnosis never disagree.
  eq(llmProviderState(stats({ ...alerted, lastTopup: '2026-10-02T10:00:00Z' })).key, 'no_credit', 'F07: a top-up at the alert instant does not heal it');
}

// ---------------------------------------------------------------- F16 · App Store partial in Integraciones
{
  const ov = normalizeOverview(rawOverview({ root: { integrations: {
    revenuecat: { configured: false }, llmCaps: {}, health: null, paywall: true, missing: [],
    appStore: { configured: true, days: ['2026-09-30'], downloads: [3], totals: { downloads: 3 }, coveredFrom: '2026-09-30', coveredTo: '2026-09-30', partial: true, missingDays: ['2026-09-01', '2026-09-02'] },
  } } }));
  eq([ov.integrations.appStore.partial, ov.integrations.appStore.missingDays], [true, ['2026-09-01', '2026-09-02']], 'F16: partial reaches the client');
  const row = integrationChecks(ov.integrations, null, ov.overview).find((r) => r.id === 'appStore')!;
  eq([row.status, row.tag], ['warn', 'Parcial'], 'F16: the App Store row says "Parcial"');
  ok(/faltan 2 días/.test(row.detail), 'F16: the missing days are named');
}

// ---------------------------------------------------------------- the dev fixtures follow the contract (all three variants)
{
  const get = async (mode: string, params: Record<string, string>) => (await mockAdminFetch(mode, 'GET', new URLSearchParams(params))).json();
  const post = async (mode: string, body: unknown) => (await mockAdminFetch(mode, 'POST', null, body as never)).json();

  // ?mock: one membership of each class; overview subscriptions = the Membresías rows without the team.
  const mem = normalizeMembers(await get('admin', { view: 'members' }));
  const memAll = normalizeMembers(await get('admin', { view: 'members', internal: '1' }));
  const classes = new Set(mem.subscriptions.map((x) => `${x.commercial}/${x.commercialReason ?? ''}`));
  for (const c of ['paid/', 'unverified/unknown_environment', 'unverified/no_charge', 'test/sandbox', 'test/trial', 'inactive/']) ok(classes.has(c), `?mock has a ${c} membership`);
  eq(mem.excluded.subscriptions, 1, 'F08: ?mock leaves the team tester out by default');
  ok(mem.subscriptions.every((x) => !x.internal), 'F08: no team row without internal=1');
  ok(memAll.subscriptions.some((x) => x.internal) && memAll.excluded.subscriptions === 0 && memAll.includeInternal, 'F08: internal=1 lists the team row');
  const ov = normalizeOverview(await get('admin', { view: 'overview', days: '30', compare: '1' }), { compare: true });
  const s = ov.overview.subscriptions;
  eq([s.active, s.paidVerified, s.unverified, s.test], [mem.totals.live, mem.totals.paidVerified, mem.totals.unverified, mem.totals.test], '?mock: overview subscriptions match the members rows');
  eq(s.paid, s.paidVerified, '?mock: paid carries the verified count');
  eq(s.unverifiedReasons.unknown_environment + s.unverifiedReasons.no_charge, s.unverified, '?mock: unverified reasons add up');
  eq(s.testReasons.sandbox + s.testReasons.trial, s.test, '?mock: test reasons add up');
  ok(Date.parse(ov.overview.llm.deskRuns.lastFinishedAt!) > Date.parse(ov.overview.llm.deskRuns.lastUnfinishedAt!), '?mock: the desk finished a read after its last failure');
  const lc = normalizeLifecycle(await get('admin', { view: 'lifecycle', days: '30' }));
  eq([lc.missing, lc.economics.revenue.measured, lc.economics.revenue.paidVerified], [[], true, s.paidVerified], '?mock: economics complete, measured, verified payers');
  const au = normalizeAudience(await get('admin', { view: 'audience', days: '30' }));
  eq(au.missing, [], '?mock: audience complete');
  ok(au.geo.purchasesSince != null, '?mock: purchases measured');
  const digest = await post('admin', { action: 'send-digest' });
  eq([digest.accepted, typeof digest.emailId], [true, 'string'], '?mock: send-digest reports acceptance');

  // Re-sync: the unknown-environment membership with a charge on record becomes the first verified payer.
  const target = mem.subscriptions.find((x) => x.commercialReason === 'unknown_environment')!;
  const res = await post('admin', { action: 'resync-membership', identityId: target.identityId });
  eq([res.ok, res.revenuecatActive, res.accessKept, res.subscription.environment], [true, true, false, 'production'], '?mock: resync answers like the server');
  const after = normalizeMembers(await get('admin', { view: 'members' }));
  eq(after.subscriptions.find((x) => x.identityId === target.identityId)?.commercial, 'paid', '?mock: resync turns "sin verificar" into a fact');
  eq(after.totals.paidVerified, mem.totals.paidVerified + 1, '?mock: one more verified payer');
  eq((await mockAdminFetch('admin', 'POST', null, { action: 'credit-mark', provider: 'anthropic', kind: 'topup', amountUsd: 0 })).status, 400, 'F07: a $0 top-up is refused');

  // ?mock=bare: no purchase event ever, no memberships, every new count 0.
  const bare = normalizeOverview(await get('bare', { view: 'overview', days: '30', compare: '1' }), { compare: true });
  eq([bare.overview.coverage?.purchasesSince, bare.overview.subscriptions.paidVerified, bare.overview.subscriptions.unverified, bare.overview.subscriptions.test, bare.overview.revenue.payingInPeriod], [null, 0, 0, 0, 0], '?mock=bare: nothing measured, all zero');
  eq(bare.overview.missing, [], '?mock=bare: every key sent');
  const bareMem = normalizeMembers(await get('bare', { view: 'members' }));
  eq([bareMem.subscriptions.length, bareMem.grants.length, bareMem.missing], [0, 0, []], '?mock=bare: members empty');
  const bareLc = normalizeLifecycle(await get('bare', { view: 'lifecycle', days: '30' }));
  eq([bareLc.economics.revenue.measured, bareLc.economics.revenue.purchasesSince, bareLc.economics.ltv.scenario, bareLc.missing], [false, null, true, []], '?mock=bare: revenue not measured, LTV a scenario');
  const bareAu = normalizeAudience(await get('bare', { view: 'audience', days: '30' }));
  eq([bareAu.geo.purchasesSince, bareAu.missing], [null, []], '?mock=bare: audience complete, purchases never measured');
  eq((await post('bare', { action: 'send-digest' })).emailError, 'not_configured', '?mock=bare: no recipient, not accepted');

  // ?mock=partial: sections missing, the mark failed and Apple's load was cut short.
  const partial = normalizeOverview(await get('partial', { view: 'overview', days: '30' }));
  eq(partial.internalMarkFailed, true, '?mock=partial: the failed mark is flagged');
  ok(isMissing(partial.overview.missing, 'revenue') && isMissing(partial.overview.missing, 'coverage'), '?mock=partial: omissions recorded');
  const provider = normalizeOverview({ overview: rawOverview().overview, ...(await get('partial', { view: 'integrations', days: '30' })) });
  ok(provider.integrations.appStore.partial === true && (provider.integrations.appStore.missingDays?.length ?? 0) > 0, '?mock=partial: Apple partial with missing days');
  eq(normalizeLifecycle(await get('partial', { view: 'lifecycle', days: '30' })).appStore.partial, true, '?mock=partial: lifecycle Apple partial');
  eq(normalizeMembers(await get('partial', { view: 'members' })).internalMarkFailed, true, '?mock=partial: members flag');
  eq(normalizeAudience(await get('partial', { view: 'audience', days: '30' })).internalMarkFailed, true, '?mock=partial: audience flag');
}

// Review regressions: current read timestamps, reconstructed installs and partial health remain distinct facts.
{
  const { buildInsights } = await import('../shared/admin-insights.ts');
  const { sourceNow } = await import('../src/components/admin/bobby/live.ts');
  const stamp = new Date().toISOString();
  const meta = { generatedAt: stamp, sources: Object.fromEntries(['overview', 'growth', 'networks', 'appStore', 'health'].map((key) => [key, { status: 'ok', fetchedAt: stamp }])) };
  const growth = { people: {}, cohorts: { ios: { arrived: 3 } }, history: { ios: { installsInPeriod: 14 } }, outcomes: {} };
  const raw = rawOverview({ root: { growth, meta, integrations: { llmCaps: { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, paywall: true } } });
  const core = normalizeOverview(raw);
  const providerRaw = { integrations: { appStore: { configured: true, totals: { downloads: 15 }, fetchedAt: stamp, oldestReportAt: '2026-09-01T00:00:00Z' } }, meta };
  const providers = normalizeAdminIntegrations(providerRaw);
  eq(core.growth?.history.ios.installsInPeriod, 14, 'ADM-2: historical installs in the selected window survive normalization');
  const server = buildInsights({ days: DAYS.length, overview: raw.overview, growth, integrations: providerRaw.integrations, searchConsole: null });
  const client = composeOverview(core, providers);
  eq([server.some((i) => i.id === 'ios-gap'), client.insights.some((i) => i.id === 'ios-gap')], [false, false], 'ADM-1/2: client and server agree when observed plus reconstructed installs exceed downloads');
  eq(providers.integrations.appStore.oldestReportAt, '2026-09-01T00:00:00Z', 'ADM-1: oldest report timestamp remains separate from this read');
  eq(composeOverview(core, null).integrations.llmCaps, { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, 'ADM-3: core spend caps remain visible before provider loading');
  eq(composeOverview(core, null).integrations.paywall, true, 'ADM-3: core paywall config remains visible before provider loading');
  const pending = normalizeOverview(rawOverview({ root: { integrations: null, meta } }));
  eq([pending.integrations.llmCaps.dayUsd, pending.integrations.paywall], [null, null], 'ADM-3: an absent configuration stays pending, never no-cap or paywall-off');

  const failed = normalizeAdminIntegrations({ integrations: { appStore: { configured: true, error: 'appstore_401' }, health: {
    revenuecatWebhook: { configured: true, lastEventAt: null, lastEventError: 'source_unavailable' },
    stripe: { configured: true, webhook: true, lastEventAt: null, lastEventError: 'source_unavailable' },
    tracking: { lastEventAt: null, lastReadAt: stamp, lastEventError: 'read_budget_exhausted', eventsError: 'source_unavailable' },
    llmKeys: {},
  } }, meta: { ...meta, sources: { health: { status: 'partial', fetchedAt: stamp }, appStore: { status: 'error', fetchedAt: null, error: 'appstore_401' } } } });
  const rows = integrationChecks(failed.integrations).filter((row) => ['rcWebhook', 'stripe', 'tracking'].includes(row.id));
  ok(rows.every((row) => !/nunca/i.test(row.tag + row.detail + row.problem?.text)), 'ADM-4: failed latest-event reads cannot claim an event never arrived');
  ok(!buildInsights({ days: 30, overview: {}, growth: {}, integrations: failed.integrations, searchConsole: null }).some((i) => i.id === 'tracking-silent'), 'ADM-4: an unavailable event read cannot diagnose silent tracking');
  const merged = mergeProviderSnapshots(providers, failed);
  eq([merged.integrations.appStore.totals?.downloads, merged.integrations.appStore.error], [15, 'appstore_401'], 'provider refresh keeps prior facts and the latest error');
  const unconfigured = normalizeAdminIntegrations({ integrations: { appStore: { configured: false } }, meta });
  eq(mergeProviderSnapshots(unconfigured, failed).integrations.appStore.configured, true, 'current configured provider error cannot become an old disconnected placeholder');
  const healthFailure = mergeProviderSnapshots(failed, { ...failed, integrations: { ...failed.integrations, health: null }, meta: { ...failed.meta!, sources: { health: { status: 'error', fetchedAt: null, error: 'timeout' } } } });
  ok(integrationChecks(healthFailure.integrations).filter((row) => ['rcWebhook', 'stripe', 'tracking'].includes(row.id)).every((row) => row.status !== 'ok'), 'retained health facts cannot claim current delivery after a failed health refresh');

  const skewed = normalizeAdminMeta({ generatedAt: new Date(Date.now() + 3_600_000).toISOString(), sources: { overview: { status: 'ok', fetchedAt: new Date(Date.now() + 3_600_000).toISOString() } } })!;
  eq(sourceState(skewed.sources.overview, 90_000, sourceNow(skewed)), 'fresh', 'browser clock skew does not invalidate a newly received server snapshot');
  eq(sourceState(skewed.sources.overview, 90_000, sourceNow(skewed, skewed.receivedAt! + 91_000)), 'stale', 'server-clock calibration still expires genuinely old snapshots');

  const liveRaw = await (await mockAdminFetch('admin', 'GET', new URLSearchParams({ view: 'live' }))).json();
  const partialLive = normalizeAdminLive({ ...liveRaw, meta: { generatedAt: stamp, sources: { clientLive: { status: 'error', fetchedAt: null, error: 'source_unavailable' } } } });
  ok(partialLive.live && partialLive.live.client === null && partialLive.missing.includes('client'), 'optional client failure withholds client counters and preserves server facts');

  // Render the real IA tab so the fallback cannot silently become "sin tope" again.
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/components/admin/bobby/LlmTab.tsx', import.meta.url))], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
  const require = createRequire(import.meta.url), module = { exports: {} as { default: unknown } };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const render = (data: unknown) => renderToStaticMarkup(React.createElement(module.exports.default, { data, period: 30, cmp: null, notify: () => {}, onChanged: () => {} }));
  ok(render(pending).includes('tope pendiente de consulta') && !render(pending).includes('sin tope'), 'ADM-3: real IA tab renders unknown caps as pending');
  ok(render(composeOverview(core, null)).includes('$300.00') && !render(composeOverview(core, null)).includes('sin tope'), 'ADM-3: real IA tab renders core caps before provider loading');
}

console.log(`test-admin-live-ui: ${checks} checks passed`);
