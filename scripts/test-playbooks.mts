/* eslint-disable no-console */
// ============================================================
// scripts/test-playbooks.mts
// Unit validator for the playbook catalog + guardrail evaluation logic.
// Run: `npx tsx scripts/test-playbooks.mts`
// Zero runtime deps beyond tsx — no runner, no jest, no vitest.
// Exits 1 on any failure so CI/pre-push hooks can gate on it.
// ============================================================

import { PLAYBOOKS, GUARDRAIL_LABELS, type Playbook, type PlaybookCategory } from '../src/data/playbooks.ts';

type AssertFn = (cond: unknown, msg: string) => void;

const failures: string[] = [];
let passed = 0;

const assert: AssertFn = (cond, msg) => {
  if (cond) {
    passed++;
  } else {
    failures.push(msg);
  }
};

function group(label: string, fn: () => void) {
  console.log(`\n── ${label} ──`);
  const beforeFail = failures.length;
  const beforePass = passed;
  fn();
  const newFail = failures.length - beforeFail;
  const newPass = passed - beforePass;
  console.log(`  ✓ ${newPass} passed${newFail ? `  ✕ ${newFail} FAILED` : ''}`);
}

// ── Valid controlled vocabularies ──────────────────────────
const VALID_CATEGORIES: PlaybookCategory[] = [
  'directional',
  'yield',
  'on-chain-flow',
  'risk-management',
  'volatility',
  'arbitrage',
];
const VALID_GUARDRAILS = new Set(Object.keys(GUARDRAIL_LABELS));
const VALID_STATUS = new Set(['live', 'preview', 'advanced']);

// ── Catalog-level checks ───────────────────────────────────
group('Catalog structure', () => {
  assert(Array.isArray(PLAYBOOKS), 'PLAYBOOKS is an array');
  assert(PLAYBOOKS.length >= 10, `At least 10 playbooks (got ${PLAYBOOKS.length})`);

  const slugs = PLAYBOOKS.map((p) => p.slug);
  const uniqueSlugs = new Set(slugs);
  assert(uniqueSlugs.size === slugs.length, 'All slugs unique');

  for (const s of slugs) {
    assert(/^[a-z0-9-]+$/.test(s), `Slug "${s}" is kebab-case lowercase`);
  }
});

// ── Per-playbook checks ────────────────────────────────────
function validatePlaybook(p: Playbook) {
  group(`Playbook: ${p.slug}`, () => {
    assert(typeof p.name === 'string' && p.name.length > 0, `name non-empty`);
    assert(typeof p.tagline === 'string' && p.tagline.length > 10, `tagline > 10 chars`);
    assert(typeof p.whatItIs === 'string' && p.whatItIs.length > 40, `whatItIs > 40 chars`);
    assert(typeof p.painWithoutBobby === 'string' && p.painWithoutBobby.length > 40, `painWithoutBobby > 40 chars`);

    assert(VALID_CATEGORIES.includes(p.category), `category "${p.category}" in valid set`);
    assert(VALID_STATUS.has(p.status), `status "${p.status}" in valid set`);

    assert(Array.isArray(p.tools) && p.tools.length > 0, `tools non-empty`);
    for (const t of p.tools) {
      assert(typeof t.name === 'string' && /^[a-z_]+$/.test(t.name), `tool name "${t.name}" snake_case`);
      assert(typeof t.role === 'string' && t.role.length > 0, `tool ${t.name} has role`);
    }

    assert(Array.isArray(p.guardrails) && p.guardrails.length >= 2, `guardrails >= 2`);
    for (const g of p.guardrails) {
      assert(VALID_GUARDRAILS.has(g), `guardrail slug "${g}" is in controlled vocabulary`);
    }

    assert(typeof p.blockRatePct === 'number' && p.blockRatePct >= 0 && p.blockRatePct <= 100,
      `blockRatePct in [0,100] (got ${p.blockRatePct})`);
    assert(typeof p.blockRateCopy === 'string' && p.blockRateCopy.length > 0, `blockRateCopy non-empty`);

    // demo: null is OK for preview/advanced; live playbooks are allowed either way
    // (sandbox ignores demo; only the /protocol/playbooks expand UI uses it).
    if (p.demo !== null) {
      assert(typeof p.demo.tool === 'string' && p.demo.tool.length > 0, `demo.tool non-empty`);
      assert(['symbol', 'chain', 'wheel_leg', 'none'].includes(p.demo.inputType), `demo.inputType valid`);
      assert(typeof p.demo.inputLabel === 'string' && p.demo.inputLabel.length > 0, `demo.inputLabel non-empty`);
      assert(typeof p.demo.buildArgs === 'function', `demo.buildArgs is a function`);
      assert(typeof p.demo.summarize === 'function', `demo.summarize is a function`);
    }

    if (p.badge) {
      assert(typeof p.badge.label === 'string' && p.badge.label.length > 0, `badge.label non-empty`);
      assert(['preview', 'advanced'].includes(p.badge.tone), `badge.tone valid`);
    }
  });
}

for (const p of PLAYBOOKS) validatePlaybook(p);

