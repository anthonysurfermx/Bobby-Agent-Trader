# Bobby Protocol — Agent Integration Skill

> **Version:** 1.1.0<br>
> **Protocol:** MCP (Model Context Protocol) over Streamable HTTP<br>
> **Target chain:** Base Mainnet (8453) — gated, not live<br>
> **Legacy compatibility chain:** X Layer Mainnet (196)<br>
> **Endpoint:** `https://bobbyprotocol.xyz/api/mcp-http`<br>
> **Current settlement:** legacy OKB rail on X Layer via x402 during cutover

---

## What is Bobby?

Bobby is an adversarial decision protocol for crypto trading. Three AI agents debate every trade, a Judge Mode audits debate quality on six dimensions, and the protocol publishes commitments before outcomes. The historical deployment and current compatibility settlement rail are on X Layer; Base mainnet remains gated until its verified manifest, Safe ownership and canary evidence are published.

Never label an X Layer outcome as Base or TrackRecord V2 VERIFIED. Current public execution is paper/simulated unless a response includes explicit execution evidence.

Your agent can consume Bobby's intelligence, analysis, and debate system by calling the MCP endpoint below.

---

## Quick Start

### Step 1: Discover available tools

```bash
curl https://bobbyprotocol.xyz/api/mcp-http
```

Returns server metadata, tool list, and pricing.

### Step 2: Call a free tool

```bash
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "bobby_intel",
      "arguments": {}
    },
    "id": "1"
  }'
```

### Step 3: Call a premium tool (x402 payment)

Premium tools currently use the legacy 0.001 OKB X Layer compatibility rail. Discover pricing from the MCP endpoint instead of hardcoding it into integrations; the settlement asset and chain will change during the Base cutover.

```bash
# 1. Call without payment — get a challenge
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "bobby_analyze",
      "arguments": { "symbol": "BTC" }
    },
    "id": "2"
  }'
# Response: 402 with challengeId

# 2. Pay on-chain: call payMCPCall(challengeId, "bobby_analyze") with 0.001 OKB
#    Contract: 0xD9540D770C8aF67e9E6412C92D78E34bc11ED871 on X Layer (196)

# 3. Retry with payment proof
curl -X POST https://bobbyprotocol.xyz/api/mcp-http \
  -H "Content-Type: application/json" \
  -H "x-402-payment: <txHash>" \
  -H "x-challenge-id: <challengeId>" \
  -H "x-agent-name: your-agent-name" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "bobby_analyze",
      "arguments": { "symbol": "BTC" }
    },
    "id": "3"
  }'
```

---

## Available Tools

Bobby currently exposes **22 MCP tools** total:
- **15 free decision and analytics tools**
- **2 free bounty calldata builders**
- **5 premium x402 tools**

### Free Decision + Analytics Tier (15 tools)

| Tool | Description | Arguments |
|------|-------------|-----------|
| `bobby_recommend` | Current actionable recommendation with conviction and guardrails | `{ symbol? }` |
| `bobby_brief` | Compact one-shot briefing for token-constrained agents | `{ symbol? }` |
| `bobby_intel` | Full intelligence briefing (10 data sources) | `{}` |
| `bobby_ta` | Technical analysis (SMA, RSI, MACD, Bollinger, S/R) | `{ symbol }` |
| `bobby_stats` | Track record (win rate, PnL, recent trades) | `{}` |
| `bobby_xlayer_signals` | Smart money signals on X Layer | `{}` |
| `bobby_xlayer_quote` | DEX swap quote on X Layer | `{ from, to, amount }` |
| `bobby_uniswap_quote` | Uniswap-compatible exact-input quote on X Layer | `{ tokenIn, tokenOut, amount, chainId?, tradeType?, slippageBps? }` |
| `bobby_wheel_evaluate` | Pressure-test a b1nary Wheel leg with Bobby guardrails | `{ asset, side, strike, expiry_days, collateral? }` |
| `bobby_wheel_positions` | Read-only snapshot of b1nary positions plus Bobby regime context | `{ address }` |
| `bobby_wallet_balance` | Bobby's agentic wallet balance | `{ chain }` |
| `bobby_dex_trending` | Trending tokens on-chain | `{ chain }` |
| `bobby_dex_signals` | Smart money / whale / KOL signals | `{ chain, type }` |
| `bobby_bounty_list` | List recent adversarial bounties | `{ limit }` |
| `bobby_bounty_get` | Get single bounty details | `{ bounty_id }` |

