# Final independent security audit — Codex

Date: 2026-09-03  
Audited commit: `e20d2b8`  
Audit branch: `codex/final-audit-2026-09-03`  
Production targets: `https://bobbyprotocol.xyz`, Bobby Supabase, Base mainnet (8453)  
Production actions: read-only. No database writes, transactions, deployments, migrations, or feature-flag changes were made.

## Verdict

**NO-GO for enabling real-money Base stock swaps or presenting the deployed protocol as production-ready.**

The swap execution and receipt path passed its local, live-read, and Base-fork tests, but three independent P0 issues remain open: identity pairing secrets are readable by `anon`, the trade ledger is readable by `anon`, and a registered HardnessRegistry agent can manufacture a perfect record. The first two policies are confirmed in the live Bobby database. The third is reproduced against the exact deployed bytecode. In addition, the mandatory live deployment verifier fails because TrackRecordV2 uses the old Pyth address as `activePyth`, multiple public APIs bypass private-thread RLS, and the UI can sign stale swap calldata after the visible amount changes.

Keep `BASE_STOCK_SWAPS_ENABLED` off. Do not accept or advertise funds in HardnessRegistry registration or AdversarialBounties until the contract findings are remediated or those features are explicitly disabled.

## Executive result

| ID | Severity | Result | Production exposure |
|---|---|---|---|
| P0-1 | P0 | Confirmed live | `api_cache_anon_read` exposes every unexpired cache row, including identity-link codes and wallet sign-in challenges when present |
| P0-2 | P0 | Confirmed live | `agent_trades_public_read` grants `anon` and `authenticated` unrestricted SELECT |
| P0-3 | P0 | Reproduced | An agent self-resolves a WIN with `exitPrice = 1` and receives a 100% record |
| P1-1 | P1 | Confirmed | Swap amount edits do not invalidate previously built calldata |
| P1-2 | P1 | Confirmed | Confirmation labels are not decoded from calldata |
| P1-3 | P1 | Confirmed | Judge Mode is unauthenticated and reads/updates private threads with service role |
| P1-4 | P1 | Confirmed on iOS branch | Identity linking lacks an explicit destructive confirmation and unlink/recovery path |
| P1-5 | P1 | Confirmed live config | Effective CSP protects framing/forms only; script/connect policy remains report-only and broad |
| P1-6 | P1 | Reproduced | Resolver can challenge, award to itself, withdraw, and permanently defeat poster reclaim |
| P1-7 | P1 | Confirmed | Agent registration stake has no user withdrawal path |
| P1-8 | P1 | Confirmed on iOS branch | Privacy manifest declares no collected data despite account/progress collection |
| C-01 | P1 | New, confirmed live | Public API family reads private `forum_threads` through service role; `harness-events` is an additional leak path |
| C-02 | P1 | New, confirmed live | Mandatory Base deployment verifier fails: TrackRecordV2 active Pyth does not match the canonical active address |
| C-03 | P1 | New, confirmed live | Raw PostgREST filter injection bypasses the public `harness-memory` result limit |
| C-04 | P2 | New, confirmed statically | Identity merge does not re-parent swap receipts; deleting the merged identity nulls their `identity_id` |
| C-05 | P2 | New, confirmed statically | Identity-link code consumption is a non-atomic read then delete |

At the time sampled, neither deployed HardnessRegistry nor AdversarialBounties held ETH. No active `identity-link:*` or `ws-nonce:*` row existed during the sample, so P0-1 was not used to claim an account. The vulnerable policy and deployed writer are nevertheless both live. One active retired `premium-signal:*` cache row was also anonymously readable, demonstrating that the exposure is not theoretical.

## P0 findings

### P0-1 — credential material stored in an anon-readable cache

The exact-schema migration grants anonymous SELECT on every unexpired cache row:

```sql
CREATE POLICY api_cache_anon_read ON public.api_cache
FOR SELECT TO authenticated, anon USING ((expires_at > now()));
```

`api/identity-link.ts` writes `identity-link:<six-character-code>` with the identity UUID and authentication route in the payload. `api/_lib/wallet-session.ts` writes `ws-nonce:<nonce>` with the wallet, domain, URI, chain, issuance time, and expiration time. The public frontend provides the anon credential required to query PostgREST, as is normal for Supabase; RLS is therefore the security boundary, and this policy removes it.

