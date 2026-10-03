# Client telemetry SQL contract and regression evidence

One new migration: `20261002235202_first_party_client_telemetry.sql`. The ready phase1 migration is unchanged. No production mutations.

The clean local PG17.11 chain passed **339 phase1 checks + 170 telemetry checks** in `dashboard_telemetry_final` on `127.0.0.1:54394`. The changed telemetry suite was rerun after wallet-proof, clock-order and indexed read optimizations; the unchanged immutable phase1 suite was not repeated. The actual service_role successfully invoked the writer and aggregate under security invoker; anon/authenticated execution and all new table access were denied. The fixture api_cache stand-in was created after its baseline grants, so the test explicitly grants it the read access verified in production by a read-only privilege query at 2026-10-03T00:02:20Z (service select/insert/update were true).

## Ingestion

`bobby_record_client_telemetry(p_event_id uuid,p_kind text,p_platform text,p_install_hash text,p_session_hash text,p_sequence bigint,p_occurred_at timestamptz,p_identity_id uuid default null,p_app_version text default null,p_app_build text default null,p_request_id uuid default null,p_read_receipt_id uuid default null,p_verified_auth boolean default false)`.

- Only the server service role can call it. The API supplies p_verified_auth from verified credentials (wallet or Supabase), independently of account identity; clients cannot assert this field. Account counters still require identity_id. The API derives identity from verified auth, uses the existing salted 24hex deviceHash as install_hash, and salts the client session UUID into a 24hex session_hash. No client-supplied account identity is authorized by this RPC.
- Kinds: foreground, background, heartbeat, read_started, read_received, read_rendered, webview_terminated. Only iOS/web are supported. App version/build values are bounded tokens; arbitrary payloads are absent.
- The API verifies the HMAC success receipt before passing its UUID, request UUID, platform/device binding and server-derived identity. SQL requires a receipt and request UUID for received/rendered, prohibits receipts on other kinds, and deduplicates each receipt phase independently. UUID retries are globally deduplicated. Started requests with a request UUID are also deduplicated; started remains optional.
- Logical timestamps are required for foreground/background/heartbeat. Client capture times more than thirty seconds ahead of server receipt or older than five minutes are rejected. The raw bounded capture time is retained for ordering. Other events may use service receive time. Event windows use server received_at, while presence explicitly uses reported client logical time.
- Result: `{accepted:boolean,duplicate:boolean,presenceUpdated:boolean}`. Valid ignored heartbeats and unique stale lifecycle observations are acknowledged safely; they do not mean storage failure. A duplicate event never refreshes presence.

## State and retention boundaries

Presence keeps one latest row per platform/install. Same-session sequence must increase, and logical time cannot regress. A different session must have a strictly newer logical timestamp. Heartbeats can renew only the current already-foreground session and cannot switch epochs or resurrect a background session. Expiry is ninety seconds from the earlier of raw logical capture and server receive time; delayed deliveries and retries do not receive a new ninety-second lifetime.

Heartbeats mutate only presence. They do not insert client events, coverage, reads, activity days, devices or retention records. Private verified_auth event/presence proof and the last_authenticated_received_at presence fact record actual authenticated updates, including wallet credentials with identity_id null, and remain evidence after later anonymous reports; stale, duplicate and ineligible heartbeats cannot update it.

Rollout timestamps persist per platform/version/build/signal independently of event retention. A foreground/heartbeat report cannot establish rendering or read coverage. Legacy versions remain unmeasured. New tables have RLS enabled and service-only privileges; functions use security invoker and explicit search_path.

## Additive admin snapshot

The original server RPC is retained as bobby_admin_server_live(bool), then bobby_admin_live(bool) adds one client field. All existing phase1 keys/values were compared within one PostgreSQL transaction. The existing global booleans remain false.

```text
live.client = {
  presenceTtlSeconds:90,
  health:{status:'unknown'|'failure_observed'|'recovered',lastErrorAt:null|string,
    error:null|'auth_unavailable'|'storage_unavailable'|'request_budget_exhausted',
    authenticated:null|boolean,lastReportAt:null|string,recovered:null|boolean},
  platforms:{ios:ClientPlatform,web:ClientPlatform},
  coverage:{protocolVersion:1,scope:'instrumented_clients_only',legacyClients:'unmeasured',
    crashes:false,successRate:null,eventTimeScope:'server_received',presenceTimeScope:'client_reported',
    readVerification:'server_authenticated_success_receipt'}
}
ClientPlatform = {
  presence:{reportedForegroundInstalls,reportedForegroundAccounts,reportedForegroundSessions,
    latestReportAt:null|string,scope:'client_reported_90s'},
  windows:{'15m':Window,'1h':Window,'24h':Window},
  latest:{eventAt,receivedAt,renderedAt,webviewTerminationAt},
  coverage:{rolloutSince,readStartedSince,readReceivedSince,readRenderedSince,webviewTerminationSince,
    scope:'instrumented_clients_only',legacyClients:'unmeasured',crashes:false},
  builds:[{appVersion,appBuild,reportedInstalls24h,foregroundInstalls,latestReportAt,coverageSince,
    readStartedSince,readReceivedSince,readRenderedSince}]
}
Window = {minutes,since,foreground,background,started,received,rendered,
  webviewTerminations,reportedInstalls,reportedAccounts}
```

