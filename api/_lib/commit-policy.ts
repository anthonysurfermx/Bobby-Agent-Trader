// Commit policy for the unified on-chain commit path (TrackRecordV2 via /api/xlayer-record).
//
// A commitment is only minted for an ACTIONABLE thesis. TrackRecordV2 cannot
// represent neutrality: for verified symbols it requires a stop and derives
// direction from the levels, so neutral/none/watch verdicts never reach the
// chain. Entry is always the frozen market price from the cycle's intel
// snapshot — never an LLM-invented entry — and levels are validated against
// that same price.

export interface CommitPolicyInput {
  challengeMode: string;            // 'live' | 'paper' | 'dryrun'
  cioSaysExecute: boolean;
  direction: string | null;         // 'long' | 'short' | null
  conviction: number | null;        // normalized 0-1
  threadId: string | null | undefined; // real forum_threads id — never synthesized
  marketPrice: number | null;       // frozen market price for the symbol
  stopPrice: number | null;
  targetPrice: number | null;
}

export type CommitPolicyDecision =
  | { commit: true; entryPrice: number; stopPrice: number; targetPrice: number | null }
  | { commit: false; reason: string };

export const COMMIT_CONVICTION_FLOOR = 0.35;

export function evaluateCommitPolicy(input: CommitPolicyInput): CommitPolicyDecision {
  const { challengeMode, cioSaysExecute, direction, conviction, threadId, marketPrice, stopPrice, targetPrice } = input;

  if (challengeMode !== 'live') {
    return { commit: false, reason: `mode=${challengeMode} — commits only in live mode` };
  }
  if (!cioSaysExecute) {
    return { commit: false, reason: 'CIO did not call for execution' };
  }
  if (direction !== 'long' && direction !== 'short') {
    return { commit: false, reason: `direction=${direction ?? 'none'} — only long/short theses commit` };
  }
  if (conviction === null || !Number.isFinite(conviction) || conviction < COMMIT_CONVICTION_FLOOR) {
    return { commit: false, reason: `conviction=${conviction ?? 'null'} below floor ${COMMIT_CONVICTION_FLOOR}` };
  }
  if (typeof threadId !== 'string' || threadId.length === 0) {
    return { commit: false, reason: 'no persisted threadId — refusing to synthesize one' };
  }
  if (typeof marketPrice !== 'number' || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    return { commit: false, reason: 'no frozen market price for entry' };
  }
  if (typeof stopPrice !== 'number' || !Number.isFinite(stopPrice) || stopPrice <= 0) {
    return { commit: false, reason: 'missing or invalid stop price' };
  }

  const entryPrice = marketPrice;
  const hasTarget = typeof targetPrice === 'number' && Number.isFinite(targetPrice) && targetPrice > 0;

  if (direction === 'long') {
    if (stopPrice >= entryPrice) return { commit: false, reason: `long with stop ${stopPrice} >= entry ${entryPrice}` };
    if (hasTarget && (targetPrice as number) <= entryPrice) {
      return { commit: false, reason: `long with target ${targetPrice} <= entry ${entryPrice}` };
    }
  } else {
    if (stopPrice <= entryPrice) return { commit: false, reason: `short with stop ${stopPrice} <= entry ${entryPrice}` };
    if (hasTarget && (targetPrice as number) >= entryPrice) {
      return { commit: false, reason: `short with target ${targetPrice} >= entry ${entryPrice}` };
    }
  }

  return { commit: true, entryPrice, stopPrice, targetPrice: hasTarget ? (targetPrice as number) : null };
}

// A live cycle whose commit FAILED must never open a position: there would be
// a real trade Bobby claims to have committed on-chain without proof. A commit
// that succeeds but is later blocked by balance/risk gates stays valid as a
// CIO prediction and resolves or expires normally.
export function executionBlockedByCommitFailure(
  commitAttempted: boolean,
  commitError: string | null,
): boolean {
  return commitAttempted && commitError !== null;
}

// user_digests.kind check constraint accepts scheduled|morning|alert|manual.
// 'cron' describes the trigger, not the digest type — map it to 'scheduled'.
export function digestKind(cycleKind: string): 'scheduled' | 'manual' {
  return cycleKind === 'cron' ? 'scheduled' : 'manual';
}
