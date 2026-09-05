// BP-11 + BP-12 (2026-09-04 review), executed — not grepped.
//
// BP-12: the configured RPC URL may carry a provider key. This script boots the
// public read endpoints with a SENTINEL-laden BASE_RPC_URL, drives every
// failure path (connection error, JSON-RPC error echoing the URL, undecodable
// result) and asserts that neither a response body nor a log line ever contains
// any fragment of it, and that the advertised `chain.rpc` is the static public
// endpoint.
// BP-11: on Base the readers must request the V2 selectors only, and a source
// that cannot be read must surface as `unavailable` with null numbers — never
// zeros under ok:true.
//
//   npm run test:rpc-redaction
import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface } from 'ethers';
import { format } from 'node:util';

process.env.PROTOCOL_CHAIN = 'base';
process.env.BASE_RPC_URL = 'https://rpc-user:SENTINEL-PASS@sentinel-host.example/v2/SENTINEL-PATH-KEY?apikey=SENTINEL-QUERY';
process.env.BASE_RPC_FALLBACK_URL = 'https://fallback-host.example/SENTINEL-FALLBACK-KEY';
process.env.BOBBY_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
process.env.BOBBY_SUPABASE_ANON_KEY = 'dummy-anon-key';
const SENTINELS = ['SENTINEL-', 'sentinel-host.example', 'fallback-host.example', 'rpc-user'];

// ── capture every log line ──
const logs: string[] = [];
for (const level of ['log', 'error', 'warn', 'info'] as const) {
  const orig = console[level].bind(console);
  // Third round: Vercel prints util.format(...) — a raw Error object leaks its message and stack, so capture the same way.
  console[level] = (...args: unknown[]) => { logs.push(format(...args)); if (process.env.VERBOSE) orig(...args); };
}

// ── deterministic chain ──
const trackRecord = new Interface([
  'function totalTrades() view returns (uint256)', 'function totalCommitments() view returns (uint256)', 'function pendingCount() view returns (uint256)',
  'function getWinRate() view returns (uint256)', 'function wins() view returns (uint256)', 'function losses() view returns (uint256)', 'function totalPnlBps() view returns (int256)',
  'function getVerifiedWinRate() view returns (uint256)', 'function winsVerified() view returns (uint256)', 'function lossesVerified() view returns (uint256)', 'function totalPnlBpsVerified() view returns (int256)',
]);
const oracle = new Interface(['function symbolCount() view returns (uint256)']);
const economy = new Interface(['function getEconomyStats() view returns (uint256,uint256,uint256,uint256,uint256)']);
const bounties = new Interface(['function nextBountyId() view returns (uint256)', 'function minBounty() view returns (uint96)']);
const answers: Record<string, string> = {
  [trackRecord.getFunction('totalTrades')!.selector]: trackRecord.encodeFunctionResult('totalTrades', [10n]),
  [trackRecord.getFunction('totalCommitments')!.selector]: trackRecord.encodeFunctionResult('totalCommitments', [12n]),
  [trackRecord.getFunction('pendingCount')!.selector]: trackRecord.encodeFunctionResult('pendingCount', [2n]),
  [trackRecord.getFunction('getVerifiedWinRate')!.selector]: trackRecord.encodeFunctionResult('getVerifiedWinRate', [6000n]),
  [trackRecord.getFunction('winsVerified')!.selector]: trackRecord.encodeFunctionResult('winsVerified', [6n]),
  [trackRecord.getFunction('lossesVerified')!.selector]: trackRecord.encodeFunctionResult('lossesVerified', [4n]),
  [trackRecord.getFunction('totalPnlBpsVerified')!.selector]: trackRecord.encodeFunctionResult('totalPnlBpsVerified', [250n]),
  [oracle.getFunction('symbolCount')!.selector]: oracle.encodeFunctionResult('symbolCount', [3n]),
  [economy.getFunction('getEconomyStats')!.selector]: economy.encodeFunctionResult('getEconomyStats', [5n, 7n, 1n, 10n ** 18n, 8n]),
  [bounties.getFunction('nextBountyId')!.selector]: bounties.encodeFunctionResult('nextBountyId', [4n]),
  [bounties.getFunction('minBounty')!.selector]: bounties.encodeFunctionResult('minBounty', [25_000_000_000_000n]),
};
const V1_SELECTORS = ['getWinRate', 'wins', 'losses', 'totalPnlBps'].map((f) => trackRecord.getFunction(f)!.selector);