Live checks against `qbvdqkknnuweatptjohi.supabase.co` returned HTTP 200 for anonymous cache queries. The sampled credential prefixes were empty, but other active cache payloads were returned. `/api/identity-link` is deployed and rejected an unauthenticated claim with 401, meaning an attacker still needs any authenticated Bobby identity; that is a low-friction prerequisite, not a mitigation.

Impact: the first authenticated observer that polls and sees a pairing code can claim the issuing identity before the intended device. A wallet nonce does not by itself forge a signature, but it leaks the full live challenge and creates avoidable account-correlation and phishing surface.

Required fix:

1. Revoke `anon` and `authenticated` access to `api_cache` immediately.
2. Move credentials and rate-limit state to service-only tables. If public cache data is required, expose a projection/allow-list view that cannot contain credential or limiter prefixes.
3. Replace the identity-link read/delete sequence with one service-only `DELETE ... RETURNING` RPC, equivalent to the wallet nonce consumer.
4. Rotate/cancel all outstanding identity codes after the policy change and add a regression probe that queries with the public anon key.

### P0-2 — the authoritative trade ledger is anonymously readable

The live RLS matrix and migration both show:

```sql
CREATE POLICY agent_trades_public_read ON public.agent_trades
FOR SELECT TO authenticated, anon USING (true);
```

The table includes `user_id`, `owner_address`, transaction hashes, position sizing, prices, outcomes, reasoning, intent hashes, and signatures. The live anonymous request returned HTTP 200 (zero rows at sample time), which proves the authorization path. Empty-at-sample is not a security control.

Required fix: remove the policy. If public performance is a product requirement, publish an explicitly maintained view that excludes user/wallet identifiers, signatures, intent/idempotency material, private-cycle references, and row-level execution detail. Test both a populated canary row and all table/view grants with anon and authenticated JWTs.

### P0-3 — HardnessRegistry agents can forge their own reputation

`registerAgent` accepts the stake and marks the sender registered. `resolvePrediction` then explicitly permits `msg.sender == prediction.agent`; it validates only the claimed PnL sign and that `exitPrice != 0`. It does not derive result or PnL from `entryPrice`, `targetPrice`, `stopPrice`, or an oracle.

`contracts/test/FinalAuditPoC.t.sol` proves the complete exploit:

1. Attacker registers an agent.
2. Attacker commits BTC at `100e8`, target `110e8`, stop `90e8`.
3. After `minPredictionAge`, attacker calls `resolvePrediction(hash, 1, WIN, 1)`.
4. The registry stores `exitPrice = 1`, `wins = 1`, `losses = 0`, `winRateBps = 10000`.

The test passed against the same normalized runtime bytecode deployed at `0x15800F40b8988765AD3F46030B73bC8109A793f5`. Repository/API search found no production resolver that independently corrects this record.

Required fix: do not let the subject resolve its own prediction. Resolution must come from an independent quorum or verifiable oracle evidence, and stored PnL/result must be derived from the committed direction and verified prices. Since this code is already deployed and non-upgradeable, deploy a corrected registry and stop treating the current registry as a reputation source.

## P1 findings

### P1-1 — visible amount can diverge from signed swap calldata

In `SwapExecutor.tsx`, changing the amount only calls `setAmount`; token, slippage, and acknowledgment changes call `reset`. A previously quoted `quote.tx` therefore remains available while the button changes to `Swap {amount}`. `executeSwap` sends the old transaction object.

Reproduction sequence:

1. Quote an amount that needs no approval or complete approval/re-quote.
2. Edit the amount field.
3. Observe that the output/minimum/transaction remain from the old quote while the action label uses the new amount.
4. Click Swap; the wallet receives the stale calldata.

Required fix: invalidate quote/execution state on every amount change, or bind an immutable quote fingerprint `(wallet, chain, tokenIn, tokenOut, amountIn, minOut, calldataHash, deadline)` to both the display and action. Re-decode calldata immediately before `sendTransaction` and refuse any mismatch.

### P1-2 — confirmation disclosures are not a calldata verification boundary

`src/components/adams/SwapConfirm.tsx` displays router, token, spender, amount, minimum, route, and deadline primarily from `disclosure`, `execution`, or preview objects. It does not decode the exact `approve` and `exactInput*` calldata that will be sent and compare every displayed field with it.

Required fix: decode calldata client-side immediately before signing; verify selector, recipient, path/tokens/fees, exact input, minimum output, deadline, approval token, spender, approval amount, router, and chain. Derive the final labels from decoded bytes.

