# Cut-over preparation — legacy `egpixaunlnzauztbrnuz` → `bobby-protocol` `qbvdqkknnuweatptjohi`

Codex (2026-09-02): phase-0 hardening approved (`11ff84b` live, gate 158/158);
migration = GO to build and rehearse, NO-GO to cut. Codex round 2 on the first
tooling commit (`125f279`): NO-GO to apply schema/outbox — eight integrity
findings. This document is the state after closing them on branch
`feat/migration-prep-v2` (the first branch was rewritten: its manifest carried
two Telegram user ids; the remote branch was deleted, see "History").

Scope decision by Anthony (2026-09-03): **strictly Bobby Protocol**. aigts-bot
is dead; nothing of it, of DeFi México or of Polymarket travels.

## Codex round-2 findings → what changed

| # | Finding | Fix | Demonstrated by |
|---|---------|-----|-----------------|
| 1 | T0 / export fail open | `t0-manifest` and `export` exit 1 and write **nothing** on a missing table or when the exact count ≠ streamed rows. `--allow-missing` exists only for the destination *baseline* and is recorded in the manifest; `verify` refuses such a manifest. | `selftest.mts` (fake PostgREST): missing table → 1, count 4 vs streamed 3 → 1, clean → 0 |
| 2 | Replay does not guarantee RPO 0 | `--from` validated; same-ref refused; **both sides must report `writeFreeze=true`**; trigger set must equal the approved list (`bobby_outbox_status`); drains in pages **until the journal is empty**, `REPLAY_MAX_PASSES` (50) guards a journal that never empties → exit 1 "do not unfreeze". Runbook order: freeze both → replay → verify → then redeploy/unfreeze. | selftest: invalid from → 2, same ref → 2, partial triggers → 1, no freeze → 1, 5,432 entries drained to 0, endless writes → 1 |
| 3 | `pg_dump -t` plan not applicable | New migration `20260903000002_reset_baseline_for_exact_schema.sql` drops the four empty baseline tables (refuses if any row exists), so the exact dump is applied on a **clean** destination. The dump is `pg_dump --schema-only --no-owner --no-privileges -n public` (whole schema: functions, triggers, sequences, policies), then filtered to the approved tables + the three Bobby RPCs; the filter is a documented manual review step until a dump exists to test a tool against. | — (blocked on the legacy DB password) |
| 4 | Sequences not verified | `bobby_sequence_check()` (destination RPC): for the 7 identity tables returns `max(id)`, `last_value` and a **real `nextval()`**, ok = nextval > max(id). `verify.mts` fails otherwise. | RPC in `20260903000003_migration_outbox.sql`; exercised once the schema exists |
| 5 | Proofs / FKs incomplete | Manifest hashes **each proof column's values** (not just non-null counts); `verify` compares those hashes. FKs added: `hardness_agent_sessions.agent_id → hardness_agents.agent_id`, `hardness_agent_proofs.session_id → hardness_agent_sessions.session_id`. New `verify-proofs.mts`: recomputes `prediction_hash = keccak256("bobby:<thread id>")` and checks every `*_tx_hash` receipt on its `chain_id` through public RPCs. | Run against legacy: see "Findings on legacy data" |
| 6 | Table list not approved | 38 → **33 tables**: out `telegram_groups`, `telegram_subscriptions`, `telegram_activation_sessions`, `dm_conversations` (aigts-bot, PII) and `api_cache` (schema only — its 144 rows are 140 rate-limit counters keyed by the *old* salt plus 4 expired entries; SIWE nonces live 10 min; receipt anti-replay lives in `forum_publish_receipts`, which is copied). | `tables.ts` header documents each exclusion |
| 7 | PII in Git | pii tables record `sha256(pk bounds)` instead of values; the offending branch was replaced, the remote branch deleted. Evidence files scanned: no ids, no emails. | this branch's history starts clean |
| 8 | Disk | 7.0 GiB free after cleaning regenerable caches; the remaining 10 G (codex-runtimes, huggingface, DerivedData) is Anthony's call. | — |

## Findings on legacy data (from `verify-proofs.mts`, read-only)

- The **only** Hardness proof on legacy belongs to `e2e-test-agent` (2026-04-12, X Layer):
  its `signal_tx_hash` **reverted** on chain 196 (receipt status `0x0`, 0 logs, block
  57,259,733) and its `prediction_hash` came from a `debateId` the session does not
  store, so it cannot be recomputed. It is test data, not a real track-record proof.
  **Decision needed:** exclude `e2e-test-agent` rows from the copy (recommended) or
  copy them byte-exact and accept a permanent proof failure on both sides.
