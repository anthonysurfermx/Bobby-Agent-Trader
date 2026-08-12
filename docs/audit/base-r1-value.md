# Base Migration — Round 1 Audit: Value-Custody Contracts

**Scope:** `contracts/src/BobbyAgentEconomy.sol`, `BobbyAgentEconomyV2.sol`, `BobbyAdversarialBounties.sol`, `BobbyIntentEscrow.sol`
**Branch:** `feat/base-migration` · **Compiler:** solc 0.8.24 (pragmas: `^0.8.19` ×3, `^0.8.24` ×1) · **Deps:** none (no OpenZeppelin)
**Lens:** money — reentrancy, accounting drift, locked funds, access control, DoS, CEI, native-token/decimal assumptions
**Method:** full read of all four contracts; `forge build` clean; `forge test` → **117 passed / 0 failed** across 4 suites.
**Read-only.** No deploys, no broadcasts, no `.sol` modified.

## Headline

**No Critical findings.** I could not construct a direct fund-drain against any of the four contracts. `BobbyAdversarialBounties` — the only contract that holds third-party value for a meaningful window — uses a correct pull-payment pattern and a terminal status machine that I could not double-spend. `BobbyIntentEscrow` custodies **zero** value (it is non-payable with no `receive`/`fallback`), so despite its name it is an attestation registry, not an escrow, and most of the money-lens attack surface simply does not exist there.

The two things that should actually block a Base cutover are (1) an owner-pause path in the bounty contract that lets a legitimate challenger's reward be reclaimed by the poster, and (2) the entire fee schedule being denominated in `ether` literals that were sized for OKB and become ~3–4 orders of magnitude more expensive as ETH.

---

## Findings

| # | Sev | Title | Location |
|---|-----|-------|----------|
| H-1 | High | Pause blocks resolution but not reclaim — challenger's reward returns to poster | `BobbyAdversarialBounties.sol:255-279` / `288-302` |
| H-2 | High | Every fee/floor is an OKB-sized `ether` literal; ~6000× real-value inflation on Base | `BobbyAgentEconomy.sol:64-66`, `V2:42-43`, `Bounties:58,61` |
| M-1 | Medium | `sizeUsd` risk bound is 18-decimal-scaled; silently unenforceable if USDC (6dp) becomes the unit | `BobbyIntentEscrow.sol:79-80,305` |
| M-2 | Medium | Push payment to two immutable recipients can brick `payDebateFee` permanently | `BobbyAgentEconomy.sol:97-102`, `V2:113-117` |
| M-3 | Medium | V1 `payDebateFee` is permissionless — anyone can forge the on-chain debate track record | `BobbyAgentEconomy.sol:93` |
| M-4 | Medium | `challengeGracePeriod` has no lower bound; owner can set 0 and squeeze the resolver out | `BobbyAdversarialBounties.sol:369-372` |
| M-5 | Medium | Single-key resolver, no bond, no dispute, no timelock on `setResolver` | `BobbyAdversarialBounties.sol:255,355-359` |
| L-1 | Low | Force-sent ETH is permanently locked (no sweep, `receive` reverts) | `BobbyAdversarialBounties.sol:408-410` |
| L-2 | Low | V1 CEI violation: two external calls before all state writes in `payDebateFee` | `BobbyAgentEconomy.sol:97-120` |
| L-3 | Low | V1 `agentStats[cio].totalEarned` credits funds the CIO can never claim | `BobbyAgentEconomy.sol:136,154` vs `200-206` |
| L-4 | Low | V1 `totalVolume += msg.value` counts overpayment as protocol volume | `BobbyAgentEconomy.sol:140,157` |
| L-5 | Low | `BobbyAgentEconomy` (V1) has **zero** test coverage | `contracts/test/` |
| I-1 | Info | V2 `getEconomyStats()` returns a fabricated payment count | `BobbyAgentEconomyV2.sol:152` |
| I-2 | Info | `overrideResolution` is repeatable within the window; last write wins | `BobbyIntentEscrow.sol:358-368` |
| I-3 | Info | `entryRef` has no bound and no documented scale | `BobbyIntentEscrow.sol:281` |
| I-4 | Info | All NatSpec still says "OKB" / "X Layer (Chain 196)" | all four files |

---

### H-1 · Pause blocks resolution but not reclaim — challenger's reward returns to poster

