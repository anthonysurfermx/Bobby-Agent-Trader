/* eslint-disable no-console */
// ============================================================
// scripts/test-risk-gate.mts
// Unit tests for api/_lib/risk-gate.ts — the deterministic sizing and
// position-limit gate that decides real exposure. Pins current behavior
// so refactors can't silently change how Bobby sizes or blocks trades.
// Run: `npx tsx scripts/test-risk-gate.mts`
// Zero runtime deps beyond tsx — same pattern as test-playbooks.mts.
// ============================================================

import {
  calculateDynamicConviction,
  kellySize,
  applyRiskGate,
  type TradeDecision,
} from '../api/_lib/risk-gate.ts';

const failures: string[] = [];
let passed = 0;

const assert = (cond: unknown, msg: string) => {
  if (cond) {
    passed++;
  } else {
    failures.push(msg);
  }
};

const approx = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

function group(label: string, fn: () => void) {
  console.log(`\n── ${label} ──`);
  const before = failures.length;
  fn();
  console.log(failures.length === before ? '   ok' : `   ${failures.length - before} FAILED`);
}

const MIN = 60_000; // ms per minute

function decision(symbol: string, confidence: number): TradeDecision {
  return {
    action: 'BUY',
    chain: '1',
    tokenAddress: `0x${symbol.toLowerCase()}`,
    tokenSymbol: symbol,
    amountUsd: 0,
    reason: 'test',
    confidence,
    signalSources: ['test'],
  };
}

// ── calculateDynamicConviction ─────────────────────────────

group('conviction: weights are 0.4 OKX / 0.6 Polymarket', () => {
  assert(approx(calculateDynamicConviction(1, 0, 0), 0.4), 'okx alone → 0.4');
  assert(approx(calculateDynamicConviction(0, 1, 0), 0.6), 'poly alone → 0.6');
  assert(approx(calculateDynamicConviction(1, 1, 0), 1), 'both max → 1');
  assert(approx(calculateDynamicConviction(0.5, 0.5, 0), 0.5), 'both 0.5 → 0.5');
});

group('conviction: latency penalty curve', () => {
  assert(approx(calculateDynamicConviction(1, 1, 5 * MIN), 1), '≤5min is free');
  // 15min: 0.05 * e^(0.08*15) ≈ 0.166
  assert(approx(calculateDynamicConviction(1, 1, 15 * MIN), 1 - 0.166, 0.01), '15min ≈ -0.17');
  // 30min: 0.05 * e^2.4 ≈ 0.551
  assert(approx(calculateDynamicConviction(1, 1, 30 * MIN), 1 - 0.551, 0.01), '30min ≈ -0.55');
  // 60min: raw penalty ≈ 6.08, capped at 0.7
  assert(approx(calculateDynamicConviction(1, 1, 60 * MIN), 0.3), '60min penalty caps at 0.7');
});

group('conviction: clamps to [0, 1]', () => {
  assert(calculateDynamicConviction(0, 0, 60 * MIN) === 0, 'never below 0');
  assert(calculateDynamicConviction(1, 1, 0) <= 1, 'never above 1');
});

// ── kellySize ──────────────────────────────────────────────

group('kelly: confidence clamp [0.5, 0.95]', () => {
  // p clamps low: conf 0 behaves as p=0.5 → kelly always positive.
  assert(kellySize(0, 1000) === kellySize(0.5, 1000), 'conf 0 clamps to 0.5');
  assert(kellySize(0.99, 1000) === kellySize(0.95, 1000), 'conf 0.99 clamps to 0.95');
  assert(kellySize(0, 1000) > 0, 'clamp means size is never 0');
});

group('kelly: caps and floor', () => {
  // b=2, p=0.9 → kelly 0.85, half 0.425 → 1000*0.425=425, exposure cap 330 → hard cap 75
  assert(kellySize(0.9, 1000, 0.33) === 75, 'hard cap at $75');
  // p=0.7 → half-kelly 0.275 → 100*0.275 = 27.5 (under both caps)
  assert(approx(kellySize(0.7, 100, 0.33), 27.5), 'half-kelly math: 0.7 conf on $100 → $27.50');
  // Floor: tiny bankroll still bets $5 — floor overrides the exposure cap.
  // Known quirk: for bankrolls < ~$40 the $5 floor exceeds maxExposurePct.
  assert(kellySize(0.5, 10, 0.33) === 5, '$5 floor even when bankroll is $10');
});

// ── applyRiskGate ──────────────────────────────────────────

