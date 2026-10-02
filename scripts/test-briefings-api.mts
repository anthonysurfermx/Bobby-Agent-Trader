// The Bobby Pro briefings public router (api/briefings.ts + api/_lib/briefings/http.ts) without a network:
//   · only a verified Apple/Google account gets in (wallet sessions, anonymous and bad tokens are 401; an auth
//     outage is 503); op/method/query allowlists; writes need Bobby's Origin;
//   · settings: GET without Pro, PATCH with If-Match (428/409), strict body (unknown field, size, companion and
//     asset allowlists), consent only at the current version, expired Pro may still save;
//   · devices: Idempotency-Key (missing, replay of the same sealed receipt, mismatch), push key missing, APNs
//     environment allowlist, rebind proof, DELETE 204/409; the RPCs never see the raw token or credential;
//   · inbox/report: Pro required, foreign = missing (same 404), storage failure is 503 never empty, signed cursors
//     bound to owner and cadence;
//   · voice/audio: consent, frozen voice, kill switch, ready/pending/unavailable, private audio serving;
//   · every response is `private, no-store`; no response or log carries a bearer, APNs token or credential.
// Then, when DATABASE_URL points to a local scratch PostgreSQL, the same router end to end against the real
// migration (scripts/briefings-pg-harness.mts): settings, device register → rebind A→B → late revoke, inbox/report
// and audio isolation between accounts.
//   psql postgres://postgres@127.0.0.1:55491/postgres -c 'create database briefings_api'
//   DATABASE_URL=postgres://postgres@127.0.0.1:55491/briefings_api npx tsx scripts/test-briefings-api.mts
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.RATE_LIMIT_SALT = 'test-salt-briefings-api';
delete process.env.BOBBY_AUTH_URL;
delete process.env.BOBBY_APNS_ENVIRONMENTS;
delete process.env.BOBBY_APNS_TOPIC;
delete process.env.BOBBY_BRIEFINGS_ENABLED;
delete process.env.VERCEL_ENV;
const PUSH_KEY = randomBytes(32).toString('base64');
process.env.BOBBY_PUSH_TOKEN_KEY = PUSH_KEY;

// waitUntil (@vercel/functions) reads the request context from this symbol.
const deferred: Promise<unknown>[] = [];
(globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { deferred.push(p); } }) };

const db = await import('../api/_lib/briefings/db.ts');
const { default: handler, setBriefingsDepsForTests } = await import('../api/briefings.ts');
const { audioCacheKey } = await import('../api/_lib/briefings/compose.ts');
const { BRIEF_VIBE, TTS_MODEL, CONSENT_VERSIONS, SUPPORTED_ASSETS, COMPANION_VOICES } = await import('../api/_lib/briefings/config.ts');
const { openReceipt, credentialVerifier } = await import('../api/_lib/briefings/push-crypto.ts');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------- logs (captured; checked for secrets at the end) ----------
const logs: string[] = [];
const realConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };
for (const k of ['error', 'warn', 'info'] as const) console[k] = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };

// ---------- fetch: auth, identities, rate limiter (RPCs go through setBriefingRpc) ----------
const originalFetch = globalThis.fetch;
const users = new Map<string, { authUser: string; identity: string }>();   // bearer → account
const identityByAuth = new Map<string, string>();
let authDown = false;
let limiterRows: (url: string) => unknown[] | 'down' = () => [];
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/rest/v1/api_cache')) {
    if ((init?.method ?? 'GET') === 'POST') return json(null, 201);
    const rows = limiterRows(decodeURIComponent(url));
    return rows === 'down' ? json({ message: 'down' }, 500) : json(rows);
  }
  if (url.includes('/auth/v1/user')) {
    if (authDown) return json({ message: 'down' }, 500);
    const u = users.get(String(headers.authorization ?? '').replace(/^Bearer /, ''));
    return u ? json({ id: u.authUser, email: null, app_metadata: { provider: 'apple' } }) : json({ msg: 'bad token' }, 401);
  }
  if (url.includes('bobby_identities?on_conflict=auth_user_id')) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const id = identityByAuth.get(body.auth_user_id);
    return id ? json([{ id, auth_user_id: body.auth_user_id, wallet_address: null }]) : json({ message: 'no' }, 500);
  }
  if (url.includes('bobby_identities?on_conflict=wallet_address')) return json([{ id: randomUUID(), auth_user_id: null, wallet_address: '0xabc' }]);
  throw new Error(`Unexpected request ${url.split('?')[0]}`);
}) as typeof fetch;

function account(identity = randomUUID()): { token: string; identity: string } {
  const token = `tok-${randomBytes(12).toString('hex')}`;
  const authUser = randomUUID();
  users.set(token, { authUser, identity });
  identityByAuth.set(authUser, identity);
  return { token, identity };
}

// ---------- request/response doubles ----------
interface Res { statusCode: number; body: any; raw: Buffer | null; headers: Record<string, string> }
const seen: Res[] = [];
function response() {
  return {
    statusCode: 200, body: null as any, raw: null as Buffer | null, headers: {} as Record<string, string>,
    setHeader(k: string, v: string | number) { this.headers[k.toLowerCase()] = String(v); return this; },
    getHeader(k: string) { return this.headers[k.toLowerCase()]; },
    status(n: number) { this.statusCode = n; return this; },
    json(v: unknown) { this.body = v; return this; },
    end(c?: Buffer | string) { if (c !== undefined) this.raw = Buffer.from(c); return this; },
    send(v: unknown) { if (Buffer.isBuffer(v)) this.raw = v; else this.body = v; return this; },
  };
}
interface CallOpts { method?: string; token?: string | null; headers?: Record<string, string>; query?: Record<string, unknown>; body?: unknown; rawBody?: unknown; ip?: string }
async function call(op: string | null, o: CallOpts = {}): Promise<Res> {
  const headers: Record<string, string> = { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': o.ip ?? '10.9.0.1' };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  for (const [k, v] of Object.entries(o.headers ?? {})) {
    if (v === undefined) delete headers[k.toLowerCase()];
    else headers[k.toLowerCase()] = v;
  }
  const req = {
    method: o.method ?? 'GET',
    headers,
    query: { ...(op ? { op } : {}), ...(o.query ?? {}) },
    body: o.rawBody !== undefined ? o.rawBody : o.body === undefined ? undefined : JSON.stringify(o.body),
  };
  const res = response();
  await handler(req as any, res as any);
  const out: Res = { statusCode: res.statusCode, body: res.body, raw: res.raw, headers: res.headers };
  seen.push(out);
  return out;
}

// ---------- in-memory RPC double ----------
type Handler = (body: Record<string, any>) => unknown;
let handlers: Record<string, Handler> = {};
let rpcCalls: Array<{ name: string; body: Record<string, any> }> = [];
const storageDown = (name: string) => { throw new db.BriefingStorageError(name, 500); };
db.setBriefingRpc(async (name, body) => {
  rpcCalls.push({ name, body });
  const h = handlers[name];
  if (!h) throw new Error(`unexpected rpc ${name}`);
  return h(body);
});
const callsOf = (name: string) => rpcCalls.filter((c) => c.name === name);

const baseSettings = (over: Record<string, unknown> = {}) => ({
  revision: 0, openingEnabled: false, closeEnabled: false, weeklyEnabled: false, language: 'en', companionId: null, assets: [],
  analysisConsentEnabled: false, analysisConsentVersion: null, audioConsentEnabled: false, audioConsentVersion: null, privacyEpoch: 0, ...over,
});

/** Idempotency receipts as the SQL keeps them (begin/finish). */
function idemStore() {
  const rows = new Map<string, { digest: string; state: 'in_progress' | 'done'; status?: number; response?: string }>();
  return {
    rows,
    begin: (b: Record<string, any>) => {
      const k = `${b.p_identity}|${b.p_scope}|${b.p_key}`;
      const r = rows.get(k);
      if (!r) { rows.set(k, { digest: b.p_digest, state: 'in_progress' }); return { state: 'new' }; }
      if (r.digest !== b.p_digest) return { state: 'mismatch' };
      if (r.state === 'in_progress') return { state: 'in_progress' };
      return { state: 'replay', status: r.status, response: r.response };
    },
    finish: (b: Record<string, any>) => {
      const r = rows.get(`${b.p_identity}|${b.p_scope}|${b.p_key}`);
      if (r && r.state === 'in_progress') Object.assign(r, { state: 'done', status: b.p_status, response: b.p_response });
      return { ok: !!r };
    },
  };
}

