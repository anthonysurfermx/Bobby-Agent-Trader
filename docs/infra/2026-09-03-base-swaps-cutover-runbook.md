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

## 2b. Apply migration `20260903000010_lock_down_public_reads.sql` — BEFORE step 4

Added by the final audit (round-2 remediation, `docs/security/2026-09-03-remediation-r2.md`).
Revokes anon/authenticated on `api_cache`, `agent_trades`, `agent_cycles`, adds the
shaped views `agent_trades_public` / `agent_cycles_public` the dashboard now reads,
and re-parents swap receipts in the identity merge. Additive plus revokes; the
server is unaffected (every server reader uses the service key). Regression:
`DATABASE_URL=… npm run test:rls-lockdown-pg`. After applying, confirm with
`bobby_rls_matrix()` that no anon policy remains on those three tables.

## 2b-ii. Apply migration `20260903000011_cycle_provenance.sql` — right after 0010

BP-09 (2026-09-04 review). Adds `agent_cycles.visibility` (default private) and
rebuilds both public views on POSITIVE provenance: a cycle is public only when its
producer said so; a trade is public only through a public cycle. Historical rows
stay private — after applying, review and run the operator statement left as a
comment in the migration to re-publish the rows the scheduled cycle produced.
Regression: `DATABASE_URL=… npm run test:rls-lockdown-pg`.

## 2b-iii. Apply migrations `0012_hardness_agent_cas.sql` and `0013_mcp_challenge_binding.sql`

> Preflight 2026-09-05 (read-only): `0010` is **already applied** on prod; `0011`/`0012`/`0013`
> pending, preconditions verified. `0012` adds `hardness_agents.row_version` (bigint CAS counter);
> the pre-existing text `version` column (semver) is untouched. Apply in order 0011 → 0012 → 0013.

BP-10 and BP-08 (2026-09-04 review). `0012` adds `hardness_agents.version`, the
compare-and-swap registration RPC and the single-use ownership transfer RPC (+ nonce
table). `0013` adds the client-secret hash, request hash lifecycle columns and the
new challenge statuses. Both additive. Client contract change for paid MCP tools: the
402 now returns `clientSecret`; the retry must repeat the **identical** request with
`x-402-payment`, `x-challenge-id` **and** `x-challenge-secret`. A tool failure leaves
the payment retryable; a completed call replays its stored result to the same client.
Regression: `npm run test:agent-registry-pg` and the BP-08 checks in `test:remediation-r2`.

## 2c. Safe transaction — activate the canonical Pyth on TrackRecordV2 (C-02)

Read-only state on 2026-09-03: `activePyth = 0x8250…` (old), `0xbC16…` approved,
timelock elapsed 2026-08-21 19:35 UTC. One transaction from the 2/3 Safe `0x8BE6…53b4`:

- to: `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321`
- value: 0
- data: `0xb4d6badf000000000000000000000000bc16aee60f64864882bc6c4e428e148fc0e272f5`
  (`activatePyth(0xbC16aee60f64864882BC6C4E428e148Fc0E272F5)`)

Then `npm run check:mainnet:postdeploy` — the verifier that failed in round 1.

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

## Not a switch step, but blocks citing the registry

`HardnessRegistry` and `BobbyAdversarialBounties` are fixed in source
(`security/remediation-r2`) and unchanged on chain — both are non-upgradeable.
Redeploy is under the three-round `.sol` audit rule. Until then, do not cite
HardnessRegistry stats publicly; both contracts hold 0 ETH.

After the redeploy, bounty resolution is optimistic: a resolved bounty sits in
`PENDING_RESOLUTION` for `disputeWindow` (2 days) and someone must call
`finalizeResolution(id)` / `finalizeBountyResolution(id)` — permissionless, so
the winner can, but plan a cron. A `DISPUTED` bounty waits for a Safe
transaction (`settleDispute` / `settleBountyDispute`) — or, after
`disputeSettlementTimeout` (30 days), anyone can finalize the standing proposal:
the proposed winner is paid and the disputer's bond is forfeited to the treasury.
Challenges and party disputes post a bond (`challengeBond`, fixed per bounty at post
time, initially the minimum bounty, capped at 1000× the absolute minimum); the Safe
disputes without one. Forfeited bonds go to `treasury` (defaults to the Safe; may be
set to a burn address) — never to the poster. If the Safe does not settle a dispute
within `disputeSettlementTimeout`, the proposal stands and the disputer's bond is
forfeited: the Safe must rule on a real shill inside that window.

