# RevenueCat paid-period recovery for release 1.6 (54)

## Verified cause

The owner's Production purchase was delivered successfully at 2026-10-02 07:48 UTC, before the paid-briefing proof adapter was deployed. The original INITIAL_PURCHASE event exists once in Bobby's revenue ledger, with 99 MXN paid, and RevenueCat currently confirms purchased Pro through 2026-11-02T07:54:28Z. Bobby's subscription mirror is active, but the paid-period proof was absent at the 16:25 UTC check. Physical build 54 behavior is verified separately by the release operator.

RevenueCat's event details and webhook integration show Sent / HTTP 200 without a replay control. The existing authenticated restore route previously fetched V1 subscriber state without a paid event. V1 omits paid price, and the ledger omits transaction and period fields, so neither alone can construct a verified paid period.

## Server-only correction

The existing authenticated `/api/bobby-access` action `revenuecat-sync` still refreshes V1 subscriber state for the signed-in account. When a matching paid proof is missing, it may fetch the original provider events through the existing server-only `REVENUECAT_V2_SECRET_KEY`:

`GET https://api.revenuecat.com/v2/projects/proj2d9c569b/customers/{authenticatedAuthUserId}/events?environment=production&limit=20`

The project API ID, Bobby App Store app ID `app25c54ce720`, and monthly SKU `xyz.bobbyprotocol.bobby.pro.monthly` are explicit. No first-project or client-selected customer/project fallback exists. Credentials remain in Vercel. The backend neither exports secrets nor changes key permissions.

Only original INITIAL_PURCHASE / RENEWAL provider events are normalized. The event must match the freshly fetched subscriber's owner, transaction, product, store, paid period, Production environment and positive local price/currency. Timestamp checks retain the existing adapter's one-second tolerance for provider date precision. Trials, gifts, shared purchases, refunds, expired subscriptions, missing fields and ambiguous matches are excluded. The same existing paid-proof writer stores the corroborated result; there are no new endpoints, schema changes or manual inserts.

This backfill only runs when no webhook event was supplied and no matching proof already exists. Webhooks continue to reconcile their own event before the idempotent revenue-ledger write; ledger deduplication does not suppress paid-proof handling.

## Limits and failure behavior

- One request, at most 20 recent events, 2.5-second timeout. Older matching events outside that page remain unverified.
- No pagination and no redirects; arbitrary `next_page` metadata is ignored.
- Missing V2 key, denied scope, provider failure, malformed response or no unique match leaves paid-only briefings ineligible while keeping basic Pro's independently verified entitlement.
- Matching proofs are preserved without repeated history requests. Refund/removal and changed transactions invalidate stale proofs as before.
- Live proof recovery must still be checked after deployment using the authenticated restore action and the production paid-period table/RPC. Passing local HTTP doubles is not physical purchase/restore, APNs delivery or App Review evidence.
- Weekly consent, budgets, APNs credentials and actual notification delivery remain separate gates. This patch does not activate scheduled generation.

## Validation

`node --import tsx scripts/test-briefings-revenuecat.mts` exercises the real adapter and DB/provider HTTP boundaries, including foreign accounts/aliases/apps, gifts/free accounts, Sandbox, trials, zero/unknown prices, wrong product/transaction/period, shared/refunded/expired purchases, duplicate ambiguity, missing key/401/403/timeouts and no-pagination/no-redirect guards.

Official API reference: [Customer Resources](https://www.revenuecat.com/docs/api-v2/customer/resources), specifically customer event history. No dashboard-internal APIs are used.
