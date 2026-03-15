# Bobby Agent Trader

> *"The trading is not about standing in the market. It's about being the one standing when the smoke clears."*

**Bobby Axelrod meets on-chain intelligence.** An autonomous trading agent with metacognition that scans whale flows on OKX, cross-references Polymarket smart money consensus, debates itself through three AI agents, and only pulls the trigger when the math says yes.

Built for the **OKX X Layer AI Hackathon** (March 2026).

**Live Demo**: [defimexico.org/agentic-world/bobby](https://defimexico.org/agentic-world/bobby)

---

## The Problem

Every beginner trader faces the same enemy: **information asymmetry**. While you're reading yesterday's news, smart money already moved. While you're trying to figure out if BTC is bullish, whales are dumping into your buy order.

Most trading bots "solve" this by executing faster. Bobby solves it differently.

**Bobby thinks.**

---

## How Bobby Works

Bobby doesn't just read signals — he cross-examines them. He runs an internal debate between three AI agents, applies latency penalties to stale data, checks his own track record, and adjusts his confidence based on whether he's been winning or losing.

This is what we call **metacognition** — an AI that watches itself think.

```
You ask Bobby: "What do you think about BTC?"

Bobby doesn't check CoinMarketCap.

Bobby checks:
  1. Where are the whales moving money RIGHT NOW? (OKX OnchainOS)
  2. What does the smart money consensus say? (Polymarket top 15 PnL traders)
  3. Do these two sources AGREE or DIVERGE?
  4. How old is this data? (>1 hour = dead signal)
  5. What's my track record? Am I hot or cold?

Then Bobby tells you — with zero fluff — whether this is a trade or a trap.
```

---

## The Three Minds of Bobby

Every analysis triggers a **Multi-Agent Debate** — three specialized AI agents that argue before Bobby speaks.

### Agent 1: The Alpha Hunter
*The young analyst who wants to buy everything.*

Scans OKX OnchainOS whale signals and Polymarket smart money positions. Finds convergence patterns, wallet clustering, and volume anomalies. His job is to find alpha — aggressively.

### Agent 2: The Red Team
*The internal auditor who finds every reason it's a rug pull.*

Takes every Alpha Hunter thesis and tries to destroy it. Checks for: fake volume, wash trading, information decay, MEV exposure, liquidity traps. If the Red Team can't kill the thesis, it might actually be good.

### Agent 3: Bobby (The CIO)
*The one who talks to you.*

Bobby sees both sides. He has the Alpha Hunter's optimism and the Red Team's paranoia. He weighs them using the **Dynamic Conviction Score** — a mathematical formula that removes vibes from the equation.

```
Confidence = (OKX_Score x 0.4) + (Polymarket_Consensus x 0.6) - Latency_Penalty
```

Bobby only speaks when he's crushed the argument. And when he does, you see two things:

- **"Why I almost said no"** — The Red Team's best attack
- **"My verdict"** — Bobby's final word

This is the **Axe Retort** — proof that Bobby considered the risk and still decided to move (or not). High-conviction trading, not hope.

---

## Safe Mode: The Self-Correcting Agent

Most trading bots don't know when they're wrong. Bobby does.

Bobby tracks his own win rate across cycles. When he drops below 70%:

- **Safe Mode activates**
- Position sizes cut in half (Kelly sizing goes from 30% to 15% max exposure)
- Confidence threshold rises from 0.7 to 0.8
- Bobby tells you: *"No voy a quemar tu dinero solo para sentir que estamos haciendo algo. Esperamos."*

When he's hot (>70% win rate), he's lethal: *"Strong conviction. The setup is clean. Take it or someone eats your lunch."*

This is **adaptive mood** — Bobby's personality shifts with his performance. Confident when winning, defensive when the market structure changes.

---

## The Intelligence Stack

Bobby's brain runs on two sources of truth:

### OKX OnchainOS — The Hard Truth
Real wallet flows. Whale movements. Token balance changes. Net inflow vs outflow to exchanges. This is what the money is actually doing — not what Twitter says it's doing.

Chains monitored: **Ethereum, Solana, Base, X Layer**

### Polymarket — The Crowd Truth
Smart money consensus from the top 15 PnL traders. Not the average gambler — the traders who consistently make money. When they cluster on a position, it means something.

### The Divergence is the Trade
When these two sources **agree** (whales buying + smart money bullish), Bobby approves with conviction.

When they **diverge** (Polymarket says 80% YES but OKX shows whale outflows), Bobby marks it as a **liquidation hunt** — the crowd is exit liquidity for smart money.

---

## Architecture

```
                          BOBBY AGENT TRADER
                                 |
            +--------------------+--------------------+
            |                    |                     |
      OKX OnchainOS     Polymarket Intel        OpenClaw Gateway
    (Whale Signals)    (Smart Money PnL)      (Conversational AI)
            |                    |                     |
            +--------+---------+                      |
                     |                                 |
              Dynamic Conviction                       |
                Score (Math)                           |
                     |                                 |
         +----------+----------+                      |
         |          |          |                       |
    Alpha Hunter  Red Team   Bobby CIO                |
    (Bullish AI) (Adversary) (The Judge)              |
         |          |          |                       |
         +----------+----------+                      |
                     |                                 |
              Kelly Criterion                          |
              Risk Sizing                              |
                     |                                 |
              +------+------+                          |
              |             |                          |
         Execute        The Axe Retort                 |
     (OKX DEX V5)    "Why I almost                     |
      on X Layer       said no"                        |
              |                                        |
              +----------------+-----------------------+
                               |
                        User Chat (React)
                    Terminal aesthetic, typewriter,
                    inline price cards, SSE streaming
```

---

## The Chat Experience

Bobby is not a dashboard. He's a conversation.

| You say | Bobby does |
|---------|-----------|
| `"BTC"` | Real-time price + 24h change + funding rate from OKX |
| `"What do you think about ETH?"` | Full Bobby Axelrod analysis via OpenClaw — who's moving, where's the trap, what's the play |
| `"Analyze Market"` | Full autonomous cycle: collect signals, filter, multi-agent debate, Kelly sizing, trade recommendations |
| `"All Prices"` | Market overview with top movers |
| `"What's trending?"` | Biggest movers + smart money context |

When Bobby recommends a trade, you can **execute it directly** — ERC-20 approval + swap through OKX DEX Aggregator on X Layer. Real on-chain execution with a single click.

---

## OKX Integration Depth

| OKX Product | How Bobby Uses It |
|-------------|-------------------|
| **OnchainOS** | Whale signals, token flows, wallet clustering — the "hard truth" layer |
| **DEX Aggregator V5** | On-chain swap execution on X Layer (Chain 196) |
| **Market Data API** | Real-time prices, funding rates, 24h stats |
| **Approve API** | ERC-20 token approvals for DEX swaps |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Brain | Claude Sonnet 4 (3 agents in parallel debate) |
| AI Chat | OpenClaw Gateway on Digital Ocean (Bobby persona) |
| On-chain Data | OKX OnchainOS API (whale signals, net flows) |
| DEX Execution | OKX DEX Aggregator V5 (X Layer, Chain 196) |
| Market Data | OKX Market API (prices, funding, tickers) |
| Prediction Markets | Polymarket APIs (smart money consensus) |
| Wallet | wagmi v2 + Reown AppKit (WalletConnect) |
| Backend | Vercel Serverless Functions (120s max) |
| Database | Supabase PostgreSQL (profiles, cycles, trades, memory) |
| Frontend | React + TypeScript + Tailwind CSS + Framer Motion |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| Cron | Vercel Cron (autonomous scans every 4 hours) |

---

## Run It

```bash
# Clone
git clone https://github.com/anthonysurfermx/Bobby-Agent-Trader.git
cd Bobby-Agent-Trader

# Install
npm install

# Configure
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, OKX credentials, SUPABASE keys, REOWN_PROJECT_ID

# Run
npm run dev
```

### Required Environment Variables

```bash
ANTHROPIC_API_KEY=           # Claude API key (multi-agent debate)
OKX_API_KEY=                 # OKX API key
OKX_SECRET_KEY=              # OKX secret
OKX_PASSPHRASE=              # OKX passphrase
VITE_SUPABASE_URL=           # Supabase project URL
VITE_SUPABASE_ANON_KEY=      # Supabase anon key
SUPABASE_SERVICE_KEY=        # Supabase service role key
VITE_REOWN_PROJECT_ID=       # Reown/WalletConnect project ID
OPENCLAW_GATEWAY_URL=        # OpenClaw gateway tunnel URL (optional)
```

### Supabase Tables

- `agent_profiles` — User configuration (risk tolerance, language, scan interval)
- `agent_messages` — Conversation history (Bobby's greetings per wallet)
- `agent_cycles` — Autonomous cycle logs (signals, trades, win rate, mood)
- `agent_trades` — Individual trade execution records

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/agent-run` | Autonomous analysis cycle (cron every 4h) |
| `GET /api/agent-run?manual=true` | Manual trigger with trade execution calldata |
| `POST /api/openclaw-chat` | Conversational AI via OpenClaw (Bobby persona) |
| `GET /api/okx-market` | Real-time OKX market data |
| `GET /api/dex-quote` | OKX DEX Aggregator price quote |
| `GET /api/dex-swap` | DEX swap calldata for on-chain execution |
| `GET /api/dex-approve` | ERC-20 token approval calldata |

---

## Disclaimer

Bobby Agent Trader is a hackathon prototype built in 2 weeks. It is not financial advice. Do not trade with money you cannot afford to lose. When you execute swaps, real funds are at stake on X Layer.

Bobby will remind you of this before you enter. He's arrogant, not irresponsible.

---

## Team

Built by the **DeFi Mexico** community for the OKX X Layer AI Hackathon (March 2026).

The project that proves trading agents don't need to be friendly — they need to be right.

---

*"I don't want to be in the middle of a trade hoping it works out. I want to be the one who already knows."* — Bobby
