# Cut-over preparation — legacy `egpixaunlnzauztbrnuz` → `bobby-protocol` `qbvdqkknnuweatptjohi`

Status after Codex's verdict (2026-09-02, "GO to build and rehearse, NO-GO to cut"):
phase-0 hardening is approved (`11ff84b` in production, gate 158/158). This
document tracks the eight blockers for the migration GO and the tooling built
on branch `feat/migration-prep`. Nothing here touches production or moves data.

## Blocker status

| # | Blocker | Status | Notes |
|---|---------|--------|-------|
| 7 | Host disk full | **relieved, not solved** | 1.6 → 7.0 GiB free (npm/uv caches, `dist/` of 22 worktrees, two finished worktrees). Still on the host and only Anthony can decide: `~/.cache/codex-runtimes` 3.4 G, `~/.cache/huggingface` 3.0 G, Xcode DerivedData 3.2 G, `node_modules` of 20 worktrees ≈ 6 G. A full export is 87 MB, so 7 GiB is enough for rehearsals. |
| 5 | External writers | **inventoried, needs confirmation** | See below. |
| 1–2 | Destination schema incomplete / not versioned | **draft generated, exact DDL blocked** | 38 approved tables (26,321 rows) vs 4 on the destination. `DRAFT_bobby_schema_from_legacy.sql` has columns/types/defaults/PK/FK from the legacy OpenAPI; indexes, CHECK/UNIQUE, triggers, functions and RLS are not visible through PostgREST. The exact path is `pg_dump --schema-only` (libpq 18.4 is installed) — it needs the **legacy DB password**, which we do not have. |
| 3 | T0 / dump / restore / UUID / sequences / verification tooling | **built and rehearsed (read-only)** | `scripts/migration/` — see below. Rehearsed against the real legacy: T0 manifest 38/38 tables, export 26,321 rows, import dry-run against the destination (34 missing tables detected), verify (57 expected failures until the schema exists). |
| 4 | Zero-RPO rollback (`migration_outbox`) | **designed + SQL written, not applied** | Trigger journal + replay tool. |
| 6 | Restore rehearsal on the destination | **blocked by 1–2** | Runs the moment the schema exists: import → sequences → verify → gate + canaries against the destination. |
| 8 | Destination README outdated | **fixed** | Cut-over uses only `BOBBY_SUPABASE_*` / `VITE_BOBBY_SUPABASE_*`. |

## External writers (blocker 5)

| Writer | Where | Credentials | Tables | Action before T0 |
|--------|-------|-------------|--------|------------------|
| Bobby API (bobbyprotocol.xyz) | Vercel `bobby-agent-trader` | service key via env | all approved tables | covered by `writeFreeze` (bobby_control) |
| Bobby crons | same project, `vercel.json` | same | `bobby-cycle` 12:00 UTC, `settle-trades` 12:45 UTC | freeze covers them; schedule the window away from 12:00–13:00 UTC anyway |
| `aigts-bot` (Telegram GTS bot) | Vercel project `prj_neLAgbIymYjexByAxgthJTScKhEU`, cron 13:00 UTC | own `SUPABASE_URL` (Secret, value not readable) + `SUPABASE_SERVICE_ROLE_KEY`; code falls back to the legacy URL | `bot_users`, `signals`, `price_alerts`, `dm_briefing_subs`, `daily_polls`, `okx_clicks`, `bot_referrals`, `processed_updates` do **not** exist on legacy → it almost certainly points at its own project; but `telegram_connections`, `telegram_groups`, `telegram_subscriptions`, `dm_conversations` do exist on legacy | **Anthony: confirm `SUPABASE_URL` in the aigts-bot dashboard.** If it is legacy, pause the bot (unset webhook / disable cron) for the window or repoint it after the cut |
| "Telegram VPS" | not found on this host (no cron, no launchd, no process, no repo with a long-poll bot) | — | — | **Anthony: does it exist? If so, which host and which key.** The API freeze cannot stop a process with a direct key |
| DeFi México site (`defi-mexico-hub`) | Vercel, same legacy project | anon/service | DeFi México tables only (startups, events, courses…) | out of scope — it stays on legacy; the Bobby copy does not touch its tables |

