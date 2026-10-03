// Offline end-to-end client-report admission and receipt regressions. No provider/production requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Identity } from '../api/_lib/user-identity.ts';

process.env.BOBBY_SUPABASE_URL = 'https://telemetry.invalid';
process.env.BOBBY_SUPABASE_ANON_KEY = 'offline-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
process.env.BOBBY_SESSION_SECRET = 'offline-wallet-session-secret-32-characters';
process.env.RATE_LIMIT_SALT = 'offline-client-telemetry-salt-32';
delete process.env.BOBBY_AUTH_URL;
delete process.env.BOBBY_AUTH_ANON_KEY;
delete process.env.VERCEL_ENV;

const waits: Promise<unknown>[] = [];
(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] =
  { get: () => ({ waitUntil: (p: Promise<unknown>) => waits.push(p) }) };

const { normalizeClientEvent, clientBinding, issueClientReadReceipt, verifyClientReadReceipt,
  CLIENT_RECEIPT_TTL_MS, CLIENT_RECEIPT_MAX_BYTES } = await import('../api/_lib/client-telemetry.ts');
const { default: handler } = await import('../api/client-telemetry.ts');
const { issueWalletSession } = await import('../api/_lib/wallet-session.ts');
const { saltedKey } = await import('../api/_lib/rate-limit.ts');
let checks = 0;
const eq = (a: unknown, b: unknown, why: string) => { assert.deepEqual(a, b, why); checks++; };
const ok = (a: unknown, why: string) => { assert.ok(a, why); checks++; };
const now = Date.parse('2026-10-03T00:00:00.000Z');
const foreground = { schemaVersion: 1, eventId: randomUUID(), sessionId: randomUUID(), sequence: 1,
  event: 'foreground', occurredAt: new Date(now).toISOString(), version: '1.6', build: '56' };
eq(normalizeClientEvent(foreground, now)?.event, 'foreground', 'valid lifecycle accepted');
for (const patch of [{ schemaVersion: 2 }, { eventId: 'invented' }, { sessionId: 'not-a-session' },
  { sequence: -1 }, { sequence: 1.5 }, { sequence: Infinity }, { sequence: 2 ** 32 }, { event: 'native_crash' },
  { event: 'read_done' }, { version: 'private prompt text' }, { build: {} }, { receipt: 'unexpected' },
  { occurredAt: 'invalid' }, { occurredAt: new Date(now - 300_001).toISOString() },
  { occurredAt: new Date(now + 30_001).toISOString() }, { requestId: 'invalid' }]) {
  eq(normalizeClientEvent({ ...foreground, ...patch }, now), null, 'reject invalid field ' + Object.keys(patch)[0]);
}
eq(normalizeClientEvent({ ...foreground, occurredAt: undefined }, now), null, 'capture clock required for lifecycle ordering');
eq(normalizeClientEvent({ ...foreground, event: 'heartbeat', occurredAt: undefined }, now), null, 'heartbeat cannot replace its capture time with receipt time');
eq(normalizeClientEvent({ ...foreground, occurredAt: new Date(now + 10_000).toISOString() }, now)?.occurredAt,
  new Date(now + 10_000).toISOString(), 'allowed clock skew retains logical order; SQL bounds presence expiry');
eq(normalizeClientEvent({ ...foreground, event: 'webview_terminated', occurredAt: undefined }, now)?.occurredAt,
  new Date(now).toISOString(), 'termination report has server clock fallback but not crash semantics');
eq(normalizeClientEvent({ ...foreground, event: 'read_received' }, now), null, 'received ACK needs real server receipt');
eq(normalizeClientEvent({ ...foreground, event: 'read_rendered', receipt: 'a'.repeat(1025) }, now), null, 'receipt length bounded');
eq(normalizeClientEvent([], now), null, 'array payload refused');
eq(normalizeClientEvent(null, now), null, 'null payload refused');

