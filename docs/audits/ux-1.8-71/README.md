# do not submit 71

The first-question consent screen loses its AI-processing disclosure and overlaps its controls at the largest emulated text size in all six languages, on both SE and Pro Max viewports. On SE, the first explanation becomes a one-word reading window and the German error message runs behind Retry. These are first-run/core-flow accessibility defects in the exact build-71 HTML. Resolve F01–F02 before submission and verify F03 with native VoiceOver. This verdict comes from browser fixtures and current Swift source; native Simulator, TCC and StoreKit execution were unavailable and are not counted as passing.

Audit date: 2026-10-14. Requested base: `4d0a42ab0e929922220d3682b477878ba725f50c`, second parent `f3858929b8d798724d283c15565bf6efb603b798`, version **1.8 (71)** in `ios/Bobby/project.yml:145`. Branch: `codex/ux-audit-1.8-71`. No product code, existing tests, configuration or legal copy changed. No merge, main push, archive, upload, App Store/TestFlight action, live model call, purchase or live account operation.

## Method and evidence boundaries

- Xcode 26.1.1 is installed. `xcrun simctl list devices booted` failed with CoreSimulatorService connection invalid/refused and a sandbox log-access denial. No simulator or DerivedData was created. Native UI tests, simulator TCC refusals and StoreKit execution could not run.
- Headless Chrome launch also failed in the sandbox (`SIGABRT`). The brief's browser fallback was completed using the connected Chrome extension against a loopback server, the repository's generated dev pages, fixture bridge and page harnesses. Screenshots are **browser captures**, not iPhone/Simulator screenshots.
- SE: **375 × 667 CSS points**. Pro Max: **430 × 932 CSS points**. Dark appearance. Native `textScale` was emulated at **1** and **3.12**; native calculates `UIFontMetrics(.body).scaledValue(for:17)/17` at `ios/Bobby/Sources/Nucleo/NucleoSession.swift:612`. The largest value was not measured on an iPhone. Browser safe-area values, keyboard and fonts do not establish native parity.
- Temporary audit scaffolding supplied session fields and a native-shaped explanation/error fixture; it did not replace the shipping layout or input handlers. The explanation comes from `Nucleo/fixtures/native/companion-explanation-fact.json`; its fact/source are explicit examples. No generated/live response quality is asserted. The ordinary recorded market fixture remains English; that is fixture provenance, not a demonstrated translation defect.
- First-question consent uses the repository's **first step of `script=chip-run`**, with the audit harness stopping before its automated agreement hold, without the debug `consentPreview` shortcut. At `t=7`, then Step 1s, it is in `RISK` after the first example question. Both entry paths use the same shipping `ENTER.RISK` and `consentRiskLayout`.
- Release pages regenerated outside the worktree match the shipped bundle **byte-for-byte**: `app.html` SHA-256 `7880e2251838d69f8ac86a1a5a4d50dc6ccf4f30bc170e07855e376517a11d5b`; `onboarding.html` SHA-256 `0a6513cf0fa799c3ca143044d7a57c07888f61bb68669a19ee9fce1e322eb4db`.
- Storage behavior was exercised with unchanged Swift state code compiled on macOS, small dependency stubs, bundled catalogs and injected storage. This establishes state transitions, not UIKit, Keychain or real-account behavior.

Screenshots exclude the external harness controls. Companion screenshots reset the browser stage's scroll offset to zero to isolate the shipping layout; this reset is an audit control, not a product fix. Raw measurements are in [evidence](evidence/).

## Ranked findings

P0: App Review rejection risk or broken core flow. P1: a first-time user is confused or blocked. P2: polish. Severity reflects the demonstrated condition, not a prediction of Apple's decision.

