import assert from 'node:assert/strict';
import { deskJson } from '../src/lib/desk-request.ts';
import { canPrepareDeskSwap, tokenAmount } from '../src/lib/desk-swap-validation.ts';
import { progressStore, type ThesisSnapshot } from '../src/lib/companions/progress.ts';
import { ThesisSchema } from '../api/_lib/thesis-rules.ts';
import { deskPrice } from '../src/lib/desk-price.ts';

assert.equal(deskPrice(0.0000034812), '$0.000003481');
assert.equal(deskPrice(0.03), '$0.03');
assert.equal(deskPrice(218.29), '$218.29');
assert.equal(deskPrice(NaN), '—');

const thesis: ThesisSnapshot = { symbol: 'ETH', isEquity: false, direction: 'long', price: 2000, entry: 2000, stop: 1900, target: 2200 };
const day = new Date('2026-09-13T12:00:00Z');
assert.equal(progressStore.awardDiscipline('read_complete', day, thesis).awarded, 10);
const queued = progressStore.get().pendingEvents.at(-1)!;
assert.deepEqual(ThesisSchema.parse(queued.thesis), thesis, 'Trader Land receives the original read');
thesis.price = 999;
assert.equal(queued.thesis?.price, 2000, 'snapshot is not mutated by the caller');
progressStore.awardDiscipline('read_complete', day, thesis);
progressStore.awardDiscipline('no_trade_respected', day, thesis);
assert.equal(progressStore.awardDiscipline('read_complete', day, thesis).awarded, 0);
assert.equal(progressStore.get().pendingEvents.length, 3, 'daily cap still applies');

assert.equal(tokenAmount('0.123456789012345678', 18), '0.123456789012345678');
assert.equal(tokenAmount('1.0000001', 6), null, 'never round up a token amount');
assert.equal(tokenAmount('1e-8', 18), null);
assert.equal(tokenAmount('-1', 18), null);
assert.equal(tokenAmount('0', 18), null);
const funded = { amount: '1', decimals: 6, balance: 1_000_000n, usdValue: 1, cap: 1, hasQuote: true };
assert.equal(canPrepareDeskSwap(funded), true);
assert.equal(canPrepareDeskSwap({ ...funded, balance: 21_100n }), false, 'observed insufficient USDC');
assert.equal(canPrepareDeskSwap({ ...funded, balance: null }), false, 'unknown balance is not permission');
assert.equal(canPrepareDeskSwap({ ...funded, usdValue: 2 }), false, 'respect the server canary cap');
assert.equal(canPrepareDeskSwap({ ...funded, hasQuote: false }), false);
assert.equal(canPrepareDeskSwap({ ...funded, cap: NaN }), false);
assert.equal(canPrepareDeskSwap({ ...funded, amount: '0.123456789012345678', decimals: 18, balance: 123456789012345677n }), false, 'one wei above balance');

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('{"value":1}', { status: 200 });
  assert.deepEqual(await deskJson('/test'), { ok: true, data: { value: 1 } });
  globalThis.fetch = async () => new Response('{"error":"unavailable"}', { status: 503 });
  assert.equal((await deskJson('/test')).ok, false);
  // Headers arrive, but the JSON body hangs. The deadline must still abort it.
  globalThis.fetch = async (_url, init) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort, { once: true });
    }),
  }) as Response;
  await assert.rejects(deskJson('/slow', {}, 10), { name: 'AbortError' });
  const obsolete = new AbortController();
  const pending = deskJson('/obsolete', { signal: obsolete.signal });
  obsolete.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(deskJson('/already-cancelled', { signal: obsolete.signal }), { name: 'AbortError' });
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Desk audit: amount precision, balance/cap guards, deadlines and cancellation passed.');
