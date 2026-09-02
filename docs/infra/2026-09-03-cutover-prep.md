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

## Codex round-3 pendings → what changed (commit after `7962249`)

| # | Pending | Fix | Demonstrated by |
|---|---------|-----|-----------------|
| 1 | Failed export left partial NDJSON with private rows | On any failure `export` **removes the whole directory** before exiting 1 | selftest: "directory removed (no private residue)" |
| 2 | Import skipped absent tables and never validated the files | `import` requires **every approved table in the index**, refuses unknown tables, and **re-reads and re-hashes every NDJSON** (rows + sha256 must equal the index) before the first write; `--dry-run` runs the same checks | selftest: missing index entry → refused; tampered file → refused with 0 writes |
| 3 | Receipt success did not bind the proof | `verify-proofs` now requires, per row: tx **mined**, `to` == the **expected contract on that chain**, and for Hardness the calldata **decodes** to `commitPrediction(prediction_hash …)` / `publishSignal(symbol …)` / a resolve referencing the hash; `agent_events.payment_tx/trade_tx` (contract from `meta.contract`), `agent_trades`, `forum_threads.resolution_tx_hash` (thread id in calldata) and `mcp_payment_receipts` (`response_hash` in logs) are covered | run against legacy, see findings below |
| 4 | Outbox checked names, not pk columns | `bobby_outbox_status()` returns the **pk columns each trigger was armed with** (`pg_trigger.tgargs`); `replay` and `verify --expect-outbox` compare them with `outboxPlan()` | selftest: wrong pk → refused |
| 5 | Sequences / schema / outbox not exercised for real | still blocked on the destination schema (legacy DB password) | — |
| 6 | aigts-bot could still write `telegram_connections` if it points at legacy | Not deleted (Codex). Its URL is a Vercel Secret and cannot be read here; evidence it is **not** legacy: it writes `bot_users`, `signals`, `price_alerts`, `processed_updates` on every update and none of those tables exist on legacy (a legacy-pointed bot would have been broken for months). Reversible action for the window: disable its cron/webhook from the aigts-bot dashboard, or confirm `SUPABASE_URL` there. `telegram_connections` has 0 rows on legacy, so even a stray write is caught by T0 ≠ verify | — |
| 7 | Disk 5.7 GiB, 99 % | selftest now removes its temp dir; the export rehearsal was deleted; the rest is Anthony's caches | — |
| — | `e2e-test-agent` | **Shared exclusion filter** (`exclusions.ts`): the agent, its sessions and their proofs are removed from T0, export, verify and verify-proofs by the same PostgREST predicate; both manifests record the exclusion set and `verify` checks they match and that no excluded row exists on the target | T0 source now 33/33, **26,159 rows** (3 fewer) |

## Exact schema — produced and dry-run (2026-09-03 23:30 UTC)

Anthony stored the legacy DB password in the macOS Keychain
(`bobby/LEGACY_DB_PASSWORD`; never in chat, never in the repo). With it:

- `pg_dump 18.4 --schema-only --no-owner --no-privileges --no-comments -n public`
  of legacy (direct host, PostgreSQL 17.4): 725 objects, 72 tables.
- `scripts/migration/filter-schema.mts` reduces it verbatim to Bobby:
  **251 objects kept / 474 dropped** — 34 tables (33 + `api_cache`), 42 constraints,
  10 FKs (the two to `auth.users` kept: 0 legacy rows use them), 65 indexes, 7
  sequences (4 serial + 3 identity), 4 defaults, 34 RLS states, 44 policies, 2 triggers
  (`bobby_control_touch`, `trg_agent_profiles_updated_at`) and the functions they call,
  the 3 Bobby RPCs. Dropped: every DeFi México table, 26 functions, 5 types, 1 view, 13
  triggers, 128 policies. It also emits the one extension the DDL needs:
  **`vector` in schema `public`** (pgvector 0.8, `agent_memory.embedding` + ivfflat index),
  which the destination did not have. Report: `docs/infra/evidence/2026-09-03-schema-filter-report.txt`.
  Result: `supabase/bobby-protocol/supabase/migrations/20260903000004_bobby_schema_exact.sql`.
- **Dry run on the destination inside `BEGIN … ROLLBACK`** (psql, nothing persisted):
  `0002_reset_baseline` → `0004_bobby_schema_exact` → `0003_migration_outbox` apply
  cleanly → 35 public tables, RLS on 35, 45 policies; `bobby_sequence_check()` reports
  a real `nextval` above `max(id)` for the 7 identity tables; `bobby_outbox_enable`
  arms 2 sample tables, `bobby_outbox_status()` returns their pk columns,
  `bobby_outbox_disable` removes them. Destination afterwards: still 4 tables.
  Evidence: `docs/infra/evidence/2026-09-03-destination-dryrun-rollback.txt`.
  Two real defects were caught by this dry run before any apply: the missing
  `vector` extension and identity columns being dropped by the filter (pg_dump emits
  them as `SEQUENCE` objects without `OWNED BY`).