### P1-3 and C-01 — service-role reads bypass private-thread RLS

`api/judge-mode.ts` has no user/internal authentication. It fetches either any requested thread UUID or the newest thread with `select=*`, fetches its posts with service role, submits the content to OpenAI, and updates `debate_quality`. A caller who knows a private thread UUID can therefore make the server disclose/process it; a caller without an ID can target the latest private thread.

The problem is systemic. The following public readers use a service/read key and omit `scope=eq.public` on at least one `forum_threads` query:

- `judge-mode` — complete thread and posts, plus a write;
- `checkpoint` — latest trading parameters and trigger reason;
- `harness-events` fallback — thread ID, trading parameters, reason, PnL, and quality;
- `ghost-wallet` — resolved private trading parameters and PnL;
- `bobby-signals` — private `trigger_data` technical cache;
- `mcp-http` `bobby_brief` / `bobby_recommend` — private pending trade parameters;
- `bobby-intel` and `bobby-protocol-stats` — aggregate private rows into public calibration/statistics.

The additional path requested by the brief is confirmed: production `/api/harness-events` returned a 50-row reconstructed feed from the unscoped fallback.

Required fix: public endpoints must use the anon key and query only RLS-approved public rows. Add `scope=eq.public` as defense in depth. Judge Mode must require ownership for private threads or internal authorization for system threads, and must not select “latest” across scopes. Add seeded private/public fixtures to endpoint tests.

### P1-4 — identity linking is destructive without recovery UX

The merge deletes the source land and identity and re-parents ledgers/inventory. The iOS implementation at `origin/ios/apple-login` has pairing but no explicit summary of what will be kept/deleted, no strong confirmation step, and no unlink/recovery operation.

Required fix: show both identities, the direction of the merge, and the exact destructive effects; require explicit confirmation on both sides or a signed, short-lived two-party grant. Add a time-bounded recovery/unlink workflow before deletion becomes permanent.

### P1-5 — CSP does not constrain the main script/network attack surface

The enforced policy is only `frame-ancestors`, `base-uri`, `object-src`, and `form-action`. The substantive `default-src`, `script-src`, `connect-src`, `frame-src`, and `worker-src` rules are report-only. `script-src` allows `unsafe-inline`; `connect-src` allows all HTTPS and WSS destinations; no report endpoint is configured.

Required fix: collect reports, narrow hosts, remove `unsafe-inline` through nonces/hashes, then promote the tested policy to enforcing. This is especially important on a page that builds wallet calldata.

### P1-6 — bounty resolver may be contestant and beneficiary

`submitChallenge` rejects only the poster. `resolveBounty` authorizes the resolver/owner and accepts any address present in `hasChallenged`, including the resolver itself.

The PoC test posts 0.1 ETH, has the resolver submit evidence, resolves to itself, withdraws the full reward, then proves the poster's later `withdrawBounty` reverts `Already finalized`.

Required fix: prohibit resolver/owner from challenging or winning, and use an independent quorum with conflict-of-interest rules. The deployed non-upgradeable contract should not receive user bounties before replacement.

### P1-7 — registration stake is one-way

`registerAgent` credits `AgentProfile.stake`; no function lets the agent unregister or withdraw it. `withdraw()` only pays `pendingWithdrawals`, and only owner/hardness scorer can reduce stake through `slashAgent`, crediting the owner.

Required fix: document it as a non-refundable fee or implement a delayed unregister/withdraw flow with a slash/challenge window. Do not call it a stake while presenting no exit path.

### P1-8 — iOS privacy manifest conflicts with behavior

At `origin/ios/apple-login` commit `32648b6`, `PrivacyInfo.xcprivacy` declares an empty `NSPrivacyCollectedDataTypes` array while the app supports Sign in with Apple and synchronizes identity/progress/account information with the server.

Required fix: have counsel/product map each collected field to Apple's privacy categories/purposes and update both the manifest and App Store privacy answers before submission.

### C-02 — deployed TrackRecordV2 fails the repository's own live gate

All seven deployed contracts have runtime bytecode identical to the local build after masking compiler-declared immutable slots. All seven are owned by the expected Safe, all `pendingOwner` values are zero, and the Safe is the pinned 2-of-3 with no module or guard.

However, `VerifyBaseDeployment.s.sol` stops at:

```text
VERIFY FAILED: trackRecord.activePyth == canonical active
```

Live state:

