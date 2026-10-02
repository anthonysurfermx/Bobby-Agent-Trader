# Bobby build 53: weekly update and test-candidate handoff

2 October 2026. The first tested candidate was 1.5 (53). App Store Connect now confirms 1.5 already ready for distribution, so the signed test/update candidate is being prepared as **1.6 (53)**; build number stays 53. Apple [requires an incremental App Store version](https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version/) for a new version. Working branch `feat/pro-briefings-b53` at Claude base `2f81cfbf` plus local integration checkpoint `d0632c00` (no push/deploy). **Local test candidate; NO-GO to activate briefings in production.** No deployment, remote migration, provider spend, push, purchase, publication or additional distribution occurred.

## Current product behavior

- Weekly is the only periodic cadence: Monday 08:00 `America/New_York`, DST-aware. Legacy env values cannot enable morning/close work; SQL cancels legacy unsent work. Monday remains Monday on equity holidays, with truthful market-state labels. Preparation 07:30, readiness 07:59 and expiry 08:30 are proposed operational windows.
- Personal component first: consented queried assets and actual prior-week history. One NVDA question qualifies. A query does not imply ownership or portfolio profit. Explicit interests/general content are labelled fallbacks. Provider evidence uses a public fixed 17-asset universe; account memory never selects the shared prompt.
- Common market/agenda component second: source-backed upcoming events; absent history/agenda stays absent. No per-account complete LLM debate. Voice includes at most two personal assets plus common context, three segments and 1,200 total characters; full text allows six assets.
- Pro with verified positive-paid Production period only, without another charge or a price/product change. New private `bobby_brief_paid_periods` and `bobby_brief_is_paid_pro` restrict this feature at API/generation/delivery/audio boundaries. Global Pro benefits remain intact. Trials, Sandbox, grants and unknown proof are denied.
- iOS Profile exposes one weekly switch and memory controls. Report shows personal component before common market context. The existing NucleoNotch Thinking capsule is selectively integrated with real NDJSON stages, preserving auth headers and JSON fallback. MainActor delivery rechecks active request ID, account generation and consent so cancelled/old events cannot update a later analysis.
- Important macro events remain **off and incomplete**. The pure planner tests an exceptional confirmed Fed target-range change, with source provenance, dedupe and proposed finite caps. No collector, durable event queue, paid generation, opt-in or push delivery is wired. See [macro design](pro-market-macro-events.md).

## Finite local evidence

These suites overlap; do not add them into a unique-test total or call them production load.

| Check | Result | Evidence scope |
|---|---|---|
| Calendar | 138 passed | Pure fixtures: weekly window, holidays, DST, legacy exclusion |
| Content | 164 passed | Pure fixtures: history, two components, fallbacks and finite narration |
| Core | 237 passed | Local HTTP/2/mock providers; `/private/tmp/bobby-weekly-core-tests.log` |
| PostgreSQL | 634 passed | Real disposable local PostgreSQL, synthetic accounts/payments, repeated migration |
| API + PostgreSQL | 251 passed | Ownership, paid gates, trial/Sandbox/unknown rejection, no real synthesis |
| Worker + PostgreSQL | 147 passed | Finite local queues/budget/eligibility fixtures |
| Macro | 62 passed + strict TypeScript | Pure qualification fixtures, no network ingestion |
| Native integration | 107 passed, zero failures | Simulator: weekly UI + transport/HUD cancellation and account/consent changes |
| Production web build | Passed | `npm run build`, including source guard and API TypeScript; existing Rollup annotations/chunk-size warnings |