Decisions taken by Anthony (2026-09-03): the four reverted demo `agent_events` are
**excluded** (`EXCLUDED_AGENT_EVENT_IDS`, shared filter → T0 source now **26,155 rows**,
`verify-proofs` on legacy = **PROOFS VERIFIED**, 7 bound tx, 0 failures);
**aigts-bot paused** in Vercel (reversible: `POST /v1/projects/<id>/unpause`), so it
cannot write anywhere during the preparation.

## Findings on legacy data (from `verify-proofs.mts`, read-only)

- `e2e-test-agent` (2026-04-12, X Layer): signal tx **reverted**, prediction hash not
  recomputable → **excluded by decision** (shared filter). 0 Hardness proofs remain.
- `agent_events`: 11 `onchain_tx` rows written by `generate-activity` on 2026-04-14 (X Layer,
  demo activity). **7 are mined and bound** to the contract named in `meta.contract`
  (TrackRecord, AdversarialBounties, ConvictionOracle, HardnessRegistry). **4 reverted**:
  two HardnessRegistry calls and two rows labelled AgentEconomy whose `to` is an
  unrelated address (`0xa4704e92…`). Full list in
  `docs/infra/evidence/2026-09-03-legacy-proofs-check.txt`. **Decision needed:** copy them
  byte-exact (history, the same 4 failures will show on both sides and `verify` still
  passes because it compares values) or drop them via `EXCLUDED_AGENT_EVENT_IDS` in
  `exclusions.ts` (one line, applied everywhere). Recommendation: drop — they are
  synthetic demo rows, not decisions.
- `agent_trades`, `forum_threads.resolution_tx_hash` and `mcp_payment_receipts` carry no
  tx hashes (0 rows) — the checks are in place for the Base era.

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

## Restore rehearsal on the destination — DONE (2026-09-03 23:45–23:55 UTC, Anthony's GO)

Anthony (investor demo today) authorised applying to the destination and clearing the
host caches (12 GiB free now). Executed, all read-only on legacy:

| Step | Result | Evidence |
|------|--------|----------|
| `0002 → 0004 → 0003` applied for real (one transaction) | 35 tables, RLS on 35, 45 policies, pgvector installed | psql output |
| T0 source (fail-closed) + export | 33/33 tables, **26,155 rows**, 89 MB | `t0-source-strict.json` |
| import (dry-run, then real) | index complete, every file re-hashed, 26,155 rows upserted in FK order | — |
| `sequences.sql` | 7 sequences set | — |
| T0 target + `verify` | **VERIFIED — 164/164**: counts, row hashes, proof-column hashes, 0 orphans on 10 FKs, `bobby_sequence_check` ok on 7 tables | `restore-verify-destination.txt`, `t0-target-after-restore.json` |
| `verify-proofs --side target` | **PROOFS VERIFIED** (7 bound tx, 0 failures) | `destination-proofs-check.txt` |
| gate sections **A + B** against the destination (policy matrix + canaries, service key of `bobby-protocol`) | **129 OK, 0 FAIL** | `gate-AB-destination.txt` |

Section C of the gate (legitimate path through the API) needs an API that points at
the destination: it runs immediately after the cut, before traffic is released.

## Cut-over checklist (production change — waits for Anthony's explicit GO)

Backend resolves `BOBBY_SUPABASE_URL` / `BOBBY_SUPABASE_ANON_KEY` /
`BOBBY_SUPABASE_SERVICE_ROLE_KEY` first; the browser uses `VITE_BOBBY_SUPABASE_URL` /
`VITE_BOBBY_SUPABASE_ANON_KEY` (build-time). None of them exist in Production yet.
Freeze = `bobby_control.write_freeze` (row `global`), read by every writer within 10 s.

1. **Freeze legacy**: PATCH `bobby_control` `write_freeze=true` (service key) → writers answer 503, reads keep working.
2. **Delta copy**: T0 source → export → import (idempotent upsert) → sequences → T0 target → `verify` = VERIFIED (both manifests taken under freeze, so hashes must be identical).
3. **Arm the journal** on the destination: `select bobby_outbox_enable(<outboxPlan>)`; `verify --expect-outbox` OK. Set the destination's copied `bobby_control` row to `write_freeze=true` too (it is a copy of the frozen row already).
4. **Env** in Vercel Production: the five variables above (service key sensitive, the rest plain), values from `.claude/supabase-bobby-protocol.env`.
5. **Deploy**: fast-forward `main` to this branch (no runtime change) and push → Git-integrated production build with the new env. Health must show `db.ref = qbvdqkknnuweatptjohi` and the new `fullSha`.
6. **Gate C** against the new production (`GATE_EXPECTED_SHA` = new main) → `GATE PASSED` (A+B+C).
7. **Unfreeze the destination** (`write_freeze=false`), smoke `/`, `/agentic-world/bobby`, `/agentic-world/forum`, `/desk`. Legacy stays frozen (read-only) as the rollback target.
8. **Rollback** (any time): freeze destination → `replay-outbox --from target` → REPLAY COMPLETE → remove the five env vars → redeploy → unfreeze legacy.

Expected freeze window: about 10 minutes (steps 1–7).

- Apply `0002 → 0004 → 0003` to the destination for real (the dry run proves they apply).
- Restore rehearsal: export → import → sequences → T0 target → verify → verify-proofs
  → gate + canaries against a preview on the destination.
- Freeze window and cut-over.

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
