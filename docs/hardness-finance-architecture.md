# Hardness Finance Architecture Notes

## What ships now

### P0 shipped
- `api/bobby-cycle.ts` now mirrors Bobby's legacy X Layer writes into `HardnessRegistry`:
  - `registerAgent()` bootstrap via recorder wallet
  - `registerService()` for Bobby premium tools
  - `commitPrediction()` for trade cycles
  - `publishSignal()` for trade and no-trade cycles
- `api/hardness-test.ts` exposes a demoable Hardness-as-a-Service endpoint for judges and external agents.
- `api/agent-identity.ts` publishes a machine-readable Bobby identity document.
- `api/registry.ts` now advertises `hardnessRegistry`, `hardnessTest`, and `agentIdentity`.

## What cannot be added directly to HardnessRegistry V1

`HardnessRegistry` is already deployed and immutable at `0xD89c1721CD760984a31dE0325fD96cD27bB31040`.

That means these features are **V2 / adapter work**, not admin toggles:
- `setHardnessScorer(address)` role
- mandatory staking at registration time
- slashing logic
- new standardized event emitted by legacy contracts

## Recommended V1.5 adapters

### 1. HardnessScorerAdapter
- New contract, not a mutation of `HardnessRegistry`.
- Stores `predictionHash => scorer => hardnessScore`.
- Emits:
  - `HardnessCertified(bytes32 predictionHash, address scorer, uint8 hardnessScore, bytes32 reportHash)`
- Permission model:
  - `owner` manages approved scorers
  - first scorer should be Bobby Judge Mode
- Off-chain indexer joins:
  - `HardnessRegistry.PredictionCommitted`
  - `HardnessScorerAdapter.HardnessCertified`

### 2. AgentStakeVault
- Separate vault contract keyed by `agent`.
- Registration remains cheap in V1, but consumers can require `minActiveStake`.
- Suggested flow:
  1. Agent stakes `0.01 OKB`
  2. Vault marks `staked = true`
  3. API / dashboards only surface agents with active stake
- Slashing rule:
  - only after `>= 10` resolved predictions
  - if `winRateBps < 3000`, slash `10%`
  - cooldown: one slash per 7 days

### 3. Unified Event Indexer
- Do **not** try to retrofit a universal event into immutable contracts.
- Instead normalize off-chain into:

```ts
type HardnessEvent = {
  sourceContract: string;
  chainId: 196;
  agent?: string;
  eventType:
    | 'service_registered'
    | 'service_payment'
    | 'prediction_committed'
    | 'prediction_resolved'
    | 'signal_published'
    | 'bounty_posted'
    | 'bounty_challenged'
    | 'bounty_resolved'
    | 'legacy_track_commit'
    | 'legacy_oracle_signal'
    | 'legacy_mcp_payment';
  entityId: string;
  txHash: string;
  blockNumber: number;
  payload: Record<string, unknown>;
};
```

## Hardness-as-a-Service API

### Endpoint
- `POST /api/hardness-test`

### Request
```json
{
  "agent": "0xabc...",
  "prediction": {
    "symbol": "BTC",
    "direction": "long",
    "conviction": 7,
    "entry": 83000,
    "target": 95000,
    "stop": 78000,
    "thesis": "BTC is breaking a 6-month range..."
  }
}
```

### Response shape
- `hardnessScore`
- `dimensions`
- `alpha`
- `redTeam`
- `cio`
- `biasesDetected`
- `onChainProof`

## Dashboard concept

### Panels
- Agent leaderboard: win rate, total resolved, active stake
- Consensus matrix: `BTC / ETH / SOL` by agent direction
- Hardness distribution: how many calls score `> 60`
- Recent proofs: latest `PredictionCommitted`, `SignalPublished`, `BountyResolved`

### Minimal data sources
- `HardnessRegistry` events
- Bobby v1 events
- Supabase debate threads
- `api/agent-identity`

## Economics

### Suggested pricing
- Quick score: `0.001 OKB`
- Full debate + CIO + Judge: `0.003 - 0.005 OKB`
- Premium review with on-chain commit + receipt: `0.01 OKB`

### Revenue split
- 50% Bobby protocol treasury
- 20% Alpha Hunter
- 20% Red Team
- 10% Judge / scorer budget

## Oracle interop

### Near-term
- Treat `HardnessRegistry` as the canonical proof rail on X Layer.
- Add an indexer/exporter that republishes hardened signals to:
  - Chainlink Functions consumer contracts
  - custom API feeds consumed by other protocols

### Post-hackathon
- Build a dedicated `HardnessOracleAdapter` for external consumption.
- Keep payload standard:
  - `symbol`
  - `direction`
  - `conviction`
  - `hardnessScore`
  - `predictionHash`
  - `expiresAt`

## Sandbox isolation roadmap

### V1
- Shared API credentials
- Shared process
- Prompt-role isolation only

### V2
- Separate API keys per role
- Clean-room execution per agent
- explicit no-peek policy:
  - Alpha cannot read Red output
  - Red only sees thesis and market packet
  - CIO reads both
  - Judge reads full transcript only after CIO verdict
