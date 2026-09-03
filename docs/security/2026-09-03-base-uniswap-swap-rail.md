# Base-only swap rail — Uniswap V3 (2026-09-03)

Branch `feat/base-only-swaps`, built on production `main@d55967d`. For Codex review before anything is enabled.

## Decision this implements

Base (8453) is the only network and Uniswap the only swap engine. No fallback to OKX, no X Layer swap paths, no new integrations with either. Historical X Layer records stay read-only and untouched (nothing in `api/_lib/chains.ts` protocol-chain machinery was changed).

## What was built

| Piece | File | Notes |
|---|---|---|
| Token allow-list | `src/lib/base-swap/tokens.ts` | ETH, WETH, USDC, USDT, DAI, cbBTC, AERO. Every address read back on-chain (`symbol()`/`decimals()`) before commit. Shared by API and UI. |
| Swap rail | `api/_lib/base-swap.ts` | Quote via QuoterV2 (Multicall3, 4 fee tiers direct + 4 two-hop combos via WETH), guards, calldata for SwapRouter02, eth_call simulation. |
| Endpoint | `api/base-swap.ts` | `GET` quote-only (public, rate-limited). `POST` quote + calldata behind `guardWrite`: wallet session, origin, freeze switch, body schema, per-IP and per-wallet limits. |
| Agent bridge | `api/_lib/dex-execution.ts` | `prepareBaseTrade()` for `agent-run`; any withheld guard aborts the trade instead of queueing placeholders. |
| MCP | `api/_lib/mcp-uniswap-quote.ts` | `bobby_uniswap_quote` now answers from Bobby's own quoter call on Base. Read-only. |
| UI | `SwapConfirm`, `SwapExecutor`, `DexQuotePanel` | Base-only; show router, route, spender, exact approval amount, min received, price impact, deadline, simulation status. Checkbox gate unchanged. |
| Tests | `scripts/test-base-swap.mts` | Offline: pinned addresses, allow-list, min-out math, path packing, calldata decode for ERC-20→ERC-20, ETH-in, ETH-out, two-hop; approval decodes to exact amount and router spender. |
| Smoke | `scripts/smoke-base-swap.mts` | Live, read-only: `verifyVenue()` (router/quoter `factory()` and `WETH9()` equal the canonical factory and WETH), five pair quotes, ticket-cap refusal, empty-wallet refusal. |

## Pinned contracts (Base 8453)

Verified on-chain 2026-09-03 and against `developers.uniswap.org` v3 Base deployments.

