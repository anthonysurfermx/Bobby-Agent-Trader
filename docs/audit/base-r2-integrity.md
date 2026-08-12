# Round 2 Audit — Integrity of the Record

**Scope:** `contracts/src/BobbyTrackRecord.sol`, `BobbyConvictionOracle.sol`, `HardnessRegistry.sol`, `BobbyAgentRegistry.sol`
**Branch:** `feat/base-migration` · solc 0.8.19/0.8.24 · Foundry · no OpenZeppelin
**Lens:** can the published track record be faked, biased, or replayed?
**Date:** 2026-08-10 · read-only audit, no contract modified

**Summary: 3 Critical · 4 High · 7 Medium · 6 Low · 4 Info**

---

## CRITICAL

### C-1. The recorded outcome is pure self-report — no arithmetic ties result/PnL to the committed prices
`BobbyTrackRecord.sol:208-271` (`resolveTrade`), `HardnessRegistry.sol:399-441` (`resolvePrediction`)

`resolveTrade` accepts `_pnlBps`, `_result` and `_exitPrice` as free parameters. The only checks are internal sign coherence (`WIN ⇒ pnl>0`). Nothing compares `_exitPrice` against `c.entryPrice`, `c.targetPrice` or `c.stopPrice`, and the `Commitment` struct never records a **direction**. `HardnessRegistry.Prediction` likewise has no direction field (its `Signal` struct does — the omission in `Prediction` is the bug).

**Concrete scenario.** Bobby commits BTC: `entryPrice = 100_000e8`, `targetPrice = 110_000e8`, `stopPrice = 95_000e8` (unambiguously a long). Price falls to 90,000. After `minCommitAge`, Bobby calls:

```
resolveTrade(hash, +1500, Result.WIN, 90_000e8)
```

Every `require` passes. `wins++`, `totalPnlBps += 1500`, and `getWinRate()` reports a win — on a trade whose own on-chain entry/target/stop prove a 10% loss. The event and the `Trade` record both say WIN. The commitment phase is honest; the resolution phase is an unconstrained write.

**Fix.** Store `Direction` at commit time. At resolve, derive PnL on-chain:
`pnlBps = int(exit-entry)*10000/entry` for LONG, negated for SHORT, and require the caller's `_pnlBps` to equal it (or drop the parameter entirely and compute it). Derive `_result` from the sign rather than accepting it. If exit price itself must be trusted, that trust must be a named price oracle, not an EOA.

### C-2. `getWinRate()` denominator excludes unrevealed commitments — the 100% figure is structurally guaranteed
`BobbyTrackRecord.sol:326-330`, `HardnessRegistry.sol:783-789`

```solidity
function getWinRate() external view returns (uint256) {
    uint256 total = trades.length;      // resolved only
    if (total == 0) return 0;
    return (wins * 10000) / total;
}
```

`pendingCount` is tracked (line 87) and deliberately not used here. Live state — **2,038 commitments, 1 resolution** — therefore yields `10000` (100.00%) from a sample of one. `HardnessRegistry._computeWinRate` is worse: its denominator is `wins + losses + breakEvens`, so `expired` predictions are counted into `totalResolved` but *excluded* from the win-rate denominator by construction.

**Concrete scenario.** No attack is needed; inaction is the attack. Commit 2,038 theses. Resolve the single best one. The contract itself publishes 100% and any integrator calling `getWinRate()` is misled by a contract that holds, in adjacent storage, the number proving the sample is 0.05% of the population.

**Fix.** Either (a) make the denominator `trades.length + pendingCount`, treating unresolved as unproven, or (b) return the tuple `(wins, losses, resolved, pending)` and delete the single-number accessor so no integrator can read a headline without the denominator. Same for `HardnessRegistry`: include `expired` in the denominator.

### C-3. Any 0.01-ETH-staked address can write the outcome of any other agent's prediction
`HardnessRegistry.sol:411-413`

```solidity
if (msg.sender != prediction.agent
    && !agentProfiles[msg.sender].registered
    && !resolvers[msg.sender]) revert NotAuthorized();
```

