# Web client telemetry: local source evidence

## Instrumented surfaces

- React starts the first-party runtime in `src/main.tsx`. Public SPA navigation preserves one foreground session; `/admin` and local development are excluded by default.
- Static `/home`, `/nucleo` and `/nucleo/onboarding.html` use `public/client-telemetry.js`, built from the same pure runtime without Supabase or an analytics SDK. Historical `/api/track` visits are unchanged.
- React Núcleo consumes the signed desk receipt from JSON or NDJSON `final.data`; static Núcleo consumes the same successful JSON contract. Both send `read_received` separately from `read_rendered`.
- Presentation requires a post-commit frame of final response text/verdict within the viewport, visible ancestors, no product sheet, and an unobscured hit-test. DOM, transition, visibility and scroll observers can resume after a long modal. Static non-interactive text is synchronously probed and restored before painting.

## Ordering and bounded delivery

- One random installation key is shared by access requests and reports. When storage is unavailable, its fallback stays stable for the page lifetime.
- Foreground/heartbeat/background are ordered within a random session. Heartbeat runs every 30 seconds while visible; `pagehide` suspends it until `pageshow`.
- Captured timestamps are strictly monotonic within the page lifetime, including identity changes and backwards wall-clock changes. A retry retains its original ID, sequence and captured timestamp.
- Credentials are acquired at send time, never queued. Account/wallet credential changes discard old queued reports, abort in-flight work and invalidate previous response receipts.
- Queue capacity is 20, with heartbeats expendable first. Each attempt has a 4-second deadline including credential acquisition; network errors, 408, 429 and 5xx receive one retry. Other 4xx are not retried. Failed delivery after that bound, overflow and page termination can lose reports; there is no indefinite offline replay.
- Version/build come only from configured deployment values. The static build accepts `VITE_APP_BUILD` or `VERCEL_GIT_COMMIT_SHA`; it never reads a dirty local Git HEAD. Missing version/build stays unknown.

## Dashboard interpretation

The additive client panel labels 90-second presence, starts, receipt confirmations and presentation as client reports from instrumented cohorts. Per-platform and per-build channel coverage remains explicit; an unobserved channel displays a dash. Older clients remain unmeasured. A stored zero alone does not establish coverage. Native crashes, human reading, all-user online presence and a global success rate remain unmeasured.

Source health distinguishes an observed failure, authenticated recovery after a failure, and unknown health. Recovery does not restore signals lost during the incident. Fixtures remain visibly marked as fictitious data.

## Local checks

- `node --import tsx scripts/test-client-telemetry-ui.mts`: 59 checks passed, including actual desk JSON/NDJSON transport, pure runtime ordering/retry/isolation, visible-frame occlusion/resumption, static bundle execution, installation fallback, legacy/partial normalization and provider count preservation.
- `node nucleo/tests/web-transport.test.mjs`: 107 passed, 0 failed.
- `tsc --noEmit -p tsconfig.admin.json`: passed.
- A temporary scoped TypeScript configuration for the pure runtime, static entry and installation helper passed.
- A wider scoped check importing the full React Núcleo dependency graph reaches existing type errors in `MascotScene.ts`, `useBobbySession.ts` and `base-swap/calldata-guard.ts`; these files were not changed by the telemetry work.

These checks use local/scripted responses and do not establish deployed ingestion, account persistence in production, or installed iPhone behavior. The next acceptance step is a known deployed commit and instrumented installed build, observed real foreground/background and final response presentation, and matching server/dashboard rows. No production telemetry or paid analysis was generated for these local checks.

## Build integration

Run `node scripts/build-client-telemetry.mjs` before Vite copies `public`. Regenerate static HTML with `python3 nucleo/build.py --web` when its source inputs change. Keep the root package/Vite/CI integration and immutable deployment provenance with the release owner.
