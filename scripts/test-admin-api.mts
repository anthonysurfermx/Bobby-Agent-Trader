// /api/admin and /api/track with a mocked backend: only signed-in Apple/Google accounts in bobby_admins get in;
// every change leaves an audit row; deletion needs the typed email and never deletes yourself; coupon and
// grant input is validated; the App Store sales parser and the track normalizer keep only what they should.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.RATE_LIMIT_SALT = 'test-salt';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.OPENAI_API_KEY = 'test-openai';
delete process.env.BOBBY_AUTH_URL;
delete process.env.REVENUECAT_V2_SECRET_KEY;
for (const k of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER']) delete process.env[k];

const { default: adminHandler } = await import('../api/admin.ts');
const { default: trackHandler, normalizeEvent, isBotUserAgent } = await import('../api/track.ts');
const { toAmplitude } = await import('../api/_lib/amplitude.ts');
const { parseSalesReport, ascVendor, ascKeyId, ascIssuer, unitEconomics } = await import('../api/_lib/admin.ts');
const { buildInsights } = await import('../api/_lib/admin-insights.ts');
const { requestGeo, fromAlpha3, countryCode } = await import('../api/_lib/geo.ts');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

const ADMIN = '0b8f0a52-0000-4000-8000-00000000ad01';
const ADMIN_AUTH = 'a11ce000-0000-4000-8000-0000000000a1';
const USER = '0b8f0a52-0000-4000-8000-00000000c0de';
const USER_AUTH = 'a11ce000-0000-4000-8000-000000000001';
const TOKENS: Record<string, { auth: string; ident: string; email: string }> = {
  'Bearer admin-token': { auth: ADMIN_AUTH, ident: ADMIN, email: 'owner@example.com' },
  'Bearer user-token': { auth: USER_AUTH, ident: USER, email: 'reader@example.com' },
};

interface Call { url: string; body: any; method: string; headers: Record<string, string> }
let calls: Call[] = [];
let overrides: (c: Call) => Response | null = () => null;
let auditSeq = 0;
const giftReceipts = new Map<string, { payload: string; result: Record<string, unknown> }>();
let giftedReads = 0, grantAudits = 0;
const grantRpc = (c: Call) => {
  const payload = JSON.stringify({ ...c.body, p_operation: undefined });
  const existing = giftReceipts.get(c.body.p_operation);
  if (existing) return json(existing.payload === payload ? existing.result : { ok: false, error: 'operation_conflict' });
  giftedReads += c.body.p_reads; grantAudits++;
  const result = { ok: true, operationId: c.body.p_operation, bonus: { reads: giftedReads, profundo: 0, maximo: 0 }, proUntil: null };
  giftReceipts.set(c.body.p_operation, { payload, result });
  return json(result);
};
let subscriptionRows: Array<Record<string, unknown>> = [];
let stripeDown = false;
const stripeCalls: string[] = [];
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const raw = init?.body ? String(init.body) : '';
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  const c: Call = { url: String(input), body, method: init?.method ?? 'GET', headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
  calls.push(c);
  const o = overrides(c);
  if (o) return o;
  if (c.url.includes('/rest/v1/api_cache')) return c.method === 'POST' ? json(null, 201) : json([]);
  if (c.url.includes('/auth/v1/user')) {
    const t = TOKENS[c.headers.authorization ?? ''];
    return t ? json({ id: t.auth, email: t.email, app_metadata: { provider: 'google' } }) : json({ msg: 'bad token' }, 401);
  }
  if (c.url.includes('bobby_identities?on_conflict=auth_user_id')) {
    const t = Object.values(TOKENS).find((x) => x.auth === c.body?.auth_user_id);
    return json([{ id: t?.ident, auth_user_id: t?.auth, wallet_address: null }]);
  }
  if (c.url.includes(`bobby_admins?identity_id=eq.${ADMIN}`) && c.method === 'GET') return json([{ identity_id: ADMIN }]);
  if (c.url.includes('bobby_admins?identity_id=eq.') && c.method === 'GET') return json([]);
  if (c.url.includes('rpc/bobby_admin_overview')) return json({ days: ['2026-09-30', '2026-10-01'], accounts: { total: 6 } });
  if (c.url.includes('rpc/bobby_admin_users')) return json({ total: 1, users: [] });
  if (c.url.includes(`bobby_identities?id=eq.${ADMIN}&select=email`)) return json([{ email: 'owner@example.com' }]);
  if (c.url.includes(`bobby_identities?id=eq.${USER}&select=id,email,auth_user_id`)) return json([{ id: USER, email: 'reader@example.com', auth_user_id: USER_AUTH }]);
  if (c.url.includes(`bobby_identities?id=eq.${ADMIN}&select=id,email,auth_user_id`)) return json([{ id: ADMIN, email: 'owner@example.com', auth_user_id: ADMIN_AUTH }]);
  if (c.url.includes('bobby_identities?id=eq.') && c.url.includes('select=id,email,auth_user_id')) return json([]);
  if (c.url.includes('bobby_admin_actions') && c.method === 'POST') return json([{ id: ++auditSeq }], 201);
  if (c.url.includes('bobby_admin_actions?id=eq.') && c.method === 'PATCH') return new Response(null, { status: 204 });
  if (c.url.includes('rpc/bobby_admin_members')) return json({ subscriptions: [{ email: 'reader@example.com', active: true }], grants: [] });
  if (c.url.includes('rpc/bobby_admin_coverage')) return json({ eventsSince: '2026-10-01T12:00:00Z', readsSince: '2026-09-27T00:00:00Z' });
  if (c.url.includes('bobby_coupons') && c.method === 'POST') return json([{ code: c.body.code, reads: c.body.reads }], 201);
  if (c.url.includes('rpc/bobby_admin_grant_once')) return grantRpc(c);
  if (c.url.includes('bobby_subscriptions?identity_id=eq.') && c.method === 'GET') return json(subscriptionRows);
  if (c.url.includes('rpc/bobby_checkout_block_for_deletion')) return json({ customer: null, sessionId: null });
  if (c.url.startsWith('https://api.stripe.com/')) {
    const path = new URL(c.url).pathname; stripeCalls.push(`${c.method} ${path}`);
    if (stripeDown) return json({ error: { message: 'down' } }, 500);
    return json(path === '/v1/subscriptions' ? { data: [{ id: 'sub_live', status: 'active' }] } : { data: [] });
  }
  if (c.url.includes('agent_trades?user_id=eq.') || c.url.includes('bobby_identities?id=eq.')) return new Response(null, { status: 204 });
  if (c.url.includes('/auth/v1/admin/users/')) return json({});
  if (c.url.includes('bobby_llm_credit_marks') || c.url.includes('bobby_events') || c.url.includes('bobby_costs') && c.method === 'POST') return new Response(null, { status: 201 });
  if (c.url.includes('rpc/bobby_record_event')) return new Response(null, { status: 204 });
  if (c.url.includes('rpc/bobby_admin_geo')) return json({ since: new Date(Date.now() - 2 * 86_400_000).toISOString(), web: { devices: 3, located: 2 }, countries: [{ country: 'MX', visitors: 2 }], regions: [], purchases: [] });
  if (c.url.includes('rpc/bobby_admin_growth')) return json({ days: 30, people: { accounts: 3, active7d: 2 }, cohorts: { web: { arrived: 3 }, ios: { arrived: 1 } }, outcomes: {}, acquisition: { visits: 4, visitors: 3, visitsWithUtm: 0 }, attention: { neverRead: [] }, coverage: {} });
  if (c.url.includes('rpc/bobby_mark_admin_session')) return new Response(null, { status: 204 });
  if (c.url.includes('rpc/bobby_admin_devices')) return json([{ device: 'abcdef1234', platform: 'ios', internal: false }]);
  if (c.url.includes('rpc/bobby_set_device_internal')) return json(c.body.p_prefix === 'abcdef1234' ? 1 : 0);
  if (c.url.includes('rpc/bobby_admin_internal_networks')) return json([{ network: 'netprefix0', note: 'admin session', createdAt: '2026-10-01T22:00:00Z', lastSeenAt: '2026-10-01T22:00:00Z', installs: 2, onlyByNetwork: 0 }]);
  if (c.url.includes('rpc/bobby_ignore_internal_network')) return json(c.body.p_prefix === 'netprefix0' ? 1 : 0);
  if (c.url.includes('bobby_internal_marks') && c.method === 'GET') return json([]);
  if (c.url.includes('bobby_internal_marks') || c.url.includes('bobby_internal_networks')) return new Response(null, { status: 201 });
  if (c.url.includes('bobby_admin_settings?key=eq.internal_emails')) return json([{ value: ['me@example.com'] }]);
  if (c.url.includes('rpc/bobby_admin_economics')) return json({ days: 30, since: '2026-09-02T00:00:00Z',
    revenue: { grossUsd: 49.9, netUsd: 42.415, refundsUsd: 0, newPaying: 10, initialPurchases30d: 10, expirations30d: 0, lastPriceUsd: 4.99, takehome: 0.85 },
    costs: { marketingUsd: 100, infraUsd: 20, otherUsd: 0, byChannel: [{ channel: 'tiktok', usd: 100 }] },
    subscriptions: { active: 10 }, newAccounts: 40, activeReaders30d: 50, llmUsd: 5, llm30dUsd: 5, assumptions: { monthlyChurn: 0.1 } });
  if (c.url.includes('bobby_purchase_events') || (c.url.includes('bobby_reads?select=created_at'))) return json([]);
  if (c.url.includes('bobby_admin_settings')) return new Response(null, { status: 201 });
  return json({ message: `unexpected ${c.method} ${c.url}` }, 500);
}) as typeof fetch;