Deploy configuration for the redeploy (Codex r5): `BOUNTY_TREASURY_ADDRESS` = the Safe
`0x8BE60853F27b944e11486285d95c3e06596553b4` (DeployBase defaults an unset value
to the Safe, but mainnet readiness requires it explicitly; never the deployer) and
`CHALLENGE_BOND_WEI` = `25000000000000`
(= `MIN_BOUNTY_WEI`). DeployBase sets both `treasury` and both bonds BEFORE the
two-step handoff, writes `treasury` and `fees.challengeBondWei` to the manifest,
and `VerifyBaseDeployment` / `check:mainnet:*` / `finalize:base-manifest` all
re-prove them. For bounties of material value, make the bond proportional to the
reward or cap the reward — a follow-up.

After any `forge build` that touches HardnessRegistry or BobbyAdversarialBounties:
`npm run gen:hardness-abi` regenerates **both** `api/_lib/hardness-registry.abi.ts` and
`api/_lib/adversarial-bounties.abi.ts`; `test:hardness-abi-anvil` / `test:bounties-abi-anvil`
fail if either is stale.

**V2 verification params (BP-03).** The seven TrackRecordV2 params are reviewed values and
must be explicit in the deploy environment; `check:mainnet:*` refuses to run without them and
bounds-checks them at full width before `DeployBase` ever narrows them:

| env | reviewed value | bounds |
|---|---|---|
| `V2_ENTRY_WINDOW_SEC` | `60` | [10, 600] |
| `V2_EXIT_WINDOW_SEC` | `120` | [10, 1800] |
| `V2_MAX_EXIT_LAG_SEC` | `600` | [300, 3600] |
| `V2_CHALLENGE_WINDOW_SEC` | `604800` (7 days) | (172800, 2592000] — strictly above the 2-day Pyth timelock |
| `V2_ENTRY_TOL_BPS` | `100` | [10, 500] |
| `V2_EXIT_TOL_BPS` | `100` | [10, 500] |
| `V2_CONF_MAX_BPS` | `50` | [10, 200] |

`DeployBase` writes them to the manifest as `v2Params.*`, asserts them live right after the
broadcast, and `VerifyBaseDeployment` refuses a mainnet manifest without the block. The
readiness check fails if `manifest.v2Params.*` differs from the env.

**CI (BP-06).** The contracts job enforces EIP-170 on the seven production artifacts with
`script/check-sizes.sh` (not `forge build --sizes`, which trips on the test harness), then
runs the suite and the layout gate. A separate `integration` job runs the anvil ABI suites
and the three Postgres suites against a `postgres:17` service; those scripts fail — not
skip — when `CI=true` and `DATABASE_URL` is missing.

**MCP client contract (BP-07).** `bobby_bounty_challenge` returns `value` / `valueWei` /
`valueNative`: the bounty's challenge bond, fixed at post time. Send exactly that value; a
zero-value challenge reverts. `bobby_bounty_get` / `_list` report all six states plus
`bondWei`, `resolutionFinalizeAfter`, `settlementAfter`, `disputedBy` and `nextDeadline`.

**Public readers (BP-11 / BP-12).** `/api/reputation` and `/api/protocol-heartbeat` select
TrackRecord getters from the chain's declared `trackRecordVersion` (Base = V2, verified
ledger). A source that cannot be read answers `sources.<x> = 'unavailable'` with null
numbers and `ok:false` — consumers must not treat null as zero. The advertised
`chain.rpc` is the static public endpoint; the configured `BASE_RPC_URL` (which may
carry a key) never appears in a response or a log line.

**Orchestrate (BP-13).** `POST /api/orchestrate` takes `prediction.quantity` and/or
`prediction.notionalUsd`. Without a size it analyses but never returns `execute` /
`reduce_size`. The `decision` is derived from the agent's effective policy, the model's
action and the proof state (`analysis` / `proof_submitted` / `proof_confirmed` /
`proof_failed`); a policy that requires on-chain proof only ever yields executable advice
after a **confirmed** commit. A model answer outside the schema is a 502 with a `failed`
session — nothing is decided on it.

## Rollback

Step 4 is the switch: set `BASE_STOCK_SWAPS_ENABLED=false` (or unset it)
and the rail closes on the next invocation — no deploy needed. Receipts
already written stay; they are an audit trail, not live state. The
migration is additive and needs no down-migration.