| ID | Priority | Timing | Finding | Evidence method |
| --- | --- | --- | --- | --- |
| F01 | P0 | **before submission** | Consent disclosure leaves the screen at accessibility text sizes | Browser + source |
| F02 | P1 | **before submission** | SE explanation is a fragment; error overlaps Retry at largest text | Browser + source |
| F03 | P1 | **before submission** | Native risk-detail VoiceOver label omits the disclosure paragraphs | Swift source; native verification required |
| F04 | P1 | **after 1.8** | Failed memory-off persistence leaves notes eligible for use | Offline Swift state reproduction |
| F05 | P1 | **after 1.8** | Own-words memory input silently truncates at 400 UTF-16 units | Shipping-engine VM; conditional capability |
| F06 | P2 | **after 1.8** | SE read-footer targets shrink below 44pt | Browser measurements; native source supplement |
| F07 | P2 | **after 1.8** | Key native note/Profile/Pro text bypasses Dynamic Type | Swift source |
| F08 | P2 | **after 1.8** | Paywall restore cancellation has no persistent outcome | Swift source; StoreKit unverified |
| F09 | P2 | **after 1.8** | Personal-question Not now ignores a resolved storage failure | Shipping-engine VM; conditional capability |

### F01 — P0: consent text escapes the usable screen

**Screen / language / device:** first question → risk/AI-processing consent; en/es/fr/pt/it/de; SE and Pro Max; `textScale=3.12`.

**What happens:** enlarged heading measurements push later headings and the full AI-processing paragraph below the fixed Full notice, Accept and Not now controls. On Spanish SE the paragraph starts at **y=880px**, below the **667px** viewport; Accept starts at **y=548px**. On Pro Max the paragraph starts at **y=1,229px**, below **932px**. All twelve locale/device cases reproduce it. The body has its own scrolling behavior, but its entire region is outside the viewport; the headings are not inside a bounded scroll region. Full notice remains an alternate native route, whose accessibility is F03.

**Evidence:** [SE default](consent-es-se-default.jpg), [SE largest](consent-es-se-ax5.jpg), [Pro Max largest](consent-es-max-ax5.jpg), [French largest](consent-fr-se-ax5.jpg), [six-language geometry](evidence/consent-large-metrics.json). These are the normal first-question script, not a screen drawn by the audit.

**Source:** `ios/Bobby/Nucleo/src/onboarding/85-consent-preview.js:5`–`:16`, especially the unbounded heading growth and minimum body line even when no room remains at `:12`; fixed controls at `:36`. Production entry: `ios/Bobby/Nucleo/src/onboarding/60-fsm.js:373`.

**Smallest fix:** put all headings and disclosure in one bounded scroll region when text grows, with Full notice/Accept/Not now pinned below it. Preserve the legal text and full accessibility font size. Verify the normal first-question path at the largest actual iOS size in all languages.

### F02 — P1: largest-text answer and error cannot share the fixed geometry

**Screen / language / device:** first explanation and retryable companion error; Spanish answer and German error captured on SE; Spanish Pro Max comparison; `textScale=3.12`. Shared layout affects all locales; exact wrapping depends on their text.

**What happens:** the SE narrative viewport is **78px** high while its lead line is **84px** high, with a further fade at the bottom. The first explanation visibly shows just “Los”, beside a long scrollbar, while its follow-up occupies **212px**. Reading can scroll, but the layout does not provide a complete lead line. German error text is unbounded: its panel runs from **y=200 to y=717**, the Retry slot occupies **y=341–553**, and the microphone is **y=586–631**. The message is covered by Retry and crosses the mic. Pro Max provides a larger, **234px** narrative window, so the one-word SE behavior is device-specific.

**Evidence:** [SE default answer](answer-es-se-default.jpg), [SE largest answer](answer-es-se-ax5.jpg), [Pro Max largest answer](answer-es-max-ax5.jpg), [German largest error](error-de-se-ax5.jpg), [SE answer measurements](evidence/answer-se-measurement.json).

**Source:** `ios/Bobby/Nucleo/src/app/65-companion.js:71`–`:85`: text-dependent fixed slot, narrative height rounded to 25*k despite a 27*k lead, and the `!error` guard that excludes errors from overflow recovery.

**Smallest fix:** bound both answers and errors within available space, budget a complete lead line using its actual line height, and move/compact the optional follow-up slot when needed. Let error text scroll above a separate Retry control. Preserve enlarged type and 44pt controls.