The condition passes for **every registered agent**, not just the prediction's owner or a designated resolver. Registration costs `REGISTRATION_STAKE = 0.01 ether` and is permissionless (`registerAgent`, line 284).

**Concrete scenario.** Attacker registers once for 0.01 ETH. They watch `PredictionCommitted` events for competitor agent `A`, wait for `minResolveAt`, and call `resolvePrediction(hash, -1, LOSS, 1)` on every one of A's predictions. `prediction.result` is now non-`NONE`, so A can never resolve honestly (`AlreadyResolved`, line 407). A's `losses` counter and `winRateBps` are permanently controlled by the attacker, for a one-time 0.01 ETH cost and gas. The mirror abuse also holds: the attacker resolves their *own* predictions as WIN (`msg.sender == prediction.agent` is an accepted branch), so the same function is both a griefing vector against others and a self-certification vector for oneself.

`test_resolvePrediction_byRegisteredOracleAgent` (test:253) shows this is intended design. Intended or not, it makes `getAgentStats` an attacker-writable field.

**Fix.** Restrict resolution to `resolvers[msg.sender]` only, or require m-of-n resolver approval as the bounty module already does (`approveBountyResolution`, line 557 — the correct pattern already exists in this file). Self-resolution by `prediction.agent` should not be sufficient on its own.

---

## HIGH

### H-1. Losing trades can be laundered into `EXPIRED` by simply waiting out the TTL
`BobbyTrackRecord.sol:226` and `280-314`; `HardnessRegistry.sol:410`, `443-460`

`resolveTrade` hard-reverts once `block.timestamp > c.committedAt + MAX_COMMITMENT_TTL` (30 days). `expireCommitment` then writes `Result.EXPIRED` with `pnlBps = 0`, touching neither `wins`, `losses`, nor `totalPnlBps`.

**Concrete scenario.** A thesis goes badly. Bobby resolves nothing. On day 31 anyone (or Bobby) calls `expireCommitment`; the record shows EXPIRED / 0 PnL. Losses never reach `losses`. Combined with C-2 the loss also never enters the win-rate denominator in `HardnessRegistry`. Because `resolveTrade` *cannot* be called after day 30, this is not merely permitted — late honesty is forbidden by the contract.

**Fix.** Allow honest late resolution (drop the hard TTL revert, or allow resolution with an `isLate` flag that still books the PnL). Count EXPIRED in the win-rate denominator. Bond the commitment so expiry has a cost.

### H-2. Owner can `pause()` to block loss recording, then let the TTL launder it
`BobbyTrackRecord.sol:213` + `391-399`

`resolveTrade` carries `whenNotPaused`; `expireCommitment` does not. The owner can pause for 30 days across a losing thesis, then unpause; the only path left for that commitment is `expireCommitment`. Pause is thus a selective-loss-suppression switch, not just a safety valve.

**Fix.** Extend the TTL by the paused duration, or remove `whenNotPaused` from `resolveTrade` (loss recording should never be pausable), or gate `expireCommitment` on "was not paused during the window".

### H-3. `BobbyAgentRegistry.updateStats` writes arbitrary reputation with no link to any record
`BobbyAgentRegistry.sol:97-117`

The contract's stated purpose is that "other protocols can verify agent track record before trusting their signals" (line 8). `updateStats` lets the owner set `totalDebates`, `wins`, `losses`, `calibrationError`, `totalSignals` to any values. It never reads `BobbyTrackRecord`. `winRate` is recomputed from the supplied `wins/losses`, which only makes the fabricated number look derived.

**Concrete scenario.** `updateStats(1, 500, 495, 5, 100, 500)` → `winRate = 9900` (99%) in the NFT's on-chain metadata and `tokenURI`, with zero on-chain trades behind it. Any integrator honoring the ERC-721 as an identity/reputation token is reading a field the issuer types by hand.

**Fix.** Have the registry read `BobbyTrackRecord.getAgentStats(agent)` directly in `getAgent`/`tokenURI`, or store an immutable pointer to the TrackRecord contract and derive stats there. Delete the setter.

### H-4. `hardnessScore` is self-declared by the agent publishing the signal
`HardnessRegistry.sol:462-499`