| Contract | Address |
|---|---|
| UniswapV3Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` |
| SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| WETH9 | `0x4200000000000000000000000000000000000006` |

`quoter.factory() == router.factory() == factory` and `quoter.WETH9() == router.WETH9() == WETH9` are re-checked live by the smoke test.

## Guards (server-side, fail closed — any one withholds calldata)

1. Both tokens on the allow-list; not the same asset.
2. Positive amount; slippage clamped to [0.05%, 3%].
3. A route with liquidity exists (else `422 no_route`).
4. Price impact vs pool spot (from `slot0`, fee included) ≤ 3%; warned above 1%.
5. Ticket valued in USD (stable leg, else a USDC quote of the input) and within [$1, $500]. `BASE_SWAP_MAX_TICKET_USD` may only lower the cap.
6. Recipient well-formed; balance of the input token (or ETH) ≥ amount, read on-chain.
7. `amountOutMinimum` = quoter output × (1 − slippage), computed here, never from the client.
8. Deadline = now + 20 min, enforced by `SwapRouter02.multicall(deadline, …)`.
9. When no approval is pending (ETH in, or allowance already sufficient) the exact swap calldata is simulated with `eth_call` from the recipient; a revert withholds it. When an approval is pending the simulation cannot run yet; the quoter has already executed the pool math for this exact size and the response says so (`simulation.reason`).

## Calldata shape

- Approve (ERC-20 in, only when allowance < amount): `token.approve(SwapRouter02, amountIn)` — exact, consumed by the swap. Never unlimited.
- Swap: `SwapRouter02.multicall(deadline, [exactInputSingle | exactInput, unwrapWETH9?])`
  - ETH in: `value = amountIn`, `tokenIn = WETH9`; the router wraps.
  - ETH out: swap `recipient = 0x…0002` (router's ADDRESS_THIS) then `unwrapWETH9(minOut, wallet)`.
  - Two-hop: packed path `tokenIn · fee · WETH9 · fee · tokenOut`.
- Recipient is always the checksummed session wallet.

## Why SwapRouter02 and not Universal Router + Permit2

The review asked for Universal Router + Permit2 with exact, expiring approvals. Under the exact-approval policy already in this codebase, Permit2 costs one more signature per swap (ERC-20 approve → Permit2, then Permit2 approve/permit → router, then the swap) and gains nothing: an exact ERC-20 approval to SwapRouter02 is consumed by the swap and leaves no residual allowance to expire. SwapRouter02 also keeps the encoding to one well-known function per case, which is what the unit tests decode and assert. Switching later is contained to `buildSwapTx`/`buildApproveTx` in `api/_lib/base-swap.ts` and the tests; nothing else would move.

## Removed

`api/dex-swap.ts`, `api/dex-approve.ts`, `api/dex-quote.ts`, `api/xlayer-trade.ts`, `api/_lib/dex-allowlist.ts` (+ its test), `XLayerSwapCard`, `OKXSwapWidget`, `src/lib/onchainos/dex-client.ts`, `src/lib/onchainos/xlayer-tokens.ts`. MCP tools `bobby_xlayer_signals` and `bobby_xlayer_quote` are gone from `mcp-http`, `mcp-bobby`, `registry` and the public docs. `bobby-intel` no longer calls the X Layer signal source. X Layer is out of the wallet network list (`src/config/reown.ts`).

`DEX_ALLOWED_ROUTERS_*` / `DEX_ALLOWED_SPENDERS_*` are no longer read by anything.

## Not done here (needs a human or a separate decision)

- **OKX credentials in Vercel.** The four `OKX_*` variables are still read by intel endpoints (`bobby-intel`, `signals`, `okx-onchain`, `okx-signal`, `smart-money-leaderboard`, `okx-security`). Removing them kills those data sources, not just swaps. Decide separately; the swap rail no longer needs them.
- **The CEX API key with `trade,withdraw` and no IP restriction** must be revoked in OKX by the account owner.
- **Swap receipts in Supabase.** A draft migration (`supabase/bobby-protocol/supabase/migrations/20260903000009_swap_receipts.sql`, untracked in this worktree, not authored in this session) exists; it names the engine `uniswap-v3-universal-router`, which does not match this rail. Not applied, not committed. Wire `/api/base-swap` POST → insert, and `agent-confirm` → status update, once the schema is agreed.
- **iOS** has no swap surface today; when it gets one it should consume `/api/base-swap` with the same session header.
- **X Layer copy elsewhere** (x402 settlement docs, protocol pages, historical views) was left alone on purpose: it is the ledger, not the swap rail.

## Review round 2 → what changed (on the merged branch)

| # | Finding | Change |
|---|---|---|
| P1 | `AdamsChat` called `/api/agent-run?manual=true&wallet=…` without the session → 401 | The call carries `x-bobby-session`; a 401 with a wallet tells the user to sign the session instead of failing silently. |
| P1 | Persistence fail-open (calldata handed out when the store failed; UIs green on 202/409/503) | `/api/base-swap` withholds `tx` when the built row could not be recorded (quote stays visible). Both cards: 202 → retry with backoff (6×); non-200 → amber "mined, NOT recorded" state with a Retry button; green only on 200. |
| P1 | Agent path skipped `recordBuiltSwap` | `prepareBaseTrade` records the built swap (with cycle id and identity) and aborts the trade when the store is unavailable. E2E now exercises this rule through the store hook, not a manual call. |
| P1 | Confirmed swaps never reached the cycle / `agent_trades` | `confirmSwapReceipt` writes one `agent_trades` row per confirmed receipt (idempotent on tx hash; `status='confirmed'`, `direction` BUY/SELL, USD from the stable leg, `owner_address`, `user_id`), links it on the receipt row, and bumps `agent_cycles.trades_executed/total_usd_deployed` when the calldata came from a cycle (`agent-run` mints the cycle id up front and logs it). `fetchOpenExposureUsd` now counts `confirmed` unsettled trades (this schema has no `open` status — the old query always returned 0). |
| P1 | Geogate: only `US` blocked, IP ≠ residence | Fail-closed, versioned allow-list `STOCK_COUNTRY_ALLOWLIST` (`2026-09-03-draft-pending-legal-review`, currently `MX` only); `BASE_STOCK_COUNTRY_ALLOWLIST` may only narrow it. Two independent gates remain: the human's attestation and the edge country. Neither replaces KYC where the issuer requires it — counsel must validate the list before it grows. |
| P1 | OKX not fully retired | `okx-perps`: every account action (server or user credentials) returns 410 before any credential is read. `AdamsChat`: the auto-execute block and `PerpsTradeCard` are gone; Bobby never places orders. `bobby-cycle` Phase 4b retired. `@okxweb3/dex-widget` removed. |
| P2 | Inline card lacked revoke | `toTradeExecution` carries `revokeTx`; `SwapConfirm` offers it. |
| P2 | Sell pre-check used `transfer`, router uses `transferFrom` + executor policy | Before the human pays for an approval, the exact swap calldata is simulated with the wallet's allowance overridden in state (`eth_call` + `stateOverride`; the allowance slot is discovered with one call). That runs `transferFrom`, the B20 sender/receiver/executor policies and the pool. A revert withholds the approval. Swap calldata is still only handed out after the real approval mines and the live re-simulation passes. |
| P2 | Selectors listed 13 stocks | Only the four with pools are listed (Codex's cut). |

Left as-is, on purpose: ESLint reports pre-existing warnings (0 errors) across files this work did not touch.

## Review round 3 → what changed

| # | Finding | Change |
|---|---|---|
| P1 | Cycle id used before the cycle row exists (FK); re-quote lost the cycle id | The cycle no longer builds calldata at all (see P1 attestation). `/api/base-swap` accepts `cycleId`; by then the cycle row is logged. If the FK still fails (23503), the built row is recorded **unlinked** and the response says so; nothing is silently dropped. The e2e emulates the FK. |
| P1 | "Confirmed" did not guarantee `agent_trades`; counters read-modify-write | One transactional, idempotent RPC `confirm_swap_receipt` (in the migration): lock the built row, flip it, upsert the trade on `idempotency_key = swap:<hash>`, bump the cycle's counters with `SET x = x + 1`, link the trade. Re-running with the same hash repairs a missing trade and answers `already`. The e2e emulates the RPC and asserts the repair. |
| P1 | Exposure global and eternal; `settle-trades` only read `open` | Exposure is per wallet (`owner_address`), BUYs only, confirmed and unsettled; cron cycles have no wallet and no exposure. `settle-trades` reads `status=confirmed & settled_at is null` (the schema has no `open`), prices allow-listed tokens from the rail's own pool quote (stocks fall back to the underlying on Yahoo), and no longer writes `status='closed'` (not allowed by the check). |
| P1 | Server invented the attestation | `agent-run` hands the card an **intent** (quote-only preview, cycle id, no recipient, nothing recorded). The card shows the preview, the human attests, then `/api/base-swap` builds, simulates and records for the session wallet with that attestation and the cycle id. |
| P1 | OKX still inside the cycle | The cycle's signal source is now `api/_lib/stock-signals.ts`: keyless, pools vs Chainlink reference + issuer pause flags + the underlying's 5-day move (Yahoo). `filterSignals` scores that source. OKX signal collection and the OKX risk-token gate are out of `agent-run`; prompts speak of Base pools, not OnchainOS. `bobby-intel` still reads OKX **public market data** for the briefing — data, not execution; removing it is a separate product call. |
| P2 | Revoke left the card in `ready` without `swapTx` | Every fresh server answer lands where it belongs: approval present → `idle`, swap present → `ready`. |
| — | Geogate on by default | `BASE_STOCK_SWAPS_ENABLED` must be exactly `"true"` or stock calldata is withheld (quotes still visible). Unset, `TRUE`, `1` = off. |
| — | iOS | No swaps, no transactional wallet, no perps, no trade buttons, no links that look like a way around it. iOS stays analysis, learning, character and progress. `/api/swap-receipt` GET can feed a read-only history; nothing on iOS builds or signs. |

## Review round 4 → what changed

| # | Finding | Change |
|---|---|---|
| P1 | The cron cycle (`bobby-cycle`) still leaned on OKX/X Layer; `bobby-pnl` read the private CEX account | Cycle: OnchainOS smart-money leaderboard (`chains=196`) removed, OKX-earn yield venue and `okx_cex` funding source retired, execution/proof copy rewritten (Base explorer link, no OKX/X Layer wording), OKX auth branch dropped. The record endpoint is now `/api/protocol-record` (chain follows `PROTOCOL_CHAIN`, Base by default) — file, callers, tests, `vercel.json` renamed. `bobby-pnl` is rebuilt on `agent_trades` rows the receipt verifier confirmed on Base, marked at the rail's own pool quote; aggregates only, no exchange. **Remaining, declared:** `bobby-intel` still reads OKX *public market data* (prices, funding, indicators) for the briefing — data, not execution; replacing that provider is a separate product decision. |
| P1 | Circuit breaker queried `status=closed` (not in the schema) | It reads `status=confirmed` with `outcome` set (settled rows). |
| P1 | `cycleId` proved nothing | Intents are signed: the cycle mints `intentToken = HMAC(cycleId, wallet, pair, amount, expiresAt)` with `BOBBY_SESSION_SECRET` (1h TTL). `/api/base-swap` links a build to a cycle only when the token verifies for the **session** wallet, pair and amount; otherwise `403 intent_invalid`. No schema change needed. |
| P1 | Risk gate trusted the LLM | `agent-run` builds the deterministic conviction map from the scored signals (same formula the prompt shows) and passes it; the gate refuses any ticker not in the map, and the carried confidence is the deterministic one. Underlying tickers the model may answer (`NVDA`) are normalized to the listed symbol. |
| P1 | Gate blocked every normal trade at $500; SELL scored as a short; 48h expiry hid held lots | `maxDailyLoss` now means what it says: realized losses in the last 24h for the wallet (new gate input); position size is bounded by the exposure cap only. Exposure is **what the wallet holds on-chain** in tokenized stocks at the Chainlink reference (`fetchOnchainStockExposureUsd`) — a sold lot is gone, a held lot never expires. In the RPC a SELL is settled at confirm (a realization, not a position); `settle-trades` ignores it. Tests updated: the "KNOWN QUIRK" is gone. |
| — | Apple | Unchanged and restated: iOS stays analysis, learning, character, progress. No swaps, no transactional wallet, no perps, no trade buttons, no links around it. `BASE_STOCK_SWAPS_ENABLED` stays `false` until the territorial questions are settled. |

## Review round 5 → what changed

Owned first: the round-4 note said "all green" while `test:protocol-write-safety` failed on an assertion I had just invalidated (`tradingAuthHeaders()` removed from the cycle). Fixed: the test now asserts the *absence* of any OKX auth path in the cycle, and every suite below was re-run after the last edit.

| # | Finding | Change |
|---|---|---|
| P1 | `/api/bobby-pnl` public with per-trade rows across all wallets | Two scopes: anonymous → aggregates only (`openPositions`/`closedPositions` empty); signed in (wallet session or Supabase bearer) → that identity's own rows (`user_id` / `owner_address`). Service headers stay server-side; no row leaves for an anonymous caller. |
| P1 | PnL contract broke screens; positions not net of sells; sells and 48h "realized" PnL | `startingCapital` (= capital deployed), `leverage: '1x'`, `totalTrades`, `currentEquity`, `winRate` all present; `BobbyChallengePage`, `PerformanceStats`, `TradeHistory` and the HUD keep working with zero trades. Open lots are BUY units minus later SELL units per symbol (FIFO). `settle-trades` settles a BUY **only** when a later SELL by the same wallet realized it (exit = the sell's price); nothing is realized by the clock any more. |
| P1 | One global Polymarket edge lifted every stock | `calculateStockConviction`: the filter score *is* the evidence; Polymarket adds only when a market is about that asset (name/ticker in the title, up to +0.3). At-reference stocks (45) stay under the 0.7 gate; a clear discount + momentum (70) passes on its own. |
| P1 | Intent tokens reusable for an hour | Each intent carries a random `jti` inside the HMAC. The receipt store enforces single use: a still-`built` row for the jti is superseded by a re-quote (needed after an approval), a `confirmed` row spends it for good (`409 intent_consumed`); partial unique index `(wallet_address, intent_jti)`. E2E: supersede then refuse. |
| P1 | Guards failed open (RPC/Chainlink/Supabase → 0) | Exposure and the realized-loss ledger return errors, not zeros; if either is unavailable the cycle approves **nothing** (`blocked-risk-inputs-unavailable`). Chainlink rounds are validated (positive answer, `answeredInRound ≥ roundId`, `updatedAt` within 96h) in both the exposure read and the reference read; a bad round throws. |
| P1 | Circuit breaker global; `status: 'halted'` not in the schema | Breaker filters by `owner_address` for the requesting wallet (cron cycles never trade). A halted cycle logs `status: 'completed'` with the halt in `llm_reasoning`. |
| P2 | Base-only not guaranteed by environment | `PROTOCOL_CHAIN=xlayer` now throws at boot ("retired"); `.env.example` says `base` / `8453`; MCP wallet tools default to `base`/`8453`; the OnchainOS leaderboard call in `mcp-http` is gone. X Layer config remains only for explorer links and read-only archive views. |

## Verification run

```
npm run check:api           # tsc clean
npm run test:base-swap      # offline calldata tests
npm run smoke:base-swap     # live read-only against Base
npm run test:api-security   # 47/47 (with BOBBY_SUPABASE_* placeholders)
npm run build               # vite build clean
```
