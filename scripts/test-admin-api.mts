// /api/admin and /api/track with a mocked backend: only signed-in Apple/Google accounts in bobby_admins get in;
// every change leaves an audit row; deletion needs the typed email and never deletes yourself; coupon and
// grant input is validated; the App Store sales parser and the track normalizer keep only what they should.
import assert from 'node:assert/strict';

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
const { default: trackHandler, normalizeEvent } = await import('../api/track.ts');
const { parseSalesReport, ascVendor, ascKeyId, ascIssuer } = await import('../api/_lib/admin.ts');

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
  if (c.url.includes('rpc/bobby_admin_grant')) return json({ ok: true, bonus: { reads: c.body.p_reads, profundo: 0, maximo: 0 }, proUntil: null });
  if (c.url.includes('agent_trades?user_id=eq.') || c.url.includes('bobby_identities?id=eq.')) return new Response(null, { status: 204 });
  if (c.url.includes('/auth/v1/admin/users/')) return json({});
  if (c.url.includes('bobby_llm_credit_marks') || c.url.includes('bobby_events') || c.url.includes('bobby_costs') && c.method === 'POST') return new Response(null, { status: 201 });
  if (c.url.includes('rpc/bobby_record_event')) return new Response(null, { status: 204 });
  if (c.url.includes('rpc/bobby_admin_lifecycle')) return json({ since: new Date(Date.now() - 2 * 86_400_000).toISOString(), web: { devices: 3 }, ios: { devices: 1 }, stages: { total: 4 } });
  if (c.url.includes('rpc/bobby_admin_economics')) return json({ days: 30, since: '2026-09-02T00:00:00Z',
    revenue: { grossUsd: 49.9, netUsd: 42.415, refundsUsd: 0, newPaying: 10, initialPurchases30d: 10, expirations30d: 0, lastPriceUsd: 4.99, takehome: 0.85 },
    costs: { marketingUsd: 100, infraUsd: 20, otherUsd: 0, byChannel: [{ channel: 'tiktok', usd: 100 }] },
    subscriptions: { active: 10 }, newAccounts: 40, activeReaders30d: 50, llmUsd: 5, llm30dUsd: 5, assumptions: { monthlyChurn: 0.1 } });
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
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_overview'))?.body, { p_days: 365 }, 'the window is capped');
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
  const gift = await call('POST', 'Bearer admin-token', {}, { action: 'grant', identityId: USER, reads: 10 });
  eq([gift.statusCode, gift.body.bonus.reads], [200, 10], 'a gift');
  eq(calls.find((c) => c.url.includes('rpc/bobby_admin_grant'))?.body, { p_identity: USER, p_reads: 10, p_profundo: 0, p_maximo: 0, p_pro_days: 0 }, 'the grant call');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'grant', identityId: USER })).statusCode, 400, 'an empty gift');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'grant', identityId: 'nope', reads: 1 })).statusCode, 400, 'a malformed id');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'grant', identityId: '0b8f0a52-0000-4000-8000-000000000000', reads: 1 })).statusCode, 404, 'an unknown account');

  // ---------- deletion ----------
  const wrong = await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: USER, confirm: 'someone@else.com' });
  eq(wrong.statusCode, 400, 'deletion needs the typed email');
  ok(!calls.some((c) => c.method === 'DELETE'), 'and deletes nothing');
  eq((await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: ADMIN, confirm: 'owner@example.com' })).statusCode, 400, 'never yourself');
  const gone = await call('POST', 'Bearer admin-token', {}, { action: 'delete-user', identityId: USER, confirm: 'Reader@Example.com' });
  eq(gone.statusCode, 200, 'an account is deleted');
  const order = calls.map((c) => `${c.method} ${c.url.replace(/^https:\/\/db\.test/, '')}`).filter((s) => /agent_trades|bobby_identities\?id|auth\/v1\/admin/.test(s));
  eq(order.map((s) => s.split('?')[0]), ['GET /rest/v1/bobby_identities', 'PATCH /rest/v1/agent_trades', 'DELETE /rest/v1/bobby_identities', 'DELETE /auth/v1/admin/users/' + USER_AUTH], 'trades de-linked, data, then sign-in');
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
  const row = (type: string, units: number, apple: string, parent = '') => ['APPLE', 'US', 'sku', 'dev', 'Bobby', '1.5', type, units, '0', '', '', 'USD', 'MX', 'USD', apple, '0', '', parent].join('\t');
  const sales = parseSalesReport([header, row('1F', 4, '6804460489'), row('1F', 9, '999'), row('3F', 2, '6804460489'), row('7F', 5, '6804460489'),
    row('IAY', 1, '6817775464', 'bobby.sku'), row('IAY', 9, '555', 'other.app.sku')].join('\n'), '6804460489', new Set(['6817775464']));
  eq(sales, { downloads: 4, redownloads: 2, updates: 5, iap: 1 }, 'downloads of this app only; only our subscription counts as IAP');
  assert.throws(() => parseSalesReport('garbage', '1')); checks++;

  // ---------- lifecycle and unit economics ----------
  const members = await call('GET', 'Bearer admin-token', { view: 'members' });
  eq([members.statusCode, members.body.subscriptions.length], [200, 1], 'members: every subscription, server side');
  const over2 = await call('GET', 'Bearer admin-token', { view: 'overview', days: '7' });
  eq([over2.body.integrations.health.vercelAnalytics, over2.body.integrations.health.llmKeys], ['unverified', { anthropic: true, openai: true }], 'health is reported, not assumed');
  ok(over2.body.integrations.missing.includes('REVENUECAT_SECRET_KEY') && over2.body.integrations.missing.includes('REVENUECAT_WEBHOOK_AUTH'), 'webhook secrets are checked');
  eq(over2.body.integrations.health.revenuecatWebhook.configured, false, 'webhook not configured without its secrets');
  const life = await call('GET', 'Bearer admin-token', { view: 'lifecycle', days: '30' });
  eq([life.statusCode, life.body.lifecycle.web.devices, life.body.searchConsole.configured, life.body.appStore.configured], [200, 3, false, false], 'lifecycle view');
  eq([life.body.instrumentation.iosPaywall, life.body.coverage.eventsSince], [false, '2026-10-01T12:00:00Z'], 'what is measured and since when');
  const ue = life.body.economics;
  eq([ue.revenue.mrrGrossUsd, ue.revenue.mrrNetUsd, ue.acquisition.cacPerPaying, ue.acquisition.cacPerAccount], [49.9, 42.42, 10, 2.5], 'MRR and CAC (marketing / new payers, / new accounts)');
  eq([ue.ltv.monthlyChurn, ue.ltv.churnSource, ue.ltv.lifetimeMonths, ue.ltv.monthlyLlmPerUserUsd], [0.1, 'assumed', 10, 0.1], 'churn from the assumption until there are 5+ subscriptions at the start; LLM cost per active reader');
  eq([ue.ltv.monthlyContributionUsd, ue.ltv.ltvUsd, ue.ltv.ltvToCac, ue.ltv.paybackMonths], [4.14, 41.42, 4.14, 2.4], 'LTV = (net price - LLM per user) / churn; LTV:CAC; payback');
  eq([ue.costs.totalUsd, ue.roi.profitUsd, ue.roi.roi], [125, -82.58, -0.6607], 'ROI = (net revenue - all costs) / all costs');
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

  // ---------- track ----------
  const t = normalizeEvent({ event: 'visit', surface: 'desk', device: '0d6e4a52-7c1b-4f0e-9a51-2b7e1c9d3f10', referrer: 'https://www.X.com/some/path?q=secret', utm: 'Newsletter' })!;
  eq([t.event, t.platform, t.surface, t.referrer, t.utm_source], ['visit', 'web', 'desk', 'x.com', 'newsletter'], 'host only, lowercase');
  ok(t.device_hash && !t.device_hash.includes('0d6e4a52'), 'the install id is hashed');
  eq(normalizeEvent({ event: 'visit', referrer: 'https://bobbyprotocol.xyz/desk' })!.referrer, null, 'own pages are not referrers');
  eq(normalizeEvent({ event: 'drop table' }), null, 'unknown events');
  eq(normalizeEvent({ event: 'visit', surface: '../../etc', device: 'short' })!.surface, null, 'bad surface dropped');
  calls = [];
  const tr = response();
  await trackHandler({ method: 'POST', body: JSON.stringify({ event: 'appstore_click', surface: 'home' }), headers: { 'x-forwarded-for': '10.1.1.1' } } as never, tr as never);
  eq(tr.statusCode, 204, 'a beacon (text/plain body) is accepted');
  const stored = calls.find((c) => c.url.includes('rpc/bobby_record_event'))?.body;
  eq([stored?.p_event, stored?.p_surface, stored?.p_platform], ['appstore_click', 'home', 'web'], 'stored with its device touch in one call');
  const bad = response();
  await trackHandler({ method: 'POST', body: '{"event":"nope"}', headers: { 'x-forwarded-for': '10.1.1.2' } } as never, bad as never);
  eq(bad.statusCode, 400, 'unknown events are refused');

  console.log(`admin-api: ${checks} checks passed`);
} finally {
  // nothing to restore: the process ends here
}