### F03 — P1: native full-notice accessibility label excludes the paragraph

**Screen / language / device:** onboarding Full notice and Profile → Risk notice; all languages/devices; native source review.

**What happens:** a Button contains both `Text(item.title)` and `Text(item.body)`, but explicitly sets `.accessibilityLabel(item.title)`. That control's declared spoken label excludes the detailed AI recipients, speech boundary and withdrawal instructions. Read-only mode still uses the same Button with a no-op action. Actual VoiceOver traversal has not been captured.

**Evidence / source:** `ios/Bobby/Sources/RiskNoticeView.swift:97`–`:126`, body at `:112`, title-only label at `:125`; the details route uses `readOnly:true` at `ios/Bobby/Sources/Nucleo/NucleoRootView.swift:157`.

**Smallest fix:** expose the unchanged title **and body** as accessible text or a combined label, preserving acknowledgement value. Verify VoiceOver can read every disclosure paragraph in the native read-only sheet before submission.

### F04 — P1: failed memory-off does not revoke active context

**Screen / language / device:** Profile → Memory → What Bobby understood about you → turn memory off → confirm; all languages; native state code independent of viewport.

**What happens:** after a successful opt-in and saved note, a failed storage write during `choose(false)` leaves `accepted=true`, the note in RAM and a non-nil wire containing it. The UI shows a storage error and leaves confirmation open; normal off works. This is a storage-error edge, not evidence that ordinary opt-out silently fails. The user's off choice should stop use immediately while deletion retries.

**Evidence:** [offline Swift output](evidence/memory-contract.txt): `MEMORY_OFF_WRITE_FAILURE accepted=true storageError=true noteCount=1 wireContainsNotes=true`. The same unchanged state-code harness passes opt-in, correction, one/all deletion, different-account clearing and successful off. [Reproduction](evidence/memory-contract.swift).

**Source:** `ios/Bobby/Sources/Nucleo/CompanionContext.swift:140`, `:150`–`:157`, `:269`; confirmation path at `ios/Bobby/Sources/Nucleo/CompanionMemoryView.swift:119`. Existing failure test only seeds a never-accepted store at `ios/Bobby/Tests/CompanionContextTests.swift:383`.

**Smallest fix:** make the immediate RAM revocation gate part of `accepted`/`wire`; retain truthful failed-deletion feedback and a persistence retry across relaunch. Do not report failed deletion as successful.

### F05 — P1: conditional own-words memory answer loses its suffix

**Screen / language / device:** an opted-in personal-question invitation → keyboard answer; all locales/devices. This is **not** the restored native notes correction editor.

**What happens:** an answer of 439 UTF-16 units is silently sent as its first 400 units. Probe text was `a.repeat(399) + '😀 My interest is companies, not crypto.'`; the payload ends in the unpaired high surrogate `\ud83d`, losing the qualifying suffix. A successful `noted` fixture then clears the full editor without a length warning.

**Evidence:** [shipping-engine probe](evidence/conversation-probe.txt), [portable probe](evidence/conversation-probe.mjs). It drives the invitation and real keyboard/Send handlers with native-shaped replies.

**Source:** `ios/Bobby/Nucleo/src/app/96-memory.js:73`, editor cleared at `:79`; native length guards at `ios/Bobby/Sources/Nucleo/NucleoSession.swift:432` and `ios/Bobby/Sources/Nucleo/CompanionPilot.swift:120`.

**Availability boundary:** production invitation decoration exists at `NucleoSession.swift:1423`–`:1441`, but needs compatible capability, accepted memory and pacing eligibility. `api/_lib/companion-context.ts:25` gates context on `BOBBY_COMPANION_CONTEXT=on`. Current remote capability was not queried. This is a reproduced conditional code-path defect, not a demonstrated current reviewer blocker.

**Smallest fix:** reject an over-budget memory answer with a localized limit and keep the complete editable draft; apply the native budget consistently and never send a silent substring.

### F06 — P2: small-screen footer targets fall below 44pt

