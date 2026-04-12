# BRIEF FOR CODEX + GEMINI: Hardness Finance Architecture Improvements

## Context
Bobby Protocol is now positioned as "Hardness Finance" — the Trading Harness for AI agents. We have 5 smart contracts live on X Layer including the new HardnessRegistry V1 (0xD89c1721CD760984a31dE0325fD96cD27bB31040). The architecture mirrors Claude Code's harness pattern: a central coordinator (Harness) connecting Tools/MCP, Session (on-chain state), Sandbox (debate chamber), and Orchestration (cycle engine).

The landing page now has an animated interactive diagram showing this architecture. We need to improve both the contracts and the off-chain infrastructure.

## Current Architecture

```
         ┌──────────────────────────────────┐
         │    TOOLS + MCP / x402            │
         │    15 tools, Streamable HTTP     │
         │    Any agent calls via JSON-RPC  │
         └──────────────┬───────────────────┘
                        │
  ┌─────────────┐    ┌──┴──────────────┐    ┌──────────────┐
  │   SESSION   │◄──►│    HARNESS      │◄──►│   SANDBOX    │
  │  On-chain   │    │  HardnessReg    │    │  Debate      │
  │  State      │    │  0xD89c...1040  │    │  Chamber     │
  │             │    │                 │    │              │
  │ TrackRecord │    │ Coordinator:    │    │ Alpha Hunter │
  │ Oracle      │    │ Agents, Svc,    │    │ Red Team     │
  │ Stats       │    │ Predictions,    │    │ CIO          │
  │ Commerce    │    │ Signals,        │    │ Judge Mode   │
  └─────────────┘    │ Bounties        │    └──────────────┘
                     └──────┬──────────┘
                            │
         ┌──────────────────┴───────────────┐
         │       ORCHESTRATION              │
         │       bobby-cycle.ts             │
         │       Signal→Debate→Judge→       │
         │       Execute→Prove (8h loop)    │
         └──────────────────────────────────┘
```

## What Needs Improvement

### For Codex (Smart Contracts)

**1. HardnessRegistry — Wire to existing Bobby contracts**
Currently HardnessRegistry is deployed but isolated from Bobby's existing 4 contracts. We need:
- Bobby's cycle to use HardnessRegistry.commitPrediction() instead of (or in addition to) TrackRecord.commitTrade()
- Bobby to register as an agent on HardnessRegistry: `registerAgent("ipfs://bobby-metadata")`
- Bobby to register its 5 premium tools as services on HardnessRegistry
- Bobby to publish signals to HardnessRegistry.publishSignal() in addition to ConvictionOracle

**2. Hardness Score calculation on-chain**
The `publishSignal` function accepts a `hardnessScore` but it's passed by the caller (trust-based). We need:
- Either: a trusted scorer role that can attest hardness scores (like Judge Mode)
- Or: compute hardness score on-chain from debate metadata (too expensive, probably)
- Recommendation: Add a `setHardnessScorer(address)` role that can call `certifyHardness(bytes32 predictionHash, uint8 hardnessScore)`

**3. Agent Staking / Reputation**
Currently agents register for free. To prevent sybil:
- Require minimum stake (0.01 OKB) to register as agent
- Slash stake if agent's predictions are consistently wrong (win rate < 30% after 10 predictions)
- Or: reputation-weighted signals (agents with higher win rates get more weight in getConsensus)

**4. Cross-contract event indexing**
Both HardnessRegistry and the legacy contracts emit events. We need a unified event format so a single indexer can track all activity. Suggestion: emit a standard `HardnessEvent(address agent, string eventType, bytes data)` from all contracts.

### For Gemini (Architecture & Design)

**1. Harness-as-a-Service API**
Design an API endpoint that lets ANY agent submit a prediction for hardness testing:
```
POST /api/hardness-test
{
  "agent": "0x...",
  "prediction": {
    "symbol": "BTC",
    "direction": "long",
    "conviction": 7,
    "entry": 83000,
    "target": 95000,
    "stop": 78000,
    "thesis": "BTC breaking out of 6-month range..."
  }
}
```
Bobby runs the prediction through its 3-agent debate + Judge Mode and returns:
```
{
  "hardnessScore": 72,
  "dimensions": { ... },
  "debateId": "...",
  "recommendation": "execute",
  "biasesDetected": ["anchoring"],
  "onChainProof": "0x..." // predictionHash committed to HardnessRegistry
}
```

**2. Multi-Agent Consensus Dashboard**
Design a dashboard that shows ALL registered agents and their signals in real-time:
- Agent leaderboard by win rate
- Signal agreement/disagreement matrix (do agents agree on BTC direction?)
- Hardness distribution (how many agents produce hardness > 60?)
- Trend: is average hardness increasing over time?

**3. Economic Model for Hardness-as-a-Service**
- How much should hardness testing cost? (Current: 0.001 OKB per MCP call)
- Should there be a premium tier? (Full debate + judge = 0.01 OKB, quick score = 0.001 OKB)
- Revenue split: if Bobby earns by hardness-testing other agents' predictions, how does revenue flow?

**4. Interop with other oracle networks**
Bobby's ConvictionOracle stores latest-per-symbol. Can we:
- Push hardened signals to Chainlink (via Chainlink Functions)?
- Publish to Pyth (via PYTHNET)?
- Create a standard "Hardness Oracle" that other protocols can read?
- ERC-7726 or similar standard for cross-protocol signal feeds?

**5. Agent Identity Standard**
The HardnessRegistry uses `registerAgent(metadataURI)`. Define a standard:
```json
{
  "name": "Bobby Protocol",
  "version": "3.0.0",
  "type": "trading-agent",
  "capabilities": ["debate", "judge", "predict", "bounty"],
  "mcp_endpoint": "https://bobbyprotocol.xyz/api/mcp-http",
  "contracts": {
    "hardnessRegistry": "0xD89c...",
    "economy": "0xD954..."
  },
  "track_record": {
    "total_predictions": 0,
    "win_rate_bps": 0
  }
}
```

**6. Sandbox Isolation Guarantees**
Currently the "sandbox" is just LLM calls. For true isolation:
- Should debate agents run in separate sandboxes (different API keys, different contexts)?
- Should there be a "clean room" mode where agents can't see each other's outputs?
- How do we prevent information leakage between Alpha Hunter and Red Team?

## Deliverables

### Codex
1. Wire HardnessRegistry into bobby-cycle.ts (register agent, commit predictions, publish signals)
2. Add `certifyHardness` role for trusted hardness scoring
3. Agent staking design (minimum stake + slashing spec)
4. Unified event format across all contracts

### Gemini
1. Hardness-as-a-Service API design document
2. Multi-Agent Consensus Dashboard wireframes
3. Economic model analysis (pricing, revenue split, incentive alignment)
4. Interop strategy with oracle networks
5. Agent identity standard specification
6. Sandbox isolation architecture

## Constraints
- Deadline: April 15, 2026 (2 days remaining)
- X Layer mainnet (chain 196)
- Must not break existing Bobby contracts or live endpoints
- HardnessRegistry is deployed and immutable — changes via new contracts or admin functions only
- Budget: minimal OKB for gas (deploy new contracts if needed)

## Priority for Hackathon (next 48h)
P0: Wire HardnessRegistry into bobby-cycle (generates on-chain activity)
P0: Hardness-as-a-Service API endpoint (demo-able for judges)
P1: Agent registration on HardnessRegistry (Bobby as first agent)
P1: Multi-agent dashboard concept
P2: Everything else (post-hackathon roadmap)
