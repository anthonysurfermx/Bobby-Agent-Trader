# Audit 2026-09-28 — response

Source: external audit of 2026-09-28 (swaps, contracts, database and MCP). Every finding was re-checked against
`origin/main` 3574ebf (the checkout the auditor read had diverged from `main`), and against production where the
finding was about production.

| # | Sev | Finding | Verdict | Status |
|---|-----|---------|---------|--------|
| 1 | P0 | `anon` / `authenticated` can write through `agent_cycles_public` | Confirmed in production | **Fixed in production**, regression test |
| 2 | P1 | $1–$1 canary makes every sale impossible | Confirmed | Fixed: separate sale limits, no sale minimum |
| 3 | P1 | `recordBuiltSwap` accepts identical calldata from another intent | Confirmed (reproduced) | Fixed + a second latent bug |
| 4 | P2 | `bobby_uniswap_quote` hides that a trade is blocked | Confirmed | Fixed |
| 5 | P2 | MCP payment writes are unconfirmed; the receipt is fire-and-forget | Confirmed | Fixed: nothing paid leaves before both writes are confirmed |
| 6 | — | Contract trust boundaries (TrackRecordV2, IntentEscrow, AgentRegistry) | Confirmed | Public copy corrected; on-chain items need a redeploy (Safe) |

## 1. P0 — browser roles could write through the public cycle view

**Root cause.** Supabase's default privileges in `public` (`postgres: anon=arwdDxtm, authenticated=arwdDxtm`) give
ALL on every new relation to both browser roles. Migrations 0010 and 0011 revoked from the `PUBLIC` pseudo-role only,
which does not touch those direct grants. `agent_cycles_public` is a single-table view (auto-updatable) owned by
`postgres` without `security_invoker`, so an anonymous `PATCH`/`DELETE` through PostgREST became a write on
`agent_cycles` past its RLS. `agent_trades_public` carried the same grants but is a join (not updatable).

**Fix.** `supabase/bobby-protocol/supabase/migrations/20260928210000_public_views_select_only.sql`: revoke all from
`anon, authenticated` on both views, grant `SELECT` back. Applied to bobby-protocol (`qbvdqkknnuweatptjohi`) on
2026-09-28 via MCP (`public_views_select_only`).

**Verified in production.**
- `has_table_privilege`: both roles `SELECT` only on both views; `service_role` unchanged.
- Anonymous REST: `GET agent_cycles_public` → 200; `PATCH` / `DELETE` (nil-uuid filter, matches no row) → 401 `42501
  permission denied for view agent_cycles_public`.
- No other relation in `public` is reachable by the browser roles without RLS (query over `pg_class`).

**Was it used?** The `bobby_outbox` trigger journals every INSERT/UPDATE/DELETE on `agent_cycles` — writes through
the view included. Since the cutover (2026-09-03) the journal holds only: one INSERT + one UPDATE per day at 12:00 UTC
(the scheduled cycle), the 3,408-row visibility UPDATE of 2026-09-07 (migration 0011), and 9 DELETEs on 2026-09-03 of
rows created 11–12 s earlier with status `failed` (cutover gate probes). No anomalous write. API logs (24 h retention)
show no non-GET request on either view other than this verification.

**Regression.** `scripts/test-rls-lockdown-pg.mts` now reproduces Supabase's default privileges, shows the exploit
(an anonymous UPDATE through the view rewrites `agent_cycles`), applies the migration and asserts `42501` for
UPDATE / DELETE / INSERT with `SELECT` intact.

## 2. P1 — the canary could never sell

With `BASE_SWAP_MAX_TICKET_USD=1` and the $1 minimum, a sale (valued by its USDC output) had to be worth exactly
1.000000 USDC: 0.00437922 NVDAc quoted 0.999999 (below the minimum), one unit more 1.000001 (above the maximum).

**Fix.** A sale (anything → a stablecoin, `swapSide()` in `src/lib/base-swap/tokens.ts`) is no longer bounded by the
entry limits:
- no minimum — a position must always be closable, dust included;
- its own cap `limits.maxSellUsd` = `BASE_SWAP_MAX_SELL_USD` when set, otherwise `sellCapMultiple` (2) × the entry
  cap; never above the code cap ($100 for B20, $500 overall). Canary today: entries $1–$1, sales up to $2 per ticket;
  a larger position sells in parts, never trapped;
- entries are unchanged ($1 minimum, env brake).

Applied in the three places that enforced it: the server (`api/_lib/base-swap.ts`), the client's local guard
(`src/lib/base-swap/quote-guard.ts`, no minimum for a sale, same local cap) and the desk UI (`DeskSwap.tsx` arms a
sale against the sale cap). The quote now carries `side`.

Tests: `scripts/test-stock-swap-canary.mts` (the audit's exact amounts, dust, the 2× cap, the env override and the
code ceiling) and `scripts/test-base-swap.mts` (local guard: $0.90 sale passes, $0.90 buy refused, $250 sale refused).

## 3. P1 — calldata collision between intents

