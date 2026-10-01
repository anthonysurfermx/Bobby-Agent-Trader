# Current follow-up: build 50 (supersedes historical candidate notes below)

Owner authorized completion and the production voice deployment. Read `docs/audits/release-preparation-2026-09-30/build50-progress.md` first, and verify any later archive/upload receipts. Candidate source now says 1.5 (50). The older build 47/49 notes below are historical evidence, not the current target.

Production voice commit `f6ef369` is deployed READY as `dpl_4r2SJZpgUSPLK3Atq6ZDiYhQnTiR`. Support/privacy truthfulness corrections are in subsequent local backend commit `4a46b7c`, deployed READY as `dpl_2JbwENEfzeZg8tHumySaNXqHr99Z`, aliased to bobbyprotocol.xyz. Backend branch remains separate from native and main. Do not spend additional real AI/TTS calls without resolving the daily test budget.

This follow-up also removes inactive Pro promotion, deletes the deleted account’s local thesis ledger, adds explicit keyboard/VoiceOver consent activation and aligns first-run narration wait with the desk. Native suite: 244 passed. JS suite: 41 passed. Simulator UI, archive and Apple state must be read from the final follow-up evidence.

Approved media remains exactly the 21 original files, verified by `approved-media-manifest.json`. Rejected look-alike renders are quarantined in `docs/app-store/release-47/rejected-experiment-do-not-upload/`. Do not add overlays, redesign or reorder. Apple now has the seven originals per locale in order 01 through 07; the owner explicitly confirmed this order. Build 50 was uploaded, processed, selected and saved. Reviewer notes and three localized subtitles were saved. Manual release remains selected; final App Review submission was not performed. Native source is committed locally at `e08d328`; four targeted simulator UI scenarios passed across the initial run and consent-label rerun. Recheck physical device and external gates before a readiness decision.

Independent report and gate adjudications remain preserved unchanged in `docs/audits/claude-final-app-review-2026-09-30*.md`. Recheck only the failures this follow-up claims to fix, then list unresolved device/service/business decisions. Do not submit review or release.

---

# URGENT ADDENDUM: TestFlight voice regression

Anthony reported that the current TestFlight BTC analysis used Apple's system voice instead of Bobby's chosen companion voice. Treat voice identity as an additional release gate. Do not mark the uploaded build ready based on previous tests.

Confirmed in source: NeuralVoice used an 8-second timeout and automatic AVSpeech fallback for analyses; transport errors skipped retry. A live short TTS probe returned OpenAI audio in 2.55 seconds; a 472-character probe timed out at Vercel after 30.26 seconds (HTTP 504). Runtime logs confirm the timeout. This reproduces a failure path, not the exact user's request trace.

Local correction in this native worktree removes system speech fallback, retries transport failures once with the same persona, bounds requests, reports voice failure while keeping the reading available, and aligns UI/native wait budgets. New native regression tests cover recovered network failure, terminal failure and throttling. Initial 16 voice tests passed; final 15 plus targeted rerun of the remaining persona test passed after updating its old mode-field assertion. 39 JS checks and 51 backend remediation checks passed. A repeated long production probe returned OpenAI audio in 6.98 seconds. Build 49 is the corrective candidate: archive succeeded and Info.plist verifies 49, with payments disabled. Xcode upload is blocked at its unresponsive Go To dialog; there is no upload receipt for 49. Backend deployment awaits explicit user approval. Verify upload/processing and a physical voice check before selecting a candidate.

Backend patch is ONLY LOCAL in `.claude/worktrees/app-review-backend`: persona-only mode, OpenAI request timeout, and no silent provider switch or paid-budget bypass. It is not deployed. Verify and coordinate before deployment. Do not deploy the native branch over the production backend.

Xcode currently shows an upload receipt for build 48, while Codex's own corrective archive was not yet completed. Do not assume that uploaded build 48 includes these latest edits. Match archive source/version/receipt before selecting a candidate; avoid duplicate uploads with the same build number.

---

# Bobby 1.5 (47): independent final App Review check

## Resumen para Anthony

Haz una segunda revisión independiente de Bobby antes del envío a Apple. Verifica la ficha remota, el build real, el rechazo anterior, privacidad, acceso del revisor y los flujos principales. Entrega una decisión clara: LISTA PARA ENVIAR o NO LISTA, con evidencia y pendientes. La aprobación la decide Apple; no prometas garantizarla.

**Pendiente conocido:** la restauración de las capturas originales en App Store Connect todavía NO está verificada. La versión con teléfonos añadidos sobre las fotos fue rechazada por Anthony. Los 21 originales locales están restaurados y deben conservarse tal cual.

## 1. Workspace and scope

Work in:
`/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/.claude/worktrees/agent-aef7b10853bd2a391`

Branch: `codex/subscription-readiness`. Inspect current status before editing: release fixes and artifacts are uncommitted. Do not reset, discard, or commit unrelated changes in the primary checkout.

