# PostgreSQL QA: Bobby 1.7 (63)

Executed 2026-10-04T09:42:23.689236+00:00 to 2026-10-04T09:42:51.643061+00:00, candidate HEAD `393776c332b2c3f6e21d6cad457869431dd28a62`. **14 suites passed, zero failed/skipped**: growth SQL plus thirteen Node suites. Setup/start/create-database commands are excluded from the suite count.

New isolated PostgreSQL 17.11 cluster: `127.0.0.1:55497`, never reused another task's database. It started with at least 600 MiB free, with 150 MiB own-temporary and 200 MiB minimum-free guards. Peak own footprint: **140.2 MiB**; minimum free: **692.1 MiB**. Server stopped in finally, PID file disappeared, and binding the port after stop succeeded. Only this run's synthetic data was removed to reclaim 124.4 MiB; logs/configuration remain. No cache or other task's data was deleted.

Order reproduces `.github/workflows/ci.yml:127` onward: growth, progress, referrals, payment guards, coupons, admin, lifecycle, memory, admin truth, admin R2, telemetry; briefings then uses three new databases. `scripts/ci/bootstrap-bobby-ci-db.mts` is absent in HEAD; the real CI bootstrap is `scripts/test-trader-land-growth.sql`. Selected migrations are intentionally applied twice in the scratch fixtures to verify idempotency.

| Suite | Result | Reported checks | Seconds |
|---|---|---:|---:|
| 02-growth | PASS | SQL; no aggregate counter | 0.52 |
| 03-progress-atomic-pg | PASS | 74 | 0.52 |
| 04-levels-referrals-pg | PASS | 116 | 0.26 |
| 05-payments-guards-pg | PASS | 23 | 0.26 |
| 06-coupons-pg | PASS | 91 | 0.27 |
| 07-admin-pg | PASS | 203 | 0.52 |
| 08-lifecycle-pg | PASS | 61 | 0.26 |
| 09-user-memory-pg | PASS | 91 | 0.26 |
| 10-admin-truth-pg | PASS | 167 | 2.09 |
| 11-admin-r2-pg | PASS | 370 | 8.34 |
| 12-client-telemetry-pg | PASS | 199 | 9.09 |
| 13-briefings-pg | PASS | 644 | 0.79 |
| 14-briefings-api | PASS | 257 | 1.59 |
| 15-briefings-worker | PASS | 147 | 0.81 |

Node counters sum to **2443**. This includes repeated unit portions: Briefings API reports 257 checks: 187 previously covered unit checks and 70 additional PostgreSQL checks. Worker reports 147 checks: 103 previously covered unit checks and 44 additional PostgreSQL checks. Growth SQL has no aggregate assertion counter. API/worker already existed in the initial backend suite list and are not two new distinct suite identities.

Verified real local migrations/RPC/rollback/replay/concurrency, last-slot coupons, serialized quota/grant/checkout claims, gifts/refunds/referrals, service-only privileges and RLS attempts, owner isolation and memory retention/deletion; persisted synthetic Apple/card mirror semantics; admin grant idempotency; truthful admin/telemetry invariants with 2,000 account/install fixtures; briefings SQL leases/fencing/SKIP LOCKED/CAS/owner rebind/device revoke/budgets/outbox/read isolation and API/worker failures.

Auth schemas/users/identities are reduced fixtures. Billing/model/audio/push provider responses are synthetic. Briefings transport calls local PostgreSQL functions rather than live Supabase/PostgREST auth. No production data/settings/migrations, real account, commercial transaction, AI/voice request or APNs delivery was accessed. Provider credential env vars were excluded.

No dependencies installed. Local Node 25/tsx differs from CI Node 22/npm-ci; exact toolchain reproduction and deployed schema drift remain unverified. All snapshotted PG scripts/migrations/workflow files remained byte-identical (`sourceUnchanged: true`).

`results.json` records argv, databases, exit codes, timestamps, source/log hashes and resource guards; numbered logs retain exact output. `99-stop.log`, `server.log`, `postmaster.opts`, `PG_VERSION` preserve shutdown/configuration after own data removal. Runner: `/private/tmp/bobby-ios17-remediation-20261004/run-pg-qa.py`.

The root agent subsequently committed the remediation as `507616c99eb143e466084c85bbb177d11315bf68`. All snapshotted PG scripts/migrations/workflow hashes still match that clean candidate; API/SQL changes were outside the remediation. No repeat of passing PG suites was needed.

Dedicated PG scripts **not executed in this scope** (six):

- `scripts/test-agent-registry-pg.mts`
- `scripts/test-amplitude-billing-pg.mts`
- `scripts/test-rls-lockdown-pg.mts`
- `scripts/test-swap-ledger-pg.mts`
- `scripts/test-trader-land-moderation-pg.mts`
- `scripts/test-web-funnel-pg.mts`

These are uncovered suites, not failures or skips in the fourteen executed suites. The separate Anvil/contract integration job and standalone Trader Land cells SQL suite were also not executed by this agent.
