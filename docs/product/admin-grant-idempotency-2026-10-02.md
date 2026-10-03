# Dashboard grant retry correction — local candidate after build 53

The uploaded Bobby 1.6 (53) is immutable. This correction is local on `codex/ios-briefings-acceptance-54`; it has not been deployed and the migration has not run remotely. The existing iOS 53 balance contract stays compatible: gifted `reads`, `profundo` and `maximo` still live in `bobby_usage_bonus`, separate from base quotas and paid Pro eligibility.

## Behavior

One grant intent gets one UUID v4 before it is sent. The dashboard writes its operation and fixed quantities to session storage, scoped by the verified administrator and recipient UUIDs, before any request. It stores no token, password, email or free text. If browser storage is unavailable the request is refused. An ambiguous failure keeps the intent and locks its quantities; reopening the dialog or refreshing restores the same operation. No automatic retry occurs, including after logout. An intent belonging to a different administrator is never reused; ambiguous intents remain isolated until confirmed rather than being erased and accidentally reissued with a new key.

The service-only `bobby_admin_grant_once` RPC revalidates the live administrator role. In one PostgreSQL transaction it records the operation, adds the benefit, creates one grant audit row and stores the exact result. Repeated and concurrent requests with the same actor, account and canonical payload return that result. A changed actor/account/payload returns `operation_conflict`. Exact JSON equality is checked in addition to an MD5 fingerprint; the hash is an indexable comparison aid, not an authorization primitive. Audit or benefit failures roll the entire transaction back. A deliberately new key remains a new intentional gift.

Operation receipts retain only UUIDs, quantities and results without account foreign keys, so account deletion does not block or free an old operation for reuse. The ledger has RLS enabled and no public, anonymous or authenticated table access; the RPC uses `SECURITY INVOKER`, a fixed search path and service-only execute privileges.

## Deployment ordering — approval still required

The new migration is `20261002132827_admin_grant_idempotency.sql`, generated with `supabase migration new` after discovering the CLI command. Existing migration files were not edited. Apply it before serving the new API/dashboard together, only after the deployment/migration is separately authorized. It preserves the legacy five-argument RPC signature but replaces its additive body with an explicit refusal: an old API cannot bypass idempotency during the transition. Grants therefore fail closed until the new API is served. Never restore the old additive implementation as a rollback while an operation-key dashboard is available. Ordinary balance reads and consumption do not change.

The candidate route bypasses the old per-request HTTP audit only for grants; the transactional RPC owns the single benefit audit. Other admin actions retain their existing audit behavior. The API and client both require an acknowledgement matching the operation UUID. Old frontend requests without a key are rejected by the new API.

## Local evidence

- `node --import tsx scripts/test-admin-api.mts`: **185 checks passed**, mocked HTTP/storage only. Includes a committed grant whose DB response is lost, successful same-key recovery, one sum/audit, malformed/missing operation keys, conflicting payload, removed administrator and unmatched acknowledgement. DEV fixtures also test the lost-confirmation path.
- `DATABASE_URL=postgresql://bobby_grant_qa@127.0.0.1:56554/postgres node --import tsx scripts/test-admin-pg.mts`: **189 checks passed** against isolated PostgreSQL 17. Includes six concurrent replays, exact Pro-expiry replay, changed recipient/payload/admin, live role removal, `service_role` execution, denied authenticated execution, RLS/ACL checks, rollback at audit and benefit faults, safe account deletion, and existing iOS consumption/refund/isolation checks. The local cluster was stopped afterwards.
- `npm run check:api`: passed.
- `npm run build`: passed (source guard, API TypeScript, Vite and PWA). Existing dependency annotation and large-chunk warnings remain.
- `git diff --check`: passed.
- Full frontend `tsc -p tsconfig.app.json --noEmit` failed on existing unrelated application type errors (academy, Adams speech types, startups, community types); the inspected output reported no errors in these changed admin files. This is not a passing frontend typecheck.

The discovered `supabase db advisors --db-url postgresql://bobby_grant_qa@127.0.0.1:56554/postgres --type security --level warn --fail-on error` command failed with `LegacyDbConnectError` against the disposable local cluster. No remote advisor run or clean-advisor verdict is claimed. Direct PostgreSQL RLS/ACL, service-role and denied-caller checks passed. The cluster was stopped again after this attempt.

Logs are sanitized local artifacts in `/private/tmp/bobby-grant-retry-54/`: `api-tests.log`, `pg-tests.log`, `frontend-tsc.log`, `build.log`, `schema.log`, `advisors.log` and `server.log`. The API and PG counts overlap in coverage and must not be added as unique test cases.

For browser-only fault verification, use DEV `/admin?mock=grant-lost`: issue a small fixture gift, observe the first 502 after the fixture commits, close/reopen the dialog, and confirm the same pending gift. The fixture balance and audit must increase only once. The mock is stripped from production and is not evidence of a production grant or iPhone balance refresh.

## Still unverified

No real account received credits. Remote deployment/migration, authenticated dashboard grant, matching account bearer balance, physical iPhone refresh, actual consumption and failure refund still require the authorized QA canary. The user must select a QA account and explicitly authorize its finite grant/consumption; this local change does not grant that authorization.