**Screen / language / device:** read-analysis footer on SE; English capture; geometry shared across locales. Normal text size.

**What happens / evidence:** [browser measurements](evidence/read-footer-metrics.json) show Save result at **36.35px** high, Another question and Back to Bobby at **28.45px**. [Capture](read-footer-en-se.jpg). They start as 46/36 design pixels and shrink with the 390×844 stage. Home chips and conversation keyboard/close compensate for stage scale and measured approximately 44px; this footer does not.

**Source:** `ios/Bobby/Nucleo/src/app/template.html:75`, `:79`, `:82`; compensation precedent at `ios/Bobby/Nucleo/src/app/95-conversation-render.js:7`.

**Native supplement, source-only:** Correct/Delete notes gives 44pt to the enclosing HStack, not each Button, at `ios/Bobby/Sources/Nucleo/CompanionMemoryView.swift:93`–`:99`. Profile Sign out/Delete account labels specify 32pt at `ios/Bobby/Sources/AccountSheet.swift:433`, `:442`. Actual native hit frames remain unmeasured.

**Smallest fix:** scale footer minimum hit heights by `44/fitS`, including secondary links; give each native action label its own 44pt frame/content shape. Recheck geometry without creating footer/card overlap.

### F07 — P2: restored note values do not enlarge with Dynamic Type

**Screen / language / device:** native notes, Profile rows and Pro price/benefits; all locales, SE/Pro Max largest Dynamic Type; source-only.

**What happens / evidence:** saved note title/question/value use fixed system sizes 26/14/18 while nearby `.footnote` metadata scales. Profile row copy and several Pro labels also use fixed sizes. Native clipping and layout were not rendered.

**Source:** `ios/Bobby/Sources/Nucleo/CompanionMemoryView.swift:68`, `:85`, `:86`; `ios/Bobby/Sources/AccountSheet.swift:685`; `ios/Bobby/Sources/Nucleo/NucleoPaywallSheet.swift:48`, `:53`, `:190`. Existing scaled font component: `ios/Bobby/Sources/V18/V18Kit.swift:8`.

**Smallest fix:** use the existing `quietFont` or semantic text styles for the important content and retain wrapping/scrolling. Test both device sizes at the actual largest setting.

### F08 — P2: restore result is not consistently persistent

**Screen / language / device:** Bobby Pro → Restore Purchases; all locales/devices; Swift source only, no StoreKit transaction.

**What happens / evidence:** restore clears the note, then `show(.cancelled)` does nothing, so cancellation ends the spinner without a result. Successful restore closes after 900ms. V18-DESIGN's restore rule asks for a visible persistent result every time; Credits already has that outcome presentation.

**Source:** `ios/Bobby/Sources/Nucleo/NucleoPaywallSheet.swift:332`–`:362`, cancellation mapping at `:387`; existing notice at `ios/Bobby/Sources/V18/Credits/CreditsRestore.swift:41`.

**Smallest fix:** reuse the existing restore-outcome notices on the paywall, including cancellation, and leave success visible until dismissal. Confirm using StoreKit config. Purchase/restore success is unverified.

### F09 — P2: personal-question Not now dismisses after native failure

**Screen / language / device:** conditional personal question → Not now; all locales/devices; same capability boundary as F05.

**What happens / evidence:** the shipping handler closes on any resolved `companion.answer` response. The injected native failure `{message:'Failed'}` dismissed the question with no error. Native persistence failure returns an ordinary domain result, not a thrown bridge error. [Probe](evidence/conversation-probe.txt).

**Source:** `ios/Bobby/Nucleo/src/app/96-memory.js:33`; native failed rest result at `ios/Bobby/Sources/Nucleo/NucleoSession.swift:427`; persistence at `CompanionContext.swift:221`.

**Smallest fix:** close only on `status:'rested'`; otherwise retain the question and show the existing localized failure line.

## Coverage and outcomes

