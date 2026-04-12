# BRIEF FOR CODEX: Hardness Finance Layer — Smart Contract Generalization

## Context
Bobby Protocol has 4 deployed contracts on X Layer (196) that currently serve Bobby's 3-agent trading system. We want to generalize these into **public primitives** that ANY AI agent can use. The concept: "Hardness Finance" — a conviction hardness layer where any agent's decisions are pressure-tested before execution.

## What Exists Today

### Contract 1: BobbyAgentEconomyV2 (0xD954...)
- `payMCPCall(bytes32 challengeId, string toolName) payable` — x402 payments
- Hardcoded recipients: alphaHunter, redTeam, cio addresses
- Tracks: totalMCPCalls, totalDebates, totalVolume, totalPayments
- Anti-replay: challengeConsumed[bytes32] mapping

**Problem**: Recipients are hardcoded to Bobby's 3 agents. Can't serve other protocols.

### Contract 2: BobbyTrackRecord (0xF841...)
- Commit-reveal: `commitTrade(debateHash, symbol, agent, conviction, entry, target, stop)`
- Resolve: `resolveTrade(debateHash, pnlBps, result, exitPrice)` with timing enforcement
- Permissionless cleanup: `expireCommitment(debateHash)` after 30-day TTL
- `onlyBobby` modifier restricts who can commit

**Problem**: Only Bobby can commit. Other agents can't use it.

### Contract 3: BobbyConvictionOracle (0x03FA...)
- `publishSignal(SignalInput)` — writes latest conviction per symbol
- `getConviction(symbol) view` — permissionless read with TTL expiry
- Paginated `getSignals(offset, limit)`
- `onlyBobby` restricts who publishes

**Problem**: Only Bobby can publish signals. Should be multi-agent.

### Contract 4: BobbyAdversarialBounties (0xa800...)
- `postBounty(threadId, dimension, claimWindowSecs) payable` — permissionless
- `submitChallenge(bountyId, evidenceHash)` — permissionless
- `resolveBounty(bountyId, winner)` — onlyResolver (single address)
- Pull-payment withdrawal pattern
- 6 dimensions: DATA_INTEGRITY, ADVERSARIAL_QUALITY, DECISION_LOGIC, RISK_MANAGEMENT, CALIBRATION_ALIGNMENT, NOVELTY

**Problem**: Single resolver is centralized. No multi-sig or DAO governance.

## What We Need: HardnessRegistry V1

A single new contract (or minimal upgrade set) that generalizes Bobby's primitives into a public hardness layer.

### Requirements

**1. Multi-Agent Track Record (generalized TrackRecord)**
- Any registered agent can `commitPrediction(bytes32 predictionHash, string symbol, uint8 conviction, uint96 entry, uint96 target, uint96 stop)`
- Agent ID stored with each commitment (not just "Bobby")
- Resolution can be triggered by the committing agent OR a permissionless oracle
- Leaderboard: `getAgentStats(address agent)` returns wins/losses/winRate
- Event: `PredictionCommitted(address agent, bytes32 hash, string symbol, uint8 conviction)`

**2. Multi-Agent Signal Feed (generalized ConvictionOracle)**
- Any registered agent can `publishSignal(string symbol, uint8 direction, uint8 conviction, bytes32 context)`
- Signals tagged with agent address (not "Bobby")
- Consumers can filter by agent: `getSignal(address agent, string symbol)`
- Aggregation: `getConsensus(string symbol)` averages across all agents
- Event: `SignalPublished(address agent, string symbol, uint8 direction, uint8 conviction)`

**3. Agent Service Registry (generalized AgentEconomy)**
- Any agent registers: `registerService(string serviceId, uint256 priceWei, address recipient)`
- Payment: `payForService(bytes32 challengeId, string serviceId) payable`
- Revenue tracking per service per agent
- Event: `ServicePayment(address payer, address recipient, string serviceId, uint256 amount)`

**4. Multi-Resolver Bounties (upgrade AdversarialBounties)**
- Keep current bounty flow but allow multiple resolvers
- Resolution requires N-of-M resolver signatures OR DAO vote
- Or: time-locked resolution with challenge period

### Architecture Decision: Upgrade vs. New Deploy

Option A: Deploy new HardnessRegistry contract with all 4 modules
- Pro: Clean design, no legacy baggage
- Con: Lose existing on-chain history (2 txs)

Option B: Deploy alongside existing contracts, add bridge
- Pro: Keep proofs, gradual migration
- Con: More complexity

**Recommendation**: Option A. 2 txs of history isn't worth the complexity. Deploy fresh, reference old contracts in docs as "Bobby v1 proofs."

### Security Requirements
1. 3-round audit before deploy (self → adversarial → Codex)
2. All functions reentrancy-safe (checks-effects-interactions or ReentrancyGuard)
3. Ownable2Step for ownership
4. Pausable for emergency
5. Pull-payment pattern for all withdrawals
6. No delegatecall, no selfdestruct
7. Foundry tests: 50+ tests covering all state transitions

### Gas Budget
- Target: < 100K gas per commitPrediction
- Target: < 80K gas per publishSignal  
- Target: < 150K gas per payForService
- X Layer gas is cheap (~0.001 OKB per tx)

### Deliverable
- `contracts/src/HardnessRegistry.sol` — single contract or modular system
- `contracts/test/HardnessRegistry.t.sol` — Foundry tests
- Deploy script for X Layer (chain 196)
- ABI JSON for frontend integration

### Timeline
- Review this brief: 30 min
- Implementation: 2-4 hours
- Testing: 1-2 hours
- Security review rounds: 1 hour each
- Deploy: 30 min