`publishSignal` takes `uint8 hardnessScore` straight from the caller and stores it. There is no bound check (unlike `conviction > 100`), and `hardnessScorer` — the role that exists precisely to certify hardness (`certifyHardness`, line 686) — is not consulted. In a contract named `HardnessRegistry`, the hardness number on signals is the one field nobody verifies.

**Fix.** Set `hardnessScore = 0` on publish and let only `hardnessScorer` write it, mirroring `certifyHardness` for predictions. Bound it to 0-100.

---

## MEDIUM

### M-1. Cross-chain / cross-contract non-binding of commitment identifiers
`BobbyTrackRecord.sol:161` (`_debateHash`), `HardnessRegistry.sol:366` (`predictionHash`)

Both identifiers are opaque caller-supplied `bytes32`. Neither contract binds `block.chainid` or `address(this)`, and neither verifies any preimage. See the dedicated section below.

### M-2. `payForService` replay key is chosen by the payer, so it protects nothing and can be burned by a griefer
`HardnessRegistry.sol:337-363`

`challengeId` is an arbitrary `bytes32` supplied by the payer and marked consumed. It is not derived from the service, price, or payer, so it cannot prove "this payment settles that off-chain challenge". Conversely, an attacker who learns a `challengeId` from an off-chain quote can burn it by paying `priceWei` first; the legitimate payer's call then reverts with `ChallengeConsumed`. Cheap denial for the cost of one service call.

**Fix.** Derive the key on-chain: `keccak256(abi.encode(block.chainid, address(this), serviceKey, msg.sender, nonce))`, or have the service owner sign the `challengeId` (with chainid + contract in the digest).

### M-3. Registration stakes are permanently locked — no unstake/deregister path
`HardnessRegistry.sol:284-298`

`registerAgent` takes ≥0.01 ETH into `profile.stake`. No function ever returns it. `slashAgent` (line 695) is the only path out and it credits `owner`. An honest agent that stops participating forfeits its stake to nobody. Stakes, bounty rewards, and service revenue all share one undifferentiated contract balance, so nothing prevents `slashAgent` from being used to drain the aggregate.

**Fix.** Add `unregister()` with a cooldown that returns unslashed stake; account stake separately from `pendingWithdrawals` liabilities.

### M-4. `slashAgent` is unpausable, unbounded, and pays the owner
`HardnessRegistry.sol:695-704`

No `whenNotPaused`, no cap, no timelock, no challenge period. `hardnessScorer` is an arbitrary address the owner sets (line 682) with no zero-check on the setter. Either key zeroes any agent's stake in one transaction and credits `owner`'s withdrawal balance. `emit AgentSlashed` is the only trace.

**Fix.** Cap per-slash amount, add a dispute window, route slashed funds to a burn address or treasury rather than `owner`.

### M-5. Challengers can be stiffed by resolver inaction
`HardnessRegistry.sol:595-604`

`withdrawBounty` succeeds for the poster in `CHALLENGED` status once `_effectiveExpiry` passes. If resolvers simply do not reach `approvalThreshold` within `claimWindowSecs + gracePeriodSnapshot`, the poster reclaims the full reward and every challenger's work is unpaid. A poster who also controls (or can wait out) a resolver set gets free adversarial review.

**Fix.** On withdrawal from `CHALLENGED`, escrow a portion for challengers, or forbid poster withdrawal once `challengeCount > 0` and route to a fallback resolution.

### M-6. Removed resolvers keep their standing approvals
`HardnessRegistry.sol:557-593` + `665-680`

`bounty.approvalCount` is a plain counter. `updateResolver(r, false)` does not decrement approvals `r` already cast in the current round, and `approvalThreshold` is snapshotted at post time. A bounty can therefore be finalized by a quorum that includes revoked resolvers.

**Fix.** Recount live approvals at finalization time, or invalidate the round when the resolver set changes.

### M-7. Oracle admin setters are unbounded
`BobbyConvictionOracle.sol:241-247`