const WALLET = '0x1111111111111111111111111111111111111111', WALLET_ID = '00000000-0000-4000-8000-000000000003';
const ID = '00000000-0000-4000-8000-000000000001', AUTH = '00000000-0000-4000-8000-000000000002';
const identity: Identity = { id: ID, authUserId: AUTH, wallet: null, via: 'supabase' };
const req = { headers: { 'x-bobby-device': 'offline-client-installation-1', 'x-bobby-platform': 'ios' } } as never;
const binding = clientBinding(req, identity)!;
eq(binding.device, saltedKey('device:offline-client-installation-1'), 'same device hash as existing meter/team graph');
eq(binding.owner, saltedKey('telemetry-owner:' + ID), 'internal account identifier is not exposed');
for (const platform of [undefined, '', 'typo', 'android']) {
  eq(clientBinding({ headers: { 'x-bobby-device': 'offline-client-installation-1', 'x-bobby-platform': platform } } as never, identity),
    null, 'receipt requires explicit supported platform');
}
eq(clientBinding({ headers: { 'x-bobby-device': 'offline-client-installation-1', 'x-bobby-platform': ' WEB ' } } as never, identity)?.platform,
  'web', 'explicit supported platform can be normalized');
const requestId = randomUUID(), receipt = issueClientReadReceipt(binding, requestId, now)!;
ok(receipt, 'receipt issued with configured private salt');
ok(receipt.receipt.length < CLIENT_RECEIPT_MAX_BYTES, 'normal receipt fits client bounds');
const proof = verifyClientReadReceipt(receipt.receipt, binding, now)!;
eq(proof.requestId, requestId, 'server success binds requested correlation');
ok(/^[0-9a-f-]{36}$/.test(proof.id), 'receipt has a server-generated dedup UUID');
eq(verifyClientReadReceipt(receipt.receipt, binding, now + CLIENT_RECEIPT_TTL_MS + 1), null, 'expired response cannot become an ACK');
eq(verifyClientReadReceipt(receipt.receipt, { ...binding, platform: 'web' }, now), null, 'cannot move receipt to another platform');
eq(verifyClientReadReceipt(receipt.receipt, { ...binding, device: saltedKey('another-install') }, now), null, 'cannot claim another installation');
eq(verifyClientReadReceipt(receipt.receipt, { ...binding, owner: saltedKey('another-owner') }, now), null, 'account change invalidates queued ACK');
eq(verifyClientReadReceipt(receipt.receipt, { ...binding, owner: null }, now), null, 'logout cannot replay signed-in ACK as guest');
const altered = receipt.receipt.slice(0, -1) + (receipt.receipt.endsWith('A') ? 'B' : 'A');
eq(verifyClientReadReceipt(altered, binding, now), null, 'tampered MAC refused');
eq(verifyClientReadReceipt('bcr1.!broken!.AA', binding, now), null, 'malformed token refused');
eq(verifyClientReadReceipt('wrong.' + receipt.receipt, binding, now), null, 'purpose/version prefix refused');
eq(issueClientReadReceipt(binding, undefined, now), null, 'old clients get unchanged response shape');
eq(issueClientReadReceipt(null, requestId, now), null, 'no anonymous receipt without exact installation');
const oldSalt = process.env.RATE_LIMIT_SALT;
delete process.env.RATE_LIMIT_SALT;
eq(issueClientReadReceipt(binding, requestId, now), null, 'no insecure default signing secret');
eq(verifyClientReadReceipt(receipt.receipt, binding, now), null, 'no default secret accepts existing receipt');
process.env.RATE_LIMIT_SALT = oldSalt;

