# Atomic progress release: operator gates

Status: prepared and locally tested; production execution is not authorized by
this checklist. The candidate branch is `codex/security-release-candidate`.
Pushing this branch runs CI/Security but its Vercel Git deployment is disabled.
That branch-specific setting does not alter deployments for main or other branches.
Configuration reference: https://vercel.com/docs/project-configuration/git-configuration

## Before changing a database

1. Confirm the project's actual runtime database configuration and project ID.
   Bobby's release documentation names `qbvdqkknnuweatptjohi`; legacy root
   instructions name another project. Neither document alone proves the target.
   Use the configured Supabase MCP, not copied connection credentials.
2. Inspect applied migration versions and confirm security migrations 0011/12/13
   independently. Do not reapply them based on old status notes.
3. Require passing application, integration, contracts and security CI for the
   exact candidate SHA. Collect the remaining independent audit verdicts. Local
   tests and an agent's own code review are not independent GO 3/3.
4. Take/confirm a recoverable database backup and an operator-owned rollback plan.
   Freeze progress writers and issuance, drain existing requests and account for
   cached control state. Do not run old and new absolute-balance writers together.
5. Run `scripts/check-progress-migration.sql` through the Supabase MCP. It is a
   read-only transaction with a timeout and returns aggregate counts only. Missing
   tables/permissions, timeout or any nonzero count blocks the migration review.
   `CLEAR_FOR_MIGRATION_REVIEW` is not production GO.

The preflight checks seed/receipt references, duplicate closes and receipt usage,
duplicate season pieces, ledger balances, incomplete historical closes, catalog
availability and whether the candidate schema is already present. It cannot prove
the absence of all data defects, verify backup recoverability or certify the
deployment environment. Keep its counts with the candidate's release evidence.

## Handling a blocked preflight

- Do not delete duplicates or create retroactive rewards to make counts green.
- Review the affected records privately with the operator and agree a separate
  reconciliation. The script intentionally does not output account/receipt IDs.
- If an older draft of candidate migration `20260905000001` was applied anywhere,
  create a reviewed forward migration for that environment; do not edit its history.
- Keep writes frozen if partial deployment or inconsistent balances are found.

## Coordinated cutover (after approval)

1. Apply the complete reviewed `20260905000001_atomic_progress.sql` using the
   Supabase migration tool on the verified project. The candidate migration has
   not been applied in production by this work.
2. Verify its columns, unique indexes, RLS and service-only function permissions.
   Verify PostgREST has reloaded the schema and the intended RPC signatures exist.
3. Deploy the exact reviewed API/web commit while writers remain frozen. Do not
   promote a differently built artifact or old preview as a substitute.
4. Check read-only authenticated/guest behavior, then unfreeze only when old
   writers can no longer receive traffic. Exercise a legitimate operator-owned
   read/sync and later review; do not insert synthetic rewarded rows in production.
5. Confirm that a read's origin ID and acceptance time are recorded once, and that
   client-visible balances agree with the ledger. Observe errors before expanding.

No signing secret is added. Guests, expired origin references and older clients
retain ordinary progress but lack execution-bonus eligibility. Native iOS needs
to request/carry `thesisReadId` before that feature can be described as supported.
An old client must never receive a fabricated origin or backdated eligibility.

## Rollback

Freeze/drain first. Do not restore the previous API's non-atomic writer over the
new ledger. Prefer a reviewed forward fix; database recovery or reconciliation
requires an explicit operator decision and backup validation. Do not drop the
new ledger/origin columns or remove uniqueness constraints to silence failures.

## Evidence still required outside this workspace

- Actual production project, migration versions, preflight and backup evidence.
- Final independent audit verdicts and agreed native iOS release scope.
- Deployment/cutover observation on the exact approved artifact.
