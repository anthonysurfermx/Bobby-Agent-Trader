# Bobby 1.7 (63) independent release QA review

**Verdicts**
- **Local code: conditional GO.** I found no P0–P2 product defect in the source I read at `be3e8b13`. It is not an "all suites green" GO: StoreShots has 3 official failures outstanding.
- **Release acceptance: NO-GO.** StoreShots is red, store metadata readback is incomplete, and nothing has been uploaded or tested on hardware.

**Scope limit you must weigh first.** The Workflow launched as specified (run `wf_c3e09282-83c`, two read-only reviewers, `claude-opus-5-5` named on both, at most 2 concurrent, no substitution). Its results had not been returned to me when I had to finalise for the deadline. Nothing from the reviewers is included or assumed, and no consolidation of their findings took place. Everything below is my own direct read-only inspection on the same model. Backend receipts (PostgreSQL, Anvil, lock build) and three of the four retained P3s were in the reviewers' scope and are unverified here.

## Ranked findings

| # | Severity / class | Location | Trigger and evidence | Fix | Status |
|---|---|---|---|---|---|
| 1 | Blocker, operational | `evidence/ui-serial-results.json:654-720`; `evidence/StoreShots-summary.json:1`; `evidence/ui-serial-driver-status.json:4` | StoreShots official result is Failed: 5 total, 2 passed, 3 failed (`test02`, `test03`, `test04`, each "XCTAssertTrue failed"), exit 65, driver `halted-needs-diagnosis`, `complete:false`. It was not "still executing"; it finished at 12:46:58Z. | Commit the test-only repair, rebuild the UI test bundle, rerun the whole class to 5/5, keep the failed receipt. | Verified in receipt |
| 2 | Blocker, evidence | `snapshot-manifest.json:4132-4136`; `evidence/native/StoreShots-consent-harness-remediation.json:4-8,20-21`; `ios/Bobby/UITests/StoreShots.swift:98,128,176` | The repair exists only as an uncommitted `working-tree-test-only-override`; its hash `2e9837c8…` matches the remediation receipt's `afterSHA256`. No rerun receipt is in the snapshot. HEAD `be3e8b13` does not contain it. | As #1; re-bind the manifest to the new commit. | Verified in receipt and source |
| 3 | P2, operational | `evidence/store-localizations/app-store-metadata-saved.json:19-28`; `metadata-final-applied.json:76,83` | Fresh-reload readback is complete for en-US only; the other five are pending. Name, subtitle and privacy URL are "not yet updated in remote AppInfo". `savedInAppStoreConnect:false` contradicts the same file's "saved through Safari by root". `spanishGrammarPolishApplied:true` means the saved es-MX text may differ from the local draft. | Finish the five readbacks and AppInfo; diff remote text against local files; fix the contradictory flag. | Verified in receipt; remote state unverified |
| 4 | P3, evidence | `snapshot-manifest.json:2`; `app-store-metadata-saved.json:2` | Both metadata receipts are absent from the manifest. One is stamped 12:50:31Z, after the manifest (12:48:57Z) and after review start, so the evidence folder was not frozen. | Regenerate the manifest once root finishes. | Verified |
| 5 | P3, evidence | `evidence/chart-timeframe-report.md:5`; `evidence/support-subtitle-report.md:3`; `evidence/native/retry-log-receipt.json:5-15` | The P2-a/P2-b reports bind to a modified worktree on `393776c3`, not the candidate. At `507616c9` the native P2-a test `testChartCandleMetadataUsesItsProviderIntervalForEveryAnalysisHorizon` failed (533/534, 8 assertion failures, exit 65). I did not confirm its case identity in the 536 receipt or inspect the `ecc4ff49` spy repair. | Re-run the 165 / 280 / 339 groups at the final commit; confirm the case node and that assertions were not relaxed. | Partly verified |
| 6 | P3, product | `ios/Bobby/Nucleo/src/shared/20-read-model.js:741-743`; `nucleo/src/shared/20-read-model.js:589-591` | `aligned = !r.candlesTimeframe || …` fails open. A reply or saved reading without candle metadata and a 4H/1D/1W horizon still labels hourly candles with the analysis timeframe and draws overlays. The report acknowledges this (`chart-timeframe-report.md:23`). | For legacy replies, infer the interval from candle spacing or gate when the horizon is not 1H. | Verified in source |
| 7 | P3, product | `ios/Bobby/Nucleo/src/shared/20-read-model.js:678` | Closed-volume uses a literal `3600e3`, not the declared candle interval. It is correct only because `NucleoDesk.swift:196` fixes candles at 1H. I did not read the web copy of this function. | Derive from `candlesTimeframe` or add a contract assertion. | Verified in source (iOS) |
| 8 | P3, copy | `ios/Bobby/Sources/Nucleo/NucleoDesk.swift:196`; `20-read-model.js:743-748,764-772`; `evidence/store-localizations/en-US/whatsNew.txt:1` | Candles are always 1H, so every 4H/1D/1W analysis shows no support, resistance, plan, band or bracket on the chart. What's New promises "clearer support and resistance labels" in the four locales I read (en-US, es-MX, it, pt-PT). | Confirm the default horizon; soften the copy if most readings are not 1H. | Source inference |
| 9 | P3, privacy UX | `ios/Bobby/Sources/Nucleo/NucleoSession.swift:499-523` (`:507`) | The only product call to `revokeAppleServiceConsent()` I saw is inside AI-permission withdrawal. Consent is granted separately but apparently cannot be withdrawn separately. | Add a Profile control or document the withdrawal path. | Inferred; my search output was truncated at 80 lines |
| 10 | P3, product (retained) | `api/_lib/trader-land-card.ts:88-91,94,100,105` | `withIslandMeta` only replaces existing tags. No `.html` in the snapshot contains `og:url`, `twitter:url` or a canonical link, so those calls are silent no-ops. Web sharing only. | Insert the tag when absent; add a test. | Function verified; template absence inferred |
| 11 | P3, product | `ios/Bobby/Nucleo/src/app/55-read.js:198,208-211` | Wrapping depends on `getComputedTextLength()` at build time. A hidden SVG or a pre-Geist fallback font gives a wrong measurement, and I saw no re-measure. Output is capped at two lines. | Re-measure after fonts load; test with Geist on WebKit. | Source inference |
| 12 | P3, retained | `tsconfig.api.json:111` | `api/stripe-webhook.ts` appears in the closing file array and my search found no `exclude` key in any tsconfig. That is not obviously consistent with "Stripe excluded"; TS2339 needs a compiler run. | Read the tsconfig head and run the API typecheck. | Unverified |
| 13 | P3, retained | — | Fixed-Spanish onboarding island heading; regional stock board ordering and Ferrari/Santander resolver. | — | Not investigated |
| 14 | Info | `evidence/ui-serial-results.json:8,46,84,122,184` vs `:234` onward | Five classes (16 methods) are bound to `a135d6e1`, nine to `be3e8b13`. This is acceptable only if the two are code-identical, which the manifest asserts (`snapshot-manifest.json:5`) and I could not re-hash. | — | Verified in receipt |

