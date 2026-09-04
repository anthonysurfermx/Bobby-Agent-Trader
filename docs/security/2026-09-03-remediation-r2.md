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
| **C-02** TrackRecordV2 active Pyth is the old address | Read-only check on Base (this session): `activePyth = 0x8250…`, `approvedPyth(0xbC16…) = true`, `pythActivatableAt = 1787340957` (elapsed 2026-08-21 19:35 UTC), owner = Safe `0x8BE6…53b4`. **One Safe transaction closes it** — below. | `npm run check:mainnet:postdeploy` after the tx (the repo's own verifier is what failed in round 1). | **open — Anthony, Safe 2/3** |

## Verification record

Run on `security/remediation-r2` after the last edit:

- `forge test` — 14 suites, **257 passed, 0 failed** (2a: 228; 2b: 236; 3b: 243; 4: 248; 5: 250; 6 adds seven stake-exit/TTL regressions)
- `test:remediation-r2` — 37/37 (… 12: BP-09; 12b: BP-04 parsing + precedence, BP-08 lifecycle + transports, BP-10 read-failure/owner-change)
- `test:agent-registry-pg` — pass (BP-10 CAS + transfer + nonce on PostgreSQL 17)
- `test:hardness-abi-anvil` — pass (generated ABI equals the artifact; bytecode-backed decode of every backend getter)
- `test:rls-lockdown-pg` — pass: exploit reproduced on the shipped policies, then refused; migrations 0010 **and 0011**; real-producer rows for wallet / scheduled / manual / untagged cycles — only the scheduled one is public (PostgreSQL 17, scratch schema, stand-in roles)
- `test:api-security` — 47/47
- `test:base-swap` — pass, including BP-01 (1 consistent journey + 20 refusals) and BP-14 (reference validator matrix)
- iOS `BaseSwapGuardTests` 9/9 + `RPCCorrelatorTests` 6/6 — 18/18 across the three suites (BaseSwapGuard 9, RPCCorrelator 6, WalletSessionValidator 3) on the iPhone 17 Pro simulator
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
6. `agent_events` and `hardness_agent_proofs` still have `USING (true)` anon policies
   and carry run/thread/payment/trade ids and session/tx hashes (Codex). Same
   view-shaping treatment; not done here to keep the round reviewable.
7. Live RLS state was read from migration files plus the round-1 live sample. After
   applying 0010, `bobby_rls_matrix()` should show no anon policy on the three tables.

## Round 2 review (Codex) — NO-GO on `8b9af14`, and what changed for it

Codex reviewed `8b9af14` and refused to mark the branch closed: *"the patch fixes
the exact PoCs, but relevant bypasses remain."* Six points, all accepted. Fixed in
the follow-up commit on this branch:

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| 1 | **C-01 still leaks**: `bobby-cycle.ts:578` and `forum-morning.ts:49` build the *published* track record from every thread; `bobby-intel.ts:473` calibration, `bobby-protocol-stats.ts:348` counts, and `forum-resolve.ts` sweep/patch/**on-chain record** private threads too. | `scope=eq.public` on all five publication reads. `forum-resolve` still resolves a private cycle *for its owner* but **never calls `/api/protocol-record` for it** — Bobby's on-chain ledger is protocol calls only. | `forum-resolve` run against one public + one private pending thread: both PATCHed resolved, **exactly one** `protocol-record` POST, and it carries the public id. Plus a **repo-wide scan** of `api/**`: every `forum_threads?` literal must carry `scope=eq.public`, be a single-row `id=eq.` read, or sit on a three-entry allow-list with a reason. |
| 2 | **P1-6 survives via an auxiliary EOA**: resolver → `resolveBounty(id, A)` where A is a shill challenger. An address blacklist does not model a compromised backend. Same in HardnessRegistry's quorum module. | **Optimistic resolution with a dispute window, both contracts.** `resolveBounty` / a quorum now *proposes* (`PENDING_RESOLUTION`); anyone finalizes after `disputeWindow` (2 days, owner-bounded 1–14); the **poster or any rival challenger** can dispute inside it (`DISPUTED`); only the **owner — the 2/3 Safe — settles**, to a challenger or back to the poster. In HardnessRegistry, resolvers and the owner can no longer challenge or be named winner at all. A compromised key now needs the poster asleep for the whole window *and* no rival watching — and the Safe still has the last word. | `test_R2_auxiliaryEoaCannotDrain_posterDisputes` (the exact Codex sequence: shill gets 0, poster refunded, finalize impossible afterwards), rival-challenger dispute → Safe pays the honest one, undisputed → paid after window by anyone, only parties may dispute, registry quorum → PENDING → poster disputes → Safe settles, resolver cannot challenge or be winner in the registry. Existing bounty tests re-learned the window (`_finalize` helper, 6 sites; registry threshold test). |
| 3 | `judge-mode` still runs gpt-4o for free and bypasses the MCP fee on `bobby_judge`. | `requireInternalAuth` at the top: 401 for the public. `mcp-http` already sends the secret after its payment gate. | Public POST → **401 with zero fetches** (no model call, no Supabase); internal → 200 + one scoped PATCH. |
| 4 | **C-03 incomplete**: `mcp-http` interpolates `args.symbol` raw in two queries; `tools/call` does not enforce `inputSchema`. | `symbolFilterFor()`: `^[A-Za-z0-9._-]{1,32}$`, upper-cased, `encodeURIComponent`; off-list throws → JSON-RPC error before any query. | `bobby_recommend {symbol:'NVDAc&select=id'}` → error, no thread query; `bobby_brief` same; honest `nvdac` → `symbol=eq.NVDAC` and scoped. |
| 5 | `PredictionResolved` emitted the *reported* pnl while storing the derived one. | Emits `int32(computed)`. | `vm.expectEmit` on the honest path: 480 reported, 500 emitted. |
| 6 | `_derivePnlBps` accepted incoherent levels (`entry=100, target=110, stop=120` read as long). | Validated at **commit**: long is `target > entry > stop`, short is `target < entry < stop`; a single level must sit off the entry. | Four incoherent commits revert `InvalidValue`; two single-level commits pass. |

Codex also corrected a date: `pythActivatableAt = 1787340957` is **2026-08-21 19:35:57 UTC**,
not the 17th. Fixed everywhere it appeared. Confirmed by Codex: the 0010 migration
closes the direct reads correctly with no identifier leaking through the views; the
`0xb4d6badf…` calldata is right; C-02 remains open on chain.

**Operational consequence of the dispute window.** Nothing in `api/` calls
`resolveBounty` today, so there is no bot to update — but once bounties are live,
someone must call `finalizeResolution` / `finalizeBountyResolution` after the window.
It is permissionless, so the winner can; a small cron is the friendlier option.
A `DISPUTED` bounty waits for the Safe; there is deliberately no timeout that pays
either side without it.

## Round 3 review (Codex) — NO-GO on `8734ff2`, and what changed for it

Four P1s and five P2s. The meta-point was the important one: *the suites were green
but the blockers were not expressed by the tests.* Round 3b therefore changed the
tests' reach, not only the code.

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| P1 | **C-01 still open**: `getRecentContradictions` (`bobby-cycle.ts:606`) and the last-trade read (`:814`) use `sbQuery('forum_threads', …)` with no scope — private symbols/PnL entered the public cycle prompt. The scanner missed them because it only matched `forum_threads?` URL literals. | Both scoped. **Scanner rewritten by token**: every line in `api/**` that mentions `forum_threads` (comments stripped) is classified — writer (`POST`/`sbInsert`/`.insert`/…), single-row `id=eq.`, scoped, or on a two-entry allow-list with a reason (`my-threads` owner filter; the `forum-resolve` sweep). Anything else fails. | The scanner found `commit-policy.ts:26` on its first run — a type comment, which is how the comment handling got written. It found nothing else. |
| P1 | **The Safe had no last word**: only the poster or a challenger could dispute; with the poster asleep the backend's shill got paid. Rotating the resolver did not cancel a proposal. | `disputeResolution` / `disputeBountyResolution` accept the **owner**, without a bond. Role rotation deliberately leaves proposals in place — the owner's dispute right is the cancel. | `test_R3_ownerCanDisputeWithoutPoster`: shill proposed, owner disputes, owner refunds, shill gets its bond back and never the reward; `test_R3_registryOwnerDisputeAndTimeout`. |
| P1 | **Free disputes froze escrow forever; 50 sybils could fill the challenge slots.** | **Bonds**: every challenge and every party dispute posts `challengeBond` (= initial minBounty; owner-set, floored at the absolute minimum). Winner's bond returns; every other challenger's bond is forfeited **to the poster**; a rejected dispute's bond goes to the winner, an upheld one returns. **Timeout**: a `DISPUTED` bounty the owner never settles can be closed by anyone after `disputeSettlementTimeout` (30 d, bounded 7–90) — escrow back to the poster, every bond back to its owner. Nobody profits from stalling. Both contracts. | `test_R3_frivolousDisputeForfeitsBond`, `test_R3_stalledDisputeTimesOutToPoster` (also asserts the timeout cannot fire early and settle cannot follow it), `test_R3_sybilChallengesForfeitToPoster` (three sybils → three bonds to the poster). Every pre-existing bounty test re-learned the bond. |
| P1 | **Backend ABI incompatible with the redeployed registry**: `agentProfiles` lacked `stake`, `getPrediction` lacked `hardnessScore` — ethers threw `INVALID_ARGUMENT overflow`. | Fragments corrected and **exported**. New `test:hardness-abi-anvil`: deploys the Foundry artifact's bytecode on a throwaway anvil, drives it with the true ABI, then decodes every getter with the backend's list; also asserts each backend fragment exists in the artifact with identical selector and outputs. `contracts/abi/HardnessRegistry.json` + `BobbyAdversarialBounties.json` regenerated from `out/`; `verify/BobbyAdversarialBounties.flat.sol` re-flattened. | The Codex reproduction is the first assertion in that test. |
| P2 | Dispute deadline recomputed from a mutable global. | `resolutionFinalizeAfter[id]` snapshotted at proposal; finalize and dispute read the snapshot. | `test_R3_deadlineSnapshotIgnoresLaterWindowChange`: owner shortens the window after the proposal; finalize stays blocked until the snapshot. |
| P2 | `symbolFilterFor` upper-cased `NVDAc`; `eq` is case-sensitive → empty lookup; the test only looked at the URL. | `symbol=ilike.<raw>` (no wildcards can pass the allow-list, so `ilike` is a case-insensitive equality). **The mock now applies the filter**, so the test asserts the tool *answers with the NVDAc thread* for `nvdac`. | `C-03 / r3 P2` check. |
| P2 | `judge-mode` read the dynamic control source before authenticating. | `requireInternalAuth` first. | 401 test unchanged, now true in prod too. |
| P2 | Stale `contracts/abi` and `contracts/verify` artifacts. | Regenerated from the current compile. | — |
| P2 | `/api/hardness-test` did not revalidate geometry after the CIO moved the levels and answered `enabled:true` with `commitTxHash:null`. | `levelGeometryError()` on the request (400 before any model call) and again on the adjusted levels; `recordHardnessActivity` now returns `commitError`, and the endpoint answers `enabled:false` with it instead of a null hash. | Two checks: incoherent request → 400 with no model/chain call; the rule matches the registry's. |

Confirmed by Codex this round and kept: `DISPUTED → finalize` blocked, poster cannot be
named winner, `PENDING_RESOLUTION` blocks reclaim, pull-payment isolates a reverting
receiver (now pinned by `test_R3_revertingPosterDoesNotLockOthers`, which Codex asked for).

**Foundry gotcha worth recording**: `vm.prank` applies to the *next external call*.
`submitChallenge{value: bounties.challengeBond()}(…)` makes the bond getter that next
call, so the challenge ran as the test contract (the owner) and reverted "Resolver
cannot challenge" — 27 tests at once. The suites use a `BOND` constant now.

## Round 4 review (Codex) — NO-GO on `ff84390`: the bond economics I designed were farmable

Two P1s, both design flaws of round 3b, both accepted:

| # | Codex finding | Decision taken | Regression |
|---|---|---|---|
| P1 | **Bond farming.** Losing bonds went to the poster. Poster + shill + a compromised resolver: the shill wins reward + own bond, the poster collects every honest challenger's bond — the actor recovers all principal and nets `N × B`. Filling the slots with own sybils was near-free for the same reason. | **Forfeited bonds go to a neutral `treasury`, never to a party** — losing challenge bonds and rejected dispute bonds alike. Defaults to the owner (the Safe); settable, including to a burn address. | `test_R4_bondFarmingIsUnprofitable`: reward = bond, one shill, three honest, rigged resolver → the colluding actor's payout equals its deposits **exactly**, the poster receives 0, the treasury receives `3 × B`. Sybil and rival-dispute tests re-asserted against the treasury. |
| P1 | **Free stalling.** `resolveStalledDispute` refunded everything, so a poster could dispute a legitimate winner, sit 30 days, and recover reward and bond if the Safe did nothing. | **Explicit fallback: if the Safe does not rule inside the window, the proposal STANDS and the disputer's bond is forfeited to the treasury.** A dispute is an appeal; an appeal nobody rules on fails and the appellant pays. Stalling now costs a bond and achieves nothing. The security assumption is stated in the code: the Safe must rule on a real shill within `disputeSettlementTimeout` — and it can dispute on its own, without a bond, so it never depends on the poster. | `test_R3_stalledDisputeUpholdsProposal` (rewritten): winner paid after the timeout, staller's bond in the treasury, settle impossible afterwards; `test_R4_registryStalledDisputeUpholdsProposal`. The registry owner-dispute test now has the Safe *settle* (silence would uphold the shill — the documented trade-off). |

And the five P2s:

| Codex finding | Fix | Regression |
|---|---|---|
| `disputeSettlementTimeout` read live at timeout → retroactive. | `settlementAfter[id]` snapshotted at dispute time. | `test_R4_settlementDeadlineSnapshot`: owner shortens after the dispute; timeout still blocked until the snapshot. |
| `challengeBond` neither snapshotted nor capped. | `bountyBond[id]` fixed at post time (challenges and party disputes pay that); `setChallengeBond` capped at `1000 × ABSOLUTE_MIN_BOUNTY`. | `test_R4_bondSnapshotAndCap`: raised after the post → the old bond still applies, the new one is refused; cap enforced. |
| `_` is an `ilike` wildcard — `symbol=___` matched any 3-char ticker; the mock implemented ilike as equality. | Allow-list drops `_` and `%`. **The mock now implements real ilike semantics** (`_`→any char, `%`→any run), so a bypass would be visible. | `___`, `NVDA_`, `%`, `N%c` → refused before any query. |
| Scanner skipped `api/agents/**` and `api/network/**`; four-line windows were confusable. | Recursive walk; **statement-level** gathering to the terminating `;` (a trailing `{` no longer ends a statement, which is how `fetch(url, {` + `method: 'POST'` was being misread); prose skipped; **any unknown call form touching `forum_threads` is itself an offender** ("UNCLASSIFIED — extend the scanner"), so a new helper cannot slip by silently. | The walk is asserted to reach both subdirectories. Current inventory clean. |
| The backend still consumed a hand-written list; the test only detected drift. | **The ABI now comes from the artifact**: `scripts/gen-hardness-abi.mts` writes `api/_lib/hardness-registry.abi.ts` from `contracts/out/…/HardnessRegistry.json`; the lib imports it. The anvil test asserts the generated module **equals** the artifact and still decodes every getter through it. Regenerate after any `forge build`: `npm run gen:hardness-abi`. | `test:hardness-abi-anvil`. |
| `hardness-test`: `adjusted_* || original` swallowed a CIO adjustment of `0`; `enabled:true` meant submitted, not confirmed. | `??` (only null/undefined fall back — a `0` is validated and rejected); `commitStatus: 'submitted'` states what `enabled` means. | geometry checks unchanged. |
| Registry: a revoked resolver's vote kept counting in an open round. | Approvers tracked per round; quorum counts **only approvers who are still resolvers**. | `test_R4_revokedResolverVoteDoesNotCount`: approve, revoke, approve → still one active vote; a third resolver reaches quorum. |

Confirmed by Codex this round and kept: no double credit, terminal states and mapping
zeroing prevent repeated settlement/timeout, pull-payment + CEI isolate reverting
receivers, C-01 clean on the current inventory, judge-mode / on-chain geometry /
artifacts correct, the bond loops fit in gas at 500 challengers (~3.4M finalize,
~12.7M return-all), bytecode 11,385 B (Bounties) / 20,894 B (Registry) before this round.

**Trade-off recorded, not hidden.** The timeout rule means a compromised backend's
shill proposal wins if *both* the Safe fails to rule for 30 days *and* nobody
settles. The alternative (refund on timeout) made stalling free, which Codex showed
is the more exploitable failure. The Safe's own bond-free dispute right is what makes
the assumption reasonable; `disputeSettlementTimeout` is owner-bounded 7–90 days.

## Round 5 review (Codex) — NO-GO on `8bb2d2d`: the deploy left the treasury with the EOA

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| P1 | Both contracts initialise `treasury = msg.sender`; `DeployBase` creates them from the deployer EOA and only runs `transferOwnership(Safe)`. After the handoff `owner()` is the Safe and `treasury()` is still the EOA — forfeited bonds would have flowed to a hot key. Neither the manifest nor `VerifyBaseDeployment` checked it. | `Config` gains `treasury` + `challengeBond`, driven by **one parameter each**: `BOUNTY_TREASURY_ADDRESS` (unset = the declared owner, i.e. the Safe; on 8453 it may never be the deployer — the script refuses) and `CHALLENGE_BOND_WEI` (default = `MIN_BOUNTY_WEI`). `_configureBountyEconomics` sets both treasuries and both bonds **before** the two-step handoff. `_assertDeployment` proves all four (and, on mainnet, treasury ≠ deployer); the manifest carries `treasury` and `fees.challengeBondWei`; `VerifyBaseDeployment` re-proves them live against the manifest and against the Safe; `check:mainnet:*` cross-checks manifest ↔ env and fails on a manifest that predates the field; `finalize:base-manifest` requires the four configuration calls in the broadcast. | `DeploymentGates.t.sol` drives the **real script code path** from a harness that plays the EOA: `test_treasury_withoutConfigureStaysWithDeployer` reproduces Codex's exact state (owner = Safe, treasury = EOA); `test_treasury_configuredBeforeHandoffFollowsSafe` proves the fix survives the handoff and the ex-owner cannot move the treasury back. |
| P2 | Runbook line 135 still said the timeout returns the escrow to the poster; lines 139–141 said the opposite. | Fixed; the deploy configuration block added next to it. | — |

Values adopted, as recommended: treasury = Safe `0x8BE60853F27b944e11486285d95c3e06596553b4`,
`challengeBond = 25000000000000 wei` (= `MIN_BOUNTY_WEI`), both in `.env.example` and the
manifest. Codex's follow-up stands: for bounties of material value the bond should become
proportional to the reward, or the reward capped.

Confirmed by Codex this round: settlement economics correct — no double credit, no trapped
funds; bytecodes 12,006 B / 21,595 B, inside EIP-170. Codex also warned the disk was nearly
full (~607 MiB free) — worth clearing `contracts/out` / `cache` in the review worktrees.

## Round 6 review (Codex) — NO-GO on `2c75a04`: registration stake had no safe exit

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| P1 | `HardnessRegistry` locked every registration stake forever, while the hot `hardnessScorer` could slash it. | Two-step exit: `requestUnregister` immediately prevents new obligations and starts `UNSTAKE_COOLDOWN = 7 days`; `unregisterAgent` credits the remaining stake through pull-payment after the cooldown. Exit is blocked while a service is active or a prediction is unresolved. Slashing is Safe-only, remains possible during cooldown, and is capped at the remaining stake. Registration excess and value sent by mistake on a metadata update are withdrawable instead of silently locked. | Seven new regressions cover exact-once return, early refusal, cancellation, active-service and unresolved-prediction gates, scorer refusal/Safe cap, recoverable excess, and immutable prediction expiry. |
| P2 | Both timeout events named the indexed winner `poster`, so generated ABIs gave indexers the wrong semantic field name. | Rename the event parameter to `winner` in both contracts and regenerate ABI/flattened artifacts. | `expectEmit` asserts the proposal winner in each timeout path. |
| P2 | The mainnet template omitted the two new bounty-economics inputs, despite readiness depending on the manifest fields. | Add explicit `BOUNTY_TREASURY_ADDRESS = Safe` and `CHALLENGE_BOND_WEI = MIN_BOUNTY_WEI`; predeploy readiness now requires and validates both, including treasury/deployer separation and on-chain bond bounds. | Readiness plus the round-5 deployment-gate tests cover env → deploy → manifest → live verification. |

Prediction expiry is now snapshotted at commit. This is required by the exit gate: a later
owner TTL change cannot retroactively extend an agent's unresolved obligation or make it
expire early. The runtime is **23,209 B**, leaving 1,367 B below EIP-170; the bounties
runtime remains 12,006 B. Generated backend ABI: 159 entries, equal to the Foundry artifact.

Round-6 verification: Foundry **257/257** across 14 suites; targeted new/adjacent suites
83/83; `test:remediation-r2` 23/23; `test:hardness-abi-anvil`, `check:api`, lint,
`git diff --check`, and the production Vite build all pass.

## Round 7 review (Codex) — NO-GO on `44a2d51`: slash and timestamp edge cases

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| P1 | A full Safe slash set `registered = false`, but an already-active service remained payable because `payForService` checked only `service.active`. The slashed agent could keep collecting service fees without stake. | `payForService` now also requires the service owner to remain registered. This disables every service after a full slash without an unbounded loop over `serviceKeys`; re-staking deliberately restores service availability. | `test_slashAgent_fullSlashStopsExistingServicePayments` registers a live service, fully slashes its owner, and proves the next payment is refused. |
| P2 | Prediction and signal expiry snapshots cast `block.timestamp + delay` to `uint64`, while their time setters accepted arbitrarily large `uint256` values. Even a boundary value accepted by the Safe would become unsafe in a later block. | All three setters reject delays that cannot be represented as future `uint64` timestamps, and `commitPrediction`/`publishSignal` independently recheck representability when the snapshot is created. | `test_predictionTimeSettersRejectUint64Truncation` and `test_signalTimeSetterAndPublishRejectUint64Truncation` cover the first overflowing setter value and the later-block use of a formerly valid boundary. |

Post-fix verification: Foundry **260/260** across 14 suites; targeted
`HardnessRegistryTest` **59/59**; `test:remediation-r2` **30/30**;
`test:hardness-abi-anvil` confirms all 159 ABI entries equal the compiled artifact;
production Vite build and `check:api` pass. The `HardnessRegistry` runtime is
23,410 bytes, 1,166 bytes below EIP-170; bounties remain 12,006 bytes.

This round changes `HardnessRegistry.sol`, so the deploy remains under the standing
three-round rule; review the exact post-round-7 bytecode rather than treating these
tests as deployment approval.

## Round 8 review (Codex) — NO-GO on `a075bc5`: impossible prediction window

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| P1 | `setMinPredictionAge` and `setPredictionTTL` enforced their own floors and timestamp widths but not their relationship. The Safe could set `minPredictionAge > predictionTTL`; the reproduced prediction reverted `TooSoon` through its expiry and `Expired` once it reached `minResolveAt`, so no successful resolution was possible. Equality reduced the valid window to a single timestamp. | Both setters now preserve the strict invariant `minPredictionAge < predictionTTL`; `commitPrediction` independently refuses an invalid stored pair before accepting an obligation. | `test_predictionTimeSettersPreserveResolutionWindow` refuses equality in either setter order and proves a valid updated pair snapshots `minResolveAt < expiresAt`; `test_commitPrediction_rejectsInvalidStoredResolutionWindow` corrupts the pair beneath the setters and proves the commit-time defense. |

The round-7 historical PoCs were also reproduced directly against detached
`44a2d51`: all three vulnerable behaviors were observed (payable service after a
full slash, later-block prediction expiry truncation, and later-block signal expiry
truncation). On the current code, the expanded stake/service matrix covers partial
and full slash, slash during exit, cooldown cleanup, re-registration, manual service
deactivation/reactivation, and exact withdrawal conservation.

Post-fix verification: Foundry **264/264** across 14 suites; targeted
`HardnessRegistryTest` **63/63**; `test:remediation-r2` **30/30**;
`test:hardness-abi-anvil` confirms all 159 ABI entries equal the compiled artifact;
production Vite build and `check:api` pass. The `HardnessRegistry` runtime is
23,471 bytes, 1,105 bytes below EIP-170; bounties remain 12,006 bytes.

This round changes `HardnessRegistry.sol`, so the standing three-round requirement
restarts from the post-round-8 commit.

## Round 9 review (Codex) — GO 1/3 on the round-8 bytecode

The impossible-window PoC was reproduced directly on detached `a075bc5`: a
prediction configured with a two-hour minimum age and one-hour TTL returned
`TooSoon` at expiry and `Expired` at its minimum resolve time. The temporary
worktree was removed after the reproduction.

No production source changed in this round. Three permanent regressions add 512
fuzz cases across both valid setter orderings and invalid relationships, plus the
one-second valid boundary. Equality, floors, the largest representable future
timestamp, corrupted-storage commit defense, partial/full slash, exit cleanup,
service toggles, and withdrawal conservation all pass.

A clean `forge clean` rebuild reproduced `HardnessRegistry` runtime hash
`0x3449ac0707c855588a1a0df8d45bddbd04aabfb1e35cb66f7a704006b043e0d5`,
23,471 bytes with 1,105 bytes of EIP-170 margin. Every production contract remains
under EIP-170 (`BobbyTrackRecordV2` is the closest at 24,094 bytes / 482 bytes of
margin); the size command's non-zero exit is caused only by the 39,783-byte
`DeployerEoa` test harness.

Round-9 verification: Foundry **267/267** across 14 suites; targeted
`HardnessRegistryTest` **66/66**; `test:remediation-r2` **30/30**; backend ABI
**159/159**; production Vite build, `check:api`, and the clean compilation pass.
This is the first clean review of three required on the exact round-8 runtime.

## Round 10 review (Codex) — GO 2/3 on the round-8 bytecode

No production source changed in this round. Two new stateful fuzz regressions add
512 randomized runs across stake liability conservation and `activeServiceCount`
transitions; Foundry also replayed the one saved counterexample that exposed and
then confirmed the correction of a test-harness `vm.prank` ordering error.

The liability model covers partial slash, service revenue, exit during cooldown,
full or partial cooldown slash, unregister, withdrawal in either order,
re-registration, and service reactivation. At every terminal point the sum of
remaining stake and pull-payment liabilities equals the contract balance, and no
withdrawal can be credited twice. The service-count model applies idempotent
register/enable/disable operations across three services, then full-slashes and
re-registers the agent; the stored count matches the modeled active states after
every transition.

Partial slash preserving registration is intentional and accepted: only the Safe
can slash, so an agent cannot self-reduce its collateral, while the Safe may choose
a proportional penalty. Full slash still unregisters the agent and immediately
blocks payment through every previously active service.

The exact `HardnessRegistry` runtime hash remains
`0x3449ac0707c855588a1a0df8d45bddbd04aabfb1e35cb66f7a704006b043e0d5`;
the production source is byte-for-byte unchanged from round 8. Its runtime remains
23,471 bytes with 1,105 bytes of EIP-170 margin.

Round-10 verification: Foundry **269/269** across 14 suites; targeted
`HardnessRegistryTest` **68/68**; deployment gates **20/20**;
`test:remediation-r2` **30/30**; backend ABI **159/159**; production Vite build and
`check:api` pass. The real mainnet predeploy check correctly remains **31 NO-GO / 0
PASS** because the secure deployment environment is absent; no placeholder secret,
role, fee, stake, treasury, or resolver input was invented. This is the second clean
review of three required on the exact round-8 runtime.

## Round 11 review (Codex) — NO-GO on deployment configuration and CI

The third review did not earn GO 3/3. The reward/bond settlement, refund,
timeout and pull-payment paths did not produce a new liability finding, and the
full suite remains **269/269** across 14 suites. However, the deployment review
identified two unresolved P2s:

1. `DeployBase._v2Params()` narrows seven full-width environment inputs before
   validation. The constructor validates the truncated value, not the operator's
   original input. The manifest and live verifier also omit these verification
   parameters. Check before narrowing and carry every parameter through
   configuration, manifest and live verification (BP-03).
2. The CI contracts job runs `forge build --sizes` before tests/layout checks.
   That command currently exits 1 on the oversized `DeployerEoa` test harness,
   so the workflow never reaches the later checks. Enforce EIP-170 on the seven
   production artifacts explicitly while preserving compilation/testing of the
   harness (BP-06).

Production source, deployment scripts and compiler configuration remain unchanged
from round 8. `HardnessRegistry` runtime hash is still
`0x3449ac0707c855588a1a0df8d45bddbd04aabfb1e35cb66f7a704006b043e0d5`,
23,471 bytes; all seven production artifacts remain under EIP-170. The two prior
clean runtime reviews remain recorded, but this round is not a third clean
deployment review and grants no launch approval.

Current verification: bounty/final-regression/deployment suites **81/81**;
full Foundry **269/269**; backend ABI **159/159**; remediation **30/30**;
API typecheck and production build pass. `forge build --sizes` **fails as described
above**. No additional exploit reproduction or live write was performed.

The user also requested a broader protocol/web/iOS stock-swap audit. The first
expanded pass, including two signing-consent P1s, is recorded separately in
[the 2026-09-04 audit](2026-09-04-protocol-stock-swaps-audit.md). Its findings and
remaining coverage must be closed before enabling swaps, regardless of the
contract review count.

## Round 12 — the 2026-09-04 expanded review (14 findings, NO-GO): the three P1s closed

Input: `docs/security/2026-09-04-protocol-stock-swaps-audit.md` on `8c3fba8`. Remediation
order per that report: BP-01/BP-02/BP-09 first. Each closure below is the test the report
asked for, not a green generic suite.

| # | Finding | Fix | Closure evidence |
|---|---|---|---|
| **BP-01** P1 | Web signing guards compared decoded calldata to raw fields *from the same response*; the human saw decimal fields nobody bound to those units; no local minimum-received derivation. | `src/lib/base-swap/quote-guard.ts` → `assertQuoteConsistent(quote, request)`: rebuilds the economics in **integer units from the user's own request** (pair resolved through the pinned list — exact symbols, addresses, decimals; `parseUnits(amount)` must equal `amountInRaw` and every displayed field must equal its raw twin; `minAmountOutRaw` must equal `amountOutRaw·(10000−bps)/10000` for the user's slippage; non-zero outputs; local ticket cap, price-impact, deadline and recipient policy; stock reference symbol and pause). Both cards run it on every response **and again immediately before approval and swap**, and pass the **validated** values — not the response's — into the calldata decoders. `SwapConfirm` keeps the full quote; the reduced `execution.quote` is display only. | `test:base-swap`: one consistent approve→re-quote→swap journey through the decoders, and **20 inconsistent responses refused** — raw≠displayed (input, output, minimum), minimum not derived from output+slippage, server-changed slippage, wrong stock, reversed direction, zero output, non-canonical integer, over-cap ticket, over-limit impact, foreign recipient, far deadline, mismatched tx deadline, wrong router, wrong token address, foreign stock reference, paused issuer. |
| **BP-02** P1 | iOS `validateQuote` checked the response was *an* allowed USDC/stock pair, never *the* pair the user selected; the receive label used the local selection. | `BaseSwapGuard.validateQuote(_:requestedTokenIn:requestedTokenOut:…)`: the selected pair (symbols **and** pinned addresses) is the first check; all three call sites pass `tokenIn/tokenOut` from `side/stock`; `loadQuote` freezes the request before the await and refuses a response if the selection moved meanwhile; the post-approval re-quote refuses a wallet change; `.onChange` on side/stock/amount/slippage/wallet resets the quote. | `BaseSwapGuardTests` on the iPhone 17 Pro simulator, **9/9**: wrong-stock response (consistent, allow-listed) refused with "you selected …"; reversed direction refused; degenerate/unpinned requested pair refused; the four existing tests carry the requested pair. |
| **BP-09** P1 | Manual wallet cycles were logged without `owner_address`/`user_id`; migration 0010's view read that absence as "protocol-owned" and published halt reasons, timing and capital counters. | **Positive provenance.** `api/_lib/cycle-provenance.ts`: `cycleProvenance(isManual, wallet, operator)` decides once from the authorisation — manual+wallet → private+owner; scheduled or operator-authorised → public; manual without either → private — and `buildCycleRow` makes it win over whatever the data carried. `agent-run` takes it as a **required** argument of `logToSupabase` (all four branches: halt, no-signal, success, failure); `bobby-cycle` tags its rows `public` explicitly. Migration `0011`: `agent_cycles.visibility` (default **private**, checked), the cycles view requires `visibility = 'public'`, the trades view **joins the cycle** and requires it public. Historical rows stay private; a reviewed operator statement is left as a comment. Service-role readers that feed public surfaces (`harness-events`, `protocol-heartbeat`, `bobby-intel`, `conviction-tiers`, the cycle's own history prompt) are pinned to `visibility=eq.public`. | `test:rls-lockdown-pg` writes rows with the **real producer function** for a wallet run, a scheduled run, a manual run without operator auth and a pre-fix untagged row, then reads the 0011 views as `anon`: only the scheduled cycle and its trade are public; the wallet row carries its owner lower-cased. `test:remediation-r2`: provenance rules; every `logToSupabase` call site carries provenance; every public `agent_cycles` read is scoped. |

**Operational note.** After 0011 the public dashboard shows *no* historical cycles until an
operator reviews and tags the ones the scheduled cycle produced (statement in the migration
comment). That is the conservative reading the audit asked for.

**Incident during this round.** Mid-remediation macOS revoked this session's access to
`~/Documents` (TCC); every read and write under the repo failed with EPERM while `~/.claude`
kept working. State and plan were persisted to memory, access was re-granted, the edits were
re-applied from the same anchors — and one anchor guard caught a real temporal-dead-zone bug
on the way (`hasOperatorAuth` is declared *after* `walletAddress` in `agent-run`).

### Round 12b — the report's second tier: BP-04, BP-08, BP-10, BP-05, BP-14

| # | Finding | Fix | Closure evidence |
|---|---|---|---|
| **BP-04** P2 | Successful-but-malformed dynamic control JSON was read as "writes open" (`=== true` coercion); env freeze precedence undocumented. | `parseControlRecord`: a control record must be a plain object whose `write_freeze` and `canary` are literal booleans (note string/null); anything else — array, null, missing field, string `"false"`, number, unreadable — fails **closed**. Precedence is now explicit and tested: the dynamic source decides; the env flags are an **additive emergency brake** that can only add a freeze, never open. | `test:remediation-r2`: only a well-formed explicit `false` opens; ten malformed shapes freeze; HTTP 500 freezes; `PROTOCOL_CUTOVER_FREEZE=true` overrides a well-formed open; env `false` never opens a dynamic freeze. |
| **BP-08** P2 | A public tx hash was the redemption credential; nothing bound the redeemer to the client that obtained the challenge or to the request it was issued for; consumption preceded execution, so a tool failure ate the payment. | Migration `0013`: `client_secret_hash`, `result_json`, `error`, `attempts`, `completed_at`; statuses `pending → in_progress → completed \| retryable_failure`. `createChallenge` returns a **client secret once** (stored hashed) and stores the **canonical request hash** (`sha256` of sorted `{tool,args}`). `claimChallenge` is one conditional PATCH whose filter carries identity (secret hash), terms (request hash), liveness and state; a `completed` row for the same client + request is an **idempotent replay** of the stored result; a tool failure leaves the row `retryable_failure`; a stale `in_progress` (lambda died) is reclaimable after 5 min. Both transports issue with the request hash, require `x-challenge-secret`, and wrap execution with `completeChallenge` / `failChallenge`. | `test:remediation-r2`: against a PostgREST emulation honouring the filters — stranger with the tx hash refused; right client with different terms refused; claim → failure → retry claimed again (no second payment); completion → replay returns the stored result with no re-execution; stranger cannot replay. Source checks: the unbound consume is gone from both transports; issuance, claim, replay, failure and completion paths present in each. |
| **BP-10** P2 | Registration read the owner, verified a signature, then did an unconditional service-role merge; a failed read looked like "not found". | Migration `0012`: `hardness_agents.version`; `hardness_register_agent(agent_id, expected_owner, expected_version, row)` is insert-only for creation and a **compare-and-swap** on owner **and** version for updates, and refuses any owner change; `hardness_transfer_agent(agent_id, current_owner, new_owner, expected_version, request_id)` is the only way to move ownership, single-use via a nonce table. `getAgentStrict` throws on a failed read; `POST /api/agents/register` answers **502 without writing** on a read failure and **409** on an owner change; `POST /api/agents/transfer` requires a signature by the current owner over `{agentId,newOwner,expectedVersion,requestId}`. | `test:agent-registry-pg` (real Postgres): create insert-only; update CAS on owner + version; stale version, wrong owner and owner-change-through-registration refused; transfer requires the exact version and the current owner; a replayed request id refused; browser roles cannot execute either function. `test:remediation-r2`: read failure → 502 and zero registry writes; owner change → 409 and zero writes. |
| **BP-05** P2 | The bridge forwarded only `result`; the app's UUID guarded the timeout, not the JSON-RPC id, so the next response completed whichever continuation was pending. | The bridge now **builds the Sign `Request` itself** and owns its JSON-RPC id (Coinbase's SDK path is disabled, so every session is WalletConnect); `RPCCorrelator.check` accepts a response only when its id equals the pending id and its topic/chain, when present, match this session and Base; result shape is bound to the method; a pending request is failed with `sessionReplaced` on account change, session loss or disconnect. | `RPCCorrelatorTests` on the simulator: normal accepted; late (earlier id), duplicate (nothing pending), wrong topic, wrong chain and id-less responses ignored; a tx hash cannot satisfy a signature request. |
| **BP-14** P2 | Risk checks accepted any positive round younger than 96 h; the issuer registry's pause (feed frozen for a corporate action, transfers still open) was never read. | The registry is pinned (`0x3f3E…5CaD`; its `getOracleParams(token)` → `(multiplier, paused)` resolved from bytecode and probed on all four tokens). **One shared validator**, `evaluateStockReference`, distinguishes `fresh` / `market-closed` (warn) / `stale` / `issuer-paused` / `unusable`; a **recent timestamp never overrides a known pause**, an unreadable registry is unknown and unusable, and the registry multiplier must equal the token's. The quote path withholds calldata on any unusable verdict; the held-exposure path throws (fails closed) on the same rule; the card shows status and timestamp. | `test:base-swap`: open market, weekend (usable with warning), issuer-paused with a 10-minute-old timestamp (refused), unknown pause (refused), multiplier mismatch (refused), stale, incomplete round, non-positive answer, resumed feed. |

BP-03/BP-06/BP-07/BP-11/BP-12/BP-13 are closed in round 12c below. The third deployment
review remains pending.

### Round 12c — the report's third tier: BP-03, BP-06, BP-07, BP-11, BP-12, BP-13

| # | Finding | Fix | Closure evidence |
|---|---|---|---|
| **BP-03** P2 | `DeployBase._v2Params()` narrowed seven full-width env values to `uint16`/`uint24` *before* the constructor validated them, so a typo'd operator value could truncate into an in-range "valid" parameter; the manifest and the live verifier never carried them. | `contracts/script/V2ParamsGate.sol` (shared by deploy, verifier and tests): `Raw` holds the seven values at `uint256`; `validate` checks widths first, then the exact `_validateParams` bounds (incl. `challengeWindowSec > PYTH_ACTIVATION_DELAY`); `narrow` is the **only** path into the constructor; `live(address)` reads the deployed 7-tuple; `assertMatches(deployed, reviewed)` re-validates the reviewed values and compares field by field. `DeployBase` reads the raw values into `Config.v2Raw`, validates them in `_validateConfig` (pre-broadcast), asserts them live in `_assertDeployment`, writes `v2Params.*` to the manifest and logs them. `VerifyBaseDeployment._verifyV2Params` **requires** the block on 8453 (a pre-BP-03 manifest is verifiable on testnet only) and compares live params to the manifest. `check-mainnet-readiness` now requires the seven `V2_*` env values, bounds-checks them at full width, and cross-checks `manifest.v2Params.*` against them (fails when the block is absent). | `DeploymentGates.t.sol` **34/34** (14 new): defaults and boundary overrides narrow unchanged; `65_596` (→ `uint16` 60) and `7 days + 2^24` (→ `uint24` 7 days) are **rejected before narrowing** — both reproductions assert the silent truncation that the old path deployed; `2 days` rejected / `2 days + 1` accepted, and a **real `BobbyTrackRecordV2`** deployed through the gate proves `PYTH_ACTIVATION_DELAY` equals the contract's and the live getter round-trips; each semantic bound; drift in any field; an out-of-range reviewed value refused even when the chain agrees; mainnet manifest without the block → verify fails; testnet legacy manifest skips; live drift (`setParams` after review) fails. `test:protocol-write-safety` executes the readiness checker. |
| **BP-06** P2 | The CI contracts job ran `forge build --sizes`, which exits on the oversized `DeployerEoa` **test harness**, so `forge test` and the layout gate never ran; the swap/remediation/ABI/Postgres suites were never executed in CI at all. | `contracts/script/check-sizes.sh`: EIP-170 enforced on exactly the seven contracts `DeployBase` broadcasts (missing artifact = failure); the harness stays compiled and tested. `ci.yml`: contracts job = `forge build` → `check-sizes.sh` → `forge test --fuzz-runs 1000` → `check-layout.sh`; application job adds `test:base-swap`, `test:stock-ticker-routing`, `test:remediation-r2`, `test:rpc-redaction`; new **integration** job (foundry + anvil + a `postgres:17` service on 54329) runs `forge build`, `test:hardness-abi-anvil`, `test:bounties-abi-anvil`, `test:rls-lockdown-pg`, `test:swap-ledger-pg`, `test:agent-registry-pg`. The three pg scripts **fail (exit 1) when `CI=true` and `DATABASE_URL` is unset** — skipping stays a local convenience only. | `check-sizes.sh` run: TrackRecordV2 24,094 B (482 B margin), HardnessRegistry 23,471 B (1,105 B margin), the other five far below; exit 0. `CI=true npx tsx scripts/test-rls-lockdown-pg.mts` without `DATABASE_URL` → exit 1. All three pg suites and both anvil suites pass locally against the same service shape CI declares. |
| **BP-07** P2 | The MCP bounty tools decoded a hand-written 4-state enum (`PENDING_RESOLUTION`/`DISPUTED` surfaced as `STATUS_4/5` with no deadline) and `bobby_bounty_challenge` returned an unsigned tx with `value: 0x0` — `submitChallenge` requires `msg.value == bountyBond(id)`, so every challenge built by the tool reverted. | `gen:hardness-abi` now also generates `api/_lib/adversarial-bounties.abi.ts` **from the compiled artifact**; `protocol-payments` builds its interface from it. `BOUNTY_STATUS_NAMES` carries all six states. `readBounty` reads `bountyBond(id)`, and per state `resolutionFinalizeAfter`, `settlementAfter`, `disputedBy`, and reports `nextDeadline` (`submitChallenge` @ claim window, `resolveBounty` @ window+grace, `finalizeResolution` @ finalize-after, `resolveStalledDispute` @ settlement-after; null when terminal). `buildSubmitChallengeCalldata` is async and returns `value`/`valueWei`/`valueNative` = the bounty's **snapshotted** bond; `encodeSubmitChallenge` (pure) refuses a zero evidence hash. The MCP tool forwards the value and says what it is. | `test:bounties-abi-anvil` (real artifact on anvil, backend readers/builders unmodified): generated ABI equals the artifact; OPEN with bond + claim deadline; **reproduction:** value `0x0` reverts `Challenge bond required`; the built tx **mines as built**; a later `setChallengeBond` does not reprice bounty 1 while bounty 2 carries the new bond; `PENDING_RESOLUTION` (finalize-after), `DISPUTED` (settlement-after, `disputedBy`), `RESOLVED`, `WITHDRAWN` round-trip with their deadlines; list rows carry `bondWei` + named status; not-found and zero-evidence refused. |
| **BP-11** P2 | `reputation` chose v1/v2 selectors with `DEFAULT_CHAIN.id !== PROTOCOL_CHAIN_ID` — always false — so on Base it called `getWinRate`/`wins`/`losses`/`totalPnlBps`, which do not exist on V2; `safe()` turned every revert into **zero under `ok:true`**. The heartbeat had the same inverted test and the same zero-on-decode-failure. | `ChainConfig.trackRecordVersion: 'v1' \| 'v2'` declared per deployment (Base family `v2`, X Layer `v1`); `trackrecord-stats-adapter.trackRecordSelectors(chain)` is the **only** source of selectors (throws when the version is not declared); `reputation`, `protocol-heartbeat`, `protocol-record` and `bobby-protocol-stats` select through it. `reputation` probes each source; a source that cannot be read is `sources.<x> = 'unavailable'`, its numbers are **null**, `trustScore.score` is null unless every input was read, and `ok`/`degraded` say so. The heartbeat reports `sources`, nulls the unavailable performance fields, and marks `health.overall` degraded. The two pages that render these fields tolerate null. | `test:rpc-redaction`: on Base the reputation and heartbeat readers request the **V2 selectors only** (recorded per selector; `getWinRate` never requested) and report 60 % / 6 W / 4 L / +2.5 %; **reproduction:** an undecodable result (`0x`, what Base returns for the v1 selector) yields `sources.trackRecord = 'unavailable'`, `winRate = null`, `ok:false`, `degraded:true`, `trustScore.score = null` — not zeros. |
| **BP-12** P2 | `reputation` advertised `chain.rpc = PROTOCOL_RPC_URL` (the env override, which may carry a provider key), and the heartbeat / tx-history / stats / payments readers interpolated the endpoint URL into error strings that reach logs and the degraded response bodies. | `api/_lib/rpc-redact.ts`: `rpcEndpointLabel(url)` (`primary RPC` / `fallback RPC`), `scrubRpcSecrets(text)` (removes every configured URL and its host, userinfo, path and query, longest first) and `rpcErrorMessage(err)`. The readers label endpoints instead of naming them, scrub upstream JSON-RPC messages, and every catch that logs or returns a message goes through the scrubber; `reputation.chain.rpc` is `DEFAULT_CHAIN.publicRpcUrl`; `orchestrate`'s catch is scrubbed too. | `test:rpc-redaction` boots the four public readers with a sentinel URL (`https://rpc-user:SENTINEL-PASS@sentinel-host.example/v2/SENTINEL-PATH-KEY?apikey=SENTINEL-QUERY`, plus a sentinel fallback), captures every console line, and drives the connection-error and JSON-RPC-error (echoing the URL) paths: **no fragment** of either URL appears in any body or log; the upstream text is kept with the URL masked (`upstream rejected <rpc>`); `chain.rpc` is `https://mainnet.base.org`. |
| **BP-13** P2 | `orchestrate` returned the score-derived action as the decision (an agent whose policy said paper-only or proof-required still got `execute`; only a *stored* `advisory` mode downgraded it, so no-policy agents were auto-`execute`); `evaluatePolicy` received the **entry price** as the notional; the session was marked `proved` with no proof; the four LLM JSON blobs were trusted verbatim. | `prediction.quantity` / `prediction.notionalUsd` validated up front (either; both must agree within 1 %); without a size the harness analyses but returns **no executable advice**. `finalizeAction({ modelAction, policy, proofState, executable })` is the decision: blocked → `reject`; unsized → `publish_only` at most; paper result/mode → `paper_only` at most; reduction → `reduce_size` with `reducedNotionalUsd`; `requireOnchainProof` without **`proof_confirmed`** → `require_human_approval`; advisory mode → `require_human_approval`. Proof state is `analysis` / `proof_submitted` / `proof_confirmed` / `proof_failed` — a tx hash is a submission; only a mined receipt with status 1 (`confirmProof`, bounded wait) confirms. The session status is the proof state (or `failed`), never `proved`. Alpha/Red/CIO/Judge outputs are zod-validated (enums, 1–5 dimensions, 1–10 conviction, bounded strings); an out-of-schema answer aborts with **502** and a `failed` session. The high-risk gate uses the validated notional; `createProof` records `DEFAULT_CHAIN.id`; the GET metadata names the Base registry. | `test:remediation-r2` (**45/45**, 8 new): score 100 + no size → `publish_only`, `analysis` session; default policy + size → `require_human_approval` (proof required, state `analysis`); **reproduction:** BTC at 83,000 × 0.001 = $83 under a $1,000 cap in auto mode → `execute` (the old code compared 83,000 to the cap); over-cap → `reduce_size` with the reduced notional; paper mode → `paper_only`; blocked symbol → `reject`; CIO `recommendation: "yolo"` and Judge `novelty: 9` → 502 + `failed`; inconsistent quantity/notional → 400; low score → `reject`; the `finalizeAction` precedence table incl. *submitted ≠ confirmed*. |

**Verification record (2026-09-05, `58cd10e`).** Foundry: full suite **283/283** across 14
suites (269 + the 14 new gate tests), `--fuzz-runs 1000`; `check-sizes.sh` 7/7 within EIP-170;
`check-layout.sh` OK.
Node: `test:remediation-r2` 45/45; `test:rpc-redaction` 12/12; `test:bounties-abi-anvil` and
`test:hardness-abi-anvil` pass; `test:rls-lockdown-pg`, `test:swap-ledger-pg`,
`test:agent-registry-pg` pass on Postgres 17; `test:api-security` 47/47; `test:base-swap`,
`test:stock-ticker-routing`, `test:protocol-write-safety` pass; `check:api`, `eslint --quiet`
and the production build are green. Production contract source is **unchanged** by this round
(only `script/` and `test/`): `HardnessRegistry` runtime hash and size are as recorded above.
No deploy, migration, flag change, Safe transaction or upload was performed.

**Client-contract changes.** `bobby_bounty_challenge` now returns `value` (the bounty's bond) —
send it. `/api/reputation` and `/api/protocol-heartbeat` may answer `ok:false` with `sources`
and null numbers. `POST /api/orchestrate` accepts `prediction.quantity` / `notionalUsd`; its
`decision` is policy-derived and it answers 502 when a model output fails validation. Mainnet
readiness requires the seven `V2_*` values. See the runbook.

## For the next independent round

Pin the `HardnessRegistry` runtime hash above before reviewing. Treat any different
hash as a reset. BP-03 and BP-06 are closed in round 12c: re-derive the full-width
validation, the manifest/live parity and the CI job graph yourself, and run every
closure command listed there rather than trusting the table. Recheck the deploy
manifest/configuration/runbook, full suite, production sizes, ABI equality (both
generated modules), and deployment gates. If the runtime is unchanged and the round
is clean, record GO 3/3. All fourteen findings of the 2026-09-04 expanded audit now
carry closure evidence; an independent pass over BP-01..BP-14 is the remaining gate
before release. Predeploy must move from NO-GO to 0 before any broadcast.

The earlier round-7 review instructions remain useful context:

First reproduce the round-7 service-payment and timestamp failures on `44a2d51`,
then confirm both refusals on the new commit. Exercise partial slash, full slash,
re-registration, service deactivation/reactivation, withdrawal ordering, and the
largest accepted time delay. Recheck runtime size from a clean build.

Everything below is on `security/remediation-r2`. The dispute economics are new
code: hunt for a bond that can be double-credited (settle vs timeout vs
withdrawBounty on the same bounty), a challenger list that can be made to exceed
the loop's gas at `maxChallenges`, an owner dispute that leaves a party's bond
stranded, and whether `disputeSettlementTimeout` can be set so short by the owner
that a legitimate dispute times out before the Safe meets.

Everything below is on `security/remediation-r2`. Reproduce the round-2 exploits on
`8b9af14` (they still work there) and confirm the refusals here. Then hunt in the
dispute window: can a proposal be finalized during a dispute; can the poster dispute
a proposal that names themself; does `settleDispute(id, 0)` on a bounty whose poster
is a contract that reverts on receive lock the pot (pull-payment says no — verify);
does `_effectiveExpiry` interact badly with `PENDING_RESOLUTION` (poster reclaim is
blocked, which is intended — confirm it cannot be un-blocked by a status trick).

Reproduce first, on `e20d2b8`, with the tests as they stand here — the pg test and
the regression contract test are written so the *pre-fix* state is exercised
explicitly (the pg suite rebuilds the shipped policies and proves the read works
before applying 0010). Then confirm the refusal on this branch. Then hunt: the
view column lists, the direction inference in `_derivePnlBps` (a commit with
`target == entry` and `stop != entry`; extreme `exit/entry` ratios near the `int32`
clamp), the `scope=eq.public` pins (is any forum_threads read on a public path still
unpinned?), and whether the retired identity-link leaves any dangling client call.