`BobbyAdversarialBounties.sol:255-279` (`resolveBounty`, `whenNotPaused`) vs `288-302` (`withdrawBounty`, deliberately *not* `whenNotPaused`).

The comment on `withdrawBounty` correctly reasons that pausing must never trap user funds. But the asymmetry it creates is exploitable in the other direction: pausing *does* freeze the only path that pays the challenger, while the clock that entitles the poster to reclaim keeps running.

**Concrete scenario**
1. Poster P posts a 5 ETH bounty with a 1-hour claim window (`defaultClaimWindow` may also be lowered to 1 hour via `setDefaultClaimWindow`). `gracePeriodSnapshot = 3 days`.
2. Challenger C submits winning evidence at `t+30m`. Status → `CHALLENGED`. `_effectiveExpiry = t + 1h + 3d`.
3. Owner calls `pause()` at `t+31m`. `resolveBounty` now reverts `"Paused"` for both resolver and owner.
4. Owner leaves the contract paused past `t + 1h + 3d`.
5. P calls `withdrawBounty` — not gated by `paused`, status is still `CHALLENGED`, `block.timestamp >= _effectiveExpiry` → the full 5 ETH is credited to `pendingWithdrawals[P]`.
6. P calls `withdraw()` — also not gated by `paused` (correctly). P is made whole; C, who did the work and won, gets nothing.

This requires no key compromise if P and the owner are the same party or collude, and it is available to a compromised owner key against any bounty. The `unpause()` requirement is the only friction and it is entirely under the attacker's control.

**Fix (pick one):**
- Remove `whenNotPaused` from `resolveBounty`, mirroring the reasoning already applied to `withdrawBounty` — pause should stop *new* value entering (`postBounty`, `submitChallenge`), never stop settlement of value already in.
- Or track cumulative paused duration and add it to `_effectiveExpiry` so the poster's reclaim clock does not advance while resolution is impossible.

The first is simpler and matches the contract's stated design intent.

---

### H-2 · OKB-sized `ether` literals become ~6000× more valuable on Base

Every fee and floor in these contracts is a `X ether` literal, sized when the native token was OKB. `ether` is a pure unit alias for `1e18` wei — the literal does not change, but what it *buys* does.

| Constant | Location | Intended (OKB) | After cutover (ETH) |
|---|---|---|---|
| `mcpCallFee = 0.001 ether` | `V2:42`, `V1:65` | fractions of a cent per MCP call | a multi-dollar toll per call |
| `debateFeePerAgent = 0.0001 ether` | `V2:43`, `V1:64` | dust | meaningful per-debate cost, ×2 per cycle |
| `signalAccessFee = 0.0005 ether` | `V1:66` | dust | meaningful per oracle read |
| `minBounty = 0.001 ether` | `Bounties:61` | dust spam floor | prices out small bounties entirely |
| `ABSOLUTE_MIN_BOUNTY = 0.0001 ether` | `Bounties:58` | anti-DoS floor | a hard floor the owner cannot go below, now non-trivial |

**Concrete failure:** the backend's per-call MCP billing, which today costs a caller a fraction of a cent, starts charging a multi-dollar fee on the very first Base transaction — with no code change and no error. The first external agent to integrate against the deployed defaults overpays by three-plus orders of magnitude. `ABSOLUTE_MIN_BOUNTY` is a `constant` and cannot be lowered post-deploy at all.

**Fix:**
- Re-derive all five values against ETH before deploying; do not carry the literals across.
- Set the three mutable fees in the same transaction as deployment (`updateFees` / `setMinBounty`) so no window exists where the stale defaults are live.
- `ABSOLUTE_MIN_BOUNTY` is `constant` — it must be edited in source, not patched after deploy.
- Strongly consider making fees denominated against a price feed or, better, moving the fee rail to USDC (see the migration section for what that changes).

---

### M-1 · `sizeUsd` bound is 18-decimal-scaled; unenforceable if USDC becomes the unit

`BobbyIntentEscrow.sol:79-80` — `MAX_SIZE_USD_CEILING = 100_000_000e18`, `maxSizeUsd` bounded by it; enforced at `:305`.

`sizeUsd` is a USD notional with no on-chain decimal declaration; the ceiling's `e18` is the only place the intended scale is recorded, and it is a comment-free literal. On Base the canonical stablecoin is USDC with **6** decimals. If any off-chain component (signer, keeper, dashboard) starts denominating `sizeUsd` in USDC base units — an entirely natural thing to do once USDC is the settlement asset — then a $100,000,000 intent encodes as `1e14`, which passes `intent.sizeUsd > maxSizeUsd` by a factor of 10^12.

