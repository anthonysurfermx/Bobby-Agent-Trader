# Admin compass calibration

The overview opens with one selected operational window, one platform comparison, four business indicators, and three collapsed priorities. Definitions, evidence, build coverage, provider details, and historical breakdowns remain available on demand. The mobile view must expose every operational metric without horizontal page scrolling.

## What each number establishes

| Signal | Source | Interpretation |
| --- | --- | --- |
| Cupo usado | `bobby_reads` | Registered consumption of the allowance; does not prove emission or delivery. |
| Emitidas / fallos servidor | `bobby_events` | Server outcomes that were recorded; best-effort instrumentation does not establish exhaustive failure coverage. |
| Recibidas / presentadas | First-party client reports and signed server receipts | Observed reception or visible presentation in instrumented clients; does not establish human reading. Android client acknowledgements remain unmeasured. |
| Cuentas e instalaciones | Account and installation records | Distinct observed identifiers; accounts and installations are not distinct people. |
| Pagadores verificados | Production purchase ledger | Confirmed production charge, excluding trials, sandbox, gifts, and unknown access. Provider subscription totals have their own scope. |
| Gasto IA | Recorded provider usage and price ledger | Registered model cost, including the team; not a reconciled provider invoice. |
| Descargas Apple | Daily Sales and Trends reports | Aggregate downloads with publication lag and team traffic. Cannot be joined one-to-one with observed installations. |
| Google Search | Search Console | Search performance with provider dates and publication lag; not current web presence. |

`—` means the source or observed coverage is unavailable. `0` means no records in the available observed coverage. Neither claims universal instrumentation. Server and client totals may cover different requests; they must not be divided into a success rate.

Invalid or omitted coverage/window dates cannot establish a measured count. Missing provider call, failure, or cost fields remain unknown, including inside the collapsed diagnostics.

## Refresh behavior

- Live server/client aggregate: every 15 seconds while the tab is visible.
- Core business metrics: every 30 seconds while visible.
- External providers and period comparison: every five minutes while visible.
- Search Console's successful cache retains its original fetch date and a declared 30-minute TTL. Apple retains per-report dates and its oldest cached-report date. Provider publication lag remains separate from polling cadence.
- Returning to a hidden tab consults sources that are due. Manual refresh forces a new request. Requests for the same key do not overlap; changing scope/range invalidates late responses.
- A due refresh on returning to the tab restarts its polling interval. GET deadlines also cover credential acquisition and response parsing, so a stalled session cannot permanently block later refreshes.
- Failure retains the last observed values with an explicit stale/error state; cached data is not relabeled as newly fetched.

## Publication order

1. Verify the current production SHA and migration registry. This branch was based on `e128cca095562049705cbb65cf07cdb9af501b64`.
2. Confirm the existing truth/live and first-party telemetry migrations are installed before applying `20261004205520_admin_compass_android.sql`.
3. Apply that migration before serving the new backend. It replaces three read-only aggregate functions, preserves service-only execution, adds Android server/cohort coverage, and recognizes `desk_entered` without fabricating a read. It does not change payment or access tables.
4. Publish the reviewed application and wait for the deployment to be READY. The review branch has automatic Vercel deployments disabled.
5. Verify the served SHA, authenticated overview/funnel/integrations, internal/external filters, all three operational windows, source dates/errors, mobile layout, and deployment-window failures.
6. The first-party client ingestion flag is a separate owner decision: `BOBBY_CLIENT_TELEMETRY=on`. Changing it starts storage of pseudonymous client lifecycle/reception/presentation reports in Bobby's existing database. Follow the existing privacy notice and retention rules. A successful HTTP response alone is insufficient evidence of stored reports.
7. After authorized activation, verify a real stored report, a signed receipt, a visible presentation, expiry of foreground presence, internal exclusion, and coverage from the actual distributed iOS build. Android reception/presentation requires Android instrumentation.

## Remaining source boundaries

- No direct Play Console acquisition report is connected to this dashboard. The Android funnel starts with observed installations.
- Native crash analytics and provider billing reconciliation are separate sources, not inferred from server success or telemetry.
- Google Play webhooks (`PLAY_STORE`; customer API `play_store`) are recorded before membership reconciliation. Subscription provider/mirror and paid classification currently cover Apple/Stripe; they need a separate schema and commerce lifecycle review before treating Android as financially covered.
- Amplitude forwards the same underlying records; it is not independent confirmation. Vercel Analytics is linked as an external dashboard and is not ingested as an independently verified source here.
- First-party outcome and model-cost writes are best effort. Their absence cannot establish that no failure or cost occurred.

Local regression checks and fixture screenshots verify the proposed behavior. Production calibration remains pending until the migration, deployed UI/API, actual source state, and installed clients are verified together.
