# Bobby 1.2 (35): App Store handoff

Prepared September 22, 2026. This replaces the build-34 metadata. **Preparation is not App Store submission.** Keep version 1.2 and build 35, as requested. App Store Connect must confirm that this build number is still available before uploading.

## Package

- `metadata/en-US` and `metadata/es-MX`: name, subtitle, description, keywords, promotional text and What's New. Paste plain text into the matching App Store Connect fields.
- `metadata/app-review-notes-en.txt`: the reviewer walkthrough, including optional Apple login, deletion, voice mute and community controls.
- `APP-PRIVACY-ANSWERS.md`: seven data categories to enter and verify in App Privacy. No tracking.
- `screenshots/<locale>`: five reviewed, original, full-resolution iPhone 17 Pro Max screenshots per language (ten total). Do not use old microphone/live-call screenshots.
- `MODERATION-RUNBOOK.md`: production rollout, report review and withdrawal procedure.
- `verification/`: archive identity and the final four-test English/Spanish UI result summary.
- Local build and test evidence: `output/app-store-ready-35/` (ignored by Git).

The final Release archive is `output/app-store-ready-35/Bobby-1.2-35.xcarchive`. Its executable SHA-256 is `957c9c4879495c96e98146926fb1df285d157a2a15c818ce815d8c57158d95f3`. The executable and dSYM both have UUID `C6D5B488-2F81-3D52-A33E-3AC44B6BFD4D`. Use this identity to distinguish the new candidate from the earlier phone build, which also displays 1.2 (35). Archive verification confirms 108 bundled voice files, seven privacy categories and no microphone permission.

The native candidate restores the three onboarding steps, machine audio, 18 companions with 108 bundled English/Spanish style clips, persistent narration mute, archipelago navigation, island naming/sharing, and the permanent Satoshi Nakamoto showcase. This preparation adds reports, persistent creator blocks, moderation before publication, consent version 4, support and current privacy disclosures.

Suggested screenshot order in each locale: analysis debate (`04`), companion selection (`01`), style selection (`02`), Squad (`03`), Trader Land (`05`). Keep the same order in both languages. The extra verdict capture repeated the analysis view and is excluded from the store package; the original remains in the local result bundle.

Verification records 157 distinct native tests passing across the unit, release-readiness and final UI runs, plus 557 backend/database checks. The final four-test run passed both languages for community controls and the real analysis-to-Trader-Land flow, including the repaired Spanish scroll freeze. Earlier failures and the interrupted reproduction are retained in the audit; these totals do not imply one clean run or production account-lifecycle coverage.

## URLs and store fields

| Field | Value |
|---|---|
| Bundle ID | `xyz.bobbyprotocol.bobby` |
| Version / build | `1.2` / `35` |
| Privacy URL (English) | `https://bobbyprotocol.xyz/privacy?lang=en` |
| Privacy URL (Spanish) | `https://bobbyprotocol.xyz/privacy?lang=es` |
| Support URL (English) | `https://bobbyprotocol.xyz/support?lang=en` |
| Support URL (Spanish) | `https://bobbyprotocol.xyz/support?lang=es` |
| Marketing URL | Leave empty until its older promotional screenshots are replaced. |
| Review sign-in | Optional Apple sign-in; core analysis and practice exploration require no account or reviewer password. |

URLs above describe the deployment target. The new support page and September 22 privacy text must be deployed and verified before submission. The existing public GitHub issue tracker is enabled and supplies the current support link; a monitored private support contact still needs the owner's confirmation.

Retain the existing category, price, territories and legal seller details unless the owner changes them. Complete the current age-rating questionnaire using the actual features: AI-generated educational market analysis, public user-generated island names/layouts, reporting and blocking, no messaging, no gambling, no purchases in this build. Do not invent legal contact, copyright owner, rights attestations or EU trader status. Verify the existing account's answers in App Store Connect.

## Release gates

- [x] **Production database:** applied `20260922120000_trader_land_moderation.sql` through Supabase MCP to `qbvdqkknnuweatptjohi`, after confirming the deployed `BOBBY_SUPABASE_URL`. Recorded remotely as `20260922114536_trader_land_moderation`. Verified report-table RLS, no anonymous/authenticated reads, and service-role-only publication.
- [ ] **Production backend and website:** deploy this candidate after the migration. Check `/support`, `/privacy`, moderation, reports and share withdrawal. Do not deploy the new handlers before the schema exists.
- [ ] **Apple revocation:** production currently does not list `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_CLIENT_ID` or `APPLE_SIGN_IN_PRIVATE_KEY`. Use team `QZRTV6CMTT`, client `xyz.bobbyprotocol.bobby`, and a verified Sign in with Apple key. Do not assume any downloaded `.p8` is the correct key. Keep all values in the server's secret environment, never Git or the app.
- [ ] **Account lifecycle on a real iPhone:** use an explicitly designated test Apple account, sign in, complete a read, relaunch, confirm saved progress, then delete. Verify database deletion and `appleRevocation: "revoked"`; Bobby should disappear from Apple's connected-app list. Never delete the owner's everyday account for QA. Network-failure and cancellation paths must remain retryable.
- [ ] **Moderation ownership/support:** assign a person to review the queue daily and respond to urgent reports promptly. Confirm a monitored public support contact and private privacy channel. The prepared software does not mean an operator has been assigned.
- [ ] **Distribution signing:** add the authorized Apple Developer account in Xcode Settings → Accounts and obtain the correct distribution certificate/profile. The export preflight failed with `No Accounts` and missing `iOS Distribution` certificate. A development-signed archive is not an App Store IPA.
- [ ] **App Store Connect:** confirm build 35 is unused, upload the distribution export, wait for processing, verify privacy/age-rating/contact/rights fields, attach both screenshot sets and review notes, and select this exact build. No online fields have been saved by this task.
- [ ] **Final TestFlight check:** verify this processed build on the phone in English and Spanish, including mute across relaunch, machine sound, 3/3 styles, the showcase and a real report on a designated test island. Then obtain the owner's go-ahead to submit for review.

## Rebuild and export

From the repository root, with Xcode and XcodeGen installed:

```sh
npm run build
xcodegen generate --spec ios/Bobby/project.yml
xcodebuild -project ios/Bobby/Bobby.xcodeproj -scheme Bobby \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath output/app-store-ready-35/Bobby-1.2-35.xcarchive archive
xcodebuild -exportArchive \
  -archivePath output/app-store-ready-35/Bobby-1.2-35.xcarchive \
  -exportPath output/app-store-ready-35/app-store-export \
  -exportOptionsPlist ios/Bobby/ExportOptions-External.plist \
  -allowProvisioningUpdates
```

Use a new archive path for subsequent builds to retain the verified candidate. Export options disable automatic build-number changes and use `app-store-connect`; they do not upload or submit automatically. Distribution signing must be resolved first. Do not upload an older archive merely because it exports successfully.

Apple references: [user-generated content](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [privacy disclosures](https://developer.apple.com/app-store/app-privacy-details/), [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). The 1320 × 2868 RGB PNG captures meet the 6.9-inch screenshot dimensions and contain no alpha channel.
