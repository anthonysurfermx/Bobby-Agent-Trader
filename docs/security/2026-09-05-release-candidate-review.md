# Release candidate: focused integration review

Date: 2026-09-05. Verdict: **NO-GO for release / activation**.

## Push preparation: migration preflight and release verification

Two additional blocks are prepared on top of `b67b857`:

1. `scripts/check-progress-migration.sql` performs a read-only pre-migration
   check with 12 aggregate checks. It detects malformed/dangling references,
   duplicate seed/receipt/season rewards, ledger mismatch, partial closes,
   catalog gaps and an already-present candidate schema. It is tested against
   clean and deliberately inconsistent local fixtures and never repairs data.
   `docs/infra/2026-09-05-progress-cutover-checklist.md` records target verification,
   backup/freeze/drain, migration, schema refresh, cutover and rollback gates.
   No production preflight has been executed: Supabase MCP is unavailable here.
2. CI and Security now run on the exact candidate branch. Automatic Vercel Git
   deployment is disabled for that branch alone, so pushing unpublished schema
   dependencies does not activate an incompatible API. Main is unchanged. This
   separation follows the Vercel CI/CD skill and official Git configuration docs.

The complete local application CI suite, build, lint and scoped typecheck pass.
The expanded atomic-progress PostgreSQL suite has 20 passing scenarios. Existing
Postgres swap-ledger, registry and RLS suites pass after correcting the isolated
cluster's service-role fixture to match Supabase's BYPASSRLS attribute; the first
RLS attempt failed because the reused local role lacked it, not because of a
production policy change. Future scratch role creation now matches the other
test harnesses. No production roles were modified.

Both backend ABI integration suites pass against temporary local Anvil chains.
All seven production contracts pass the runtime-size gate, and the complete
TrackRecord storage/struct layout matches its committed baseline. These checks
do not constitute a production deployment or a live-chain fork simulation.
Foundry completed successfully with 286 reported passing tests, fuzz runs set
to 1,000 and invariant suites enabled. Opt-in Pyth fork cases were not activated;
their default return paths are not evidence of live-fork coverage.

The dependency audit passes the configured high-severity gate but still reports
22 moderate dependency findings; this is not a claim of a vulnerability-free
dependency tree. No automatic/breaking wallet-library upgrade was applied.
Gitleaks found no leaks in the candidate commit range using the repository's
existing configuration. The final remote CI results must be tied to the pushed
SHA, not inferred from any prior run.

## Current follow-up: server-issued thesis origin (local, not deployed)

RC-03 now has an implemented origin boundary, in addition to the timestamp fix.
The authenticated web desk can request an immutable server record of the exact
technical-pulse response. Its ID is bound to the verified identity, expires for
initial consumption after 24 hours, and is consumed once inside the atomic
progress transaction. The database adopts the stored snapshot and contract,
never fields submitted alongside the ID. Foreign, expired, previously consumed
or absent references do not certify execution eligibility.

The provenance is explicitly `voice_tool_technical_pulse`: this proves a Bobby
technical-desk response, not a separately executed three-model deliberation,
nor that a human actually read it. No new signing secret is needed. Direct
table insertion, update and deletion are denied to client and service roles;
issuance goes through a service-only RPC with a serialized 120-per-identity
rolling-day cap. HTTP writes retain authentication, write freeze and limits,
and freeze is rechecked after market reads, immediately before persistence.

Guest and old-client reads keep ordinary progress but cannot earn execution
bonuses without verified origin. The web queue preserves the read ID across
failed sync and reload. The eligible swap window still starts at database
acceptance, not issuance or client time: swaps before sync do not count.
Persistence failure leaves the market answer available without an origin ID.
The studio labels missing origin rather than promising an execution bonus.
Native iOS clients still need to request and carry this new optional reference.

Validation on this follow-up:

- 19 real-PostgreSQL scenarios pass, including origin ownership/expiry/one-use,
  immutable snapshot adoption, direct-write permissions and concurrent issuance
  limits, in addition to the atomicity and receipt-selection scenarios.
