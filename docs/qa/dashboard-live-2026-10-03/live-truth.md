# Production dashboard truth audit — 2026-10-03

Project: `qbvdqkknnuweatptjohi`. Read-only Supabase MCP queries at 2026-10-02 23:07–23:10 UTC / 2026-10-03 00:07–00:10 Europe/Lisbon. Serving commit supplied by root: `1d565e7250058f825a3514d6f7dbd91ffd4c2512`. No remote writes, account details, emails, device hashes, or transaction IDs were exported.

## Confirmed facts

- Default outside-team metrics: 8 accounts, 19 consumed reads, 14 active readers in the tracked period, 6 server-recorded completed responses after outcome coverage, 13 distinct web visitors and 17 visit events, zero production customer revenue.
- Internal traffic is substantial: 3 accounts and 8 installs; 22 of 41 consumed reads are internal.
- The single purchase is APP_STORE INITIAL_PURCHASE, PRODUCTION, gross USD 5.406 / ledger net USD 3.262521. It is internal and correctly excluded from default customer revenue.
- The only active Apple subscription has a live period but unknown `environment` and `period_type`. With internal=true, overview active=1, paid=0, unverified=1; economics active=0, unverified=1. Default outside-team subscription categories are all zero. Entitlement status alone does not establish a paid production customer.
- No Stripe purchase or subscription rows exist. This is no observed Stripe activity, not proof that checkout works.
- Recorded LLM cost is USD 0.54372 over admin, bobby-cycle and desk only. There are zero manual cost rows and no provider credit-balance marks. Total business cost/profit and remaining provider balance cannot be described as fully measured.
- At 23:08 UTC, latest web event was visit at 23:07:00 UTC; last iOS server-recorded completed response was 20:02:16 UTC. Refresh time and event time must be displayed separately.

## Coverage and unknowns

| Source | Earliest evidence / observed coverage | Limitation |
| --- | --- | --- |
| Consumed reads | 2026-09-27 00:13 UTC | Consumption is not delivery; 41 consumed vs 14 server-recorded completed responses due to outcome coverage starting later |
| Reader stats | 2026-09-27 00:13 UTC | Identity/install stitching is heuristic; “people” are not verified humans |
| Web events | 2026-10-01 16:37 UTC | 1 visit lacks a device hash; distinct visitors omit it |
| Outcomes | 2026-10-01 23:15 UTC | Counts before coverage are unknown |
| iOS observed installs | Earliest actual observed device first_seen: 2026-10-02 05:50 UTC | Growth RPC hardcodes iosObservedSince=2026-10-01 20:45:03 UTC; this is instrumentation rollout metadata, not first actual observed app open |
| iOS client events | No visit/open/paywall/purchase_start events | Database CHECK currently does not accept app_open/app_background/app_heartbeat; “online now” cannot be asserted |
| Activity days | 2026-09-07 | Includes backfill; historical returns differ from prospective retention coverage |
| Geo | 2026-10-01 21:09 UTC | First-party observed devices only; not age/gender |
| Billing | 1 production internal purchase | No sandbox row, renewal, expiration, refund, transfer, webhook ordering, or checkout proof in this snapshot |
| LLM ledger | 2026-09-29 12:03 UTC | Only 3 surfaces recorded; other paid providers/surfaces not established |

`bobby_admin_growth` default returns cohorts iOS arrived=7/read1=5/account=6/read_delivered ledger event=6; web arrived=13/read1=0/account=0. Retention D1/D7/W1 eligible denominators are zero, so percentages should be unavailable rather than zero-percent failures.

Production overview subscription SQL already distinguishes paid/unverified/sandbox, but origin/main `unitEconomics` drops raw unverified/sandbox fields. Preserve these categories through API and UI.

## Baseline database performance

One bounded EXPLAIN ANALYZE per 30-day RPC, 2026-10-02 23:08–23:09 UTC. Warm buffers and very small production tables; these are DB-only samples, not API latency or load-test proof.

| RPC | Execution ms | Shared buffer hits |
| --- | ---: | ---: |
| overview | 49.885 | 4421 |
| growth | 57.711 | 3508 |
| economics | 28.122 | 3003 |
| geo | 17.911 | 2620 |
| users, 50 rows, output users removed | 17.941 | 2363 |

No sampled plan showed written blocks or temporary I/O. Table snapshot: devices37, device links11, events95, reads41, identities13, purchase events1, LLM calls100, activity days66, reader stats21. At this size provider/network fanout and frontend request scheduling warrant priority over claiming DB scale improvements. No representative concurrent or large-table test was run.

## Applied schema drift

Production contains five admin-related migrations absent origin/main; exact SQL was captured from `supabase_migrations.schema_migrations` into `production-migrations.json` and `production-migrations/*.sql`:

- `20261002102846` / `20261002120000_admin_codex_review`
- `20261002103557` / `20261002124500_internal_subjects_indexed`
- `20261002104708` / `20261002130000_admin_device_facts_join`
- `20261002141332` / `20261002132106_amplitude_billing_export`
- `20261002141339` / `20261002140000_subscription_environment`

The current people_facts returns first_read_at/last_read_day and anon activity columns, unlike older source. The internal subject function uses a recursive connected-account/install graph plus networks, and device facts uses aggregated joins. Preserve both performance fixes when porting truth changes.

All 14 inspected bobby_admin RPCs and the internal helpers are SECURITY INVOKER, execute privileges postgres/service_role only. This does not prove every project policy is safe.

## Reproducible query categories

- `pg_proc`: names, identity arguments, pg_get_functiondef, security flag, ACL, selected admin/internal helpers.
- `information_schema.columns`, `pg_constraint`, `pg_indexes`: relevant tracking/billing/reader schemas and CHECK constraints.
- Aggregate grouped counts/min/max timestamps over bobby_events/devices/reads/subscriptions/purchase_events/llm_usage. No row identifiers.
- `bobby_admin_overview(30,false)`, `bobby_admin_economics(30,false)`, `bobby_admin_growth(30,false) - 'attention'`, internal=true subscription/revenue summaries.
- `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT <read-only admin RPC>`.
- `supabase_migrations.schema_migrations` constrained to the five migration names above.

See `live-aggregates.json` for aggregate output/timings and `production-dependencies.json` for exact helper SQL and constraints.

