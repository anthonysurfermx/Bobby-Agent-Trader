# Brief for Codex (GPT-5.5) — BobbyIntentEscrow Audit Round 3

**From**: Anthony Chávez via Claude Opus 4.7 (autonomous morning session)
**Date**: 2026-04-25
**Type**: **Security audit — round 3 of 3 (final before mainnet deploy)**
**Scope**: `contracts/src/BobbyIntentEscrow.sol` (post Round 1 + 2) + the new `contracts/src/BobbyResolverV1.sol` (RedStone-based, to be drafted by you in this round).

## Round 3 mission

After Round 2 you concluded:
> "Mainnet-ready after round 3. Open risks: resolver oracle design, CREATE2/successor migration semantics, off-chain indexer trust, Safe/EIP-1271 real signature fixtures, gas/storage layout confirmation."

Round 3 closes those. **The single most important deliverable is a sound `BobbyResolverV1.sol` design that replaces EOA-trusted resolution with oracle-attested resolution**, plus final gas/storage review and a deployment runbook.

## Context update from morning research

1. **Pyth is NOT deployed on X Layer** (chain 196). Confirmed via [Pyth EVM contract addresses page](https://docs.pyth.network/price-feeds/contract-addresses/evm). Original V3 plan assumed Pyth — that path is blocked for now.
2. **Pivot to RedStone Pull**. Detailed analysis: [docs/research/2026-04-25_pyth-xlayer-integration.md](../research/2026-04-25_pyth-xlayer-integration.md) (PR #5). RedStone Pull works on any EVM via `@redstone-finance/evm-connector` — signed payload appended to calldata, verified inline in tx.
3. **Backlog adjustment**: V3 plan FINAL P2 §28 "Pyth oracle en resolve" → "RedStone Pull resolver (BobbyResolverV1.sol)". Pyth migration deferred to V4 if/when X Layer support lands.

## Files for review

1. [contracts/src/BobbyIntentEscrow.sol](../../contracts/src/BobbyIntentEscrow.sol) — final form post Round 2 (12 + 6 fixes applied; 25/25 tests passing in Round 2).
2. **NEW** `contracts/src/BobbyResolverV1.sol` — to be designed by you in this round. Sketch in §3 of the Pyth pivot brief; you decide the final shape.
3. [contracts/test/BobbyIntentEscrowInvariantTest.t.sol](../../contracts/test/BobbyIntentEscrowInvariantTest.t.sol) — your Round 2 test file. Invariants and vector tests.
4. [.claude/worktrees/jovial-hawking-5a2090/.ai/responses/2026-04-24_intent-escrow-round3-fixes-applied.md](../../.ai/responses/2026-04-24_intent-escrow-round3-fixes-applied.md) — agent-applied fix report.

## Scope of Round 3

### A. Design `BobbyResolverV1.sol` (RedStone Pull)

The new resolver replaces the EOA-trusted resolver role on `BobbyIntentEscrow`. Owner sets `BobbyResolverV1` as the `resolver` role; anyone can call `resolveWithRedStone()` because RedStone signatures are verified inline.

Required surface:

```solidity
contract BobbyResolverV1 {
    address public immutable escrow;       // BobbyIntentEscrow
    mapping(bytes32 => bytes32) public symbolIdRegistry; // "BTC"→0xfeed... → registered by owner

    function registerSymbol(bytes32 humanReadable, bytes32 redstoneFeedId) external onlyOwner;
    function resolveWithRedStone(
        bytes32 intentHash,
        bytes32 symbolId,         // pre-registered
        uint8 direction,          // 0=long, 1=short  (read from indexer or intent struct)
        uint256 entryPrice,       // from intent (off-chain)
        uint256 entryTimestamp    // from intent
    ) external;
    // RedStone payload appended to calldata. Verified inline by inheriting
    // RedStone's MainDemoConsumerBase or equivalent.
}
```

Questions for your audit:

1. **Signed-data freshness window**: RedStone payloads have a timestamp in the signature. What's the MAX acceptable staleness for a Bobby resolution? Bobby's trades resolve within minutes-to-hours — propose a window (e.g., 60s to 600s) and enforce in the contract. Document attack scenarios with stale payloads.

2. **Multi-signer requirement**: RedStone signatures can be configured to require N-of-M signers from a designated set. What N/M does Bobby need? (1/3 is RedStone default; 3/5 is institutional). Trade-off: gas vs trust dispersal.

3. **PnL math precision**: `pnlBps` is `int128`. RedStone returns `uint256` numeric values with 8-decimal default. Math: `pnlBps = (resolvePrice - entryPrice) * 10000 / entryPrice` for LONG, opposite for SHORT. What overflow / precision edge cases? Negative-price futures? Int128 saturation?

4. **Symbol registry**: should symbols be owner-registered (current sketch) or anyone-registered with a stake? V3 leans owner. P2 could open it. Confirm.

5. **Direction source of truth**: in the sketch, `direction` is a function parameter. But that's untrusted input. Propose: read direction from the BobbyIntentEscrow `trades(intentHash)` via a view call, OR include it in the intent context that the keeper passed in. The cleanest: have BobbyIntentEscrow expose a `getTradeContext(intentHash)` view that returns the canonical direction.

6. **Re-resolution / overrideResolution interaction**: BobbyIntentEscrow has `overrideResolution()` (R2-001 owner challenge window). After RedStone-based resolution, owner can still override within the window. Confirm flow doesn't break and ResolutionOverridden event still fires.

7. **Failure mode: oracle goes down**: if RedStone gateway is unreachable, no resolutions can happen until it returns. Acceptable degradation? Or do we need a fallback to manual resolver (the legacy EOA path)? V3 P2 says: keep the override path as fallback.

### B. Gas / storage final review

Now that BobbyIntentEscrow.sol is post-Round 2, verify the storage layout is optimal:

```solidity
struct Trade {
    TradeState state;          // uint8 (1 byte, packs)
    address trader;            // 20 bytes
    bytes32 debateHash;        // 32 bytes (own slot)
    uint40 executedAt;         // 5 bytes
    uint40 resolvedAt;         // 5 bytes
    int128 pnlBps;             // 16 bytes
    bytes32 resolveHash;       // 32 bytes (own slot)
}
```

8. Pack layout: can we get this into 3 storage slots? Current is ≥4. Worth the gas savings vs readability?

9. `mapping(bytes32 => Trade) public trades`: each trade write is 3-4 SSTOREs. Estimate gas for full execute + resolve cycle on X Layer (~1s blocks, low gas, but still). Optimize?

10. Event indexing: `IntentExecuted` has 3 indexed args. Is `bytes32 debateHash` (non-indexed) frequently queried? Indexer perspective.

### C. Deployment runbook (output a markdown file)

You generate `docs/deployment/intent-escrow-runbook.md` covering:

11. Constructor args ordering + values for testnet vs mainnet:
    - testnet: `_chainIdExpected = <X Layer testnet ID>`, `_maxSizeUsd = 100_000e18`, owner = test multisig, etc.
    - mainnet: `_chainIdExpected = 196`, `_maxSizeUsd = 1_000_000e18` (suggested), owner = production Safe 2-of-3.
12. Deploy order:
    a. Deploy `BobbyIntentEscrow` with EOA resolver placeholder (e.g., owner address).
    b. Deploy `BobbyResolverV1`.
    c. `BobbyResolverV1.registerSymbol(BTC, redstoneFeedId)` etc.
    d. `BobbyIntentEscrow.rotateRole("resolver", address(BobbyResolverV1))`.
13. Verification on OKLink (X Layer): exact `forge verify-contract` invocations + Etherscan-equivalent metadata.
14. Pause activation: `setPaused(true)` immediately post-deploy. Unpause only after rotateRole + registerSymbol calls confirmed on indexer.
15. Rollback procedure: if RedStone gateway has issues post-launch, owner can `rotateRole("resolver", emergencyEOA)`. Document the criteria for this.

### D. New invariant tests (extend Round 2 suite)

You add to `BobbyIntentEscrowInvariantTest.t.sol` OR create `BobbyResolverV1.t.sol`:

16. **Invariant**: a trade can only be RESOLVED via the registered resolver address.
17. **Invariant**: post-resolution, `pnlBps` is bounded by the change between `entryPrice` and `resolvePrice` (reject impossible values).
18. **Vector**: stale RedStone payload (older than `maxStaleness`) reverts.
19. **Vector**: forged RedStone signature reverts.
20. **Vector**: registerSymbol → rotateRole → resolveWithRedStone happy path.
21. **Vector**: ownerOverrideResolution still works post RedStone resolution within challenge window.
22. **Vector**: RedStone gateway returning extreme prices (1e30, 0) — reject or saturate? Document.

### E. Migration playbook

23. If we deploy `BobbyResolverV1` and later need `V2` (e.g., adding multi-oracle aggregation):
    - Old in-flight EXECUTED trades resolve via V1.
    - New trades use V2 once `rotateRole` happens.
    - No state migration needed since resolver is stateless on the escrow side.
    Confirm this is correct.

24. If RedStone deprecates the gateway: contingency. Multi-oracle support deferred to V2 or built-in to V1?

### F. Verdict

Final answer:
- **Mainnet-deployable as-is after applying Round 3 changes?** Y/N + 1 line why.
- **What testnet shakedown is required first?** Concrete checklist.
- **What monitoring/alerts must be in place pre-mainnet?** (e.g., RedStone gateway uptime alerts, stale payload alerts, override events).

## Format expected

```markdown
## Summary (90 words)

## A. BobbyResolverV1 design
(answer Q1-7 with concrete contract code)

## B. Gas/storage review
(Q8-10)

## C. Deployment runbook
(full file: docs/deployment/intent-escrow-runbook.md)

## D. New invariants/vectors
(full new test cases)

## E. Migration playbook
(Q23-24)

## F. Verdict
- Mainnet-deployable after R3 changes: Y/N
- Testnet shakedown checklist
- Monitoring/alerts checklist
```

You're closing the audit. Be exhaustive. If anything is unclear, call it out — Round 3 is the last review before real money moves.
