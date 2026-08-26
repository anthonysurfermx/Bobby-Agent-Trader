// Commit policy for the unified on-chain commit path (TrackRecordV2 via /api/xlayer-record).
//
// Three distinct states — the distinction is what keeps the path fail-CLOSED:
//
//   not_required  — neutral/none verdicts, paper/dryrun modes, low conviction,
//                   or no execution call. Nothing to prove; execution follows
//                   its own gates (paper trades, dryrun no-ops).
//   required      — a live actionable thesis. The commit MUST confirm with a
//                   real on-chain receipt before OKX execution is allowed.
//   invalid       — a live actionable thesis that CANNOT be committed (no
//                   persisted threadId, no frozen price, missing stop,
//                   direction-inconsistent levels). Execution must be BLOCKED:
//                   a live trade may never exist without its published proof.
//
// TrackRecordV2 cannot represent neutrality: for verified symbols it requires
// a stop and derives direction from the levels, so neutral verdicts never
// reach the chain. Entry is always the frozen market price from the cycle's
// intel snapshot — never an LLM-invented entry — and levels are validated
// against that same price.

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

export type CommitRequirement =
  | { state: 'not_required'; reason: string }
  | { state: 'required'; entryPrice: number; stopPrice: number; targetPrice: number | null }
  | { state: 'invalid'; reason: string };

export const COMMIT_CONVICTION_FLOOR = 0.35;

export function evaluateCommitPolicy(input: CommitPolicyInput): CommitRequirement {
  const { challengeMode, cioSaysExecute, direction, conviction, threadId, marketPrice, stopPrice, targetPrice } = input;

  // ── Not required: nothing actionable will execute live ──
  if (challengeMode !== 'live') {
    return { state: 'not_required', reason: `mode=${challengeMode} — commits only in live mode` };
  }
  if (!cioSaysExecute) {
    return { state: 'not_required', reason: 'CIO did not call for execution' };
  }
  if (conviction === null || !Number.isFinite(conviction) || conviction < COMMIT_CONVICTION_FLOOR) {
    return { state: 'not_required', reason: `conviction=${conviction ?? 'null'} below floor ${COMMIT_CONVICTION_FLOOR}` };
  }

  // ── From here the thesis is live and actionable: a commit is REQUIRED.
  //    Any defect below must BLOCK execution, never fall through. ──
  if (direction !== 'long' && direction !== 'short') {
    return { state: 'invalid', reason: `execution requested with direction=${direction ?? 'none'}` };
  }
  if (typeof threadId !== 'string' || threadId.length === 0) {
    return { state: 'invalid', reason: 'no persisted threadId — refusing to synthesize one' };
  }
  if (typeof marketPrice !== 'number' || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    return { state: 'invalid', reason: 'no frozen market price for entry' };
  }
  if (typeof stopPrice !== 'number' || !Number.isFinite(stopPrice) || stopPrice <= 0) {
    return { state: 'invalid', reason: 'missing or invalid stop price' };
  }

  const entryPrice = marketPrice;
  const hasTarget = typeof targetPrice === 'number' && Number.isFinite(targetPrice) && targetPrice > 0;

  if (direction === 'long') {
    if (stopPrice >= entryPrice) return { state: 'invalid', reason: `long with stop ${stopPrice} >= entry ${entryPrice}` };
    if (hasTarget && (targetPrice as number) <= entryPrice) {
      return { state: 'invalid', reason: `long with target ${targetPrice} <= entry ${entryPrice}` };
    }
  } else {
    if (stopPrice <= entryPrice) return { state: 'invalid', reason: `short with stop ${stopPrice} <= entry ${entryPrice}` };
    if (hasTarget && (targetPrice as number) >= entryPrice) {
      return { state: 'invalid', reason: `short with target ${targetPrice} >= entry ${entryPrice}` };
    }
  }

  return { state: 'required', entryPrice, stopPrice, targetPrice: hasTarget ? (targetPrice as number) : null };
}

// Strict receipt check for the recorder response. Success-SHAPED responses
// without a real broadcast receipt must not unlock execution:
//   { ok:true, onchain:false }          → recorder's pre-deploy dry answer
//   { ok:true, onchain:true, txHash:null } → no usable receipt
export type CommitReceipt =
  | { confirmed: true; txHash: string }
  | { confirmed: false; reason: string };

export function assessCommitReceipt(res: unknown): CommitReceipt {
  const r = res as { ok?: unknown; onchain?: unknown; txHash?: unknown; error?: unknown } | null | undefined;
  if (!r || typeof r !== 'object') return { confirmed: false, reason: 'no response from recorder' };
  if (r.ok !== true) {
    return { confirmed: false, reason: typeof r.error === 'string' && r.error ? r.error : 'commit rejected' };
  }
  if (r.onchain !== true) {
    return { confirmed: false, reason: 'recorder answered ok but not on-chain (no contract/latch?)' };
  }
  if (typeof r.txHash !== 'string' || r.txHash.length === 0) {
    return { confirmed: false, reason: 'recorder answered on-chain but returned no tx hash' };
  }
  return { confirmed: true, txHash: r.txHash };
}

// user_digests.kind check constraint accepts scheduled|morning|alert|manual.
// 'cron' describes the trigger, not the digest type — map it to 'scheduled'.
export function digestKind(cycleKind: string): 'scheduled' | 'manual' {
  return cycleKind === 'cron' ? 'scheduled' : 'manual';
}