Client counts use the same account/device team graph and includeInternal toggle as phase1. Rollout metadata describes observed instrumentation across all reported clients, independently of customer filtering. All absent coverage timestamps are null. Heartbeat-only build metadata may be observed while that build's event/signal coverage timestamp remains null. No identity/device/session/request/receipt identifiers are exposed.

Health reads only the dedicated cache key and allowlisted fields. Malformed, future, older-than-thirty-day or expired evidence produces unknown/null recovery. Authenticated failure recovery requires a later authenticated signed received/rendered event or presence update; anonymous success cannot establish it. Missing health evidence does not establish zero failures or uptime. A complete database outage cannot reliably record its own failure in that database.

## Meaningful verified cases

- Concurrent UUID retries and receipt/request retries under alternate UUIDs count once.
- Old same-session and old cross-session reports cannot revive a newer background state; equal-time different sessions cannot override background. Twenty concurrent reordered lifecycle writes retain the newest state.
- Bounded positive clock skew survives inverted cross-session delivery: an earlier foreground cannot revive a newer background, and an earlier background cannot close a newer foreground. TTL uses the earlier capture/receive time while raw capture is retained for ordering.
- Ninety-second liveness expires from the earlier capture/receive time, including delayed heartbeat delivery; heartbeat retries do not extend it.
- Heartbeats do not inflate events, reads, activity/retention or coverage, and ineligible/stale heartbeats do not establish recovery.
- Legacy-only activity leaves rollout unknown; one iOS build leaves web and unobserved signal coverage unknown.
- Signed received/rendered reports, server completion and WebKit termination remain distinct. No crash or full success-rate claim is added.
- Transitive team accounts and anonymous reports from their exact mapped install are excluded unless selected; snapshots contain no PII/identifiers.
- Verified wallet receipt/presence/heartbeat recovers authenticated health without inventing account identity or counts; anonymous signed receipts and presence cannot clear authenticated failure. The optional-auth writer has one signature (the unpublished old overload had zero SQL dependencies and was removed without CASCADE).
- Invalid cache payloads do not break the live RPC; authenticated and anonymous recovery cohorts are tested separately, including anonymous reports after authenticated recovery.

Synthetic local scale: **41 ms** for the complete additive live RPC with 110,000 retained client events, 2,000 fresh reported installs and six platform/build cohorts. The recent windows correctly exclude 100,000 historical events. This is a local database sample, not production endpoint, device, crash or capacity evidence.

## Read optimization evidence

Recent aggregation materializes only the indexed last24h source. Historical latest values use a NOT MATERIALIZED filtered source with ordered LIMIT1 probes per platform/kind/build. Separate global/private verified-receipt indexes bound health probes; no table columns, JSON schema, build limit or retention policy changed.

An independent comparison used the exact same 110,006-event fixture (10,000 recent, 100,000 historical plus six old-only receipt/render/WebKit events), 2,000 installs and eight platform/build cohorts inside one fixed-clock transaction. The **entire before/after JSON was identical**, including old-only per-kind timestamps, historical-only build latestReportAt and authenticated recovery supported by an old verified receipt.

| Same fixture | Before | After |
| --- | ---: | ---: |
| Three full-RPC wall-time samples | 319/340/328 ms | 44/43/44 ms |
| Median full-RPC wall time | 328 ms | 44 ms |
| EXPLAIN database execution | 338.506 ms | 44.585 ms |
| Shared buffer hits | 6,553 | 419 |

Median improvement is 86.6%. `sql-performance.json` contains the full plans. Recent24h, historical platform/kind, historical platform/version/build and private verified-receipt probes use indexed timestamp bounds; the private receipt probe uses its partial verified-auth index. Five permanent historical-only assertions additionally preserve old timestamps/builds and recovery without inflating recent counters. The final changed telemetry suite passed170checks; the immutable phase1 suite was not repeated.

Console evidence is saved alongside this report. Run `scripts/test-client-telemetry-pg.mts` after the prepared local base plus `scripts/test-admin-r2-pg.mts`; remote DATABASE_URL hosts are rejected.

Current Supabase changelog/security guidance was checked before implementation; the relevant PostgreSQL17.11 upgrade note does not require a schema adjustment here. [Supabase securing the Data API](https://supabase.com/docs/guides/api/securing-your-api), [PostgreSQL minor upgrade note](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