| Requested area | Verified evidence | Remaining boundary |
| --- | --- | --- |
| First run, risk, first question/answer | Repository chip-run enters consent; six locale screenshots; default and largest emulated geometry; explanation fixture and recorded stock read | Native handover/keyboard/safe areas and real first response unverified |
| Waiting, follow-ups, errors, timeout, retry | 343 JS tests; repeat retry UUID; default fixture waiting and 20s timeout; full-engine 300s unresolved-call cancellation recovers draft and ignores late reply | No live service latency/reliability or native end-to-end timeout measurement |
| Too-long ordinary question | Six full-engine probes preserve 1,201 code points, localized refusal, explicit edit to 1,200 and exact retry; [French settled refusal](too-long-fr-se.jpg) | Native keyboard behavior unverified |
| Memory opt-in/list/correct/delete/all/off/account change | Offline Swift state transitions and 343 JS suite; notes routes/copy/catalog read; F04–F05/F09 errors reproduced | Native list/confirmation interaction, real Keychain and live account changes unverified |
| Voice denied → recovery | Offline denied-permission/keyboard tests; Swift Cancel/Open Settings route reviewed | Simulator TCC refusal and actual native alert/Settings return **not run** |
| Profile/paywall/Pro | Swift, translation catalog, bundled `Bobby.storekit` and project reference reviewed | No native rendering or StoreKit config execution; no purchase/restore claim |
| Six languages / dark / sizes | Home and normal consent captured in all six; Home on both sizes; largest consent on both sizes in all six; catalog and model tests | Native sheets and generated answer translation unverified |
| VoiceOver / 44pt / Dynamic Type | Browser accessible names and measured web targets; Swift source; F01–F03/F06–F07 | Real VoiceOver traversal, gestures and native hit rectangles **not run** |
| Empty/loading/error | Memory empty branch reviewed; waiting/error/too-long screenshots; failed save/retry/domain-failure tests | Native empty/loading/paywall error sheets unrendered |

Account semantics are deliberate: signing out retains local notes with disclosed device copy; signing in to a **different** account clears notes and consent. The offline A→B contract passed. Same-account retention is not recorded as an account-switch leak. See `CompanionContext.swift:255`–`:266` and `CompanionContextTests.swift:405`.

### Build-71 changes and 1.7 regressions

- **Saved-read footer:** recorded NVIDIA fixture → Read analysis → Save result → confirmed save reaches `FOLLOWUPS`; footer says Saved on this phone, primary Back to Bobby, secondary Another question. [Screenshot](saved-footer-en-se.jpg). Save-failure tests retain the save control without optimistic success. Native persistence is not proved by that mock.
- **Rotating education example:** shipping `homeExamples`/`firstRunExamples` consume native `exampleIndex`; index zero is captured in six languages. Rotation arithmetic is covered by the existing tests; days were not waited out on a device.
- **French/German support subtitle:** current shipping SVG/render function, extracted exactly as the existing `scripts/qa/test-ios17-support-subtitle.mjs` harness, measured **12/12** above/below cases within the 90px budget and x≤386.1px. German wraps to two lines; French above-support wraps. [Measurements](evidence/support-subtitle-metrics.json), [German](chart-support-de.jpg), [French](chart-support-fr.jpg). This is browser/system-font evidence; native WebKit/Geist-specific rendering was not measured.
- **Hourly candle labels:** native supplies `.oneHour` at `NucleoDesk.swift:234`, emits `candlesTimeframe` at `:1253`; model uses it at `20-read-model.js:891`, renderer at `55-read.js:288`. Existing fixture tests pass 1H labels and omit daily/weekly/4H overlays on mismatched candles. No live market-data call made.
- **Denied voice recovery:** native source handles denial before recognizer availability, presents Cancel/Open Settings, dismisses before opening Settings. Source: `NucleoSession.swift:1097`–`:1117`, `NucleoSpeech.swift:182`–`:199`. This remains a required native check.

## Verification receipts

