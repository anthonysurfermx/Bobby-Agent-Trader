# Live dashboard integration verification — 2026-10-03

Base: `13e91dc45c410929d079a3c23ac969d00c0646c1` (payment launch guards, PR #130).
Branch: `codex/dashboard-remediation-20261003`. Draft branch deployments are disabled in `vercel.json`.

## Result

The dashboard package is rebased on the deployed payment implementation. The integration preserves checkout reservations, Stripe ownership and Apple mirrors, store/sandbox eligibility, refund lookup, and canonical invoice/refund ledger keys.

Payment writes tolerate the predecessor schema. The migration's INSERT/UPDATE trigger also accepts the explicit NULL evidence written by the currently deployed code, normalizing primary evidence to `unknown` and mirror evidence to NULL. Real PostgreSQL cases cover both release orders and Apple-to-card transitions. Users, members and commercial metrics use the same effective membership, so an active Apple mirror supplies the correct provider, status and renewal date without rewriting the primary card snapshot.

Telemetry has serialized admission of at most 100 build cohorts per platform, an unknown overflow bucket, grouped queries and at most 20 recent builds in the response. Web reports whose build does not match the serving deployment are unknown. Coverage and build lists use the same internal-traffic exclusion as counts. Crawlers are dropped. Retention cleanup targets 35-day events and 7-day presence/coverage, with bounded hourly/daily batches.

Server live facts and client telemetry are queried independently. A client aggregate failure leaves server facts available and records the unavailable client source. Unknown values are not displayed as measured zero. The client bootstrap skips the authentication callback and tolerates initialization errors.

The dashboard preserves historical installs, separates provider read time from report age, carries spend caps/paywall with the core response, distinguishes failed health reads from absent events, and retains operational alerts without claiming a complete weekly digest when growth is unavailable.

## Local evidence

| Check | Result |
| --- | --- |
| PostgreSQL R2, including #130 Apple mirror in users/members/metrics, predecessor NULL writes, privilege scope and JIT setting restoration | 366 checks passed |
| Telemetry PostgreSQL suite, retention, concurrency, internal scope, cardinality and failure isolation | 196 checks passed |
| Exact CI PostgreSQL progress/levels/payments/coupons/admin/lifecycle/memory/truth/R2/telemetry order | All passed |
| Payment guards and schema-compatibility HTTP regressions | 75 + 26 checks passed |
| Briefings calendar/content/core/macro/RevenueCat/Stripe and store guards | All passed |
| Admin API | 197 checks passed |
| Live dashboard API/UI/desk/insights/Stripe suites | 793 checks passed |
| Client telemetry API/UI | 151 + 73 checks passed |
| Native presentation JavaScript harness | 4 tests passed |
| Remaining application security/protocol/read/LLM suites | All passed |
| API/admin TypeScript, production build, lint | Passed |
| Gitleaks working source and commit range | No leaks found |
| Dependency audit gate | Passed with the existing expiring braces exception |

The local scale case returned the full live snapshot in 65 ms or less with 110,000 events and 2,000 installations; 6,000 legacy build labels returned at most 20 build entries. These are local measurements, not production latency guarantees.

The first remote run passed the application, integration and Security workflows but failed the analytics performance assertion: growth + overview + economics took 11,624 ms against the unchanged 4,000 ms budget. The four bounded analytics/live RPCs now use function-local `jit=off`, preserving the caller's configuration, invoker security and grants. Tests report each RPC's timing and execution settings. The local rerun took 743 ms; Linux PostgreSQL 17.11 with JIT available passed at 1,263 ms on `d027f9d1`, with members/networks/geo at 1,339 ms and live at 34 ms. All original time budgets remain unchanged.

The separate CodeQL pull-request alert check flagged three RevenueCat URL substring comparisons in offline test mocks. Those comparisons now parse the URL and check the exact API hostname; project cache assertions also check the exact endpoint path. The targeted offline API suite passes. The latest pull-request check rollup is the source of truth for remote security and CI completion.

## Production observation

Vercel resolved `bobbyprotocol.xyz` to `dpl_GSnggGWB3231Z46VLg6PQskv7HHw`, READY, serving the base commit. Logs inspected from 08:18 to 08:38 UTC showed no HTTP 5xx. Five error-level entries were the historical Node `DEP0169` warning; their requests returned 200. The grouped warning has a first-seen timestamp of 2026-06-16.

Only environment variable names were inspected. Production has the RevenueCat V2 key but no `REVENUECAT_PROJECT_ID`.

## Release gates

1. Set `REVENUECAT_PROJECT_ID` to the owner-verified Bobby API project ID; keep provider selection explicit.
2. Confirm the actual Bobby database and applied migration registry. The three historical migration imports are already deployed records, not additional production operations.
3. Apply `20261002231124_admin_truth_live_snapshot.sql`, then `20261002235202_first_party_client_telemetry.sql`, before merging to main. The compatibility fixes protect payment writes during release overlap; the new dashboard RPCs still require these migrations.
4. Confirm remote CI and review, then merge and check actual production admin sources and runtime logs.

No production migration, production deployment, real purchase, RevenueCat permission change, or native build distribution was performed. Native lifecycle instrumentation requires a subsequent iOS build and device verification. A real web purchase remains an independent acceptance gate.

The current dependency exception includes 2026-10-17; it blocks from 2026-10-18 UTC if the advisory remains. Keep the conditional RevenueCat sandbox restriction after App Review as a separate release action.