**Concrete failure:** owner sets `maxSizeUsd = 1_000_000e18` intending a $1M cap. A signer switches to 6-decimal encoding. An intent for `sizeUsd = 5_000_000_000_000` (= $5M in USDC units) sails through the bound check. The contract's only trade-size guard is now decorative, and the sole remaining limit is whatever the off-chain executor happens to enforce.

This does not lose funds directly — the contract holds none — but it silently disables the risk gate that the whole R2-004 fix exists to provide.

**Fix:** declare the scale explicitly (`uint8 public constant SIZE_USD_DECIMALS = 18;`), name the constant `MAX_SIZE_USD_CEILING_1E18`, and add an assertion or a documented invariant in the signer library. Better: encode `sizeUsd` in the same decimals as the settlement token and derive the ceiling from `token.decimals()` at construction.

---

### M-2 · Push payment to immutable recipients can brick `payDebateFee` permanently

`BobbyAgentEconomy.sol:97-102`, `BobbyAgentEconomyV2.sol:113-117`.

Both contracts push OKB/ETH to `alphaHunter` and `redTeam` with `require(success)`. Both addresses are `immutable`.

**Concrete failure:** `alphaHunter` is (or is later replaced by, at the same address via a proxy/CREATE2 redeploy) a contract whose `receive()` reverts — a Safe with a reverting fallback module, a paused wallet, a contract that self-destructs and is redeployed as non-payable. Every subsequent `payDebateFee` reverts at `"Alpha payment failed"`. There is no setter for either address and no alternative debate-fee path. The function is dead for the life of the deployment; the only remedy is a full redeploy plus reindex.

Gas is not the issue here (`.call` forwards all gas, not 2300), so a plain EOA recipient is safe. The exposure is specifically contract recipients.

**Fix:** mirror the pattern the bounty contract already gets right — credit `pendingWithdrawals[alphaHunter] += fee` and let the agents pull. This also removes the two external calls that cause L-2.

---

### M-3 · V1 `payDebateFee` is permissionless — the debate track record can be forged

`BobbyAgentEconomy.sol:93`. V2 fixed this (`onlyCioOrOwner`, `V2:110`); V1 did not, and V1 is the contract with `agentStats` and the `payments` array that the dashboard reads.

**Concrete failure:** anyone calls `payDebateFee(bytes32(uint256(n)))` in a loop with `msg.value = 2 * debateFeePerAgent`. Each call increments `totalDebates`, bumps `debatesParticipated` for all three agents, adds `2 * fee` to `totalVolume`, and pushes two `PaymentRecord`s. At the V1 default the attacker's *net* cost is only gas — the fee itself is forwarded straight to Bobby's own agent wallets, so the attacker is effectively paying Bobby to let them fabricate history. A few thousand transactions produce an on-chain "debate record" indistinguishable from genuine cycles for any indexer that trusts `DebateFee` events or `getEconomyStats()`.

Given the product's central claim is a *provable* track record, forgeable history is a product-integrity failure, not just a metrics nit.

**Fix:** do not deploy V1 to Base. If V1 must be redeployed for compatibility, port V2's `onlyCioOrOwner` modifier. Indexers should filter `DebateFee` events by `payer == cio` regardless.

---

### M-4 · `challengeGracePeriod` has no lower bound

`BobbyAdversarialBounties.sol:369-372` bounds only the upper side (`<= 30 days`).

The grace period exists so a challenger who submits near the deadline is protected from resolver inaction. With `_grace = 0`, `_effectiveExpiry` collapses to `createdAt + claimWindowSecs` — the exact same instant `submitChallenge` stops accepting entries.

**Concrete failure:** owner sets `challengeGracePeriod = 0`. Poster posts a bounty with the minimum 1-hour window. Challenger C submits winning evidence at `createdAt + 3599`. `resolveBounty` requires `block.timestamp < createdAt + 3600` — the resolver has under one block to observe the challenge, evaluate the evidence, and land a transaction. It misses. Poster reclaims the full reward via `withdrawBounty`. Repeatable against every challenger, and it needs no pause and no key compromise beyond the ordinary owner role.

The `gracePeriodSnapshot` mechanism correctly protects *existing* bounties from a mid-flight change, so this only affects bounties created after the setting — but that is every future bounty.

