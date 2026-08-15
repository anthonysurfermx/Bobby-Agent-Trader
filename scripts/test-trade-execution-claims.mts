import assert from 'node:assert/strict';
import {
  acquireTradeExecutionClaim,
  clientOrderIdForDebateHash,
  markTradeExecutionSubmitted,
  tradeExecutionPayloadHash,
} from '../api/_lib/trade-execution-claims.js';

const debateHash = `0x${'ab'.repeat(32)}`;
const secondHash = `0x${'cd'.repeat(32)}`;
const clientOrderId = clientOrderIdForDebateHash(debateHash);
assert.match(clientOrderId, /^[A-Za-z0-9]{32}$/);
assert.equal(clientOrderId, clientOrderIdForDebateHash(debateHash));
assert.throws(() => clientOrderIdForDebateHash('0xdeadbeef'), /bytes32/);

const payload = {
  chainId: 8453,
  instId: 'BTC-USDT-SWAP',
  direction: 'long',
  leverage: '5',
  size: '1',
  precommit: { action: 'commit', symbol: 'BTC', threadId: 'thread-1' },
};
const payloadHash = tradeExecutionPayloadHash(payload);
assert.equal(payloadHash, tradeExecutionPayloadHash({
  precommit: { symbol: 'BTC', threadId: 'thread-1', action: 'commit' },
  size: '1',
  leverage: '5',
  direction: 'long',
  instId: 'BTC-USDT-SWAP',
  chainId: 8453,
}));

type Row = Record<string, unknown>;
const rows = new Map<string, Row>();

const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method || 'GET';
  if (method === 'POST') {
    const row = JSON.parse(String(init?.body || '{}')) as Row;
    const key = String(row.debate_hash);
    if (rows.has(key)) return Response.json([], { status: 201 });
    rows.set(key, { ...row, okx_order_id: null });
    return Response.json([rows.get(key)], { status: 201 });
  }
  const debateFilter = url.searchParams.get('debate_hash') || '';
  const key = debateFilter.replace(/^eq\./, '');
  if (method === 'PATCH') {
    const current = rows.get(key);
    if (!current || current.status !== 'claimed') return Response.json([], { status: 200 });
    const patch = JSON.parse(String(init?.body || '{}')) as Row;
    const updated = { ...current, ...patch };
    rows.set(key, updated);
    return Response.json([updated], { status: 200 });
  }
  const row = rows.get(key);
  return Response.json(row ? [row] : [], { status: 200 });
};

const common = {
  supabaseUrl: 'https://example.supabase.co',
  serviceRoleKey: 'test-service-role',
  fetchImpl: fakeFetch,
  debateHash,
  chainId: 8453,
  symbol: 'BTC',
  direction: 'long' as const,
  payloadHash,
  clientOrderId,
};

// Two concurrent serverless invocations race on the same commitment. The
// primary key grants exactly one claim; the loser observes state and must not
// submit an order.
const concurrent = await Promise.all([
  acquireTradeExecutionClaim(common),
  acquireTradeExecutionClaim(common),
]);
assert.equal(concurrent.filter((result) => result.acquired).length, 1);
assert.equal(concurrent.filter((result) => !result.acquired).length, 1);
assert.equal(new Set(concurrent.map((result) => result.claim.debateHash)).size, 1);

await markTradeExecutionSubmitted({
  supabaseUrl: common.supabaseUrl,
  serviceRoleKey: common.serviceRoleKey,
  fetchImpl: fakeFetch,
  debateHash,
  okxOrderId: 'okx-123',
});
const retry = await acquireTradeExecutionClaim(common);
assert.equal(retry.acquired, false);
assert.equal(retry.claim.status, 'submitted');
assert.equal(retry.claim.okxOrderId, 'okx-123');

await assert.rejects(
  acquireTradeExecutionClaim({ ...common, payloadHash: tradeExecutionPayloadHash({ ...payload, size: '2' }) }),
  /different order intent/,
);

const second = await acquireTradeExecutionClaim({
  ...common,
  debateHash: secondHash,
  clientOrderId: clientOrderIdForDebateHash(secondHash),
});
assert.equal(second.acquired, true);

console.log('trade execution claims: atomic consumption and idempotent retry checks passed');