## Corrected regressions I confirmed in source
- **P2-a chart timeframe.**
  - The native transport declares the hourly constant and emits it with each result (`NucleoDesk.swift:196-202,932`).
  - Both read models gate technicals, plan lines, band and bracket on a case-insensitive match (iOS `20-read-model.js:741-748,764-772`; web `:589-596`).
  - The chart's as-of label comes from the last plotted candle (iOS `:761-763,778`).
- **P2-b subtitle wrap.** `55-read.js:195-218` (iOS copy) wraps into two tspans at x=296, 14 px apart, with a character-split fallback. The 126/126 delivered-HTML check is in `evidence/final-bundle-summary.json:16-26`. Its `app.html` and `onboarding.html` hashes equal the archived resources (`archive-verification.json:41,53`).
- **Speech consent enforcement.**
  - Without stored consent a non-on-device recogniser never starts (`NucleoSpeech.swift:183,294-295`).
  - The request is on-device-only exactly when the recogniser holds the model (`:261,298`).
  - Consent is stored only on an explicit Allow, and the default answer is false (`:92,212-213`).
  - The native alert runs before capture (`NucleoSession.swift:448-466`).
  - Withdrawal cancels speech and removes the consent (`:506-507`).
- **Store copy.** All six `description.txt:18` and `review-notes-en.txt:5` disclose the Apple speech-service fallback with separate consent. I found no "on-device only" or "never uploaded" wording in the lines I matched. These are local draft files; see finding 3 for remote state.
- **Privacy policy.** `src/pages/PrivacyPage.tsx:5-6,201` reflects the 1.7 fallback. I read only the tail of the paragraph at `:201`.