interface Call { url: string; body: any; method: string }
const calls: Call[] = [];
let authStatus = 200, writerStatus = 200, writerBody: unknown = { accepted: true, presenceUpdated: true }, slowBody = false;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const call = { url: decodeURIComponent(String(url)), body: init?.body ? JSON.parse(String(init.body)) : null, method: init?.method ?? 'GET' };
  calls.push(call);
  if (call.url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: AUTH, app_metadata: { provider: 'apple' } }), { status: authStatus });
  if (call.url.includes('bobby_identities?on_conflict=')) return new Response(JSON.stringify(
    call.body?.wallet_address ? [{ id: WALLET_ID, auth_user_id: null, wallet_address: WALLET }] : [{ id: ID, auth_user_id: AUTH, wallet_address: null }]));
  if (call.url.includes('rpc/bobby_record_client_telemetry')) {
    const response = new Response(JSON.stringify(writerBody), { status: writerStatus });
    if (slowBody) response.json = () => new Promise(resolve => setTimeout(() => resolve(writerBody), 5000));
    return response;
  }
  if (call.url.includes('/api_cache')) return new Response(call.method === 'POST' ? null : '[]', { status: call.method === 'POST' ? 201 : 200 });
  throw new Error('Unexpected offline request ' + call.url);
}) as typeof fetch;
let serial = 10;
const response = () => ({ statusCode: 200, ended: 0, body: null as unknown, headers: {} as Record<string, string>,
  status(code: number) { this.statusCode = code; return this; }, setHeader(k: string, v: string) { this.headers[k] = v; },
  json(body: unknown) { this.ended++; this.body = body; return this; }, end() { this.ended++; return this; } });
async function post(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  calls.length = 0;
  const res = response();
  await handler({ method, body, headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '198.51.100.' + serial++,
    'x-bobby-device': 'offline-client-installation-1', 'x-bobby-platform': 'ios', ...headers } } as never, res as never);
  await Promise.allSettled(waits.splice(0));
  return res;
}
const current = () => ({ ...foreground, eventId: randomUUID(), occurredAt: new Date().toISOString() });
eq((await post(current(), {}, 'GET')).statusCode, 405, 'read-only method not admitted');
eq((await post(current(), { origin: 'https://foreign.invalid' })).statusCode, 403, 'foreign origin refused');
eq(calls.length, 0, 'foreign caller makes no privileged storage/auth request');
eq((await post({ ...current(), prompt: 'x'.repeat(5000) })).statusCode, 413, 'bounded body before any service calls');
eq(calls.length, 0, 'oversized body no storage');
eq((await post({ ...current(), event: 'read_done' })).statusCode, 400, 'client cannot forge server outcomes');
eq((await post(current(), { 'x-bobby-device': 'short' })).statusCode, 400, 'valid installation is required');
for (const platform of ['', 'typo', 'android']) {
  eq((await post(current(), { 'x-bobby-platform': platform })).statusCode, 400, 'unknown platform refuses report');
  eq(calls.some(c => c.url.includes('rpc/bobby_record_client_telemetry')), false, 'unknown platform writes no invented web report');
}
let res = await post({ ...current(), verifiedAuth: true, p_verified_auth: true });
eq(res.statusCode, 204, 'valid anonymous lifecycle accepted');
eq(res.ended, 1, 'one response only');
let write = calls.find(c => c.url.includes('rpc/bobby_record_client_telemetry'))!.body;
eq(write.p_identity_id, null, 'anonymous identity derived by server');
eq(write.p_verified_auth, false, 'client cannot forge authenticated health recovery');
eq(write.p_install_hash, binding.device, 'exact meter hash stored');
eq(write.p_session_hash, saltedKey('telemetry-session:' + foreground.sessionId), 'raw session UUID not stored');
eq([write.p_app_version, write.p_app_build], ['1.6', '56'], 'version/build reports retained');
eq([write.p_request_id, write.p_read_receipt_id], [null, null], 'no invented successful reading from foreground');
eq(calls.some(c => c.url.includes('/auth/v1/user')), false, 'anonymous heartbeat/foreground does not call auth');

