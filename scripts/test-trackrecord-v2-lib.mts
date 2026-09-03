// Unit tests for the pure parts of api/_lib/trackrecord-v2.ts (no network).
// Run: npx tsx scripts/test-trackrecord-v2-lib.mts
import {
  PriceMode,
  VERIFIED_FEEDS,
  canonicalizeSymbol,
  resolvePriceMode,
  buildHermesBenchmarkUrl,
  toE8,
} from '../api/_lib/trackrecord-v2.ts';
import { trackRecordWinRateFunction } from '../api/_lib/trackrecord-stats-adapter.ts';
import { readFileSync } from 'node:fs';
import { BASE } from '../api/_lib/chains.ts';

let passed = 0;
let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; }
  else { failed++; console.error(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; console.error(`FAIL ${name}`); }
}

// --- enum matches the contract (ATTESTED=0 weak, VERIFIED=1) ---
eq('PriceMode.ATTESTED == 0', PriceMode.ATTESTED, 0);
eq('PriceMode.VERIFIED == 1', PriceMode.VERIFIED, 1);

// --- canonicalization mirrors the contract charset gate ---
eq('lowercase → upper', canonicalizeSymbol('btc'), 'BTC');
eq('strip -USDT', canonicalizeSymbol('BTC-USDT'), 'BTC');
eq('strip /USD', canonicalizeSymbol('ETH/USD'), 'ETH');
eq('strip -USDT-SWAP', canonicalizeSymbol('SOL-USDT-SWAP'), 'SOL');
eq('trim + junk removed', canonicalizeSymbol('  nvda! '), 'NVDA');
eq('empty → empty', canonicalizeSymbol(''), '');
eq('does NOT strip non-quote dash', canonicalizeSymbol('FOO-BAR'), 'FOOBAR');

// --- mode resolution must agree with the on-chain feedOf universe ---
for (const sym of ['BTC', 'ETH', 'SOL']) {
  const r = resolvePriceMode(sym);
  eq(`${sym} VERIFIED`, r.mode, PriceMode.VERIFIED);
  eq(`${sym} feedId`, r.feedId, VERIFIED_FEEDS[sym]);
}
for (const sym of ['OKB', 'NVDA', 'XAUT', 'PEPE']) {
  const r = resolvePriceMode(sym);
  eq(`${sym} ATTESTED`, r.mode, PriceMode.ATTESTED);
  ok(`${sym} no feedId`, r.feedId === undefined);
}
// a pair form still resolves to the verified base
eq('BTC-USDT → VERIFIED', resolvePriceMode('btc-usdt').mode, PriceMode.VERIFIED);

// --- Hermes URLs — benchmark-at-anchor is the ONLY fetch shape (A2-1) ---
ok('benchmark url pins publishTime', buildHermesBenchmarkUrl(VERIFIED_FEEDS.ETH, 1786591762)
  .includes('/v2/updates/price/1786591762?'));
ok('benchmark url shape', /\/v2\/updates\/price\/\d+\?ids\[\]=0xe62df6c8.*&encoding=hex$/.test(
  buildHermesBenchmarkUrl(VERIFIED_FEEDS.BTC, 1786591762)));
ok('benchmark floors fractional seconds', buildHermesBenchmarkUrl(VERIFIED_FEEDS.SOL, 1786591762.9)
  .includes('/1786591762?'));

// --- toE8 matches the contract normalization (real PoC values) ---
eq('toE8 expo -8 identity', toE8(6350230500000n, -8).toString(), '6350230500000');
eq('toE8 expo -5 (×1000)', toE8(1234567n, -5).toString(), '1234567000');
eq('toE8 expo -12 (÷10000)', toE8(12345678901234n, -12).toString(), '1234567890');
eq('toE8 expo 0 (×1e8)', toE8(63502n, 0).toString(), '6350200000000');
let threw = false;
try { toE8(0n, -8); } catch { threw = true; }
ok('toE8 rejects non-positive', threw);
threw = false;
try { toE8(1n, 1); } catch { threw = true; }
ok('toE8 rejects out-of-range expo', threw);

// ============================================================
// recorder pure parts (api/_lib/trackrecord-v2-recorder.ts)
// ============================================================
const { priceToE8, deviationBps } = await import('../api/_lib/trackrecord-v2-recorder.ts');

// --- priceToE8: float quote → contract 1e8 fixed point ---
eq('priceToE8 integer', priceToE8(63502).toString(), '6350200000000');
eq('priceToE8 decimals', priceToE8(0.00001234).toString(), '1234');
eq('priceToE8 rounds', priceToE8(1.000000005).toString(), '100000001');
eq('priceToE8 zero', priceToE8(0).toString(), '0');

// --- deviationBps: pre-flight tolerance banding ---
eq('deviation identical = 0', deviationBps(100_00000000n, 100_00000000n), 0);
eq('deviation 1% = 100 bps', deviationBps(101_00000000n, 100_00000000n), 100);
eq('deviation symmetric', deviationBps(99_00000000n, 100_00000000n), 100);
eq('deviation 0.5% = 50 bps', deviationBps(100_50000000n, 100_00000000n), 50);
// floors toward zero — 99.999999 bps must NOT round up past the band
eq('deviation floors', deviationBps(100_99999999n, 100_00000000n), 99);
ok('deviation vs zero oracle = maxed', deviationBps(100n, 0n) === Number.MAX_SAFE_INTEGER);

// --- public stats adapter: V1 only on canonical X Layer, V2 everywhere else ---
eq('X Layer stats use V1 combined win rate', trackRecordWinRateFunction(196), 'getWinRate');
eq('Base stats use V2 verified win rate', trackRecordWinRateFunction(8453), 'getVerifiedWinRate');
eq('Base Sepolia stats use V2 verified win rate', trackRecordWinRateFunction(84532), 'getVerifiedWinRate');
const protocolStatsSource = readFileSync('api/bobby-protocol-stats.ts', 'utf8');
const paymentReaderSource = readFileSync('api/_lib/protocol-payments.ts', 'utf8');
ok('public stats report the selected chain id', protocolStatsSource.includes('id: DEFAULT_CHAIN.id'));
ok('public stats do not use a legacy chain-id alias', !protocolStatsSource.includes('id: PROTOCOL_CHAIN_ID'));
ok('Base has an independent read fallback RPC', Boolean(BASE.rpcFallbackUrl));
ok('shared protocol reads use the fallback RPC', paymentReaderSource.includes('PROTOCOL_RPC_FALLBACK_URL'));

console.log(`\ntrackrecord-v2 lib: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