## Rejected false positives
- **Audio reaching Apple without consent through a race or locale fallback.** The guard precedes request creation and microphone open (`NucleoSpeech.swift:294-304`), and candidates must match the app-language locale exactly (`:234-236`).
- **Consent alert shown only in English or Spanish.** `L.t` resolves other languages through a translation table (`Localization.swift:121-126`), and the title has fr/pt/it/de rows (`NativeTranslations.swift:659`). I did not check the body string's row.
- **StoreShots failures are a product regression.**
  - `ContentView.swift:519-522` shows the notice gate is intended behaviour.
  - `test01` and `test05` passed in the same run.
  - The three failing methods lacked the launch override, and the persisted value was 0 after the privacy class withdrew it.
  - This is still unproven until 5/5. The "four unacknowledged disclosure buttons" claim rests on an activities file that is not in the snapshot, and only `test02` was extracted.
- **Stale tspans after re-render.** `55-read.js:197` resets `textContent` before measuring.
- **Gate fails open on lowercase or missing analysis timeframe when candle metadata is present.** The comparison is case-insensitive and an undefined horizon compares unequal (`20-read-model.js:743`).
- **The archive carries the test override.** It was built 12:34–12:37Z from `be3e8b13`; the test edit is 12:48:42Z and is a UI-test file.

## Count integrity
- **Native:** the summary shows 536 total, 536 passed, 0 failed, 0 skipped, 0 expected failures, on an iPhone 17 Pro simulator (iOS 26.1). I did not verify the 534 + 2 split or the QoS warning.
- **UI:** my recount of accepted classes is 2+2+2+6+4+14+2+2+10+2+3+2+1 = 52 methods in 13 classes. With StoreShots the official tally is 54 passed, 3 failed, 0 skipped of 57. The pending repair must not be counted.
- **Archive:** exit 0, verification and codesign passed, completed 12:41:55Z, production APS, `get-task-allow` false, 750 source inputs. The receipt itself says upload was not run and that UI acceptance, TestFlight and physical install are unverified (`completion-receipt.json:40-43`).
- **Archive verifier repair:** it now checks for no fixture assignment, no mock-bridge section and no `B.mock` install, and allows "inert reads of undefined fixtures". That looks reasonable but I did not read the build script.
- **Screenshots:** the save receipt (12:45:25Z, after reload) shows five files per locale (01–04, 06) and `buildAttached:false`. It identifies files by name only, with no content hashes, and they are historical captures, not build 63 renders.

## Required next actions
1. Commit the StoreShots repair, rerun the full class, and regenerate receipts and manifest at the new HEAD.
2. Complete metadata readback for five locales and AppInfo; diff remote against local, es-MX especially.
3. Confirm the P2-a native case in the 536 receipt and review the `ecc4ff49` spy change.
4. Re-run or have reviewed the areas I did not cover: PostgreSQL, Anvil, lock build, and the three remaining P3s.
5. Upload, TestFlight processing, and physical six-language, microphone, purchase/restore, sign-in and push checks remain separate gates.

## Limitations
- I ran no code, tests or hashing, inspected no pixels, and read nothing outside the workspace. Hash matches are string comparisons between receipts.
- **Not verified:**
  - PostgreSQL, Anvil and lock-build receipts.
  - Production schema checks and the live health SHA.
  - The native `-tests.json` and log.
  - The 12 per-class summary files other than StoreShots.
  - `final-artwork-manifest.json` and `assets-inventory.json`.
  - Promotional texts.
  - The Profile disclosure text.
  - The web copy of `55-read.js`.
  - The renderer and mutation tests.
- **Elapsed time:** I have no clock. I defer to the runner's recorded duration and do not claim a 15-minute review.

**Files I read:**
- Source: `NucleoSpeech.swift` (full), `StoreShots.swift` (full), and parts of `NucleoSession.swift`, `ContentView.swift`, `NucleoDesk.swift`, `Localization.swift`, `NativeTranslations.swift`, both `20-read-model.js`, the iOS `55-read.js`, `trader-land-card.ts`, `tsconfig.api.json`, `PrivacyPage.tsx`.
- Evidence:
  - UI and native: `ui-serial-results.json`, `ui-serial-driver-status.json`, `StoreShots-summary.json`, the native 536 summary, both StoreShots native receipts, `retry-log-receipt.json`.
  - Archive: both `archive63-r2` receipts and the fixture-verifier repair receipt.
  - Reports: `chart-timeframe-report.md`, `support-subtitle-report.md`, `final-bundle-summary.json`.
  - Store: `receipt.json`, the three saved/applied receipts, `review-notes-en.txt`, the en-US description, and matched lines of the other five descriptions and What's New files.
  - Manifest: the head and targeted entries of `snapshot-manifest.json`.

# Bobby 1.7 (63) independent release QA review — consolidated

