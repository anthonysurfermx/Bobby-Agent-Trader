# Base tokenized-stock swaps — cut-over runbook

Branch: `feat/base-stocks-merged` @ `7d4829d`
Written 2026-09-03, after review round 8 closed.

The rail is **fail-closed everywhere**: with none of the steps below applied,
`/api/base-swap` refuses to build calldata. Each step opens exactly one gate.
Do them in order — step 4 is the only one that changes user-visible behaviour.

---

## 1. Ledger test gate — DONE (2026-09-03)

`test:swap-ledger-pg` exercises the PL/pgSQL in migration `20260903000009`
against a real Postgres: FIFO in chain order, out-of-order receipts,
partial sells, idempotent confirm, and concurrent confirms that must never
over-consume a lot.

Needs any Postgres 15+ — **not** Docker and not Supabase. On a Mac:

```bash
brew install postgresql@17
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C LANG=C
initdb -D /tmp/pgscratch -U postgres --auth-local=trust --auth-host=trust --locale=C
mkdir -p /tmp/pgsock && pg_ctl -D /tmp/pgscratch \
  -o "-p 54329 -k /tmp/pgsock -c listen_addresses=127.0.0.1" \
  -l /tmp/pgscratch/server.log start
```

Then, from the worktree:

```bash
DATABASE_URL="postgres://postgres@127.0.0.1:54329/postgres" npm run test:swap-ledger-pg
```

Result on `7d4829d`: **3/3 scenarios pass, twice in a row.** The socket dir
must be short (`-k /tmp/pgsock`) — a deep path exceeds the 103-byte limit
for Unix sockets and the server refuses to start.

The script refuses a non-local `DATABASE_URL` unless
`SWAP_LEDGER_PG_ALLOW_REMOTE=1`. Do not set that against production.

> Three harness bugs were fixed in `7d4829d` to make this runnable at all;
> the migration SQL itself was never changed and passed unmodified. Note
> that with `DATABASE_URL` unset the script exits 0 printing "skipped" —
> a green line there proves nothing. Read for the "3 scenarios" output.

## 2. Apply the migration (prod: `qbvdqkknnuweatptjohi`)

`supabase/bobby-protocol/supabase/migrations/20260903000009_swap_receipts.sql`

Creates `bobby_swap_receipts` and `bobby_lot_fills` (both RLS-on,
service_role only), adds four lot-accounting columns to `agent_trades`
(`units`, `units_remaining`, `block_number`, `tx_index`), and defines
`confirm_swap_receipt` / `bobby_match_fifo` / `bobby_refresh_sell` /
`bobby_close_lot_if_empty`.

Additive only — every statement is `if not exists` / `create or replace`,
and no existing column or row is rewritten. Safe to apply before step 4;
until the flag flips, nothing writes to these tables.

## 3. `PROTOCOL_CHAIN=base` in the production environment

`api/_lib/chains.ts` resolves this strictly: an unknown value throws, and
the retired `xlayer` throws with its own message. Unset means Base already
— setting it explicitly is about making the intent legible, not changing
behaviour.

## 4. `BASE_STOCK_SWAPS_ENABLED=true` — the deliberate flip

`api/_lib/base-swap.ts:691` checks `!== 'true'` (exact lowercase string).
**This is the step that lets real wallets sign real swaps.** Everything
before it is inert without it.

Optional brake, same environment: `BASE_SWAP_MAX_TICKET_USD` can only
*lower* the per-ticket cap below the code constant, never raise it.

## 5. Country allow-list — needs a legal sign-off, not a config change

`src/lib/base-swap/tokens.ts:115`

```
version:   '2026-09-03-draft-pending-legal-review'
countries: ['MX']
```

`BASE_STOCK_COUNTRY_ALLOWLIST` in the environment can only **narrow** this
by intersection — it can never add a country. US persons are refused by a
separate hard check above it. So shipping to any country other than MX is
a code change plus legal review, and the `-draft-pending-legal-review`
suffix should be retired in the same commit that gets that sign-off.

## 6. Revoke the OKX API key

OKX left the cron cycle in review round 4 and the swap path in round 6;
X Layer is archive-only since round 7. The key has no remaining consumer.
Revoke it in the OKX console (read-only market data needs no key).

---

## Rollback

Step 4 is the switch: set `BASE_STOCK_SWAPS_ENABLED=false` (or unset it)
and the rail closes on the next invocation — no deploy needed. Receipts
already written stay; they are an audit trail, not live state. The
migration is additive and needs no down-migration.
