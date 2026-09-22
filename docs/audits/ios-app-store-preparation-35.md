# Bobby 1.2 (35): submission preparation, September 22, 2026

Native candidate update: the archive and phone installation described below are historical. The newer [optional-equipment candidate](ios-optional-equipment-35.md) supersedes them; the current identity is in the store handoff. Backend rollout evidence and unresolved release gates below remain applicable.

Status: **native candidate prepared and installed, production schema/backend deployed; distribution signing, account-lifecycle evidence and confirmed support ownership remain release gates.** Nothing was uploaded to App Store Connect or submitted for review by this work.

## Changes

- Public island names undergo server-side OpenAI moderation before publication. Rejections and service failures cannot approve content. Gallery, direct island reads and share previews require an approved, unrestricted island and do not cache new responses.
- Visitors can report a public island privately without signing in. Reports require a server acknowledgement; the app does not show success on a failed write. The report table is unavailable to anonymous/authenticated database roles. A hashed installation ID deduplicates reports; a later incident reopens the same entry.
- Visitors can block/unblock a creator on their device. Blocks persist across launches and island renames because share codes remain stable. The built-in Satoshi Nakamoto showcase is handled separately.
- The service-role publication function serializes with operator restrictions. Operators can review the private queue, withdraw islands, restrict/restore publishing permission and prune resolved reports. Restoration does not publish on the owner's behalf.
- Consent version 4 describes analysis and optional speech processing. The privacy manifest and store answers declare seven collected-data categories; no tracking. Both language versions of the policy explain voice, public islands, reporting and retention.
- Added support/community rules and a native support link. GitHub was verified public with issues enabled; an owner-confirmed monitored/private support channel is still pending.
- The keyboard closes after sending a question so the answer has room to appear.
- Replaced the desk's lazy card stack with a regular stack for its bounded set of sections. A long Spanish response triggered a sustained main-thread layout loop while scrolling (captured in `scroll-freeze-sample.txt`); the final UI run covers scrolling to the verdict and opening Trader Land directly afterward.
- Community safety uses an inline navigation title so the Spanish title fits.
- Prepared en-US/es-MX store copy, current screenshots, review notes, privacy answers and a rollout/operator guide. Version and build remain 1.2 (35).

## Verification

Evidence is retained under `output/app-store-ready-35/` (local, ignored by Git).

| Area | Result |
|---|---|
| Production web build and API TypeScript | Passed; `web-build-final.log` |
| Focused lint and privacy plist validation | Passed |
| New moderation endpoint/service checks | 37 passed, mocked network |
| Trader Land API regressions | 120 passed |
| Share preview regressions | 63 passed, including no-store withdrawal behavior |
| Existing iOS backend/account/debate checks | 322 passed (32 + 124 + 166) |
| Actual local PostgreSQL migration/permissions/concurrency | 15 passed |
| Production database migration | Applied via Supabase MCP to the verified Bobby project; report RLS and restricted grants confirmed |
| Production moderation provider access | Real OpenAI moderation request returned HTTP 200 and an unflagged result for the non-personal test text “Calm Harbor” |
| Production rollout | READY, commit `9c68c63`, deployment `dpl_7x4f49omCCK6KaY76LhszV2AEFFC`; seven API smoke checks passed |
| Native unit tests | 139 passed on iPhone 17 Pro simulator |
| Existing consent, voices, mute, onboarding and island UI regressions | 14 passed, English and Spanish |
| New block, return-home and unblock UI tests | 2 passed on iPhone 17 Pro Max simulator |
| Real analysis, scrolling, onboarding, Squad and showcase capture flows | 2 passed, English and Spanish, on the same final UI run |
| Store screenshots | 5 reviewed images per language; 10 original 1320 × 2868 RGB PNGs with SHA-256 manifest |
| Store metadata | All 13 text fields within their App Store Connect limits |
| Web support/privacy | Rendered and checked in English/Spanish locally and on the deployed production domain |
| Reviewer example questions | Bitcoin → BTC and NVIDIA → NVDA, both exact, no confirmation needed |
| Final Release archive | Succeeded; codesign verification passed; executable/dSYM UUIDs match |
| App icon | 1024 × 1024 source PNG, no alpha channel |
| Physical iPhone installation | Final archived app installed successfully; launch was refused by iOS because the phone was locked |

