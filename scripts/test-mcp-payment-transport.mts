// Third round (2026-09-05), BP-08 reopen — EXECUTION test of the paid-tool path in the
// PRODUCTION shape: `mcp_payment_challenges.challenge_id` is a uuid, the contract takes a
// bytes32. Before the fix the transports compared the raw bytes32 against the uuid key, so
// every honest payer was refused (PostgREST 22P02) after the fee was spent. Harness: a
// PostgREST emulation with a typed uuid column (scripts/harness/postgrest-emu.mts) and a
// JSON-RPC mock that mints confirmed payMCPCall transactions (scripts/harness/rpc-mock.mts),
// both written for the adversarial third round and kept as regression fixtures.
//   npm run test:mcp-payment-transport
import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createEmu } from './harness/postgrest-emu.mjs';
import { createRpcMock, uuidToBytes32 } from './harness/rpc-mock.mjs';

process.env.BOBBY_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
process.env.BOBBY_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.INTERNAL_API_SECRET = 'test-internal-secret';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://dummy.bobby';
delete process.env.PROTOCOL_CUTOVER_FREEZE; delete process.env.BOBBY_WRITE_FREEZE; delete process.env.BOBBY_CONTROL_SOURCE;

const { BOBBY_AGENT_ECONOMY } = await import('../api/_lib/protocol-constants.js');
const ch = await import('../api/_lib/mcp-challenges.js');
const ids = await import('../api/_lib/challenge-id.js');
const FEE = 1_000_000_000_000_000n;
const emu = createEmu();
emu.idType = 'uuid'; // the production column type, always
const rpc = createRpcMock(BOBBY_AGENT_ECONOMY, FEE);
let upstream: 'ok' | 'http500' | 'throw' = 'ok';
let executions = 0;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: any, init?: any) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  if (u.pathname.includes('/rest/v1/mcp_payment_challenges')) return emu.handle(u, init);
  if (u.pathname === '/api/bobby-wallet') {
    executions += 1;
    if (upstream === 'throw') throw new Error('ECONNRESET');
    if (upstream === 'http500') return json({ error: 'upstream down' }, 500);
    return json({ scan: 'clean', address: JSON.parse(init.body).params.address });
  }
  if (init?.body && typeof init.body === 'string' && init.body.includes('"jsonrpc"') && init.body.includes('"eth_')) return rpc.handle(JSON.parse(init.body));
  return json([]);
}) as typeof fetch;
const quiet = console.error; console.error = () => {};

function recorder() {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    status(c: number) { state.status = c; return res; }, json(b: unknown) { state.body = b; return res; }, send(b: unknown) { state.body = b; return res; },
    end() { return res; }, setHeader(k: string, v: string | number) { state.headers[k.toLowerCase()] = String(v); return res; }, getHeader(k: string) { return state.headers[k.toLowerCase()]; },
  } as unknown as VercelResponse;
  return { res, state };
}
const TOOL = 'bobby_security_scan';
const ARGS = { address: `0x${'11'.repeat(20)}`, chain: '1' };
type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
async function call(handler: Handler, headers: Record<string, string>, args: Record<string, unknown> = ARGS, id = 1) {
  const { res, state } = recorder();
  const req = { method: 'POST', query: {}, headers: { 'x-forwarded-for': '203.0.113.10', 'content-type': 'application/json', ...headers }, url: '/', body: { jsonrpc: '2.0', id, method: 'tools/call', params: { name: TOOL, arguments: args } } } as unknown as VercelRequest;
  await handler(req, res);
  return state.body as any;
}
let passed = 0;
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); passed += 1; console.log(`ok  ${name}`); };
const byId = (id: string) => emu.rows.find((r) => String(r.challenge_id).toLowerCase() === id.toLowerCase())!;
const errOf = (b: any) => b?.error;

const mcpHttp = (await import('../api/mcp-http.js')).default as Handler;
const mcpBobby = (await import('../api/mcp-bobby.js')).default as Handler;

await check('challenge-id: uuid ↔ bytes32 is a strict inverse; a bytes32 without the zero tail is not a Bobby challenge', () => {
  const u = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
  const b = ids.challengeIdToBytes32(u);
  assert.equal(b, `0x9f1c2d3e4a5b4c6d8e7f0a1b2c3d4e5f${'0'.repeat(32)}`);
  assert.equal(b, uuidToBytes32(u), 'the harness encodes exactly what a real client can');
  assert.equal(ids.bytes32ToChallengeId(b), u);
  assert.equal(ids.bytes32ToChallengeId(b.toUpperCase().replace('0X', '0x')), u, 'case-insensitive');
  assert.equal(ids.bytes32ToChallengeId(`0x9f1c2d3e4a5b4c6d8e7f0a1b2c3d4e5f${'0'.repeat(31)}1`), null, 'non-zero tail refused');
  assert.equal(ids.bytes32ToChallengeId('0x1234'), null);
  assert.throws(() => ids.challengeIdToBytes32('c1'), /not a uuid/);
});

