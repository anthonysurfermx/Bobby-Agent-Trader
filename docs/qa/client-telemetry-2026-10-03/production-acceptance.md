# Production acceptance: installed clients and dashboard joins

Prepared from `93871936ce1902e327a192c625c22d34ee523d33` on 2026-10-03. This procedure has not been executed. Publication prerequisites and local test evidence remain in [README.md](README.md); this document supplies the operational observations and bounded queries needed after approved publication. It does not authorize a deployment, upload, metered read, credential capture or production mutation.

## Freeze the evidence for one acceptance run

Use a private case sheet with aliases `IOS-A`, `WEB-SPA-A` and `WEB-STATIC-A`. Record UTC start/end, the operator's visible action, connection state, expected result, redacted SQL output, the matching dashboard snapshot time and the deployed/build provenance. Keep account UUIDs, install/session hashes and request UUIDs in a restricted trace sheet; do not copy them into the acceptance report. Never save a raw HAR, bearer, installation header, HMAC receipt, question or response text in shared evidence. A receipt in evidence is represented only by `receiptPresent: true/false` and its case alias.

Before the first case, record:

| Evidence | Exact observation required |
| --- | --- |
| Backend/web publication | Main commit, Vercel deployment identity and production alias resolved to that deployment; migration versions in the approved Bobby project `qbvdqkknnuweatptjohi`. Use implementation baseline `93871936` plus the reviewed privacy/preflight follow-up on this branch; freeze the final Git SHA immediately before approved publication. |
| Web artifact | Deployment's built asset provenance plus actual `app_build` reported by both SPA and static `/nucleo`. `VITE_APP_BUILD` can override the Git SHA; an unknown build cannot identify the deployed emitter. `/client-telemetry.js` is generated during the deployment build, so a local-file hash alone is insufficient. Use a fresh normal browser tab and establish that its actual JS/assets belong to the accepted deployment, including any service-worker update. |
| Native artifact | Approved archive/distribution record, source commit, bundle `xyz.bobbyprotocol.bobby`, `CFBundleShortVersionString`, `CFBundleVersion`, bundled Nucleo hashes and embedded privacy manifest. Match the installed physical iPhone to the TestFlight/App Store build record and record iPhone/iOS version. Source/simulator `1.6 (54)` is not an installed instrumented-release claim. A unique distribution build number must be separately approved. |
| Privacy | Capture the published `/privacy` first-party operational-report paragraph, its effective date, the exact distributed `PrivacyInfo.xcprivacy` and matching App Store Connect privacy answers. The corrected source declares Analytics for linked UserID/DeviceID/ProductInteraction, plus linked OtherDiagnosticData for the implemented WebKit process-termination report with AppFunctionality and Analytics; tracking remains false and tracking domains remain empty. Reconcile these declarations and the existing purposes with the actual distributed artifact before native distribution. Source does not prove current App Store answers. |
| Metered allowance | Name the approved QA accounts and approved request/USD cap. This procedure needs at most one Quick desk completion per instrumented surface, three initial successful cases total. Stop on failure rather than manually repeat a paid request. Lifecycle and dashboard observations need no model call. Do not buy/restore/refund or exhaust quotas to manufacture a negative case. |

Production preflight observed on 2026-10-03: `RATE_LIMIT_SALT` is present in Production; `REVENUECAT_PROJECT_ID` is missing despite a V2 key. The read-only verified RevenueCat project is `proj2d9c569b`, app `app25c54ce720`, bundle `xyz.bobbyprotocol.bobby`. Provider metrics remain unavailable until the correct project scope is configured through an approved publication action; never pick an arbitrary project or infer zero revenue. Only the two new migrations (`20261002231124_admin_truth_live_snapshot`, then `20261002235202_first_party_client_telemetry`) are candidates for approved MCP migration application. Thirty-one historical migration-version naming mismatches prohibit a blanket database push; do not replay or repair history as part of this acceptance procedure.