This supersedes my earlier report. The Workflow has now returned, and I can't confirm whether this version falls inside the deadline (no clock access; defer to the runner's record).

**Verdicts**
- **Local code: conditional GO.** No P0–P2 product defect found in the source read at `be3e8b13`. It is not "all suites green": StoreShots has 3 official failures outstanding.
- **Release acceptance: NO-GO.** StoreShots is red, store metadata readback is incomplete, artwork provenance is weak, and nothing is uploaded or hardware-tested.

**Workflow status.** Run `wf_c3e09282-83c` completed: two read-only reviewers, both on `claude-opus-5-5`, max 2 concurrent, 0 errors, 180 tool uses, about 537 s. The harness truncated the inline result by about 112,000 characters. The full output is stored outside the isolated directory, which I am not permitted to read. Only the first five merged findings are consolidated here (four complete, one cut off); the rest must be retrieved from the run's output file. No third consolidation agent ran.

## Ranked findings

| # | Severity | Location | Evidence | Fix | Status |
|---|---|---|---|---|---|
| 1 | Blocker, operational | `evidence/ui-serial-results.json:654-720`; `evidence/StoreShots-summary.json:1`; `evidence/ui-serial-driver-status.json:4` | StoreShots official result: 5 total, 2 passed, 3 failed (`test02`, `test03`, `test04`), exit 65, driver `halted-needs-diagnosis`. Reviewer A reports the failing asserts at `StoreShots.swift:177`, `:101`, `:130` in the executed file. | Rerun the whole class to 5/5; keep the failed receipt. | Verified in receipt by me and both reviewers |
| 2 | Blocker, evidence | `snapshot-manifest.json:4132-4136`; `evidence/native/StoreShots-consent-harness-remediation.json:4-8`; `ios/Bobby/UITests/StoreShots.swift:98,128,176` | The repair is an uncommitted working-tree override (hash `2e9837c8…`). Reviewer B: the executed file hash was `e631a5cb…` (`evidence/native/ui-serial-source-binding.json:18`), and every class ran test-without-building, so the built test bundle cannot contain the edit. | Commit, rebuild the UI test bundle, re-bind, then rerun. | Verified in receipt (binding line is reviewer-reported) |
| 3 | P2, operational | `evidence/store-localizations/app-store-metadata-saved.json:19-28`; `metadata-final-applied.json:76,83` | Fresh-reload readback is done for en-US only. Name, subtitle and privacy URL are not yet in remote AppInfo. `savedInAppStoreConnect:false` contradicts "saved through Safari by root". A Spanish grammar polish was applied remotely, so es-MX may differ from the local file. | Finish readbacks and AppInfo; diff remote against local. | Verified in receipt; remote state unverified |
| 4 | P2, evidence (reviewer A) | `evidence/store-localizations/app-store-screenshots-saved.json`; `final-artwork-manifest.json`; `README.md:50-56` | The saved-store receipt has file names only, no hashes. Counts hold: 42 originals, 30 selected, 12 excluded. The manifest records `image_gen` origin; DE/FR/IT inner UI text was localised by image generation, and es-MX and pt-PT panels carry English inner UI. German artwork text predates current copy. | Add hashes; disclose; replace with real build 63 captures. | Reviewer-verified in receipt; not re-checked by me |
| 5 | P2, evidence (reviewer B, cut off) | `evidence/store-localizations/receipt.json:35` | No evidence that the live privacy page serves the 1.7 dictation text the listing links to. I confirmed `renderedPublicTranslationsChecked:false`. | Verify the deployed page in all six `?lang=` variants before submission. | Partly verified |
| 6 | P3, evidence | `snapshot-manifest.json:2`; `app-store-metadata-saved.json:2` | Two metadata receipts are absent from the manifest; one is stamped 12:50:31Z, after review start. The evidence folder was not frozen. | Regenerate the manifest. | Verified |
| 7 | P3, evidence | `evidence/chart-timeframe-report.md:5`; `evidence/support-subtitle-report.md:3`; `evidence/native/retry-log-receipt.json:5-15` | The P2-a/P2-b reports bind to a modified worktree on `393776c3`. The native P2-a test failed at `507616c9` (533/534). I did not confirm its case in the 536 receipt or inspect the `ecc4ff49` spy repair. | Re-run at the final commit; confirm assertions were kept. | Partly verified |
| 8 | P3, product | `ios/Bobby/Nucleo/src/shared/20-read-model.js:741-743`; `nucleo/src/shared/20-read-model.js:589-591` | The overlay gate fails open when a reply or saved reading lacks candle metadata. | Infer the interval from candle spacing, or gate when the horizon is not 1H. | Verified in source |
| 9 | P3, product | `ios/Bobby/Nucleo/src/shared/20-read-model.js:678` | Closed-volume uses a literal `3600e3`; correct only because `NucleoDesk.swift:196` fixes candles at 1H. Web copy not read. | Derive from `candlesTimeframe`. | Verified in source (iOS) |
| 10 | P3, copy | `NucleoDesk.swift:196`; `20-read-model.js:743-772`; `en-US/whatsNew.txt:1` | Every 4H/1D/1W analysis shows no support/resistance overlays, while What's New promises clearer labels. | Confirm the default horizon; adjust copy if needed. | Source inference |
| 11 | P3, privacy UX | `ios/Bobby/Sources/Nucleo/NucleoSession.swift:499-523` | Apple speech consent appears revocable only together with AI permission. | Add a separate control or document it. | Inferred (search truncated) |
| 12 | P3, retained | `api/_lib/trader-land-card.ts:88-105` | Meta tags are replace-only; no `.html` in the snapshot has `og:url`, `twitter:url` or canonical. Web only. | Insert when absent. | Function verified; template inferred |
| 13 | P3, product | `ios/Bobby/Nucleo/src/app/55-read.js:198,208-211` | Wrapping relies on build-time text measurement; hidden SVG or late Geist load gives a wrong width. | Re-measure after fonts load. | Source inference |
| 14 | P3, retained | `tsconfig.api.json:111` | `api/stripe-webhook.ts` appears in the closing file array; not obviously "excluded". | Run the API typecheck. | Unverified |
| 15 | P3, retained | — | Fixed-Spanish onboarding heading; stock board and Ferrari/Santander resolver. | — | Not consolidated (in truncated reviewer output) |