type Mode = 'ok' | 'throw' | 'jsonerror' | 'decodefail' | 'http500' | 'jsonerror-bare' | 'jsonerror-encoded';
let mode: Mode = 'ok';
const requestedSelectors = new Set<string>();
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
function rpcAnswer(url: string, body: any): unknown {
  const one = (call: any) => {
    if (mode === 'jsonerror') return { jsonrpc: '2.0', id: call.id, error: { code: -32000, message: `upstream rejected ${url}` } };
    if (mode === 'jsonerror-bare') return { jsonrpc: '2.0', id: call.id, error: { code: -32000, message: 'invalid api key SENTINEL-QUERY (path SENTINEL-PATH-KEY)' } };
    if (mode === 'jsonerror-encoded') return { jsonrpc: '2.0', id: call.id, error: { code: -32000, message: `rejected ${encodeURIComponent(url)}` } };
    if (call.method === 'eth_blockNumber') return { jsonrpc: '2.0', id: call.id, result: '0x10' };
    if (call.method === 'eth_getBalance') return { jsonrpc: '2.0', id: call.id, result: '0xde0b6b3a7640000' };
    if (call.method === 'eth_call') {
      const selector = String(call.params?.[0]?.data || '').slice(0, 10);
      requestedSelectors.add(selector);
      if (mode === 'decodefail') return { jsonrpc: '2.0', id: call.id, result: '0x' };
      return { jsonrpc: '2.0', id: call.id, result: answers[selector] ?? '0x' };
    }
    return { jsonrpc: '2.0', id: call.id, result: null };
  };
  return Array.isArray(body) ? body.map(one) : one(body);
}
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('sentinel-host.example') || url.includes('fallback-host.example')) {
    if (mode === 'throw') throw new Error(`connect ECONNREFUSED ${url}`);
    if (mode === 'http500') return new Response(`<html>upstream failed for ${url} SENTINEL-PATH-KEY</html>`, { status: 500, headers: { 'content-type': 'text/html' } });
    return json(rpcAnswer(url, JSON.parse(String(init?.body || '{}'))));
  }
  return json([]); // supabase → empty
}) as typeof fetch;

function recorder() {
  const state: { status?: number; body?: unknown } = {};
  const res = { status(c: number) { state.status = c; return res; }, json(b: unknown) { state.body = b; return res; }, setHeader() { return res; }, getHeader() { return undefined; }, end() { return res; }, send(b: unknown) { state.body = b; return res; } };
  return { res: res as unknown as VercelResponse, state };
}
const req = (query: Record<string, string> = {}) => ({ method: 'GET', query, headers: {}, url: '/' } as unknown as VercelRequest);

const [reputation, heartbeat, txHistory, stats] = await Promise.all([
  import('../api/reputation.js'), import('../api/protocol-heartbeat.js'), import('../api/protocol-tx-history.js'), import('../api/bobby-protocol-stats.js'),
]);
const endpoints = { reputation: reputation.default, heartbeat: heartbeat.default, txHistory: txHistory.default, stats: stats.default };
const fresh = () => { heartbeat.resetHeartbeatCache(); logs.length = 0; }; // third round: no order-dependent cache replays

let passed = 0;
const check = async (name: string, fn: () => Promise<void>) => { await fn(); passed += 1; process.stdout.write(`ok  ${name}\n`); };
function assertNoSentinel(label: string, body: unknown) {
  const text = JSON.stringify(body) + '\n' + logs.join('\n');
  for (const s of SENTINELS) assert.ok(!text.includes(s), `${label}: leaked "${s}" in response or logs`);
}