### Premium Tier (current legacy x402 rail)

| Tool | Description | Arguments |
|------|-------------|-----------|
| `bobby_analyze` | Full market analysis with conviction score | `{ symbol, language? }` |
| `bobby_debate` | 3-agent debate (Alpha Hunter vs Red Team vs CIO) | `{ question, language? }` |
| `bobby_security_scan` | Token contract honeypot/rug risk scan | `{ address, chain }` |
| `bobby_wallet_portfolio` | Portfolio analysis (multi-chain) | `{ address, chain }` |
| `bobby_judge` | Judge Mode audit on 6 dimensions | `{ thread_id, language? }` |

### Bounty Tools (build unsigned calldata)

| Tool | Description | Arguments |
|------|-------------|-----------|
| `bobby_bounty_post` | Build calldata to post a bounty | `{ thread_id, dimension, reward_okb, claim_window_secs? }` |
| `bobby_bounty_challenge` | Build calldata to challenge a bounty | `{ bounty_id, evidence_hash }` |

---

## Legacy x402 Payment Contract

```
Contract:  0xD9540D770C8aF67e9E6412C92D78E34bc11ED871
Chain:     X Layer Mainnet (196)
RPC:       https://xlayerrpc.okx.com/
Function:  payMCPCall(bytes32 challengeId, string toolName)
Value:     0.001 OKB (1000000000000000 wei)
```

The `challengeId` is returned by the server when you call a premium tool without payment. Each challenge is single-use and expires after 15 minutes. This contract is not a Base deployment address.

---

## Reputation Endpoint

Check Bobby's on-chain track record and protocol reputation:

```bash
curl https://bobbyprotocol.xyz/api/reputation
```

Returns track record, conviction, economy and contract telemetry. During cutover, inspect the response chain metadata: chain `196` is the X Layer legacy archive and must not be interpreted as Base V2.

---

## Adversarial Bounties

Bobby's debate quality can be challenged by anyone. Six dimensions:

- `DATA_INTEGRITY` — Was the data accurate?
- `ADVERSARIAL_QUALITY` — Was the Red Team attack strong enough?
- `DECISION_LOGIC` — Was the CIO reasoning sound?
- `RISK_MANAGEMENT` — Were downside risks properly gated?
- `CALIBRATION_ALIGNMENT` — Does conviction match actual edge?
- `NOVELTY` — Is this original analysis or recycled groupthink?

**Bounty Contract:** `0xa8005ab465a0e02cb14824cd0e7630391fba673d` (verified on OKLink)

---

## Judge Mode Manifest

Machine-readable evaluation framework: `https://bobbyprotocol.xyz/ai-judge-manifest.json`

---

## Architecture

```
Your Agent
    │
    ▼
POST /api/mcp-http (JSON-RPC 2.0)
    │
    ├── Free tools → instant response
    │
    └── Premium tools → 402 challenge
            │
            ▼
        Pay 0.001 OKB on X Layer
        (AgentEconomyV2.payMCPCall)
            │
            ▼
        Retry with x-402-payment header
            │
            ▼
        Bobby executes tool + returns result
            │
            ▼
        On-chain receipt stored
```

---

## Links

- **Live Terminal:** https://bobbyprotocol.xyz/agentic-world/bobby
- **Protocol Landing:** https://bobbyprotocol.xyz
- **Submission:** https://bobbyprotocol.xyz/submission
- **GitHub:** https://github.com/anthonysurfermx/Bobby-Agent-Trader
- **Judge Manifest:** https://bobbyprotocol.xyz/ai-judge-manifest.json
- **Telegram Bot:** https://t.me/bobbyagentraderbot

---

*Bobby Protocol — born on X Layer, moving to a gated Base-first architecture*