`setDefaultTTL(0)` makes every subsequently published signal expire in the same block (`expiresAt = block.timestamp`), so `getConviction` returns `NEUTRAL/0/0/false` for everything — a silent, permanent oracle outage for integrators that don't check `isActive` semantics. `setSignalCooldown(0)` removes the anti-spam guarantee documented on line 57, allowing the latest signal for a symbol to be flipped every block; since history is events-only (line 62), an integrator reading `getSignal` can be handed whichever direction the writer wants at the moment of the read.

**Fix.** Enforce floors: `defaultTTL >= 1 hours`, `signalCooldown >= 1 minutes` (compare `HardnessRegistry.setDefaultSignalTTL`, which does have a floor).

---

## LOW

### L-1. `BobbyAgentRegistry` claims ERC-721 support it does not implement
`BobbyAgentRegistry.sol:158-160`

`supportsInterface` returns `true` for `0x80ac58cd` (ERC-721), but the contract has no `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`, `getApproved`, or `isApprovedForAll`. Any marketplace or contract that feature-detects via ERC-165 and then calls `safeTransferFrom` reverts with no selector match. If soulbound is intended, say so — don't advertise the transferable interface.

### L-2. `registerAgent(to = address(0))` mints into the zero address
`BobbyAgentRegistry.sol:60-87` — no zero-check on `to`; `ownerOf[tokenId] = address(0)` also makes the token indistinguishable from a non-existent one.

### L-3. `tokenURI` interpolates `name` into JSON unescaped
`BobbyAgentRegistry.sol:143-156` — an agent name containing `"` closes the string and lets arbitrary attributes be injected into the metadata JSON (e.g. a forged `Win Rate`). Owner-gated, so impact is limited to owner self-deception/misrepresentation, but the fix is trivial: reject non-alphanumeric names at mint or escape on render.

### L-4. Immutable `owner` with no transfer path
`BobbyAgentRegistry.sol:36` — `address public immutable owner`. Key loss permanently freezes minting and stats. The other three contracts use Ownable2Step correctly; this one is the outlier.

### L-5. `getAgentByRole` unbounded linear scan, returns only the first match
`BobbyAgentRegistry.sol:125-132` — `totalAgents` is owner-controlled so DoS is self-inflicted, but the function silently hides duplicate-role agents. Nothing prevents registering three CIOs.

### L-6. Unbounded symbol/agent arrays growable by any registered agent
`HardnessRegistry.sol:487-496` — `signalSymbols` and `_symbolAgents[symbolHash]` grow without limit on arbitrary caller-chosen symbol strings, with no cooldown on `publishSignal`. `_symbolAgents` has no accessor left in the contract, so this is storage-bloat cost rather than a read DoS today; any future paginated getter over it inherits the problem.

---

## INFO

- **I-1.** `certifyHardness` (`HardnessRegistry.sol:686`) can be called after a prediction resolves, retroactively changing its difficulty score. Freeze the score at resolution.
- **I-2.** `setHardnessScorer` accepts `address(0)` (line 682); combined with `msg.sender != hardnessScorer` checks this is harmless today but is an easy footgun.
- **I-3.** `BobbyTrackRecord.expireCommitment` emits both `TradeResolved` and `CommitmentExpired`, and `CommitmentExpired`'s first arg is `cIdx` (commit index) while `TradeResolved`'s is `tradeId`. Indexers correlating the two will mismatch IDs.
- **I-4.** No test file exists for `BobbyTrackRecord.sol`, `BobbyConvictionOracle.sol`, or `BobbyAgentRegistry.sol`. `contracts/test/` covers only `HardnessRegistry`, `BobbyAdversarialBounties`, `BobbyAgentEconomyV2`, and `BobbyIntentEscrow`. The contract that carries the protocol's central claim has zero test coverage.

---

## Is the track-record claim actually enforced on-chain?

**The claim:** "decisions are committed on-chain BEFORE the outcome is known, so the track record cannot be faked in hindsight."

**Verdict: the first half is enforced. The second half is not. As deployed, the published track record can be shaped at will without breaking a single `require`.**

What *is* genuinely enforced, and deserves credit:

