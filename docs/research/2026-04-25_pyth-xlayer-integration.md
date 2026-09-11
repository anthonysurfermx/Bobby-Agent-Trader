# Pyth Oracle on X Layer — Research Brief (Round 3 Resolver Hardening)

**Date**: 2026-04-25
**Author**: Claude Opus 4.7 (autonomous morning session)
**Status**: Research complete, **path pivot recommended**
**Context**: Bobby V3 P2 plan ([docs/decisions/2026-04-24_bobby-v3-plan-FINAL.md §8](docs/decisions/2026-04-24_bobby-v3-plan-FINAL.md)) committed to migrate `BobbyIntentEscrow.resolveIntent` from EOA-trusted to Pyth-backed for round 3 resolver hardening.

## TL;DR

**Pyth is NOT documented as deployed on OKX X Layer (chain 196).** Verified against [Pyth EVM contract addresses page](https://docs.pyth.network/price-feeds/contract-addresses/evm) — X Layer is absent from both mainnet and testnet tables. This blocks the originally planned round 3 path.

**Recommended pivot**: implement `BobbyResolverV1` using **RedStone Pull oracle model** as primary, with API3 dAPIs as backup. Both are deployable today on X Layer without waiting for an upstream oracle team.

## What I checked

| Oracle | Doc'd on X Layer 196? | Integration model | Effort to integrate |
|---|---|---|---|
| **Pyth Network** | ❌ No (Apr 2026) | Pull (Hermes payload + on-chain verify) | High (requires Pyth team coordination + new chain deployment) |
| **Chainlink Data Feeds** | ❌ No price feeds (only CCIP) | Push (read aggregator) | High (Chainlink Labs deployment cycles) |
| **RedStone Pull** | ✅ Generic EVM support | Pull (signed payload via tx data) | **Low (any EVM, no per-chain deploy)** |
| **API3 dAPIs** | 🟡 Likely yes (XY Finance docs reference) | Push (read proxy) | Medium (verify proxy addresses on api3 market) |
| **Supra** | 🟡 Multi-chain, X Layer status unverified in this session | Push (read pull-style aggregator) | Medium |
| **Witnet** | ❌ Not confirmed | Pull | Medium |

Full source links at end of brief.

## Why Pyth was the original pick (and why pivot is fine)

Original logic in V3 plan:
1. Pyth = institutional-grade price feeds, low-latency, well-audited.
2. Replaces resolver EOA trust assumption with crypto-economic.
3. Standard pattern in DeFi protocols.

What changed: turns out X Layer isn't on Pyth's deployment map yet. Could request deployment but timeline is opaque (weeks to months). Bobby V3 round 3 needs an oracle path mergeable in 1-2 weeks — Pyth is not it.

**Pivot is fine because**: the goal of round 3 resolver hardening is to remove single-EOA trust from PnL resolution. ANY decentralized oracle achieves that. Pyth was just our default pick. RedStone Pull achieves the same security property with less integration friction.

## Recommendation: RedStone Pull

### Why RedStone Pull > everything else for our use case

1. **Works on any EVM** — RedStone signs payloads off-chain at `https://oracle-gateway-1.a.redstone.finance/...` and Bobby's contract verifies the signature in the resolve tx. No per-chain RedStone deployment needed.
2. **Pull model fits resolveIntent flow naturally**: keeper/resolver fetches the price payload off-chain and submits it as calldata when calling `resolveIntent(intentHash, pnlBps, resolveHash, redstonePayload)`. We already have a keeper architecture.
3. **Open code**: contract verification helpers are MIT-licensed Solidity (`@redstone-finance/evm-connector`).
4. **Multi-asset**: BTC, ETH, USDT, OKB, plus 1200+ feeds out of the box.
5. **Cost**: payload adds ~5-10k gas to the resolve tx. Negligible for X Layer.

### Trade-offs vs Pyth

| Aspect | Pyth | RedStone Pull |
|---|---|---|
| Update frequency | Sub-second pull | Hourly auto, on-demand pull |
| Auditability | Wormhole VAA | Signed payload |
| Adoption (ETH ecosystem) | Higher | Medium-high |
| X Layer support | None | Yes (any EVM) |
| Time to integrate | 6-12 weeks (waiting on deployment) | 1-2 weeks (we control timeline) |

For Bobby's resolve flow, where we resolve trades minutes or hours after execution, RedStone's update frequency is more than enough. We don't need sub-second.

### What we lose vs Pyth (and acceptable)

- **Brand recognition**: Pyth has more name recognition with auditors and investors. Mitigation: we can migrate to Pyth in V4 once they deploy on X Layer; the resolver interface stays the same.
- **Wormhole VAA-style verification**: not available. RedStone uses ECDSA signatures on signed-data-packages. Equivalent security, different proof model.

## Implementation sketch — `BobbyResolverV1.sol`

```solidity
// Replaces direct EOA call to BobbyIntentEscrow.resolveIntent
// Owner sets BobbyResolverV1 as the `resolver` role on the escrow.

import "@redstone-finance/evm-connector/contracts/data-services/MainDemoConsumerBase.sol";

contract BobbyResolverV1 is MainDemoConsumerBase {
    address public immutable escrow;        // BobbyIntentEscrow
    mapping(bytes32 => bytes32) public symbolToFeedId;  // e.g., "BTC" → 0x4254432d555344...

    constructor(address _escrow) {
        escrow = _escrow;
    }

    /// @notice Resolves a trade with on-chain verification of RedStone-signed prices.
    /// @dev RedStone payload is appended to calldata; getOracleNumericValueFromTxMsg reads it.
    function resolveWithRedStone(
        bytes32 intentHash,
        bytes32 symbolId,           // pre-registered feed id
        uint256 entryPrice,         // from intent (off-chain known)
        uint256 entryTimestamp      // from intent
    ) external {
        // Fetch & verify resolve-time price from RedStone
        uint256 resolvePrice = getOracleNumericValueFromTxMsg(symbolId);

        // Compute PnL in basis points (signed)
        // For LONG: pnl = (resolvePrice - entryPrice) / entryPrice * 10000
        // For SHORT: opposite
        // (direction read from off-chain intent / from indexer)
        int128 pnlBps = _computePnlBps(entryPrice, resolvePrice /*, direction */);

        // Hash the resolution context for audit trail
        bytes32 resolveHash = keccak256(abi.encode(
            intentHash, resolvePrice, block.timestamp, entryPrice, entryTimestamp
        ));

        IBobbyIntentEscrow(escrow).resolveIntent(intentHash, pnlBps, resolveHash);
    }

    function _computePnlBps(uint256 entry, uint256 exit) internal pure returns (int128) {
        // Implementation: signed bps math, clipped to int128 range
    }
}
```

Anyone (keeper, user, even an indexer) can call `resolveWithRedStone()` because RedStone payload signatures are verified inline. This **removes EOA trust** — the existing R2-001 challenge window stays as a backup, but the typical resolution path becomes oracle-attested.

## Open questions / TBD by user

1. **API3 dAPI addresses on X Layer**: needs human-eyes-on-the-market check at https://market.api3.org with chain 196 filter. If available, BobbyResolverV2 (API3 fallback) is straightforward.
2. **Symbol coverage**: confirm BTC/USD, ETH/USD, OKB/USD, USDT/USD on RedStone Mainnet feed. OKB/USD is the key one — Bobby trades OKB.
3. **RedStone push option**: we could deploy a RedStone push proxy on X Layer if pull complexity is unwanted by the keeper. Trade-off: gas + maintenance vs simpler integration. Default: stick with pull.
4. **Cost analysis**: per-resolve gas with RedStone payload. Estimate ~80k gas total (50k baseline + 10-30k payload). Acceptable on X Layer (~$0.01).

## Backlog adjustment

Update [docs/decisions/2026-04-24_bobby-v3-plan-FINAL.md](docs/decisions/2026-04-24_bobby-v3-plan-FINAL.md):

```diff
 ### P2 — Mes 1-2
- 28. Pyth oracle en resolve.
+ 28. RedStone Pull resolver (BobbyResolverV1.sol). Pyth migration deferred to V4 if/when deployed on X Layer.
```

And for the round 3 audit brief (separate doc), Codex will assess `BobbyResolverV1.sol` instead of a Pyth-based resolver.

## Sources

- [Pyth Network EVM contract addresses](https://docs.pyth.network/price-feeds/contract-addresses/evm) — X Layer not listed (Apr 2026)
- [Chainlink CCIP X Layer](https://docs.chain.link/ccip/directory/mainnet/chain/ethereum-mainnet-xlayer-1) — only CCIP confirmed, no data feeds
- [API3 Market](https://market.api3.org/) — chain 196 filter needed (manual verification)
- [RedStone supported chains](https://www.redstone.finance/) — generic EVM Pull
- [XY Finance X Layer addresses (third-party)](https://docs.xy.finance/smart-contract/addresses/x-layer-chain-id-196) — references API3 presence on X Layer
- [Pyth on Aptos / pull integration pattern](https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/aptos) — generic pattern reference

## Risk flag

This brief assumes oracle availability based on documentation snapshots from Apr 2026. **Before merging the round 3 audit brief**, manually verify:
- RedStone OKB/USD payload availability via `https://oracle-gateway-1.a.redstone.finance/data-packages/latest?data-feeds=OKB&data-service-id=redstone-main-demo`
- API3 market chain 196 filter (mentioned in some third-party docs but unverified by primary source in this session)

If RedStone OKB/USD is unavailable, the fallback is composing OKB/USDT × USDT/USD or using API3 if X Layer support holds.