**Fix:** `require(_grace >= 1 days && _grace <= 30 days, "Grace out of range")`, and consider raising `ABSOLUTE`-style floors to constants so the owner cannot reach the degenerate case at all.

---

### M-5 · Single-key resolver, no bond, no dispute, no timelock

`BobbyAdversarialBounties.sol:255` (`onlyResolver`, which also admits `owner`), `:355-359` (`setResolver`, immediate).

The resolver unilaterally decides which challenger receives the entire reward, with the only constraint being that the winner previously submitted *some* challenge (`hasChallenged`). There is no evidence quality check, no bond at risk, no appeal, and no delay between `setResolver` and that new resolver's first resolution.

**Concrete failure:** a compromised resolver key resolves every `CHALLENGED` bounty to an attacker-controlled address that submitted one dust challenge to each. `submitChallenge` costs only gas and there is no minimum stake, so pre-positioning across all open bounties is cheap. Total loss = every bounty currently in `CHALLENGED` state.

This is inherent to the design rather than a bug, but it should be named: the contract's security is exactly the security of one hot key, and `setResolver` gives no observation window.

**Fix:** timelock `setResolver`; require a refundable challenger bond so mass pre-positioning has a cost; consider requiring the winner's evidence hash to be echoed in `resolveBounty` so the resolution is attributable to specific evidence on-chain.

---

### L-1 · Force-sent ETH is permanently locked

`BobbyAdversarialBounties.sol:408-410` reverts on bare transfers, and there is no admin sweep. ETH delivered via `selfdestruct`, as a block-reward recipient, or from a pre-deployment balance at the CREATE2 address bypasses `receive()` entirely and can never be withdrawn — no code path can transfer it, since `withdraw()` only pays out `pendingWithdrawals` credits that are exclusively created by prior `postBounty` deposits.

Amount is likely negligible; a `sweepExcess()` that pays out `address(this).balance - trackedLiabilities` would need liability tracking that the contract does not currently keep. Accept and document, or add a `totalLiabilities` accumulator.

### L-2 · V1 CEI violation in `payDebateFee`

`BobbyAgentEconomy.sol:97-102` makes both agent payments *before* the state writes at `:105-120`. If either agent address is a contract, it can re-enter `payDebateFee`, `payMCPCall`, or `paySignalAccess` while `agentStats`, `totalDebates`, `totalVolume` and the `payments` array are all mid-update, producing out-of-order `PaymentRecord` entries and events that do not match final counter values.

I could **not** turn this into a fund drain: every entry point requires `msg.value` that fully funds its own payout, so each nested call is self-financed and the contract's balance never goes negative. The refund at `:124` is also post-state and non-profitable for the same reason. Impact is confined to accounting/event ordering — hence Low, not High. Fixing M-2 (pull payments) removes this as a side effect. V2 already writes state before its refund call.

### L-3 · V1 credits the CIO earnings it can never claim

`BobbyAgentEconomy.sol:136` and `:154` do `agentStats[cio].totalEarned += msg.value` for MCP and signal fees, but that value stays in the contract and is withdrawable only by `owner` (`:200-206`). If `owner != cio`, `totalEarned` is a claim the CIO has no path to redeem. Either route the fees to `cio` on receipt, or rename the field to reflect that it measures revenue attributed to, not owed to, the agent.

### L-4 · V1 counts overpayment as protocol volume

`BobbyAgentEconomy.sol:140` and `:157` use `msg.value` rather than the fee. A caller sending 100× the fee inflates `totalVolume` by 100×, and V1 has no refund path for MCP/signal (unlike `payDebateFee`), so the excess is silently kept. V2 fixed both halves (`V2:95` uses `mcpCallFee`; `V2:100-103` refunds). Another reason not to deploy V1.

### L-5 · `BobbyAgentEconomy` (V1) has zero test coverage

`contracts/test/` contains suites for V2, Bounties, IntentEscrow and HardnessRegistry — nothing for V1. Every V1 finding above (M-3, L-2, L-3, L-4) is unexercised. If V1 is being retired for Base, remove it from `src/` so it cannot be deployed by accident; if it is being kept, it needs a suite before cutover.

### I-1 · V2 `getEconomyStats()` returns a fabricated count