let pro: boolean | 'down' = true;
let settingsState = baseSettings();
let idem = idemStore();
function reset() {
  handlers = {};
  rpcCalls = [];
  pro = true;
  settingsState = baseSettings();
  idem = idemStore();
  limiterRows = () => [];
  authDown = false;
  delete process.env.BOBBY_BRIEFINGS_ENABLED;
  process.env.BOBBY_PUSH_TOKEN_KEY = PUSH_KEY;
  handlers.bobby_brief_is_paid_pro = () => (pro === 'down' ? storageDown('bobby_brief_is_paid_pro') : pro);
  handlers.bobby_brief_settings_get = () => settingsState;
  handlers.bobby_brief_settings_patch = (b) => {
    if (b.p_expected_revision !== settingsState.revision) return { ok: false, code: 'revision_conflict', revision: settingsState.revision };
    settingsState = { ...settingsState, ...b.p_patch, revision: settingsState.revision + 1 };
    return { ok: true, settings: settingsState };
  };
  handlers.bobby_brief_idem_begin = (b) => idem.begin(b);
  handlers.bobby_brief_idem_finish = (b) => idem.finish(b);
}
setBriefingsDepsForTests({ waitUntil: (p) => { deferred.push(p); } });

const A = account();
const B = account();
const NY_FROZEN = new Date('2026-10-02T15:00:00Z');
/** Bearers and APNs tokens never appear in a response or a log; credentials only in their own device receipt. */
const TOKENS: string[] = [A.token, B.token];
const CREDENTIALS: string[] = [];

