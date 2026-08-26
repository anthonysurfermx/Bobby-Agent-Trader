import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMMIT_CONVICTION_FLOOR,
  assessCommitReceipt,
  digestKind,
  evaluateCommitPolicy,
  type CommitPolicyInput,
} from '../api/_lib/commit-policy.js';

const base: CommitPolicyInput = {
  challengeMode: 'live',
  cioSaysExecute: true,
  direction: 'long',
  conviction: 0.5,
  threadId: 'a365cb89-defb-47d2-ae32-ec3521e7e1a5',
  marketPrice: 64000,
  stopPrice: 62000,
  targetPrice: 68000,
};

function expectState(
  input: CommitPolicyInput,
  state: 'not_required' | 'required' | 'invalid',
  reasonPattern: RegExp | null,
  label: string,
) {
  const d = evaluateCommitPolicy(input);
  assert.equal(d.state, state, `${label}: expected ${state}, got ${d.state}`);
  if (reasonPattern && d.state !== 'required') {
    assert.match(d.reason, reasonPattern, `${label}: unexpected reason "${d.reason}"`);
  }
}

// ── REQUIRED: live directional valid → entry = frozen market price ──
{
  const d = evaluateCommitPolicy(base);
  assert.equal(d.state, 'required', 'valid live long must require a commit');
  if (d.state === 'required') {
    assert.equal(d.entryPrice, 64000, 'entry must be the frozen market price, not an LLM entry');
    assert.equal(d.stopPrice, 62000);
    assert.equal(d.targetPrice, 68000);
  }
}
expectState({ ...base, direction: 'short', stopPrice: 66000, targetPrice: 60000 }, 'required', null, 'valid live short');
{
  // target optional — absent target still committable
  const d = evaluateCommitPolicy({ ...base, targetPrice: null });
  assert.equal(d.state, 'required', 'missing target must not block a valid thesis');
  if (d.state === 'required') assert.equal(d.targetPrice, null);
}

// ── NOT_REQUIRED: nothing actionable will execute live ──
expectState({ ...base, challengeMode: 'paper' }, 'not_required', /commits only in live/, 'paper mode');
expectState({ ...base, challengeMode: 'dryrun' }, 'not_required', /commits only in live/, 'dryrun mode');
expectState({ ...base, cioSaysExecute: false }, 'not_required', /did not call for execution/, 'watch/reject verdict');
expectState({ ...base, cioSaysExecute: false, direction: null }, 'not_required', /did not call/, 'neutral verdict');
expectState(
  { ...base, conviction: COMMIT_CONVICTION_FLOOR - 0.01 },
  'not_required', /below floor/, 'conviction under floor',
);
expectState({ ...base, conviction: null }, 'not_required', /below floor|null/, 'null conviction');

// ── INVALID: live actionable thesis that cannot be committed → BLOCKED ──
// (the fail-open hole: these used to fall through to execution)
expectState({ ...base, threadId: undefined }, 'invalid', /threadId/, 'live actionable + missing threadId');
expectState({ ...base, threadId: '' }, 'invalid', /threadId/, 'live actionable + empty threadId');
expectState({ ...base, direction: 'none' }, 'invalid', /direction/, 'execute requested with direction none');
expectState({ ...base, direction: null }, 'invalid', /direction/, 'execute requested with null direction');
expectState({ ...base, marketPrice: null }, 'invalid', /market price/, 'no frozen price');
expectState({ ...base, marketPrice: 0 }, 'invalid', /market price/, 'zero price');
expectState({ ...base, stopPrice: null }, 'invalid', /stop/, 'missing stop');
expectState({ ...base, stopPrice: -1 }, 'invalid', /stop/, 'negative stop');
expectState({ ...base, stopPrice: 65000 }, 'invalid', /long with stop/, 'long stop above entry');
expectState({ ...base, targetPrice: 63000 }, 'invalid', /long with target/, 'long target below entry');
expectState(
  { ...base, direction: 'short', stopPrice: 62000, targetPrice: 60000 },
  'invalid', /short with stop/, 'short stop below entry',
);
expectState(
  { ...base, direction: 'short', stopPrice: 66000, targetPrice: 65000 },
  'invalid', /short with target/, 'short target above entry',
);

