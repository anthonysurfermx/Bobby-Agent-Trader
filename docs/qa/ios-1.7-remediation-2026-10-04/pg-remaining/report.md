# Remaining PostgreSQL regression QA — 2026-10-04

PASS: all six previously pending dedicated PostgreSQL suites and the cells SQL suite completed successfully (7 distinct suites, zero failures or skips). The earlier 14 successful PostgreSQL-related suites were not repeated. Setup/init/role/database commands are not additional test suites.

## Source and execution

Candidate HEAD at start: `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`. PostgreSQL `pg_ctl (PostgreSQL) 17.11 (Homebrew)` ran in a fresh, disposable owned cluster on `127.0.0.1:55497`, with TCP localhost only and Unix sockets disabled. Every suite used a new empty database. Schema/migration/script hashes in `results.json` remained unchanged throughout execution. No product source or shared dependency package was edited.

Node commands were `node --import tsx scripts/test-<name>-pg.mts`; cells used `psql postgres://postgres@127.0.0.1:55497/qa_cells -v ON_ERROR_STOP=1 -f scripts/test-trader-land-cells.sql`. Exact arguments and log hashes are in `results.json`.

| Suite | Result | Explicit runtime checks | Disposable database |
| --- | --- | --- | --- |
| trader-land-cells | PASS | not reported | qa_cells |
| agent-registry-pg | PASS | not reported | qa_agent_registry |
| amplitude-billing-pg | PASS | 53 | qa_amplitude_billing |
| rls-lockdown-pg | PASS | not reported | qa_rls_lockdown |
| swap-ledger-pg | PASS | not reported | qa_swap_ledger |
| trader-land-moderation-pg | PASS | 15 | bobby_store35_moderation_test |
| web-funnel-pg | PASS | 64 | qa_web_funnel |

Total explicitly reported Node checks: 132, from billing, moderation and funnel only. The other suites do not expose an aggregate runtime counter; they are successful suites, not zero-check suites. The swap-ledger harness reports three scenarios.

## What was exercised

- Agent registry: insert-only creation, owner/version compare-and-swap, stale version and owner refusal, transfer-only ownership changes, replay prevention and browser-role exclusion.
- Amplitude billing: the real migration and exporter, explicit production versus sandbox/unknown/internal exclusion, canonical identity, monetary semantics, dedupe, upload/ack retry and region routing.
- RLS lockdown: historical vulnerable policies were reproduced only in the scratch schema as positive controls; migrated private-table reads and writes were refused, shaped views remained readable and read-only, private/manual/legacy cycles stayed private, and identity merge preserved receipt ownership.
- Swap ledger: actual PL/pgSQL lot matching, idempotency, out-of-order receipts, partial lots and concurrent confirms without over-consumption. These are synthetic database receipts, not blockchain execution.
- Trader Land moderation: real SQL publication, validation, duplicate prevention, blocking races, permissions and report deletion.
- Web funnel: actual local tracking/checkout/export pipeline, canonical identity, authoritative checkout and first-paid dedupe, payment history/trial/currency semantics, order preservation, privacy and failure/retry behavior.
- Cells SQL: footprint reservation, collision, rotation, core exclusion, bounds, seed/owner refusal, rollback, moved core and removal.

Only PATH/HOME/TMPDIR were inherited. DATABASE_URL was explicitly local, NODE_ENV=test and CI=true prevented missing-database skips. Provider credentials/configuration were excluded. Billing/funnel set synthetic test keys and intercept all HTTP, rejecting unexpected destinations; no Amplitude, Supabase, Stripe/store, RPC provider or production database was contacted. Expected simulated auth/upload failures in the funnel log are exercised negative scenarios within a passing suite.

## Disk, shutdown and receipts

Start required ≥2.5 GiB free; stop guard was <2 GiB free or >250 MiB owned footprint. Maximum observed owned footprint was 124.73 MiB; minimum observed free space was 5.73 GiB. No guard triggered.

Own cluster shutdown succeeded; `postmaster.pid` was absent and the owned port could be bound again. Server log, PG version, options and all command logs/hash receipts were saved. Only this run's synthetic data directory (124.91 MiB) was removed after shutdown; other clusters and caches were untouched.

This is local schema/application regression evidence, not production migration state, commercial payment lifecycle, analytics delivery, real users, broker execution, TestFlight or physical-device acceptance.

Evidence lives beside this report in `results.json`, `03-trader-land-cells.log`, `05-agent-registry-pg.log`, `06-amplitude-billing-pg.log`, `07-rls-lockdown-pg.log`, `08-swap-ledger-pg.log`, `09-trader-land-moderation-pg.log`, `10-web-funnel-pg.log` and `99-stop.log`.
