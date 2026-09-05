# Release candidate: focused integration review

Date: 2026-09-05. Verdict: **NO-GO for release / activation**.

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
