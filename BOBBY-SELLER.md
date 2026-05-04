# BOBBY-SELLER.md — x402 integration spec for Bobby Protocol

> Drop-prompt for AI coding agents (Cursor, Claude Code, Copilot, etc.) working
> on this repo. Mirrors OKX's official `SELLER.md` but constrained to Bobby's
> Vercel + TypeScript surface.

## CONSTRAINTS

- Network: `eip155:196` (X Layer mainnet) — only network supported.
- Facilitator: `OKXFacilitatorClient` (never `HTTPFacilitatorClient`).
- Default token: USDT0 at `0x779ded0c9e1022225f8e0630b35a9b54be713736` (6 decimals).
- Pricing: USD strings (`"$0.01"`) — SDK auto-converts to USDT0 atomic units.
- Recipient: `process.env.BOBBY_TREASURY_ADDRESS` (treasury wallet).
- Runtime: Vercel serverless functions (`@vercel/node`). Do NOT introduce Express
  unless replacing a function with an Express adapter; prefer the wrapper at
  [api/_lib/x402.ts](api/_lib/x402.ts).
- `await resourceServer.initialize()` runs lazily once per cold start, inside
  the wrapper. Handlers must not call it.
- Schemes registered: `exact`. Add `deferred` only when introducing batch flow.

## ENV VARS

```
OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE   # already used by Bobby
BOBBY_TREASURY_ADDRESS                         # 0x09a8...
X402_ENABLED                                   # "true" to flip on
X402_NETWORK=eip155:196
X402_FACILITATOR_BASE_URL=https://web3.okx.com
X402_SYNC_SETTLE=true
X402_DEFAULT_PRICE_USD=$0.01
```

## PACKAGES (versions pinned in package.json)

```
@okxweb3/x402-core      ^0.1.0
@okxweb3/x402-evm       ^0.1.0
@okxweb3/x402-express   ^0.1.0
```

## USAGE — protect a Vercel handler with one helper call

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensurePaid } from './_lib/x402.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await ensurePaid(req, res, {
    routeKey: 'POST /api/mcp-bobby#bobby_analyze',
    priceUsd: '$0.05',
    description: 'Bobby full market analysis (10 sources)',
  })) return; // 402 written, bail out

  // ... business logic only runs after a verified, settled payment
  res.status(200).json({ result: '...' });
}
```

## ROUTES PROTECTED BY BOBBY (Phase 1)

| Tool / endpoint                 | Price (USD) | Reason                              |
| ------------------------------- | ----------- | ----------------------------------- |
| `bobby_analyze`                 | $0.05       | Full debate + 10-source briefing    |
| `bobby_debate`                  | $0.10       | Mandatory 3-agent room              |
| `bobby_intel`                   | $0.02       | Cached 10-source intelligence       |
| `bobby_security_scan`           | $0.03       | Honeypot + rugpull contract scan    |
| Free: `tools/list`, healthchecks, public stats |          |                                     |

(Free tools never call `ensurePaid`. Paid tools fall back to the legacy OKB
challenge gate when `X402_ENABLED=false` — see `api/mcp-bobby.ts`.)

## DECISION TREE

```
Need to charge for an HTTP endpoint?
├─ Single, fixed price        → ensurePaid({ priceUsd: "$0.05" })
├─ High-frequency micro       → register DeferredEvmScheme + use 'deferred' (Phase 1.5)
├─ Two parties, dispute risk  → use BobbyIntentEscrow.sol + 'escrow' (Phase 2)
├─ Metered, unknown total     → wrap llm.ts with voucher (Phase 3)
└─ A2A via Telegram/IM        → return challenge URL in DM (Phase 4)
```

## DO NOT

- Hardcode token amounts in atomic units. Use USD strings.
- Call `paymentMiddlewareFromHTTPServer` from a Vercel handler — there is no
  Express app. Use `ensurePaid` / `requirePayment` from `api/_lib/x402.ts`.
- Introduce networks other than `eip155:196`.
- Call `resourceServer.initialize()` inside the handler. The wrapper handles it.
- Remove the legacy OKB gate in `api/mcp-bobby.ts` until at least one x402
  charge has been confirmed end-to-end on testnet.
