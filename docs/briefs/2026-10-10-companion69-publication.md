# Bobby 1.8 (69) — iPhone companion

Base: `codex/bobby-speaking-dial68` (`8861bf44`). Branch: `codex/bobby-companion-build69`.

## Included

- One launch capability probe; educational questions and sentence-length fuzzy guesses use the companion. Follow-up chips go directly to it. Asset offers require the existing confirmation before any desk read. Friendly errors allow one retry.
- Exact six-language memory consent, with Anthropic and money questions named. Declining is remembered. No notes or context leave before acceptance.
- Eight bundled questions in six languages, four on day one and the remaining questions on return days two through five. Taps and skips are entirely local. Missed calendar days do not create catch-up days.
- Separate device-only Keychain notes, guest support, seven-day money/inferred expiry and thirty-day other expiry. Notes expose catalog wording, provenance, expiry, correction, single/all deletion and memory off. Existing desk memory and theses keep their stores.
- Context is sent only with consent and a matching enabled server capability/catalog/notice. A personalized reply displays the notes mark. Fact source/year stay outside narration; the server currently sends null.
- Typed and spoken check-in answers use `answer` in place of `question`. Only validated enum patches are saved. Failed answers leave the question/options visible with the localized error line; inferred notes are marked for confirmation.
- The envelope's fact is a separate card with source/year outside narration. The exact server fixture is Debug-only. Choosing the day-three exercise requests an educational explanation.
- Equal consent choices and privacy details stay pinned. Check-in options/skip and reply close reserve the microphone strip; the sphere moves and shrinks when space is needed, with 44pt controls and Dynamic Type scaling.
- Device notes and consent are wiped on account deletion, Memory's confirmed Delete everything, and first launch after reinstall. Signing out keeps device notes; the notes screen explains this. Details opens the localized privacy URL at `#notes`.
- New microphone/speech purpose strings cover answers as well as questions.

## Verification and limits

Simulator evidence, captured real envelopes, run logs and release/upload state live in `_harness/context-2026-10-10/` outside the source checkout. All eight layout configurations passed: Spanish/German × SE 3 (375×667, same smallest supported viewport as SE 2)/17 Pro Max × default/+1 Dynamic Type. Final small-phone evidence uses `shots/small-default-v2` and `small-plus1-v2`; the earlier small folders are superseded. Large evidence uses `shots/large-default` and `large-plus1`. Screenshots retain their names with `-fixed`.

Production GET was independently verified as 405 with context true, catalog 1 and notice memory-1. Full Spanish and German live day-one UI paths passed: consent, four local choices, later personalized reply, notes, correction, deletion and memory off. Captured envelopes have no context fields before consent; later replies carry personalized:true/checkIn:null/fact:null together. No contract mismatch was observed in these replies. Live screenshots use `-live`. The bundled eight-question catalog is the exact server-owned JSON. PR #179 remains open at the final regression checkpoint; its optional labels and catalog-level unsure are supported, while any missing spoken label shows the question and a confirmation marker per SERVER-STATUS.

Tier 3 fixture tests passed for the fact card, answer-error recovery, and Spanish/German exercise explanations. Spanish/German typed fixtures and the Spanish live typed path passed: four noted enum patches advanced through the day-one chain, appeared in notes, and kept the orientation allowance unchanged at consumed 5 / remaining 0. The final complete native regression passed all 1,144 tests; 291 JavaScript checks and the web production build passed. The last German typed note UI check passed on the final additive-label/privacy code. The speech final-to-answer route is covered by the real shared-page event path in JavaScript tests; real microphone capture remains a device check.

Physical iPhone microphone, speaker/echo, TestFlight installation remain separate acceptance checks. No merge, App Store submission or web deploy is part of this release. No API, server test or shared contract files were edited. Android changes visible in the PR are inherited from the explicitly selected dial68 base; this companion commit is iOS only.

## Release state

Draft PR: https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/178 remains a draft. The earlier signed archive is superseded and must not be uploaded. The final corrected signed archive path and current upload result are recorded in codex-status.md. The final corrected archive is signed and verified (1.8/69, expected team, matching resources, no Debug fixtures/QA hooks). A fresh upload attempt also failed with `exportArchive Failed to Use Accounts` (exit 70). Apple did not accept this build. No upload acceptance, processing or internal availability is claimed without Apple evidence.

If the account is still blocked: on the Mac, open Xcode → Settings → Accounts, sign in with the developer Apple ID, and approve any sign-in request on the iPhone. Then run the harness `upload-build69-final.zsh`; it uses only `Bobby-1.8-69-final.xcarchive` and requires the archive-verification record.

The first branch push triggered Vercel's existing automatic preview integration. That exact preview was removed; automatic previews for this branch are now disabled. Production was not promoted or changed.

The full native run exposed two existing test adapter issues: an expired fixed notification date and a WKWebView frame test without `ST`. Their fixtures now use a future date and the actual card state/window scene. Both targeted tests and the subsequent complete 1,137-test native run passed after these corrections; no notification or market-presentation implementation was changed.

The inherited draft-head Android emulator job failed after successful Gradle runs and screenshot collection; this iOS follow-up does not edit Android. Its job log is preserved in the harness; final-head checks must be read separately.