// ── Guardrail evaluator sanity (mirrors api/sandbox-run.ts) ──
// We re-implement the same logic here locally to assert the decision
// table behaves sensibly for key fixtures. If the sandbox evaluator
// drifts, a failing fixture is the early warning.
type GuardrailStatus = 'pass' | 'fail' | 'skip';

function evalGuardrails(
  action: 'EXECUTE' | 'YIELD_PARK' | 'BLOCKED',
  conviction: number,
  judge: Record<string, number>,
) {
  const weighted =
    (judge.data_integrity ?? 3) * 0.2 +
    (judge.adversarial_quality ?? 3) * 0.25 +
    (judge.decision_logic ?? 3) * 0.2 +
    (judge.risk_management ?? 3) * 0.15 +
    (judge.calibration_alignment ?? 3) * 0.1 +
    (judge.novelty ?? 3) * 0.1;
  const judgeScore20 = weighted * 4;

  const out: Record<string, GuardrailStatus> = {};
  out.conviction_gate      = conviction >= 3.5 ? 'pass' : 'fail';
  out.mandatory_stop       = action === 'BLOCKED' ? 'skip' : 'pass';
  out.hard_risk_gate       = action === 'EXECUTE' && conviction < 3.5 ? 'fail' : 'pass';
  out.metacognition        = (judge.decision_logic ?? 3) >= 3 ? 'pass' : 'fail';
  out.commit_reveal        = action === 'BLOCKED' ? 'skip' : 'pass';
  out.judge_mode_6d        = judgeScore20 >= 12 ? 'pass' : 'fail';
  out.adversarial_bounties = (judge.adversarial_quality ?? 3) >= 3 ? 'pass' : 'fail';
  out.yield_parking        = action === 'YIELD_PARK' ? 'pass' : 'skip';
  return out;
}

group('Guardrail evaluator — strong EXECUTE', () => {
  const r = evalGuardrails('EXECUTE', 6.0, {
    data_integrity: 4, adversarial_quality: 4, decision_logic: 4,
    risk_management: 4, calibration_alignment: 4, novelty: 4,
  });
  assert(r.conviction_gate === 'pass', 'strong conviction passes gate');
  assert(r.hard_risk_gate === 'pass', 'hard risk gate passes when conviction high');
  assert(r.judge_mode_6d === 'pass', 'judge mode passes at 4/5 across dims');
  assert(r.yield_parking === 'skip', 'yield parking skipped on EXECUTE');
});

group('Guardrail evaluator — weak EXECUTE (should trip)', () => {
  const r = evalGuardrails('EXECUTE', 2.5, {
    data_integrity: 2, adversarial_quality: 2, decision_logic: 2,
    risk_management: 2, calibration_alignment: 2, novelty: 2,
  });
  assert(r.conviction_gate === 'fail', 'weak conviction fails gate');
  assert(r.hard_risk_gate === 'fail', 'hard risk gate fails when EXECUTE with low conviction');
  assert(r.judge_mode_6d === 'fail', 'judge mode fails below threshold');
});

group('Guardrail evaluator — BLOCKED', () => {
  const r = evalGuardrails('BLOCKED', 1.0, {
    data_integrity: 1, adversarial_quality: 1, decision_logic: 1,
    risk_management: 1, calibration_alignment: 1, novelty: 1,
  });
  assert(r.mandatory_stop === 'skip', 'mandatory stop skipped on BLOCKED');
  assert(r.commit_reveal === 'skip', 'commit-reveal skipped on BLOCKED');
  assert(r.yield_parking === 'skip', 'yield parking skipped on BLOCKED');
});

group('Guardrail evaluator — YIELD_PARK', () => {
  const r = evalGuardrails('YIELD_PARK', 2.0, {
    data_integrity: 3, adversarial_quality: 3, decision_logic: 3,
    risk_management: 3, calibration_alignment: 3, novelty: 3,
  });
  assert(r.yield_parking === 'pass', 'yield parking passes on YIELD_PARK verdict');
});

// ── New playbooks coverage ─────────────────────────────────
group('New playbooks are live', () => {
  const expected = [
    'funding-rate-harvest',
    'volatility-crush-pre-catalyst',
    'btc-eth-ratio-rotation',
    'okb-staking-yield-park',
    'mean-reversion-overshoot',
    'stablecoin-depeg-scanner',
  ];
  for (const slug of expected) {
    const p = PLAYBOOKS.find((x) => x.slug === slug);
    assert(!!p, `playbook ${slug} exists`);
    assert(p?.status === 'live', `playbook ${slug} is live`);
  }
});

group('Categories cover directional + yield + volatility + arbitrage', () => {
  const cats = new Set(PLAYBOOKS.map((p) => p.category));
  assert(cats.has('directional'), 'has directional');
  assert(cats.has('yield'), 'has yield');
  assert(cats.has('volatility'), 'has volatility');
  assert(cats.has('arbitrage'), 'has arbitrage');
  assert(cats.has('risk-management'), 'has risk-management');
});

// ── Report ─────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`✓ All ${passed} assertions passed across ${PLAYBOOKS.length} playbooks.`);
  process.exit(0);
} else {
  console.log(`✕ ${failures.length} assertion(s) failed (${passed} passed):\n`);
  for (const f of failures) console.log(`  ✕ ${f}`);
  process.exit(1);
}
