# Bobby web conversion funnel

Use an ordered Amplitude funnel, unique users, a seven-day conversion window, and the default timestamp resolution. Intervening sign-in, reading and paywall events are allowed. Apply `event_properties.platform = web` to every step; do not filter the mutable user platform.

| Step | Event | Definition |
| --- | --- | --- |
| Site entry | `visit` | The static home or SPA records a page visit. Direct `/desk` entries qualify. |
| Desk | `desk_entered` | The React Desk component mounted. This is a distinct event from its site visit. |
| Payment | `checkout_opened` | The server returned a usable Stripe Checkout URL, deduplicated by session. This confirms checkout availability, not payment. |
| First recorded paid web conversion | `billing_first_paid` | The first positive production Stripe transaction recorded for the canonical Bobby account. Filter `store = STRIPE` and `environment = PRODUCTION`. |

For landing acquisition, duplicate the funnel and additionally filter the first step to `surface = home`. A direct Desk visitor then qualifies for the main funnel only. Keep `paywall_view` and `purchase_start` as diagnostic stages; the latter is a client intent that may fail to open Checkout.

## Identity and payment semantics

- Static home and SPA use the same random browser install ID. The server salts it as `device_id` and resolves authenticated credentials to the canonical Bobby identity as `user_id`. An event containing both bridges earlier anonymous visits to later account-only billing events. Auth UUIDs and client-provided identity values are not analytics identities.
- A free trial or 100% coupon is not a paid conversion. Its first later positive renewal qualifies. Apple, sandbox, refunds and later re-subscriptions do not create another web conversion.
- The alias preserves its source payment timestamp and contains no revenue fields. The original billing event contributes the financial amount once. A durable account acknowledgement and stable account-level insert ID protect retries and overlapping batches. Acknowledgement receives exactly the aliases sent, so late invoices cannot erase that receipt.
- Before acknowledgement, out-of-order pending invoices select the earliest positive source timestamp. History arriving after an accepted alias does not create another conversion. Imported or missing older history cannot establish a first-ever purchase: the label is intentionally the first recorded paid conversion.

## Reading the chart

For each ordered stage `N`, entrance conversion is `N / site entry × 100`. Step conversion is `N / previous stage × 100`; dropoff is the difference in unique users and `1 − step conversion`. If the denominator is zero, show no percentage. Repeated pageviews or sessions do not increase a person's funnel stage count.

Anonymous uniqueness is based on the recorded browser install until authentication merges it. Script blocking, missing storage and unlinked devices limit that measurement. Events before these new steps were instrumented cannot prove the full historical funnel.

## Local verification

`npm run test:web-funnel-client` simulates the actual bundled tracker, access client, static home and middleware without network access. `DATABASE_URL=<empty local PostgreSQL database> npm run test:web-funnel-pg` exercises the tracker and checkout recorder against PostgreSQL and the actual exporter with provider HTTP intercepted. Store payments, browser redirects and live Amplitude ingestion still require separately authorized production verification.
