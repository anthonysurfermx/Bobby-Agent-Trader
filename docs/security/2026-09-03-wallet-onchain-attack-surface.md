# Bobby Protocol — attack surface around the wallet, swaps and on-chain money (2026-09-03)

Anthony's question: *we never custody, so where can we actually be attacked?* This is the
answer for the code that is live on bobbyprotocol.xyz after the Supabase cut-over. Points and
XP are out of scope on purpose; everything here is about a user's funds, our hot keys, or the
credentials that touch a real exchange account. Every finding below was verified at the
stated line; the three exploration reports it distils are summarised, not trusted blindly.

## 0. The honest model

We never hold a user's keys. What we DO hold or produce:

1. **Unsigned transactions we hand to the user's wallet** (swap / approve calldata built by
   the OKX DEX aggregator and forwarded by our API). If any link in that chain lies about
   `to`, `data`, `value` or the chain, the user signs the lie.
2. **A signature request** (SIWE sign-in). If the text is not what the user thinks, the
   signature can be worth more than a login.
3. **The browser origin** bobbyprotocol.xyz. Any script that runs there can rewrite (1) and
   (2) and read the 7-day session tokens in localStorage.
4. **One family of server hot keys** (`BASE_RECORDER_KEY` / `BOBBY_RECORDER_KEY`) that write
   Bobby's own records on-chain — with gas, never with users' funds.
5. **Exchange credentials** (OKX CEX) used by the public "$100 challenge" dashboard, and
   the OnchainOS agentic wallet behind an internal proxy.
6. **Payment gates** (x402 for MCP tools, premium signal, Telegram group activation) that
   must not be replayable.

## 1. Findings ranked by real-money risk

| # | Where | What an attacker could do | Status |
|---|-------|---------------------------|--------|
| 1 | Swap cards (`SwapConfirm`, `SwapExecutor`, `XLayerSwapCard`) sent server-supplied `to/data/value` **without pinning the chain**; `SwapConfirm` defaulted to X Layer while the app connects to Base | Calldata built for one chain broadcast on another: lost gas at best, an unintended call on the wrong network at worst | **Fixed** (d372dab): `chainId` pinned on every `sendTransaction`, `switchChain` first |
| 2 | **No Content-Security-Policy** on an origin that signs transactions and keeps 7-day session tokens in localStorage | Any injected script rewrites the swap target or exfiltrates sessions | **Partly fixed**: `frame-ancestors/base-uri/object-src/form-action` enforced; the full policy ships **Report-Only** to measure wallet/analytics/embed origins before enforcing `script-src`/`connect-src` |
| 3 | Third-party mint widget (`NFTClaimModal`) ran in a **same-origin `srcdoc` iframe** | The vendor's CDN could read every `bobby_session:*` token | **Fixed**: sandboxed without `allow-same-origin` |
| 4 | Wallet approval sheet showed **"DeFi México Hub"** and a defimexico.org icon on bobbyprotocol.xyz | Trains users to accept exactly the mismatch that flags phishing | **Fixed**: Bobby Protocol name + own icon |
| 5 | Browser signed the SIWE text **verbatim from the server** without checking it | A tampered/hijacked API could get a signature over arbitrary text | **Fixed**: host, origin, wallet, statement, 15-min expiry and nonce shape verified before signing |
| 6 | `/api/premium-signal` accepted **any successful tx** to Bobby's addresses, including zero-value calls, forever | Bobby's own public recorder txs unlocked the endpoint; no replay protection | **Fixed**: value ≥ minimum to Bobby only, single use per tx (verified live with a real recorder tx → refused) |
| 7 | `/api/agent-run?manual=true&wallet=…` built swap calldata for **any address named in the URL**, no session | Cheap LLM burn + calldata for someone else's wallet | **Fixed**: the wallet's own session is required (live: 401) |
| 8 | x402 MCP payments: the challenge id in the **header took precedence** over the one in the paid tx | Binding a paid tx to a different challenge; only a DB unique index stopped it | **Fixed**: the tx's challenge id is authoritative, the header may only confirm |
| 9 | Telegram group activation: **check-then-insert** on `payment_tx_hash`, no unique index | Two concurrent claims of one payment | **Fixed**: unique partial index (migration 0008) |
| 10 | Telegram webhook secret compared with `!==` | Timing side channel (theoretical) | **Fixed**: constant-time |
| 11 | `/api/dex-approve` returns the **spender from OKX's response**; `/api/dex-swap` and the agent path return OKX's `to/data/value` verbatim; **no allow-list on either side** | If OKX's API (or our TLS path to it) is compromised, users approve/spend to an attacker | **Open — design decision** (see §3) |
| 12 | `/api/bobby-pnl` (public) signs with the **live OKX CEX key** and returns balances, positions, leverage, liquidation prices, last fills | Public disclosure of the real account's state; if the key has trade/withdraw scope, a leaked env is catastrophic | **Open — Anthony decides** (§3) |
| 13 | Two upstreams are **plaintext IPs**: the OnchainOS wallet proxy (`bobby-wallet.ts`, read-only, internal-auth) and the X Layer trade droplet (`xlayer-trade.ts`, fails closed for `swap_data` unless HTTPS — and `DROPLET_URL` is unset in prod, so swap_data is 503 today) | MITM on the read path; the write path is already closed | Open, low today |
| 14 | Free MCP tools (`bobby_wallet_balance`, dex trending/signals) reach `/api/bobby-wallet` with the **internal secret attached** | Anonymous callers read Bobby's agentic-wallet balance | Open, read-only |
| 15 | Legacy `/login` page signs a **nonce-less, domain-less** "DeFi México Hub" message | Replayable login signature on our domain | Open — DeFi México product, slated for removal |
| 16 | `api_cache` persistent rate limiter keys derive from the **first `x-forwarded-for`** | Limits evadable if the header is client-appendable on this platform | Open, needs a check against `x-vercel-forwarded-for` |