// ── BP-11: explicit V2 selection + honest numbers ──
await check('reputation on Base requests V2 selectors only and reports real numbers', async () => {
  mode = 'ok'; requestedSelectors.clear(); fresh();
  const { res, state } = recorder(); await endpoints.reputation(req(), res);
  const b = state.body as any;
  assert.equal(state.status, 200); assert.equal(b.ok, true); assert.equal(b.degraded, false);
  assert.deepEqual(b.sources, { trackRecord: 'ok', oracle: 'ok', economy: 'ok', bounties: 'ok' });
  assert.equal(b.chain.trackRecordVersion, 'v2'); assert.equal(b.reputation.ledger, 'verified');
  assert.equal(b.reputation.winRate, 60); assert.equal(b.reputation.wins, 6); assert.equal(b.reputation.losses, 4); assert.equal(b.reputation.cumulativePnlPct, 2.5);
  assert.equal(b.reputation.totalTrades, 10); assert.equal(b.protocolTotals.totalBounties, 3);
  assert.equal(typeof b.trustScore.score, 'number');
  for (const sel of V1_SELECTORS) assert.ok(!requestedSelectors.has(sel), `v1 selector ${sel} must not be requested on a V2 deployment`);
  assert.equal(b.chain.rpc, 'https://mainnet.base.org', 'advertised RPC is the static public endpoint');
  assertNoSentinel('reputation ok', b);
});
await check('heartbeat on Base uses getVerifiedWinRate and reports it', async () => {
  mode = 'ok'; requestedSelectors.clear(); fresh();
  const { res, state } = recorder(); await endpoints.heartbeat(req(), res);
  const b = state.body as any;
  assert.equal(b.ok, true, JSON.stringify(b).slice(0, 300)); assert.equal(b.trackRecordVersion, 'v2');
  assert.deepEqual(b.sources, { economy: 'ok', trackRecord: 'ok', bounties: 'ok' });
  assert.equal(b.performance.winRate, 60); assert.equal(b.performance.totalTrades, 10);
  assert.ok(!requestedSelectors.has(trackRecord.getFunction('getWinRate')!.selector), 'v1 getWinRate must not be requested');
  assertNoSentinel('heartbeat ok', b);
});
await check('the reproduction: an undecodable track-record result is unavailable/null, never zero under ok:true', async () => {
  mode = 'decodefail'; fresh();
  let r = recorder(); await endpoints.heartbeat(req(), r.res);
  let b = r.state.body as any;
  assert.notEqual(b.cached, true, 'a fresh read, not a cache replay'); assert.equal(b.ok, false); assert.equal(b.degraded, true); assert.equal(b.sources.trackRecord, 'unavailable');
  assert.equal(b.performance.winRate, null); assert.equal(b.performance.totalTrades, null); assert.equal(b.health.overall, 'degraded');
  r = recorder(); await endpoints.reputation(req(), r.res);
  b = r.state.body as any;
  assert.equal(b.ok, false); assert.equal(b.degraded, true); assert.equal(b.sources.trackRecord, 'unavailable');
  assert.equal(b.reputation.winRate, null); assert.equal(b.reputation.totalTrades, null); assert.equal(b.trustScore.score, null);
  assert.ok(b.unavailable.includes('trackRecord'));
  assertNoSentinel('decodefail', b);
});

