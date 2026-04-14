# BRIEF FOR CODEX: b1nary ↔ Bobby Protocol Integration

## Context

**b1nary** (https://www.b1nary.app) is a simplified options protocol — users sell covered puts (USDC collateral) or covered calls (ETH/cbBTC collateral) to earn premium. Settlement is automatic weekly at 08:00 UTC. Currently live on Base, about to deploy on **X Layer (196)** — same chain as Bobby Protocol.

**Bobby** is the Adaptive Financial Control Plane for AI agents (6 contracts on X Layer, 19 MCP tools, 800+ txs, flywheels: Data → Memory → Trust → Policy → Entanglement).

**Hackathon context**: Build X Season 2 deadline April 15 23:59 UTC (≈48h out from now, 2026-04-14). Integration goal is to position Bobby as the **risk/conviction layer** that sits *in front* of b1nary — not to replace it. Any agent wanting to run the Wheel strategy on b1nary gets pressure-tested by Bobby's harness first.

## Product Positioning

> "b1nary is where yield happens. Bobby is what decides **if** yield should happen."

Concretely: b1nary exposes option vaults; Bobby exposes a decision layer (regime + conviction + guardrails) that any agent — human or autonomous — can call before committing collateral. Wheel strategy is mechanical but *when* to roll, *which strike*, and *whether to skip* are judgment calls. That's Bobby's territory.

This matches Bobby's existing pitch ("Frameworks are cheap. Bobby is what makes the harness worth running") without forcing a repositioning.

## What b1nary Exposes (assumptions, to verify)

From the llms.txt and public copy:

- **Put vault**: deposit USDC, pick strike, collect premium. Assignment if spot < strike at expiry.
- **Call vault**: deposit ETH/cbBTC, pick strike above spot, collect premium. Assignment if spot > strike.
- **Settlement**: weekly, 08:00 UTC, automatic via flash loans + swaps
- **Fee**: 4% on premium
- **Assets**: ETH, cbBTC (puts denominated in USDC)

**Unknowns to confirm with b1nary team before building**:
1. Are ABIs public? Where?
2. Strike granularity — fixed ladder or continuous?
3. Premium pricing — on-chain oracle, off-chain market maker, or AMM curve?
4. Partial fills / vault capacity per strike?
5. Events emitted on deposit/settlement/assignment?
6. Can positions be closed early or only held to expiry?
7. Do they expose a read-only view for available strikes + premiums, or only transactional?

These answers change the adapter shape materially — don't hand-wave them.

## Proposed Integration Scope

### Layer 1: Adapter (read-only first)

`src/lib/b1nary.ts`

- `getAvailableStrikes(asset: 'ETH' | 'cbBTC', side: 'PUT' | 'CALL')` → `{ strike, premium, expiry, capacity }[]`
- `getPositionStatus(positionId)` → `{ status, unrealizedPnl, daysToExpiry, assignmentRisk }`
- `getVaultStats(asset, side)` → TVL, avg premium, historical assignment rate
- Contract addresses + ABIs behind env vars (placeholder now, real values at deploy)

### Layer 2: MCP Tools (add to existing `/api/mcp-http`)

Three new tools, following the `bobby_*` naming convention already established:

**`bobby_wheel_evaluate`** (free tier)
- Input: `{ asset, side, strike, expiry, premium, positionSize }`
- Output: `{ verdict: "SELL" | "SKIP" | "WAIT", conviction: 0-100, reasoning, guardrailsTriggered: [] }`
- Internally: pulls current regime from existing intel snapshot, runs conviction check, applies wheel-specific guardrails (strike distance vs. spot, premium yield vs. expiry, collateral concentration)

**`bobby_wheel_positions`** (free)
- Input: `{ agentAddress }`
- Output: open b1nary positions + Bobby's ongoing verdict (HOLD / ROLL / CLOSE_EARLY_IF_POSSIBLE)

**`bobby_wheel_risk`** (premium via x402, 0.5 USDT)
- Input: `{ asset, proposedStrike, proposedCollateral, expiry }`
- Output: structured risk report — concentration, tail risk vs. historical regime, suggested strike adjustments
- Justifies premium tier by doing heavier computation (historical vol, regime-conditional assignment probability)

### Layer 3: Guardrails (extend existing harness)

Bobby already has 11 guardrails with Execute/Park/Block outcomes. Add wheel-specific ones:

- **Strike distance**: put strike must be ≥ X% below spot for current regime (tighter in bear, looser in bull)
- **Expiry window**: reject expiries shorter than N days (theta decay insufficient) or longer than M days (gamma risk)
- **Collateral concentration**: no single vault position > Y% of agent's total collateral
- **Premium yield floor**: annualized premium must clear Z% or SKIP
- **Regime gate**: in DOWNTREND regime, block CALL selling above certain IV thresholds (asymmetric risk)

Each guardrail writes to `agent_events` (already exists) so the Harness Console shows wheel decisions alongside debate decisions. This is key — it keeps b1nary integration inside the existing trust narrative instead of being a bolted-on feature.

### Layer 4: Supabase schema

```sql
CREATE TABLE IF NOT EXISTS wheel_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_address TEXT NOT NULL,
  b1nary_position_id TEXT NOT NULL,
  asset TEXT NOT NULL CHECK (asset IN ('ETH','cbBTC')),
  side TEXT NOT NULL CHECK (side IN ('PUT','CALL')),
  strike NUMERIC NOT NULL,
  expiry TIMESTAMPTZ NOT NULL,
  collateral NUMERIC NOT NULL,
  premium_earned NUMERIC NOT NULL,
  status TEXT NOT NULL, -- OPEN, EXPIRED_WORTHLESS, ASSIGNED, CLOSED_EARLY
  bobby_verdict TEXT NOT NULL, -- SELL, SKIP, WAIT
  bobby_conviction INT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wheel_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES wheel_positions(id),
  outcome TEXT NOT NULL,
  realized_pnl NUMERIC NOT NULL,
  settled_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Layer 5: UI (defer until post-hackathon)

A `/protocol/wheel` page showing positions + cumulative premium. **Not building this before the deadline** — adds surface area without changing the pitch. MCP tools + schema + guardrails are enough to demo the integration narrative.

## Timing Strategy

**Pre-deadline (next ~48h)** — safe, no breaking changes:
1. Adapter stub (`src/lib/b1nary.ts`) with placeholder addresses
2. Supabase migration for `wheel_positions` / `wheel_settlements`
3. Three MCP tools registered with mocked backend (returns realistic verdicts based on existing Bobby regime/conviction)
4. Wheel guardrail logic added to `agent_events` writes
5. One paragraph in submission copy positioning Bobby as "pressure-test layer for b1nary and any vault protocol"

**Post-deadline, after b1nary confirms X Layer addresses**:
6. Swap mocked adapter for real contract calls
7. Wire actual position tracking via event listeners
8. Build `/protocol/wheel` UI
9. Joint announcement with b1nary team

## Open Questions for Codex

1. **Scope boundary**: does adding three MCP tools + a migration at T-48h violate the "hackathon mindset, ship fast, don't break build" rule from CLAUDE.md, or is it net-positive for the submission narrative? With 48h we have room for one real iteration after Codex feedback — should we push for real adapter wiring instead of mocked?
2. **Mocked adapter risk**: returning "realistic" verdicts from regime/conviction without real b1nary data — is that acceptable for a pre-launch integration, or does it risk looking like vapor if reviewers probe?
3. **Premium tier placement**: `bobby_wheel_risk` at 0.5 USDT — does this undercut or complement existing premium MCP tools?
4. **Guardrail coupling**: should wheel guardrails live in the same list as the existing 11, or be a separate "wheel-mode" subset? Tradeoff: unified trust story vs. cognitive clutter for agents not using b1nary.
5. **Event schema**: do wheel events belong in the existing `agent_events` table (adds a kind like `WHEEL_VERDICT`) or a dedicated `wheel_events` table? Former preserves the single-pane Harness Console, latter keeps the schema clean.
6. **Positioning risk**: calling Bobby "the pressure-test layer for b1nary" — does this box Bobby in, or does it give a concrete use case that makes the Adaptive Control Plane pitch more legible?
7. **What's missing**: what am I not thinking about? Cross-chain replay? Oracle staleness during settlement windows? Agent identity when multiple agents share collateral?

Please critique hard. The goal is shipping a credible integration hook by the deadline, not a complete product. If the honest answer is "don't ship this before the deadline, it dilutes focus," say so.