`BobbyAgentEconomyV2.sol:152` returns `totalMCPCalls + (totalDebates * 2)` as the V1-compatible `_totalPayments`. That is a derived estimate presented in the slot where V1 returned `payments.length`, an actual array length. Consumers cannot distinguish. Also returns a hardcoded `0` for signal accesses. Document that this is a shim, or drop the compatibility function.

### I-2 · `overrideResolution` is repeatable

`BobbyIntentEscrow.sol:358-368` has no once-only guard — the owner may override repeatedly while `block.timestamp - t.resolvedAt <= challengeWindowSecs`, and each call re-emits `ResolutionOverridden` with the *then*-previous values. Indexers must take the last event in the window, not the first. `setChallengeWindow` also has no upper bound (`:260-264`), so the owner can set it to `type(uint32).max` and keep every resolution mutable roughly forever.

### I-3 · `entryRef` has no bound and no documented scale

`BobbyIntentEscrow.sol:281`. Every other intent field is validated at `:303-307`; `entryRef` is a bare `uint256` reference price with no range check and no decimal convention. It is signed, so it cannot be tampered with, but nothing on-chain pins what unit it is in — a live concern when the quote asset changes decimals on Base.

### I-4 · Stale chain and token references throughout

All four files' NatSpec asserts OKB and "X Layer (Chain 196)". `BobbyAdversarialBounties.sol:8,153,308` and the `uint96 reward // enough for 79B OKB` comment at `:35` are the most misleading. `chainIdExpected` is already a constructor parameter (R2-003), which is correct — only the prose is stale.

---

## Decimals & native-token migration risks

Everything below must be consciously re-derived before a Base deployment. X Layer: native OKB, 18 decimals. Base: native ETH, 18 decimals, with USDC (**6 decimals**) as the canonical stablecoin.

**The decimal *width* does not change (both natives are 18dp) — the trap is entirely in value, and in what happens if USDC enters the picture.**

### 1. Native-value literals (all must be re-priced)

| Literal | File:line | Note |
|---|---|---|
| `debateFeePerAgent = 0.0001 ether` | `BobbyAgentEconomy.sol:64` | mutable via `updateFees` |
| `mcpCallFee = 0.001 ether` | `BobbyAgentEconomy.sol:65` | mutable |
| `signalAccessFee = 0.0005 ether` | `BobbyAgentEconomy.sol:66` | mutable; V1 only |
| `mcpCallFee = 0.001 ether` | `BobbyAgentEconomyV2.sol:42` | mutable via `updateFees` |
| `debateFeePerAgent = 0.0001 ether` | `BobbyAgentEconomyV2.sol:43` | mutable |
| `ABSOLUTE_MIN_BOUNTY = 0.0001 ether` | `BobbyAdversarialBounties.sol:58` | **`constant` — source edit required, not patchable post-deploy** |
| `minBounty = 0.001 ether` | `BobbyAdversarialBounties.sol:61` | mutable, but floored by the constant above |

### 2. 18-decimal scale assumptions in non-native quantities

| Item | File:line | Risk |
|---|---|---|
| `MAX_SIZE_USD_CEILING = 100_000_000e18` | `BobbyIntentEscrow.sol:79` | See M-1. Hardcoded 18dp USD scale with no on-chain declaration. If USDC (6dp) becomes the encoding unit the ceiling is 10^12 too loose. |
| `maxSizeUsd` | `BobbyIntentEscrow.sol:80,305` | Same scale; owner-set, so a wrong-scale value is a single-transaction mistake with no guard rail. |
| `intent.entryRef` | `BobbyIntentEscrow.sol:281` | Unbounded, undocumented scale. Signed but never validated. |
| `intent.sizeUsd` in `INTENT_TYPEHASH` | `BobbyIntentEscrow.sol:69` | The EIP-712 type string does not encode decimals — off-chain signers and the contract must agree by convention alone. |

### 3. Container widths (checked — currently safe, re-check if USDC is adopted)

- `uint96 reward` (`Bounties:35`) holds ~7.9e28 wei ≈ 79 billion ETH. Fine for native ETH. **If the reward becomes 6-decimal USDC, `uint96` is enormously oversized but `ABSOLUTE_MIN_BOUNTY = 1e14` becomes 100,000,000 USDC** — the floor would be nonsense in the opposite direction.
- `postBounty`'s `require(msg.value <= type(uint96).max)` (`:163`) is unreachable in practice for ETH; keep it.
- `int128 pnlBps` (`Escrow:109`) is basis points, decimal-independent. Safe.
- `uint40 executedAt/resolvedAt` — good through year 36812. Safe.

