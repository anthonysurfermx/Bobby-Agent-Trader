# Adams Agent Trader

> **OKX X Layer AI Hackathon Submission** — AI-powered autonomous trading agent that gives superpowers to beginners.

## What is Adams?

Adams Agent Trader is an autonomous AI trading advisor that scans OKX and Polymarket markets every 4 hours, performs multi-agent debate analysis, and executes trades on-chain through the OKX DEX Aggregator on X Layer.

**The core idea**: Give trading superpowers to someone who has never traded before. Adams handles the complexity — signal collection, analysis, risk sizing, and execution — while the user simply chats with their AI advisor.

## Architecture

```
User (Chat) ─────→ Adams Agent ──→ OKX DEX Aggregator (X Layer)
                       │
              ┌────────┴────────┐
              │                 │
         Alpha Hunter      Red Team
         (Bullish AI)     (Devil's Advocate)
              │                 │
              └────────┬────────┘
                       │
                   Judge AI
                       │
                Kelly Criterion
                  Risk Sizing
                       │
                 Execute on-chain
```

## Key Features

### 1. Multi-Agent Debate System
Three specialized Claude Sonnet 4 agents analyze every opportunity:
- **Alpha Hunter** — Identifies bullish signals and opportunities
- **Red Team** — Acts as devil's advocate, finding risks and attack vectors
- **Judge** — Makes the final BUY/SKIP decision based on both perspectives

### 2. Kelly Criterion Position Sizing
Dynamic position sizing based on mathematical edge:
- `f* = (p(b+1) - 1) / b` where p = probability, b = odds ratio
- Half-Kelly for safety (conservative by default)
- Position sizes: $5 - $75 per trade
- Maximum 30% portfolio exposure

### 3. Prompt Self-Optimization
The Alpha Hunter's system prompt evolves over time:
- Analyzes the last 10 cycles for patterns
- Generates an improved version of its own prompt
- Adapts to market conditions automatically

### 4. Chat-First UX
- Full-height conversational interface
- Real-time analysis phases shown during scanning
- Typewriter effect for advisor responses
- Quick action buttons: "Analyze Market", "Show Portfolio", "What's trending?"

### 5. On-Chain Execution via OKX DEX Aggregator
When Adams recommends a trade, users can execute it directly:
1. **Approve** — ERC-20 token approval via OKX Approve API
2. **Swap** — Execute the swap via OKX DEX Aggregator on X Layer
3. **Confirm** — Transaction hash with link to OKLink explorer

### 6. Memory & Continuity
- Advisor remembers previous cycles and follows up on past recommendations
- Tracks recommendation accuracy over time (Advisor Score)
- Persistent conversation history via Supabase

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **AI Models** | Claude Sonnet 4 (3 agents in parallel) |
| **On-chain** | OKX DEX Aggregator V5 on X Layer (Chain 196) |
| **Auth** | OKX HMAC-SHA256 API authentication |
| **Wallet** | wagmi v2 + Reown AppKit (WalletConnect) |
| **Backend** | Vercel Serverless Functions (120s max) |
| **Database** | Supabase (profiles, messages, cycles, trades) |
| **Frontend** | React + TypeScript + Tailwind CSS + Framer Motion |
| **Cron** | Vercel Cron (every 4 hours) |

## Signal Sources

1. **OKX OnchainOS** — Whale activity, token balance changes, DeFi signals across ETH, Base, X Layer
2. **Polymarket Intelligence** — Smart money consensus from top 50 PnL traders, whale positions, capital flow analysis

## Supported Chains & Tokens

| Chain | Tokens |
|-------|--------|
| **X Layer (196)** | USDC, WETH, WBTC, OKB |
| **Ethereum (1)** | USDC, WETH, WBTC |
| **Base (8453)** | USDC, WETH |

## Setup

### Prerequisites
- Node.js 18+
- OKX API credentials (with DEX Aggregator access)
- Anthropic API key (Claude)
- Supabase project
- Reown Project ID (for WalletConnect)

### Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

### Supabase Tables

Required tables:
- `agent_profiles` — User advisor configuration
- `agent_messages` — Conversation history
- `agent_cycles` — Autonomous cycle logs
- `agent_trades` — Trade execution records

### Run Locally

```bash
npm install
npm run dev
```

### Deploy to Vercel

```bash
vercel --prod
```

The cron job at `/api/agent-run` will execute every 4 hours automatically.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-run` | GET | Trigger autonomous analysis cycle |
| `/api/agent-run?manual=true&wallet=0x...` | GET | Manual trigger with execution calldata |
| `/api/agent-confirm` | POST | Record trade execution result |
| `/api/dex-quote` | GET | OKX DEX Aggregator quote |
| `/api/dex-swap` | GET | OKX DEX Aggregator swap calldata |
| `/api/dex-approve` | GET | ERC-20 approval calldata |

## Live Demo

- **DeFi Mexico Hub**: [defimexico.org/agentic-world/adams](https://defimexico.org/agentic-world/adams)

## Disclaimer

This is a hackathon prototype. Not financial advice. Trade at your own risk. Real funds are at stake when executing swaps.

## Team

Built by the DeFi Mexico community for the OKX X Layer AI Hackathon (March 2026).

## License

MIT