| Command | Result | Meaning |
| --- | --- | --- |
| `node --test ios/Bobby/Nucleo/tests/*.test.mjs` | **343 passed**, 0 failed/skipped/cancelled | Shipping JS and models with DOM adapters/source assertions |
| `node scripts/test-nucleo-input-pipeline.mjs` | **1,512 passed**, 0 failed | iOS/web input handlers, clocks and exact offline payloads |
| `node scripts/test-nucleo-locales.mjs` | **26 passed** | Six-language dictionaries and placeholders |
| `node scripts/test-nucleo-regional-format.mjs` | **939 passed** | Regional formatting assertions, iOS/web fixtures |
| `node --test ios/Bobby/Nucleo/tests/six-languages.test.mjs ios/Bobby/Nucleo/tests/chart-timeframe.test.mjs` | **59 passed** | Subset of the 343; not additional independent flows |
| `python3 ios/Bobby/Tests/LocalizationCatalogAudit.py` | **PASS**, 1,384 source keys / 1,444 catalog rows | Native translation/placeholder coverage; [receipt](evidence/native-localization.txt) |
| `python3 ios/Bobby/Nucleo/build.py --output /private/tmp/bobby71-ui` and release equivalent | **NUCLEO_BUILD_OK** | Page generation/syntax; release HTML hashes match bundled candidate |
| `npm run build` in this worktree | Could not start TypeScript: `tsc: command not found` | Worktree has no node_modules; [receipt](evidence/worktree-build-attempt.txt) |
| `npm ci --ignore-scripts --no-audit --no-fund` then `npm run build` in isolated HEAD source copy | **PASS, exit 0** | 1,773 input blobs byte-verified against HEAD; API/admin checks, Vite/PWA and no-fetch static prerender; [receipt](evidence/local-build.txt). Separate from native iOS build |
| `node scripts/test-nucleo-react-locales.mjs` before isolated dependency install | Unavailable: missing `typescript` | Not counted as passing; React web suite is outside native Nucleo rendering |

The supplemental audit probes are local evidence artifacts, not added product tests. Passing assertion counts do not represent that many independent iPhone end-to-end flows.

## What could not be verified

**Real audio, live purchases/restore, Apple sign-in, and a physical device were not tested.** No live accounts were created/deleted. Also unverified: Simulator/native Debug build, TCC denial→Cancel/Settings→return, actual largest iOS Dynamic Type value/rendering, native VoiceOver, native 44pt hit areas, StoreKit config lifecycle, native Profile/paywall/notes rendering, real Keychain failures, remote companion capability, live model/data freshness and App Review/TestFlight/publication status. None is counted as passing. The existing `ProReviewShots` uses a live RevenueCat Test Store offering and was excluded under this brief's StoreKit-only constraint.

Temporary source/dependencies/cache/build outputs were removed; no simulator or DerivedData was created. Disk had approximately **21GiB free** after the isolated build cleanup and **19GiB free** at final publication, above the required 15GB archive reserve. Only this audit folder is intended for commit.

Publication method: the sandbox denied creation of the worktree's `index.lock`, so the documentation-only commit and audit branch are published through GitHub's Git Data API. Local Git metadata remains at the audited base; the local audit folder is present as uncommitted files. No main ref is updated.

## Reproduce the browser evidence

From the repository root, run `python3 docs/audits/ux-1.8-71/evidence/reproduce-browser.py`, then serve the printed temporary directory on loopback. It rebuilds the existing fixture pages outside the repository and adds only the documented audit controls/session fixture fields. Open:

```text
http://127.0.0.1:4718/audit.html?page=onboarding&width=375&height=667&harness=1&freeze=1&script=audit-first-question&t=7&first=1&lang=es&mic=denied&auditScale=3.12
```

Set the browser viewport to 375×715 (the extra 48px is the external controls). Click Step 1s and capture only the 375×667 iframe. For the explanation, use `page=app`, omit `first`/`script`, set `t=8&auditCompanion=1`, click Ask fixture, Step 10s, then Reset scroll. Add `auditError=1&lang=de` for F02's error. Use width430/height932 and a 430×980 browser viewport for Pro Max. `auditScale=1` is the default comparison. `support.html?lang=de&direction=below` reproduces the independent shipping SVG measurement harness. Delete the generated temporary directory and stop the server afterward.
