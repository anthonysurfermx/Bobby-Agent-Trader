# Independent backend read-path review — 2026-10-03

Read-only review of `api/admin.ts`, `api/_lib/admin.ts`, `api/_lib/admin-read.ts`, their identity/rate-limit dependencies and instrumentation emitters. No application files modified.

## Findings resolved by backend owner and independently rechecked

1. **P1 — Request deadline does not bound authentication.** `withAdminRead` only installs AsyncLocalStorage context; `dispatch` awaits `requireAdmin` before its try/catch. That helper awaits `requireIdentity`, whose identity upsert fetch/body has no timeout. A slow or stuck upsert can hold every admin GET past its nominal 15-second budget until the platform timeout. Bound and abort the admin identity path and initial limiter against the same request deadline, and retain one response. An outer Promise race alone risks a late auth response after a timeout reply.

   Reproduced with a completely offline fetch mock: `withAdminRead(...,{budgetMs:20})` plus a 130ms identity upsert returned only after **149ms**, status503. Script: `/private/tmp/dashboard-review-repro.mts`.

2. **P1 — Incomplete Search Console days become observed zeroes.** The request uses `dataState:'all'`, but `gscQuery` drops response metadata; `searchConsole` fills absent days with zero and exposes source status ok. The provider explicitly returns `metadata.first_incomplete_date` to identify data still being processed, in America/Los_Angeles. Preserve that boundary as partial coverage and avoid asserting missing/incomplete days as finalized zeros, or request finalized data and label actual coverage. [Official Search Console API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

   Offline mock returned a yesterday row and `metadata.first_incomplete_date=today`: result today clicks0/impressions0, `meta.partial=false` and source statusok. Same offline reproducer.

3. **P2 — Purchase-start coverage is enabled without an emitter.** `INSTRUMENTATION.purchaseStart` changed from false to true. Repository search finds the event only in the API whitelist/client type declarations; neither web/native purchase flow nor `bobby-access` checkout emits it. Leave coverage false until an emitter is installed and verified, or make coverage explicit per platform.

## Contract checks without findings

- Live view forwards `{p_internal}` correctly, returns the SQL aggregate under `live`, and preserves source metadata.
- Members, overview, lifecycle and audience pass the selected team scope. Provider reports remain global aggregates; the UI must preserve their existing team-inclusive caveat.
- Required database RPC errors fail the endpoint. Optional growth/networks failure remains null with explicit metadata; diagnosis is withheld if growth is unavailable.
- Count headers no longer turn missing Content-Range into zero.
- App Store loading is separated from core views, bounded and batched; reports missing/unpublished stay null, and cache timestamps/partial days are surfaced.
- Metadata uses per-request AsyncLocalStorage; independent admins do not share mutable source records.
- Economics retains unverified/test membership categories and labels cost/ROI as recorded-only.

## Reverification after fixes

The backend owner added an optional admin transport to requireAdmin/requireIdentity and the initial limiter; fetch and response decoding now use the same deadline and cancellation context. The independent offline reproducer now finishes its 20ms request budget at 20ms with one status503 response, rather than waiting for the 130ms upsert. The owner's suite additionally exercises hanging auth/upsert fetch and decode phases and checks a single response after late completion.

Search Console now retains incomplete-date metadata and Pacific coverage. The same mocked partial provider response produces null clicks/impressions for the missing current date, meta.partial=true and source status=partial. A missing daily row is no longer asserted as zero. Purchase-start coverage is false pending a verified emitter. Reproducer source is saved as backend-review-repro.mts; these are offline checks, not external provider verification.

This review reports observed source paths and offline reproductions, not production behavior. Production read-only facts and SQL evidence were copied to the isolated worktree `docs/qa/dashboard-live-2026-10-03`.

