# Bobby Hardness Finance Layer — Architecture Manifesto

## One-Line Definition
A runtime that receives financial intentions from agents, transforms them into structured specs, pressure-tests them adversarially, applies policy, publishes proof on-chain, and learns from outcomes.

## Four Immutable Principles

### 1. No Free-Form Execution
Nothing executes without a structured HardnessSpec. An agent cannot say "long BTC" — it must declare symbol, direction, entry, target, stop, thesis, catalysts, and invalidation logic. The harness validates before anything enters the sandbox.

### 2. Policy Before Capital
Every action passes through a PolicyEngine before touching money or proof. The policy is stratified: org > protocol > agent > session. A prediction that scores hardness 80/100 but violates the agent's maxNotionalUsd policy is BLOCKED. Capital is never at risk without governance.

### 3. Proof Before Trust
Every meaningful decision leaves a verifiable anchor. On-chain: prediction commits, signal publications, payment receipts, bounty challenges. Off-chain: debate transcripts, judge artifacts, policy decisions, context snapshots. If you can't reconstruct WHY a decision was made, it didn't happen.

### 4. Outcomes Update Reputation
Every resolved prediction alters the agent's future weight. Win rate, calibration drift, overconfidence ratio, regime specialization — all derived from real outcomes, not claims. An agent that says "conviction 10/10" and loses is penalized more than one that says "conviction 5/10" and loses. Honesty about uncertainty IS hardness.

## Seven Runtime Layers

```
┌─────────────────────────────────────────────────────────┐
│                   AGENT APPS                            │
│         trading bots, DAOs, copilots, MCP apps          │
└───────────────────────┬─────────────────────────────────┘
                        │
                ┌───────┴────────┐
                │ 1. INTENT      │  Receive, authenticate, normalize
                │    GATEWAY     │  prompt → HardnessSpec
                └───────┬────────┘
                        │
                ┌───────┴────────┐
                │ 2. CONTEXT     │  Load hot/cold memory
                │    ENGINE      │  Market snapshot, track record
                └───────┬────────┘
                        │
                ┌───────┴────────┐
                │ 3. SANDBOX     │  Isolated adversarial testing
                │    RUNTIME     │  Alpha → Red → CIO → Judge
                └───────┬────────┘
                        │
                ┌───────┴────────┐
                │ 4. POLICY      │  Stratified governance
                │    ENGINE      │  allow / reduce / paper / block
                └───────┬────────┘
                        │
                ┌───────┬────────┐
        ┌───────┴──┐ ┌──┴───────┐
        │ 5. PROOF │ │ 6. RISK  │  On-chain anchors + treasury
        │   ENGINE │ │  /TREASURY│  Capital preservation
        └───────┬──┘ └──┬───────┘
                └───┬───┘
                    │
                ┌───┴────────────┐
                │ 7. LEARNING    │  Outcomes → reputation
                │    ENGINE      │  Calibration → future weight
                └────────────────┘
```

### Layer 1: Intent Gateway
- Receives agent intention (evaluate_trade, publish_signal, rebalance)
- Authenticates via wallet signature (EIP-191) or demo mode
- Normalizes into HardnessSpec (strict schema validation)
- **Implementation**: `POST /api/orchestrate`, `POST /api/agents/register`

### Layer 2: Context Engine
- Loads minimum useful context (not everything)
- Hot memory: prices, signals, positions, regime
- Cold memory: track record, past mistakes, reputation
- **Implementation**: HardnessContext packet in bobby-cycle, OnchainOS smart money data

### Layer 3: Sandbox Runtime
- Isolated adversarial debate chamber
- Alpha sees only spec + context (proposes thesis)
- Red Team sees spec + Alpha's conclusion only (attacks — blind adversarialism)
- CIO sees full transcript (decides)
- Judge enters last (scores quality, not market direction)
- **Implementation**: `orchestrate.ts` isolated debate flow

### Layer 4: Policy Engine
- Stratified policies: org > protocol > agent > session
- Evaluates: allowed symbols, min hardness score, max notional, require judge
- Output: allowed | allowed_with_reduction | paper_only | blocked
- High-risk approval gate: R/R < 1.0 or notional > $50K requires acknowledgment
- **Implementation**: `evaluatePolicy()` in hardness-control-plane, riskPolicy per agent

### Layer 5: Proof Engine
- On-chain: HardnessRegistry (commitPrediction, publishSignal), legacy Bobby contracts
- Off-chain: Supabase sessions, debate artifacts, judge verdicts
- Every proof links: session → prediction → signal → outcome
- **Implementation**: `recordHardnessActivity()`, hardness_agent_proofs table

### Layer 6: Risk / Treasury
- Asset-liability matching (pull-payment, no custody)
- Position sizing by conviction × policy limits
- Agent staking (0.01 OKB anti-sybil)
- Slashing for consistently wrong agents
- **Implementation**: HardnessRegistry V1.1 (staking, slashAgent)

### Layer 7: Learning Engine
- Outcome resolution updates agent stats
- Calibration drift tracking (conviction vs result)
- Bias recurrence analysis
- Symbol/regime specialization scoring
- **Implementation**: corrections block in bobby-cycle, getAgentOutcomeStats

## Contracts on X Layer (196)

| Contract | Address | Layer |
|----------|---------|-------|
| HardnessRegistry V1.1 | 0x95D045b1488F0776419a0E09de4fc0687AbbAFbf | 1,5,6 |
| AgentEconomyV2 | 0xD9540D770C8aF67e9E6412C92D78E34bc11ED871 | 5 |
| ConvictionOracle | 0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A | 5 |
| TrackRecord | 0xF841b428E6d743187D7BE2242eccC1078fdE2395 | 5,7 |
| AdversarialBounties | 0xa8005ab465a0e02cb14824cd0e7630391fba673d | 6 |

## API Surface

| Endpoint | Method | Layer |
|----------|--------|-------|
| /api/agents/register | POST | 1 (Intent) |
| /api/orchestrate | POST | 1,2,3,4,5 (Full pipeline) |
| /api/hardness-test | POST | 1,3,4 (Quick test) |
| /api/agents/:id | GET | 7 (Learning) |
| /api/agents/:id/activity | GET | 5 (Proof) |
| /api/network/consensus | GET | 7 (Learning) |
| /api/network/overview | GET | 7 (Learning) |
| /api/mcp-http | POST | 1 (Intent via MCP) |
| /api/protocol-heartbeat | GET | 5,6 (Proof/Risk) |

## The Positioning

Bobby is not a trading agent.
Bobby is the financial operating system for agents.

**"Connect any AI agent. Bobby stress-tests, governs, proves, and tracks every financial decision."**

Or more precisely:

**"Hardness Finance is the Financial Firewall for the Age of Agents."**
