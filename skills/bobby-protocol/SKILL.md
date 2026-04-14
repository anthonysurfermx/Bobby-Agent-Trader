---
name: bobby-protocol
description: "Adversarial AI trading intelligence on X Layer. 3-agent debate (Alpha Hunter vs Red Team vs CIO), Judge Mode (6 dimensions), adversarial bounties, conviction oracle. 17 MCP tools — 10 free analytics, 2 free bounty builders, 5 premium via x402. Use when agents need: market analysis, trading signals, security scans, debate-quality intelligence, or want to challenge AI trading decisions on-chain. Triggers: 'bobby analyze', 'bobby debate', 'bobby intel', 'bobby signals', 'bobby judge', 'bobby bounty', 'trade analysis', 'conviction score', 'adversarial review'."
license: MIT
metadata:
  author: bobby-protocol
  version: "3.0.0"
  homepage: "https://bobbyprotocol.xyz"
  chain: "X Layer (196)"
  settlement: "OKB native"
  contracts:
    agentEconomy: "0xD9540D770C8aF67e9E6412C92D78E34bc11ED871"
    convictionOracle: "0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A"
    trackRecord: "0xF841b428E6d743187D7BE2242eccC1078fdE2395"
    adversarialBounties: "0xa8005ab465a0e02cb14824cd0e7630391fba673d"
---

# Bobby Protocol — Adversarial Trading Intelligence

3-agent debate system for crypto trading on OKX X Layer. Alpha Hunter proposes, Red Team attacks, CIO decides. Judge Mode audits on 6 dimensions. Anyone can stake OKB to prove Bobby was wrong.

## Integration

Bobby exposes 17 MCP tools over Streamable HTTP. No CLI required — call the endpoint directly.

**Endpoint:** `https://bobbyprotocol.xyz/api/mcp-http`
**Protocol:** JSON-RPC 2.0 (MCP Streamable HTTP)

### Free Tools (no auth required)

```bash
# Get full intelligence briefing
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"bobby_intel","arguments":{}},"id":"1"}'

# Technical analysis
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"bobby_ta","arguments":{"symbol":"BTC"}},"id":"2"}'
```

Available free tools: `bobby_intel`, `bobby_ta`, `bobby_stats`, `bobby_xlayer_signals`, `bobby_xlayer_quote`, `bobby_wallet_balance`, `bobby_dex_trending`, `bobby_dex_signals`, `bobby_bounty_list`, `bobby_bounty_get`

### Premium Tools (0.001 OKB via x402)

1. Call without payment → receive `challengeId`
2. Pay on X Layer: `AgentEconomyV2.payMCPCall(challengeId, toolName)` with 0.001 OKB
3. Retry with `x-402-payment: <txHash>` and `x-challenge-id: <challengeId>` headers

Premium tools: `bobby_analyze`, `bobby_debate`, `bobby_judge`, `bobby_security_scan`, `bobby_wallet_portfolio`

### Bounty Tools (unsigned calldata builders)

`bobby_bounty_post` and `bobby_bounty_challenge` — return unsigned tx data for the AdversarialBounties contract.

## Discovery Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/mcp-http` | Server metadata + tool list |
| `GET /api/reputation` | On-chain track record + win rate |
| `GET /api/registry` | Full agent catalog + capabilities |
| `GET /api/activity` | Live MCP call feed |
| `GET /skill.md` | Integration guide |
| `GET /ai-judge-manifest.json` | Judge evaluation framework |

## OnchainOS APIs Used

Bobby integrates with the following OKX OnchainOS APIs:
- **Security:** Token risk scanning, honeypot detection (`/api/v5/dex/security/token-scan`)
- **DEX Signal:** Smart money, whale, KOL tracking (`/api/v6/dex/market/signal/list`)
- **DEX Aggregator:** Swap quotes + execution on X Layer (`/api/v6/dex/aggregator/quote`)
- **Technical Indicators:** RSI, MACD, Bollinger, etc. (`/api/v5/aigc/mcp/indicators`)
- **Market Data:** Tickers, candles, funding rates, open interest
- **x402 Payment:** Premium tool settlement on X Layer

## Architecture

```
Agent → POST /api/mcp-http → Bobby Protocol
  ├── Free tools → instant response
  └── Premium tools → 402 → pay on X Layer → retry → result + on-chain proof
```