Release build for generic iOS device passed with signing disabled: log `/private/tmp/bobby-notch-release-device-build.log`. The app is at `/private/tmp/claude-501/-Users-mrrobot-Documents-GitHub-Bobby-Agent-Trader/702fbad9-091a-47cc-8525-aad91244f865/scratchpad/DerivedData-b53/Build/Products/Release-iphoneos/Bobby.app`. This is **unsigned**, not an installable TestFlight IPA or signed archive. Native integration evidence is `/private/tmp/bobby-notch-native-tests.log` (107 tests, zero failures, TEST SUCCEEDED). Final native Release recompile including credit bonuses also passed. Info.plist is 1.5 (53), iphoneos; codesign confirms the app is unsigned. XCResult: `Test-Bobby-2026.10.02_13-11-23-+0100.xcresult` under the same DerivedData Logs/Test. Active HUD visual verification remains unproven: CUA could observe the fixture home but native input failed; do not call the HUD visually tested. These checks do not establish APNs delivery, physical-device audio, actual provider cost, 100 daily users, 20 distinct simultaneous analyses or 100 simultaneous navigation users.

## Activation gates still open

1. Fix the original P1 device credential/receipt atomicity, pending autoplay cancellation and unbounded public snapshot fetches; then the P2 initial registration recovery and audio-retention regeneration. See [independent review](pro-market-briefings-review-2026-10-02.md).
2. Implement an authoritative billing evidence adapter. The new fail-closed gate correctly denies access with no paid proof, so the feature cannot yet serve real paid users.
3. Add native query-history collection with coherent App Privacy/versioned consent. Current backend capture is web-only; memory controls alone do not persist new iOS questions.
4. Approve retention/operational windows, resolve unknown-charge retry policy and coordinate atomic global spend caps; measure real cost before load ramps.
5. Verify Push capability, renew signing profiles, archive/export signed 1.5 (53), upload only after checks. Existing local Bobby profiles lack `aps-environment`; do not strip entitlement to manufacture a successful archive.
6. Stage the exact backend/migration/configuration and exercise real iPhone permission, push/tap, account switch, narration/background and purchase entitlement flows. Capacity/load remains a separate measured round owned by Claude; do not launch duplicate production traffic.

## Apple evidence

At approximately 12:08 UTC, Apple Developer and App Store Connect sessions were authenticated in the Codex browser. Bobby app ID `6804460489` shows iOS 1.5 ready for distribution. TestFlight's newest visible build is **1.5 (52)**, uploaded 1 October 2026 at 14:26 as rendered in the portal; state “Lista para enviar”. Build 53 is local and has not been uploaded. No new review submission, group change or publication was made.

Remote Apple Developer inspection confirmed `Push Notifications` unchecked for the exact Bobby App ID `xyz.bobbyprotocol.bobby`. A filtered screenshot is `/private/tmp/bobby-apple-push-disabled.jpg`. Anthony explicitly authorized activation and profile regeneration in the voice chat. Push was enabled, saved, and independently reread as checked with Save disabled. The existing Bobby App Store profile was regenerated, downloaded outside Git and installed. Embedded metadata matches the Bobby bundle/team, App Store distribution, `aps-environment=production`, `get-task-allow=false` and expiry 22 September 2027. This parse is not a standalone CMS signature-validation claim; signed archive/export verification is still underway. No other app profile was changed. The first archive attempt failed because a global manual-profile override also reached the RevenueCat Swift package; the retry applies signing only to the Bobby target, retaining the failure log. The key inventory also shows two existing team-scoped APNs keys: one Production and one legacy Sandbox & Production. No new key was created; reusing an authorized existing key still requires its securely available private material and an appropriate environment. No private key was read or printed.

## Dashboard credit-gift check

The requested route is `https://bobbyprotocol.xyz/admin#usuarios`. Local gift checks passed: API 166 (mocked auth/storage), PostgreSQL 151 (real isolated database), and final production web build. Dialog preserves/rejects negative or decimal inputs and synchronously blocks same-dialog double submit. Native bonus display now stays separate from base quota and Pro eligibility; native fixtures passed. Persistent server idempotency remains missing: the same request after a lost response adds twice, proven locally. Production UI requires a separate admin login in the browser; no authenticated remote grant or physical-iPhone consumption was verified. No real-person credits were granted. See [functional gift review](admin-grant-review-2026-10-02.md). The separate security audit has no final verdict in this handoff; changes here must be reconciled with its reviewed revision.

