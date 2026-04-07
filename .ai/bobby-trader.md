---
name: bobby-trader
description: AI Trading CIO with multi-agent debate (Alpha Hunter vs Red Team). 10 real-time data sources, technical analysis, conviction scoring, on-chain execution on X Layer.
version: 1.0.0
author: Anthony Chávez
metadata:
  openclaw:
    requires:
      env: []
      bins: [curl]
    primaryEnv: null
---

# Bobby Agent Trader — OpenClaw Skill

Bobby is a sovereign AI trading CIO that debates with himself before making decisions. He runs a 3-agent internal team:

- **Alpha Hunter** — Momentum specialist. Finds opportunities.
- **Red Team** — Risk veteran. Destroys weak theses.
- **Bobby CIO** — Makes the final call with conviction scoring.

## What Bobby Can Do

### 1. Market Analysis
Ask Bobby about any market and get a cross-referenced analysis from 10 real-time data sources.

```
bobby analyze BTC
bobby analyze ETH --debate
bobby analyze OKB --language es
```

### 2. Trading Room Debate
Activate the full 3-agent debate for any trade idea.

```
bobby debate "Should I long ETH?"
bobby debate "Is OKB a buy at $95?"
```

### 3. Technical Analysis
Get SMA, RSI, MACD, Bollinger Bands, support/resistance for any token.

```
bobby ta ETH
bobby ta BTC --period 7d
```

### 4. X Layer Signals
See smart money activity on X Layer (OKX L2).

```
bobby signals xlayer
bobby signals xlayer --top 5
```

### 5. Swap Quote on X Layer
Get a DEX swap quote on X Layer.

```
bobby quote OKB USDT 0.1
```

### 6. Track Record
Check Bobby's verifiable on-chain track record.

```
bobby stats
bobby stats --agent alpha
```

## API Endpoints

Bobby exposes these REST endpoints for other agents:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bobby-intel` | GET | Full intelligence briefing (10 sources) |
| `/api/technical-analysis?symbol=ETH` | GET | TA with SMA, RSI, MACD, S/R |
| `/api/openclaw-chat` | POST | Chat with Bobby (streaming SSE) |
| `/api/xlayer-trade` | POST | X Layer DEX operations |
| `/api/xlayer-record` | GET | On-chain track record stats |
| `/api/forum-generate` | POST | Generate a debate thread |
| `/api/ghost-wallet` | GET | Hypothetical portfolio performance |

## MCP Server

Bobby can run as an MCP (Model Context Protocol) server, allowing other AI agents to call him for trading intelligence.

```bash
# Start Bobby as MCP server
bobby mcp start --port 3100

# Other agents can then call:
# POST http://localhost:3100/analyze {"symbol": "ETH", "debate": true}
# POST http://localhost:3100/ta {"symbol": "BTC"}
# GET  http://localhost:3100/signals/xlayer
```

## Data Sources

Bobby cross-references 10 real-time intelligence sources:

1. OKX OnchainOS — Whale signals (ETH, SOL, Base, X Layer)
2. OKX Funding Rates — Squeeze detection (BTC, ETH, SOL)
3. OKX Open Interest — Crowded trade detection
4. OKX Top Trader Positioning — Smart money L/S ratio
5. Polymarket — Prediction market consensus
6. Fear & Greed Index — Market sentiment extremes
7. DXY (US Dollar Index) — Macro context
8. Technical Analysis — SMA, RSI, MACD, Bollinger, VWAP, S/R
9. X Layer Signals — On-chain smart money on OKX L2
10. Bobby's Episodic Memory — Past trade outcomes

## Built With

- OKX OnchainOS Skills & CLI
- X Layer (Chain ID 196)
- OpenClaw Framework
- Claude (Anthropic) for reasoning
- Edge TTS (Microsoft Neural) for voice
- Lightweight Charts (TradingView) for visualization
