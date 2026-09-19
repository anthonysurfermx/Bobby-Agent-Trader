// /api/account against every client that can call it, with Apple mocked:
//   · legacy builds (1.1 (26), 1.2 (31)) send a bodyless DELETE and must
//     still delete (data + auth user) with the manual Apple path;
//   · X-Bobby-Account-Client: 2 (build 34) is asked for a code, revoked with it;
//   · Apple configuration/grant rejections fall back to the manual path and
//     are logged by class only; transient Apple failures are a retryable 503;
//   · APPLE_SIGN_IN_* values are trimmed everywhere, agent_trades is de-linked.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
const { default: accountHandler } = await import('../api/account.ts');

const ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = 'xyz.bobbyprotocol.bobby';
const CODE = 'test-authorization-code-9f2c';
const REFRESH = 'test-refresh-token-77aa';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const original = globalThis.fetch;
const originalError = console.error;
let checks = 0;
function eq(got: unknown, want: unknown, what: string) { assert.deepEqual(got, want, what); checks++; }
function ok(value: unknown, what: string) { assert.ok(value, what); checks++; }

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const EC_PEM = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
function idToken(subject: string) {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = `${enc({ alg: 'RS256', kid: 'test-rsa' })}.${enc({ iss: 'https://appleid.apple.com', sub: subject, aud: CLIENT_ID, iat: now, exp: now + 300 })}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), rsa.privateKey).toString('base64url')}`;
}
function configureApple(overrides: Record<string, string> = {}) {
  Object.assign(process.env, { APPLE_SIGN_IN_TEAM_ID: 'TEAMID1234', APPLE_SIGN_IN_KEY_ID: 'KEYID12345', APPLE_SIGN_IN_CLIENT_ID: CLIENT_ID, APPLE_SIGN_IN_PRIVATE_KEY: EC_PEM, ...overrides });
}

type Apple = { token?: () => Response | Promise<Response>; revoke?: () => Response; subject?: string };
interface World { writes: Array<{ method: string; url: string; body: unknown }>; apple: string[]; tokenForm?: URLSearchParams; errors: string[] }
let ipSeq = 0;
async function call(method: 'GET' | 'DELETE', opts: { body?: unknown; header?: string; apple?: Apple; failTradesUnlink?: boolean } = {}) {
  const world: World = { writes: [], apple: [], errors: [] };
  console.error = (...args: unknown[]) => { world.errors.push(args.map(String).join(' ')); };
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input), verb = init.method ?? 'GET';
    if (url.startsWith('https://appleid.apple.com/')) {
      world.apple.push(url.slice('https://appleid.apple.com'.length));
      if (url.endsWith('/auth/token')) { world.tokenForm = new URLSearchParams(String(init.body)); return opts.apple?.token ? opts.apple.token() : json({ id_token: idToken(opts.apple?.subject ?? 'apple-user'), refresh_token: REFRESH }); }
      if (url.endsWith('/auth/keys')) return json({ keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'test-rsa', alg: 'RS256' }] });
      if (url.endsWith('/auth/revoke')) return opts.apple?.revoke ? opts.apple.revoke() : json({});
    }
    if (url.includes('api_cache')) return json([]);
    if (url.endsWith('/auth/v1/user')) return json({ id: ID, app_metadata: { provider: 'apple' } });
    if (url.includes('bobby_identities') && verb === 'POST') return json([{ id: ID, auth_user_id: ID, wallet_address: null }]);
    if (url.includes('/auth/v1/admin/users/') && verb === 'GET') return json({ identities: [{ provider: 'apple', identity_data: { sub: 'apple-user' } }], app_metadata: { provider: 'apple', providers: ['apple'] } });
    if (verb === 'PATCH' || verb === 'DELETE') {
      world.writes.push({ method: verb, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (verb === 'PATCH' && opts.failTradesUnlink) return json({ message: 'boom' }, 500);
      return verb === 'PATCH' ? new Response(null, { status: 204 }) : json({});
    }
    throw new Error(`Unexpected test request: ${verb} ${url}`);
  }) as typeof fetch;
  const headers: Record<string, string> = { origin: 'https://bobbyprotocol.xyz', authorization: 'Bearer test-user', 'x-forwarded-for': `10.9.0.${++ipSeq}` };
  if (opts.header) headers['x-bobby-account-client'] = opts.header;
  const res = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; return this; } };
  try { await accountHandler({ method, headers, body: opts.body } as never, res as never); }
  finally { globalThis.fetch = original; console.error = originalError; }
  return { res, world };
}
const deleted = (w: World) => w.writes.map(x => `${x.method} ${x.url.includes('agent_trades') ? 'agent_trades' : x.url.includes('bobby_identities') ? 'bobby_identities' : 'auth_user'}`);
const FULL_DELETE = ['PATCH agent_trades', 'DELETE bobby_identities', 'DELETE auth_user'];
const MANUAL = 'https://support.apple.com/en-us/102571';
function noSecretsLogged(w: World, what: string) {
  const logs = w.errors.join('\n');
  for (const secret of [CODE, REFRESH, 'BEGIN PRIVATE KEY', EC_PEM.split('\n')[1]]) ok(!logs.includes(secret), `${what}: logs never carry ${secret.slice(0, 12)}…`);
}