- Five new provenance checks run the real extraction/helper/voice handler with
  mocked providers, identity, freeze and HTTP. Guest compatibility, authenticated
  issuance, NO TRADE/incomplete-data rejection, freeze and persistence failure pass.
  They do not replace testing the real authentication provider or a live browser.
- Five API orchestration checks, offline queue/reload regression and 66 thesis
  rule tests pass. API/progress typechecks, build and lint pass. CI includes the
  new provenance test, and API typechecking now explicitly includes voice-tool.

The never-deployed `20260905000001_atomic_progress.sql` candidate was extended
with the origin table and RPC; apply the complete current candidate, not an
older draft of that file. If any environment has independently applied an older
draft, stop and prepare a forward migration rather than editing its history.

RC-02/RC-03/RC-04 now have local implementations and focused passing regressions.
Release remains **NO-GO** pending migration preflight against actual histories,
coordinated writer cutover, final-candidate CI, independent review and iOS checks.
No production migration, deployment, paid provider request or live wallet action
was performed. The checkpoints below are historical evidence, not current status.

## Previous checkpoint: atomic progress remediation (`7e5cc05`, not deployed)

The initial review below describes candidate `57c8fee`. The follow-up implements
RC-02 and RC-04 in the local candidate and closes the timestamp portion of RC-03.
It does **not** establish that a client-supplied thesis was issued by Bobby.

- `20260905000001_atomic_progress.sql` introduces service-only commit/close RPCs.
  Ledger, seed, receipt reservation, season item and progress now commit together.
  Both API writers compare a locked progress revision and rebase at most four
  times. A trigger also invalidates snapshots when other code updates progress.
  Identity rows are locked first to serialize with the existing identity-link RPC.
- Ordinary progress commits also include route grants and profile changes. Event
  IDs are deduplicated before rule calculation; history-read failures stop writes.
  A lost close response can replay its stored result without another price lookup.
- Receipt selection is a database query over the full confirmed Base history,
  bounded by server acceptance and review time, using recorded token addresses.
  No 100-row/PostgREST-page cutoff, client clock, or confirmation-time fallback.
  Unique constraints reserve each receipt and seed once, and each season piece
  once per identity. Missing season catalog entries abort the complete close.
- New accepted reads pin the asset address and database timestamp. Raw client
  metadata cannot supply either; the API labels snapshots `client_snapshot`.
  The studio distinguishes the claimed read time from `executionEligibleAt`.
  Offline swaps before sync do not qualify. Pre-migration reads are deliberately
  not retroactively certified; ordinary close XP/Aura still work. Their UI does
  not promise an execution bonus. Existing paid receipts remain reserved.

### Evidence for the follow-up

PostgreSQL 17 was started in a fresh, temporary local cluster. The regression
applies the real prerequisite schemas and the new migration inside a random
test schema. No production data was read or changed.

- `test:progress-atomic-pg`: 14 scenarios pass: function permissions, server
  acceptance time, late-write rollback for plants and closes, bonus/season rollback,
  missing catalog rollback, lookup beyond 1,100 old receipts, address/wallet/side
  matching, replay, concurrent closes, stale sync, legacy wait rules, window
  boundaries, legacy import/NO TRADE/profile compatibility and final
  ledger-to-balance reconciliation.
- `test:progress-atomic-api`: five checks pass against the actual API orchestration
  with mocked identity, market and HTTP: deduplication/canonicalization/rebase,
  bounded contention, fail-closed history reads, replay and close RPC dispatch.
  This is not an authentication or live PostgREST integration test.
- Existing thesis rules: 66 pass. Real browser queue regression, scoped progress
  typecheck, API typecheck, production build and lint pass. The two new suites
  are included in CI; the Postgres suite refuses non-local URLs and never skips.
- No new Foundry/fork run, paid generation, remote CI run or independent audit
  verdict was obtained in this follow-up. These remain separate evidence gates.

### Remaining release requirements

1. **RC-03 remains partially open:** bind the read to an authenticated,
   server-issued verdict identifier and immutable snapshot. The current code proves
   only when the server accepted the submitted snapshot, not who authored it.
   Do not advertise it as proof of a Bobby-issued prior recommendation.
