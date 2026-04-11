<div align="center">

![Bobby Agent Trader — The World's First Verifiable AI Trading Room](./public/bobby-hero.png)

# Bobby Protocol

### *Adversarial Intelligence for the Agent Economy*

**The first protocol where AI pays to be right.**

[![OKX X Layer Hackathon](https://img.shields.io/badge/OKX_X_Layer-Build_X_Season_2-000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==)](https://www.okx.com)
[![Live](https://img.shields.io/badge/Live-bobbyprotocol.xyz-00ff88?style=for-the-badge)](https://bobbyprotocol.xyz)
[![X Layer Contracts](https://img.shields.io/badge/X_Layer-Verified_Contracts-7B3FE4?style=for-the-badge)](https://www.oklink.com/xlayer/address/0xD9540D770C8aF67e9E6412C92D78E34bc11ED871)
[![Built with Claude](https://img.shields.io/badge/AI_Engine-Claude_Sonnet_4-cc785c?style=for-the-badge)](https://anthropic.com)
[![MCP Streamable HTTP](https://img.shields.io/badge/MCP-Streamable_HTTP-1f6feb?style=for-the-badge)](https://modelcontextprotocol.io)

---

*"You don't trust Bobby — you verify him, you challenge him, and if he's wrong, you take his OKB."*

</div>

## What Bobby Protocol Is

Bobby Protocol is **infrastructure for the agent economy**: a paid, verifiable intelligence service where AI agents and humans consult the verdict of an adversarial 3-agent debate — and can economically challenge it when it's wrong.

Three things make Bobby different from any AI trading assistant that exists today:

1. **Adversarial by construction.** Every decision comes from a debate between 3 agents with opposing incentives (Alpha Hunter finds, Red Team destroys, CIO judges). You watch it happen.
2. **Committed on-chain before the outcome.** Commit-reveal on X Layer — Bobby's predictions exist immutable *before* anyone knows if they were right.
3. **Economically challengeable.** Anyone can post an OKB bounty to prove a Bobby debate was miscalibrated. The protocol pays itself to find its own mistakes.

In one sentence: **Bobby is a conviction oracle that can be audited economically.**

## The Three Value Layers

| Layer | What it does | Who uses it | How it's paid |
|---|---|---|---|
| **Public debates** | Free 3-agent debates on crypto + stocks, streamed with voice | Retail traders, curious users | Free — sustained by premium tools |
| **MCP x402 payment rails** | Other AI agents call Bobby via Model Context Protocol, pay 0.001 OKB per premium tool | Autonomous agents, AI apps | `BobbyAgentEconomyV2` on X Layer |
| **Adversarial Bounties** | Post OKB to challenge a specific debate dimension — challenger proves miscalibration, wins the bounty | Skeptics, researchers, aggrieved users | `BobbyAdversarialBounties` on X Layer |

## Competitive Moats

Three defensible moats, in order of depth:

**1. Immutable on-chain track record.** A competitor can copy the 3-agent prompt tomorrow. They cannot copy 6 months of commit-reveal predictions. This is pure time-moat.

**2. Native agent economy (x402 + MCP).** Bobby isn't competing for human attention — it's competing for *agent integration*. If we win the "which protocol does your agent call for market conviction?" question early, the incumbent advantage compounds: every agent that integrates Bobby makes it harder for a competitor to displace.

**3. Adversarial accountability loop.** Judge Mode + Bounties create a closed-loop system where protocol mistakes are *economically surfaced* by incentivized adversaries. No other AI trading system has this feedback mechanism. It turns every loss into a paid post-mortem.

## How It's Used — Three User Modes

### 👤 The Human Trader
```
1. Open bobbyprotocol.xyz
2. Type: "La Fed va a bajar tasas, siento bull run"
3. Bobby converts your vibe → RISK_ON regime
4. Watch 3 agents debate with voice in real time
5. Bobby decides: execute / sit out / counter-trade
6. If conviction < 5/10, Bobby tells you NO and recommends alternatives
```

### 🤖 The AI Agent
```bash
# 1. Discovery
curl https://bobbyprotocol.xyz/api/mcp-http

# 2. Call a premium tool — returns 402 + challenge
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"bobby_analyze",
                 "arguments":{"symbol":"ETH"}}}'

# 3. Pay 0.001 OKB on X Layer to BobbyAgentEconomyV2
#    payMCPCall(challengeId, "bobby_analyze")

# 4. Retry with payment proof
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "x-402-payment: <txHash>" \
  -H "x-challenge-id: <challengeId>" \
  -d '{...same JSON-RPC body...}'
```

### ⚔️ The Adversarial Auditor
```
1. Spot a Bobby debate that looks miscalibrated (e.g. conviction 8/10 but loss)
2. Post a bounty on BobbyAdversarialBounties:
   postBounty(threadId, RISK_MANAGEMENT, claimWindow)
3. Challenger submits evidence hash (IPFS CID)
4. Resolver (Judge Mode) picks winner
5. Winner withdraws via pull-payment
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ENTRY LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│  Humans (web)       Telegram bot        AI Agents (MCP)         │
│  bobbyprotocol.xyz  @bobbyagentraderbot POST /api/mcp-http      │
└────────────┬─────────────────┬──────────────────┬───────────────┘
             │                 │                  │
             ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 MONETIZATION LAYER (x402)                        │
├─────────────────────────────────────────────────────────────────┤
│  api/mcp-http.ts  →  create challenge → 402 → verify on-chain   │
│  atomic-consume  →  execute tool  →  receipt stored             │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              INTELLIGENCE LAYER (10 live sources)                │
├─────────────────────────────────────────────────────────────────┤
│  OKX Whale Signals  │  OKX Funding Rates  │  OKX Open Interest  │
│  OKX Top Traders    │  Polymarket          │  Fear & Greed      │
│  DXY Macro          │  Technical Analysis  │  X Layer Signals   │
│  Bobby Episodic Memory (past trade outcomes, Supabase)          │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 DEBATE LAYER (Claude API)                        │
├─────────────────────────────────────────────────────────────────┤
│  🟢 Alpha Hunter (Haiku)   →  finds the opportunity              │
│  🔴 Red Team (Sonnet)      →  destroys the weak thesis           │
│  🟡 Bobby CIO (Sonnet)     →  final verdict + conviction 0-10    │
│                                                                  │
│  ⚖️ Judge Mode (Sonnet)    →  audits debate on 6 dimensions      │
│                                (data, adversarial, logic, risk,  │
│                                 calibration, novelty)            │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│             PERSISTENCE LAYER (Supabase + RLS)                   │
├─────────────────────────────────────────────────────────────────┤
│  agent_cycles   │ forum_threads │ forum_posts   │ agent_trades  │
│  debate_quality (Judge verdicts) │ mcp_payment_challenges       │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              ON-CHAIN LAYER (X Layer — Chain 196)                │
├─────────────────────────────────────────────────────────────────┤
│  BobbyAgentEconomyV2       0xD9540D770C…11ED871  — x402 paywall │
│  BobbyConvictionOracle     0x03FA39B3a5…32Ab5f3A  — signal feed │
│  BobbyTrackRecord          0xF841b428E6…078fdE2395 — commit-    │
│                                                     reveal      │
│  BobbyAdversarialBounties  (deploying Day 7)    — audit market │
│  OKX DEX Aggregator        — swap execution on X Layer          │
└─────────────────────────────────────────────────────────────────┘
```

## The Full Logic Cycle

This is the autonomous agent loop (`api/agent-run.ts`, Vercel cron every 8h):

```
1. SIGNAL INGESTION
   ├─ Fetch 10 sources in parallel (OKX, Polymarket, F&G, DXY, etc)
   └─ Normalize to RawSignal[]

2. FILTERING
   ├─ Drop signals below confidence threshold
   ├─ Drop tokens below liquidity floor
   └─ Output: scored FilteredSignal[]

3. DEBATE (per signal)
   ├─ Alpha Hunter: "why enter?" (Haiku, fast + cheap)
   ├─ Red Team: "why NOT?" (Sonnet, reasoning)
   ├─ Bobby CIO: "final call + conviction 0-10"
   └─ Persist to forum_threads + forum_posts

4. JUDGE MODE (optional audit)
   ├─ Evaluate 6 dimensions (1-5 scale each)
   ├─ Detect biases (recency, confirmation, anchoring, loss_aversion…)
   └─ Compute overall score 0-100 + recommendation

5. RISK GATE
   ├─ conviction < 5/10     → SKIP
   ├─ Judge score < 60      → SKIP
   ├─ biases_detected > 2   → SKIP
   └─ mood == "tilted"      → Safe Mode active

6. COMMIT-REVEAL (on-chain, BEFORE execution)
   ├─ BobbyTrackRecord.commitTrade(hash, symbol, direction, conviction, entry)
   ├─ BobbyConvictionOracle.publishSignal(…)
   └─ Prediction is now immutable and public

7. EXECUTION
   ├─ OKX DEX Aggregator for swap
   ├─ OKX Perps API for leveraged positions
   └─ Store txHash in agent_trades

8. FORUM PUBLISH
   ├─ Thread auto-published with 3 agent posts
   └─ Any user can open an adversarial bounty against it

9. ADVERSARIAL BOUNTIES (asynchronous)
   ├─ Anyone posts bounty against thread_id on dimension X
   ├─ Challengers submit evidence (IPFS CID hashes)
   ├─ Judge Mode resolves winner
   └─ Pull-payment settlement via BobbyAdversarialBounties

10. RESOLUTION (when trade closes)
    ├─ BobbyTrackRecord.resolveTrade(hash, pnl, outcome)
    ├─ Update mood: win → confident, loss → cautious or tilted
    └─ Feed back into next cycle's Safe Mode state
```

## On-Chain Infrastructure (X Layer — Chain 196)

### BobbyAgentEconomyV2 — x402 Payment Gateway

| | |
|---|---|
| **Address** | [`0xD9540D770C8aF67e9E6412C92D78E34bc11ED871`](https://www.oklink.com/xlayer/address/0xD9540D770C8aF67e9E6412C92D78E34bc11ED871) |
| **Purpose** | Receives 0.001 OKB per premium MCP tool call |
| **Key feature** | `payMCPCall(challengeId, toolName)` with replay prevention |
| **Security** | Challenge-bound payments, refund excess, pausable |
| **Audit rounds** | 5 (Gemini ×3 + Codex ×2) |

### BobbyConvictionOracle — AI Decision Feed

| | |
|---|---|
| **Address** | [`0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A`](https://www.oklink.com/xlayer/address/0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A) |
| **Interface** | `getConviction(symbol)` → direction, score, price, isActive |
| **Safety** | Expired signals return NEUTRAL (fail-closed) |
| **Cooldown** | 10-minute anti-spam per symbol |
| **Tests** | 28 Foundry tests, 100% pass |

Any DeFi protocol on X Layer can consume it:
```solidity
(Direction dir, uint8 conviction, uint96 entry, bool active)
    = oracle.getConviction("ETH");

if (active && conviction >= 7 && dir == Direction.LONG) {
    // execute with Bobby's conviction backing the trade
}
```

### BobbyTrackRecord — Commit-Reveal Verifiable History

| | |
|---|---|
| **Address** | [`0xF841b428E6d743187D7BE2242eccC1078fdE2395`](https://www.oklink.com/xlayer/address/0xF841b428E6d743187D7BE2242eccC1078fdE2395) |
| **Pattern** | Commit-Reveal — predictions locked BEFORE outcomes |
| **Anti-backfill** | `minResolveAt` per commit + 10-minute floor |
| **Hard TTL** | 30-day maximum — late resolutions revert |
| **Coherence** | WIN requires positive PnL, LOSS negative, EXPIRED zero |
| **Tests** | 59 Foundry tests, 100% pass |

### BobbyAdversarialBounties — Pay to Challenge *(Day 6)*

The newest contract: anyone can post a bounty in OKB against a specific Bobby debate on a specific dimension (data_integrity, adversarial_quality, decision_logic, risk_management, calibration_alignment, novelty). Challengers submit evidence hashes. The resolver — Bobby's own Judge Mode — picks the winner. Pull-payment settlement.

| | |
|---|---|
| **Source** | [`contracts/src/BobbyAdversarialBounties.sol`](contracts/src/BobbyAdversarialBounties.sol) |
| **Status** | Built, 27 tests passing, 3-round security review in progress |
| **Pattern** | Pull payments, struct packing, events-as-history, 2-step ownership |
| **Safety** | Pause cannot trap user funds; 3-day challenge grace period; ABSOLUTE_MIN_BOUNTY floor |

## MCP Server — 13 Tools for the Agent Economy

Bobby exposes himself as a **Model Context Protocol server** using the Streamable HTTP transport. Any AI agent can discover and call him:

**Discovery:**
```bash
curl https://bobbyprotocol.xyz/api/mcp-http
```

**Free tools (8):**
| Tool | Description |
|---|---|
| `bobby_ta` | Technical analysis (SMA, RSI, MACD, Bollinger, S/R) |
| `bobby_intel` | Full intelligence briefing from 10 data sources |
| `bobby_xlayer_signals` | Smart money signals on X Layer |
| `bobby_xlayer_quote` | DEX swap quote on X Layer |
| `bobby_stats` | Bobby's track record (win rate, PnL) |
| `bobby_wallet_balance` | Bobby's agentic wallet balance |
| `bobby_dex_trending` | Hot trending tokens on-chain |
| `bobby_dex_signals` | Smart money / whale / KOL buy signals |

**Premium tools (5) — 0.001 OKB each via x402:**
| Tool | Description |
|---|---|
| `bobby_analyze` | Full market analysis with conviction score |
| `bobby_debate` | Trigger a 3-agent adversarial debate |
| `bobby_security_scan` | Scan token contract for honeypot/rug risks |
| `bobby_wallet_portfolio` | Multi-chain portfolio of any wallet |
| `bobby_judge` | Judge Mode — independent audit of a debate |

**Payment flow:**
```
Agent → tools/call → 402 { challengeId, priceWei, contract, instructions }
Agent → payMCPCall(challengeId, toolName) on BobbyAgentEconomyV2
Agent → retry with x-402-payment: <txHash> + x-challenge-id
Bobby → verify on-chain → atomic consume challenge → execute tool
Bobby → return result + on-chain proof URL
```

## Judge Mode — The Debate Auditor

Judge Mode is Bobby's self-audit layer. An independent Claude Sonnet instance reviews a debate and scores it on 6 dimensions (1-5 each):

| Dimension | Weight | What it measures |
|---|---|---|
| Data integrity | 20% | Did agents cite real numbers from the briefing? |
| Adversarial quality | 25% | Did Red Team genuinely challenge Alpha with counter-evidence? |
| Decision logic | 20% | Does CIO's verdict follow from the debate? |
| Risk management | 15% | Are stops tight? Is R/R proportional to conviction? |
| Calibration alignment | 10% | Does conviction match the historical track record? |
| Novelty | 10% | Did the debate surface non-obvious insights? |

It also detects 6 cognitive biases (recency, confirmation, anchoring, herd, overconfidence, loss aversion), produces a weighted 0-100 score, and recommends `execute / reduce_size / pass / reverse`.

Verdicts are persisted to `forum_threads.debate_quality` and exposed as the `bobby_judge` MCP tool.

See [`ai-judge-manifest.json`](ai-judge-manifest.json) for the full evaluation schema.

## The Trading Room — 3 Agents, 1 Decision

| Agent | Role | Voice | Personality |
|---|---|---|---|
| 🟢 **Alpha Hunter** | Finds opportunities | Jenny (EN) / Dalia (MX) | Momentum specialist. Divergence = opportunity. |
| 🔴 **Red Team** | Destroys weak theses | Ryan (GB) / Alvaro (ES) | Risk veteran. If it can break, he'll find how. |
| 🟡 **Bobby CIO** | Makes the final call | Guy (EN) / Jorge (MX) | Sovereign CIO. Conviction + position sizing. |

The debate is **audible** — each agent speaks with a distinct neural voice. Users watch/listen as their trade idea gets stress-tested in real time.

**The "NO" feature:** Bobby famously told us *"This is not the time to long OKB. The setup is broken, momentum is bearish, macro is against you. Cash is king here."* A typical bot would have said yes to generate fees. Bobby preserved capital. That's the difference.

## Vibe Trading — Human Intuition + AI Metacognition

```
User: "La Fed va a bajar tasas en junio, siento bull run"
          │
          ▼
   inferUserVibe() → RISK_ON, strength: 0.88
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
Alpha:  Red Team:  CIO:
rides   "classic    checks data:
NVDA    retail      ✓ DXY dropping
        euphoria"   ✓ Funding negative
                    → conviction +0.30
          │
          ▼
   Conviction 3.3 → 6.3/10
   → LONG NVDA $180, 5x
   → On-chain commit on X Layer
```

| Regime | Trigger phrase | Max adjustment |
|---|---|---|
| RISK_ON | "Fed cuts", "bull run", "breakout" | +0.30 |
| RISK_OFF | "war", "recession", "DXY strong" | −0.32 |
| PANIC | "bloodbath", "capitulation" | −0.20 |
| NEUTRAL | default / "reset" | ±0.15 |

**Key design:** The vibe is a hypothesis, not a command. Bobby requires live-data confirmation before applying the full adjustment. Red Team has explicit orders to attack euphoric or panicky vibes.

## Metacognition — Bobby Knows When He Doesn't Know

Most AI trading bots are confidently wrong. Bobby is **self-aware**:

1. **Calibration tracking** — If Bobby says 70% conviction, does he actually win 70% of the time? Bucketed accuracy feeds back into Safe Mode.
2. **Real-time debate quality** — Every debate is scored by Judge Mode. Overall score < 60 → skip execution.
3. **Mood system** — `confident | cautious | tilted` based on recent win rate. Tilted state forces Safe Mode.

After each cycle Bobby generates a **vibe phrase** — a real, LLM-generated sentence capturing his mood:

> *"Three BTC losses in 12hrs broke me. SOL funding at 6.8% is a trap. Sitting out until I stop revenge trading."*

Not hardcoded — generated by CIO at cycle end, referencing specific prices he just analyzed. Stored in `agent_cycles.vibe_phrase`.

## 10+ Intelligence Sources

| # | Source | Extracted |
|---|---|---|
| 1 | OKX OnchainOS Whale Signals | Net flows across ETH, SOL, Base, X Layer |
| 2 | OKX Funding Rates | Squeeze detection |
| 3 | OKX Open Interest | Crowded trade detection |
| 4 | OKX Top Trader Positioning | Smart money L/S ratio |
| 5 | Polymarket | Top 50 PnL traders' aggregate positions |
| 6 | Fear & Greed Index | Sentiment extremes |
| 7 | DXY (US Dollar Index) | Macro context for risk assets |
| 8 | Technical Analysis | SMA, RSI, MACD, Bollinger, VWAP, S/R |
| 9 | Yahoo Finance | NVDA, AAPL, TSLA, META, MSFT, COIN, SPY |
| 10 | X Layer Signals | On-chain smart money on OKX L2 |
| 11 | Bobby's Episodic Memory | Past trade outcomes + pattern recognition |
| 12 | User Vibe | Natural-language macro → bounded conviction adjustment |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + Framer Motion |
| AI Engine | Claude Sonnet 4 (reasoning) + Haiku 4.5 (speed) |
| MCP Transport | Streamable HTTP (JSON-RPC 2.0) |
| On-Chain Data | OKX OnchainOS CLI + API |
| Smart Contracts | Solidity 0.8.19 (Foundry) |
| Chain | X Layer (Chain ID 196) |
| Market Intel | Polymarket (Gamma + CLOB + Data) |
| Voice | Microsoft Edge TTS (Neural) |
| Database | Supabase (PostgreSQL + RLS) |
| Deployment | Vercel (Serverless) |
| Testing | Foundry (116+ tests across all contracts) |
| Audits | Gemini Pro + Codex (5 rounds on existing contracts, 3 on Bounties) |

## Smart Contract Security — 3-Round Rule

**Every `.sol` file ships only after 3 rounds of security review:**

| Round | Reviewer | Focus |
|---|---|---|
| 1 | Claude (self-review) | Reentrancy, access control, overflow, state transitions |
| 2 | Claude (adversarial) | Attacker mindset — how to drain funds or grief the system |
| 3 | Codex/o1 (external) | Independent audit via brief in `.ai/briefs/` |

Nothing deploys to mainnet until all 3 rounds are complete and findings applied. This is a non-negotiable rule in the protocol's engineering memory.

## Running Locally

```bash
git clone https://github.com/anthonysurfermx/Bobby-Agent-Trader.git
cd Bobby-Agent-Trader
npm install
cp .env.example .env.local
npm run dev
```

### Smart Contract Tests

```bash
cd contracts
forge test -vvv
# Bobby contracts: 116+ tests, 0 failures
```

### Deploy Bounties Contract to X Layer

```bash
cd contracts
RESOLVER_ADDRESS=0xYourResolverWallet \
  forge script script/DeployAdversarialBounties.s.sol \
    --rpc-url https://rpc.xlayer.tech --broadcast --verify
```

## Deployed Contracts

| Contract | Address | Explorer |
|---|---|---|
| BobbyAgentEconomyV2 | `0xD9540D770C8aF67e9E6412C92D78E34bc11ED871` | [OKLink](https://www.oklink.com/xlayer/address/0xD9540D770C8aF67e9E6412C92D78E34bc11ED871) |
| BobbyConvictionOracle | `0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A` | [OKLink](https://www.oklink.com/xlayer/address/0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A) |
| BobbyTrackRecord | `0xF841b428E6d743187D7BE2242eccC1078fdE2395` | [OKLink](https://www.oklink.com/xlayer/address/0xF841b428E6d743187D7BE2242eccC1078fdE2395) |
| BobbyAdversarialBounties | *Deploying Day 7* | — |

## The 30-Second Pitch

> Bobby Protocol is infrastructure for the agent economy. Other AI agents pay 0.001 OKB via MCP x402 to consult the verdict of a 3-agent adversarial debate, verified on-chain on X Layer with commit-reveal. If the debate is wrong, anyone can post a bounty to prove it — and get paid. **It's the first protocol where AI pays to be right.**

## Team

**Anthony Chavez** — Founder & Lead Developer
[GitHub](https://github.com/anthonysurfermx) | [Twitter](https://twitter.com/anthonysurfermx)

Built for the **OKX X Layer Build X Season 2 Hackathon** (April 2026).
Previously won 3rd place in Build X Season 1.

---

<div align="center">

**Bobby Protocol** — *Adversarial Intelligence for the Agent Economy*

*You don't trust Bobby — you verify him, you challenge him, and if he's wrong, you take his OKB.*

Powered by **OKX OnchainOS** • **X Layer** • **Claude AI** • **MCP Streamable HTTP** • **Polymarket**

</div>
