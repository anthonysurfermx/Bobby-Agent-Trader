# BRIEF FOR GEMINI: Hardness Finance — Architecture Review & Protocol Design

## Mission
Review Bobby Protocol's existing infrastructure and design the architecture for "Hardness Finance" — a public conviction hardness layer that any AI agent can plug into. Bobby becomes the FIRST agent on this layer, but the infrastructure is open to all.

## What is Hardness Finance?

In materials science, "hardness" is resistance to deformation under force. A diamond is hard because it doesn't yield under pressure.

In agent finance, "hardness" is resistance to bad decisions under adversarial pressure. A trade thesis is "hard" when it survives:
1. Three agents trying to destroy it (debate)
2. Six dimensions of quality audit (judge)
3. Economic challengers staking money to disprove it (bounties)
4. Historical calibration against past predictions (track record)

What survives all 4 layers is **hardened conviction** — a prediction that has been tested, scored, and proven.

## Current Architecture (Bobby v1)

```
SIGNAL LAYER (input)
├─ OKX OnchainOS smart money signals
├─ Polymarket consensus markets
├─ Technical indicators (10 indicators, regime-aware)
├─ Fear/Greed, DXY, funding rates
└─ Episodic memory (past mistakes)

HARDNESS LAYER (processing)
├─ Alpha Hunter → proposes thesis
├─ Red Team → attacks thesis
├─ CIO → decides conviction 1-10
├─ Judge Mode → scores on 6 dimensions (0-100)
├─ Calibration → adjusts conviction vs track record
└─ Risk Manager → position sizing

PROOF LAYER (output)
├─ ConvictionOracle.publishSignal() → on-chain feed
├─ TrackRecord.commitTrade() → commit-reveal prediction
├─ AgentEconomy.payMCPCall() → x402 payment proof
├─ AdversarialBounties.postBounty() → on-chain challenge
└─ Forum thread → public debate record

CONSUMPTION LAYER (downstream)
├─ 15 MCP tools over Streamable HTTP
├─ Sentinel agent demo (agent-to-agent)
├─ Telegram bot delivery
├─ Landing page real-time dashboard
└─ Activity feed + commerce logging
```

## What Needs Designing

### 1. Multi-Agent Hardness Protocol

Currently Bobby is the only agent in the system. We need to support:
- Agent A commits prediction → enters hardness chamber
- Bobby's 3 agents (or ANY registered hardness validators) pressure-test it
- Judge Mode scores the debate quality
- Result: "hardness score" (0-100) assigned to the prediction
- Score is published on-chain via ConvictionOracle
- Anyone can challenge via bounties

**Key question**: Should other agents go through Bobby's debate, or should each agent define their own hardness process?

**Recommendation**: Bobby defines the STANDARD hardness process (3-agent debate + 6-dimension judge). Other agents can:
- Option A: Submit their prediction to Bobby for hardness testing (Bobby as a service)
- Option B: Run their own hardness process and publish to the shared oracle (Bobby as infrastructure)
- Option C: Both — Bobby provides hardness-as-a-service AND the shared registry

### 2. Hardness Score Standard

Define a universal "hardness score" that any agent can produce and any protocol can consume:

```
HardnessScore {
  agent: address           // who produced it
  symbol: string           // what asset
  direction: uint8         // 0=neutral, 1=long, 2=short
  conviction: uint8        // 0-10 raw conviction
  hardnessScore: uint8     // 0-100 (post-adversarial)
  dimensions: {
    dataIntegrity: uint8       // 1-5
    adversarialQuality: uint8  // 1-5
    decisionLogic: uint8       // 1-5
    riskManagement: uint8      // 1-5
    calibration: uint8         // 1-5
    novelty: uint8             // 1-5
  }
  debateHash: bytes32      // reference to debate
  timestamp: uint64
  expiresAt: uint64
}
```

### 3. Economic Model

How does Hardness Finance generate revenue?

Current model (Bobby v1):
- 0.001 OKB per premium MCP tool call (x402)
- Bounty fees (minimum 0.001 OKB)
- Internal debate fees (0.0001 OKB per agent)

Proposed model (Hardness Finance):
- **Hardness-as-a-Service**: Agent pays X OKB to have its prediction hardness-tested by Bobby
- **Oracle subscription**: Protocols pay to read hardened signals from the ConvictionOracle
- **Bounty marketplace**: % fee on resolved bounties
- **Certification**: "Bobby Hardened" badge for agents that pass hardness threshold

### 4. Integration Patterns

How do other agents/protocols plug in?

```
Pattern 1: MCP Client → Bobby MCP Server
  Agent calls bobby_analyze via MCP → gets hardened analysis
  Already working. Just marketing.

Pattern 2: Smart Contract → ConvictionOracle
  Protocol reads getConviction("BTC") → gets latest hardened signal
  Already working. Need multi-agent support.

Pattern 3: Agent → TrackRecord → Leaderboard
  Agent commits prediction → resolves later → public track record
  Need to generalize onlyBobby → any registered agent.

Pattern 4: Anyone → AdversarialBounties
  Challenge any agent's prediction → economic accountability
  Already works. Need multi-resolver.
```

### 5. Competitive Moat

Why would agents use Bobby's hardness layer instead of building their own?

1. **Network effects**: More agents → better calibration data → better hardness scores
2. **Reputation**: Track record is shared, transparent, on-chain
3. **Economic incentive**: Bounty marketplace creates real $ accountability
4. **Standard**: Bobby defines THE hardness standard (like Mohs scale for minerals)
5. **First mover**: Bobby is the first — early agents build on Bobby's oracle

## Questions for Gemini

1. **Architecture**: Should HardnessRegistry be a single monolithic contract or a diamond/proxy pattern for upgradability?

2. **Multi-agent debate**: When Agent X submits a prediction for hardness testing, should Bobby's 3 agents always be the validators, or should there be a marketplace of validator sets?

3. **Oracle design**: The ConvictionOracle currently stores latest-per-symbol. For multi-agent, should it store latest-per-agent-per-symbol? What about aggregation (weighted average across agents)?

4. **Economic attack vectors**: 
   - Could an agent spam the oracle with bad signals to dilute quality?
   - Could bounty posters collude with resolvers?
   - How to prevent sybil attacks on the track record?

5. **Scalability**: X Layer is cheap but if 1000 agents each publish 10 signals/day, that's 10K txs/day. Is on-chain storage the right pattern, or should we use events + off-chain indexing?

6. **Interop**: Should Bobby's hardness score be consumable by Chainlink, Pyth, or other oracle networks? What standard would that require?

## Deliverable
- Architecture document: system diagram + contract interfaces + integration patterns
- Security threat model: top 5 attack vectors + mitigations
- Economic analysis: fee structure + incentive alignment
- Phased rollout plan: what ships in 48h vs 2 weeks vs 1 month

## Constraints
- X Layer mainnet (chain 196)
- OKB native token for all payments
- Must be backwards-compatible with existing Bobby contracts (don't break live proofs)
- Hackathon deadline April 15 — Phase 1 must ship before then
- No off-chain dependencies for core hardness scoring (on-chain must be self-sufficient)
