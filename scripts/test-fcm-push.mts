// Actual router, crypto, HTTP-v1 transport and worker with declared local doubles; no real network.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, randomBytes, verify } from 'node:crypto';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'fixture-service';
process.env.BOBBY_SUPABASE_ANON_KEY = 'fixture-anon';
process.env.BOBBY_BRIEFINGS_ENABLED = 'on';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const projectId = 'bobby-fcm-fixture';
const cfg = { projectId, packageName: 'xyz.bobbyprotocol.bobby', clientEmail: `fixture@${projectId}.iam.gserviceaccount.com`, privateKey: pem };
const fcm = await import('../api/_lib/briefings/fcm.ts');
const crypto = await import('../api/_lib/briefings/push-crypto.ts');
const db = await import('../api/_lib/briefings/db.ts');
const { default: handler } = await import('../api/briefings.ts');
const { runTick } = await import('../api/_lib/briefings/worker.ts');
const MASTER = randomBytes(32); process.env.BOBBY_PUSH_TOKEN_KEY = MASTER.toString('base64');
const now = new Date('2026-10-05T12:00:00Z');
let checks = 0;
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a: unknown, label: string) => { assert.ok(a, label); checks++; };
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const log: string[] = [];
const originalConsole = { error: console.error, warn: console.warn };
console.error = (...values: unknown[]) => { log.push(values.map(String).join(' ')); };
console.warn = console.error;
const originalFetch = globalThis.fetch;
const unexpected: string[] = [];
const owner = randomUUID(), authUser = randomUUID(), bearer = 'fixture-owner-bearer';
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === 'db.test') {
    if (url.pathname.endsWith('/api_cache')) return json(init?.method === 'POST' ? null : []);
    if (url.pathname.endsWith('/auth/v1/user')) return new Headers(init?.headers).get('authorization') === `Bearer ${bearer}`
      ? json({ id: authUser, app_metadata: { provider: 'google' } }) : json({}, 401);
    if (url.pathname.endsWith('/bobby_identities')) return json([{ id: owner, auth_user_id: authUser, wallet_address: null }]);
  }
  unexpected.push(url.hostname + url.pathname); throw new Error('Unexpected fixture request');
}) as typeof fetch;
const n = { fid: 'cAaBB_cCddEEff0011-xyZ9', projectId, packageName: cfg.packageName, briefId: randomUUID(), registrationId: randomUUID(), bindingRevision: 3, expiresAt: new Date(now.getTime() + 600_000) };
function env(enabled = 'true') {
  return { BOBBY_FCM_PUSH_ENABLED: enabled, BOBBY_FCM_PROJECT_ID: projectId, BOBBY_FCM_CLIENT_EMAIL: cfg.clientEmail, BOBBY_FCM_PRIVATE_KEY: pem };
}
function world(status = 200, errorCode?: string, options: { missingReceipt?: boolean; network?: boolean; oauthStatus?: number; retry?: string; oauthToken?: string } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = (async (input: string | URL, init: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: options.oauthToken ?? 'fixture-oauth-token', token_type: 'Bearer', expires_in: 3600 }, options.oauthStatus ?? 200);
    if (url === `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`) {
      if (options.network) throw new Error('ambiguous fixture write');
      return status < 300 ? json(options.missingReceipt ? {} : { name: `projects/${projectId}/messages/fixture-message` }, status)
        : json({ error: { details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] } }, status, options.retry ? { 'Retry-After': options.retry } : {});
    }
    throw new Error('Unexpected provider fixture');
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
const requestId = randomUUID(), installation = randomUUID();
const body = { provider: 'fcm', installationId: installation, fcmInstallationId: n.fid, fcmProjectId: projectId, permissionState: 'authorized', appBuild: 1 };
const writes: any[] = [], revokes: any[] = [];
const receipts = new Map<string, any>();
let migration = true, allowed = true;
db.setBriefingRpc(async (name, p) => {
  if (name === 'bobby_brief_fcm_capability_v2') { if (!migration) throw new db.BriefingStorageError(name, 404); return { registrationVersion: 2, targetType: 'fid' }; }
  if (name === 'bobby_push_device_write_once_fcm_v2') {
    writes.push(p);
    const existing = receipts.get(String(p.p_key));
    if (existing) return existing.digest === p.p_digest ? { ...existing.response, state: 'replay' } : { state: 'mismatch' };
    if (!allowed) return { state: 'done', status: 400, response: JSON.stringify({ device: { ok: false, code: 'consent_required' } }) };
    const response = { state: 'done', status: p.p_action === 'register' ? 201 : 200, response: JSON.stringify({ device: { ok: true, registrationId: n.registrationId, bindingRevision: p.p_action === 'register' ? 1 : 2 }, sealedCredential: p.p_sealed_credential }) };
    receipts.set(String(p.p_key), { digest: p.p_digest, response }); return response;
  }
  if (name === 'bobby_push_device_revoke') { revokes.push(p); return { ok: true, state: 'revoked' }; }
  unexpected.push(name); throw new Error('Unexpected fixture RPC');
});
async function call(method: string, payload?: unknown, headers: Record<string, string> = {}, authenticated = true) {
  const res = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(k: string, v: unknown) { this.headers[k.toLowerCase()] = String(v); },
    status(code: number) { this.statusCode = code; return this; }, json(v: unknown) { this.body = v; return this; }, end() { return this; } };
  await handler({ method, query: { op: 'device' }, body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '203.0.113.31', ...(authenticated ? { authorization: `Bearer ${bearer}` } : {}), 'x-bobby-push-client': '2', 'idempotency-key': requestId, ...headers } } as never, res as never);
  return res;
}

