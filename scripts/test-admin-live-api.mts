// Offline regressions: live facts stay responsive when provider/cache reads fail; authorization stays intact.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { gzipSync } from 'node:zlib';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.RATE_LIMIT_SALT = 'dashboard-offline-test-salt';
for (const key of ['BOBBY_AUTH_URL', 'REVENUECAT_V2_SECRET_KEY', 'REVENUECAT_SECRET_KEY', 'GSC_SERVICE_ACCOUNT_JSON', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER']) delete process.env[key];

const { default: handler } = await import('../api/admin.ts');
const { appStoreSales, unitEconomics, adminDays, requireAdmin, searchConsole, INSTRUMENTATION } = await import('../api/_lib/admin.ts');
const { adminBounded, adminFetch, adminInteger, adminReadMeta, observeAdminSource, withAdminRead } = await import('../api/_lib/admin-read.ts');
const { enforcePublicRateLimit } = await import('../api/_lib/request-security.ts');
const { resolveIdentity } = await import('../api/_lib/user-identity.ts');
const ADMIN = '00000000-0000-4000-8000-00000000ad01';
const AUTH = '00000000-0000-4000-8000-00000000ad02';
const USER = '00000000-0000-4000-8000-00000000bb01';
let checks = 0;
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a: unknown, label: string) => { assert.ok(a, label); checks++; };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
interface Call { url: string; method: string; body: any; signal: AbortSignal | null }
let calls: Call[] = [];
let override: (call: Call) => Response | Promise<Response> | null = () => null;
let markFailures = 0;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const call: Call = { url: decodeURIComponent(String(input)), method: init?.method ?? 'GET', body: init?.body ? init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : JSON.parse(String(init.body)) : null, signal: init?.signal ?? null };
  calls.push(call);
  const altered = override(call); if (altered) return await altered;
  const headers = init?.headers as Record<string, string> | undefined;
  if (call.url.includes('/auth/v1/user')) return json({ id: headers?.Authorization === 'Bearer user' ? USER : AUTH, email: 'owner@example.com', app_metadata: { provider: 'apple' } });
  if (call.url.includes('bobby_identities?on_conflict=auth_user_id')) return json([{ id: call.body.auth_user_id === USER ? USER : ADMIN, auth_user_id: call.body.auth_user_id, wallet_address: null }]);
  if (call.url.includes('bobby_admins?identity_id=eq.')) return json(call.url.includes(ADMIN) ? [{ identity_id: ADMIN }] : []);
  if (call.url.includes('rpc/bobby_mark_admin_session')) return markFailures-- > 0 ? json({ error: 'down' }, 503) : json(null, 204);
  if (call.url.includes('rpc/bobby_admin_overview')) return json({ days: adminDays(call.body.p_days), accounts: { total: 1 }, subscriptions: { paidVerified: 0 } });
  if (call.url.includes('rpc/bobby_admin_growth')) return json({ people: { active7d: 1 }, acquisition: { visitors: 1 }, cohorts: {}, outcomes: {} });
  if (call.url.includes('rpc/bobby_admin_internal_networks')) return json([]);
  if (call.url.includes('rpc/bobby_admin_server_live')) return json({ snapshotAt: new Date().toISOString(), includeInternal: call.body.p_internal, windows: { '15m': { minutes: 15, ios: { completed: 2 }, web: { completed: 1 } } }, coverage: { onlinePresence: false, clientRendered: false } });
  if (call.url.includes('rpc/bobby_admin_client_live')) return json({ coverage: { protocolVersion: 1 }, platforms: {} });
  if (call.url.includes('rpc/bobby_admin_users')) return json({ total: 0, users: [] });
  if (call.url.includes('rpc/bobby_admin_members')) return json({ subscriptions: [], grants: [], includeInternal: call.body.p_internal });
  if (call.url.includes('bobby_identities?id=eq.')) return json([{ email: 'owner@example.com' }]);
  if (call.url.includes('api_cache')) return call.method === 'POST' ? json(null, 201) : json([]);
  if (call.url.includes('bobby_purchase_events') || call.url.includes('bobby_reads?') || call.url.includes('bobby_events?')) return json([], 200, { 'Content-Range': '*/0' });
  if (call.url.includes('rpc/bobby_llm_spend')) return json({ day: 0, month: 0 });
  if (call.url.includes('rate_limit')) return json(true);
  throw new Error(`Unexpected offline request: ${call.method} ${call.url}`);
}) as typeof fetch;
const response = () => ({ replies: 0, statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; }, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.replies++; this.body = body; return this; }, end() { return this; } });
let requestId = 1;
async function get(query: Record<string, string>, token: string | null = 'admin') {
  calls = [];
  const res = response();
  await handler({ method: 'GET', query, headers: { 'x-forwarded-for': `198.51.100.${requestId++}`, 'x-bobby-device': 'offline-dashboard-device', ...(token ? { authorization: `Bearer ${token}` } : {}) } } as never, res as never);
  return res;
}