Product name: Bobby (internal source paths may still say Nucleo). Candidate: version 1.5, build 47. App Store Connect app ID: 6804460489, Bobby: Think Before You Trade.

## 2. Authorization and boundaries

- Read-only independent review by default. Report concrete fixes before modifying the release candidate.
- Do not submit/resubmit to App Review, release, change pricing, accept agreements, deploy, push, or install on the physical iPhone.
- Keep manual release. The final submission action belongs to Anthony.
- Do not enable payments or analytics silently. Do not create or change credentials.
- Never execute trades or claim broker execution, verified returns, or guaranteed investment outcomes.
- Do not mix this work with PTS.
- Never print secrets or include them in reports/screenshots.
- Respect the existing daily limit: no more than 5 real AI questions across the release audit; inspect prior usage first. Prefer offline fixtures. Do not load-test paid APIs.
- Inspect the original brief and applicable AGENTS instructions. Existing user authorization allows preparation/uploads, but this handoff is for independent checking. Browser actions must follow their current confirmation policy.

## 3. Exact approved screenshot set

Canonical approved artwork:
`/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/docs/app-store/nucleo-editorial-v2/localized/{en,es,pt}/01.png` through `07.png`.

Release upload copies:
`docs/app-store/release-47/localized/{en,es,pt}/01.png` through `07.png`.

These copies were verified byte-for-byte against the approved originals on September 30. Recheck hashes before use.

Approved order:
1. App identity / Think before you trade.
2. Young male portrait / Ask what matters.
3. App debate / Three minds. One read.
4. Approved female portrait / Save. Reflect. Grow.
5. App evidence / See the evidence.
6. Black male portrait / Bobby by your side in the market every day.
7. App Wait verdict / Waiting will also bring you clarity.

Keep photography, grain, petrol blue tonality, typography, copy and alternating app/person order exactly as approved. No phone/UI overlay on human images. Do not add a phone below the cover either. Do not rerender or upload the rejected release-47 HTML experiment. The local release-47 README records this decision.

Final title: English “Waiting will also bring you clarity.”; Spanish “Esperar también te dará claridad.”; Portuguese “Esperar também te dará clareza.”

Verify 7 screenshots per localization: English (U.S.), Spanish (Mexico), Portuguese (Portugal). Apple can reorder simultaneous uploads; verify the actual remote numeric order after processing, not merely the file dialog selection. Verify 6.5-inch and other inherited sets have no obsolete images. These exports are 1320 × 2868 for the 6.9-inch set.

Remote state last observed: only Spanish received the rejected variant. Its Delete All operation was started, but the UI then stopped responding and reload yielded a blank view. Deletion completion and original re-upload are UNVERIFIED. English retained previous old screenshots; Portuguese restoration/upload was not completed. Reinspect all three locales rather than assuming anything persisted.

The approved UI artwork was captured from an earlier app build. Compare it with build 47 for material accuracy under Apple's current screenshot requirements. If a discrepancy needs artwork changes, report it to Anthony; do not redesign it without approval.

## 4. Build and rejection evidence

Archive: `/private/tmp/bobby-release-20260930/Bobby-1.5-47.xcarchive`.
Archive log: `/private/tmp/bobby-release-archive47.log`.
Xcode upload receipt: `docs/audits/release-preparation-2026-09-30/apple-upload47.txt` explicitly shows “Bobby 1.5 (47) uploaded”.

This proves upload, NOT Apple processing, selected build, or approval. Verify processing status, export compliance and attachment to version 1.5. Last observed selected build was 38, version status Rejected. Build 46 was also uploaded but superseded by the tap-input fix; do not select 46.

Read the actual Resolution Center rejection again. Last verified rejection for build 38 cited Guideline 5 / Legal and ChatGPT/OpenAI availability in China mainland. Apple offered exclusion of China as remediation. Availability was verified as 174 Available / 1 Not Available, specifically China mainland. Reverify saved remote availability and consistency with reviewer notes. Do not invent a permit or claim the review has already accepted the remedy.

## 5. Metadata and privacy

Prepared local copy: primary repository `docs/app-store/submission-copy-2026-09-30/`.
Release reviewer notes: `docs/app-store/release-47/metadata/review-notes.txt`.

EN-US, ES-MX and PT-PT version text was saved remotely, including promotional text, description, keywords, what's new and support URLs. Reopen each localization to verify persistence and limits. Portuguese copy truthfully explains that the current app UI supports English and Spanish.

Review notes were updated for build 47. Read back the saved text remotely and compare with current product behavior, especially AI providers, account deletion, guest access, payments disabled and screenshots. Correct any now-obsolete claim through a reported proposed change.

Published privacy evidence: `docs/audits/release-preparation-2026-09-30/apple-privacy.txt`.
Last verified 8 declared data types, each App Functionality, linked to user, no tracking: Other Financial Info, User ID, Product Interaction, Other User Content, Gameplay Content, Device ID, Customer Support, Email Address.

