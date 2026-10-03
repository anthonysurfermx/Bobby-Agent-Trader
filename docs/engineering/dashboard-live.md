# Operational dashboard and first-party client reports

The admin dashboard distinguishes fresh first-party observations from delayed providers. Its twelve authenticated GET views use a 15-second request budget, bounded upstream body/auth/storage reads and source metadata. A visible tab refreshes core/server/client snapshots every 30 seconds and integrations every five minutes; scope changes abort obsolete requests, and failed refreshes preserve prior values with visible freshness/error labels.

Shared deterministic insight rules enforce team scope, sample size, missing denominators, incomplete cost coverage and unreconciled money. A paid plan is generated only on demand with caching/locking and fact validation; digest claims are atomic. Resend acceptance is not delivery. Recorded prices, consumption and server completion do not establish broker execution, business profit, client presentation or human reading.

## Client-report contract

POST /api/client-telemetry admits bounded first-party iOS/web reports. A foreground installation remains reported active for at most ninety seconds after its captured/received signal and sends thirty-second heartbeats only while active/visible. An installation, verified account and person remain different measures. Missing/legacy versions are unmeasured, not healthy or inactive by inference.

A successful desk completion may issue an installation/owner/platform/request-bound HMAC receipt using purpose-separated RATE_LIMIT_SALT. Client reports distinguish started, received and presented phases; presentation waits for the current visible final UI. Reports are best effort, deduplicated and bounded, without question/response text or an advertising SDK. WebKit process termination is a narrow diagnostic signal, not native crash coverage. Account changes discard queued old-owner work.

Preview builds disable SPA/static emission, and the Preview ingestion endpoint refuses reports before any authentication, rate-limit, storage or health write. Preview service-variable presence does not establish database isolation; review traffic must not pollute production reports. Existing tracking, access and admin routes still use their configured database and can write; this does not make Preview globally read-only. This review branch disables its own automatic Vercel deployment through git.deploymentEnabled in vercel.json, following the [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled). Production/main and other branch deployment rules are unchanged.

The API is additive for older clients. App/web publication cannot instrument an already installed native build. Client windows expose only aggregates and observed build cohorts, with explicit source/coverage limitations.

## Database and publication prerequisites

The canonical SQL chain includes five reconciled predecessor source files for reproducible fresh/local database setup. Do not replay them on an environment where they have already been applied. Compare the target registry and schema before publication; do not use a blanket database push to reconcile differently named historical versions.

Apply only these new reviewed migrations, in this order, after authorized target preflight:

1. supabase/bobby-protocol/supabase/migrations/20261002231124_admin_truth_live_snapshot.sql
2. supabase/bobby-protocol/supabase/migrations/20261002235202_first_party_client_telemetry.sql

RevenueCat V2 metrics require an explicitly verified REVENUECAT_PROJECT_ID; never select an arbitrary first project. Environment-variable presence does not validate its value or provider permissions. Unknown source data remains unknown. Production publication follows the main Git integration; the source guard must remain active.

The native source manifest declares linked identifiers/product interaction for analytics as well as existing purposes, plus the implemented WebKit diagnostic report. Before distributing an instrumented native build, reconcile the exact embedded manifest, public policy and App Store privacy answers with the actual collected data. Freeze a unique archive/build and verify its physical installation.

## Verification and acceptance

The telemetry command generates its ignored static input before running tests, so it works from a clean checkout:

- npm run test:admin-live
- npm run test:client-telemetry
- npm run check:api
- npm run check:admin
- npm run build

PostgreSQL checks require an isolated local database and reject remote database URLs. Prepare the existing scratch schema and run test:admin-live-pg before test:client-telemetry-pg. CI wires this order and local services. Offline mocks, a local SQL improvement, simulator checks and generated artifacts are not production or installed-device proof.

After approved publication, verify the exact serving commit and actual fresh admin responses against scoped database facts. Use dedicated internal QA accounts/installations, verify their exclusion first, and observe real foreground/background/expiry and received/presented transitions on public SPA/static web and the exact instrumented physical iPhone build. Keep identifiers, receipts, account data and operational traces in restricted local evidence. Client phases join by request/receipt; server outcome/read/LLM records require independent bounded account/install/time reconciliation and do not expose that request UUID.

Purchase/restore/refund/provider publication, balances, unrecorded cost and native crashes remain separate evidence requirements. A draft PR authorizes no production migration, deployment, distribution, paid request, email or transaction.