## Corrected regressions confirmed in source
- **P2-a:** hourly constant and result field (`NucleoDesk.swift:196-202,932`); case-insensitive overlay gate (iOS `20-read-model.js:741-748,764-772`; web `:589-596`); as-of label from the last candle (`:761-763`).
- **P2-b:** two-tspan wrap at x=296 (`55-read.js:195-218`). The 126/126 delivered-HTML check (`evidence/final-bundle-summary.json:16-26`) covers files whose hashes equal the archived resources (`archive-verification.json:41,53`).
- **Speech consent:** no server recognition without stored consent (`NucleoSpeech.swift:183,294-298`); stored only on explicit Allow (`:92,212-213`); withdrawn with AI permission (`NucleoSession.swift:506-507`).
- **Store copy:** all six `description.txt:18` and `review-notes-en.txt:5` disclose the Apple speech fallback. These are local drafts.

## Rejected false positives
- **Audio to Apple without consent:** the guard precedes request creation and microphone open (`NucleoSpeech.swift:294-304`).
- **Consent alert English/Spanish only:** other languages resolve through the translation table (`Localization.swift:121-126`, `NativeTranslations.swift:659`).
- **StoreShots as a product regression:** the notice gate is intended (`ContentView.swift:519-522`), and `test01`/`test05` passed in the same run. Still unproven until 5/5.
- **Stale tspans:** `55-read.js:197` resets the node first.
- **Archive carries the test edit:** built 12:34–12:37Z; the edit is 12:48:42Z and test-only.

## Count integrity
- **Native:** 536 passed, 0 failed, 0 skipped in the summary; the 534 + 2 split was not checked by me.
- **UI:** 13 classes / 52 methods accepted; official tally 54 passed, 3 failed of 57.
- **Archive:** exit 0, codesign passed 12:41:55Z; its own receipt says upload, TestFlight and physical install are unverified.
- **PostgreSQL, Anvil, lock build:** reviewer B covered these, but that output is in the truncated portion. Unverified here.

## Required next actions
1. Commit the StoreShots repair, rebuild, rerun 5/5, and regenerate the manifest.
2. Complete metadata readback and AppInfo; diff es-MX.
3. Resolve artwork provenance before submission.
4. Verify the deployed privacy page.
5. Retrieve the full reviewer output from the run's output file and fold in the remaining findings.
6. Upload, TestFlight, and physical six-language, microphone, purchase, sign-in and push checks remain separate gates.

## Limitations
- No code, tests or hashing run; no pixels inspected; nothing read outside the workspace.
- Finding 4, the finding 2 binding line, and the finding 1 assert line numbers are reviewer-reported and not re-checked by me.
- Files I read directly are the same as in my earlier report: `NucleoSpeech.swift` and `StoreShots.swift` in full, targeted ranges of the other cited sources, and the cited receipts.
