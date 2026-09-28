// Audit 2026-09-28 P1: recordBuiltSwap against a PostgREST double that keeps
// bobby_swap_receipts' real keys — unique (wallet, calldata_hash), the partial
// unique (wallet, intent_jti) and the cycle foreign key. Identical calldata is
// re-delivered only for the SAME build (same intent, same cycle, still
// unsigned); any other owner of those bytes is refused.
//
//   npx tsx scripts/test-swap-receipt-record.mts
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.receipts-test.invalid';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'receipts-test-service-key-not-real-000000';

const { recordBuiltSwap } = await import('../api/_lib/swap-receipts.js');

type Row = Record<string, unknown>;
const table: Row[] = [];
const cycles = new Set(['cycle-a', 'cycle-b']);
let failNextInsert = 0;

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const store = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  assert.ok(url.pathname.endsWith('/bobby_swap_receipts'), `unexpected table ${url.pathname}`);
  if (init?.method === 'POST') {
    if (failNextInsert > 0) { failNextInsert -= 1; return json({ message: 'upstream timeout' }, 503); }
    const row = JSON.parse(String(init.body)) as Row;
    if (row.cycle_id && !cycles.has(String(row.cycle_id))) return json({ code: '23503', message: 'insert or update on table "bobby_swap_receipts" violates foreign key constraint "bobby_swap_receipts_cycle_id_fkey"' }, 409);
    const dup = table.some((r) => r.wallet_address === row.wallet_address
      && (r.calldata_hash === row.calldata_hash || (row.intent_jti != null && r.intent_jti === row.intent_jti)));
    if (dup) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
    table.push({ ...row });
    return new Response(null, { status: 201 });
  }
  const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '');
  return json(table.filter((r) => r.wallet_address === eq('wallet_address') && r.calldata_hash === eq('calldata_hash')));
}) as typeof fetch;

const wallet = '0x1234567890ABCDEF1234567890abcdef12345678';
const hash = (n: number) => (`0x${n.toString(16).padStart(64, '0')}`) as `0x${string}`;
const build = (over: Partial<Parameters<typeof recordBuiltSwap>[0]> = {}): Parameters<typeof recordBuiltSwap>[0] => ({
  wallet,
  tokenIn: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  tokenOut: { symbol: 'NVDAc', address: '0x0000000000000000000000000000000000000001' },
  amountInRaw: '1000000', quotedOutRaw: '440000', minOutRaw: '437800',
  route: 'USDC → NVDAc (0.3%)', router: '0x2626664c2603336E57B271c5C0b26F421741e481',
  calldataHash: hash(1), deadline: 1_790_000_000,
  ...over,
});
const jti = (c: string) => c.repeat(32);

// 1. A fresh build is recorded.
assert.deepEqual(await recordBuiltSwap(build({ cycleId: 'cycle-a', intentJti: jti('a') }), store), { recorded: true });

// 2. The same build again (a re-quote in the same second): idempotent.
assert.deepEqual(await recordBuiltSwap(build({ cycleId: 'cycle-a', intentJti: jti('a') }), store), { recorded: true, reason: 'already recorded' });

// 3. The finding: identical bytes under ANOTHER intent (and cycle) used to come back recorded:true.
assert.deepEqual(await recordBuiltSwap(build({ cycleId: 'cycle-b', intentJti: jti('b') }), store), { recorded: false, reason: 'calldata already issued' });
// … and a manual build (no intent) cannot take over an intent's bytes either.
assert.deepEqual(await recordBuiltSwap(build(), store), { recorded: false, reason: 'calldata already issued' });
assert.equal(table.length, 1, 'still exactly one row for those bytes, owned by the first intent');
assert.equal(table[0].intent_jti, jti('a'));

// 4. Bytes already signed are never handed out again: the second execution could not be confirmed.
table[0].status = 'confirmed';
assert.deepEqual(await recordBuiltSwap(build({ cycleId: 'cycle-a', intentJti: jti('a') }), store), { recorded: false, reason: 'intent already used' });
assert.deepEqual(await recordBuiltSwap(build({ calldataHash: hash(2) }), store), { recorded: true }, 'a manual build with fresh bytes');
table[1].status = 'confirmed';
assert.deepEqual(await recordBuiltSwap(build({ calldataHash: hash(2) }), store), { recorded: false, reason: 'calldata already issued' });

// 5. Unchanged: one intent, one calldata — different bytes for a used intent are refused.
assert.deepEqual(await recordBuiltSwap(build({ cycleId: 'cycle-a', intentJti: jti('a'), calldataHash: hash(3) }), store), { recorded: false, reason: 'intent already used' });

// 6. A missing cycle is recorded unlinked — it used to be misread as "intent already used" whenever an intent was present.
assert.deepEqual(await recordBuiltSwap(build({ cycleId: 'cycle-gone', intentJti: jti('c'), calldataHash: hash(4) }), store), { recorded: true, reason: 'cycle not found; recorded unlinked' });
const unlinked = table.find((r) => r.calldata_hash === hash(4))!;
assert.deepEqual([unlinked.cycle_id, unlinked.intent_jti], [null, jti('c')]);

// 7. Store failures fail closed.
failNextInsert = 1;
assert.deepEqual(await recordBuiltSwap(build({ calldataHash: hash(5) }), store), { recorded: false, reason: 'db 503' });

console.log('swap receipt record: same-build idempotency, cross-intent calldata refused, signed bytes never re-issued, unlinked cycle, store failure passed');