group('gate: conviction threshold 0.7 (0.8 safe mode)', () => {
  const low = applyRiskGate([decision('AAA', 0.69)], 3000);
  assert(low.approved.length === 0 && low.blocked === 1, 'blocks below 0.7');

  const ok = applyRiskGate([decision('BBB', 0.75)], 3000);
  assert(ok.approved.length === 1, 'approves at 0.75');

  const safe = applyRiskGate([decision('CCC', 0.75)], 3000, true);
  assert(safe.approved.length === 0, 'safe mode blocks 0.75 (needs 0.8)');
  assert(safe.sizingMethod === 'half-kelly-safe-mode', 'safe mode labels sizing');
});

group('gate: backend conviction overrides LLM confidence', () => {
  const d = decision('DDD', 0.2); // LLM says 0.2
  const backend = new Map([['DDD', 0.9]]); // backend says 0.9
  const result = applyRiskGate([d], 3000, false, backend);
  assert(result.approved.length === 1, 'gate runs on backend conviction, not LLM');
  assert(result.approved[0].confidence === 0.9, 'confidence overwritten with deterministic score');
  assert(
    (result.approved[0] as unknown as { llmConfidence: number }).llmConfidence === 0.2,
    'original LLM confidence preserved for audit',
  );
});

group('gate: duplicate symbols and max 3 positions', () => {
  const dupes = applyRiskGate([decision('EEE', 0.75), decision('EEE', 0.8)], 3000);
  assert(dupes.approved.length === 1, 'second decision on same symbol is dropped');

  const four = ['F1', 'F2', 'F3', 'F4'].map((s) => decision(s, 0.75));
  const capped = applyRiskGate(four, 3000);
  assert(capped.approved.length === 3, 'max 3 concurrent positions');
  assert(capped.blocked === 1, 'blocked count reflects the overflow');
});

group('gate: exposure caps include open positions', () => {
  // bankroll 3000 → maxDailyLoss 300. Kelly at 0.75 → $75/trade.
  const fresh = applyRiskGate([decision('GGG', 0.75)], 3000, false, undefined, 0);
  assert(fresh.approved.length === 1, 'approves with no open exposure');

  const loaded = applyRiskGate([decision('HHH', 0.75)], 3000, false, undefined, 850);
  assert(loaded.approved.length === 0, 'blocks when open exposure + size exceeds the exposure cap (30% of bankroll)');
  const room = applyRiskGate([decision('HHH', 0.75)], 3000, false, undefined, 250);
  assert(room.approved.length === 1, 'approves while exposure + size stays under the cap');
});

group('gate: safe mode halves position size', () => {
  const normal = applyRiskGate([decision('III', 0.85)], 3000);
  const safe = applyRiskGate([decision('JJJ', 0.85)], 3000, true);
  assert(normal.approved.length === 1 && safe.approved.length === 1, 'both approve at 0.85');
  assert(
    approx(safe.approved[0].amountUsd, normal.approved[0].amountUsd / 2),
    'safe mode bets half',
  );
});

group('gate: default $500 bankroll approves a normal-mode trade (the daily-loss cap is about realized losses)', () => {
  const result = applyRiskGate([decision('KKK', 0.95)], 500);
  assert(result.approved.length === 1, '0.95 conviction is approved at the default bankroll');
  assert(result.approved[0].amountUsd <= 500 * 0.30, 'size bounded by the exposure cap');
  const safe = applyRiskGate([decision('LLL', 0.95)], 500, true);
  assert(safe.approved.length === 1, 'safe mode still passes at default bankroll');
});

group('gate: realized daily loss budget spent → nothing approved', () => {
  const spent = applyRiskGate([decision('MMM', 0.95)], 500, false, undefined, 0, 50);
  assert(spent.approved.length === 0 && spent.blocked === 1, '$50 realized loss on $500 closes the day');
  const almost = applyRiskGate([decision('NNN', 0.95)], 500, false, undefined, 0, 49);
  assert(almost.approved.length === 1, '$49 realized loss still trades');
});

group('gate: a deterministic map blocks tickers the pipeline never scored', () => {
  const conv = new Map<string, number>([['OOO', 0.9]]);
  const result = applyRiskGate([decision('OOO', 0.2), decision('PPP', 0.99)], 3000, false, conv);
  assert(result.approved.length === 1 && result.approved[0].tokenSymbol === 'OOO', 'scored ticker approved on the deterministic score, unscored ticker blocked whatever the LLM said');
  assert(approx(result.approved[0].confidence, 0.9), 'confidence carried is the deterministic one');
});

// ── Report ─────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`✓ All ${passed} risk-gate assertions passed.`);
  process.exit(0);
} else {
  console.log(`✕ ${failures.length} assertion(s) failed (${passed} passed):\n`);
  for (const f of failures) console.log(`  ✕ ${f}`);
  process.exit(1);
}