- `activePyth = 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` (current/old address)
- canonical active in `PythOracleGate` = `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5` (upgraded address)
- both addresses are approved.

Required fix: the Safe should call `activatePyth(0xbC16...72F5)` after an operator independently re-verifies the official Pyth Base address, then re-run `VerifyBaseDeployment` to completion. This is an on-chain administrative action and was not executed by this audit.

### C-03 — PostgREST query injection bypasses handler limits

`api/harness-memory.ts` concatenates `kind`, `symbol`, and `outcome` directly into a PostgREST query. `api/harness-events.ts` does the same for `type`. Production proof:

```text
GET /api/harness-memory?kind=episode%26select%3Did%26limit%3D1
HTTP 200; one memory returned with only the injected `id` projection
```

This proves that a caller can add PostgREST operators and replace the handler's intended limit. Because the endpoint has no public rate limiter, a large injected limit can amplify database and response load.

Required fix: validate enums/character sets, use `URLSearchParams`, encode every value, clamp the lower bound as well as upper bound, and apply a persistent public rate limit. Audit all other hand-built PostgREST URLs.

## P2 findings

### C-04 — identity merge orphans receipt ownership metadata

`bobby_link_identities` re-parents progress events, inventory, and pre-calls, then deletes `p_merge`. The later `bobby_swap_receipts` migration references identities with `ON DELETE SET NULL`, but the merge function was not extended to update those rows first. A receipt owned by the merged identity therefore loses `identity_id`.

Wallet-based fallback currently makes most swap history still discoverable, but the authoritative identity relation and audit trail are degraded.

Required fix: update swap receipts to `p_keep` inside the same merge transaction before deleting `p_merge`; add a migration-order regression test that enumerates every foreign key referencing `bobby_identities` and asserts an explicit merge behavior.

### C-05 — code consumption is not atomic

Identity claim reads a cache row, performs a separate DELETE whose result is ignored, and then calls the merge RPC. Concurrent claimers can both read a valid code. Database constraints will often make one merge fail, but “single use” is not guaranteed at the authorization boundary and failure modes depend on race order.

Required fix: atomically consume with service-only `DELETE ... WHERE ... RETURNING payload`, fail if no row is returned, then merge.

## RLS and identifier audit

The live `bobby_rls_matrix()` response confirms anon/authenticated SELECT policies on:

- `agent_cycles`, `agent_events`, `agent_positions`, `agent_signals`, and `agent_trades` with `USING (true)`;
- `api_cache` for all unexpired rows;
- `forum_threads` only when `scope = 'public'` and `forum_posts` only through a public parent;
- `hardness_agent_proofs` and `indicator_cache` with `USING (true)`;
- active `tl_items`.

Several of those schemas contain stable identifiers or transaction correlations: `agent_cycles` has `user_id` and `owner_address`; `agent_trades` has both plus hashes and signatures; `agent_events` has run/thread/payment/trade IDs; `hardness_agent_proofs` contains session and transaction hashes. Sampled cycle/public-thread owner fields were null, but anonymous access is unrestricted and future writers can populate them.

Recommendation: replace blanket table reads with public views that contain only the fields intentionally displayed. Add a CI assertion that rejects any anon/authenticated policy with `USING (true)` on a table containing user, wallet, email, identity, signature, token, nonce, secret, intent, or payment identifiers.

## Authorization audit of client-supplied identifiers

The current critical mutation paths generally bind client fields correctly:

- Base swap and receipt endpoints bind `wallet` to a proved wallet session.
- Agent setup verifies a signature over the supplied wallet and profile payload.
- User-cycle accepts profile/wallet identifiers only behind internal authorization.
- Agent-confirm is internal-only.
- My Threads and Trader Land derive identity/wallet from the authenticated session.

Two lower-level trust issues remain:

- public feedback accepts an arbitrary `wallet_address`/email and uses it as the notification “From”; treat these fields as unverified claims in UI/logs;
- public forum-agent registration permits an ownerless agent. A supplied owner is signature-verified, but downstream UI must distinguish unowned from wallet-verified agents.

## Country-header check

The code reads `x-vercel-ip-country` only after wallet-session authorization and fails closed for missing, US, and non-allow-listed countries. The live smoke confirms the quote engine refuses US, unknown, and AR and accepts only the coded allow-list path. Vercel documents `x-vercel-ip-country` as a platform request header derived from the requester's IP: <https://vercel.com/docs/headers/request-headers>.