const response = () => ({
  statusCode: 200, body: null as any, headers: {} as Record<string, string>,
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; },
  json(v: unknown) { this.body = v; return this; }, end() { return this; },
});
let ip = 10;
const call = async (method: string, auth: string | null, query: Record<string, string> = {}, body: unknown = undefined) => {
  calls = [];
  const res = response();
  await adminHandler({ method, query, body, headers: { 'x-forwarded-for': `10.0.0.${ip++}`, ...(auth ? { authorization: auth } : {}) } } as never, res as never);
  return res;
};
const audits = () => calls.filter((c) => c.url.includes('bobby_admin_actions') && c.method === 'POST').map((c) => c.body);
const finishes = () => calls.filter((c) => c.url.includes('bobby_admin_actions?id=eq.') && c.method === 'PATCH').map((c) => c.body);

try {
  // ---------- who gets in ----------
  eq((await call('GET', null, { view: 'me' })).statusCode, 401, 'signed out');
  const notAdmin = await call('GET', 'Bearer user-token', { view: 'overview' });
  eq([notAdmin.statusCode, notAdmin.body.error], [403, 'not_admin'], 'a regular account is not an admin');
  ok(!calls.some((c) => c.url.includes('rpc/bobby_admin_overview')), 'and reads nothing');
  overrides = (c) => (c.url.includes('bobby_admins?identity_id=eq.') ? json({ message: 'down' }, 500) : null);
  eq((await call('GET', 'Bearer admin-token', { view: 'me' })).statusCode, 503, 'the admin check fails closed');
  overrides = () => null;
  const me = await call('GET', 'Bearer admin-token', { view: 'me' });
  eq([me.statusCode, me.body.admin, me.body.identityId], [200, true, ADMIN], 'the owner is an admin');
  eq(me.headers['cache-control'], 'private, no-store', 'never cached');

  // ---------- views ----------
  const over = await call('GET', 'Bearer admin-token', { view: 'overview', days: '9999' });
  eq(over.statusCode, 200, 'overview');
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_overview'))?.body, { p_days: 365, p_internal: false }, 'the window is capped; the team is left out by default');
  ok(Array.isArray(over.body.insights) && over.body.growth?.people?.accounts === 3, 'the overview carries the growth view and its diagnosis');
  eq((await call('GET', 'Bearer admin-token', { view: 'overview', internal: '1' })).statusCode, 200, 'internal traffic on request');
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_growth'))?.body, { p_days: 30, p_internal: true }, 'growth follows the same switch');
  eq([over.body.integrations.revenuecat.configured, over.body.integrations.appStore.configured], [false, false], 'integrations report what is missing');
  ok(over.body.integrations.missing.includes('REVENUECAT_V2_SECRET_KEY') && over.body.integrations.missing.includes('ASC_KEY_ID'), 'missing env names');
  eq(typeof over.body.integrations.llmCaps.dayUsd, 'number', 'LLM caps');
  const cmp = await call('GET', 'Bearer admin-token', { view: 'overview', days: '60', compare: '1' });
  eq([cmp.statusCode, cmp.body.integrations, cmp.body.overview.accounts.total], [200, null, 6], 'the comparison request only reads the series');
  await call('GET', 'Bearer admin-token', { view: 'users', q: 'ana', limit: '9999' });
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_users'))?.body, { p_query: 'ana', p_limit: 200, p_offset: 0 }, 'users: query and page size capped');
  eq((await call('GET', 'Bearer admin-token', { view: 'nope' })).statusCode, 400, 'unknown view');

  // ---------- coupons ----------
  const made = await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', reads: 20, profundo: 3, maximo: 0, maxRedemptions: 15, expiresAt: null });
  eq(made.statusCode, 200, 'create a coupon');
  ok(/^BOBBY-[A-HJ-NP-Z2-9]{5}$/.test(made.body.coupon.code), 'a generated code');
  eq(audits()[0]?.action, 'create-coupon', 'audited');
  eq([audits()[0]?.detail.status, finishes()[0]?.detail.status, finishes()[0]?.detail.code], ['started', 'ok', made.body.coupon.code], 'written before, completed after');
  ok(calls.findIndex((c) => c.url.includes('bobby_admin_actions') && c.method === 'POST') < calls.findIndex((c) => c.url.includes('bobby_coupons') && c.method === 'POST'), 'the audit row precedes the change');
  overrides = (c) => (c.url.includes('bobby_admin_actions') && c.method === 'POST' ? json({ message: 'down' }, 500) : null);
  const noAudit = await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', reads: 5 });
  eq(noAudit.statusCode, 503, 'no audit row, no change');
  ok(!calls.some((c) => c.url.includes('bobby_coupons') && c.method === 'POST'), 'nothing was created');
  overrides = () => null;
  eq(audits()[0]?.admin_id, ADMIN, 'by whom');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', code: 'mi cupon', reads: 5 })).body.coupon.code, 'MICUPON', 'codes are normalized');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', reads: 0, profundo: 0, maximo: 0 })).statusCode, 400, 'an empty coupon');
  eq(finishes().at(-1)?.detail.status, 'failed', 'a refused change is recorded as failed');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', reads: 5000 })).statusCode, 400, 'out of range');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', reads: 5, expiresAt: '2020-01-01' })).statusCode, 400, 'a past expiry');
  overrides = (c) => (c.url.includes('bobby_coupons') && c.method === 'POST' ? json({ code: '23505' }, 409) : null);
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'create-coupon', code: 'TAKEN', reads: 5 })).statusCode, 409, 'a taken code');
  overrides = () => null;
  eq((await call('POST', 'Bearer user-token', {}, { action: 'create-coupon', reads: 5 })).statusCode, 403, 'a regular account cannot create coupons');

  // ---------- grants ----------
  const giftBody = (extra: Record<string, unknown> = {}) => ({ action: 'grant', operationId: randomUUID(), identityId: USER, ...extra });
  const firstGift = giftBody({ reads: 10 });
  const gift = await call('POST', 'Bearer admin-token', {}, firstGift);
  eq([gift.statusCode, gift.body.bonus.reads], [200, 10], 'a gift');
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_grant_once'))?.body, { p_operation: firstGift.operationId, p_admin: ADMIN, p_identity: USER, p_reads: 10, p_profundo: 0, p_maximo: 0, p_pro_days: 0 }, 'actor and operation come from verified admin and fixed intent');
  eq(audits().length, 0, 'grant uses the atomic RPC audit, not a separate HTTP audit');
  eq((await call('POST', 'Bearer admin-token', {}, giftBody())).statusCode, 400, 'an empty gift');
  eq((await call('POST', 'Bearer admin-token', {}, giftBody({ identityId: 'nope', reads: 1 }))).statusCode, 400, 'a malformed id');
  eq((await call('POST', 'Bearer admin-token', {}, giftBody({ identityId: '0b8f0a52-0000-4000-8000-000000000000', reads: 1 }))).statusCode, 404, 'an unknown account');
  for (const operationId of [undefined, '', 'nope', '00000000-0000-0000-0000-000000000000']) {
    eq((await call('POST', 'Bearer admin-token', {}, giftBody({ operationId, reads: 1 }))).statusCode, 400, 'missing/malformed operation rejected');
    ok(!calls.some((c) => c.url.includes('rpc/bobby_admin_grant')), 'invalid operation never mutates');
  }
  for (const [field, value] of [['reads', -1], ['reads', 1.5], ['reads', 1001], ['profundo', 201], ['maximo', 101], ['proDays', 367], ['reads', 'not-a-number']]) {
    eq((await call('POST', 'Bearer admin-token', {}, giftBody({ [field]: value }))).statusCode, 400, `invalid grant ${field}=${value}`);
    ok(!calls.some((c) => c.url.includes('rpc/bobby_admin_grant')), 'invalid grant never reaches the mutation');
  }
  const forbiddenGift = await call('POST', 'Bearer user-token', {}, giftBody({ reads: 10 }));
  eq(forbiddenGift.statusCode, 403, 'non-admin cannot gift to itself');
  ok(!calls.some((c) => c.url.includes('rpc/bobby_admin_grant') || c.url.includes('bobby_admin_actions')), 'non-admin neither mutates nor creates a grant audit');
  overrides = (c) => c.url.includes('rpc/bobby_admin_grant_once') ? json({ message: 'down' }, 500) : null;
  eq((await call('POST', 'Bearer admin-token', {}, giftBody({ reads: 10 }))).statusCode, 502, 'transaction storage failure is visible to the caller');
  eq(audits().length, 0, 'failure does not create a misleading separate benefit audit');
  overrides = () => null;
  const retryGift = giftBody({ reads: 5 });
  const beforeLost = [giftedReads, grantAudits];
  overrides = (c) => {
    if (!c.url.includes('rpc/bobby_admin_grant_once')) return null;
    grantRpc(c); // SQL committed, then the response was lost.
    throw new Error('lost response');
  };
  eq((await call('POST', 'Bearer admin-token', {}, retryGift)).statusCode, 502, 'lost DB response is ambiguous');
  overrides = () => null;
  const recoveredGift = await call('POST', 'Bearer admin-token', {}, retryGift);
  eq(recoveredGift.statusCode, 200, 'same operation safely recovers its receipt');
  eq([giftedReads, grantAudits], [beforeLost[0] + 5, beforeLost[1] + 1], 'retry adds one gift and one audit only');
  eq((await call('POST', 'Bearer admin-token', {}, { ...retryGift, reads: 6 })).statusCode, 409, 'same operation with different payload is refused');
  eq([giftedReads, grantAudits], [beforeLost[0] + 5, beforeLost[1] + 1], 'conflicting payload adds no gift or audit');
  overrides = (c) => c.url.includes('rpc/bobby_admin_grant_once') ? json({ ok: false, error: 'not_admin' }) : null;
  eq((await call('POST', 'Bearer admin-token', {}, giftBody({ reads: 1 }))).statusCode, 403, 'SQL role removal is respected');
  overrides = (c) => c.url.includes('rpc/bobby_admin_grant_once') ? json({ ok: true, operationId: randomUUID() }) : null;
  eq((await call('POST', 'Bearer admin-token', {}, giftBody({ reads: 1 }))).statusCode, 502, 'unmatched receipt is never reported as confirmed');
  overrides = () => null;
  overrides = (c) => c.url.includes('rpc/bobby_admin_grant_once') ? json({ ok: false, error: 'paid_period_end_unknown' }) : null;
  const unknownPaidEnd = await call('POST', 'Bearer admin-token', {}, giftBody({ reads: 3, proDays: 7 }));
  eq([unknownPaidEnd.statusCode, unknownPaidEnd.body.error], [409, 'paid_period_end_unknown'],
    'an open paid period rejects mixed credits and Pro time with a specific recoverable error');
  overrides = () => null;

  // The same account's access response carries the active Pro grant expiry and its DB source.
  const { referralStatus } = await import('../api/_lib/referrals.ts');
  const proUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
  overrides = (c) => c.url.includes('bobby_referral_codes?') ? json([{ code: 'ABCDEFGH' }])
    : c.url.includes('bobby_referrals?') ? json([])
      : c.url.includes('bobby_pro_grants?') ? json([{ pro_until: proUntil, source: 'admin' }]) : null;
  const grantStatus = await referralStatus(USER, 'https://bobbyprotocol.xyz');
  eq([grantStatus.proUntil, grantStatus.proSource], [proUntil, 'admin'], 'access exposes the active admin grant and expiry');
  ok(calls.some((c) => c.url.includes('bobby_pro_grants?') && c.url.includes('select=pro_until,source')),
    'the source comes from the grant table');
  overrides = (c) => c.url.includes('bobby_referral_codes?') ? json([{ code: 'ABCDEFGH' }])
    : c.url.includes('bobby_referrals?') ? json([])
      : c.url.includes('bobby_pro_grants?') ? json([{ pro_until: '2020-01-01T00:00:00Z', source: 'admin' }]) : null;
  const expiredGrantStatus = await referralStatus(USER, 'https://bobbyprotocol.xyz');
  eq([expiredGrantStatus.proUntil, expiredGrantStatus.proSource], [null, null], 'expired gifts are not presented as active');
  overrides = () => null;

  // ---------- deletion ----------
  const wrong = await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: USER, confirm: 'someone@else.com' });
  eq(wrong.statusCode, 400, 'deletion needs the typed email');
  ok(!calls.some((c) => c.method === 'DELETE'), 'and deletes nothing');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: ADMIN, confirm: 'owner@example.com' })).statusCode, 400, 'never yourself');
  // A card plan that may still charge is cancelled at Stripe before anything is deleted; if Stripe cannot confirm, nothing is.
  process.env.STRIPE_SECRET_KEY = 'sk_test_admin';
  subscriptionRows = [{ identity_id: USER, provider: 'stripe', status: 'active', stripe_subscription_id: 'sub_live', stripe_customer_id: 'cus_1' }];
  stripeDown = true;
  const blocked = await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: USER, confirm: 'reader@example.com' });
  eq(blocked.statusCode, 503, 'Stripe cannot confirm the cancellation: the deletion stops');
  ok(!calls.some((c) => c.method === 'DELETE' && !c.url.startsWith('https://api.stripe.com/')), 'and nothing of ours is deleted');
  stripeDown = false; stripeCalls.length = 0;
  const gone = await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: USER, confirm: 'Reader@Example.com' });
  ok(stripeCalls.includes('DELETE /v1/subscriptions/sub_live'), 'the live card plan is cancelled at Stripe first');
  subscriptionRows = []; delete process.env.STRIPE_SECRET_KEY;
  eq(gone.statusCode, 200, 'an account is deleted');
  const order = calls.map((c) => `${c.method} ${c.url.replace(/^https:\/\/db\.test/, '')}`).filter((s) => /agent_trades|bobby_identities\?id|auth\/v1\/admin/.test(s));
  eq(order.map((s) => s.split('?')[0]), ['GET /rest/v1/bobby_identities', 'DELETE /auth/v1/admin/users/' + USER_AUTH, 'PATCH /rest/v1/agent_trades', 'DELETE /rest/v1/bobby_identities'], 'sign-in first (a failure leaves everything for the retry), then trades de-linked, then data');
  eq(audits().at(-1)?.action, 'delete-user', 'audited');
  ok(!('confirm' in (audits().at(-1)?.detail ?? {})), 'the typed confirmation is not stored');
  eq(finishes().at(-1)?.detail.account, 'reader@example.com', 'the outcome names the account');

  // ---------- admins, credit, probe ----------
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-admin', identityId: ADMIN, admin: false })).statusCode, 400, 'you cannot remove your own role');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'credit-mark', provider: 'openai', kind: 'balance', amountUsd: 15 })).statusCode, 200, 'a balance mark');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'credit-mark', provider: 'gemini', kind: 'balance', amountUsd: 15 })).statusCode, 400, 'unknown provider');
  overrides = (c) => (c.url.includes('api.anthropic.com') ? json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. PRIVATE' } }, 400) : null);
  const probe = await call('POST', 'Bearer admin-token', {}, { action: 'probe-llm', provider: 'anthropic' });
  eq([probe.body.status, probe.body.httpStatus, probe.body.code], ['no_credit', 400, 'insufficient_quota'], 'an exhausted provider');
  ok(!JSON.stringify(probe.body).includes('PRIVATE'), 'the provider message is not echoed');
  eq(calls.find((c) => c.url.includes('api.anthropic.com'))?.body.max_tokens, 1, 'a one-token probe');
  overrides = (c) => (c.url.includes('api.openai.com') ? json({ id: 'x', choices: [] }) : null);
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'probe-llm', provider: 'openai' })).body.status, 'ok', 'a provider with credit');
  overrides = () => null;
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'nope' })).statusCode, 400, 'unknown action');

  // ---------- App Store sales report ----------
  const header = 'Provider\tProvider Country\tSKU\tDeveloper\tTitle\tVersion\tProduct Type Identifier\tUnits\tDeveloper Proceeds\tBegin Date\tEnd Date\tCustomer Currency\tCountry Code\tCurrency of Proceeds\tApple Identifier\tCustomer Price\tPromo Code\tParent Identifier';
  const row = (type: string, units: number, apple: string, parent = '', cc = 'MX') => ['APPLE', 'US', 'sku', 'dev', 'Bobby', '1.5', type, units, '0', '', '', 'USD', cc, 'USD', apple, '0', '', parent].join('\t');
  const sales = parseSalesReport([header, row('1F', 4, '6804460489'), row('1', 3, '6804460489', '', 'es'), row('1F', 9, '999', '', 'US'), row('3F', 2, '6804460489'), row('7F', 5, '6804460489'),
    row('IAY', 1, '6817775464', 'bobby.sku'), row('IAY', 9, '555', 'other.app.sku')].join('\n'), '6804460489', new Set(['6817775464']));
  eq(sales, { downloads: 7, redownloads: 2, updates: 5, iap: 1, countries: { MX: 4, ES: 3 } }, 'downloads of this app only, by storefront country; only our subscription counts as IAP');
  assert.throws(() => parseSalesReport('garbage', '1')); checks++;

  // ---------- lifecycle and unit economics ----------
  const members = await call('GET', 'Bearer admin-token', { view: 'members' });
  eq([members.statusCode, members.body.subscriptions.length], [200, 1], 'members: every subscription, server side');
  const over2 = await call('GET', 'Bearer admin-token', { view: 'overview', days: '7' });
  eq([over2.body.integrations.health.vercelAnalytics, over2.body.integrations.health.llmKeys], ['unverified', { anthropic: true, openai: true }], 'health is reported, not assumed');
  ok(over2.body.integrations.missing.includes('REVENUECAT_SECRET_KEY') && over2.body.integrations.missing.includes('REVENUECAT_WEBHOOK_AUTH'), 'webhook secrets are checked');
  eq(over2.body.integrations.health.revenuecatWebhook.configured, false, 'webhook not configured without its secrets');
  const life = await call('GET', 'Bearer admin-token', { view: 'lifecycle', days: '30' });
  eq([life.statusCode, life.body.searchConsole.configured, life.body.appStore.configured], [200, false, false], 'lifecycle view: economics and the providers');
  eq([life.body.instrumentation.iosPaywall, life.body.instrumentation.deskOutcomes], [false, true], 'what is measured');
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_economics'))?.body, { p_days: 30, p_internal: false }, 'economics leaves the team out');
  const ue = life.body.economics;
  eq([ue.revenue.mrrGrossUsd, ue.revenue.mrrNetUsd, ue.acquisition.cacPerPaying, ue.acquisition.cacPerAccount], [49.9, 42.42, 10, 2.5], 'MRR and CAC (marketing / new payers, / new accounts)');
  eq([ue.ltv.monthlyChurn, ue.ltv.churnSource, ue.ltv.lifetimeMonths, ue.ltv.monthlyLlmPerUserUsd], [0.1, 'assumed', 10, 0.1], 'churn from the assumption until there are 5+ subscriptions at the start; LLM cost per active reader');
  eq([ue.ltv.monthlyContributionUsd, ue.ltv.ltvUsd, ue.ltv.ltvToCac, ue.ltv.paybackMonths], [4.14, 41.42, 4.14, 2.4], 'LTV = (net price - LLM per user) / churn; LTV:CAC; payback');
  eq([ue.costs.totalUsd, ue.roi.profitUsd, ue.roi.roi], [125, -82.58, -0.6607], 'ROI = (net revenue - all costs) / all costs');
  eq(ue.ltv.scenario, true, 'no payer on record: the LTV is a scenario');
  const zeroFee = unitEconomics({ days: 30, since: '2026-09-02T00:00:00Z', revenue: { grossUsd: 0, netUsd: 0, refundsUsd: 0, newPaying: 0, payersEver: 2, initialPurchases30d: 0, expirations30d: 0, lastPriceUsd: null, takehome: null },
    costs: { marketingUsd: 0, infraUsd: 0, otherUsd: 0, byChannel: [] }, subscriptions: { active: 1, trialing: 1 }, newAccounts: 0, activeReaders30d: 0, llmUsd: 0, llm30dUsd: 0, assumptions: { storeFee: 0, priceUsd: 5 } });
  eq([zeroFee.revenue.takehome, zeroFee.revenue.mrrGrossUsd, zeroFee.revenue.trialing, zeroFee.ltv.scenario, zeroFee.revenue.priceSource], [1, 5, 1, false, 'assumed'], 'a saved 0% fee stays 0%; trials are not MRR');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'add-cost', kind: 'marketing', channel: 'TikTok Ads', amountUsd: 50, spentOn: '2026-09-30' })).statusCode, 200, 'record a marketing cost');
  eq(calls.find((c) => c.url.includes('bobby_costs') && c.method === 'POST')?.body.channel, 'tiktok-ads', 'channel normalized');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'add-cost', kind: 'ads', amountUsd: 50 })).statusCode, 400, 'unknown cost kind');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'add-cost', kind: 'infra', amountUsd: 50, spentOn: '2999-01-01' })).statusCode, 400, 'a future date');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-assumptions', monthlyChurn: 0.08, storeFee: 0.15 })).statusCode, 200, 'assumptions');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-assumptions', monthlyChurn: 3 })).statusCode, 400, 'churn out of range');

  // ---------- App Store env values pasted with extra text ----------
  eq(ascVendor('GUILLERMO ANTHONY CHAVEZ\n89123456\n'), '89123456', 'the vendor number is the digits');
  eq(ascVendor(''), '', 'no vendor number');
  eq(ascKeyId('NY8UQFG6TM\n'), 'NY8UQFG6TM', 'the key id without a line break');
  eq(ascKeyId('-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMG\n-----END PRIVATE KEY-----'), '', 'a private key is not a key id');
  eq(ascIssuer(' bccd998d-3e28-47e6-8e08-bf1894bc6070 \n'), 'bccd998d-3e28-47e6-8e08-bf1894bc6070', 'the issuer id');

  // ---------- audience location ----------
  eq(requestGeo({ headers: { 'x-vercel-ip-country': 'mx', 'x-vercel-ip-country-region': 'cmx', 'x-vercel-ip-city': 'Coyoac%C3%A1n' } }), { country: 'MX', region: 'CMX' }, 'country + region from Vercel, never the city');
  eq(requestGeo({ headers: { 'x-vercel-ip-country-region': 'CMX' } }), { country: null, region: null }, 'no region without a country');
  eq(requestGeo({ headers: { 'x-vercel-ip-country': 'XX', 'x-vercel-ip-country-region': 'A' } }), { country: null, region: null }, 'unknown country');
  eq([fromAlpha3('mex'), fromAlpha3('USA'), fromAlpha3('abw'), fromAlpha3('zzz'), fromAlpha3('x')], ['MX', 'US', 'ABW', null, null], 'Search Console alpha-3 → alpha-2, unknown passes through');
  eq([countryCode('br'), countryCode('BRA'), countryCode(7)], ['BR', null, null], 'store country codes');
  const aud = await call('GET', 'Bearer admin-token', { view: 'audience', days: '30' });
  eq([aud.statusCode, aud.body.geo.web.located, aud.body.geo.countries[0].country], [200, 2, 'MX'], 'audience view: first-party location');
  eq([aud.body.searchConsole.configured, aud.body.appStore.configured], [false, false], 'audience view: providers report whether they are connected');
  eq((await call('GET', 'Bearer user-token', { view: 'audience' })).statusCode, 403, 'audience is admin only');

  // ---------- track ----------
  const t = normalizeEvent({ event: 'visit', surface: 'desk', device: '0d6e4a52-7c1b-4f0e-9a51-2b7e1c9d3f10', referrer: 'https://www.X.com/some/path?q=secret', utm: 'Newsletter' })!;
  eq([t.event, t.platform, t.surface, t.referrer, t.utm_source], ['visit', 'web', 'desk', 'x.com', 'newsletter'], 'host only, lowercase');
  ok(t.device_hash && !t.device_hash.includes('0d6e4a52'), 'the install id is hashed');
  eq(normalizeEvent({ event: 'visit', referrer: 'https://bobbyprotocol.xyz/desk' })!.referrer, null, 'own pages are not referrers');
  eq(normalizeEvent({ event: 'drop table' }), null, 'unknown events');
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36', 'Chrome-Lighthouse', 'curl/8.4.0', '', undefined]) {
    eq(isBotUserAgent(ua), true, `bot user agent: ${String(ua).slice(0, 30)}`);
  }
  for (const ua of ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0', 'Bobby/52 CFNetwork/1568 Darwin/24.0.0']) {
    eq(isBotUserAgent(ua), false, `real user agent: ${ua.slice(0, 30)}`);
  }
  {
    const a = toAmplitude({ id: 42, at: '2026-10-02T07:18:15Z', event: 'read_done', platform: 'ios', surface: null, device: 'abc123devicehash', identity: '3c2a301a-d9a2-4ad3-90f0-357d29d8a122', referrer: 'x.com', utm: 'tiktok', country: 'MX', region: 'JAL', detail: 'rapido' });
    eq([a.event_type, a.device_id, a.user_id, a.time, a.insert_id, a.platform, a.country, a.region], ['read_done', 'abc123devicehash', '3c2a301a-d9a2-4ad3-90f0-357d29d8a122', Date.parse('2026-10-02T07:18:15Z'), 'bobby-42', 'ios', 'MX', 'JAL'], 'amplitude event mapping');
    eq(a.event_properties, { platform: 'ios', referrer: 'x.com', utm_source: 'tiktok', detail: 'rapido' }, 'amplitude properties carry only stored fields');
    const g = toAmplitude({ id: 7, at: '2026-10-02T07:18:15Z', event: 'visit', platform: 'web', surface: 'home', device: 'abc123devicehash', identity: null, referrer: null, utm: null, country: null, region: null, detail: null });
    eq(['user_id' in g, 'country' in g], [false, false], 'guest without location sends no user_id or country');
  }
  eq(normalizeEvent({ event: 'visit', surface: '../../etc', device: 'short' })!.surface, null, 'bad surface dropped');
  calls = [];
  const tr = response();
  await trackHandler({ method: 'POST', body: JSON.stringify({ event: 'appstore_click', surface: 'home' }), headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 'x-forwarded-for': '10.1.1.1', 'x-vercel-ip-country': 'MX', 'x-vercel-ip-country-region': 'JAL' } } as never, tr as never);
  eq(tr.statusCode, 204, 'a beacon (text/plain body) is accepted');
  const stored = calls.find((c) => c.url.includes('rpc/bobby_record_event'))?.body;
  eq([stored?.p_event, stored?.p_surface, stored?.p_platform, stored?.p_country, stored?.p_region], ['appstore_click', 'home', 'web', 'MX', 'JAL'], 'stored with its device touch and coarse location in one call');
  ok(!JSON.stringify(stored).includes('10.1.1.1'), 'the IP is never stored');
  calls = [];
  await trackHandler({ method: 'POST', body: JSON.stringify({ event: 'visit', platform: 'ios' }), headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 'x-forwarded-for': '10.1.1.3', 'x-vercel-ip-country': 'MX' } } as never, response() as never);
  const iosStored = calls.find((c) => c.url.includes('rpc/bobby_record_event'))?.body;
  eq([iosStored?.p_platform, 'p_country' in (iosStored ?? {})], ['ios', false], 'iOS events carry no location');
  const bad = response();
  await trackHandler({ method: 'POST', body: '{"event":"nope"}', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 'x-forwarded-for': '10.1.1.2' } } as never, bad as never);
  eq(bad.statusCode, 400, 'unknown events are refused');
  ok(stored?.p_network && !String(stored.p_network).includes('10.1.1'), 'the network travels as a salted hash');
  overrides = (c) => (c.url.includes('rpc/bobby_record_event') ? json({ message: 'down' }, 500) : null);
  calls = [];
  const lost = response();
  await trackHandler({ method: 'POST', body: JSON.stringify({ event: 'visit', surface: 'home' }), headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 'x-forwarded-for': '10.1.1.4' } } as never, lost as never);
  eq(lost.statusCode, 503, 'a lost event is not reported as stored');
  eq(calls.find((c) => c.url.includes('api_cache') && c.method === 'POST')?.body?.cache_key, 'track-health', 'and the owner can see it');
  overrides = () => null;

  // ---------- internal traffic ----------
  const DEVICE = '0d6e4a52-7c1b-4f0e-9a51-2b7e1c9d3f10';
  calls = [];
  const resMark = response();
  await adminHandler({ method: 'GET', query: { view: 'me' }, headers: { 'x-forwarded-for': '10.9.9.9', authorization: 'Bearer admin-token', 'x-bobby-device': DEVICE } } as never, resMark as never);
  await new Promise((r) => setTimeout(r, 10));
  const mark = calls.find((c) => c.url.includes('rpc/bobby_mark_admin_session'))?.body;
  ok(mark?.p_device && mark?.p_network && !JSON.stringify(mark).includes(DEVICE) && !JSON.stringify(mark).includes('10.9.9'), 'an /admin session marks its install and network as internal, hashed');
  const setInt = await call('POST', 'Bearer admin-token', {}, { action: 'set-internal', identityId: USER, internal: true });
  eq([setInt.statusCode, audits().at(-1)?.action], [200, 'set-internal'], 'mark an account internal (audited)');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-device-internal', device: 'abcdef1234', internal: true })).statusCode, 200, 'mark an install by its prefix');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-device-internal', device: 'zzzzzzzzzz', internal: true })).statusCode, 404, 'an unknown install');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-device-internal', device: 'short', internal: true })).statusCode, 400, 'a malformed prefix');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'set-internal-emails', emails: ['not an email'] })).statusCode, 400, 'emails are validated');
  const em = await call('POST', 'Bearer admin-token', {}, { action: 'set-internal-emails', emails: [' Me@Example.com ', 'me@example.com', 'you@example.org'] });
  eq([em.statusCode, em.body.emails], [200, ['me@example.com', 'you@example.org']], 'emails normalized and deduplicated');
  const iv = await call('GET', 'Bearer admin-token', { view: 'internal' });
  eq([iv.statusCode, iv.body.networks[0].network, iv.body.emails], [200, 'netprefix0', ['me@example.com']], 'the internal view never exposes a full network hash');
  eq((await call('GET', 'Bearer user-token', { view: 'internal' })).statusCode, 403, 'internal view is admin only');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'remove-internal-network', network: 'netprefix0' })).statusCode, 200, 'remove a team network');
  eq(calls.find((c) => c.url.includes('rpc/bobby_ignore_internal_network'))?.body, { p_prefix: 'netprefix0' }, 'kept as ignored, so /admin does not add it back');
  ok(!calls.some((c) => c.url.includes('bobby_internal_networks') && c.method === 'DELETE'), 'never deleted');

  // ---------- the daily digest ----------
  process.env.CRON_SECRET = 'cron-test-secret';
  const cronNoAuth = response();
  await adminHandler({ method: 'GET', query: { cron: 'digest' }, headers: { 'x-forwarded-for': '10.7.7.1' } } as never, cronNoAuth as never);
  eq(cronNoAuth.statusCode, 401, 'the digest cron needs the cron secret');
  calls = [];
  const cronOk = response();
  await adminHandler({ method: 'GET', query: { cron: 'digest' }, headers: { 'x-forwarded-for': '10.7.7.2', authorization: 'Bearer cron-test-secret' } } as never, cronOk as never);
  eq([cronOk.statusCode, typeof cronOk.body?.sent], [200, 'boolean'], 'the cron builds the digest from the dashboard figures');
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_overview'))?.body, { p_days: 7, p_internal: false }, 'last 7 days, outside traffic');
  const prev = await call('POST', 'Bearer admin-token', {}, { action: 'preview-digest' });
  ok(prev.statusCode === 200 && typeof prev.body.text === 'string' && prev.body.text.includes('bobbyprotocol.xyz/admin'), 'an admin can preview the email');
  delete process.env.CRON_SECRET;

  // ---------- deletion is retry-safe ----------
  overrides = (c) => (c.url.includes('/auth/v1/admin/users/') ? json({ msg: 'down' }, 500) : null);
  const delFail = await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: USER, confirm: 'reader@example.com' });
  eq(delFail.statusCode, 502, 'the sign-in could not be deleted');
  ok(!calls.some((c) => c.url.includes(`bobby_identities?id=eq.${USER}`) && c.method === 'DELETE'), 'so the Bobby data was left in place for the retry');
  overrides = () => null;

  // ---------- the diagnosis ----------
  const NOW = Date.parse('2026-10-02T09:00:00Z');
  const ins = buildInsights({ days: 30, now: NOW,
    overview: { llm: { providers: { openai: { lastCreditAlert: '2026-10-01T12:50:00Z', creditAlert: { code: 'insufficient_quota', endpoint: 'tts' }, lastOk: '2026-09-30T14:13:00Z', failures24h: 0, calls24h: 0 },
      anthropic: { lastOk: '2026-10-01T17:30:00Z', calls24h: 4, failures24h: 0 } }, deskRuns: { runs: 24, finished: 15 } }, subscriptions: { paid: 0 }, revenue: { grossUsd: 0 } },
    growth: { people: { accounts: 4, active7d: 6 }, cohorts: { web: { arrived: 3, deskOrRead: 1, read1: 1 }, ios: { arrived: 4 } }, history: { ios: { installs: 0 } },
      outcomes: { consumedTotal: 27, consumedInternal: 5, blocked: {} }, acquisition: { visits: 4, visitors: 3, visitsWithUtm: 0 },
      attention: { neverRead: [{ identityId: '868fbd4b-0000', provider: 'apple', createdAt: '2026-09-17T04:57:00Z' }], quiet: [] }, coverage: { webObservedSince: '2026-10-01T16:37:00Z' } },
    integrations: { paywall: false, appStore: { configured: true, totals: { downloads: 15 }, byCountry: [{ country: 'FR', downloads: 8 }, { country: 'MX', downloads: 3 }], coveredFrom: '2026-09-02', coveredTo: '2026-09-30' },
      health: { tracking: {}, revenuecatWebhook: { configured: true }, stripe: { configured: false } }, llmCaps: { monthUsd: 300 }, llmGuard: { monthUsd: 1 } },
    searchConsole: { configured: false } });
  const ids = ins.map((i) => i.id);
  eq(ins[0].id, 'credit-openai', 'an exhausted provider comes first');
  for (const id of ['desk-failures', 'low-traffic', 'ios-gap', 'accounts-never-read', 'utm-missing', 'appstore-country', 'web-cannot-pay', 'paywall-off', 'no-payers', 'coverage']) ok(ids.includes(id), `diagnosis: ${id}`);
  ok(!ids.includes('internal-share'), 'internal share under 25% is not raised');
  ok(ins.every((i) => i.title && i.action && Array.isArray(i.evidence)), 'every insight says what to do and why');
  const topped = buildInsights({ days: 30, now: NOW, overview: { llm: { providers: { openai: { lastCreditAlert: '2026-10-01T12:50:00Z', lastTopup: '2026-10-01T14:00:00Z', lastOk: '2026-10-01T15:00:00Z' } } } }, growth: {}, integrations: {}, searchConsole: {} });
  ok(!topped.some((i) => i.id === 'credit-openai'), 'a top-up after the alert clears it');
  const healedRun = buildInsights({ days: 30, now: NOW, overview: { llm: { deskRuns: { runs: 24, finished: 14, byDay: [{ day: '2026-09-30', runs: 1, finished: 0 }, { day: '2026-10-01', runs: 1, finished: 1 }] },
    providers: { openai: { lastFailure: { at: '2026-10-01T10:27:00Z', stop: 'http_429', surface: 'desk' } }, anthropic: { lastOk: '2026-10-01T17:30:00Z' } } } }, growth: {}, integrations: {}, searchConsole: {} });
  eq(healedRun.find((i) => i.id === 'desk-failures')?.level, 'info', 'failures followed by a successful call are history, not urgent');

  // ---------- dev dashboard fixture follows the same durable acknowledgement ----------
  const { mockAdminFetch } = await import('../src/components/admin/bobby/mock.ts');
  const queryUsers = new URLSearchParams({ view: 'users', limit: '200' });
  const fixtureUsers = (await (await mockAdminFetch('grant-lost', 'GET', queryUsers)).json()).users;
  const fixtureUser = fixtureUsers.find((u: { is_admin: boolean }) => !u.is_admin);
  const fixtureGift = { action: 'grant' as const, operationId: randomUUID(), identityId: fixtureUser.id, reads: 5 };
  eq((await mockAdminFetch('grant-lost', 'POST', null, fixtureGift)).status, 502, 'dev fault loses the first receipt after mutation');
  const fixtureRecovered = await mockAdminFetch('grant-lost', 'POST', null, fixtureGift);
  eq([fixtureRecovered.status, (await fixtureRecovered.json()).operationId], [200, fixtureGift.operationId], 'dev retry acknowledges the original intent');
  const fixtureAfter = (await (await mockAdminFetch('grant-lost', 'GET', queryUsers)).json()).users.find((u: { id: string }) => u.id === fixtureUser.id);
  eq(fixtureAfter.bonus_reads, (fixtureUser.bonus_reads ?? 0) + 5, 'dev retry adds one gift only');
  const fixtureActions = (await (await mockAdminFetch('grant-lost', 'GET', new URLSearchParams({ view: 'actions' }))).json()).actions;
  eq(fixtureActions.filter((a: { detail: { operationId?: string } }) => a.detail.operationId === fixtureGift.operationId).length, 1, 'dev retry has one benefit audit');
  eq((await mockAdminFetch('grant-lost', 'POST', null, { ...fixtureGift, reads: 6 })).status, 409, 'dev fixture refuses a changed retry payload');

  console.log(`admin-api: ${checks} checks passed`);
} finally {
  // nothing to restore: the process ends here
}
