import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMMIT_CONVICTION_FLOOR,
  digestKind,
  evaluateCommitPolicy,
  executionBlockedByCommitFailure,
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

function expectNoCommit(input: CommitPolicyInput, reasonPattern: RegExp, label: string) {
  const d = evaluateCommitPolicy(input);
  assert.equal(d.commit, false, `${label}: expected NO commit`);
  if (!d.commit) assert.match(d.reason, reasonPattern, `${label}: unexpected reason "${d.reason}"`);
}

// ── live directional valid → commit, entry = frozen market price ──
{
  const d = evaluateCommitPolicy(base);
  assert.equal(d.commit, true, 'valid live long must commit');
  if (d.commit) {
    assert.equal(d.entryPrice, 64000, 'entry must be the frozen market price, not an LLM entry');
    assert.equal(d.stopPrice, 62000);
    assert.equal(d.targetPrice, 68000);
  }
}
{
  const d = evaluateCommitPolicy({ ...base, direction: 'short', stopPrice: 66000, targetPrice: 60000 });
  assert.equal(d.commit, true, 'valid live short must commit');
}
{
  // target optional — absent target is still committable
  const d = evaluateCommitPolicy({ ...base, targetPrice: null });
  assert.equal(d.commit, true, 'missing target must not block a valid thesis');
  if (d.commit) assert.equal(d.targetPrice, null);
}

// ── neutral / none / watch-reject → no commit ──
expectNoCommit({ ...base, direction: null }, /only long\/short/, 'neutral direction');
expectNoCommit({ ...base, direction: 'none' }, /only long\/short/, 'direction none');
expectNoCommit({ ...base, cioSaysExecute: false }, /did not call for execution/, 'watch/reject verdict');
expectNoCommit(
  { ...base, conviction: COMMIT_CONVICTION_FLOOR - 0.01 },
  /below floor/, 'conviction under floor',
);
expectNoCommit({ ...base, conviction: null }, /below floor|null/, 'null conviction');

// ── paper / dryrun → zero writes ──
expectNoCommit({ ...base, challengeMode: 'paper' }, /commits only in live/, 'paper mode');
expectNoCommit({ ...base, challengeMode: 'dryrun' }, /commits only in live/, 'dryrun mode');

// ── threadId must be real — never synthesized ──
expectNoCommit({ ...base, threadId: undefined }, /threadId/, 'missing threadId');
expectNoCommit({ ...base, threadId: '' }, /threadId/, 'empty threadId');

// ── entry / stop sanity ──
expectNoCommit({ ...base, marketPrice: null }, /market price/, 'no frozen price');
expectNoCommit({ ...base, marketPrice: 0 }, /market price/, 'zero price');
expectNoCommit({ ...base, stopPrice: null }, /stop/, 'missing stop');
expectNoCommit({ ...base, stopPrice: -1 }, /stop/, 'negative stop');

// ── inverted levels → no commit ──
expectNoCommit({ ...base, stopPrice: 65000 }, /long with stop/, 'long stop above entry');
expectNoCommit({ ...base, targetPrice: 63000 }, /long with target/, 'long target below entry');
expectNoCommit(
  { ...base, direction: 'short', stopPrice: 62000, targetPrice: 60000 },
  /short with stop/, 'short stop below entry',
);
expectNoCommit(
  { ...base, direction: 'short', stopPrice: 66000, targetPrice: 65000 },
  /short with target/, 'short target above entry',
);

// ── commit failure blocks execution; success or no-attempt does not ──
assert.equal(executionBlockedByCommitFailure(true, 'V2 commit error'), true);
assert.equal(executionBlockedByCommitFailure(true, null), false, 'successful commit must not block');
assert.equal(executionBlockedByCommitFailure(false, null), false, 'no attempt (neutral/paper) must not block');

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
  // the final cycle close goes through checked sbPatch
  assert.ok(/cycleCloseOk = await sbPatch\('agent_cycles'/.test(cycleSrc), 'cycle close must use checked sbPatch');
  // digest kind is mapped, never raw 'cron'
  assert.ok(/kind: digestKind\(kind\)/.test(cycleSrc), 'digest insert must map kind through digestKind()');
}

console.log('✓ commit-policy: 30+ assertions passed');