2. Validate historical references/uniqueness on the actual Bobby database before
   applying the migration. Duplicate season rewards, reused receipts or missing
   historical references intentionally abort migration; no user data is deleted
   or automatically rewritten to make the constraints pass. Historical partial
   closes need a separate reviewed reconciliation, not inferred backpayment.
3. Coordinate migration and API cutover with progress writers frozen and drained.
   The new APIs require the new columns/RPCs; old API deployments must not keep
   writing absolute balances alongside them. A revision trigger does not make an
   old writer concurrency-safe. Do not simply roll back to the old writer after
   enabling the new ledger. Verify identity linking with real migrated histories.
4. Apply only through the configured Supabase migration workflow after verifying
   the Bobby project; no production migration was attempted here. Re-run CI on
   the final candidate and collect the outstanding independent/iOS verdicts.

The original security release/activation gates below still apply. Local passing
regressions are not a production GO or proof that migration preflight will pass.

This is a bounded defensive source review and local regression check, not a
completed independent third audit or GO 3/3. No production deployment, database
change, wallet transaction, paid model call or new agent workflow was performed.

## Candidate and provenance

- Published web baseline: `0091cc2d60d1a1f00f327f6d2c42c0ac15ecf1f9`.
- Security input: `08e33d3b9dde0b428bf0796bfbbeaff640798734`.
- Local candidate branch: `codex/security-release-candidate`.
- The merge includes all 16 security-only commits and preserves the 11
  main-only commits (shared worlds, landing, companion art and thesis season).
  Git merged automatically; no file-level `ours`/`theirs` substitutions were used.
- `contracts/` and the reviewed payment, quote, RPC-redaction and readiness
  implementations have no diff from the security input.
- The missing dependency from `e7dd51b` is restored in
  `src/lib/companions/progress.ts`: `ThesisSnapshot`, queued payload and method
  argument. The queued verdict is copied to preserve the read snapshot.

## Evidence and its limits

GitHub run [33954559063](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/33954559063)
was inspected directly. Its head is exactly `08e33d3`; application, integration
and contracts all completed successfully. This is inherited evidence for the
security input, not a GitHub run of this merged candidate. Foundry was not rerun
and the deployed runtime hash was not independently measured this turn.

Checks executed locally on the candidate:

- `npm run check:progress`: pass; typechecks the browser store and sync modules.
- `npm run test:progress-thesis-sync`: pass. Runs the real bundled store and sync
  functions with in-memory storage/HTTP. Covers persisted snapshot, later view
  changes, failed delivery, reload, retry, request payload and acknowledgement;
  events without a thesis still work. No real account or network is used.
- `npm run test:trader-land-thesis`: 66 passed.
- `npm run test:base-swap`: pass, including execution-view consistency.
- `npm run test:mcp-payment-transport`: 13 passed, entirely mocked transports.
- `npm run test:rpc-redaction`: pass, mocked providers and captured logs.
- `npm run build`: pass, including API typecheck; wallet annotation and chunk-size
  warnings remain. Vite build itself does not typecheck the full React app.
- `npm run lint -- --quiet` and staged/unstaged `git diff --check`: pass.

The CI definition now includes the progress typecheck, thesis rule suite and
actual queue-to-HTTP regression. These checks previously were absent from CI.

## Focused review of the reopened areas

| Area | Observation | Remaining limitation |
| --- | --- | --- |
| BP-01 | Quote/execution view binding is present on response acceptance and before signing; local guard regressions pass. | No wallet or browser signing session exercised. |
| BP-08 | Canonical UUID/bytes32 mapping and retry/result handling are present; mocked transport suite passes. | Migration 0013 and live contract compatibility still need deployment verification. |
| BP-03 | Strict env helpers feed the deploy config before broadcasting. Candidate contract/script source matches tested security input. | No new fork simulation or broadcast performed. |
| BP-06 | Real CI reached build, lint, audit, Postgres and Foundry steps. | Merged candidate still needs its own CI run before release. |
| BP-11/BP-12 | Degraded-source reporting and error redaction regressions pass locally. | No claim of exhaustive coverage of every provider error format. |
| Deploy review | Readiness includes treasury/bond CALL evidence and matches the security input. | Final on-chain manifest and operator gates are not verified here. |