Check actual code, backend persistence and provider transmission against these declarations. Check working privacy/support URLs, AI consent before transmission, withdrawal, on-device speech claims, logging, account deletion and retention. If a declaration is inaccurate, report the required correction. Consult current primary Apple guidance; do not treat an old checklist as current policy.

## 6. Existing test evidence and fixes

Read logs/results before rerunning. Tests are evidence of their scope, not proof of all production flows.

- 240 native unit tests passed: `/private/tmp/bobby-store47-final.log`, `.xcresult` at `/private/tmp/bobby-store47-final.xcresult`.
- Two final native screenshot/UI flows passed (English/Spanish), including actual full-debate heading assertions: `/private/tmp/bobby-store47-debate.log`, `/private/tmp/bobby-store47-debate.xcresult`.
- Two native privacy UI tests passed in `/private/tmp/bobby-release-ui-20260930.log`. That earlier combined run also had two contract failures; do not hide those.
- Both contract tests subsequently passed after the Debug fixture fix: `/private/tmp/bobby-release-contract-fixed.log`.
- 39 JavaScript UI tests passed: `/private/tmp/bobby-release-js47.log`.
- Mocked backend checks: 32 API remediation, 133 desk-debate, 166 account-delete checks. Logs: `/private/tmp/bobby-release-api-tests.log`, `/private/tmp/bobby-release-debate-tests.log`, `/private/tmp/bobby-release-delete-tests.log`.

Two release-related fixes:
1. Short pill tap with undetermined microphone permission now opens typing; deliberate hold opens permission explanation. Four regression tests cover short tap, follow-up context, hold and cancellation.
2. Debug UI contract fixture generation is restored, isolated from Release resources.

Inspect `ios/Bobby/Nucleo/src/app/60-fsm.js`, `ios/Bobby/Nucleo/tests/pill-input.test.mjs`, `ios/Bobby/Nucleo/build.py`, `ios/Bobby/project.yml`, `ios/Bobby/UITests/NucleoStoreScreenshots.swift`. Verify Release excludes harness pages, secrets and payment test configuration.

If rerunning Xcode, inspect disk capacity and installed simulator first. Use project-defined schemes/destinations. Scope additional tests to concrete unresolved risks. Native source/resource consistency and signing validation matter more than another count of mocked assertions.

## 7. Critical unresolved end-to-end gates

Do not mark these passed from mocks or source inspection:

- Physical release device: Apple sign-in, persistence, account switch isolation, deletion, microphone denial, background/foreground voice cancellation, restored AI consent and accessibility.
- Apple authorization revocation: production Sign in with Apple backend credentials were previously missing. The newly uploaded IAP key is a different credential and does not establish revocation readiness. Verify current configuration without exposing values; test real revocation if possible. Native manual-revocation fallback must be accurately described.
- Community safety: real report/block path, private moderation queue, responsible moderator and backup, timely removal workflow. Do not invent staff or an operational process.
- Reviewer can enter the app and exercise core educational functionality without purchasing or encountering missing configuration.

## 8. Subscription and analytics status

US$4.99/month was approved for Bobby Pro. RevenueCat offering/entitlement/product mapping was configured, but Apple commercial agreements, banking/tax setup and real Sandbox purchase/restore/renewal were not completed. An actual SDK offering fetch did not return purchasable Apple products. Reverify current state, but do not claim subscriptions work end to end.

Build 47 deliberately has an empty Release RevenueCat API key and payments disabled. Verify no unusable purchase call-to-action or reviewer-facing subscription promise remains. If monetization is required for this release, this is a NO-GO until the commercial and real purchase gates pass. Do not enable a paid flow as part of this independent review.

Amplitude integration was not saved/activated; destination project/region and production/sandbox keys were not supplied. Do not assume analytics exists or silently transmit data to a new destination.

Production backend remediation was deployed from a separate worktree `.../.claude/worktrees/app-review-backend` at commit `52d28b3dd4dd396b4eb6f01067535b58a1265ddb`. Do not deploy the older native branch over it. Verify production behavior and current deployed identity separately from native unit tests.

## 9. Deliverable

Save `docs/audits/claude-final-app-review-2026-09-30.md` and answer Anthony in Spanish.

Include:
- LISTA PARA ENVIAR or NO LISTA, with an explicit reason and scope.
- A gate table: requirement, observed evidence/date, pass/fail/not tested, exact corrective action.
- Separate local/simulator evidence, physical device evidence, and remote Apple/production evidence.
- Current selected version/build, rejection remedy, screenshot count/order/locales, saved metadata/privacy and manual release.
- All remaining blockers and who must resolve them. Separate App Review readiness from monetization readiness.
- Exact final Apple button/location for Anthony ONLY if all preparation and remote verification are complete. Do not press it.
- No guaranteed approval, invented coverage, fabricated user sessions or claim that upload equals review readiness.
