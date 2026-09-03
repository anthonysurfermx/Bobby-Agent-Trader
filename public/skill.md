# Bobby Protocol — Agent Integration Skill

> **Version:** 3.0.0
> **Protocol:** MCP over Streamable HTTP
> **Chain:** Base mainnet (8453)
> **Endpoint:** `https://bobbyprotocol.xyz/api/mcp-bobby`
> **Custody:** none; users sign their own transactions

## What Bobby does

Bobby is an accountability layer for autonomous financial decisions. Alpha Hunter proposes a thesis, Red Team attacks it, and the CIO resolves the debate behind a deterministic risk gate. The decision is committed before its outcome and can later be resolved with signed oracle evidence.

Bobby is Base-only. It does not connect to centralized-exchange accounts, accept exchange API credentials, or expose an exchange execution route.

## Discover the live tools

Always prefer runtime discovery over a copied list:

```bash
curl -X POST https://bobbyprotocol.xyz/api/mcp-bobby \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

The production endpoint currently exposes:

- `bobby_analyze`
- `bobby_debate`
- `bobby_ta`
- `bobby_intel`
- `bobby_uniswap_quote`
- `bobby_stats`
- `bobby_wallet_balance`
- `bobby_wallet_portfolio`
- `bobby_security_scan`
- `bobby_dex_trending`
- `bobby_dex_signals`

## Call a tool

```bash
curl -X POST https://bobbyprotocol.xyz/api/mcp-bobby \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "bobby_uniswap_quote",
      "arguments": { "tokenIn": "USDC", "tokenOut": "NVDAc", "amount": "10" }
    }
  }'
```

The quote tool is read-only and never returns wallet calldata.

## Base execution safety

The web swap endpoint separates quoting from execution:

1. `GET /api/base-swap` returns a read-only route and market reference.
2. A write request must prove the wallet session, pass origin/rate-limit/risk/eligibility checks and match an exact operations switch.
3. Bobby prepares bounded calldata; only the user's wallet can sign it.
4. A receipt is recorded before calldata is handed out and confirmed against Base afterward.
5. Confirmed receipts rebuild FIFO lots in canonical block and transaction order under a per-wallet-and-pair lock.
6. PnL is computed from the complete paginated ledger and capital requirements are aggregated per wallet.

Tokenized-stock calldata remains disabled until legal and operations approval. Read-only quotes remain available.

## Base contracts

| Contract | Address |
|---|---|
| BobbyTrackRecord V2 | `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321` |
| BobbyConvictionOracle | `0x27f51D711171c830dd796D4B03914a8C6c46D75e` |
| BobbyAgentEconomyV2 | `0x009de59e0e7f4109fF9E89E744A4412082AD2aaF` |
| BobbyAdversarialBounties | `0x73fD6c77ff0403Ea071e8721c76f88cE34ac9968` |
| HardnessRegistry | `0x15800F40b8988765AD3F46030B73bC8109A793f5` |
| BobbyAgentRegistry | `0xB3137D7afE26fbdBcAA95573C7A20be896efde93` |
| BobbyIntentEscrow | `0x5D9d534419421B7Edfe9Bb509E4c48512256BC97` |

All addresses link from `https://bobbyprotocol.xyz/protocol/docs` to Basescan.

## Boundaries

- Analysis is not investment advice.
- A favorable verdict is not a promise of profit.
- Bobby does not hold funds or sign for users.
- Telegram setup never requests a wallet or payment.
- A missing country, attestation, balance, allowance, simulation or operations flag withholds stock calldata.

## Links

- Product: https://bobbyprotocol.xyz
- App: https://bobbyprotocol.xyz/app
- Documentation: https://bobbyprotocol.xyz/protocol/docs
- Public record: https://bobbyprotocol.xyz/protocol/calls
- MCP endpoint: https://bobbyprotocol.xyz/api/mcp-bobby
- GitHub: https://github.com/anthonysurfermx/Bobby-Agent-Trader