try {
  // ======================================================== authentication and routing
  reset();
  {
    const r = await call('settings', { token: null });
    eq([r.statusCode, r.body.code, r.headers['www-authenticate']], [401, 'signin_required', 'Bearer realm="bobby-briefings"'], 'no token: 401 signin_required');
    const w = await call('settings', { token: A.token, headers: { 'x-bobby-session': 'wallet-session' } });
    eq([w.statusCode, w.body.code], [401, 'signin_required'], 'a wallet session is not an account');
    const bws = await call('settings', { token: 'bws.wallet' });
    eq([bws.statusCode, bws.body.code], [401, 'signin_required'], 'a wallet bearer is not an account');
    const bad = await call('settings', { token: 'not-a-real-token' });
    eq([bad.statusCode, bad.body.code], [401, 'signin_required'], 'an unverified token is 401');
    eq(rpcCalls.length, 0, 'no storage call without an account');
    authDown = true;
    const down = await call('settings', { token: A.token });
    eq([down.statusCode, down.body.code, down.headers['retry-after']], [503, 'auth_unavailable', '5'], 'auth outage: 503 auth_unavailable, never 401');
    authDown = false;

    eq((await call('nope', { token: A.token })).statusCode, 400, 'unknown op: 400');
    eq((await call(null, { token: A.token, query: { op: ['settings', 'inbox'] } })).body.code, 'invalid_request', 'duplicate op: 400');
    eq((await call('report', { token: A.token, query: { id: [randomUUID(), randomUUID()] } })).body.code, 'invalid_request', 'duplicate id: 400');
    eq((await call('settings', { token: A.token, query: { owner: A.identity } })).body.code, 'invalid_request', 'unknown query key (e.g. owner): 400');
    const m = await call('report', { method: 'POST', token: A.token, query: { id: randomUUID() } });
    eq([m.statusCode, m.body.code, m.headers.allow], [405, 'method_not_allowed', 'GET'], 'wrong method: 405 + Allow');
    const noOrigin = await call('settings', { method: 'PATCH', token: A.token, headers: { origin: undefined as never, 'if-match': '"0"' }, body: { weeklyEnabled: true } });
    eq(noOrigin.statusCode, 403, 'a write without Bobby origin: 403');
    const evil = await call('settings', { method: 'PATCH', token: A.token, headers: { origin: 'https://evil.example', 'if-match': '"0"' }, body: { weeklyEnabled: true } });
    eq(evil.statusCode, 403, 'a write from another origin: 403');
    eq(callsOf('bobby_brief_settings_patch').length, 0, 'refused writes reach no storage');
  }

  // ======================================================== account rate limits
  reset();
  {
    limiterRows = (u) => (u.includes('rl:brief-read:') ? [{ payload: { count: 999 }, expires_at: new Date(Date.now() + 30_000).toISOString() }] : []);
    const r = await call('settings', { token: A.token });
    eq([r.statusCode, r.body.code], [429, 'rate_limited'], 'account read limit: 429 rate_limited');
    ok(Number(r.headers['retry-after']) >= 1, '429 carries Retry-After');
    limiterRows = (u) => (u.includes('rl:brief-voice:') ? 'down' : []);
    settingsState = baseSettings({ audioConsentEnabled: true, audioConsentVersion: CONSENT_VERSIONS.audio });
    const v = await call('voice', { method: 'POST', token: A.token, headers: { 'idempotency-key': randomUUID() }, body: { briefId: randomUUID(), contentVersion: 1, segmentIndex: 0, voice: 'coral', language: 'es' } });
    eq([v.statusCode, v.body.code], [429, 'rate_limited'], 'voice limit fails closed when the limiter store is down');
    ok(!logs.join('\n').includes(A.identity), 'limiter keys are salted: no identity in a log line');
  }

  // ======================================================== settings
  reset();
  {
    pro = false;
    const g = await call('settings', { token: A.token });
    eq(g.statusCode, 200, 'settings GET works without Pro');
    eq([g.body.eligiblePro, g.body.revision, g.headers.etag], [false, 0, '"0"'], 'eligiblePro false, revision 0, ETag');
    ok(!('privacyEpoch' in g.body), 'internal privacy epoch is not exposed');
    eq(g.body.options.assets, Object.keys(SUPPORTED_ASSETS), 'options.assets = the supported universe');
    eq(g.body.options.companions, Object.keys(COMPANION_VOICES), 'options.companions = the companion allowlist');
    eq(g.body.options.consentVersions, CONSENT_VERSIONS, 'options.consentVersions = current versions');
    eq([g.body.schedules.timezone, g.body.schedules.opening.localTime], ['America/New_York', '08:00'], 'effective schedules');
    eq(g.body.schedules.close.configured, false, 'close is not adopted by default');
    setBriefingsDepsForTests({ waitUntil: (p) => { deferred.push(p); }, now: () => NY_FROZEN });
    const frozen = await call('settings', { token: A.token });
    eq([frozen.body.schedules.weekly.nextAt, frozen.body.schedules.opening.nextAt, frozen.body.schedules.close.nextAt], [new Date('2026-10-05T12:00:00Z').toISOString(), null, null], 'next 08:00 New York (EDT) from the injected clock; unadopted close has no nextAt');
    setBriefingsDepsForTests({ waitUntil: (p) => { deferred.push(p); } });

    pro = 'down';
    const d = await call('settings', { token: A.token });
    eq([d.statusCode, d.body.code], [503, 'storage_unavailable'], 'entitlement unknown: 503, never "free"');
    pro = true;

    const patch = (body: unknown, headers: Record<string, string> = { 'if-match': '"0"' }, rawBody?: unknown) =>
      call('settings', { method: 'PATCH', token: A.token, headers, body, rawBody });
    eq((await patch({ weeklyEnabled: true }, {})).statusCode, 428, 'PATCH without If-Match: 428');
    eq((await patch({ weeklyEnabled: true }, {})).body.code, 'revision_required', '428 code revision_required');
    eq((await patch({ weeklyEnabled: true }, { 'if-match': 'abc' })).body.code, 'invalid_request', 'malformed If-Match: 400');
    eq((await patch({ weeklyEnabled: true, owner: 'x' })).body.code, 'invalid_request', 'unknown field: 400');
    eq((await patch({})).body.code, 'invalid_request', 'empty patch: 400');
    eq((await patch({ openingEnabled: null })).body.code, 'invalid_request', 'null is not a change: 400');
    const big = await patch(undefined, { 'if-match': '"0"' }, JSON.stringify({ language: 'es', pad: 'x'.repeat(3000) }));
    eq([big.statusCode, big.body.code], [413, 'payload_too_large'], 'body over 2 KiB (bytes): 413');
    const declared = await patch({ language: 'es' }, { 'if-match': '"0"', 'content-length': '999999' });
    eq(declared.statusCode, 413, 'declared Content-Length over the cap: 413');
    const parsed = await patch(undefined, { 'if-match': '"0"' }, { language: 'es', assets: Array(400).fill('BTC') });
    eq(parsed.statusCode, 413, 'a runtime-parsed object is measured re-serialized: 413');
    const multibyte = await patch(undefined, { 'if-match': '"0"' }, JSON.stringify({ language: 'é'.repeat(1100) }));
    eq(multibyte.statusCode, 413, 'the cap counts bytes, not characters');
    eq((await patch(undefined, { 'if-match': '"0"' }, '{not json')).body.code, 'invalid_request', 'malformed JSON: 400');
    eq((await patch({ companionId: 'hacker' })).body.code, 'invalid_request', 'companion outside the allowlist: 400');
    eq((await patch({ companionId: '__proto__' })).body.code, 'invalid_request', 'prototype keys are not companions');
    eq((await patch({ assets: ['btc'] })).body.code, 'invalid_request', 'assets must be uppercase symbols');
    eq((await patch({ assets: ['BTC', 'BTC'] })).body.code, 'invalid_request', 'assets must be unique');
    eq((await patch({ assets: ['DOGE'] })).body.code, 'invalid_request', 'assets must be supported');
    eq((await patch({ assets: ['BTC', 'ETH', 'SOL', 'NVDA', 'AAPL', 'TSLA', 'META'] })).body.code, 'invalid_request', 'at most 6 assets');
    eq((await patch({ language: 'fr' })).body.code, 'invalid_request', 'language enum');
    const c1 = await patch({ analysisConsentEnabled: true });
    eq([c1.statusCode, c1.body.code], [400, 'consent_required'], 'enabling consent without accepting a version: consent_required');
    eq((await patch({ audioConsentEnabled: true, acceptedAudioConsentVersion: CONSENT_VERSIONS.audio + 1 })).body.code, 'consent_required', 'a version other than the current one: consent_required');
    eq((await patch({ audioConsentEnabled: false, acceptedAudioConsentVersion: 1 })).body.code, 'invalid_request', 'withdrawing carries no version');
    eq((await patch({ openingEnabled: true })).body.code, 'invalid_request', 'daily opt-in rejected');
    eq((await patch({ closeEnabled: true })).body.code, 'invalid_request', 'close opt-in rejected');
    eq(callsOf('bobby_brief_settings_patch').length, 0, 'no invalid patch reached storage');

    const good = await patch({ weeklyEnabled: true, language: 'es', companionId: 'kora', assets: ['BTC', 'NVDA'], analysisConsentEnabled: true, acceptedAnalysisConsentVersion: CONSENT_VERSIONS.analysis, audioConsentEnabled: true, acceptedAudioConsentVersion: CONSENT_VERSIONS.audio });
    eq([good.statusCode, good.headers.etag, good.body.revision, good.body.eligiblePro], [200, '"1"', 1, true], 'PATCH: 200, new ETag and revision');
    eq(callsOf('bobby_brief_settings_patch')[0].body.p_patch, {
      weeklyEnabled: true, language: 'es', companionId: 'kora', assets: ['BTC', 'NVDA'],
      analysisConsentEnabled: true, analysisConsentVersion: CONSENT_VERSIONS.analysis, audioConsentEnabled: true, audioConsentVersion: CONSENT_VERSIONS.audio,
    }, 'the stored patch maps accepted versions to the current server versions');
    eq(callsOf('bobby_brief_settings_patch')[0].body.p_identity, A.identity, 'patched for the session identity');
    const stale = await patch({ weeklyEnabled: true }, { 'if-match': '"0"' });
    eq([stale.statusCode, stale.body.code, stale.body.revision, stale.headers.etag], [409, 'revision_conflict', 1, '"1"'], 'stale revision: 409 with the current revision');
    eq((await patch({ weeklyEnabled: true }, { 'if-match': 'W/"1"' })).statusCode, 200, 'weak ETag form accepted');
    eq((await patch({ closeEnabled: false }, { 'if-match': '2' })).statusCode, 200, 'bare revision accepted');

    pro = false;
    const expired = await patch({ openingEnabled: false, closeEnabled: false }, { 'if-match': '"3"' });
    eq([expired.statusCode, expired.body.eligiblePro, expired.body.closeEnabled], [200, false, false], 'expired Pro may save (eligiblePro false)');
    pro = 'down';
    const before = callsOf('bobby_brief_settings_patch').length;
    eq((await patch({ weeklyEnabled: true }, { 'if-match': '"4"' })).statusCode, 503, 'entitlement unknown: 503 before any write');
    eq(callsOf('bobby_brief_settings_patch').length, before, 'no write behind a 503');
    pro = true;
    handlers.bobby_brief_settings_patch = () => { throw new db.BriefingStorageError('bobby_brief_settings_patch', 400); };
    eq((await patch({ weeklyEnabled: true }, { 'if-match': '"4"' })).body.code, 'invalid_request', 'storage-side validation (22023) is a 400');
  }

  // ======================================================== devices
  reset();
  {
    const APNS = randomBytes(32).toString('hex');
    TOKENS.push(APNS, APNS.toUpperCase());
    const installationId = randomUUID();
    const reg = { installationId, apnsToken: APNS, permissionState: 'authorized', appBuild: 53, apnsEnvironment: 'production' };
    let deviceReply: Record<string, unknown> = { ok: true, registrationId: randomUUID(), bindingRevision: 1 };
    handlers.bobby_push_device_register = () => deviceReply;
    handlers.bobby_push_device_rebind = () => deviceReply;
    handlers.bobby_push_device_revoke = () => deviceReply;
    const post = (body: unknown, headers: Record<string, string> = {}, token = A.token) => call('device', { method: 'POST', token, headers, body });

    const noKey = await post(reg);
    eq([noKey.statusCode, noKey.body.code], [400, 'idempotency_key_required'], 'POST without Idempotency-Key: 400');
    eq((await post(reg, { 'idempotency-key': 'short' })).body.code, 'invalid_request', 'malformed Idempotency-Key: 400');
    delete process.env.BOBBY_PUSH_TOKEN_KEY;
    const off = await post(reg, { 'idempotency-key': randomUUID() });
    eq([off.statusCode, off.body.code], [503, 'feature_disabled'], 'no push master key: 503 feature_disabled');
    process.env.BOBBY_PUSH_TOKEN_KEY = PUSH_KEY;
    eq((await post({ ...reg, apnsEnvironment: 'sandbox' }, { 'idempotency-key': randomUUID() })).body.code, 'invalid_request', 'environment outside BOBBY_APNS_ENVIRONMENTS: 400');
    eq((await post({ ...reg, topic: 'com.evil' }, { 'idempotency-key': randomUUID() })).body.code, 'invalid_request', 'client cannot choose a topic');
    eq((await post({ ...reg, apnsToken: 'zz'.repeat(32) }, { 'idempotency-key': randomUUID() })).body.code, 'invalid_request', 'token must be hex');
    eq((await post({ ...reg, apnsToken: 'ab'.repeat(8) }, { 'idempotency-key': randomUUID() })).body.code, 'invalid_request', 'token length is bounded');
    eq((await post({ ...reg, permissionState: 'ephemeral' }, { 'idempotency-key': randomUUID() })).body.code, 'invalid_request', 'permission enum');
    eq(callsOf('bobby_push_device_register').length + callsOf('bobby_brief_idem_begin').length, 0, 'invalid registrations reach no storage');

    const key = randomUUID();
    const first = await post(reg, { 'idempotency-key': key });
    eq(first.statusCode, 201, 'first registration: 201');
    eq(Object.keys(first.body).sort(), ['bindingRevision', 'installationCredential', 'registrationId'], 'receipt shape');
    const cred = first.body.installationCredential as string;
    CREDENTIALS.push(cred);
    ok(/^[A-Za-z0-9_-]{43}$/.test(cred), 'credential: 32 random bytes base64url');
    const regCall = callsOf('bobby_push_device_register')[0].body;
    eq(regCall.p_identity, A.identity, 'registered for the session identity');
    eq(regCall.p_credential_verifier, credentialVerifier(cred), 'only the credential verifier is stored');
    eq([regCall.p_topic, regCall.p_environment, regCall.p_max_active], ['xyz.bobbyprotocol.bobby', 'production', 5], 'topic from config, environment checked, device cap');
    ok(/^v1:/.test(regCall.p_token_ciphertext) && /^[0-9a-f]{64}$/.test(regCall.p_token_fingerprint), 'token sealed + keyed fingerprint');
    ok(!JSON.stringify(rpcCalls).includes(APNS) && !JSON.stringify(rpcCalls).includes(cred), 'no RPC ever sees the raw token or the credential');
    const stored = [...idem.rows.values()][0];
    ok(stored.response && !stored.response.includes(cred) && JSON.parse(openReceipt(stored.response, Buffer.from(PUSH_KEY, 'base64'))).body.installationCredential === cred, 'the receipt is sealed at rest');

    const replay = await post(reg, { 'idempotency-key': key });
    eq([replay.statusCode, replay.body], [201, first.body], 'replay: the same receipt and status');
    eq(callsOf('bobby_push_device_register').length, 1, 'a replay registers nothing');
    const otherAccount = await post(reg, { 'idempotency-key': key }, B.token);
    eq(otherAccount.statusCode, 201, 'the same key from another account is a different request (scoped by account)');
    deviceReply = { ok: true, registrationId: randomUUID(), bindingRevision: 1 };
    const changed = await post({ ...reg, appBuild: 54 }, { 'idempotency-key': key });
    eq([changed.statusCode, changed.body.code], [409, 'idempotency_mismatch'], 'same key, changed payload: 409 idempotency_mismatch');
    const busyKey = randomUUID();
    idem.rows.set(`${A.identity}|device|${busyKey}`, { digest: 'x', state: 'in_progress' });
    eq((await post(reg, { 'idempotency-key': busyKey })).statusCode, 409, 'a different payload under an in-flight key is refused');

    const rebind = { ...reg, registrationId: first.body.registrationId, expectedBindingRevision: 1 };
    const noProof = await post(rebind, { 'idempotency-key': randomUUID() });
    eq([noProof.statusCode, noProof.body.code], [400, 'invalid_request'], 'rebind requires the installation proof');
    eq((await post({ ...reg, registrationId: first.body.registrationId }, { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': cred })).body.code, 'invalid_request', 'rebind requires expectedBindingRevision');
    eq((await post(reg, { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': cred })).body.code, 'invalid_request', 'a proof on a first registration is refused');
    deviceReply = { ok: true, registrationId: first.body.registrationId, bindingRevision: 2 };
    const rb = await post(rebind, { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': cred });
    eq([rb.statusCode, rb.body.bindingRevision], [200, 2], 'rebind: 200 with the new binding revision');
    CREDENTIALS.push(rb.body.installationCredential);
    ok(rb.body.installationCredential !== cred, 'rebind rotates the credential');
    const rbCall = callsOf('bobby_push_device_rebind')[0].body;
    eq([rbCall.p_proof_verifier, rbCall.p_new_verifier, rbCall.p_expected_revision], [credentialVerifier(cred), credentialVerifier(rb.body.installationCredential), 1], 'proof checked by verifier, new verifier stored');
    deviceReply = { ok: false, code: 'not_found' };
    eq((await post(rebind, { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': 'A'.repeat(43) })).statusCode, 404, 'wrong proof: 404');
    deviceReply = { ok: false, code: 'revision_conflict', bindingRevision: 3 };
    const rc = await post(rebind, { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': cred });
    eq([rc.statusCode, rc.body.code, rc.body.bindingRevision], [409, 'revision_conflict', 3], 'stale binding: 409 with the current binding revision');
    deviceReply = { ok: false, code: 'conflict' };
    const cf = await post(reg, { 'idempotency-key': randomUUID() });
    eq([cf.statusCode, cf.body.code], [409, 'conflict'], 'active binding elsewhere: generic 409 conflict');
    ok(!JSON.stringify(cf.body).match(/identity|owner|account/i), 'a conflict reveals no owner');
    deviceReply = { ok: false, code: 'device_limit' };
    eq((await post(reg, { 'idempotency-key': randomUUID() })).body.code, 'device_limit', 'over the cap: 409 device_limit');

    const del = (body: unknown, headers: Record<string, string> = { 'x-bobby-installation-proof': cred }) => call('device', { method: 'DELETE', token: A.token, headers, body });
    deviceReply = { ok: true, state: 'revoked' };
    const d1 = await del({ registrationId: first.body.registrationId, expectedBindingRevision: 2 });
    eq([d1.statusCode, d1.body, d1.raw], [204, null, null], 'DELETE: 204 with no body');
    eq(callsOf('bobby_push_device_revoke')[0].body.p_proof_verifier, credentialVerifier(cred), 'revoke proves by verifier');
    deviceReply = { ok: true, state: 'already' };
    eq((await del({ registrationId: first.body.registrationId, expectedBindingRevision: 2 })).statusCode, 204, 'already revoked / not provable: 204');
    deviceReply = { ok: false, code: 'revision_conflict', bindingRevision: 3 };
    const d409 = await del({ registrationId: first.body.registrationId, expectedBindingRevision: 2 });
    eq([d409.statusCode, d409.body.code], [409, 'revision_conflict'], 'DELETE with a stale revision: 409');
    eq((await del({ registrationId: first.body.registrationId, expectedBindingRevision: 2 }, {})).body.code, 'invalid_request', 'DELETE requires the proof');
    eq((await del({ registrationId: first.body.registrationId })).body.code, 'invalid_request', 'DELETE requires expectedBindingRevision');
    const outage = callsOf('bobby_push_device_revoke').length;
    handlers.bobby_push_device_revoke = () => storageDown('bobby_push_device_revoke');
    eq((await del({ registrationId: first.body.registrationId, expectedBindingRevision: 2 })).statusCode, 503, 'revoke storage failure: 503');
    ok(callsOf('bobby_push_device_revoke').length === outage + 1, 'the failure was the storage call');
  }

  // ======================================================== inbox and reports
  reset();
  {
    const item = (n: number) => ({
      id: randomUUID(), cadence: 'morning', periodStart: `2026-09-${String(10 + n).padStart(2, '0')}T12:00:00+00:00`, periodEnd: `2026-09-${String(11 + n).padStart(2, '0')}T12:00:00+00:00`,
      scheduledAt: `2026-09-${String(11 + n).padStart(2, '0')}T12:00:00+00:00`, dataAsOf: `2026-09-${String(11 + n).padStart(2, '0')}T11:58:00.123456+00:00`,
      calendarVersion: 'nyse-2026-2027-v1', contentVersion: 1, quality: 'facts_only', audioState: 'none',
    });
    let inboxReply: unknown = { items: [item(3), item(2)], latest: [{ cadence: 'morning', periodKey: '2026-09-14', scheduledAt: '2026-09-14T12:00:00+00:00', state: 'ready' }] };
    handlers.bobby_brief_inbox = () => (inboxReply === 'down' ? storageDown('bobby_brief_inbox') : inboxReply);

    pro = false;
    const np = await call(null, { token: A.token });
    eq([np.statusCode, np.body.code], [403, 'subscription_required'], 'inbox without Pro: 403');
    eq(callsOf('bobby_brief_inbox').length, 0, 'no inbox read without Pro');
    pro = 'down';
    eq((await call(null, { token: A.token })).statusCode, 503, 'entitlement unknown: 503');
    pro = true;

    const p1 = await call(null, { token: A.token, query: { limit: '2' } });
    eq(p1.statusCode, 200, 'inbox: 200');
    eq(p1.body.items.map((i: any) => i.scheduledAt), ['2026-09-14T12:00:00.000Z', '2026-09-13T12:00:00.000Z'], 'timestamps normalized to UTC ISO');
    eq(p1.body.latest[0].state, 'ready', 'latest per cadence passes through');
    ok(typeof p1.body.nextCursor === 'string', 'a full page carries a cursor');
    eq(callsOf('bobby_brief_inbox')[0].body, { p_identity: A.identity, p_cadence: null, p_before_scheduled: null, p_before_id: null, p_limit: 2 }, 'owner-scoped, first page');
    const p2 = await call(null, { token: A.token, query: { limit: '2', cursor: p1.body.nextCursor } });
    eq(p2.statusCode, 200, 'next page with the cursor');
    const second = callsOf('bobby_brief_inbox')[1].body;
    eq([second.p_before_scheduled, second.p_before_id], [(inboxReply as any).items[1].scheduledAt, (inboxReply as any).items[1].id], 'keyset from the raw stored timestamp');

    const [body, tag] = String(p1.body.nextCursor).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), s: '2030-01-01T00:00:00Z' })).toString('base64url') + '.' + tag;
    eq((await call(null, { token: A.token, query: { cursor: forged, limit: '2' } })).body.code, 'invalid_request', 'tampered cursor: 400');
    eq((await call(null, { token: A.token, query: { cursor: 'garbage' } })).body.code, 'invalid_request', 'garbage cursor: 400');
    eq((await call(null, { token: B.token, query: { cursor: p1.body.nextCursor, limit: '2' } })).body.code, 'invalid_request', "another account's cursor: 400");
    eq((await call(null, { token: A.token, query: { cursor: p1.body.nextCursor, limit: '2', cadence: 'weekly' } })).body.code, 'invalid_request', 'cursor bound to its cadence filter');
    for (const limit of ['0', '21', 'abc', '-1', '1.5']) eq((await call(null, { token: A.token, query: { limit } })).body.code, 'invalid_request', `limit ${limit}: 400`);
    eq((await call(null, { token: A.token, query: { cadence: 'hourly' } })).body.code, 'invalid_request', 'cadence enum');
    inboxReply = { items: [item(1)], latest: [] };
    const short = await call(null, { token: A.token, query: { cadence: 'morning' } });
    eq([short.body.nextCursor, callsOf('bobby_brief_inbox').at(-1)!.body.p_cadence, callsOf('bobby_brief_inbox').at(-1)!.body.p_limit], [null, 'morning', 20], 'short page: no cursor; default limit 20');
    inboxReply = 'down';
    const down = await call(null, { token: A.token });
    eq([down.statusCode, down.body.code], [503, 'storage_unavailable'], 'storage failure: 503, never an empty inbox');
    ok(!('items' in down.body), 'no items on failure');

    // ---- report ----
    const RID = randomUUID();
    const content = {
      version: 1, cadence: 'morning', language: 'es', title: 'Resumen', opening: 'Apertura', dataAsOf: '2026-10-02T11:58:00Z',
      sections: [{ kind: 'market', title: 'Mercado', body: 'Texto', asOf: null, status: 'live' }],
      narrationSegments: ['Primer bloque.', 'Segundo bloque.'], sources: [{ name: 'okx', ok: true, freshness: 'live' }],
      equitySession: { date: '2026-10-02', state: 'pre_market', lastSessionDate: '2026-10-01', closeAt: null, earlyClose: false, holidayName: null },
    };
    const reportRow = { id: RID, cadence: 'morning', contentVersion: 1, periodStart: '2026-10-01T12:00:00+00:00', periodEnd: '2026-10-02T12:00:00+00:00', scheduledAt: '2026-10-02T12:00:00+00:00', dataAsOf: '2026-10-02T11:58:00+00:00', calendarVersion: 'nyse-2026-2027-v1', quality: 'partial', content, voice: 'coral', language: 'es' };
    handlers.bobby_brief_get = (b) => (b.p_id === RID && b.p_identity === A.identity ? { report: reportRow } : { code: 'not_found' });
    const rep = await call('report', { token: A.token, query: { id: RID.toUpperCase() } });
    eq(rep.statusCode, 200, 'report: 200 (id case-normalized)');
    eq(Object.keys(rep.body).sort(), ['cadence', 'calendarVersion', 'contentVersion', 'dataAsOf', 'equitySession', 'id', 'language', 'narrationSegments', 'opening', 'periodEnd', 'periodStart', 'quality', 'scheduledAt', 'sections', 'sources', 'title', 'voice'], 'report fields (content flattened)');
    eq([rep.body.title, rep.body.narrationSegments, rep.body.voice, rep.body.scheduledAt], ['Resumen', content.narrationSegments, 'coral', '2026-10-02T12:00:00.000Z'], 'report content');
    const originalReportHandler = handlers.bobby_brief_get;
    handlers.bobby_brief_get = () => ({ report: { ...reportRow, cadence: 'weekly', content: { ...content, personalBasis: 'asked_assets' } } });
    eq((await call('report', { token: A.token, query: { id: RID } })).body.personalBasis, 'asked_assets', 'weekly personal basis exposed for honest native copy');
    handlers.bobby_brief_get = originalReportHandler;
    const foreign = await call('report', { token: B.token, query: { id: RID } });
    const missing = await call('report', { token: B.token, query: { id: randomUUID() } });
    eq([foreign.statusCode, foreign.body], [404, missing.body], "another account's report is the same 404 as a missing one");
    eq((await call('report', { token: A.token, query: { id: 'nope' } })).body.code, 'invalid_request', 'id must be a UUID');
    eq((await call('report', { token: A.token })).body.code, 'invalid_request', 'id is required');
    pro = false;
    eq((await call('report', { token: A.token, query: { id: RID } })).body.code, 'subscription_required', 'report without Pro: 403');
    pro = true;
    handlers.bobby_brief_get = () => ({ code: 'subscription_required' });
    eq((await call('report', { token: A.token, query: { id: RID } })).statusCode, 403, 'a Pro lapse reported by storage: 403');
    handlers.bobby_brief_get = () => storageDown('bobby_brief_get');
    eq((await call('report', { token: A.token, query: { id: RID } })).statusCode, 503, 'report storage failure: 503');
    ok(!rpcCalls.some((c) => /shared|claim|publish|seed/.test(c.name)), 'opening never prepares or regenerates anything');
  }

  // ======================================================== voice and audio
  reset();
  {
    const RID = randomUUID();
    const AUDIO = randomUUID();
    const segs = ['Primer bloque del resumen.', 'Segundo bloque.'];
    handlers.bobby_brief_get = (b) => (b.p_id === RID && b.p_identity === A.identity
      ? { report: { id: RID, cadence: 'morning', contentVersion: 2, periodStart: '2026-10-01T12:00:00Z', periodEnd: '2026-10-02T12:00:00Z', scheduledAt: '2026-10-02T12:00:00Z', dataAsOf: null, calendarVersion: 'v', quality: 'full', content: { title: 't', opening: 'o', sections: [], narrationSegments: segs, sources: [] }, voice: 'coral', language: 'es' } }
      : { code: 'not_found' });
    let audioReq: unknown = { audioId: AUDIO, state: 'queued' };
    handlers.bobby_brief_audio_request = () => audioReq;
    let ensureReply: (p: any) => Promise<any> = async () => ({ state: 'processing', retryAfterSeconds: 2 });
    const ensureCalls: any[] = [];
    setBriefingsDepsForTests({ waitUntil: (p) => { deferred.push(p); }, voiceWaitMs: 50, ensureAudio: (async (p: any) => { ensureCalls.push(p); return ensureReply(p); }) as never });
    const body = { briefId: RID, contentVersion: 2, segmentIndex: 0, voice: 'coral', language: 'es' };
    const voice = (b: unknown = body, key: string = randomUUID(), token = A.token) => call('voice', { method: 'POST', token, headers: { 'idempotency-key': key }, body: b });

    const noConsent = await voice();
    eq([noConsent.statusCode, noConsent.body.code], [403, 'consent_required'], 'voice without audio consent: 403 consent_required');
    settingsState = baseSettings({ audioConsentEnabled: true, audioConsentVersion: CONSENT_VERSIONS.audio + 1 });
    eq((await voice()).body.code, 'consent_required', 'consent at an old/other version does not count');
    settingsState = baseSettings({ audioConsentEnabled: true, audioConsentVersion: CONSENT_VERSIONS.audio });
    pro = false;
    eq((await voice()).body.code, 'subscription_required', 'voice without Pro: 403');
    pro = true;
    eq((await call('voice', { method: 'POST', token: A.token, body })).body.code, 'idempotency_key_required', 'voice requires Idempotency-Key');
    eq((await voice({ ...body, text: 'say this' })).body.code, 'invalid_request', 'no client text accepted');
    eq((await voice({ ...body, voice: 'robot' })).body.code, 'invalid_request', 'unknown voice: 400');
    eq((await voice({ ...body, segmentIndex: 4 })).body.code, 'invalid_request', 'segment index bounded');
    eq((await voice({ ...body, segmentIndex: 3 })).body.code, 'invalid_request', 'segment must exist in the report');
    const mismatch = await voice({ ...body, voice: 'nova' });
    eq([mismatch.statusCode, mismatch.body.code], [409, 'content_version_conflict'], 'voice other than the frozen one: 409');
    eq((await voice({ ...body, language: 'en' })).statusCode, 409, 'language other than the frozen one: 409');
    eq((await voice({ ...body, contentVersion: 1 })).body.code, 'content_version_conflict', 'stale content version: 409');
    eq((await voice(body, randomUUID(), B.token)).statusCode, 404, "another account's report: 404");

    audioReq = { code: 'subscription_required' };
    eq([(await voice()).statusCode, ensureCalls.length], [403, 0], 'paid entitlement lapses between validation and queue: 403, no synthesis');

    audioReq = { audioId: AUDIO, state: 'ready' };
    const ready = await voice();
    eq([ready.statusCode, ready.body], [200, { state: 'ready', audioId: AUDIO, mediaType: 'audio/mpeg' }], 'cached audio: 200 ready');
    const ar = callsOf('bobby_brief_audio_request').at(-1)!.body;
    eq(ar.p_cache_key, audioCacheKey(segs[0], 'coral', 'es', BRIEF_VIBE, TTS_MODEL()), 'cache key from the stored segment text');
    eq([ar.p_identity, ar.p_brief, ar.p_segment, ar.p_content_version], [A.identity, RID, 0, 2], 'owner-scoped audio request');
    eq(ensureCalls.length, 0, 'ready audio starts no synthesis');

    audioReq = { audioId: AUDIO, state: 'queued' };
    const offRes = await voice();
    eq([offRes.statusCode, offRes.body.code], [503, 'feature_disabled'], 'kill switch off: 503 feature_disabled, no synthesis');
    eq(ensureCalls.length, 0, 'nothing synthesized with the flag off');
    process.env.BOBBY_BRIEFINGS_ENABLED = 'on';
    const pend = await voice();
    eq([pend.statusCode, pend.body, pend.headers['retry-after']], [202, { state: 'processing', audioId: AUDIO, retryAfterSeconds: 2 }, '2'], 'pending: 202 with Retry-After');
    eq([ensureCalls[0].text, ensureCalls[0].voice, ensureCalls[0].language, ensureCalls[0].audioId], [segs[0], 'coral', 'es', AUDIO], 'synthesis gets the stored segment only');
    ensureReply = async () => ({ state: 'ready' });
    eq((await voice()).statusCode, 200, 'synthesis done within the wait: 200');
    ensureReply = () => new Promise((resolve) => setTimeout(() => resolve({ state: 'ready' }), 300));
    const slow = await voice();
    eq([slow.statusCode, slow.body.state], [202, 'processing'], 'slow synthesis: 202 processing, continues in waitUntil');
    ensureReply = async () => ({ state: 'failed' });
    eq((await voice()).body.code, 'voice_unavailable', 'provider failure: 503 voice_unavailable');
    ensureReply = async () => ({ state: 'queued', retryAfterSeconds: 60 });
    const budget = await voice();
    eq([budget.statusCode, budget.body.code], [503, 'voice_unavailable'], 'budget refusal: 503 voice_unavailable');
    ensureReply = async () => ({ state: 'queued', retryAfterSeconds: 3 });
    eq([(await voice()).statusCode], [202], 'slots full: 202 queued');
    ensureReply = async () => { throw new db.BriefingStorageError('bobby_brief_audio_claim', 500); };
    eq((await voice()).body.code, 'storage_unavailable', 'audio claim storage failure: 503 storage_unavailable');
    audioReq = { audioId: AUDIO, state: 'failed' };
    eq((await voice()).body.code, 'voice_unavailable', 'a failed audio row: 503 voice_unavailable');
    audioReq = { code: 'content_version_conflict' };
    eq((await voice()).statusCode, 409, 'storage version check: 409');

    audioReq = { audioId: AUDIO, state: 'ready' };
    const k = randomUUID();
    eq((await voice(body, k)).statusCode, 200, 'first use of a key');
    eq((await voice(body, k)).statusCode, 200, 'repeat of the same key re-evaluates the same work item');
    eq((await voice({ ...body, segmentIndex: 1 }, k)).body.code, 'idempotency_mismatch', 'same key, different body: 409');

    // ---- audio ----
    let auth: unknown = { state: 'ready', storagePath: `v1/ab/${'ab'.repeat(32)}.mp3`, mime: 'audio/mpeg' };
    handlers.bobby_brief_audio_authorize = (b) => (b.p_identity === A.identity ? auth : { code: 'not_found' });
    const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
    let stored: Buffer | null | 'down' = MP3;
    const gets: string[] = [];
    setBriefingsDepsForTests({ waitUntil: (p) => { deferred.push(p); }, audioStore: () => ({ put: async () => {}, remove: async () => {}, get: async (p: string) => { gets.push(p); if (stored === 'down') throw new db.BriefingStorageError('storage:get', 500); return stored; } }) });
    const a = await call('audio', { token: A.token, query: { id: AUDIO } });
    eq([a.statusCode, a.headers['content-type'], a.headers['cache-control'], a.raw?.equals(MP3)], [200, 'audio/mpeg', 'private, no-store', true], 'ready audio: 200 audio/mpeg, private no-store');
    eq(gets, [`v1/ab/${'ab'.repeat(32)}.mp3`], 'served from the private store path');
    eq((await call('audio', { token: B.token, query: { id: AUDIO } })).statusCode, 404, "another account's audio: 404");
    auth = { state: 'processing', storagePath: null, mime: 'audio/mpeg' };
    const p202 = await call('audio', { token: A.token, query: { id: AUDIO } });
    eq([p202.statusCode, p202.headers['retry-after'], p202.body.state], [202, '2', 'processing'], 'pending audio: 202 + Retry-After 2');
    delete process.env.BOBBY_BRIEFINGS_ENABLED;
    auth = { state: 'queued', storagePath: null, mime: 'audio/mpeg' };
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).body.code, 'feature_disabled', 'queued with the kill switch off: 503 (never polls forever)');
    auth = { state: 'failed', storagePath: null, mime: 'audio/mpeg' };
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).body.code, 'voice_unavailable', 'failed audio: 503');
    auth = { state: 'ready', storagePath: `v1/ab/${'ab'.repeat(32)}.mp3`, mime: 'audio/mpeg' };
    stored = null;
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).body.code, 'storage_unavailable', 'object missing: 503 storage_unavailable');
    stored = 'down';
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).statusCode, 503, 'store failure: 503');
    auth = { code: 'subscription_required' };
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).statusCode, 403, 'audio after a Pro lapse: 403');
    pro = false;
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).body.code, 'subscription_required', 'audio without Pro: 403');
    pro = true;
    settingsState = baseSettings();
    eq((await call('audio', { token: A.token, query: { id: AUDIO } })).body.code, 'consent_required', 'audio without consent: 403 consent_required');
    eq((await call('audio', { token: A.token, query: { id: 'x' } })).body.code, 'invalid_request', 'audio id must be a UUID');
  }
  await Promise.allSettled(deferred.splice(0));
  setBriefingsDepsForTests({ waitUntil: (p) => { deferred.push(p); } });

  // ======================================================== global invariants (mocked part)
  eq(seen.filter((r) => r.headers['cache-control'] !== 'private, no-store').length, 0, 'every response is private, no-store');
  eq(seen.filter((r) => r.statusCode >= 400 && !(r.body && typeof r.body.code === 'string' && typeof r.body.error === 'string')).length, 0, 'every error is {error, code}');
  const deviceSuccess = (r: Res) => (r.statusCode === 200 || r.statusCode === 201) && r.body && 'installationCredential' in r.body;
  const leaks = (text: string, allowCredential: boolean) => [...TOKENS, ...(allowCredential ? [] : CREDENTIALS)].filter((s) => text.includes(s));
  eq(seen.flatMap((r) => leaks(JSON.stringify(r.body ?? '') + JSON.stringify(r.headers), deviceSuccess(r))), [], 'no response carries a bearer or APNs token (credentials only in their own receipt)');
  eq(leaks(logs.join('\n'), false), [], 'no log line carries a bearer, APNs token or credential');
  ok(logs.every((l) => l.startsWith('[briefings]') || l.startsWith('[briefings-') || l.startsWith('[user-identity]')), 'log lines are prefixed and sanitized');

  // ======================================================== real SQL (local scratch PostgreSQL)
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
    realConsole.log('briefings-api: PG part SKIP (no DATABASE_URL)');
  } else {
    const { assertLocalUrl, bootstrapBriefingsDb, makeIdentity, pgRpcTransport, setPro } = await import('./briefings-pg-harness.mts');
    assertLocalUrl(url);
    const pool = await bootstrapBriefingsDb(url);
    try {
      db.setBriefingRpc(pgRpcTransport(pool));
      const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
      const pgAccount = async (proOn: boolean) => {
        const identity = await makeIdentity(pool, { pro: proOn });
        const [{ auth_user_id }] = await q('select auth_user_id from public.bobby_identities where id = $1', [identity]);
        const token = `pg-${randomBytes(12).toString('hex')}`;
        users.set(token, { authUser: auth_user_id, identity });
        TOKENS.push(token);
        identityByAuth.set(auth_user_id, identity);
        return { token, identity };
      };
      const PA = await pgAccount(true);
      const PB = await pgAccount(true);
      const PC = await pgAccount(false);
      process.env.BOBBY_BRIEFINGS_ENABLED = 'on';

      // ---- settings ----
      const g0 = await call('settings', { token: PA.token });
      eq([g0.statusCode, g0.body.revision, g0.headers.etag, g0.body.eligiblePro, g0.body.openingEnabled], [200, 0, '"0"', true, false], 'PG settings GET: defaults at revision 0');
      const p1 = await call('settings', { method: 'PATCH', token: PA.token, headers: { 'if-match': '"0"' }, body: { weeklyEnabled: true, language: 'es', companionId: 'kora', assets: ['BTC', 'NVDA'], audioConsentEnabled: true, acceptedAudioConsentVersion: CONSENT_VERSIONS.audio } });
      eq([p1.statusCode, p1.body.revision, p1.headers.etag, p1.body.audioConsentVersion, p1.body.assets], [200, 1, '"1"', CONSENT_VERSIONS.audio, ['BTC', 'NVDA']], 'PG PATCH saved');
      const [row] = await q('select audio_consent_at is not null as at, revision from public.bobby_brief_settings where identity_id = $1', [PA.identity]);
      eq([row.at, row.revision], [true, 1], 'PG consent acceptance time recorded');
      const st = await call('settings', { method: 'PATCH', token: PA.token, headers: { 'if-match': '"0"' }, body: { weeklyEnabled: true } });
      eq([st.statusCode, st.body.revision, st.headers.etag], [409, 1, '"1"'], 'PG stale PATCH: 409 with the current revision');
      const g1 = await call('settings', { token: PA.token });
      eq([g1.body.language, g1.body.companionId, g1.body.weeklyEnabled], ['es', 'kora', true], 'PG GET reflects only the accepted change');
      const pc = await call('settings', { method: 'PATCH', token: PC.token, headers: { 'if-match': '"0"' }, body: { weeklyEnabled: true } });
      eq([pc.statusCode, pc.body.eligiblePro, pc.body.weeklyEnabled], [200, false, true], 'PG non-Pro may save (eligiblePro false)');
      await call('settings', { method: 'PATCH', token: PB.token, headers: { 'if-match': '"0"' }, body: { audioConsentEnabled: true, acceptedAudioConsentVersion: CONSENT_VERSIONS.audio } });

      // ---- devices: register, replay, A→B rebind, late revoke from A ----
      const TOKEN = randomBytes(32).toString('hex');
      TOKENS.push(TOKEN);
      const inst = randomUUID();
      const reg = { installationId: inst, apnsToken: TOKEN, permissionState: 'authorized', appBuild: 53, apnsEnvironment: 'production' };
      const k1 = randomUUID();
      const r1 = await call('device', { method: 'POST', token: PA.token, headers: { 'idempotency-key': k1 }, body: reg });
      eq([r1.statusCode, r1.body.bindingRevision], [201, 1], 'PG register A: 201');
      const cred1 = r1.body.installationCredential as string;
      const regId = r1.body.registrationId as string;
      const [dev] = await q('select identity_id, token_ciphertext, credential_verifier, status from public.bobby_push_devices where id = $1', [regId]);
      eq([dev.identity_id, dev.status, dev.credential_verifier], [PA.identity, 'active', sha(cred1)], 'PG device bound to A with the verifier only');
      ok(!String(dev.token_ciphertext).includes(TOKEN), 'PG token stored encrypted');
      const r1b = await call('device', { method: 'POST', token: PA.token, headers: { 'idempotency-key': k1 }, body: reg });
      eq([r1b.statusCode, r1b.body], [201, r1.body], 'PG replay returns the same sealed receipt');
      eq((await call('device', { method: 'POST', token: PA.token, headers: { 'idempotency-key': k1 }, body: { ...reg, appBuild: 54 } })).body.code, 'idempotency_mismatch', 'PG changed payload under the same key: 409');
      const bConflict = await call('device', { method: 'POST', token: PB.token, headers: { 'idempotency-key': randomUUID() }, body: reg });
      eq([bConflict.statusCode, bConflict.body.code], [409, 'conflict'], 'PG B cannot take the installation without its proof');
      const rb = await call('device', { method: 'POST', token: PB.token, headers: { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': cred1 }, body: { ...reg, registrationId: regId, expectedBindingRevision: 1 } });
      eq([rb.statusCode, rb.body.registrationId, rb.body.bindingRevision], [200, regId, 2], 'PG rebind A→B with the proof: 200, revision 2');
      const cred2 = rb.body.installationCredential as string;
      CREDENTIALS.push(cred1, cred2);
      const lateA = await call('device', { method: 'DELETE', token: PA.token, headers: { 'x-bobby-installation-proof': cred1 }, body: { registrationId: regId, expectedBindingRevision: 1 } });
      eq(lateA.statusCode, 204, "PG a late logout from A answers 204");
      const [afterLate] = await q('select identity_id, status, binding_revision from public.bobby_push_devices where id = $1', [regId]);
      eq([afterLate.identity_id, afterLate.status, Number(afterLate.binding_revision)], [PB.identity, 'active', 2], "PG ...and does not revoke or steal B's binding");
      const oldProof = await call('device', { method: 'POST', token: PA.token, headers: { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': cred1 }, body: { ...reg, registrationId: regId, expectedBindingRevision: 2 } });
      eq(oldProof.statusCode, 404, 'PG the rotated-out credential no longer proves anything');
      const staleB = await call('device', { method: 'DELETE', token: PB.token, headers: { 'x-bobby-installation-proof': cred2 }, body: { registrationId: regId, expectedBindingRevision: 1 } });
      eq([staleB.statusCode, staleB.body.code, staleB.body.bindingRevision], [409, 'revision_conflict', 2], 'PG stale revoke: 409');
      eq((await call('device', { method: 'DELETE', token: PB.token, headers: { 'x-bobby-installation-proof': cred2 }, body: { registrationId: regId, expectedBindingRevision: 2 } })).statusCode, 204, 'PG B revokes: 204');
      eq((await q('select status from public.bobby_push_devices where id = $1', [regId]))[0].status, 'revoked', 'PG revoked');
      eq((await call('device', { method: 'DELETE', token: PB.token, headers: { 'x-bobby-installation-proof': cred2 }, body: { registrationId: regId, expectedBindingRevision: 2 } })).statusCode, 204, 'PG revoke is idempotent');

      // ---- inbox / report / audio isolation ----
      // Audio is shared by cache key across accounts and runs (D2): a run-unique segment keeps this run's audio fresh.
      const RUN = randomBytes(4).toString('hex');
      const content = (n: number) => JSON.stringify({
        version: 1, cadence: 'morning', language: 'es', title: `Resumen ${n}`, opening: 'Apertura', dataAsOf: '2026-09-20T11:58:00Z',
        sections: [], narrationSegments: [`Bloque de prueba ${n} ${RUN}.`], sources: [], equitySession: null,
      });
      const insertReport = async (identity: string, day: string, n: number) => (await q(`
        insert into public.bobby_briefs (identity_id, cadence, period_key, period_start, period_end, scheduled_at, push_expires_at, calendar_version,
          policy_version, state, content, content_version, language, voice, quality, data_as_of, ready_at)
        values ($1, 'morning', $2::text, $4::timestamptz - interval '1 day', $4::timestamptz, $4::timestamptz, $4::timestamptz + interval '30 minutes',
          'nyse-2026-2027-v1', 'proposed-v1', 'ready', $3::jsonb, 1, 'es', 'coral', 'facts_only', $4::timestamptz - interval '2 minutes', now())
        returning id`, [identity, day, content(n), `${day}T12:00:00Z`]))[0].id as string;
      const a1 = await insertReport(PA.identity, '2026-09-28', 1);
      const a2 = await insertReport(PA.identity, '2026-09-29', 2);
      const a3 = await insertReport(PA.identity, '2026-09-30', 3);
      const b1 = await insertReport(PB.identity, '2026-09-30', 9);
      const page1 = await call(null, { token: PA.token, query: { limit: '2' } });
      eq([page1.statusCode, page1.body.items.map((i: any) => i.id)], [200, [a3, a2]], 'PG inbox: newest first, owner only');
      eq(page1.body.items[0].scheduledAt, '2026-09-30T12:00:00.000Z', 'PG timestamps as UTC ISO');
      const page2 = await call(null, { token: PA.token, query: { limit: '2', cursor: page1.body.nextCursor } });
      eq([page2.body.items.map((i: any) => i.id), page2.body.nextCursor], [[a1], null], 'PG second page via the signed cursor');
      eq((await call(null, { token: PB.token, query: { limit: '2', cursor: page1.body.nextCursor } })).body.code, 'invalid_request', "PG B cannot use A's cursor");
      eq((await call(null, { token: PB.token })).body.items.map((i: any) => i.id), [b1], 'PG B sees only its report');
      eq((await call(null, { token: PC.token })).statusCode, 403, 'PG non-Pro inbox: 403');
      const own = await call('report', { token: PA.token, query: { id: a3 } });
      eq([own.statusCode, own.body.title, own.body.voice, own.body.narrationSegments], [200, 'Resumen 3', 'coral', [`Bloque de prueba 3 ${RUN}.`]], 'PG own report');
      const cross = await call('report', { token: PA.token, query: { id: b1 } });
      const none = await call('report', { token: PA.token, query: { id: randomUUID() } });
      eq([cross.statusCode, cross.body], [404, none.body], "PG B's report is the same 404 as a missing one");
      await setPro(pool, PA.identity, false);
      eq((await call('report', { token: PA.token, query: { id: a3 } })).body.code, 'subscription_required', 'PG Pro lapse: 403 on own report');
      await setPro(pool, PA.identity, true);

      const ensure: any[] = [];
      setBriefingsDepsForTests({
        waitUntil: (p) => { deferred.push(p); }, voiceWaitMs: 50,
        ensureAudio: (async (p: any) => { ensure.push(p); return { state: 'processing', retryAfterSeconds: 2 }; }) as never,
        audioStore: () => ({ put: async () => {}, remove: async () => {}, get: async () => Buffer.from([1, 2, 3]) }),
      });
      const vb = { briefId: a3, contentVersion: 1, segmentIndex: 0, voice: 'coral', language: 'es' };
      const vk = randomUUID();
      const v1 = await call('voice', { method: 'POST', token: PA.token, headers: { 'idempotency-key': vk }, body: vb });
      eq([v1.statusCode, v1.body.state], [202, 'processing'], 'PG voice: queued work answered 202');
      const audioId = v1.body.audioId as string;
      const [arow] = await q('select cache_key, voice, language, state from public.bobby_brief_audio where id = $1', [audioId]);
      eq([arow.cache_key, arow.voice, arow.language], [audioCacheKey(`Bloque de prueba 3 ${RUN}.`, 'coral', 'es', BRIEF_VIBE, TTS_MODEL()), 'coral', 'es'], 'PG shared audio row keyed by the segment');
      eq(ensure.length, 1, 'PG one synthesis started');
      eq((await call('voice', { method: 'POST', token: PA.token, headers: { 'idempotency-key': randomUUID() }, body: { ...vb, voice: 'nova' } })).statusCode, 409, 'PG voice other than the frozen one: 409');
      eq((await call('voice', { method: 'POST', token: PB.token, headers: { 'idempotency-key': randomUUID() }, body: vb })).statusCode, 404, "PG B cannot narrate A's report");
      const pend = await call('audio', { token: PA.token, query: { id: audioId } });
      eq([pend.statusCode, pend.headers['retry-after']], [202, '2'], 'PG audio pending: 202');
      await q("update public.bobby_brief_audio set state = 'ready', storage_path = $2, bytes = 3, ready_at = now() where id = $1", [audioId, `v1/${arow.cache_key.slice(0, 2)}/${arow.cache_key}.mp3`]);
      const again = await call('voice', { method: 'POST', token: PA.token, headers: { 'idempotency-key': vk }, body: vb });
      eq([again.statusCode, again.body.state, again.body.audioId], [200, 'ready', audioId], 'PG repeat of the key now answers ready');
      const got = await call('audio', { token: PA.token, query: { id: audioId } });
      eq([got.statusCode, got.headers['content-type'], got.raw?.length], [200, 'audio/mpeg', 3], 'PG audio served to its owner');
      eq((await call('audio', { token: PB.token, query: { id: audioId } })).statusCode, 404, "PG B cannot fetch A's audio");
      eq((await call('audio', { token: PC.token, query: { id: audioId } })).statusCode, 403, 'PG non-Pro audio: 403');

      // Existing global Pro (including grants and RevenueCat's active mirror) is insufficient. All protected
      // feature routes re-evaluate synthetic paid evidence; no real billing record or provider is used here.
      await q("insert into bobby_pro_grants (identity_id, pro_until) values ($1, now() + interval '30 days')", [PC.identity]);
      eq([(await call('settings', { token: PC.token })).body.eligiblePro, (await call(null, { token: PC.token })).statusCode], [false, 403], 'PG grant-only Pro denied for weekly benefits');
      for (const [sql, label] of [
        ["update bobby_brief_paid_periods set period_type = 'trial' where identity_id = $1", 'active mirror with a trial'],
        ["update bobby_brief_paid_periods set environment = 'sandbox' where identity_id = $1", 'Sandbox proof'],
        ["update bobby_brief_paid_periods set environment = 'unknown' where identity_id = $1", 'unknown environment'],
        ["update bobby_brief_paid_periods set verification_state = 'unverified' where identity_id = $1", 'unverified proof'],
        ["delete from bobby_brief_paid_periods where identity_id = $1", 'missing proof'],
        ["update bobby_subscriptions set current_period_end = null where identity_id = $1", 'unknown expiry'],
        ["update bobby_subscriptions set status = 'expired' where identity_id = $1", 'expired subscription'],
      ]) {
        await setPro(pool, PA.identity, true);
        await q(sql, [PA.identity]);
        const before = ensure.length;
        eq((await call('settings', { token: PA.token })).body.eligiblePro, false, `PG ${label}: eligiblePro false`);
        const guarded = [
          await call(null, { token: PA.token }),
          await call('report', { token: PA.token, query: { id: a3 } }),
          await call('voice', { method: 'POST', token: PA.token, headers: { 'idempotency-key': randomUUID() }, body: vb }),
          await call('audio', { token: PA.token, query: { id: audioId } }),
        ];
        eq(guarded.map(r => [r.statusCode, r.body.code]), Array.from({ length: 4 }, () => [403, 'subscription_required']), `PG ${label}: inbox/report/voice/audio denied`);
        eq(ensure.length, before, `PG ${label}: starts no synthesis`);
      }
      await setPro(pool, PA.identity, true);

      eq(seen.filter((r) => r.headers['cache-control'] !== 'private, no-store').length, 0, 'PG every response is private, no-store');
      eq(seen.flatMap((r) => leaks(JSON.stringify(r.body ?? ''), (r.statusCode === 200 || r.statusCode === 201) && r.body && 'installationCredential' in r.body)), [], 'PG no response leaks a token');
      eq(leaks(logs.join('\n'), false), [], 'PG no log leaks a token or credential');
    } finally {
      await Promise.allSettled(deferred.splice(0));
      await pool.end();
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  Object.assign(console, realConsole);
  setBriefingsDepsForTests(null);
}
console.log(`briefings-api: ${checks} checks passed`);
