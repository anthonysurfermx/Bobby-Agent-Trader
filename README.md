<div align="center">

![Bobby Agent Trader — The World's First Verifiable AI Trading Room](./public/bobby-hero.png)

# Bobby Agent Trader

### *Not a bot. A Trading Room with Metacognition.*

**Agentic Trust Infrastructure for the OKX Ecosystem**

[![OKX X Layer Hackathon](https://img.shields.io/badge/OKX_X_Layer-AI_Hackathon_2026-000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==)](https://www.okx.com)
[![Live Demo](https://img.shields.io/badge/Live_Demo-defimexico.org/bobby-00ff88?style=for-the-badge)](https://defimexico.org/bobby)
[![X Layer Contracts](https://img.shields.io/badge/X_Layer-Verified_Contracts-7B3FE4?style=for-the-badge)](https://www.oklink.com/xlayer/address/0xF841b428E6d743187D7BE2242eccC1078fdE2395)
[![Built with Claude](https://img.shields.io/badge/AI_Engine-Claude_Sonnet_4-cc785c?style=for-the-badge)](https://anthropic.com)
[![OKX OnchainOS](https://img.shields.io/badge/Data-OKX_OnchainOS-fff?style=for-the-badge)](https://www.okx.com/web3)

---

*"The divergence between what people believe and what money does — that's where alpha lives."*
— Bobby

</div>

## The Problem

Every AI trading tool today has the same fatal flaw: **you can't verify if it's lying.**

A bot says "I predicted BTC at $60K" — where's the proof? A database entry? That can be edited. A screenshot? That can be faked. There's zero accountability, zero transparency, and zero trust.

Meanwhile, traders are drowning in noise — 50 Telegram alpha groups, 20 Twitter KOLs, 12 newsletters — and they still can't answer one simple question: **"Should I buy this, or not?"**

## The Solution: Bobby — A Trading Room, Not a Bot

Bobby is a **sovereign AI CIO** (Chief Investment Officer) that runs a live trading room with three agents who debate every decision before your eyes. It's not a signal bot. It's not a dashboard. It's a **decision-making infrastructure** with verifiable on-chain accountability.

What makes Bobby different:

1. **He debates himself before deciding** — Three agents (Alpha Hunter, Red Team, CIO) argue in real-time with voice. You watch the thesis get stress-tested.
2. **He commits predictions on-chain BEFORE knowing the outcome** — Commit-reveal pattern on X Layer. No cherry-picking. No backfilling.
3. **He says NO when he doesn't see alpha** — Bobby told us "don't buy OKB" when the setup was bearish. A bot would have said "buy" to generate a transaction. Bobby preserved capital.
4. **Other protocols can read his conviction** — The Conviction Oracle on X Layer lets any DeFi protocol call `getConviction("BTC")` before executing. Bobby is infrastructure, not an island.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         USER (Chat / Voice)         │
                    │     "Should I long ETH right now?"  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     10-SOURCE INTELLIGENCE FEED     │
                    │                                     │
                    │  OKX Whale Signals ─── Funding Rate │
                    │  OKX Open Interest ── Top Traders   │
                    │  Polymarket Consensus ── Fear/Greed │
                    │  DXY (Dollar Index) ── X Layer Sigs │
                    │  Technical Analysis ── Bobby Memory │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
   ┌──────────▼─────────┐ ┌───────▼────────┐ ┌────────▼─────────┐
   │   🟢 ALPHA HUNTER  │ │  🔴 RED TEAM   │ │  🟡 BOBBY CIO   │
   │                     │ │                │ │                  │
   │ "Whale accumulation │ │ "Funding rate  │ │ FINAL VERDICT:   │
   │  + Polymarket at    │ │  is 5.5%, too  │ │ Conviction: 8/10 │
   │  0.72 = divergence" │ │  many longs"   │ │ Direction: LONG  │
   │                     │ │                │ │ Entry: $3,420    │
   │  Voice: Jenny (US)  │ │ Voice: Ryan(GB)│ │ Voice: Guy (US)  │
   └──────────┬──────────┘ └───────┬────────┘ └────────┬─────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │         X LAYER ON-CHAIN INFRA          │
              │                                         │
              │  ┌─────────────────────────────────┐    │
              │  │   BobbyTrackRecord (Commit-     │    │
              │  │   Reveal) — Audited by Gemini   │    │
              │  │   + Codex. 59 Foundry tests.    │    │
              │  │   0xF841b428...fdE2395          │    │
              │  └─────────────────────────────────┘    │
              │                                         │
              │  ┌─────────────────────────────────┐    │
              │  │   BobbyConvictionOracle —       │    │
              │  │   Any protocol reads Bobby's    │    │
              │  │   conviction. 28 Foundry tests. │    │
              │  │   0x03FA39B3...Ab5f3A           │    │
              │  └─────────────────────────────────┘    │
              │                                         │
              │  ┌─────────────────────────────────┐    │
              │  │   OKX DEX Aggregator —          │    │
              │  │   Swap execution on X Layer     │    │
              │  │   via OnchainOS CLI             │    │
              │  └─────────────────────────────────┘    │
              └─────────────────────────────────────────┘
```

## On-Chain Infrastructure (X Layer, Chain ID 196)

Bobby is not just an app — it's **two audited smart contracts** deployed on X Layer that create a trustless decision layer for DeFi.

### BobbyTrackRecord — Commit-Reveal Verifiable History

| | |
|---|---|
| **Contract** | [`0xF841b428E6d743187D7BE2242eccC1078fdE2395`](https://www.oklink.com/xlayer/address/0xF841b428E6d743187D7BE2242eccC1078fdE2395) |
| **Pattern** | Commit-Reveal: predictions locked BEFORE outcomes are known |
| **Anti-Backfill** | `minResolveAt` per commitment + 10-minute floor |
| **Hard TTL** | 30-day max — late resolutions revert, preventing stale entries |
| **Coherence** | WIN requires positive PnL, LOSS negative, EXPIRED zero |
| **Audited By** | Gemini Pro (2 rounds) + Codex (3 rounds) |
| **Tests** | 59 Foundry tests, 100% pass |

**How it works:**
```
Bobby debates ETH → commitTrade(hash, "ETH", LONG, conviction=8, entry=$3420)
  └── Timestamped on X Layer. Immutable. Public.

... hours/days pass ...

ETH hits target → resolveTrade(hash, +850bps, WIN, exit=$3710)
  └── Outcome recorded. Anyone can verify: Bobby predicted BEFORE knowing.
```

### BobbyConvictionOracle — AI Decision Feed for DeFi

| | |
|---|---|
| **Contract** | [`0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A`](https://www.oklink.com/xlayer/address/0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A) |
| **Purpose** | Other protocols read Bobby's conviction before executing |
| **Interface** | `getConviction("BTC")` → direction, score, price, isActive |
| **Safety** | Expired signals return NEUTRAL (fail-closed, protects lazy devs) |
| **Cooldown** | 10-minute anti-spam between signals per symbol |
| **Tests** | 28 Foundry tests, 100% pass |

**How other protocols use it:**
```solidity
// Any DeFi protocol on X Layer:
(Direction dir, uint8 conviction, uint96 entry, bool active)
    = oracle.getConviction("ETH");

if (active && conviction >= 7 && dir == Direction.LONG) {
    // Execute strategy with Bobby's conviction backing it
}
```

## The Trading Room — 3 Agents, 1 Decision

Bobby doesn't make decisions alone. Every question triggers an internal **adversarial debate** between three specialized agents:

| Agent | Role | Voice | Personality |
|-------|------|-------|-------------|
| **Alpha Hunter** | Finds opportunities | Jenny (EN) / Dalia (MX) | Momentum specialist. Sees divergence = opportunity. |
| **Red Team** | Destroys weak theses | Ryan (GB) / Alvaro (ES) | Risk veteran. If it can break, he'll find how. |
| **Bobby CIO** | Makes the final call | Guy (EN) / Jorge (MX) | Sovereign CIO. Conviction score + position sizing. |

The debate is **audible** — each agent speaks with a distinct neural voice (Microsoft Edge TTS). The user watches/listens as their trade idea gets stress-tested in real-time.

**The "NO" Feature:** Bobby famously told us *"This is not the time to long OKB. The setup is broken, momentum is bearish, macro is against you. Cash is king here."* — A bot would have said yes to generate fees. Bobby preserved capital. That's the difference.

## 10 Intelligence Sources

Bobby cross-references 10 real-time data sources before every decision:

| # | Source | What Bobby Extracts | Weight |
|---|--------|-------------------|--------|
| 1 | OKX OnchainOS Whale Signals | Net flows across ETH, SOL, Base, X Layer | High |
| 2 | OKX Funding Rates | Squeeze detection (crowded longs/shorts) | High |
| 3 | OKX Open Interest | Crowded trade detection | Medium |
| 4 | OKX Top Trader Positioning | Smart money long/short ratio | Medium |
| 5 | Polymarket Consensus | Top 50 PnL traders' aggregate positions | High |
| 6 | Fear & Greed Index | Sentiment extremes (contrarian signals) | Low |
| 7 | DXY (US Dollar Index) | Macro context for risk assets | Medium |
| 8 | Technical Analysis | SMA, RSI, MACD, Bollinger, VWAP, S/R levels | High |
| 9 | X Layer Signals | On-chain smart money activity on OKX L2 | Medium |
| 10 | Bobby's Episodic Memory | Past trade outcomes and pattern recognition | Medium |

## MCP Server — Bobby as Infrastructure

Bobby exposes himself as an **MCP (Model Context Protocol) server**, allowing other AI agents to call him for trading intelligence:

```bash
# Any AI agent can call Bobby:
curl -X POST https://defimexico.org/api/mcp-bobby \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "bobby_debate",
      "arguments": {"question": "Should I long ETH?"}
    },
    "id": 1
  }'
```

**Available MCP Tools:**
| Tool | Description |
|------|-------------|
| `bobby_analyze` | Market analysis with 10 data sources |
| `bobby_debate` | Full 3-agent adversarial debate |
| `bobby_ta` | Technical analysis (SMA, RSI, MACD, Bollinger) |
| `bobby_intel` | Fast intelligence briefing |
| `bobby_xlayer_signals` | X Layer smart money signals |
| `bobby_xlayer_quote` | DEX swap quote on X Layer |
| `bobby_stats` | Track record (win rate, PnL) |

## OpenClaw Skill

Bobby is published as an **OpenClaw Skill** — installable by any agent in the OpenClaw ecosystem:

```
skills/bobby-trader/SKILL.md
```

Other agents can install Bobby and use his trading intelligence as a capability. Bobby goes from being an app to being a **service layer** for the AI-agent economy.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| AI Engine | Claude Sonnet 4 (Anthropic) |
| Agent Framework | OpenClaw Gateway |
| On-Chain Data | OKX OnchainOS CLI + API |
| Smart Contracts | Solidity 0.8.19 (Foundry) |
| Chain | X Layer (Chain ID 196) |
| Market Intel | Polymarket (Gamma + CLOB + Data) |
| Voice | Microsoft Edge TTS (Neural) |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel (Serverless) |
| Testing | Foundry (89 tests) |
| Audits | Gemini Pro + Codex (5 rounds) |

## Smart Contract Audit Trail

Both contracts went through **5 rounds of security audits** by Gemini and Codex:

| Round | Auditor | Key Findings | Status |
|-------|---------|-------------|--------|
| v1 | Gemini | Duplicate prevention, gas optimization, missing events | ✅ Fixed |
| v2 | Codex | No commit-reveal, ABI mismatch, no coherence invariants | ✅ Fixed |
| v3 | Gemini | Struct packing, O(1) pending count, EXPIRED invariant | ✅ Fixed |
| v4 | Codex | Anti-backfill retroactivity, unified expiry accounting | ✅ Fixed |
| v5 | Codex | Hard TTL enforcement, Oracle cooldown, defensive reads | ✅ Fixed |

**Final Verdict:** Go for deploy (Gemini) + Go condicionado (Codex) → **Deployed to X Layer mainnet.**

## Running Locally

```bash
git clone https://github.com/anthonysurfermx/defi-mexico-hub.git
cd defi-mexico-hub
npm install
cp .env.example .env.local
npm run dev
```

### Smart Contract Tests

```bash
cd contracts
forge test -vvv
# 89 tests, 0 failures
```

### Deploy to X Layer

```bash
cd contracts
export BOBBY_ADDRESS=0xYourBobbyWallet
forge script script/DeployAll.s.sol --rpc-url https://rpc.xlayer.tech --broadcast
```

## The Philosophy

> "Everyone else is building bots that read signals and push buttons. Bobby reads signals, **debates them internally with adversarial agents**, **commits predictions on-chain before knowing the outcome**, **checks his own track record**, and only then decides — while explaining his reasoning out loud with voice. That's not a bot. That's a trading room with metacognition."

Bobby is not trying to be the best trading bot. Bobby is trying to be the **trust layer** that every trading decision should pass through. The on-chain track record proves he means it.

## Deployed Contracts

| Contract | Address | Explorer |
|----------|---------|----------|
| BobbyTrackRecord | `0xF841b428E6d743187D7BE2242eccC1078fdE2395` | [OKLink](https://www.oklink.com/xlayer/address/0xF841b428E6d743187D7BE2242eccC1078fdE2395) |
| BobbyConvictionOracle | `0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A` | [OKLink](https://www.oklink.com/xlayer/address/0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A) |

## Team

**Anthony Chavez** — Founder & Lead Developer
- [GitHub](https://github.com/anthonysurfermx) | [Twitter](https://twitter.com/anthonysurfermx)

Built for the **OKX X Layer AI Hackathon 2026** (March 12-26)

---

<div align="center">

**Bobby Agent Trader** — *Not a bot. A Trading Room with Metacognition.*

*The World's First Verifiable AI Trading Agent on X Layer*

Powered by **OKX OnchainOS** | **X Layer** | **Claude AI** | **Polymarket Intelligence**

</div>