### 4. Structural changes required if USDC becomes the settlement asset

This is not a parameter tweak — it is a rewrite of both value contracts:

- Every `payable` / `msg.value` path (`postBounty`, `payMCPCall`, `payDebateFee`, `paySignalAccess`) becomes `transferFrom`, requiring allowance handling and a non-standard-return-safe transfer helper. **None of these contracts currently touch ERC-20 at all**, so there is no existing `safeTransfer` to lean on.
- `receive()` semantics change meaning entirely — the bounty contract's `revert("Use postBounty")` guard no longer prevents tokens arriving (ERC-20 transfers cannot be rejected by the recipient).
- The pull-payment `withdraw()` (`Bounties:309-318`) must switch from `call{value:}` to a token transfer, which changes the reentrancy profile: a token with transfer hooks (not USDC today, but a design constraint to record) reintroduces reentrancy into a function that is currently safe purely because it zeroes before calling.
- `BobbyIntentEscrow` needs no change here — it moves no value.

### 5. Chain identity

- `chainIdExpected` is a constructor parameter (`Escrow:81,197`) — correctly parameterized. Set to **8453** (Base) / **84532** (Base Sepolia), and verify against `block.chainid` at `:303` as already done.
- `DOMAIN_SEPARATOR` (`Escrow:208-214`) bakes in `block.chainid` at construction. Correct for replay isolation; note that it does **not** track a post-deploy chain fork. Acceptable, but worth an explicit decision.
- The other three contracts have no chain binding whatsoever — the same bytecode deployed on two chains is indistinguishable to a caller. Not exploitable here (no signatures), but relevant if signature-based flows are added.

---

## What I verified as safe

Do not re-audit these in Round 2 unless the code changes.

**Reentrancy**
- `BobbyAdversarialBounties.withdraw()` (`:309-318`) is textbook-correct CEI: `pendingWithdrawals[msg.sender] = 0` executes before `call{value:}`. A re-entering receiver reads a zeroed balance and hits `require(amount > 0)`. No single-function, cross-function, or read-only reentrancy path found — `resolveBounty` and `withdrawBounty` make **no** external calls at all, so there is no window in which a credit is granted twice.
- `BobbyAgentEconomyV2.payMCPCall` (`:87-104`) sets `challengeConsumed[challengeId] = true` and increments all counters *before* the refund `call`. Re-entry requires a fresh, unconsumed `challengeId` and full `msg.value` funding — self-financed and unprofitable.
- `BobbyAgentEconomy.payDebateFee` violates CEI (L-2) but is not drainable: **every** value-moving entry point in both economy contracts requires `msg.value` that fully covers its own payout, so no nested call can spend a balance it did not itself supply.
- `BobbyIntentEscrow`'s ERC-1271 branch (`:417-422`) uses a `try/catch` on an untrusted callee inside `executeIntent`, but a re-entering signer cannot reach a second `EXECUTED` state — covered by `test_1271ReenterCannotExecute` and `test_1271StateMutationDuringStaticCallFailsSafely`, both passing.

**Double-spend / accounting**
- Bounty status machine is terminal and single-exit: `OPEN|CHALLENGED → RESOLVED` (via `resolveBounty`) **or** `→ WITHDRAWN` (via `withdrawBounty`); each transition credits `pendingWithdrawals` exactly once and each guards on the pre-state. I attempted resolve-then-withdraw, withdraw-then-resolve, double-resolve and double-withdraw — all revert on the status guard.
- Resolve and reclaim cannot race: `resolveBounty` requires `block.timestamp < _effectiveExpiry(b)` and `withdrawBounty` requires `>= _effectiveExpiry(b)`, over a shared helper (`:197-203`). Strict/non-strict complementarity means no timestamp satisfies both.
- Solvency invariant holds: every `pendingWithdrawals` credit is backed by a prior `postBounty` deposit of exactly `b.reward`, and `b.reward` is never mutated after creation. `address(this).balance >= Σ pendingWithdrawals + Σ live bounty rewards` at all times.
- `gracePeriodSnapshot` (`:184`) correctly freezes settlement terms per bounty — the owner cannot retroactively change the deadline of a funded bounty. Verified by two passing tests.
- **No `unchecked` blocks anywhere in the four contracts.** All arithmetic is solc-0.8 checked. `b.challengeCount = idx + 1` is capped by `maxChallenges ≤ 500` well under `uint16`. `uint96(msg.value)` at `:175` is guarded by the `:163` bound. No truncating casts found on value quantities.

