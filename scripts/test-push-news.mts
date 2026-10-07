// Security and delivery regressions for product-news push. Transport doubles only: no APNs or production DB.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NEWS_COPY, NEWS_LANGUAGES, NEWS_MIN_BUILD, LANGUAGE_CAMPAIGN_ID, newsPayload, newsPushEnabled } from '../api/_lib/push-news/config.js';
import * as db from '../api/_lib/push-news/db.js';
import { BriefingStorageError } from '../api/_lib/briefings/db.js';
import { createPushNewsHandler, type PushNewsDeps } from '../api/push-news.js';
import { campaignCohortId, campaignDigest, runNewsCampaign, type NewsWorkerDeps } from '../api/_lib/push-news/worker.js';
import { encryptToken } from '../api/_lib/briefings/push-crypto.js';
import { APP_LOCALES, appLanguage } from '../src/lib/app-language.js';

let checks = 0;
const eq = (got: unknown, want: unknown, label: string) => { assert.deepEqual(got, want, label); checks++; };
const ok = (got: unknown, label: string) => { assert.ok(got, label); checks++; };
const rejects = async (p: Promise<unknown>, label: string) => { await assert.rejects(p, label); checks++; };
const logs: string[] = [];
const originalConsole = { error: console.error, warn: console.warn, info: console.info };
for (const key of ['error', 'warn', 'info'] as const) console[key] = (...values: unknown[]) => { logs.push(values.map(String).join(' ')); };
const originalFetch = globalThis.fetch;
const seen: Array<{ body: unknown; headers: Record<string, string> }> = [];
const secrets: string[] = [];

function response() {
  return {
    statusCode: 200, body: null as any, headers: {} as Record<string, string>,
    setHeader(name: string, value: string | number) { this.headers[name.toLowerCase()] = String(value); return this; },
    getHeader(name: string) { return this.headers[name.toLowerCase()]; },
    status(status: number) { this.statusCode = status; return this; },
    json(body: unknown) { this.body = body; return this; },
    end() { return this; },
  };
}
interface CallOptions {
  method?: string; query?: Record<string, unknown>; body?: unknown; rawBody?: unknown;
  headers?: Record<string, string | string[] | undefined>; token?: string | null;
}
async function call(handler: (req: any, res: any) => Promise<unknown>, op: string | null, options: CallOptions = {}) {
  const headers: Record<string, unknown> = { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.8.0.1' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value === undefined) delete headers[name.toLowerCase()];
    else headers[name.toLowerCase()] = value;
  }
  const req = {
    method: options.method ?? 'GET', headers,
    query: { ...(op ? { op } : {}), ...options.query },
    body: options.rawBody !== undefined ? options.rawBody : options.body === undefined ? undefined : JSON.stringify(options.body),
  };
  const res = response();
  await handler(req, res);
  seen.push({ body: res.body, headers: res.headers });
  return res;
}