// ── BP-12: no configured RPC URL in any body or log, on every failure path ──
for (const failure of ['throw', 'jsonerror', 'http500', 'jsonerror-bare', 'jsonerror-encoded'] as Mode[]) {
  for (const [name, handler] of Object.entries(endpoints)) {
    await check(`${name}: ${failure} path leaks no RPC URL fragment (body + logs)`, async () => {
      mode = failure; fresh();
      const { res, state } = recorder(); await handler(req({ limit: '5' }), res);
      assert.ok(state.status === 200 || state.status === 503, `${name} status ${state.status}`);
      const b = state.body as any;
      if (name === 'reputation') { assert.equal(b.ok, false); assert.equal(b.reputation.winRate, null); }
      if (name === 'heartbeat') { assert.notEqual(b.cached, true, 'fresh failure, not a replay'); assert.equal(b.ok, false); assert.equal(b.performance.winRate, null); }
      if (name === 'stats') { assert.equal(b.ok, false); assert.equal(b.degraded, true); assert.equal(b.sources.trackRecord, 'unavailable'); assert.equal(b.onchainRecord.available, false); assert.equal(b.contracts.trackRecord.stats, null); }
      if (name === 'txHistory') { assert.equal(b.ok, false); assert.ok(typeof b.error === 'string' && b.error.length > 0); }
      assertNoSentinel(`${name}/${failure}`, b);
      if (failure === 'jsonerror' && name !== 'stats') assert.ok(/upstream rejected <rpc>/.test(logs.join('\n') + JSON.stringify(b)), `${name}: the upstream message is kept, the URL is masked`);
    });
  }
}
await check('heartbeat: a stale replay after an outage is ok:false / degraded / sources stale — never a live-looking ok:true', async () => {
  mode = 'ok'; fresh();
  let r = recorder(); await endpoints.heartbeat(req(), r.res); assert.equal((r.state.body as any).ok, true);
  mode = 'throw';
  r = recorder(); await endpoints.heartbeat(req(), r.res);
  const b = r.state.body as any;
  assert.equal(b.cached, true); assert.equal(b.stale, true); assert.equal(b.ok, false); assert.equal(b.degraded, true);
  assert.deepEqual(b.sources, { economy: 'stale', trackRecord: 'stale', bounties: 'stale' });
  assertNoSentinel('heartbeat stale replay', b);
});
await check('scrubber: ethers `info={ requestUrl }`, viem `URL:`, bare keys, percent-encoded copies and foreign URLs are all masked; non-JSON bodies never leak', async () => {
  const redact = await import('../api/_lib/rpc-redact.js');
  const u = process.env.BASE_RPC_URL!;
  const ethersShaped = `server response 500 Internal Server Error (request={  }, response={  }, error=null, info={ requestUrl: ${u}, responseBody: "x" }, code=SERVER_ERROR, version=6.17.0)`;
  const viemShaped = `HTTP request failed.\n\nStatus: 500\nURL: ${process.env.BASE_RPC_FALLBACK_URL}\nRequest body: {"method":"eth_call"}`;
  const bare = 'invalid api key SENTINEL-QUERY on segment SENTINEL-PATH-KEY';
  const encoded = `rejected ${encodeURIComponent(u)}`;
  const foreign = 'fetch failed for https://other-provider.example/v1/OTHER-KEY?x=1';
  for (const [label, text] of [['ethers', ethersShaped], ['viem', viemShaped], ['bare', bare], ['encoded', encoded]] as const) {
    const out = redact.scrubRpcSecrets(text);
    for (const s of SENTINELS) assert.ok(!out.includes(s), `${label}: leaked "${s}" → ${out}`);
  }
  assert.equal(redact.scrubRpcSecrets(foreign), 'fetch failed for <url>', 'any URL-shaped token is masked, configured or not');
  assert.equal(redact.rpcErrorMessage({ message: ethersShaped, info: { requestUrl: u } }), redact.scrubRpcSecrets(ethersShaped), 'error-like objects use their message only');
  await assert.rejects(redact.parseRpcJson(new Response('<html>SENTINEL-PATH-KEY</html>', { status: 502 }), u), /returned a non-JSON body \(HTTP 502\)/);
});
await check('no RPC consumer logs a raw error object (util.format would print its message and stack)', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = ['api/protocol-record.ts', 'api/base-swap.ts', 'api/verified-calls.ts', 'api/challenge-scan.ts', 'api/_lib/hardness-registry.ts', 'api/_lib/base-swap.ts', 'api/_lib/dex-execution.ts', 'api/reputation.ts', 'api/protocol-heartbeat.ts', 'api/protocol-tx-history.ts', 'api/bobby-protocol-stats.ts', 'api/_lib/protocol-payments.ts'];
  for (const f of files) {
    const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    const raw = [...src.matchAll(/console\.(?:error|warn)\([^;]*?,\s*(?:error|err|e)\)\s*;/g)].map((m) => m[0]);
    assert.deepEqual(raw, [], `${f}: raw error object logged: ${raw.join(' | ')}`);
    const rawMessage = [...src.matchAll(/error: '[^']*' \+ err\.message/g)].map((m) => m[0]);
    assert.deepEqual(rawMessage, [], `${f}: unscrubbed err.message returned to a client`);
  }
});
await check('rpc-redact helpers: labels instead of URLs; every fragment of both configured URLs is masked', async () => {
  const redact = await import('../api/_lib/rpc-redact.js');
  assert.equal(redact.rpcEndpointLabel(process.env.BASE_RPC_URL!), 'primary RPC');
  assert.equal(redact.rpcEndpointLabel(process.env.BASE_RPC_FALLBACK_URL!), 'fallback RPC');
  const scrubbed = redact.scrubRpcSecrets(`a ${process.env.BASE_RPC_URL} b sentinel-host.example c /v2/SENTINEL-PATH-KEY d ?apikey=SENTINEL-QUERY e SENTINEL-PASS f rpc-user g fallback-host.example/SENTINEL-FALLBACK-KEY`);
  for (const s of SENTINELS) assert.ok(!scrubbed.includes(s), `scrub left "${s}": ${scrubbed}`);
  assert.equal(redact.rpcErrorMessage(new Error(`connect ECONNREFUSED ${process.env.BASE_RPC_URL}`)), 'connect ECONNREFUSED <rpc>');
});

console.log(`rpc-redaction: ${passed}/${passed} checks passed`);