**Locked funds**
- `BobbyIntentEscrow` is entirely non-payable — no `payable` function, no `receive`, no `fallback`. Native value cannot enter, therefore cannot be trapped. Despite the name it holds nothing; the "escrow" is the off-chain executor's.
- Both economy contracts have `receive() external payable {}` plus an owner `withdraw()` that sweeps the full balance — no lock path.
- Bounty funds always have an exit: if the resolver never acts, the poster reclaims after `_effectiveExpiry`; `withdrawBounty` and `withdraw()` are both deliberately exempt from `whenNotPaused`. The only locked-funds case is force-sent ETH (L-1). **Note H-1 is a mis-*routing*, not a lock — the money always leaves, just to the wrong party.**
- No push-payment refund path can revert forever in the bounty contract; it uses pull payments end to end.

**Access control**
- `BobbyIntentEscrow`: `executeIntent` is `onlyKeeper` *and* requires valid CIO + arbiter EIP-712 signatures — a rogue keeper alone cannot create a terminal state (`test_keeperCannotCreateTerminalStateWithoutCioAndArbiter`, fuzzed 256 runs). Role distinctness is enforced in both the constructor and `rotateRole`, including `owner != keeper`. Two-step ownership on both Escrow and Bounties.
- `BobbyAgentEconomyV2.payDebateFee` correctly gated `onlyCioOrOwner`. `withdraw`/`updateFees`/`pause` correctly `onlyOwner` in both economy contracts.
- Bounty `resolveBounty` is `onlyResolver` (owner as documented backstop); `withdrawBounty` checks `b.poster == msg.sender`; `setMinBounty` is floored by a `constant` the owner cannot cross. Privilege *escalation* paths: none found — no function lets a non-owner reach an owner-only state, and `acceptOwnership` correctly checks `pendingOwner`.
- Owner functions have **no timelock** anywhere (M-5) — that is a design gap, not a broken check.

**Signature security (Escrow)**
- EIP-712 `DOMAIN_SEPARATOR` binds both `block.chainid` and `address(this)`: cross-chain and cross-deployment replay both blocked (two passing tests).
- Nonces are per-signer (`usedNonces[cio][nonce]`) and consumed before state finalization.
- s-malleability bounded at `secp256k1n/2` with no `v` remapping; `v ∈ {27,28}` enforced; `ecrecover` zero-return handled. Boundary and zero-`s` cases tested.
- `decision.intentHash` must equal the on-chain-computed struct hash, so a verification decision cannot be transplanted onto a different intent.

**DoS**
- No unbounded loop exists in any state-changing function across all four contracts. `getChallenges` is paginated (`:328-345`); `getRecentPayments` (`Economy:183-191`) loops but is `view`-only and caller-bounded.
- Bounty challenge array growth is double-capped: `maxChallenges` (≤ 500) and one challenge per address per bounty.
- Griefing via forced revert: the only push-payment paths in scope are the two agent payments in `payDebateFee` (M-2). Everything in the bounty contract is pull.

**ERC-20**
- None of the four contracts touch ERC-20 today, so missing-return-value, fee-on-transfer, approve-race and rebasing-token classes are all currently N/A. This changes the moment USDC is adopted — see migration section item 4.

---

## Recommended gate for Base cutover

1. Fix **H-1** (remove `whenNotPaused` from `resolveBounty`) — this is the only finding I would call a blocker on its own.
2. Re-derive every literal in migration table §1; edit `ABSOLUTE_MIN_BOUNTY` in source since it is `constant`.
3. Decide the `sizeUsd` decimal convention explicitly and encode it (**M-1**) before any USDC work begins.
4. Drop `BobbyAgentEconomy.sol` (V1) from the deployment set — M-3, L-2, L-3, L-4 and zero test coverage all resolve at once, and V2 supersedes it.
5. Convert `payDebateFee` to pull payments (**M-2**), which also closes L-2.
6. Add a lower bound to `setChallengeGracePeriod` (**M-4**).

Round 2 should focus on the non-value contracts (`BobbyConvictionOracle`, `BobbyTrackRecord`, `BobbyAgentRegistry`, `HardnessRegistry`) and on any ERC-20/USDC rail introduced by these fixes — the token path is entirely unwritten and therefore entirely unaudited.
