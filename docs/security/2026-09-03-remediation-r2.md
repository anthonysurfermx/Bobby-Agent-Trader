# Remediation, round 2 — what the round-1 NO-GO asked for

Branch `security/remediation-r2`, based on `origin/main@e20d2b8`.
Inputs: `docs/security/2026-09-03-full-stack-audit.md` (round 0),
`docs/security/2026-09-03-fable-5-1-audit-round-1.md` and
`docs/security/2026-09-03-final-audit-codex.md` (round 1, NO-GO).

Round 1 set the bar: *exploit-to-regression closure for every P0 plus P1-1,
P1-3/C-01, C-02 and C-03 — no policy text, no empty-table samples, no green
generic suite as a substitute.* Every row below therefore points at a test that
**reproduces the attack first** and then asserts the fix refuses it.

## Closure table

| ID | Fix | Regression (reproduces, then refuses) | State |
|---|---|---|---|
| **P0-1** api_cache anon-readable · pairing code is the key | Migration `20260903000010`: drop `api_cache_anon_read`, revoke anon/authenticated. `/api/identity-link` retired → 410 (Build 13 removed the phone side, so web-only pairing has nothing to pair with). Web pairing UI removed from `ProgressSync.tsx`. | `test:rls-lockdown-pg` inserts `identity-link:K7QW2M`, reads it as `anon` (succeeds), applies 0010, reads again → **42501**. `test:remediation-r2`: issue/claim → 410, zero `api_cache` writes, zero merge RPC calls. | closed in code; **migration must be applied to prod** |
| **P0-2** agent_trades `USING (true)` with owner_address + PnL | 0010: drop policy, revoke; new view `agent_trades_public` — dashboard columns only, no `owner_address`/`user_id`/`tx_hash`/hashes/signatures, and **protocol-owned rows only** (`owner_address is null and user_id is null`). `AgentDashboard.tsx` reads the view. | pg test: `anon` reads `owner_address='0xvictim'` (succeeds), applies 0010 → **42501**; view returns the protocol row only and has none of the seven identifier columns. | closed in code; **migration must be applied** |
| *(same class)* agent_cycles `USING (true)` with owner_address + user_id | 0010: same treatment, view `agent_cycles_public`; three client readers repointed. Not a numbered finding — Codex's RLS matrix flagged it. | same pg test, same assertions. | closed in code |
| **P0-3** HardnessRegistry: agent self-resolves with any exit price | `resolvePrediction`: **resolver-only** (the `msg.sender == prediction.agent` branch is gone) **and** the outcome is **derived** from committed entry/target/stop vs exit — direction inferred from the levels, pnl computed on-chain, reported pnl must be within `PNL_TOLERANCE_BPS = 100`, derived figure stored. | `FinalAuditRegression.t.sol` = round-1 PoC with assertions inverted: same registration, same commit, same `resolvePrediction(h, 1, WIN, 1)` → `NotAuthorized`; a *resolver* trying the same → `InvalidResult`; +5000 reported on a +500 move → `InvalidResult`; honest path stores 500; a short is judged the other way. Two existing tests that pranked the agent now prank a resolver. | closed in **source**; **deployed contract is unchanged — see "What stays open"** |
| **P1-1** amount edit leaves stale calldata | `SwapExecutor.tsx`: amount `onChange` calls `reset()` like every other control; `executeSwap` refuses unless `quoteMatchesAmount(quote.amountIn, amount)` (`src/lib/base-swap/quote-guard.ts`). | `test:remediation-r2`: `quoteMatchesAmount('25','5') === false` (the exact round-1 sequence), normalisation cases, and the two source assertions. | closed |
| **P1-3 / C-01** judge-mode unauthenticated; public readers cross private-thread RLS | Every public `forum_threads` read pinned with `scope=eq.public`: ghost-wallet, checkpoint, bobby-signals, harness-events (fallback), mcp-http ×2, judge-mode ×3 **and its PATCH**. judge-mode persists `debate_quality` only when `isInternalRequest`; `mcp-http`'s `bobby_judge` now sends the internal secret so MCP verdicts still persist. | TS suite records every `fetch`: each handler's `forum_threads` URLs must contain `scope=eq.public`; public judge-mode → 200 and **zero PATCH**; internal → exactly one PATCH, scoped public. `mcp-http` literals checked from source. | closed |
| **C-03** PostgREST injection via `kind`/`symbol`/`outcome`/`type` | Allow-list `^[A-Za-z0-9_.-]{1,64}$` + `encodeURIComponent`; off-list → 400 before any query. | `kind=episode&select=id` → 400, no fetch; `type=cycle&select=id` → 400; honest filter appears encoded in the URL. | closed |
| **C-04** merge orphans `bobby_swap_receipts` | 0010 re-defines `bobby_link_identities` with one added line re-parenting receipts before the delete. | pg test: receipt on the merged identity; after the RPC it belongs to the kept one and the merged row is gone. | closed |
| **C-05** non-atomic consume | Moot: no codes are issued (P0-1). Documented in the tombstone what a re-introduction needs (hashed key, single `DELETE … RETURNING`, issuer-side confirm, unlink). | covered by the P0-1 410 tests. | closed by retirement |
| **P1-6** bounty resolver challenges + awards itself | `submitChallenge` rejects `resolver`/`owner`; `resolveBounty` rejects them as `_winner` (belt for a resolver rotated in after challenging). | Regression: round-1 sequence reverts at `submitChallenge` with `"Resolver cannot challenge"`, poster reclaims the full pot; second test: legitimate challenge exists, `resolveBounty(id, resolver)` → `"Resolver cannot win"`. | closed in **source**; deployed contract unchanged |
| **C-02** TrackRecordV2 active Pyth is the old address | Read-only check on Base (this session): `activePyth = 0x8250…`, `approvedPyth(0xbC16…) = true`, `pythActivatableAt = 1787340957` (elapsed 2026-08-17), owner = Safe `0x8BE6…53b4`. **One Safe transaction closes it** — below. | `npm run check:mainnet:postdeploy` after the tx (the repo's own verifier is what failed in round 1). | **open — Anthony, Safe 2/3** |

## Verification record

Run on `security/remediation-r2` after the last edit:

- `forge test` — 14 suites, **228 passed, 0 failed** (221 before + 7 in `FinalAuditRegression.t.sol`; two `HardnessRegistry.t.sol` tests re-pranked from agent to resolver)
- `test:remediation-r2` — 15/15
- `test:rls-lockdown-pg` — exploit reproduced on the shipped policies, then refused; views and C-04 asserted (PostgreSQL 17, scratch schema, stand-in roles)
- `test:api-security` — 47/47
- `test:base-swap` — pass
- `check:api` (tsc) — pass · `eslint` on every touched file — 0 errors
- `npm run build` — pass

## What stays open, and who holds it

1. **Apply migration `20260903000010`** to `qbvdqkknnuweatptjohi`. Until then P0-1/P0-2
   are fixed in the repo and open in production. The `/api/identity-link` tombstone
   deploys with the next Git push regardless, which closes the *credential-issuing*
   half of P0-1 even before the migration lands.
2. **C-02 — one Safe transaction.** To `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321`,
   value 0, data `0xb4d6badf000000000000000000000000bc16aee60f64864882bc6c4e428e148fc0e272f5`
   (`activatePyth(0xbC16aee60f64864882BC6C4E428e148Fc0E272F5)`). The address is already
   approved and its 48-hour timelock elapsed, so no `approvePyth` is needed. Then
   `npm run check:mainnet:postdeploy`.
3. **P0-3 and P1-6 are fixed in source, not on chain.** `HardnessRegistry` and
   `BobbyAdversarialBounties` are not upgradeable; closing them for real means a new
   deploy, the Safe accepting ownership, and repointing `contracts/deployments/8453.json`
   and every consumer. That deploy is subject to the standing **three-round audit
   rule** for any `.sol` change — this branch is round 1 of that. Both contracts hold
   **0 ETH** today (Codex, round 1), so the exposure until then is reputational, not
   financial: the *current* registry can still be gamed. Recommendation: do not cite
   HardnessRegistry stats anywhere public until the redeploy; TrackRecordV2 (Pyth-derived)
   is the record to cite.
4. **P1-2** (confirmation cards decode the calldata they sign) — not in the round-2
   must-list; unchanged. Worth doing before the flip: `decodeFunctionData` on
   `approveTx`, pin spender to `UNISWAP_BASE.swapRouter02`, refuse on mismatch.
5. **P1-5** CSP enforcement — unchanged. Needs a browser-tested pass, separate PR.
6. **P1-7** stake has no exit — a design change to the same non-upgradeable contract;
   fold into the redeploy in (3).
7. `agent_events` and `hardness_agent_proofs` still have `USING (true)` anon policies
   and carry run/thread/payment/trade ids and session/tx hashes (Codex). Same
   view-shaping treatment; not done here to keep the round reviewable.
8. Live RLS state was read from migration files plus the round-1 live sample. After
   applying 0010, `bobby_rls_matrix()` should show no anon policy on the three tables.

## For round 2 (Codex / Kimi)

Reproduce first, on `e20d2b8`, with the tests as they stand here — the pg test and
the regression contract test are written so the *pre-fix* state is exercised
explicitly (the pg suite rebuilds the shipped policies and proves the read works
before applying 0010). Then confirm the refusal on this branch. Then hunt: the
view column lists, the direction inference in `_derivePnlBps` (a commit with
`target == entry` and `stop != entry`; extreme `exit/entry` ratios near the `int32`
clamp), the `scope=eq.public` pins (is any forum_threads read on a public path still
unpinned?), and whether the retired identity-link leaves any dangling client call.