// Unauthorized callers never start any dashboard data or provider request.
eq((await get({ view: 'overview' }, null)).statusCode, 401, 'signed out is rejected');
eq((await get({ view: 'live' }, 'user')).statusCode, 403, 'non-admin is rejected');
eq(calls.filter((c) => /bobby_admin_(live|overview|growth)|appstoreconnect|revenuecat.com/.test(c.url)).length, 0, 'no facts fetched before admin authorization');
let res = await get({ view: 'overview', days: 'Infinity' });
eq(res.statusCode, 200, 'core summary returns');
eq(calls.find((c) => c.url.includes('rpc/bobby_admin_overview'))!.body.p_days, 30, 'nonfinite days default');
eq(res.body.searchConsole, null, 'external provider data is deferred');
eq(res.body.integrations.llmCaps, { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, 'spend caps are core configuration before providers answer');
eq(res.body.integrations.paywall, false, 'paywall configuration is present before providers answer');
eq(res.body.meta.sources.overview.status, 'ok', 'core has source evidence');
eq(res.body.meta.sources.appStore.status, 'deferred', 'provider delay is not a false zero');
eq(calls.filter((c) => /appstoreconnect|revenuecat.com|searchconsole.googleapis/.test(c.url)).length, 0, 'core never waits on external providers');

markFailures = 2;
res = await get({ view: 'live', internal: '1' });
eq(res.statusCode, 200, 'live read survives failed optional team mark');
eq(res.body.internalMarkFailed, true, 'team exclusion is flagged');
eq(res.body.meta.sources.teamExclusion.status, 'error', 'failed mark is source evidence');
eq(calls.filter((c) => c.url.includes('bobby_mark_admin_session')).length, 2, 'team mark retried once');
eq(res.body.live.includeInternal, true, 'live honors include team');
eq(res.body.live.coverage.onlinePresence, false, 'server observation never claims online presence');
eq(res.body.meta.sources.live.status, 'ok', 'live RPC source');

override = (c) => c.url.includes('rpc/bobby_admin_client_live') ? json({ error: 'statement timeout' }, 503) : null;
res = await get({ view: 'live' });
eq(res.statusCode, 200, 'client aggregate failure preserves server live facts');
eq(res.body.live.windows['15m'].ios.completed, 2, 'server counts survive client failure');
eq(res.body.live.client, null, 'failed client source is unavailable instead of measured zero');
eq(res.body.missing, ['clientLive'], 'failed client source is named');
eq(res.body.meta.sources.clientLive.status, 'error', 'client query failure has independent evidence');
eq(res.body.meta.sources.live.status, 'ok', 'client failure never poisons server source');
override = (c) => c.url.includes('rpc/bobby_admin_server_live') ? json({ error: 'down' }, 503) : null;
res = await get({ view: 'live' });
eq(res.statusCode, 502, 'required server failure is unavailable');
eq(res.body.meta.sources.live.status, 'error', 'server failure has evidence');
override = () => null;

res = await get({ view: 'users', limit: '9.8', offset: '999999999999999999999' });
const userCall = calls.find((c) => c.url.includes('bobby_admin_users'))!;
eq([userCall.body.p_limit, userCall.body.p_offset], [9, 1_000_000], 'pagination finite bounded integers');
res = await get({ view: 'members', internal: '1' });
eq(calls.find((c) => c.url.includes('bobby_admin_members'))!.body, { p_internal: true }, 'members share the header mode');

override = (c) => /rpc\/bobby_admin_(growth|internal_networks)/.test(c.url) ? json({ error: 'down' }, 503) : null;
res = await get({ view: 'overview' });
eq(res.statusCode, 200, 'optional source failure preserves core');
eq([res.body.growth, res.body.networks], [null, null], 'failed sources are not invented empty datasets');
eq(res.body.missing, ['growth', 'networks'], 'missing sources named');
eq(res.body.insights, [], 'diagnosis withheld without population facts');
eq(res.body.meta.sources.growth.status, 'error', 'failure metadata');
override = (c) => c.url.includes('rpc/bobby_admin_overview') ? json({ error: 'down' }, 503) : null;
res = await get({ view: 'overview' });
eq(res.statusCode, 502, 'required core failure is unavailable');
eq(res.body.meta.sources.overview.status, 'error', 'required failure still has metadata');
override = () => null;
res = await get({ view: 'integrations' });
eq(res.statusCode, 200, 'provider view handles unconfigured providers');
eq(res.body.meta.sources.appStore.status, 'not_configured', 'provider configuration is explicit');
eq(res.body.meta.sources.appStore.fetchedAt, null, 'not connected is never freshly fetched');
eq(calls.filter((c) => c.url.includes('bobby_admin_overview')).length, 0, 'providers do not requery core');
eq(res.body.integrations.health.revenuecatWebhook.events30d, 0, 'valid empty Content-Range is an observed zero, not missing');

// Global deadline includes storage and response bodies even if a broken transport ignores AbortSignal.
const slow = (ms: number, value: Response) => new Promise<Response>((resolve) => setTimeout(() => resolve(value), ms));
// The deadline starts before auth, includes identity persistence/decoding and never answers twice.
const authRequest = { method: 'GET', query: { view: 'live' }, headers: { authorization: 'Bearer admin', 'x-forwarded-for': '198.51.100.240' } };
for (const phase of ['authFetch', 'identityFetch', 'authBody', 'identityBody']) {
  calls = [];
  const pendingBodies: Promise<unknown>[] = [];
  override = (c) => {
    const auth = c.url.includes('/auth/v1/user'), identity = c.url.includes('bobby_identities?on_conflict=');
    if ((phase === 'authFetch' && auth) || (phase === 'identityFetch' && identity)) return slow(120, auth ? json({ id: AUTH }) : json([{ id: ADMIN, auth_user_id: AUTH }]));
    if ((phase === 'authBody' && auth) || (phase === 'identityBody' && identity)) {
      const r = auth ? json({ id: AUTH }) : json([{ id: ADMIN, auth_user_id: AUTH }]);
      r.json = async () => { const task = new Promise((resolve) => setTimeout(() => resolve(auth ? { id: AUTH } : [{ id: ADMIN, auth_user_id: AUTH }]), 120)); pendingBodies.push(task); return task; };
      return r;
    }
    return null;
  };
  const reply = response();
  const began = performance.now();
  eq(await withAdminRead(() => requireAdmin(authRequest as never, reply as never), { budgetMs: 25 }), null, `${phase}: auth fails closed`);
  ok(performance.now() - began < 90, `${phase}: auth deadline includes fetch and decoding`);
  eq(reply.statusCode, 503, `${phase}: service unavailable rather than fabricated unauthorized`);
  eq(calls.filter((c) => /bobby_admins|rpc\/bobby_admin_/.test(c.url)).length, 0, `${phase}: no privileged reads after auth timeout`);
  await Promise.all(pendingBodies);
  await new Promise((resolve) => setTimeout(resolve, 130));
  eq(reply.replies, 1, `${phase}: slow completion cannot write a second response`);
  if (phase.endsWith('Fetch')) ok(calls.at(-1)?.signal?.aborted, `${phase}: transport receives aborted signal`);
}

calls = [];
override = (c) => c.url.includes('api_cache') ? slow(120, json([])) : null;
const limiterReply = response();
let limiterBegan = performance.now();
eq(await withAdminRead(() => enforcePublicRateLimit(authRequest as never, limiterReply as never, 'admin-offline-deadline', 120, 60, { transport: { fetch: adminFetch, body: adminBounded } }), { budgetMs: 25 }), true, 'persistent limiter keeps its existing local fallback');
ok(performance.now() - limiterBegan < 90, 'persistent limiter read fits the admin deadline');
eq(calls.filter((c) => c.method === 'POST').length, 0, 'expired limiter does not start a cache write');
override = () => null;
eq((await resolveIdentity(authRequest as never))?.id, ADMIN, 'shared callers keep default authentication behavior');
eq(INSTRUMENTATION.purchaseStart, false, 'purchase start has no emitter and is not measured');

const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.ASC_KEY_ID = 'TESTKEY123';
process.env.ASC_ISSUER_ID = '00000000-0000-4000-8000-000000000123';
process.env.ASC_PRIVATE_KEY = String(key);
process.env.ASC_VENDOR_NUMBER = '1234567';
const days = adminDays(91);
calls = [];
override = (c) => c.url.includes('api_cache') ? slow(150, json([])) : null;
let started = performance.now();
let apple = await withAdminRead(() => appStoreSales(days, 35), { budgetMs: 80 });
ok(performance.now() - started < 120, 'slow cache read stays inside global budget');
ok(apple.partial && apple.missingDays.length === 90, 'unread days are partial, never zero totals');
eq(apple.totals, null, 'no loaded report means unknown totals');
eq(calls.filter((c) => c.url.includes('appstoreconnect')).length, 0, 'expired storage budget does not start Apple fetches');

const report = gzipSync('Product Type Identifier\tUnits\tApple Identifier\tCountry Code\n1\t2\t6804460489\tMX\n');
calls = [];
override = (c) => {
  if (c.url.includes('api_cache') && c.method === 'GET') return json([]);
  if (c.url.includes('appstoreconnect')) return new Response(report);
  if (c.url.includes('api_cache') && c.method === 'POST') return slow(150, json(null, 201));
  return null;
};
started = performance.now();
apple = await withAdminRead(() => appStoreSales(adminDays(7), 40), { budgetMs: 90 });
ok(performance.now() - started < 125, 'slow cache write also inside budget');
eq(apple.cacheError, 'cache_write_unavailable', 'cache failure does not hide loaded facts');
eq(calls.filter((c) => c.url.includes('api_cache') && c.method === 'GET').length, 1, 'one batched cache read');
eq(calls.filter((c) => c.url.includes('api_cache') && c.method === 'POST').length, 1, 'one batched cache write');
const appleDates = calls.filter((c) => c.url.includes('appstoreconnect')).map((c) => new URL(c.url).searchParams.get('filter[reportDate]'));
eq(appleDates[0], adminDays(2)[0], 'newest completed UTC day requested first');
ok(apple.downloads.at(-1) === null, 'today is unpublished, never plotted zero');

calls = [];
override = (c) => {
  if (c.url.includes('api_cache') && c.method === 'GET') return json(days.slice(0, -1).map((date) => ({ cache_key: `asc-sales-v2:${date}`, payload: { downloads: 1, redownloads: 0, updates: 0, iap: 0, countries: { MX: 1 } }, updated_at: '2026-09-01T00:00:00Z' })));
  return null;
};
apple = await withAdminRead(() => appStoreSales(days, 100, { cacheOnly: true }));
eq(apple.totals?.downloads, 90, 'warm report totals retain cached values');
eq(calls.filter((c) => c.url.includes('appstoreconnect')).length, 0, 'cache-only plan never calls Apple');
eq(calls.length, 1, '90 warm days cost one storage read');
eq(apple.oldestReportAt, '2026-09-01T00:00:00Z', 'ADM-1: original report cache time remains separate');
ok(Date.now() - Date.parse(apple.fetchedAt) < 1000, 'ADM-1: cached Apple facts carry the time of this read');

override = () => null;
const economicsRaw = { days: 30, since: '2026-09-01', revenue: { grossUsd: 0, netUsd: 0, refundsUsd: 0, newPaying: 0, initialPurchases30d: 0, expirations30d: 0, lastPriceUsd: 4.99, takehome: 0, purchasesSince: null }, costs: { marketingUsd: 0, infraUsd: 0, otherUsd: 0, byChannel: [] }, subscriptions: { paidVerified: 1, unverified: 2, sandbox: 3 }, newAccounts: 0, activeReaders30d: 0, llmUsd: 0, llm30dUsd: 0, assumptions: {} };
const economical = unitEconomics(economicsRaw);
eq([economical.revenue.mrrNetUsd, economical.revenue.takehome], [0, 0], 'observed zero take-home remains zero');
eq([economical.revenue.unverifiedSubscriptions, economical.revenue.testSubscriptions], [2, 3], 'production sandbox categories preserved');
eq(economical.revenue.measured, false, 'absence of purchase coverage stays unknown');
for (const value of [0, null]) {
  const money = unitEconomics({ ...economicsRaw, revenue: { ...economicsRaw.revenue, unattributedGrossUsd: value, unattributedRefundsUsd: value,
    unattributedNetUsd: value, unattributedEvents: value, unconvertedEvents: value, revenueScope: 'customer-attributed' } }).revenue;
  eq([money.unattributedGrossUsd, money.unattributedRefundsUsd, money.unattributedNetUsd, money.unattributedEvents, money.unconvertedEvents], Array(5).fill(value), 'unattributed and currency coverage preserve zero vs unknown');
  eq(money.revenueScope, 'customer-attributed', 'economics preserves stated revenue scope');
}
eq(economical.revenue.unconvertedEvents, null, 'old economics currency coverage stays unknown');

// Google dataState all exposes provisional Pacific dates and absent rows as gaps, never invented zeros.
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@example.com', private_key: String(rsa) });
const googleDays = adminDays(3);
override = (c) => {
  if (c.url.includes('oauth2.googleapis')) return json({ access_token: 'offline-token', expires_in: 3600 });
  if (c.url.includes('searchconsole.googleapis')) return json(c.body.dimensions[0] === 'date' ? { rows: [{ keys: [googleDays[1]], clicks: 3, impressions: 20, ctr: .15, position: 4 }], metadata: { first_incomplete_date: googleDays[2] } } : { rows: [] });
  return null;
};
let googleMeta: any;
const google = await withAdminRead(async () => { const data = await observeAdminSource('searchConsole', () => searchConsole(googleDays)); googleMeta = adminReadMeta(); return data as any; });
eq(google.clicks, [null, 3, null], 'absent Google dates remain null');
eq(google.incompleteDays, [googleDays[2]], 'Google provisional day retained');
eq(google.firstIncompleteDate, googleDays[2], 'Google first incomplete metadata retained');
eq(google.timeZone, 'America/Los_Angeles', 'Google reporting timezone explicit');
eq(googleMeta.sources.searchConsole.status, 'partial', 'provisional Google reports are partial');
eq([google.coveredFrom, google.coveredTo], [googleDays[1], googleDays[1]], 'actual Google rows define coverage');
const realNow = Date.now, later = realNow() + 15 * 60_000;
Date.now = () => later;
try {
  const cached = await searchConsole(googleDays) as any;
  ok(Date.parse(cached.fetchedAt) >= later, 'ADM-1: a warm Google cache is freshly read after 15 minutes');
  ok(Date.parse(cached.oldestReportAt) < later, 'ADM-1: Google preserves the earlier provider read separately');
} finally { Date.now = realNow; }
override = (c) => c.url.includes('searchconsole.googleapis') ? json({ rows: [] }) : null;
const noGoogle = await withAdminRead(() => searchConsole(adminDays(4))) as any;
eq(noGoogle.totals, null, 'unpublished Google report has no observed totals');
eq(noGoogle.missingDays.length, 4, 'all absent Google dates reported missing');
delete process.env.GSC_SERVICE_ACCOUNT_JSON;
for (const k of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER']) delete process.env[k];

// A multi-project RevenueCat key cannot choose whichever app happens to be listed first.
process.env.REVENUECAT_V2_SECRET_KEY = 'offline-rc-key';
delete process.env.REVENUECAT_PROJECT_ID;
override = () => null;
res = await get({ view: 'integrations' });
eq(res.body.meta.sources.revenuecat.status, 'error', 'missing RevenueCat project is not green');
eq(res.body.integrations.revenuecat.error, 'revenuecat_project_not_configured', 'RevenueCat project setup gap is explicit');
eq(calls.filter((c) => new URL(c.url).hostname === 'api.revenuecat.com').length, 0, 'missing project never lists arbitrary RevenueCat projects');
process.env.REVENUECAT_PROJECT_ID = 'proj-bobby-offline';
override = (c) => new URL(c.url).hostname === 'api.revenuecat.com' ? json({ metrics: [{ id: 'active_subscribers', name: 'Active', value: 0 }] }) : null;
res = await get({ view: 'integrations' });
eq(res.body.integrations.revenuecat.metrics[0].value, 0, 'explicit project retains observed zero');
eq(calls.filter((c) => new URL(c.url).hostname === 'api.revenuecat.com').map((c) => new URL(c.url).pathname), ['/v2/projects/proj-bobby-offline/metrics/overview'], 'only configured RevenueCat project queried');
process.env.REVENUECAT_PROJECT_ID = 'proj-second-offline';
res = await get({ view: 'integrations' });
ok(calls.some((c) => new URL(c.url).hostname === 'api.revenuecat.com' && new URL(c.url).pathname === '/v2/projects/proj-second-offline/metrics/overview'), 'RevenueCat cached metrics do not leak between projects');
override = () => null;

// ADM-4: failed latest-event reads carry per-field errors instead of claiming no row ever arrived.
{
  const { integrations } = await import('../api/_lib/admin.ts');
  override = (c) => c.url.includes('bobby_purchase_events') || c.url.includes('bobby_events?') ? json({ error: 'unavailable' }, 503) : null;
  const failed = await withAdminRead(() => integrations([]));
  eq([failed.health.revenuecatWebhook.lastEventError, failed.health.stripe.lastEventError, failed.health.tracking.lastEventError], Array(3).fill('source_unavailable'), 'ADM-4: each failed latest-event field identifies unavailable evidence');
  eq([failed.health.revenuecatWebhook.eventsError, failed.health.tracking.eventsError], Array(2).fill('source_unavailable'), 'ADM-4: unavailable count is distinct from an observed zero');
  override = () => null;
  const empty = await withAdminRead(() => integrations([]));
  eq([empty.health.revenuecatWebhook.lastEventAt, empty.health.revenuecatWebhook.lastEventError], [null, null], 'ADM-4: successful empty read remains a known absence');
}

// Metadata is request scoped; partial failures in one administrator request do not contaminate another.
const snapshots = await Promise.all([
  withAdminRead(async () => { await observeAdminSource('one', async () => { throw new Error('down'); }); return adminReadMeta(); }),
  withAdminRead(async () => { await observeAdminSource('two', async () => ({ ok: true })); return adminReadMeta(); }),
]);
eq(Object.keys(snapshots[0].sources), ['one'], 'first metadata isolated');
eq(Object.keys(snapshots[1].sources), ['two'], 'second metadata isolated');
eq(adminInteger('NaN', 30, 1, 365), 30, 'NaN never enters SQL');
console.log(`admin-live-api: ${checks} checks passed (offline; no production/provider requests)`);