try {
  eq(newsPushEnabled({}), false, 'news delivery disabled without an explicit server switch');
  for (const value of ['true', '1', 'enabled', 'ON', 'off']) eq(newsPushEnabled({ BOBBY_NEWS_PUSH_ENABLED: value }), false, `switch ${value} fails closed`);
  eq(newsPushEnabled({ BOBBY_NEWS_PUSH_ENABLED: 'on' }), true, 'explicit switch enables delivery');
  for (const language of NEWS_LANGUAGES) {
    const payload = newsPayload(LANGUAGE_CAMPAIGN_ID, language);
    eq(Object.keys(payload).sort(), ['aps', 'language', 'newsCampaignId', 'screen'], `${language}: only safe navigation metadata`);
    eq(payload, {
      aps: { alert: NEWS_COPY[language], sound: 'default', 'thread-id': 'bobby-news' },
      newsCampaignId: LANGUAGE_CAMPAIGN_ID, language, screen: 'language',
    }, `${language}: fixed localized announcement`);
  }
  ok(NEWS_COPY.pt.body !== NEWS_COPY['pt-BR'].body, 'Portugal and Brazilian Portuguese preserve their copy variants');

  // Typed RPC wrappers must preserve false/zero values and explicit filters, reject missing storage data,
  // and never consult a paid-Pro entitlement for product news.
  const rpcCalls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const A = randomUUID(), actor = randomUUID();
  const filters = { languages: ['de' as const], countries: ['DE'], minAppBuild: NEWS_MIN_BUILD, identityId: null };
  let returned: unknown = { revision: 0, newsEnabled: false, language: 'en', locale: 'en-US', consentVersion: null };
  db.setPushNewsRpc(async (name, body) => { rpcCalls.push({ name, body }); return returned; });
  eq(await db.getSettings(A), returned, 'default-off settings returned intact');
  eq(rpcCalls.at(-1), { name: 'bobby_news_settings_get', body: { p_identity: A } }, 'settings bound to authenticated identity');
  returned = { ok: true, settings: { revision: 1, newsEnabled: true, language: 'de', locale: 'de-DE', consentVersion: 1 } };
  await db.patchSettings(A, 0, { newsEnabled: true, consentVersion: 1, language: 'de', locale: 'de-DE' }, 'DE');
  eq(rpcCalls.at(-1)?.body, { p_identity: A, p_expected_revision: 0, p_patch: { newsEnabled: true, consentVersion: 1, language: 'de', locale: 'de-DE' }, p_country: 'DE' }, 'settings use CAS and explicit consent');
  returned = { eligible: 0, registeredDevices: 0, optInAccounts: 0, byLanguage: {}, byCountry: {} };
  eq(await db.audience(filters), returned, 'zero counts are valid verified storage data');
  eq(rpcCalls.at(-1)?.body, { p_languages: ['de'], p_countries: ['DE'], p_min_build: NEWS_MIN_BUILD, p_identity: null, p_campaign: null }, 'country and language filters are separate explicit arguments');
  returned = { ok: true, created: false, empty: true };
  await db.prepare(LANGUAGE_CAMPAIGN_ID, 'a'.repeat(64), filters, actor);
  eq(rpcCalls.at(-1)?.body, { p_campaign: LANGUAGE_CAMPAIGN_ID, p_digest: 'a'.repeat(64), p_languages: ['de'], p_countries: ['DE'], p_min_build: NEWS_MIN_BUILD, p_identity: null, p_actor: actor }, 'preparation binds actor and immutable campaign digest');
  returned = null;
  await rejects(db.audience(filters), 'missing data never becomes an empty eligible count');
  returned = [];
  await rejects(db.getSettings(A), 'unexpected array storage response fails closed');
  db.setPushNewsRpc(async () => { throw new BriefingStorageError('bobby_news_audience', 500); });
  await rejects(db.audience(filters), 'storage error never becomes zero eligible');
  for (const malformed of [{}, { eligible: null, registeredDevices: 0, optInAccounts: 0, byLanguage: {}, byCountry: {} },
    { eligible: 1, registeredDevices: 1, optInAccounts: 1, byLanguage: { de: '1' }, byCountry: {} }]) {
    db.setPushNewsRpc(async () => malformed);
    await rejects(db.audience(filters), 'malformed source counts never become verified audience');
  }
  db.setPushNewsRpc(async () => ({ revision: 0, newsEnabled: true, language: 'de', locale: 'de-DE', consentVersion: null }));
  await rejects(db.getSettings(A), 'enabled source with NULL consent is invalid');
  for (const malformed of [
    { revision: 0, newsEnabled: false, language: 'en', consentVersion: null },
    { revision: 0, newsEnabled: false, language: 'en', locale: null, consentVersion: null },
    { revision: 0, newsEnabled: false, language: 'en', locale: 'es-ES', consentVersion: null },
    { revision: 0, newsEnabled: false, language: 'en', locale: 'en-NZ', consentVersion: null },
    { revision: 0, newsEnabled: false, language: 'pt-BR', locale: 'pt-PT', consentVersion: null },
  ]) {
    db.setPushNewsRpc(async () => malformed);
    await rejects(db.getSettings(A), 'missing or mismatched source locale is unavailable, never silently reconstructed');
  }
  db.setPushNewsRpc(async () => ({ pending: 0 }));
  await rejects(db.status(LANGUAGE_CAMPAIGN_ID), 'partial delivery counts are unavailable, never fabricated zero');
  ok(rpcCalls.every((c) => !/pro|subscription/.test(c.name)), 'product-news wrappers make no Pro checks');

  // Default account middleware verifies the session with Supabase and rejects other providers. Authentication
  // transport is mocked; router dependency injection bypasses only rate/storage services, never token validation.
  process.env.BOBBY_SUPABASE_URL = 'https://db.test';
  process.env.BOBBY_SUPABASE_ANON_KEY = 'synthetic-anon';
  process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
  delete process.env.BOBBY_AUTH_URL;
  delete process.env.BOBBY_AUTH_ANON_KEY;
  const authUser = randomUUID();
  const bearer = `synthetic-bearer-${randomBytes(24).toString('hex')}`;
  secrets.push(bearer);
  let provider: string | null = 'apple', authDown = false, authRequests = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/auth/v1/user')) {
      authRequests++;
      if (authDown) return json({ error: 'offline' }, 500);
      const headers = init?.headers as Record<string, string>;
      if (headers?.Authorization !== `Bearer ${bearer}`) return json({ error: 'bad token' }, 401);
      return json({ id: authUser, app_metadata: { provider } });
    }
    if (url.includes('/rest/v1/bobby_identities?')) return json([{ id: A, auth_user_id: authUser, wallet_address: null }]);
    throw new Error(`Unexpected mocked request ${url.split('?')[0]}`);
  }) as typeof fetch;
  const delivery = { pending: 0, sending: 0, sent: 0, unknown: 0, failed: 0, cancelled: 0, expired: 0 };
  let state: db.NewsSettings = { revision: 0, newsEnabled: false, language: 'en', locale: 'en-US', consentVersion: null };
  let patchCalls: Array<{ identity: string; revision: number; patch: Record<string, unknown>; country: string | null }> = [];
  let selected: any = null, previewCohort: string | null = null, cfg = { enabled: false, apnsConfigured: false, tokenKeyConfigured: false };
  let adminAllowed = true, auditDown = false, runThrows = false, runs = 0;
  const auditEvents: unknown[] = [];
  const deps: Partial<PushNewsDeps> = {
    publicLimit: async () => true, accountLimit: async () => {},
    getSettings: async () => state,
    patchSettings: async (identity, revision, patch, country) => {
      patchCalls.push({ identity, revision, patch, country });
      if (revision !== state.revision) return { ok: false, revision: state.revision };
      const candidate = { ...state, ...patch } as db.NewsSettings;
      if (patch.newsEnabled === false) candidate.consentVersion = null;
      const changed = ['newsEnabled', 'consentVersion', 'language', 'locale'].some((key) => candidate[key] !== state[key]);
      state = { ...candidate, revision: state.revision + (changed ? 1 : 0) };
      return { ok: true, settings: state };
    },
    requireAdmin: async (_req, res) => {
      if (!adminAllowed) { res.status(403).json({ error: 'not_admin' }); return null; }
      return { id: actor, authUserId: randomUUID(), provider: 'apple', wallet: null, via: 'supabase', internalMarkFailed: false };
    },
    audience: async (filters, campaignId = null) => { selected = filters; previewCohort = campaignId; return { eligible: 0, registeredDevices: 0, optInAccounts: 0, byLanguage: {}, byCountry: {} }; },
    status: async () => delivery,
    configuration: () => cfg,
    auditStart: async (_admin, action, target, detail) => {
      auditEvents.push({ phase: 'start', action, target, detail });
      if (auditDown) throw new Error('audit unavailable');
      return async (status, extra) => { auditEvents.push({ phase: 'finish', status, extra }); };
    },
    runCampaign: async (filters, campaignId, actorId) => {
      runs++; selected = { filters, campaignId, actorId };
      if (runThrows) throw new Error(`synthetic failure ${bearer}`);
      return { campaignId, cohortId: campaignCohortId(campaignId, filters), processed: 0, accepted: 0, cancelled: 0, blocker: null, delivery };
    },
  };
  const router = createPushNewsHandler(deps);
  for (const token of [null, 'bws.wallet', 'invalid-bearer']) {
    eq((await call(router, 'settings', { token })).statusCode, 401, `unauthenticated ${token} refused`);
  }
  for (const unsupported of ['email', 'anonymous', null]) {
    provider = unsupported;
    eq((await call(router, 'settings', { token: bearer })).statusCode, 401, `verified ${unsupported} provider cannot opt in`);
  }
  for (const supported of ['apple', 'google']) {
    provider = supported;
    const result = await call(router, 'settings', { token: bearer });
    eq([result.statusCode, result.body.newsEnabled, result.body.deliveryAvailable, result.headers.etag], [200, false, false, '"0"'], `${supported} account reads default-off settings without Pro`);
  }
  ok(authRequests > 0, 'actual account middleware verifies bearer remotely');
  authDown = true;
  const unavailable = await call(router, 'settings', { token: bearer });
  eq([unavailable.statusCode, unavailable.body.code], [503, 'auth_unavailable'], 'auth outage is distinct from invalid credentials');
  authDown = false; provider = 'apple';
  eq((await call(router, 'unknown', { token: bearer })).statusCode, 400, 'unknown route refused');
  eq((await call(router, null, { token: bearer, query: { op: ['settings', 'preview'] } })).statusCode, 400, 'duplicate route refused');
  eq((await call(router, 'settings', { token: bearer, query: { identityId: A } })).statusCode, 400, 'caller cannot choose settings owner');
  const wrongMethod = await call(router, 'campaign', { method: 'GET' });
  eq([wrongMethod.statusCode, wrongMethod.headers.allow], [405, 'POST'], 'campaign requires an explicit POST');
  eq((await call(router, 'settings', { method: 'PATCH', token: bearer, body: { language: 'de' } })).statusCode, 428, 'write requires current revision');
  const patchOptions = { method: 'PATCH', token: bearer, headers: { 'if-match': '"0"' } };
  eq((await call(router, 'settings', { ...patchOptions, headers: { 'if-match': 'invalid' }, body: { language: 'de' } })).statusCode, 400, 'invalid revision header refused');
  eq((await call(router, 'settings', { ...patchOptions, headers: { 'if-match': '"0"', origin: undefined }, body: { language: 'de' } })).statusCode, 403, 'unrecognized write origin refused');
  for (const body of [
    {}, { newsEnabled: null }, { newsEnabled: 'true' }, { newsEnabled: true }, { newsEnabled: true, acceptedConsentVersion: 0 },
    { newsEnabled: true, acceptedConsentVersion: 2 }, { newsEnabled: true, acceptedConsentVersion: '1' },
    { acceptedConsentVersion: 1 }, { newsEnabled: false, acceptedConsentVersion: 1 },
    { language: 'ja' }, { language: 'pt-BR' }, { locale: 'pt-BR' }, { language: 'de', locale: 'fr-FR' },
    { locale: null }, { language: 'en', locale: null }, { language: 'en', locale: 'en-NZ' },
    { country: 'DE' }, { identityId: A }, { token: bearer },
  ]) eq((await call(router, 'settings', { ...patchOptions, body })).statusCode, 400, `strict settings payload ${JSON.stringify(body)}`);
  eq(patchCalls.length, 0, 'invalid settings never reach storage');
  eq((await call(router, 'settings', { ...patchOptions, rawBody: '{invalid' })).statusCode, 400, 'malformed JSON refused');
  eq((await call(router, 'settings', { ...patchOptions, rawBody: ' '.repeat(2049) })).statusCode, 413, 'settings body size bounded before parsing');
  const saved = await call(router, 'settings', { ...patchOptions, headers: { 'if-match': '"0"', 'x-vercel-ip-country': 'br' }, body: { newsEnabled: true, acceptedConsentVersion: 1, language: 'pt', locale: 'pt-BR' } });
  eq([saved.statusCode, saved.body.language, saved.body.locale, saved.headers.etag], [200, 'pt', 'pt-BR', '"1"'], 'regional Portuguese returned as selected base/locale');
  eq(patchCalls.at(-1), { identity: A, revision: 0, patch: { newsEnabled: true, consentVersion: 1, language: 'pt-BR', locale: 'pt-BR' }, country: 'BR' }, 'server derives owner/country and stores regional variant');
  eq((await call(router, 'settings', { ...patchOptions, body: { newsEnabled: false } })).statusCode, 409, 'stale revision is a conflict');
  await call(router, 'settings', { ...patchOptions, headers: { 'if-match': '"1"', 'x-vercel-ip-country': 'XX' }, body: { newsEnabled: false } });
  eq(patchCalls.at(-1)?.country, null, 'unknown country does not become a fabricated geographic segment');
  for (const locale of APP_LOCALES) {
    const regional = { language: appLanguage(locale), locale };
    const current = state.revision;
    const roundTrip = await call(router, 'settings', { method: 'PATCH', token: bearer, headers: { 'if-match': `"${current}"` }, body: regional });
    eq([roundTrip.statusCode, roundTrip.body.language, roundTrip.body.locale], [200, regional.language, regional.locale], 'PATCH preserves the exact requested regional locale');
    const readBack = await call(router, 'settings', { token: bearer });
    eq([readBack.body.language, readBack.body.locale, readBack.headers.etag], [regional.language, regional.locale, roundTrip.headers.etag], 'GET preserves the stored regional locale');
    const repeat = await call(router, 'settings', { method: 'PATCH', token: bearer, headers: { 'if-match': roundTrip.headers.etag, 'x-vercel-ip-country': 'GB' }, body: regional });
    eq([repeat.body.revision, repeat.headers.etag, repeat.body.locale], [roundTrip.body.revision, roundTrip.headers.etag, regional.locale], 'identical foreground locale synchronization keeps revision stable');
  }
  const canonical = await call(router, 'settings', { method: 'PATCH', token: bearer, headers: { 'if-match': `"${state.revision}"` }, body: { language: 'de' } });
  eq([canonical.body.language, canonical.body.locale, patchCalls.at(-1)?.patch.locale], ['de', 'de-DE', 'de-DE'], 'language-only client request receives an explicit canonical locale');
  const storageRouter = createPushNewsHandler({ ...deps, getSettings: async () => { throw new BriefingStorageError('bobby_news_settings_get', 500); } });
  eq((await call(storageRouter, 'settings', { token: bearer })).statusCode, 503, 'storage failure never becomes a default-off success');

  adminAllowed = false;
  eq((await call(router, 'preview')).statusCode, 403, 'preview requires an admin');
  adminAllowed = true;
  const previewResult = await call(router, 'preview', { query: { countries: 'DE,FR', languages: 'de,fr', minAppBuild: '66' } });
  eq([previewResult.statusCode, previewResult.body.eligible], [200, 0], 'preview reports verified aggregate zero');
  eq(selected, { languages: ['de', 'fr'], countries: ['DE', 'FR'], minAppBuild: 66, identityId: null }, 'preview uses explicit country/language filters');
  eq(previewCohort, campaignCohortId(LANGUAGE_CAMPAIGN_ID, selected), 'preview counts are scoped to the deduplicated recipient cohort');
  for (const query of [{ countries: 'de' }, { countries: 'DE,DE' }, { languages: 'de,de' }, { languages: 'ja' }, { minAppBuild: '65' }, { campaignId: 'arbitrary' }]) {
    eq((await call(router, 'preview', { query })).statusCode, 400, `preview refuses ${JSON.stringify(query)}`);
  }
  const campaignBody = { campaignId: LANGUAGE_CAMPAIGN_ID, languages: ['de'], countries: ['DE'], minAppBuild: 66 };
  eq((await call(router, 'campaign', { method: 'POST', body: { ...campaignBody, dryRun: true } })).statusCode, 200, 'dry run works before delivery keys/switch are configured');
  eq([runs, auditEvents.length], [0, 0], 'dry run never audits a mutation or invokes sender');
  eq((await call(router, 'campaign', { method: 'POST', body: campaignBody })).statusCode, 503, 'unconfigured real send fails closed');
  eq(runs, 0, 'disabled send cannot invoke worker');
  cfg = { enabled: true, apnsConfigured: true, tokenKeyConfigured: true };
  for (const body of [{ ...campaignBody, campaignId: 'arbitrary' }, { ...campaignBody, token: bearer }, { ...campaignBody, minAppBuild: 65 }, { ...campaignBody, countries: ['DE', 'DE'] }]) {
    eq((await call(router, 'campaign', { method: 'POST', body })).statusCode, 400, 'admin cannot override copy, token or recipient/build policy');
  }
  auditDown = true;
  eq((await call(router, 'campaign', { method: 'POST', body: campaignBody })).statusCode, 503, 'unavailable audit prevents sending');
  eq(runs, 0, 'no audit row means no sender call');
  auditDown = false;
  const sent = await call(router, 'campaign', { method: 'POST', body: campaignBody });
  eq(sent.statusCode, 200, 'audited campaign execution returns a reviewable status');
  eq(selected, { filters: { languages: ['de'], countries: ['DE'], minAppBuild: 66, identityId: null }, campaignId: LANGUAGE_CAMPAIGN_ID, actorId: actor }, 'campaign actor comes from authenticated admin');
  eq((auditEvents.at(-1) as any).status, 'ok', 'send outcome appended to audit');
  const testId = randomUUID(), targetIdentity = randomUUID();
  await call(router, 'test', { method: 'POST', body: { testId, identityId: targetIdentity, minAppBuild: 66 } });
  eq([selected.campaignId, selected.filters.identityId, selected.filters.languages], [`test-${testId}`, targetIdentity, [...NEWS_LANGUAGES].sort()], 'test campaign targets exactly the named account with every supported language');
  runThrows = true;
  eq((await call(router, 'campaign', { method: 'POST', body: campaignBody })).statusCode, 503, 'worker failure returns dependency error');
  eq((auditEvents.at(-1) as any).status, 'failed', 'worker failure is recorded in audit');
  runThrows = false;

  // Worker tests exercise the boundary before network transmission and all ambiguous/failed outcomes.
  const master = randomBytes(32), apnsToken = randomBytes(32).toString('hex');
  const ciphertext = encryptToken(apnsToken, master);
  secrets.push(apnsToken, ciphertext, master.toString('base64'));
  const apns = { keyId: 'SYNTHETIC', teamId: 'SYNTHETIC', privateKey: 'unused', topic: 'xyz.bobbyprotocol.bobby', environments: new Set(['production' as const]) };
  eq(campaignDigest({ ...filters, countries: ['FR', 'DE'], languages: ['fr', 'de'] }), campaignDigest({ ...filters, countries: ['DE', 'FR'], languages: ['de', 'fr'] }), 'campaign digest does not depend on filter ordering');
  ok(campaignDigest(filters) !== campaignDigest({ ...filters, identityId: A }), 'digest binds target identity');
  eq(campaignCohortId(LANGUAGE_CAMPAIGN_ID, { ...filters, countries: ['FR', 'DE'] }), campaignCohortId(LANGUAGE_CAMPAIGN_ID, { ...filters, countries: ['DE', 'FR'] }), 'country-filter order produces the same stable cohort');
  ok(campaignCohortId(LANGUAGE_CAMPAIGN_ID, filters) !== campaignCohortId(LANGUAGE_CAMPAIGN_ID, { ...filters, countries: ['FR'] }), 'separate country groups have distinct cohort ids');
  const independentTest = `test-${randomUUID()}`;
  eq(campaignCohortId(independentTest, filters), independentTest, 'authorized test UUID remains its own independent campaign');
  let closed = 0, prepareCalls = 0, sendCalls = 0;
  const workerEvents: string[] = [];
  let rows: db.NewsClaim[] = [];
  let authorizeOk = true, badCiphertext = false, outcome: any = { outcome: 'accepted', status: 200, reason: null }, transportThrows = false;
  const results: unknown[][] = [];
  const workerDeps: Partial<NewsWorkerDeps> = {
    now: () => new Date('2026-10-07T12:00:00Z'), enabled: () => true, apnsConfig: () => apns, pushMasterKey: () => master,
    prepare: async () => { prepareCalls++; return { ok: true, created: false }; },
    claim: async () => { const row = rows.shift(); if (!row) return { state: 'empty' }; workerEvents.push('durable-sending'); return row; },
    authorize: async () => { workerEvents.push('authorize-current-settings-and-binding'); return authorizeOk ? { ok: true, tokenCiphertext: badCiphertext ? 'v1:broken' : ciphertext, environment: 'production', topic: apns.topic } : { ok: false }; },
    result: async (...args) => { results.push(args); workerEvents.push('record-result'); return { ok: true }; },
    status: async () => delivery,
    send: async (_config, notification, payload) => {
      sendCalls++; workerEvents.push('network-send');
      eq(notification.token, apnsToken, 'only the transport receives decrypted token');
      eq(payload, newsPayload(LANGUAGE_CAMPAIGN_ID, 'de'), 'transport receives only fixed localized safe payload');
      if (transportThrows) throw new Error(`synthetic transport ${apnsToken}`);
      return outcome;
    },
    close: () => { closed++; },
  };
  const row = (): db.NewsClaim => ({ state: 'claimed', id: randomUUID(), fence: 1, language: 'de', apnsId: randomUUID(), expiresAt: '2026-10-14T12:00:00Z' });
  await rejects(runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, { ...workerDeps, enabled: () => false }), 'disabled worker cannot prepare recipients');
  await rejects(runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, { ...workerDeps, pushMasterKey: () => null }), 'missing encryption key blocks preparation');
  await rejects(runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, { ...workerDeps, apnsConfig: () => ({ ...apns, environments: new Set(['sandbox']) }) }), 'sandbox-only config cannot run production campaign');
  eq(prepareCalls, 0, 'configuration failures leave campaign state untouched');
  rows = [row()];
  const accepted = await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, workerDeps);
  eq([accepted.processed, accepted.accepted], [1, 1], 'accepted APNs result counted once');
  eq([accepted.campaignId, accepted.cohortId], [LANGUAGE_CAMPAIGN_ID, campaignCohortId(LANGUAGE_CAMPAIGN_ID, filters)], 'worker keeps public announcement id separate from its recipient cohort');
  eq(workerEvents.slice(0, 4), ['durable-sending', 'authorize-current-settings-and-binding', 'network-send', 'record-result'], 'durable reservation and authorization precede transport');
  eq(results.at(-1)?.slice(2, 5), ['accepted', 200, null], 'acceptance persisted');
  authorizeOk = false; rows = [row()];
  const cancelled = await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, workerDeps);
  eq([cancelled.cancelled, sendCalls], [1, 1], 'withdrawn/rebound delivery never decrypts or transmits');
  authorizeOk = true; badCiphertext = true; rows = [row()];
  await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, workerDeps);
  eq([sendCalls, results.at(-1)?.slice(2, 5)], [1, ['failed', null, 'token_unavailable']], 'unreadable ciphertext fails without exposing or transmitting it');
  badCiphertext = false; outcome = { outcome: 'ambiguous', status: null, reason: 'timeout' }; rows = [row()];
  await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, workerDeps);
  eq(results.at(-1)?.[2], 'ambiguous', 'ambiguous provider result stays uncertain');
  transportThrows = true; rows = [row()];
  await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, workerDeps);
  eq(results.at(-1)?.slice(2, 5), ['ambiguous', null, 'transport_unknown'], 'unexpected transport throw never becomes a safe retry');
  transportThrows = false; outcome = { outcome: 'config', status: 403, reason: 'InvalidProviderToken' }; rows = [row(), row()];
  const configBlocked = await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, workerDeps);
  eq([configBlocked.processed, configBlocked.blocker, rows.length], [1, 'apns_configuration', 1], 'provider config failure stops the remaining batch');
  ok(closed >= 6, 'sender transports closed after every completed worker run');
  const beforeEmpty = sendCalls;
  const empty = await runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, { ...workerDeps, prepare: async () => ({ ok: true, empty: true }) });
  eq([empty.processed, sendCalls], [0, beforeEmpty], 'empty campaign never invokes transport');
  await rejects(runNewsCampaign(filters, LANGUAGE_CAMPAIGN_ID, actor, { ...workerDeps, prepare: async () => ({ ok: false }) }), 'campaign digest mismatch prevents send');
  for (const response of seen) eq(response.headers['cache-control'], 'private, no-store', 'every response disables caching');
  const serialized = JSON.stringify({ seen, logs });
  for (const secret of secrets) ok(!serialized.includes(secret), 'responses and logs exclude bearer/APNs secrets');
  console.log(`push-news: ${checks} checks passed (mock transport; no real sends)`);
} finally {
  db.setPushNewsRpc(null);
  globalThis.fetch = originalFetch;
  for (const key of ['error', 'warn', 'info'] as const) console[key] = originalConsole[key];
}