1. **Commitments are plaintext, not hashed.** `Commitment` stores `symbol`, `entryPrice`, `targetPrice`, `stopPrice`, `conviction` and `agent` in the clear at commit time (lines 180-192). There is no reveal phase to cheat, no salt to brute-force, and no "reveal something different from what I committed" — the terms are public the moment they're written. This is *stronger* than a classic commit-reveal scheme, and it removes an entire attack class. The naming ("commit-reveal") is inaccurate; the mechanism is commit-then-resolve, and the mechanism is the better one.
2. **Commitments are immutable.** `commitIndex[hash] != 0` blocks re-commit (line 171), there is no cancel or delete function, and no field of an existing `Commitment` is ever rewritten except `resolved`. A committed thesis cannot be edited or withdrawn.
3. **Backdating is blocked.** `committedAt = block.timestamp` is written by the chain, and `minResolveAt` is snapshotted per commitment (line 178) so a later `setMinCommitAge` cannot retroactively weaken old commits. `MIN_COMMIT_AGE_FLOOR` (10 min) stops the owner from disabling the delay. You cannot commit after seeing the outcome.

What is **not** enforced, and defeats the claim:

4. **The outcome is typed in by the same key that made the prediction (C-1).** Prices and result are unconstrained by the committed levels; direction isn't even recorded. A loss can be entered as a WIN with a truthful-looking exit price. Nothing on-chain contradicts it, because nothing on-chain checks it.
5. **Resolution is optional, and silence is free (C-2, H-1).** 2,038 commitments and 1 resolution is not a 100% win rate — it is a 0.05% disclosure rate. The contract publishes `getWinRate() = 10000` while `pendingCount = 2037` sits one storage slot away, unread by the accessor. Losers can be parked to the 30-day TTL and booked as EXPIRED at zero PnL, and after day 30 the contract *refuses* an honest loss entry.
6. **In `HardnessRegistry`, third parties can write your outcomes for 0.01 ETH (C-3).**

So the honest statement of what the contract proves today is: *"Bobby's theses, with entry/target/stop, are timestamped on-chain before the fact and cannot be altered afterward."* That is a real and defensible claim. The stronger claim — that the resulting **win rate** cannot be faked — is false on two independent counts: the outcome is self-asserted, and the sample is self-selected.

Making the strong claim true requires two changes and nothing else: derive PnL from committed direction + an oracle exit price, and put unresolved commitments in the win-rate denominator.

---

## Cross-chain replay risk for the Base redeploy

**Setting:** the same bytecode is going to Base (8453) while X Layer (196) deployments remain live.

**No ECDSA signatures exist anywhere in these four contracts** — no `ecrecover`, no permit, no meta-transactions, no EIP-712 domain. Classic signature replay therefore does not apply, and there is no missing `chainid` in any digest, because there are no digests. That is the good news and it is worth stating plainly.

The real risk is **identifier collision and narrative double-counting**:

1. **`debateHash` / `predictionHash` are caller-supplied opaque `bytes32` with no preimage check** (`BobbyTrackRecord.sol:161`, `HardnessRegistry.sol:366`). The uniqueness guard is per-contract (`commitIndex`, `_predictions`), so the *identical* hash can be committed on 196 and on 8453. Concrete scenario: Bobby commits hash `H` for a BTC long on both chains. The trade loses. On X Layer he calls `expireCommitment(H)` (EXPIRED, 0 PnL); on Base he lets it sit. Marketing links the Base explorer. Both records are "the same decision", neither contradicts the other on its own chain, and no observer reading one chain can tell the other exists. The reverse also works: commit on both, resolve only on the chain where the framing is favorable, cite that chain.
2. **Contract-address non-binding compounds it.** Nothing in the committed data identifies which deployment it belongs to. Two `BobbyTrackRecord` instances on the *same* chain have the same property. Off-chain systems that key on `debateHash` alone (indexers, the Supabase mirror, the dashboard) will merge or collide records across deployments.
3. **`payForService`'s `challengeId`** (`HardnessRegistry.sol:337`) is likewise per-contract. An off-chain challenge/quote system that issues one `challengeId` and accepts payment on either chain gets paid once and consumed once per chain — i.e. a payment made on the cheaper chain can be presented against a quote priced for the other.
4. **Address prediction.** If deployment uses the same deployer EOA and nonce sequence, the Base addresses may match the X Layer addresses. Convenient, but it means a user or integrator cannot distinguish the two by address at all — every mitigation below becomes more necessary, not less.