## Tooling (`scripts/migration/`)

All PostgREST-based, so the legacy side needs only the service key. Env:
`SOURCE_SUPABASE_URL/SOURCE_SUPABASE_SERVICE_KEY` (legacy),
`TARGET_SUPABASE_URL/TARGET_SUPABASE_SERVICE_KEY` (bobby-protocol).

| Tool | Purpose |
|------|---------|
| `tables.ts` | the approved list: 38 tables, PKs, FKs, identity columns, proof columns, FK-safe order |
| `t0-manifest.mts --side source\|target` | exact counts, sha256 over every row (canonical JSON, pk order), pk/created_at ranges, proof coverage → JSON |
| `export.mts` | NDJSON per table, all columns, UUIDs verbatim (gitignored `.ai/migration/export/`) |
| `import.mts --dir … [--dry-run]` | upsert on pk into the target in FK order, batches of 500, refuses same-project imports |
| `sequences.sql` | `setval` for the 7 bigint-identity tables after the copy |
| `verify.mts --source --target` | counts + hashes + proofs per table, orphans on every FK, verdict VERIFIED/FAILED |
| `schema-from-openapi.mts` | the DRAFT DDL (fallback while the legacy password is missing) |
| `replay-outbox.mts --from target\|source` | rollback: replay `migration_outbox` onto the other side |
| `supabase/bobby-protocol/.../20260903000003_migration_outbox.sql` | journal table, capture trigger, `bobby_outbox_enable(jsonb)` / `bobby_outbox_disable()` |

Rehearsal 2026-09-03 22:32 UTC against the real legacy (read-only):
T0 manifest 38/38 tables, 26,321 rows, 51 s; proofs present: `agent_events.trade_tx` 11,
`hardness_agent_proofs` prediction/signal hashes 1 each; export 87 MB; import dry-run: 34 tables
missing on the destination; verify: FAILED as expected (schema absent).

## Runbook to the GO (Codex's order)

1. **Disk** — done to 7 GiB; Anthony decides on the 10 G of ML/Xcode caches.
2. **External writers** — Anthony confirms aigts-bot's URL and the VPS question; decide pause/repoint.
3. **Exact schema** — obtain the legacy DB password (Supabase dashboard → project settings → database, account anthochavez); then
   `PGPASSWORD=… /opt/homebrew/opt/libpq/bin/pg_dump --schema-only --no-owner --no-privileges -t 'public.<table>' … > 20260903000002_bobby_schema.sql`
   for the 38 tables + the 3 Bobby RPCs (`bobby_publish_debate`, `bobby_rls_matrix`, `bobby_rls_status`), review, commit as the versioned migration, apply to the destination with `supabase migration up`. Fallback if the password never comes: review the DRAFT against `supabase/migrations/*.sql` by hand.
4. **Apply** schema + `migration_outbox` to the destination.
5. **Rehearsal** (no freeze, data may drift — that is fine for a rehearsal): `t0-manifest --side source` → `export` → `import` → `sequences.sql` (via MCP `execute_sql`) → `t0-manifest --side target` → `verify`. Expect only hash drift on tables written during the run.
6. **Gate + canaries against the destination**: point `SUPABASE_URL`/keys of the gate at the destination and a preview deployment configured with `BOBBY_SUPABASE_*` = destination; require `GATE PASSED`.
7. **Window**: freeze on (`bobby_control.write_freeze`), pause external writers, T0 manifest, export, import, sequences, verify = VERIFIED, enable `migration_outbox` on the destination, set `BOBBY_SUPABASE_*` in Vercel, deploy, health shows `db.ref = qbvdqkknnuweatptjohi`, freeze off, smoke, gate.
8. **Rollback** at any point: unset `BOBBY_SUPABASE_*`, redeploy, `replay-outbox --from target` to bring post-cut writes back to legacy.

## What only Anthony can unblock

- Legacy DB password (exact schema) — or accept the hand-reviewed DRAFT.
- aigts-bot `SUPABASE_URL` confirmation; the Telegram VPS question.
- The 10 G of caches on the host.
- A separate GO for step 7.