An end-to-end spoof verdict is **inconclusive** in this audit: no valid production wallet session was available, and creating one would write a live nonce, which the read-only rules prohibit. Unauthenticated spoofed requests are rejected before country evaluation. Before launch, add a temporary authenticated canary endpoint or preview deployment that returns only the normalized country and verify that client-supplied `x-vercel-ip-country` is overwritten at the platform edge. Do not trust this header when the function is reachable through any non-Vercel origin or proxy.

## Live Base deployment matrix

| Contract | Address | Runtime vs local | Owner | Pending owner |
|---|---|---|---|---|
| BobbyTrackRecordV2 | `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321` | exact after immutable masking | expected Safe | zero |
| BobbyConvictionOracle | `0x27f51D711171c830dd796D4B03914a8C6c46D75e` | exact | expected Safe | zero |
| BobbyAgentEconomyV2 | `0x009de59e0e7f4109fF9E89E744A4412082AD2aaF` | exact after immutable masking | expected Safe | zero |
| BobbyAdversarialBounties | `0x73fD6c77ff0403Ea071e8721c76f88cE34ac9968` | exact after immutable masking | expected Safe | zero |
| HardnessRegistry | `0x15800F40b8988765AD3F46030B73bC8109A793f5` | exact after immutable masking | expected Safe | zero |
| BobbyAgentRegistry | `0xB3137D7afE26fbdBcAA95573C7A20be896efde93` | exact | expected Safe | zero |
| BobbyIntentEscrow | `0x5D9d534419421B7Edfe9Bb509E4c48512256BC97` | exact after immutable masking | expected Safe | zero |

Expected Safe: `0x8BE60853F27b944e11486285d95c3e06596553b4`; threshold 2; owners 3; pinned singleton/codehash matched; no modules or guard.  
HardnessRegistry balance: `0 ETH`.  
AdversarialBounties balance: `0 ETH`.

Bytecode comparison used each Foundry artifact's `deployedBytecode.object` and masked only offsets listed in that artifact's `immutableReferences` before exact comparison with `eth_getCode`. Byte lengths also matched for all seven contracts.

## Verification record

Passed:

- `npm run build` (includes API TypeScript check and production Vite build)
- `npm run test:base-swap`
- `npm run test:api-security` — 47/47
- `npm run test:protocol-write-safety`
- `npm run test:risk-gate` — 42/42
- `npm run smoke:base-swap` — live Base venue, quotes, stock gates, intent binding, kill-switch semantics
- `npm run e2e:base-swap` against an ephemeral Base mainnet Anvil fork — approve, swap, on-chain receipt verification, idempotency/conflict, FIFO, out-of-order confirmation, repair, and negative cases
- `forge test --match-contract FinalAuditPoCTest -vvv` — 2/2 exploit reproductions
- `forge test` — 223/223 tests, including invariant suites

Failed as designed and must be remediated:

- `MANIFEST_PATH=deployments/8453.json forge script script/VerifyBaseDeployment.s.sol --rpc-url https://mainnet.base.org -vvv` — fails at canonical `activePyth` assertion after passing Safe, code-presence, and ownership checks.

Not executed:

- no live identity-link E2E probe, because it creates/deletes live identities and events;
- no authenticated live country spoof probe, because obtaining a session creates a live nonce;
- no production mutation, migration, Safe transaction, Vercel deploy, or feature-flag flip.

## Required closure order

1. Emergency RLS migration: remove anon/authenticated access to `api_cache` and `agent_trades`; introduce narrow public views where needed.
2. Add atomic identity-code consume and repair identity merge coverage, including swap receipts.
3. Remove private-thread service-role leakage from every public API; protect Judge Mode.
4. Fix stale calldata and add mandatory decode-before-sign verification.
5. Replace/deprecate HardnessRegistry and AdversarialBounties; do not fund the current deployments.
6. Have the Safe activate the canonical upgraded Pyth after independent address verification; run the full live verifier until it passes.
7. Add a real registration-stake exit or rename/document the payment as non-refundable.
8. Enforce a narrow CSP and correct the iOS privacy manifest/linking UX.
9. Re-run all gates, populated live RLS probes, bytecode/state verification, and independent review.
10. Only then consider setting `PROTOCOL_CHAIN=base` and flipping `BASE_STOCK_SWAPS_ENABLED=true` through the approved production runbook.

Until all P0s and the live verifier failure are closed, the launch verdict remains **NO-GO**.