**Mitigations, in priority order:**

- Bind the identifier: require `debateHash == keccak256(abi.encode(block.chainid, address(this), symbol, entry, target, stop, agent, conviction, nonce))` and verify it in `commitTrade`. This makes the hash self-describing, kills cross-chain and cross-deployment reuse, and turns the hash into a real commitment to its contents (today it commits to nothing).
- Store `uint256 public immutable DEPLOY_CHAIN_ID = block.chainid;` and expose it in every view, so any consumer can assert which chain's record it is reading.
- Decide and publish whether Base is a **migration** (X Layer record frozen, contracts paused, stats declared final) or a **second venue** (records must be summed, and the aggregate is the only honest headline). Publishing per-chain win rates from a duplicated record set is the misleading outcome, and it happens by default if nobody decides.
- If X Layer is being retired: call `pause()` on the X Layer `BobbyTrackRecord` and `BobbyConvictionOracle` at cutover and say so in the docs. Note this does *not* stop `expireCommitment` there (H-2).

---

## Verified safe — attack classes checked and defended

| Class | Status | Evidence |
|---|---|---|
| Reveal ≠ commit (commitment substitution) | **N/A — no reveal phase** | Terms stored in plaintext at commit (`BobbyTrackRecord.sol:180-192`); nothing to reveal, nothing to substitute |
| Low-entropy salt brute-force | **N/A** | No hidden preimage; no salt is needed because nothing is concealed |
| Backdating / commit-after-outcome | **Defended** | `committedAt = block.timestamp`; per-commit `minResolveAt` snapshot (line 178) resists later `setMinCommitAge`; `MIN_COMMIT_AGE_FLOOR` = 10 min prevents the owner disabling the delay |
| Commitment overwrite / cancel / delete | **Defended** | `require(commitIndex[_debateHash] == 0)` (line 171); no cancel or mutate function; only `resolved` flips |
| Double resolution of one commitment | **Defended** | `require(!c.resolved)` (222) and `_predictions[h].result != NONE` (407); `pendingCount--` cannot underflow behind that guard |
| Result/PnL sign incoherence | **Defended** | WIN>0 / LOSS<0 / BREAK_EVEN==0 / EXPIRED==0 enforced (229-238, 416-422) — though the magnitude is still free (C-1) |
| Reentrancy on ETH paths | **Defended** | `nonReentrant` on `payForService` and `withdraw`; pull-payment `pendingWithdrawals` everywhere; state written before external `call` (351-358, 606-614) |
| Bounty double-payout | **Defended** | Status flips to `RESOLVED` before crediting; `withdrawBounty` rejects non-OPEN/CHALLENGED (598) |
| Duplicate challenge / self-challenge | **Defended** | `hasChallenged` mapping, poster excluded (537-539), `maxChallengesPerBounty` cap |
| Resolver approval double-count within a round | **Defended** | `hasApprovedResolution[bountyId][round][resolver]`, round bumped when the proposed winner changes (566-575) |
| Resolver set reduced below threshold | **Defended** | `updateResolver` reverts if it would break quorum (673-676); `_setResolverThreshold` rejects 0 and >count |
| Unbounded loops in views | **Defended** | `MAX_RECENT = 100` cap (`BobbyTrackRecord:341-361`); `getSignals` and `getChallenges` paginated; `getConsensus` removed |
| Ownership takeover / single-step transfer | **Defended (3 of 4)** | Ownable2Step in TrackRecord, ConvictionOracle, HardnessRegistry; `BobbyAgentRegistry` has immutable owner instead (L-4) |
| Unprotected initializer / upgrade hazard | **Not applicable** | All four are non-upgradeable with constructor-only init; no proxy, no `initialize`, no delegatecall, no storage-layout risk |
| ECDSA signature replay (incl. cross-chain) | **Not applicable** | No `ecrecover` / EIP-712 / permit anywhere in scope. Cross-chain risk is identifier-level, not signature-level — see the section above |
| Integer overflow | **Defended** | solc ≥0.8 checked arithmetic; `uint96` price and `uint64` timestamp casts are within range for realistic values |