// ── Receipt assessment: success-shaped responses without a real receipt ──
{
  const ok = assessCommitReceipt({ ok: true, onchain: true, txHash: '0xabc123' });
  assert.equal(ok.confirmed, true, 'real receipt must confirm');
  if (ok.confirmed) assert.equal(ok.txHash, '0xabc123');
}
for (const [res, pattern, label] of [
  [{ ok: true, onchain: false }, /not on-chain/, '{ok:true, onchain:false} (pre-deploy shape)'],
  [{ ok: true, onchain: true, txHash: null }, /no tx hash/, '{ok:true, onchain:true, txHash:null}'],
  [{ ok: true, onchain: true, txHash: '' }, /no tx hash/, 'empty txHash'],
  [{ ok: true }, /not on-chain/, 'ok without onchain flag'],
  [{ ok: false, error: 'V2 commit error' }, /V2 commit error/, 'recorder error'],
  [{ ok: false }, /commit rejected/, 'error without message'],
  [null, /no response/, 'null response'],
  [undefined, /no response/, 'undefined response'],
] as const) {
  const r = assessCommitReceipt(res);
  assert.equal(r.confirmed, false, `${label}: must NOT confirm`);
  if (!r.confirmed) assert.match(r.reason, pattern, `${label}: unexpected reason "${r.reason}"`);
}

// ── digest kind mapping ──
assert.equal(digestKind('cron'), 'scheduled');
assert.equal(digestKind('manual'), 'manual');
assert.equal(digestKind('anything-else'), 'manual');

// ── structural guards on bobby-cycle.ts ──
const cycleSrc = readFileSync(new URL('../api/bobby-cycle.ts', import.meta.url), 'utf8');
{
  // exactly ONE call site sends action:'commit' to /api/xlayer-record
  const commitCalls = cycleSrc.match(/action: 'commit'/g) || [];
  assert.equal(commitCalls.length, 1, `expected exactly 1 commit call site, found ${commitCalls.length}`);
  // the dead disabled block and the legacy inline writer are gone
  assert.ok(!cycleSrc.includes('&& false'), 'disabled dead-code commit block must not exist');
  assert.ok(!cycleSrc.includes('rpc.xlayer.tech'), 'legacy inline X Layer writer must not exist');
  assert.ok(!cycleSrc.includes('bobby-cycle-${Date.now()}'), 'threadId must never be synthesized');
  // the commit is awaited (not fire-and-forget)
  assert.ok(/await fetchLocalApi\('\/api\/xlayer-record'/.test(cycleSrc), 'commit call must be awaited');
  // receipt goes through the strict assessor and the gate uses the 3-state model
  assert.ok(/assessCommitReceipt\(commitRes\)/.test(cycleSrc), 'response must pass assessCommitReceipt');
  assert.ok(/commitState === 'blocked'/.test(cycleSrc), 'execution gate must check commitState blocked');
  // the commit evaluation must NOT live inside the threadId guard — a failed
  // thread insert on an actionable thesis must resolve to blocked, not skip
  const guardStart = cycleSrc.indexOf('// Save debate posts immediately');
  const guardBlock = cycleSrc.slice(guardStart, cycleSrc.indexOf('PHASE 3c'));
  assert.ok(!guardBlock.includes('evaluateCommitPolicy'), 'policy must be evaluated outside if(threadId)');
  // the final cycle close goes through checked sbPatch
  assert.ok(/cycleCloseOk = await sbPatch\('agent_cycles'/.test(cycleSrc), 'cycle close must use checked sbPatch');
  // digest kind is mapped, never raw 'cron'
  assert.ok(/kind: digestKind\(kind\)/.test(cycleSrc), 'digest insert must map kind through digestKind()');
}

console.log('✓ commit-policy: 3-state matrix + receipt assessment + structural guards passed');