BP-02/BP-05 source was also inspected in the existing iOS worktree at `91ab7c2`:
selected-pair checks and RPC correlation/session invalidation are present in the
relevant files, which have no local diff. Other iOS files are dirty. No simulator
or device suite was run; this does not replace the outstanding iOS verdict.

## Trader Land findings outside the audited branch

### RC-01 — fixed: read thesis discarded during web integration

`CompanionDesk` passed the snapshot to `awardDiscipline`, but the published store
accepted only two parameters and never queued `thesis`. The earlier integration
omitted this part of the prerequisite commit. Rule-only tests and API typecheck
did not cover this path. The browser-store fix and queue-to-HTTP regression above
address the integration defect. Previously stored seeds without a snapshot cannot
be reconstructed from this change; no historical records were modified.

### RC-02 — P2, open: close/reward writes lack an atomic boundary

`api/_lib/trader-land.ts:238` changes the seed before inserting the close event,
season item and final progress balance. A later write failure leaves partial
state; the initial state check rejects the next close. The spent-receipt read and
season-next read also do not reserve their results atomically. Existing inventory
uniqueness is per event, not per execution receipt or per season piece.

Required remediation: a service-only database transaction for seed close, receipt
reservation, ledger credit, season allocation and progress update. Include
idempotent recovery and stable uniqueness constraints. Coordinate with
`api/progress.ts`, whose independent absolute balance update must not overwrite a
concurrent close. Simply adding a receipt index after the seed write is not enough.
Verify rollback and concurrent legitimate requests on a scratch database; do not
create synthetic rewarded records in production.

### RC-03 — P2, open: execution window lacks trusted read provenance

`api/progress.ts` accepts client event time and a client thesis snapshot;
`seedReviews` uses event `occurred_at` and `closeSeed` uses that time as the start
of swap eligibility. This does not establish that the server recorded the thesis
before execution. The normal 24-hour wait is based on database `seeded_at`, which
is a different timestamp.

Required remediation: define and enforce server-recorded eligibility time and,
if the reward promises a Bobby-issued thesis, bind the snapshot to a persisted
server-issued read identifier. Document the offline behavior explicitly. Keep
ordinary local learning progress separate from proof of prior on-chain intent.

### RC-04 — P2, open: receipt lookup can omit eligible activity

`findExecutingSwap` requests the oldest 100 confirmed receipts and filters the
review window afterward. It has no pagination. Eligible recent receipts beyond
that first page are never considered. The spent-event lookup is also unpaginated.
The read currently resolves receipt symbols to today's token registry instead of
using the recorded token-address columns directly.

Required remediation: query the bounded server-authorized time window and Base
chain explicitly, use persisted contract addresses, and use complete pagination
or a database-side selection/reservation in the same close transaction.

## Release gates

The upstream report still requests a final independent pass before GO 3/3.
No completed 37-result consolidation or the referenced local `4b79f1c` was
available in the fetched branch, and there is no PR for `security/remediation-r2`.
The latest fetched remote head remained `08e33d3`.

The launch-readiness document lists migrations 0011/0012/0013 as pending on the
Bobby project `qbvdqkknnuweatptjohi`. No Supabase MCP is callable in this session,
so their current production status was not checked. The repository's root
AGENTS.md names the legacy DeFi Mexico project; do not apply Bobby migrations
there by assumption. Verify actual deployment database configuration first.

The full-redeploy versus existing-TrackRecordV2 decision, Safe ownership,
contract verification, canary/cutover checks and iOS distribution remain distinct
operator gates. The runbook's full-redeploy default is not proof of approval to
retire the existing history. Legal allow-list sign-off and key revocation remain
reported operational prerequisites, not items independently verified here.

Next bounded block: resolve RC-02/03/04 as one coherent ledger/provenance change,
validate its migration on a scratch database, collect the remaining independent
verdicts, then run CI on the resulting candidate. Do not deploy this intermediate
candidate or activate real-money functionality based on these passing unit tests.