The source privacy correction uses Apple's [purpose definitions](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes) and [data-type definitions](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype): feature/audience analysis is Analytics, while the actual WebKit termination signal is technical diagnostic data. No native crash collection is implied. Apple's [App Store privacy details](https://developer.apple.com/app-store/app-privacy-details/) are a separate public declaration; those answers were not read or changed by this procedure.

An installed legacy iPhone build is a useful control: it must remain unmeasured by the client panel even when its server activity is observed. It cannot substitute for the instrumented build.

## Keep acceptance traffic out of customer counts

Use existing dedicated internal QA accounts/installations. Before the measured interval, verify the exact account and installation with query A below. Both must be in the internal graph; a shared network alone is not sufficient provenance for the test installation. Account/install pairing must exist if the procedure relies on transitive exclusion after logout. If the installation is new or unmapped, finish the separately authorized setup and verify exclusion before starting the case.

The owner-facing controls are **Usuarios → Tráfico interno**: `Emails del equipo`, account marks, installation switches and network exclusions. They write through `set-internal-emails`, `set-internal` and `set-device-internal`. The top switch is **Sin equipo** by default and **Con equipo** for QA observation. Do not remove QA marks to make the customer panel move. Opening an authorized admin session also marks its browser installation and network through `bobby_mark_admin_session`; consequently admin GETs are not pure database read-only operations. Use the owner's dedicated browser/network and check `internalMarkFailed=false` / `meta.sources.teamExclusion.status='ok'` before relying on exclusion.

The exact client filter is: a report with `identity_id` is excluded by `bobby_internal_identity_ids()`; otherwise it is excluded by `bobby_internal_device_hashes()`. These functions walk the bidirectional account↔installation graph, seeded by admins, manual account marks, listed internal emails, marked/admin installations and active team networks; `team_ignored` links are omitted. A telemetry-only installation does not create an access-device pairing itself. The signed-in access/outcome path must already have established that pairing.

`GET /api/admin?view=live` uses the customer scope; `&internal=1` includes QA. The raw SQL snapshot in query E is read-only and uses the same filter. The client panel exposes aggregates/builds, never request, receipt, account or installation identifiers. QA should change only the inclusive first-party counts, verified against its private rows; other real users can change totals concurrently, so an aggregate delta alone is insufficient proof.

Two deliberate exceptions must remain visible: rollout/signal coverage timestamps are global observations of instrumented builds, and the LLM/provider ledger includes team spend. QA can establish coverage and incurs real recorded cost even when customer counts exclude it. App Store, Search Console and provider aggregates are not made QA-free by the switch. Do not run fixtures, test scripts, handcrafted telemetry POSTs or direct writer RPCs against production to populate acceptance evidence.

## Perform the real transitions

Use the admin **Resumen → Ahora · app y web → Lo que reportan los clientes instrumentados** panel. Select **15 MIN**, then **1 H** and **24 H** to compare the corresponding SQL paths. Keep the admin tab visible; it refreshes every 30 seconds. Compare a snapshot only with a fresh SQL sample near its `snapshotAt`, not with an earlier/later live total. The `Versiones/builds que enviaron reportes` disclosure must identify the actual tested build. Coverage may remain partial and is not coverage of all installations.

| Case and physical action | Client/server evidence | Pass condition and boundary |
| --- | --- | --- |
| iPhone lifecycle: open exact instrumented build; leave it active for 35–45 s; sample presence; open Control Center and leave inactive for 35 s; resume; lock/go Home for at least 105 s; reopen. | Query C at each checkpoint: platform/build, sequence, foreground, capture/receive/expiry times and same-session boolean. Observe initial foreground, a later heartbeat, inactive heartbeat pause, background if delivered, and a new session on genuine background→foreground. | An active heartbeat advances only current foreground state. Inactivity need not send background or clear immediately. After background, either the accepted background closes presence or the last signal expires by its stored expiry. Reopening begins a new native foreground epoch. A missing suspended background is recorded as missing delivery, not a crash. |
| Web lifecycle, once for public SPA and once for static `/nucleo`: visible 35–45 s, switch away/hide for 105 s, return. Also navigate public SPA→`/admin` and back on the already internal browser. | Query C and browser Network inspector with sensitive data redacted. Genuine UI calls to `/api/client-telemetry` should return 204. Static reports are anonymous; authenticated SPA reports may have account identity. | Hidden/pagehide stops heartbeat; background or stored expiry clears reported presence; visible return reports foreground. SPA navigation is not another opening. `/admin` must not keep reporting public foreground/heartbeats; the final preceding-public background is allowed. Session continuity differs from native: web visibility transitions can reuse the page's session; account change creates a new session. |
| One approved Quick reading per surface while visible, after any consent/access preflight. | Privately obtain its request UUID from the browser desk request or bounded native SQL lookup B0. Query B joins start, received and rendered by that UUID and checks the same receipt/install/session/owner. For web, observe `telemetry` only in successful JSON or NDJSON `final.data`, then 204 received/rendered reports. On iPhone, verify the visible final card by a timestamped physical recording; query B supplies server receipt acceptance without requiring Release Web Inspector or exposing the token. | One started, one received and one rendered report for the case; one receipt UUID shared by received/rendered; intended platform, exact app build and expected account/null identity. A received report alone cannot pass presentation. A human recording proves this case's visible UI; a stored render ACK remains a client report, not proof of human reading. |
| Delayed presentation: in a separately approved reading, keep final content hidden/behind a product sheet or outside viewport until it is ready; then expose it. | Sample query B before exposure and after the actual visible frame; record UI state. | If the client actually parsed a successful receipt while hidden, received may exist while rendered is absent. Render must wait for current visible, unobscured final content. Native may cancel the read on background; if so classify it as interruption, not delayed-presentation success. No extra paid read is implicitly authorized. |
| Account change/logout while telemetry or an approved read is in flight; foreground again under QA account B or guest. | Query C compares session and account booleans; query B uses the old request UUID. Network/status evidence if available. Ensure both QA accounts and their shared install were already internal. | Old queued work/receipt cannot become a new-owner ACK. If an old ACK was accepted before the switch, it remains historical and must not be reported as a post-switch event. New Supabase identity can count as an account; guest and wallet-only authentication do not add a Supabase account count. Do not replay a token in production to demonstrate this. |
| Denied/failed/abandoned cases from a safe approved test environment or an already applicable real gate. | Query B must have no received/rendered ACK; redacted response/status and bounded server-outcome query D must agree. A native client-side consent/preflight denial can produce no desk request and no read_started at all. Close an approved in-flight request before final completion only if that case's metered budget permits. | No success receipt on server refusal/model failure/interruption. For a genuine server-observed disconnect, `read_abandoned` is distinct from `read_failed`; refund of the consumed allowance is independently checked. Do not induce a production provider outage, change a subscriber or consume reads to force a wall. A safe-environment result stays separate from production proof. |
| Offline/suspension expiry: after accepted foreground, remove connectivity or terminate the client normally; wait past stored expiry and one visible dashboard polling cycle. | Query C's `reported_active=false`, query E inclusive panel and real UI recording. | No report is invented while offline. Native has bounded RAM-only delivery and no later lifecycle retry; older/retried timestamps never grant a new 90-second lifetime. This case does not prove the OS killed a process or that the person was offline. |

WebKit process termination is optional physical evidence only if the actual `webViewWebContentProcessDidTerminate` callback occurs safely. `webview_terminated` must agree with that callback and retain reload behavior. Do not fabricate the event or call it a native crash. Native crash collection is absent in this source.

## Minimal bounded read-only SQL

Run these only with an authorized read-only SQL connection to the approved Bobby data project. Execute each sample in a **new** short `BEGIN READ ONLY` transaction; `now()` is frozen inside a transaction, so holding one open during the 90-second wait would invalidate expiry observations. Use the following wrapper around one query at a time:

```sql
begin read only;
set local statement_timeout = '2000ms';
set local lock_timeout = '250ms';
-- One query A, B0, B, C, D or E below.
commit;
```

Replace placeholders privately. Never put real parameter values or raw query B0 output in the shared report. If a query times out, keep the failure evidence; do not broaden to unbounded table exports.

### A. Confirm QA exclusion before the case

`QA_ACCOUNT` is the data project's `bobby_identities.id`, not the Supabase Auth user UUID. `QA_INSTALL_HASH` is the existing salted installation hash from the restricted QA inventory; do not reproduce the server signing/salting secret to obtain it.

```sql
with q as (
  select 'QA_ACCOUNT'::uuid account_id, 'QA_INSTALL_HASH'::text install_hash
), team as materialized (select * from public.bobby_team_nodes(true))
select
  exists(select 1 from team, q where identity_id=q.account_id) as account_excluded,
  exists(select 1 from team, q where device_hash=q.install_hash) as install_excluded,
  exists(select 1 from public.bobby_device_accounts a, q
         where a.identity_id=q.account_id and a.device_hash=q.install_hash
           and not a.team_ignored) as active_pairing,
  exists(select 1 from public.bobby_devices d, q
         where d.device_hash=q.install_hash) as access_install_known;
```

For a guest/static case require `install_excluded=true`. For signed-in cases require both exclusions. Use a previously paired QA account to validate logout/guest exclusion. No identifiers are returned.

### B0. Find one native correlation privately

Use only when the distributed app does not expose its request UUID in approved diagnostic tooling. Perform one case within the recorded interval. If this returns multiple candidates, the case is ambiguous: do not guess. The UUID returned here stays in the private trace sheet; query B returns only redacted facts.

```sql
select request_id
from public.bobby_client_events
where platform='ios' and install_hash='QA_INSTALL_HASH'
  and app_version='EXPECTED_VERSION' and app_build='EXPECTED_BUILD'
  and kind='read_started' and request_id is not null
  and received_at >= 'CASE_START_UTC'::timestamptz
  and received_at < 'CASE_END_UTC'::timestamptz
order by received_at desc limit 2;
```

Keep `CASE_END - CASE_START <= 10 minutes`. If a best-effort start was lost, the same bounded lookup may select `kind='read_received'`; record the start as missing rather than invent it. A start report means the desk attempt began after client preflight, not that the model completed.

### B. Join one request's client phases without exporting IDs

```sql
with q as (
  select 'PRIVATE_REQUEST_UUID'::uuid request_id, 'ios'::text platform,
    'QA_INSTALL_HASH'::text install_hash, 'QA_ACCOUNT'::uuid account_id,
    'CASE_START_UTC'::timestamptz lo, 'CASE_END_UTC'::timestamptz hi
), e as materialized (
  select x.* from public.bobby_client_events x, q
  where x.platform=q.platform and x.request_id=q.request_id
    and x.received_at >= q.lo and x.received_at < q.hi
  order by x.received_at limit 12
)
select count(*) filter(where kind='read_started') as started,
  count(*) filter(where kind='read_received') as received,
  count(*) filter(where kind='read_rendered') as rendered,
  count(distinct read_receipt_id) filter(where read_receipt_id is not null) as receipt_count,
  coalesce(bool_and(install_hash=(select install_hash from q)),false) as expected_install,
  coalesce(bool_and(identity_id is not distinct from (select account_id from q)),false) as expected_account,
  count(distinct session_hash)=1 as same_session,
  coalesce(bool_and(verified_auth),false) as authenticated_reports,
  array_agg(distinct app_version) as versions, array_agg(distinct app_build) as builds,
  min(received_at) filter(where kind='read_started') as started_received_at,
  min(received_at) filter(where kind='read_received') as response_received_at,
  min(received_at) filter(where kind='read_rendered') as presentation_received_at
from e;
```

Use platform `web` for browser cases and `NULL::uuid` as `account_id` for guest/static/wallet-only cases. The successful same-epoch case expects `started=received=rendered=1`, `receipt_count=1`, matching install/account/build and one session. Captured client order should also be examined privately if server delivery order differs; transport can reorder receipt phases. A lost best-effort report is an incomplete acceptance case, not an application crash. SQL stores the receipt UUID, **not its HMAC token**; token authenticity is enforced by the deployed API, and SQL cannot independently recompute it. Accepted ACK rows plus exact deployed API/migration provenance establish that path only if no service writer/synthetic inserts occurred.

### C. Sample presence state, heartbeat and expiry

Record this output before/after the physical transition. Obtain `PRIVATE_PREVIOUS_SESSION_HASH` privately with `select session_hash from public.bobby_client_presence where platform='ios' and install_hash='QA_INSTALL_HASH' limit 1`, immediately before the transition; do not export that value. On the first sample omit the `same_session_as_previous` expression. Native background→foreground expects false; ordinary web visibility transitions may remain true.

```sql
select platform,app_version,app_build,sequence,foreground,verified_auth,
  identity_id is not distinct from 'QA_ACCOUNT'::uuid as expected_account,
  session_hash='PRIVATE_PREVIOUS_SESSION_HASH' as same_session_as_previous,
  occurred_at,received_at,expires_at,clock_timestamp() as sampled_at,
  foreground and expires_at>now() as reported_active,
  expires_at=least(occurred_at,received_at)+interval '90 seconds' as bounded_expiry
from public.bobby_client_presence
where platform='ios' and install_hash='QA_INSTALL_HASH'
limit 1;
```

Use platform `web` and nullable account as appropriate. Heartbeat sequence/received time should advance around 30 seconds while genuinely active, without changing the current session; no heartbeat rows exist in `bobby_client_events`. The current-state row cannot reconstruct prior states: save each redacted sample at its checkpoint. After background delivery expect `foreground=false`; if the final event is suspended/lost, wait beyond the observed `expires_at` and require `reported_active=false`. Do not infer a guaranteed background delivery from source.

### D. Reconcile server outcome and retained read separately

The server outcome/read/LLM ledger do **not** store this request UUID. This is an independent account/install/time reconciliation, not an exact per-request join. Use a quiet QA interval containing only one intentional request; otherwise report ambiguity. Query B plus the signed response receipt supplies the exact successful-response→client-ACK bridge.

```sql
with q as (
  select 'QA_ACCOUNT'::uuid account_id, 'QA_INSTALL_HASH'::text install_hash,
    'ios'::text platform, 'CASE_START_UTC'::timestamptz lo,
    'CASE_END_UTC'::timestamptz hi
), outcomes as materialized (
  select e.event,e.detail from public.bobby_events e,q
  where e.platform=q.platform and e.surface='desk'
    and e.device_hash=q.install_hash
    and e.identity_id is not distinct from q.account_id
    and e.created_at>=q.lo and e.created_at<q.hi
    and e.event in ('read_done','read_failed','read_abandoned','wall_signin',
                    'wall_paywall','wall_level','desk_blocked')
  order by e.created_at limit 20
), reads as (
  select count(*) as retained_consumptions from public.bobby_reads r,q
  where r.platform=q.platform and r.created_at>=q.lo and r.created_at<q.hi
    and ((q.account_id is not null and r.identity_id=q.account_id)
      or (q.account_id is null and r.identity_id is null and r.device_hash=q.install_hash))
)
select event,detail,count(*) as outcome_count,
       (select retained_consumptions from reads) as retained_consumptions
from outcomes group by event,detail order by event,detail;
```

Use the same interval no longer than 10 minutes, intended platform and nullable account. Successful completion normally leaves one read; a server-refused or fully refunded abandoned/failed case should not leave its consumed allowance. A missing outcome is possible because outcome logging is best effort; a null result does not prove success or a zero failure rate. Ledger costs cannot be attributed to the request/account by SQL here: record the global bounded-period ledger independently and retain the approved cost allowance. A consumed credit never substitutes for receipt/presentation evidence.

### E. Read the actual scoped panel facts

```sql
with snapshots as (
  select false as includes_team,public.bobby_admin_live(false) as j
  union all
  select true,public.bobby_admin_live(true)
)
select includes_team,j->>'snapshotAt' as snapshot_at,
  j#>'{client,platforms,ios,presence}' as ios_presence,
  j#>'{client,platforms,ios,windows,15m}' as ios_15m,
  j#>'{client,platforms,web,presence}' as web_presence,
  j#>'{client,platforms,web,windows,15m}' as web_15m,
  j#>'{client,health}' as telemetry_health,
  j#>'{client,coverage}' as scope_and_limits
from snapshots;
```

This returns no client IDs/tokens. Repeat only at the required checkpoints; use `1h`/`24h` paths when comparing those UI selections. Match the admin response's `live.snapshotAt`, `live.includeInternal`, `meta.sources.live`, `internalMarkFailed` and visible source freshness. A 503/missing client source must remain an error/dash; it cannot pass as zero. Health `unknown` is not proof of uptime; `recovered` means later applicable evidence after a recorded failure, not restoration of lost signals. Do not intentionally cause a production outage to make the banner appear.

## Close the case with the narrow claim it supports

The publishable report records only case alias, commit/deployment, installed/build provenance, UTC interval, physical/UI observation, redacted SQL counts/booleans, scope/freshness and passed/incomplete status. Do not publish diagnostic IDs or receipt material.

A complete real-client case proves that the exact instrumented client performed the observed transition, the server admitted its bounded report/receipt binding, the expected private row joined correctly, and the appropriate scoped dashboard represented it. SQL alone cannot prove a real foreground frame, native suspension behavior, which App Store build was installed, human reading, native crashes, purchases or provider execution. A physical recording alone cannot prove authenticated storage/account exclusion. Keep both evidence sets joined by the private case trace.

Declare missing receipt/report, unknown build, wrong account, ambiguous correlation, failed exclusion or stale/error snapshot **incomplete**. These cannot be replaced by the already passing mocks/simulator tests or by a successful HTTP response. The original dashboard goal remains open until the approved deployed web and exact installed native build have matching real evidence; billing/provider acceptance remains its own gate described in the phase1 report.