res = await post({ ...current(), identityId: 'client-forged-owner' }, { authorization: 'Bearer offline-valid' });
eq(res.statusCode, 204, 'signed client accepted');
write = calls.find(c => c.url.includes('rpc/bobby_record_client_telemetry'))!.body;
eq(write.p_identity_id, ID, 'submitted identity is ignored; verified session supplies owner');
eq(write.p_verified_auth, true, 'verified account supplies independent health recovery proof');
const walletToken = issueWalletSession(WALLET).token;
res = await post(current(), { 'x-bobby-session': walletToken });
eq(res.statusCode, 204, 'verified wallet session accepted');
write = calls.find(c => c.url.includes('rpc/bobby_record_client_telemetry'))!.body;
eq(write.p_identity_id, null, 'wallet does not become a Supabase account count');
eq(write.p_verified_auth, true, 'verified wallet may recover authenticated telemetry health');
eq(calls.some(c => c.url.includes('/auth/v1/user')), false, 'wallet proof is checked locally');
const walletBinding = clientBinding(req, { id: WALLET_ID, authUserId: null, wallet: WALLET, via: 'wallet' })!;
const walletReceipt = issueClientReadReceipt(walletBinding, randomUUID())!;
res = await post({ ...current(), event: 'read_received', receipt: walletReceipt.receipt }, { 'x-bobby-session': walletToken });
eq(res.statusCode, 204, 'wallet receipt remains bound to verified owner');
res = await post({ ...current(), event: 'read_received', receipt: walletReceipt.receipt });
eq(res.statusCode, 400, 'wallet receipt cannot be replayed after logout');
authStatus = 401;
res = await post(current(), { authorization: 'Bearer expired' });
eq(res.statusCode, 401, 'expired credential does not downgrade to anonymous');
eq(calls.some(c => c.url.includes('rpc/bobby_record_client_telemetry')), false, 'no report written after expired credential');
authStatus = 503;
res = await post(current(), { authorization: 'Bearer offline-valid' });
eq(res.statusCode, 503, 'auth outage is explicit retryable failure');
const health = calls.find(c => c.body?.cache_key === 'client-telemetry-health')!.body.payload;
eq([health.error, health.authenticated], ['auth_unavailable', true], 'source failure records its actual authenticated scope');
authStatus = 200;

const freshProof = issueClientReadReceipt(binding, requestId)!;
res = await post({ ...current(), event: 'read_received', requestId, receipt: freshProof.receipt }, { authorization: 'Bearer offline-valid' });
eq(res.statusCode, 204, 'server-issued receipt ACK accepted');
write = calls.find(c => c.url.includes('rpc/bobby_record_client_telemetry'))!.body;
eq(write.p_read_receipt_id, verifyClientReadReceipt(freshProof.receipt, binding)!.id, 'verified server receipt ID supplies database dedup');
eq(write.p_request_id, requestId, 'correlation is server receipt, not arbitrary client metadata');
eq(JSON.stringify(write).includes(freshProof.receipt), false, 'raw signature is not persisted');
res = await post({ ...current(), event: 'read_rendered', requestId: randomUUID(), receipt: freshProof.receipt }, { authorization: 'Bearer offline-valid' });
eq(res.statusCode, 400, 'mismatched correlation refused');
eq(calls.some(c => c.url.includes('rpc/bobby_record_client_telemetry')), false, 'no false rendering record persisted');
res = await post({ ...current(), event: 'read_rendered', receipt: freshProof.receipt });
eq(res.statusCode, 400, 'signed account receipt cannot be replayed by anonymous caller');

writerBody = { accepted: true, duplicate: true, presenceUpdated: false };
eq((await post(current())).statusCode, 204, 'safe duplicate/reorder is successful admission without extension');
writerStatus = 503;
res = await post(current());
eq(res.statusCode, 503, 'failed persistence is not successful telemetry');
eq(res.headers['Retry-After'], '5', 'retryable storage has bounded backoff');
eq(calls.find(c => c.body?.cache_key === 'client-telemetry-health')!.body.payload.error, 'storage_unavailable', 'lost writes visible as source failure');
writerStatus = 200; writerBody = null;
eq((await post(current())).statusCode, 503, 'malformed upstream success body is not confirmed event');
writerBody = { accepted: true };
slowBody = true;
const started = Date.now();
res = await post(current());
eq(res.statusCode, 503, 'body decoding is bounded, not just fetch');
ok(Date.now() - started < 3500, 'broken body cannot stall telemetry function');
slowBody = false;
console.log('client-telemetry-api: ' + checks + ' checks passed (offline; no production writes)');