On a 409, `recordBuiltSwap` returned `recorded: true` whenever `(wallet, calldata_hash)` existed, without comparing
intent, cycle or status. Identical bytes built for another intent would be handed out; its confirmation would land on
the first intent's cycle, and bytes already confirmed could execute a second time with a hash that can never be
recorded.

**Fix.** Re-delivery only for the same build: same `intent_jti`, same `cycle_id`, status `built`. Otherwise
`calldata already issued` (the endpoint withholds the calldata and asks for a fresh quote — a quote one second later has
a new deadline, hence new bytes) or `intent already used` for a spent intent.

Also fixed: a 409 caused by a missing cycle (FK `23503`) was read as "intent already used" whenever an intent was
present, so the "record unlinked" fallback never ran for intent-bearing builds. The FK case is now handled first.

Test: `scripts/test-swap-receipt-record.mts` (in `npm run test:base-swap`) against a store with the table's real keys.
Run against the old code it fails exactly on the audit's case.

## 4. P2 — the MCP quote hid that a trade is blocked

`bobby_uniswap_quote` now returns `executable`, `txWithheld`, `warnings`, `limits`, `side`,
`requiresStockEligibility` and a plain `execution` sentence. A wallet-free quote does not evaluate the stock switches,
so the adapter adds them (`tokenized-stock swaps are disabled` / `limited to the launch allow-list`) — the swap
endpoint already tells any wallet outside the list the same; the list itself is never disclosed.

## 5. P2 — MCP payment persistence

`completeChallenge` and `storeReceipt` ignored failed HTTP responses and the transports fired the receipt without
awaiting it (on Vercel it can be cut off after the response).

**Fix.** `settlePaidCall()` in `api/_lib/mcp-challenges.ts`, used by both transports (`mcp-http`, `mcp-bobby`):
receipt first, then completion, each confirmed (completion must flip exactly the in-progress row; the receipt is
idempotent for the same payment and a conflict for another transaction). If either write fails the paid answer is held
back, the challenge returns to `retryable_failure` and the client gets `-32603 retryable` — the same payment redeems
again, no second payment. The receipt's explorer link now comes from the protocol chain (basescan), not a hardcoded
X Layer URL that would have surfaced on the public metadata endpoint with the first receipt.

A live redemption on Base needs a real payment and was not made. `scripts/test-mcp-payment-transport.mts` runs the
full redemption through both transports (402 → pay → claim → execute → receipt → completion → replay) including a
failed receipt write and the retry; it had been dead since `bobby_security_scan` was retired (2da495d) and now uses
`bobby_analyze`.

## 6. Contracts — trust boundaries

Nothing here moves funds; the bytecode is what it is until a redeploy.

- **TrackRecordV2** prices a declared exit with Pyth; the recorder chooses the exit instant inside a bounded window.
  It grades the call; it does not prove a swap closed. `/protocol/docs`, the architecture page and the flow diagram
  said Pyth "proves the exact entry and exit instants" — corrected.
- **IntentEscrow** records attestations and does not execute swaps. Public copy already said so; no change.
- **AgentRegistry** answers `supportsInterface(0x80ac58cd)` (ERC-721) with no transfer functions, and `tokenURI`
  hardcodes "AI Agent Identity on X Layer". Both are in deployed bytecode: fixing them needs a new registry (3-round
  audit rule, Safe 2/3, re-registration of agents) — **Anthony's decision**. Meanwhile the public copy no longer says
  "staked" (the contract has no stake: `registerAgent` is owner-only) and says the identities are not transferable;
  `/api/bobby-protocol-stats` adds `transferable: false`; the heartbeat page's fallback address pointed at the old
  X Layer registry and now uses the Base one. Contract sources are left untouched so they keep matching the deployed
  bytecode.

## Also found

- **CI on `main` has been red since 2026-09-27** at `test:remediation-r2`, so every later step of the application job
  (MCP transport, build, lint, audit) had not run for two days. Three stale fixtures, none a product bug: the risk
  notice moved to `NucleoRisk.tsx` (same copy); `forum-resolve` grades on the 1H candle path since 44bffc1 and the
  fixture still served the old ticker (it now serves candles, and asserts a win at the target stamped at the bar close);
  the transport test paid for the retired `bobby_security_scan`. Lint then failed on non-app JS added on 2026-09-26
  (`nucleo/**` engine sources, `docs/**` and `ios/**` prototypes); they join the existing ignore list next to
  `public/**`.
- `AGENTS.md` described X Layer / OKB / `defimexico.org` / the legacy Supabase project; corrected with the facts
  verified here.

## Verification run

Every step of CI's application job, locally and in order: `test:playbooks`, `test:api-security` 47/47,
`test:record-auth`, `test:protocol-write-safety`, `test:risk-gate`, `test:asset-discovery`, `test:base-swap`
(3 files), `test:ios-remediation`, `test:trader-land-api`, `test:desk-audit`, `test:stock-ticker-routing`,
`test:remediation-r2` 46/46, `test:rpc-redaction`, `test:mcp-payment-transport` 15/15, `npm run build` (includes
`check:api`), `lint --quiet`, `npm audit --audit-level=high`. Postgres job on a local Postgres 17:
`test:rls-lockdown-pg`, `test:swap-ledger-pg`, `test:agent-registry-pg`.