- `agent_trades` and `mcp_payment_receipts` carry no tx hashes (0 rows).

## External writers

| Writer | Status |
|--------|--------|
| Bobby API + crons (`bobby-cycle` 12:00, `settle-trades` 12:45 UTC) | obey `writeFreeze`; window outside 12:00–13:00 UTC |
| `aigts-bot` (Vercel `prj_neLAgbIymYjexByAxgthJTScKhEU`, cron 13:00 UTC) | **dead by decision.** Out of scope; its tables are not copied. Removing the Vercel project is irreversible and awaits an explicit word from Anthony |
| "Telegram VPS" | nothing on this host; treated as non-existent unless Anthony says otherwise |
| DeFi México site | stays on legacy, untouched |

## Tooling (`scripts/migration/`)

| Tool | Purpose |
|------|---------|
| `tables.ts` | 33 approved tables, PKs, FKs, identity columns, proof columns, pii flag, FK-safe order; `outboxPlan()` |
| `t0-manifest.mts --side source\|target [--allow-missing]` | fail-closed manifest: counts, row sha256, per-proof-column sha256, bounds (hashed for pii), created_at span |
| `export.mts` / `import.mts --dir [--dry-run]` | NDJSON export (fail-closed) / pk-upsert import in FK order, refuses same project |
| `sequences.sql` | `setval` for the 7 identity tables |
| `verify.mts --source --target [--expect-outbox]` | counts, row hashes, proof-value hashes, FK orphans, `bobby_sequence_check`, outbox coverage |
| `verify-proofs.mts --side` | recompute `prediction_hash`, tx receipts on-chain |
| `replay-outbox.mts --from source\|target [--dry-run]` | hardened rollback replay (see finding 2) |
| `selftest.mts` | fail-closed demonstration against an in-process fake PostgREST |
| `schema-from-openapi.mts` | DRAFT DDL fallback (columns/defaults/PK/FK only) |
| `supabase/bobby-protocol/…/20260903000002_reset_baseline_for_exact_schema.sql` | clean destination before the exact dump |
| `supabase/bobby-protocol/…/20260903000003_migration_outbox.sql` | journal, capture trigger, `bobby_outbox_enable/disable/status`, `bobby_sequence_check` |

Rehearsal 2026-09-03 (read-only, real legacy): strict T0 **33/33 tables, 26,162 rows**;
destination baseline 3/33 (`--allow-missing`); T0 on the destination *without* the
flag fails closed (no file written); selftest 10/10; proofs check surfaces the two
legacy findings above. Evidence in `docs/infra/evidence/2026-09-03-*`.

## Runbook to the GO (unchanged order, refined)

1. Disk — Anthony decides on the 10 G of caches.
2. Writers — aigts-bot: confirm the Vercel project removal (irreversible); nothing else to stop.
3. Exact schema — needs the **legacy DB password**: `pg_dump --schema-only --no-owner --no-privileges -n public` → filter to the 33 tables + `api_cache`, `bobby_publish_debate`, `bobby_rls_matrix`, `bobby_rls_status` and every function/trigger they reference → commit as `20260903000004_bobby_schema_exact.sql`.
4. Destination, from clean: `…0002_reset_baseline` → `…0004_bobby_schema_exact` → `…0003_migration_outbox` (via `supabase migration up`), then `select bobby_outbox_status()` = 0 rows (armed later).
5. Rehearsal (no freeze; drift acceptable): T0 source → export → import → `sequences.sql` → T0 target → `verify` (expect only hash drift on tables written during the run) → `verify-proofs --side target` → gate + canaries against a preview configured with `BOBBY_SUPABASE_*` = destination → `GATE PASSED`.
6. Window: freeze on (both projects' `bobby_control`), T0 source, export, import, sequences, T0 target, `verify` = VERIFIED, `verify-proofs`, `bobby_outbox_enable(outboxPlan())`, `verify --expect-outbox`, set `BOBBY_SUPABASE_*` in Vercel, deploy, health `db.ref = qbvdqkknnuweatptjohi`, smoke, gate, freeze off.
7. Rollback: freeze on **both** → `replay-outbox --from target` → REPLAY COMPLETE → `verify` legacy vs destination → unset `BOBBY_SUPABASE_*`, redeploy → freeze off.

## History

`125f279` (branch `feat/migration-prep`) published a manifest with two Telegram user ids in
`pkMin/pkMax`. This branch (`feat/migration-prep-v2`) was rebuilt from `main` with sanitized
files; `origin/feat/migration-prep` was deleted so the commit is unreachable from the remote.
The local branch is kept until Anthony confirms the deletion (the agent may not delete branches).