try {
  eq(fcm.fcmConfig({}), null, 'default FCM is off');
  for (const value of ['false', 'on', 'TRUE', '1']) eq(fcm.fcmConfig(env(value)), null, 'only exact true enables FCM');
  ok(fcm.fcmConfig(env()), 'valid explicit project and RSA key accepted');
  eq(fcm.fcmConfig({ ...env(), BOBBY_FCM_CLIENT_EMAIL: 'fixture@other-project.iam.gserviceaccount.com' }), null, 'wrong service-account project rejected');
  eq(fcm.fcmConfig({ ...env(), BOBBY_FCM_PRIVATE_KEY: 'broken' }), null, 'unusable key rejected');
  const jwt = fcm.fcmAssertion(cfg, now).split('.');
  eq(JSON.parse(Buffer.from(jwt[0], 'base64url').toString()), { alg: 'RS256', typ: 'JWT' }, 'JWT algorithm is RS256');
  eq(JSON.parse(Buffer.from(jwt[1], 'base64url').toString()), { iss: cfg.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now.getTime() / 1000, exp: now.getTime() / 1000 + 3600 }, 'exact Google OAuth claims, no delegated user');
  ok(verify('RSA-SHA256', Buffer.from(jwt.slice(0, 2).join('.')), publicKey, Buffer.from(jwt[2], 'base64url')), 'actual RSA signature verifies');
  const sealed = crypto.encryptFcmTarget(n.fid, MASTER);
  eq(crypto.decryptFcmTarget(sealed, MASTER), n.fid, 'FID case retained');
  ok(crypto.fcmTargetFingerprint(n.fid, projectId, cfg.packageName, MASTER) !== crypto.fcmTargetFingerprint(n.fid.toLowerCase(), projectId, cfg.packageName, MASTER), 'case-sensitive keyed fingerprint');
  ok(crypto.fcmTargetFingerprint(n.fid, projectId, cfg.packageName, MASTER) !== crypto.tokenFingerprint(n.fid, cfg.packageName, 'production', MASTER), 'provider fingerprint domain isolation');
  assert.throws(() => crypto.decryptToken(sealed, MASTER)); checks++;
  for (const [status, code, outcome, options] of [
    [200, undefined, 'accepted', {}], [200, undefined, 'ambiguous', { missingReceipt: true }], [404, 'UNREGISTERED', 'invalid_token', {}],
    [403, 'SENDER_ID_MISMATCH', 'config', {}], [400, 'INVALID_ARGUMENT', 'config', {}], [404, undefined, 'config', {}],
    [429, 'QUOTA_EXCEEDED', 'retry', { retry: '120' }], [503, undefined, 'retry', {}], [200, undefined, 'ambiguous', { network: true }],
  ] as const) {
    fcm.resetFcmTokenCache(); const w = world(status, code, options); const result = await fcm.sendFcm(cfg, n, w.fetch, now);
    eq(result.outcome, outcome, `FCM status ${status}/${code ?? ''}: classified`);
    eq(w.calls.length, 2, 'one OAuth and one send, no immediate retry');
    const payload = JSON.parse(String(w.calls[1].init.body));
    eq(payload.message.data, { v: '1', kind: 'briefing', briefId: n.briefId, registrationId: n.registrationId, bindingRevision: '3', expiresAt: String(Math.floor(n.expiresAt.getTime() / 1000)) }, 'exact six string data fields');
    eq([payload.message.fid, payload.message.token, payload.message.notification, payload.message.android.notification, payload.message.android.direct_boot_ok], [n.fid, undefined, undefined, undefined, false], 'FID only, data-only, no direct boot');
    eq([payload.message.android.restricted_package_name, payload.message.android.ttl], [cfg.packageName, '600s'], 'canonical package and bounded remaining TTL');
    ok(Buffer.byteLength(String(w.calls[1].init.body)) < 4096, 'payload below FCM limit');
    if (status === 429) eq(result.retryAfterSeconds, 120, 'Retry-After respected');
  }
  fcm.resetFcmTokenCache();
  const paddedToken=world(200,undefined,{oauthToken:'fixture-oauth-token=='});
  eq((await fcm.sendFcm(cfg,n,paddedToken.fetch,now)).outcome,'accepted','valid RFC6750 padded bearer accepted');
  fcm.resetFcmTokenCache(); const unsafeToken=world(200,undefined,{oauthToken:'invalid token\r\n'});
  eq((await fcm.sendFcm(cfg,n,unsafeToken.fetch,now)).outcome,'config','unsafe header token fails closed');
  eq(unsafeToken.calls.length,1,'invalid OAuth token never reaches FCM');
  fcm.resetFcmTokenCache();
  const authFailure = world(200, undefined, { oauthStatus: 401 });
  eq((await fcm.sendFcm(cfg, n, authFailure.fetch, now)).outcome, 'config', 'OAuth failure is configuration');
  eq(authFailure.calls.length, 1, 'OAuth failure never sends or retries');
  for (const invalid of [{ ...n, projectId: 'wrong-project' }, { ...n, packageName: 'wrong.package' }, { ...n, fid: 'bad fid' }, { ...n, expiresAt: now }]) {
    const w = world(); await fcm.sendFcm(cfg, invalid, w.fetch, now); eq(w.calls.length, 0, 'invalid route/target/expired intent never calls Google');
  }
  fcm.resetFcmTokenCache(); const cacheWorld = world();
  await fcm.sendFcm(cfg, n, cacheWorld.fetch, now); await fcm.sendFcm(cfg, n, cacheWorld.fetch, now);
  eq(cacheWorld.calls.filter(c => c.url.includes('oauth2')).length, 1, 'short-lived access token cached under exact key/project');
  Object.assign(process.env, env('false'));
  eq((await call('GET')).body.providers.fcm.available, false, 'flag off capability is false');
  eq((await call('POST', body)).body.code, 'feature_disabled', 'flag off rejects new bindings');
  Object.assign(process.env, env());
  const capability = await call('GET');
  eq(capability.body, { registrationVersion: 2, providers: { fcm: { available: true, projectId, packageName: cfg.packageName, targets: ['fid'] } } }, 'exact native capability DTO');
  migration = false; eq((await call('GET')).body.providers.fcm.available, false, 'missing migration cannot advertise availability'); migration = true;
  eq((await call('GET', undefined, {}, false)).statusCode, 401, 'capability requires fresh authenticated account');
  eq((await call('GET', undefined, { 'x-bobby-push-client': '1' })).statusCode, 405, 'APNs v1 GET remains method-not-allowed');
  const first = await call('POST', body);
  eq(first.statusCode, 201, 'first FCM binding response');
  ok(/^[A-Za-z0-9_-]{43}$/.test(first.body.installationCredential), 'returned installation proof is valid');
  eq([writes[0].p_identity, writes[0].p_fcm_project, writes[0].p_package, writes[0].p_analysis_consent_version], [owner, projectId, cfg.packageName, 1], 'trusted owner and current consent server fields');
  eq(crypto.decryptFcmTarget(writes[0].p_token_ciphertext, MASTER), n.fid, 'only encrypted target reaches RPC');
  eq((await call('POST', body)).body, first.body, 'lost reply recovers exact sealed credential via replay');
  const before = writes.length;
  for (const malformed of [{ ...body, extra: owner }, { ...body, permissionState: 'provisional' }, { ...body, fcmInstallationId: 'x'.repeat(257) },
    { ...body, fcmInstallationId: 'bad fid' }, { ...body, fcmProjectId: 'other-project' }, { ...body, registrationId: randomUUID() }]) {
    eq((await call('POST', malformed)).statusCode, 400, 'malformed v2 request rejected');
  }
  eq((await call('POST', body, { 'x-bobby-push-client': '1' })).statusCode, 400, 'FCM never enters APNs v1');
  eq(writes.length, before, 'malformed requests never mutate registry');
  const rebound = await call('POST', { ...body, registrationId: first.body.registrationId, expectedBindingRevision: 1 }, { 'idempotency-key': randomUUID(), 'x-bobby-installation-proof': first.body.installationCredential });
  eq([rebound.statusCode, rebound.body.bindingRevision], [200, 2], 'native revision/proof rebind shape');
  eq(writes.at(-1).p_proof_verifier, crypto.credentialVerifier(first.body.installationCredential), 'only proof verifier reaches SQL');
  allowed = false;
  eq((await call('POST', body, { 'idempotency-key': randomUUID() })).body.code, 'consent_required', 'SQL consent refusal maps safely');
  eq((await call('POST', body)).body, first.body, 'an already committed exact operation can recover after withdrawal');
  Object.assign(process.env, env('false'));
  eq((await call('DELETE', { registrationId: first.body.registrationId, expectedBindingRevision: 1 }, { 'x-bobby-installation-proof': first.body.installationCredential })).statusCode, 204, 'cleanup allowed with provider and consent off');
  eq(revokes[0].p_identity, owner, 'cleanup uses authenticated outgoing owner');

  // Worker dispatch: fake DB/provider, actual default worker control flow and FCM decryption.
  const item = { id: randomUUID(), fence: 1, briefId: n.briefId, deviceId: n.registrationId, bindingRevision: 3, tokenCiphertext: sealed,
    environment: 'production', topic: cfg.packageName, apnsId: randomUUID(), collapseId: 'brief-fixture', language: 'en', expiresAt: n.expiresAt.toISOString(), attempts: 0,
    provider: 'fcm', fcmProjectId: projectId, packageName: cfg.packageName, targetType: 'fid' } as any;
  async function tick(opts: { configured?: boolean; apns?: boolean; configFailure?: boolean; items?: any[] } = {}) {
    const calls: any[] = [], sends: any[] = [], results: any[] = [];
    let claimed = false;
    const database = { reconcile: async () => ({}), fillOutbox: async () => 0, claimOutbox: async () => { calls.push('apns-claim'); return []; }, outboxResult: async () => {},
      claimOutboxV2: async (...args: any[]) => { calls.push(args); if (claimed) return []; claimed = true; return opts.items ?? [item]; },
      outboxResultV2: async (...args: any[]) => { results.push(args); }, purge: async () => ({ storagePaths: [] }) } as any;
    const report = await runTick({ now, deadlineAt: now.getTime() + 90_000, worker: 'fcm-fixture' }, { enabled: () => true, db: database, duePeriods: () => [], now: () => now.getTime(),
      apnsConfig: () => opts.apns ? { topic: cfg.packageName } as any : null, fcmConfig: () => opts.configured === false ? null : cfg, pushMasterKey: () => MASTER,
      sendFcm: async (_cfg, notification) => { sends.push(notification); return opts.configFailure ? { outcome: 'config', status: 403, reason: 'provider_config' } : { outcome: 'accepted', status: 200, reason: null, messageId: `projects/${projectId}/messages/worker-fixture` }; },
      closeApns() {}, logger: { log() {}, error(...v: unknown[]) { log.push(v.map(String).join(' ')); } } });
    return { report, calls, sends, results };
  }
  const fcmOnly = await tick();
  eq([fcmOnly.report.accepted, fcmOnly.sends.length, fcmOnly.calls[0].slice(3)], [1, 1, [['fcm'], projectId]], 'missing APNs does not block configured FCM');
  eq(fcmOnly.results[0].slice(6), ['fcm', `projects/${projectId}/messages/worker-fixture`], 'provider receipt persists in generic result');
  const noFcm = await tick({ configured: false, apns: true });
  eq([noFcm.sends.length, noFcm.calls], [0, ['apns-claim']], 'disabled FCM leaves APNs dispatch running');
  const mismatch = await tick({ items: [{ ...item, provider: 'apns' }] });
  eq([mismatch.sends.length, mismatch.results[0][4]], [0, 'provider_mismatch'], 'misrouted provider never reaches Google');
  const paused = await tick({ configFailure: true, items: Array.from({ length: 7 }, () => ({ ...item, id: randomUUID() })) });
  eq([paused.sends.length, paused.results.length], [5, 7], 'FCM config failure pauses its later batch and releases unattempted rows');
  eq(paused.results.at(-1)[2], 'config', 'release consumes no provider attempt');
  ok(!log.some(line => [bearer, n.fid, pem, first.body.installationCredential].some(secret => line.includes(secret))), 'logs contain no owner bearer, FID, service key or proof');
  eq(unexpected, [], 'no unexpected network or RPC request escaped the declared fixtures');
  console.log(`FCM push: ${checks} checks passed`);
} finally {
  globalThis.fetch = originalFetch; db.setBriefingRpc(null); console.error = originalConsole.error; console.warn = originalConsole.warn;
}