try {
  configureApple();

  // ---------- legacy clients: bodyless DELETE, no header ----------
  for (const body of [undefined, '', {}]) {
    const { res, world } = await call('DELETE', { body });
    eq([res.statusCode, res.body.appleRevocation, res.body.manualRevocationURL], [200, 'manual', MANUAL], `legacy DELETE (body ${JSON.stringify(body)}) completes on the manual path`);
    eq(deleted(world), FULL_DELETE, 'legacy DELETE de-links trades, deletes data and the auth user');
    eq(world.apple, [], 'legacy DELETE never calls Apple');
  }
  {
    const { res, world } = await call('DELETE');
    const unlink = world.writes[0];
    ok(unlink.url.includes(`agent_trades?user_id=eq.${ID}`), 'agent_trades filtered by the deleted identity');
    eq(unlink.body, { user_id: null }, 'agent_trades.user_id set to null');
    eq(res.body.ok, true, 'legacy response ok');
  }

  // ---------- build 34: GET, then a code on request ----------
  {
    const { res } = await call('GET', { header: '2' });
    eq([res.statusCode, res.body], [200, { appleAuthorizationRequired: true, manualAppleRevocation: false }], 'GET works and asks for Apple authorization');
    const missing = await call('DELETE', { header: '2' });
    eq([missing.res.statusCode, missing.res.body.appleAuthorizationRequired], [409, true], 'a code-capable client without a code is asked for one');
    eq(missing.world.writes, [], 'nothing deleted before the code arrives');
    const revoked = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE } });
    eq([revoked.res.statusCode, revoked.res.body.appleRevocation, 'manualRevocationURL' in revoked.res.body], [200, 'revoked', false], 'the code revokes Sign in with Apple');
    eq(revoked.world.apple, ['/auth/token', '/auth/keys', '/auth/revoke'], 'token → keys → revoke');
    eq(deleted(revoked.world), FULL_DELETE, 'revoked deletion removes everything');
    const build33 = await call('DELETE', { body: { appleAuthorizationCode: CODE } });
    eq(build33.res.body.appleRevocation, 'revoked', 'a code is honoured without the header (build 33)');
  }

  // ---------- Apple rejections: logged by class, deletion completes ----------
  for (const [name, token, detail] of [
    ['invalid_client', () => json({ error: 'invalid_client' }, 400), 'rejected token 400 invalid_client'],
    ['unauthorized_client', () => json({ error: 'unauthorized_client' }, 400), 'rejected token 400 unauthorized_client'],
    ['invalid_grant', () => json({ error: 'invalid_grant', error_description: `code ${CODE} expired` }, 400), 'rejected token 400 invalid_grant'],
  ] as const) {
    const { res, world } = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE }, apple: { token } });
    eq([res.statusCode, res.body.appleRevocation, res.body.manualRevocationURL], [200, 'manual', MANUAL], `${name}: deletion completes on the manual path`);
    eq(deleted(world), FULL_DELETE, `${name}: data and auth user deleted`);
    ok(world.errors.some(line => line.includes('[account-delete] apple revoke failed') && line.includes(detail)), `${name}: error class logged`);
    noSecretsLogged(world, name);
  }
  {
    const mismatch = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE }, apple: { subject: 'another-apple-id' } });
    eq([mismatch.res.statusCode, mismatch.res.body.appleRevocation], [200, 'manual'], 'a different Apple ID: manual path, deletion completes');
    ok(!mismatch.world.apple.includes('/auth/revoke'), 'the other Apple ID is never revoked');
    ok(mismatch.world.errors.some(line => line.includes('rejected identity subject_mismatch')), 'subject mismatch logged by class');
    const revoke400 = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE }, apple: { revoke: () => json({ error: 'invalid_request' }, 400) } });
    eq([revoke400.res.statusCode, revoke400.res.body.appleRevocation], [200, 'manual'], 'revoke 4xx: manual path');
    noSecretsLogged(revoke400.world, 'revoke 400');
  }

  // ---------- transient Apple failures: retryable 503, nothing deleted ----------
  for (const [name, apple] of [
    ['token 503', { token: () => json({ error: 'server_error' }, 503) }],
    ['token 429', { token: () => json({}, 429) }],
    ['network error', { token: () => { throw new TypeError('fetch failed'); } }],
    ['timeout', { token: () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } }],
    ['revoke 500', { revoke: () => json({}, 500) }],
  ] as Array<[string, Apple]>) {
    const { res, world } = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE }, apple });
    eq([res.statusCode, res.body.code], [503, 'apple_unavailable'], `${name}: retryable 503`);
    eq(world.writes, [], `${name}: nothing deleted`);
    ok(world.errors.some(line => line.includes('[account-delete] apple revoke failed transient')), `${name}: logged as transient`);
    noSecretsLogged(world, name);
  }

  // ---------- configuration that cannot sign ----------
  for (const bad of ['not-a-pem', EC_PEM.replace(/-----[A-Z ]+-----/g, '').trim()]) {
    configureApple({ APPLE_SIGN_IN_PRIVATE_KEY: bad });
    const check = await call('GET', { header: '2' });
    eq(check.res.body, { appleAuthorizationRequired: false, manualAppleRevocation: true }, 'a key that cannot sign is not offered as automatic revocation');
    ok(check.world.errors.some(line => line.includes('apple revocation key unusable')), 'unusable key logged');
    const legacy = await call('DELETE', { header: '2' });
    eq([legacy.res.statusCode, legacy.res.body.appleRevocation], [200, 'manual'], 'build 34 without code is not blocked by a broken key');
    const withCode = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE } });
    eq([withCode.res.statusCode, withCode.res.body.appleRevocation, withCode.world.apple], [200, 'manual', []], 'a code sent anyway: manual path, Apple never called');
    eq(deleted(withCode.world), FULL_DELETE, 'broken key: deletion completes');
  }

  // ---------- values with trailing newlines are trimmed everywhere ----------
  configureApple({ APPLE_SIGN_IN_TEAM_ID: 'TEAMID1234\n', APPLE_SIGN_IN_KEY_ID: ' KEYID12345\n', APPLE_SIGN_IN_CLIENT_ID: `${CLIENT_ID}\n`, APPLE_SIGN_IN_PRIVATE_KEY: `${EC_PEM}\n` });
  {
    const { res, world } = await call('DELETE', { header: '2', body: { appleAuthorizationCode: CODE } });
    eq(res.body.appleRevocation, 'revoked', 'newline-terminated env values still revoke');
    const secret = world.tokenForm!.get('client_secret')!.split('.');
    const header = JSON.parse(Buffer.from(secret[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(secret[1], 'base64url').toString());
    eq([header.kid, claims.iss, claims.sub, world.tokenForm!.get('client_id')], ['KEYID12345', 'TEAMID1234', CLIENT_ID, CLIENT_ID], 'JWT kid/iss/sub and form client_id are trimmed');
  }
  configureApple();

  // ---------- trade unlink failure stops before anything is deleted ----------
  {
    const { res, world } = await call('DELETE', { failTradesUnlink: true });
    eq(res.statusCode, 503, 'unlink failure is retryable');
    eq(deleted(world), ['PATCH agent_trades'], 'identity and auth user untouched when the unlink fails');
  }

  // ---------- Apple not configured: everyone takes the manual path ----------
  delete process.env.APPLE_SIGN_IN_PRIVATE_KEY;
  {
    const check = await call('GET');
    eq(check.res.body, { appleAuthorizationRequired: false, manualAppleRevocation: true }, 'unconfigured: GET says manual');
    const v2 = await call('DELETE', { header: '2' });
    eq([v2.res.statusCode, v2.res.body.appleRevocation, v2.world.apple], [200, 'manual', []], 'unconfigured: build 34 deletes on the manual path');
  }
  console.log(`account-delete: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
  console.error = originalError;
}