for (const [label, handler] of [['mcp-http', mcpHttp], ['mcp-bobby', mcpBobby]] as const) {
  emu.reset(); emu.idType = 'uuid'; executions = 0; upstream = 'ok';

  let issued: { challengeId: string; clientSecret: string; challengeIdBytes32: string };
  await check(`${label}: the 402 issues a uuid challenge, a one-time secret and the bytes32 the contract takes`, async () => {
    const b = await call(handler, {});
    assert.equal(errOf(b).code, -32402);
    issued = errOf(b).data;
    assert.match(issued.challengeId, /^[0-9a-f-]{36}$/);
    assert.equal(issued.challengeIdBytes32, ids.challengeIdToBytes32(issued.challengeId));
    assert.match(String(errOf(b).data.instructions), /payMCPCall\(0x[0-9a-f]{64}, /);
    assert.equal(byId(issued.challengeId).status, 'pending'); assert.equal(executions, 0);
  });

  let tx: { hash: string; payer: string };
  await check(`${label}: THE REPRODUCTION, fixed — pay with the published bytes32, retry as instructed → executed once and completed (was: 22P02, fee lost)`, async () => {
    tx = rpc.mint(issued.challengeIdBytes32, TOOL, '0xpayer000000000000000000000000000000000001');
    const b = await call(handler, { 'x-402-payment': tx.hash, 'x-challenge-id': issued.challengeId, 'x-challenge-secret': issued.clientSecret });
    assert.ok(b.result, JSON.stringify(b).slice(0, 300)); assert.equal(executions, 1);
    const r = byId(issued.challengeId); assert.equal(r.status, 'completed'); assert.equal(r.tx_hash, tx.hash); assert.equal(r.payer_address, tx.payer);
    assert.equal(emu.calls.filter((c) => c.status === 400).length, 0, 'no 22P02 anywhere on the honest path');
  });

  await check(`${label}: header-less retry also works (the id comes from the paid tx); replay returns the stored result with no re-execution`, async () => {
    const before = executions;
    const b = await call(handler, { 'x-402-payment': tx.hash, 'x-challenge-secret': issued.clientSecret });
    assert.ok(b.result); assert.equal(executions, before, 'replay, not a second execution');
    const s = await call(handler, { 'x-402-payment': tx.hash, 'x-challenge-secret': 'c'.repeat(64) });
    assert.equal(errOf(s).code, -32402); assert.ok(!JSON.stringify(s).includes('scan'), 'a stranger gets no result');
  });

  await check(`${label}: a paid tx whose bytes32 is not a Bobby challenge (no zero tail) is refused before any database read`, async () => {
    const bogus = rpc.mint(`0x${'ab'.repeat(32)}`, TOOL, '0xpayer000000000000000000000000000000000002');
    const n = emu.calls.length;
    const b = await call(handler, { 'x-402-payment': bogus.hash, 'x-challenge-secret': issued.clientSecret });
    assert.equal(errOf(b).code, -32402); assert.match(errOf(b).message, /not carry a Bobby challenge id/);
    assert.equal(emu.calls.length, n, 'no PATCH/GET attempted with a non-uuid key');
  });

  await check(`${label}: a header that names a different challenge than the paid tx is refused`, async () => {
    const other = errOf(await call(handler, {})).data;
    const b = await call(handler, { 'x-402-payment': tx.hash, 'x-challenge-id': other.challengeId, 'x-challenge-secret': issued.clientSecret });
    assert.equal(errOf(b).code, -32402); assert.match(errOf(b).message, /does not match the paid transaction/);
  });

  await check(`${label}: tool throws → retryable_failure, same tx retried → executed; upstream HTTP 500 is a failure too, never a stored "result"`, async () => {
    const iss = errOf(await call(handler, {})).data;
    const t = rpc.mint(iss.challengeIdBytes32, TOOL, '0xpayer000000000000000000000000000000000003');
    const hdr = { 'x-402-payment': t.hash, 'x-challenge-secret': iss.clientSecret };
    upstream = 'throw'; const before = executions;
    const b = await call(handler, hdr); assert.ok(errOf(b)); assert.equal(executions, before + 1); assert.equal(byId(iss.challengeId).status, 'retryable_failure');
    upstream = 'http500';
    const c = await call(handler, hdr); assert.ok(errOf(c), 'an upstream 500 surfaces as an error'); assert.equal(byId(iss.challengeId).status, 'retryable_failure');
    assert.ok(!JSON.stringify(byId(iss.challengeId).result_json ?? null).includes('upstream down'), 'the error body is not stored as the paid result');
    upstream = 'ok';
    const ok = await call(handler, hdr); assert.ok(ok.result); assert.equal(byId(iss.challengeId).status, 'completed');
  });
}

console.error = quiet;
console.log(`mcp-payment-transport: ${passed}/${passed} checks passed`);