App Privacy was inspected live in App Store Connect: nine declared linked data types, including User ID, Device ID, Product Interaction and Other User Content, all for app functionality. No privacy declaration was changed. Before activating query retention/personalization, reconcile the actual collection/provider/retention behavior with those answers; current settings alone do not prove the implementation.

## Independent payment audit

The separate chat “Auditar seguridad de pagos” completed with NO-GO for expanding Bobby Pro sales. Its local/source/catalog evidence is recorded in the primary checkout `.ai/security/2026-10-02-codex-payments-answer.md`. It did not verify remote PR/deploy or execute a purchase. Reported material gates: RevenueCat Test Store entitlement acceptance (PR130 incomplete/remote state unknown), Stripe subscription continuing after account deletion, an alternate unmetered debate route, and out-of-order Stripe updates.

The new briefing gate is separate and stricter: an existing active entitlement cannot open briefings without matching verified positive-paid Production evidence. This contains those false-entitlement cases for this feature, **does not repair global Bobby payments**, and does not justify expanded sales. The authoritative proof adapter remains absent/off. Continue test signing/upload only; no publication, review submission or commercial expansion was authorized here.

## Signed test package completed

Archive and export succeeded at approximately 12:21 UTC. The current source/package is **1.6 (53)**, with Release APNs production and Debug development. The original tested unsigned 1.5 (53) was preserved separately. Final IPA: `/private/tmp/bobby-b53-release/export/Bobby.ipa` (86,977,363 bytes), SHA-256 `e1c87d529ab4948050e5c3cf5808e882b749a1956112a765a308d8c4ea6c7376`.

Archive: `/private/tmp/bobby-b53-release/Bobby-1.6-53.xcarchive`. Manifest: `/private/tmp/bobby-b53-release/release-manifest.json`. Native reviewer verified codesign on archive and extracted IPA, APNs production, correct team/bundle, Apple sign-in/App Group and `get-task-allow=false`, with no Release fixture files. Root independently read IPA Info.plist and recomputed its SHA-256. Signing profile/private files are outside Git; no profile UUID is embedded in tracked build settings.

Upload was started by root through Xcode export with `destination=upload`, preserving version/build (automatic management disabled). Log: `/private/tmp/bobby-b53-release/upload.log`. Xcode upload completed successfully at 12:24:05 UTC: `Upload succeeded`, `Uploaded Bobby`, `EXPORT SUCCEEDED`, exit 0. Portal processing/readiness and existing internal-group access are being checked separately; no new testers or publication/review submission occurred. Apple activation screenshot: `/private/tmp/bobby-apple-push-enabled.jpg`.

The human extended the test-delivery target to approximately 12:31:47 UTC. Apple processing duration is external; upload acceptance and readiness are separate gates. The requested production gift test remains pending a separate Bobby admin sign-in and explicitly identified QA account/finite grant; it does not block test signing/upload.

Portal evidence at approximately 12:25 UTC: uploaded **1.6 (53)** is visible under Build Uploads with state **Processing**, Apple build id `0019457a-e534-47b6-b10e-f4165bc4ab7c`. The existing **Founder** group is internal, has one existing tester (Anthony), and automatic distribution for Xcode builds. No new testers/groups/settings were added or changed. Before claiming installation availability, confirm this exact build appears in Founder's builds as Testing after processing.

## Physical iPhone smoke for this test build

Once TestFlight enables 1.6 (53), first verify the installed version/build, then run a single Quick BTC/NVDA reading and observe live Thinking stages and disappearance at completion. Cancel and start a new query; stale events must not return. Mute narration and background the app; audio must stop. Check Profile, save/reopen a reading and sign-out/account-switch isolation. Record actual observed results, never infer them from the simulator suites.

Gift display/spend needs the explicitly designated QA account and finite gift authorization still requested. Weekly backend, real paid-proof adapter, native query capture and macro delivery remain off/incomplete, so this test package does not establish an end-to-end Monday briefing. Do not purchase or delete a real account as part of the smoke.