Final executable SHA-256: `957c9c4879495c96e98146926fb1df285d157a2a15c818ce815d8c57158d95f3`. Archive: `output/app-store-ready-35/Bobby-1.2-35.xcarchive`. This is a development-signed local candidate; distribution export is blocked by the missing account/certificate.

The original native run retained two failed UI tests: the first automation selector matched duplicate SwiftUI confirmation elements. The next run resolved that selector and exposed an incorrect test assumption that blocking left the archipelago open. The app correctly returned to the practice island. The final test follows that return, reopens the archipelago and verifies unblocking; both languages passed. Original failed result bundles remain available alongside the successful rerun.

Screenshot capture uses the real app UI and actual public market/debate responses. It does not inject a made-up analysis, balance, account, public user or XP award. `-store-shots` only hides Debug performance telemetry that is absent in Release. The island capture uses the bundled showcase, without the community test fixtures. Initial captures containing keyboard/gear overlays are retained only in the original result bundle; the final store folder is replaced with reviewed captures.

The intermediate `store-final.xcresult` run was deliberately interrupted after reproducing the Spanish scroll freeze; it is not a successful test result. The replacement run, `store-and-community-verified.xcresult`, passed all four tests with zero failures: two community flows and two store capture flows. Final store captures enter Trader Land through the ordinary `desk-land` control, without a preview route. The extra verdict images duplicated the analysis composition and were excluded from the store folder, while their originals remain in the result bundle.

Across the successful runs, 157 distinct native tests and 557 backend/database checks passed. These totals combine the documented runs; they are not a claim that the first run passed or that production signing/account deletion has been tested. The final native candidate replaced the earlier build 35 on the physical iPhone 17 Pro. `phone-install-final.json` records the successful installation; `phone-launch-final.log` records the locked-device launch refusal. No real account was deleted for testing.

Production had the separate PTS relay commit `89464bc`; it was merged before deployment, followed by a successful build/API typecheck. `.vercelignore` now excludes native archives, local output and environment files from web deployment. Supabase MCP recorded the migration as `20260922114536_trader_land_moderation` in `qbvdqkknnuweatptjohi`, matching the deployed environment URL. Production contained seven private islands and no public islands, so the pending-review default did not remove existing public content. The production smoke checks include gallery reads, missing-island handling, invalid/missing-target reports, authentication for publication and the preserved PTS endpoint. They did not create or delete a user account or publish a test island.

## Remaining external work

1. Configure the four `APPLE_SIGN_IN_*` server variables using a verified Sign in with Apple key. A read-only Vercel Production environment-name check found all four absent. Do not infer the key's purpose from its downloaded filename.
2. Sign in with an explicitly designated test Apple account on the physical phone, verify the authenticated island publication/report/withdrawal flow, then delete that test account. The owner's real account has not been deleted or altered for this preparation. Mock tests do not replace proof of actual Apple token revocation.
3. Resolve Xcode's `No Accounts` / missing `iOS Distribution` signing error. The successful development archive is not a distribution IPA. App Store Connect also opened at its sign-in screen, so online build-number availability, metadata, privacy and legal fields have not been verified or saved.
4. Confirm who handles reports/support and the private privacy contact, verify the processed build in TestFlight, then submit only after the owner authorizes the actual submission.

See [the complete handoff](../app-store/build-35/README.md), [privacy answers](../app-store/build-35/APP-PRIVACY-ANSWERS.md) and [moderation runbook](../app-store/build-35/MODERATION-RUNBOOK.md).
