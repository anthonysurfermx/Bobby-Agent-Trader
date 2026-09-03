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

- `forge test` — 14 suites, **248 passed, 0 failed** (2a: 228; 2b: 236; 3b: 243; 4 adds farming, timeout-stands, snapshots, cap, revoked-vote cases)
- `test:remediation-r2` — 23/23 (2a: 15; 2b: 20; 3b: 22)
- `test:hardness-abi-anvil` — pass (generated ABI equals the artifact; bytecode-backed decode of every backend getter)
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

## For the final round

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
