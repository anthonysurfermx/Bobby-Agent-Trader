import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Entirely synthetic ledger: a private $1 buy must never become Bobby's
// public return, even when the server uses the service-role database key.
process.env.BOBBY_SUPABASE_URL = 'https://example.supabase.co';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.BOBBY_SESSION_SECRET = 'test-session-secret-at-least-32-characters';

const identityId = '00000000-0000-4000-8000-000000000001';
const wallet = `0x${'a'.repeat(40)}`;
const privateBuy = {
  token_symbol: 'USDC', direction: 'BUY', amount_usd: 1, entry_price: 1,
  exit_price: null, realized_pnl_pct: null, outcome: null,
  created_at: '2026-09-01T00:00:00Z', settled_at: null,
  units: 1, units_remaining: 1, block_number: 1, tx_index: 0,
  owner_address: wallet, user_id: identityId, cycle_id: null,
};
const publicBuy = { ...privateBuy, amount_usd: 10, units: 10, units_remaining: 0, owner_address: null, user_id: null, cycle_id: 'public-cycle', agent_cycles: { visibility: 'public' } };
const publicSell = {
  ...publicBuy, direction: 'SELL', amount_usd: 11, entry_price: 1,
  exit_price: 1.1, realized_pnl_pct: 10, outcome: 'win',
  units_remaining: 0, block_number: 2, tx_index: 0,
};
let publicRows: unknown[] = [];
let ledgerReads = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/api_cache')) return Response.json([]);
  if (url.pathname.endsWith('/bobby_identities')) {
    return Response.json([{ id: identityId, auth_user_id: null, wallet_address: wallet }]);
  }
  if (url.pathname.endsWith('/agent_trades')) {
    ledgerReads++;
    const scope = url.searchParams.get('select') || '';
    if (scope.includes('agent_cycles!inner')) {
      assert.equal(url.searchParams.get('chain'), 'eq.base');
      assert.equal(url.searchParams.get('status'), 'eq.confirmed');
      assert.equal(url.searchParams.get('owner_address'), 'is.null');
      assert.equal(url.searchParams.get('user_id'), 'is.null');
      assert.equal(url.searchParams.get('agent_cycles.visibility'), 'eq.public');
      return Response.json(publicRows);
    }
    assert.equal(url.searchParams.get('or'), `(user_id.eq.${identityId},owner_address.eq.${wallet})`);
    return Response.json([privateBuy]);
  }
  throw new Error(`Unexpected test request: ${url.pathname}`);
};

const { default: handler } = await import('../api/bobby-pnl.ts');
const { issueWalletSession } = await import('../api/_lib/wallet-session.ts');

async function call(scope: 'public' | 'mine', headers: Record<string, string> = {}) {
  const state: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) { state.headers[name.toLowerCase()] = value; return res; },
    status(code: number) { state.status = code; return res; },
    json(body: unknown) { state.body = body; return res; },
  } as unknown as VercelResponse;
  const req = { method: 'GET', query: { scope }, headers, socket: { remoteAddress: '127.0.0.1' } } as unknown as VercelRequest;
  await handler(req, res);
  return state;
}

try {
  const anonymous = await call('public');
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.scope, 'public-aggregate');
  assert.equal(anonymous.body.summary.totalTrades, 0);
  assert.equal(anonymous.body.summary.capitalRequired, 0);
  assert.equal(anonymous.body.summary.openPositions, 0);
  assert.deepEqual(anonymous.body.openPositions, []);
  assert.deepEqual(anonymous.body.closedPositions, []);
  assert.ok(!JSON.stringify(anonymous.body).includes(wallet));

  publicRows = [privateBuy]; // Defensive filter if a backend mock misbehaves.
  const rejectedPrivateRow = await call('public');
  assert.equal(rejectedPrivateRow.body.summary.totalTrades, 0);
  publicRows = [];

  const beforeUnauthorized = ledgerReads;
  const unauthorized = await call('mine');
  assert.equal(unauthorized.status, 401);
  assert.equal(ledgerReads, beforeUnauthorized, 'unauthenticated personal request must not read the ledger');

  const { token } = issueWalletSession(wallet);
  const personal = await call('mine', { 'x-bobby-session': token });
  assert.equal(personal.status, 200);
  assert.equal(personal.body.scope, 'identity');
  assert.equal(personal.body.summary.openPositions, 1);
  assert.equal(personal.body.summary.closedTrades, 0);
  assert.equal(personal.body.openPositions.length, 1);

  // A public protocol cycle can still produce a nonzero public aggregate,
  // while the public response never exposes per-trade rows.
  publicRows = [publicBuy, publicSell];
  const protocol = await call('public');
  assert.equal(protocol.status, 200);
  assert.equal(protocol.body.summary.closedTrades, 1);
  assert.equal(protocol.body.summary.wins, 1);
  assert.deepEqual(protocol.body.openPositions, []);
  assert.deepEqual(protocol.body.closedPositions, []);
  console.log('bobby-pnl provenance: public/private separation passed');
} finally {
  globalThis.fetch = originalFetch;
}
