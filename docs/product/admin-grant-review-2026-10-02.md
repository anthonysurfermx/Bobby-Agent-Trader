# Dashboard account gifts — functional review, 2026-10-02

Scope: `https://bobbyprotocol.xyz/admin#usuarios`, local candidate in `.claude/worktrees/pro-briefings-b53`. No production grants, live providers, production migrations or deployments were executed. Root observed the remote admin page asking for sign-in; that demonstrates the signed-out UI boundary, not the authenticated gift flow or deployed SQL version. This is a functional review, not the separate security audit.

## Local evidence

- `node --import tsx scripts/test-admin-api.mts`: **166 checks passed**. Mocked storage/auth only. Added grant cases at lines 169–181 cover negative/fraction/overlimit quantities, non-admin refusal before mutation, unavailable audit log, and visible storage failure with failed audit status.
- `DATABASE_URL=postgresql://bobby_qa@127.0.0.1:56553/bobby_grant_qa node --import tsx scripts/test-admin-pg.mts`: **151 checks passed**, against an isolated, disposable local PostgreSQL 17 database. Real source migrations were applied locally. Added cases at lines 205–233 verify persistence into the selected identity, no gift in another identity, base allowance before gifted use, `platform='ios'` consumption at the base cap, ordinary-read and premium-level refunds, paywall-off behavior, and two simultaneous consumers spending at most one available gift.
- `npm run build`: **passed**, including source guard, API TypeScript check, Vite production bundle and PWA build. Known dependency annotation and chunk-size warnings remain. Captured log: `admin-grant-build-2026-10-02.log` (long asset listing may be truncated).
- `git diff --check`: passed after the grant code/test changes.

These API/SQL checks do not launch an iPhone app, prove physical-device credit display, exercise production bearer tokens, or validate the deployed migration. Root stopped the disposable PostgreSQL server after all tests; evidence remains in the scratch data/log files.

## Concrete local fixes

`src/components/admin/bobby/UsersTab.tsx:270–327` now preserves invalid pasted input and rejects noninteger/negative/decimal quantities. Previously `-10` was silently turned into `10`, and `1.5` into `15`. A synchronous ref blocks a second submit before React renders the disabled button. While the request is pending, fields and cancellation are locked to keep the selected account and requested amount visible. Server errors still appear inside the dialog; success closes it and reloads the users table.

The iOS reviewer is handling the separate native balance display: the existing read and premium parsers ignored `bonus`. The contract is a nonnegative gifted balance separate from base `remaining`, with no change to `tier` or paid-Pro eligibility. Reads use the gift after base exhaustion only when the paywall is on; premium gifts remain usable even with a zero base allowance. Native reviewer completed this local fix; final targeted integration passed 107 tests without failures and Release compiled. No physical-device balance display is proven.

## Open material defect: repeated grants are not idempotent

`api/_lib/admin.ts:172–178` forwards each authorized POST directly to `bobby_admin_grant`; the request carries no operation key. `supabase/bobby-protocol/supabase/migrations/20261001180000_admin_dashboard.sql:304–323` atomically **adds** each request to the balance/Pro grant. The new PostgreSQL characterization at `scripts/test-admin-pg.mts:230–233` proves two identical 5-read grants leave 10 reads. Atomicity protects concurrent balance changes; it does not make a repeated operation safe.

The UI guard prevents accidental simultaneous submission within one open dialog. It cannot protect a manual retry after a response is lost, a reload, another tab, or a replay. `src/lib/admin-client.ts:373–400` currently invites retry after a network/server error, including an ambiguous result where the database may already have committed. Before treating retries as safe, add a durable operation key with an admin/account/amount fingerprint and commit the gift plus replay result in one SQL transaction; replay the stored result for the same key and reject changed payloads.

## Relevant source protections and remaining verification

`api/_lib/admin.ts:44–58` requires a signed-in Supabase account with an actual `bobby_admins` membership and fails closed if that check fails. `api/_lib/admin.ts:165–177` resolves the selected UUID and checks limits. `api/admin.ts:107–119` creates the audit row before mutation and records the result. The gift RPC is service-role only (`20261001180000_admin_dashboard.sql:330–331`), verified locally.

The remaining remote proof requires an authenticated administrator and an explicitly authorized QA account: verify the served deployment/migration, issue one controlled gift, read the account balance through its own bearer, exercise its iOS display/consumption, and reconcile audit/balance/refund evidence. No such production canary is authorized by this review. Current verdict: **local grant persistence and consumption pass; safe retries remain unresolved; production and physical-iPhone gift flow unverified**.