## 2. What is already right (keep it that way)

- **Hot keys**: exactly one family, chain-scoped, read only by the recorder, `hardness-registry`,
  `generate-activity` and `auto-bounty`; every trigger sits behind a dedicated secret
  (`XLAYER_RECORD_SECRET`, `PROTOCOL_AUTOMATION_SECRET`, internal secret) and behind the
  two-key write latch (`PROTOCOL_WRITES_ENABLED` + exact `PROTOCOL_WRITE_CHAIN_ID`, chain
  asserted on the RPC before signing, freeze checked first). No request can choose an RPC,
  a contract address or a signer. `deploy-hardness` was tombstoned for the right reason.
- **Base contracts** are owned by the Safe `0x8BE6…53b4` (2 of 3); the hot signer
  `0xdf47…f4ec` is not an owner and holds 0.0012 ETH — a leak costs gas, not funds.
- **SIWE sessions**: EIP-4361 text built server-side from stored fields, single-use nonce
  consumed atomically, HMAC token with constant-time compare, session wallet must equal any
  wallet in a write body.
- **x402 verifier** checks recipient, live fee, `payMCPCall` calldata and tool name.
- **Nothing untrusted is rendered as HTML**: LLM and forum text go through React text nodes;
  the only `dangerouslySetInnerHTML` (blog) is DOMPurify-sanitised with an iframe host
  allow-list.
- **No key material in the repo**; production dependencies: 0 critical, 0 high.
- Public crons need `CRON_SECRET`; manual runs need `BOBBY_OPS_SECRET`; both fail closed.

## 3. Decisions for Anthony

1. **Swaps through OKX (finding 11).** Options: (a) keep OKX as a trusted upstream but
   allow-list the router/approve contract per chain and show the user the destination,
   spender and minimum received before signing; (b) build the calldata ourselves against
   Aerodrome/Uniswap on Base (the Builder Quest branch already has quote + calldata,
   "Bobby never signs"); (c) remove in-app execution and only ever *quote*. Today the
   reachable path is the text-mode desk (`SwapConfirm`) on X Layer/Base via the agent run.
   My recommendation for a product that talks to investors: (b) on Base, (c) everywhere
   else, and (a) as the interim guard.
2. **`/api/bobby-pnl` (finding 12).** Confirm in the OKX dashboard that `OKX_CEX_API_KEY`
   is **read-only** (no trade, no withdraw) and IP-restricted to Vercel egress if
   possible. Decide whether the public dashboard should keep exposing positions, leverage
   and liquidation prices, or only equity and win rate.
3. **Enforce the CSP** after a week of Report-Only data (the violation reports go nowhere
   today; add a `report-to` endpoint or read them from the browser console during QA).
4. **Retire the DeFi México product surfaces** on this domain (`/login`, the mint widget,
   TikTok embed): each is a script or signature surface that Bobby does not need.

## 4. Process finding

`npm run check:api` type-checks a **hand-picked list** of API files. A missing import in
`agent-run.ts` shipped to production for ~6 minutes tonight because the file was not in
that list. The list now includes every endpoint touched this week; the remaining 58
pre-existing type errors across 12 files are a backlog to burn down before switching the
check to `api/**/*.ts`.

## 5. Verification

- Live headers after d372dab: enforced CSP present, Report-Only policy present,
  Permissions-Policy denies payment/usb/serial/bluetooth.
- `/api/premium-signal` with Bobby's own recorder tx `0x1461f6…efbd` → `invalid_recipient_or_amount`.
- `/api/agent-run?manual=true&wallet=0x…` without that wallet's session → 401.
- Telegram tables restored on the new Supabase with their exact DDL, 13 rows, journaled,
  unique index on `payment_tx_hash`.
- Full RLS gate against production 054ac70: see `docs/infra/evidence/`.
