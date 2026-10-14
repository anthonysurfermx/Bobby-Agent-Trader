# Bobby 1.8 (69) — iPhone companion

Base: `codex/bobby-speaking-dial68` (`8861bf44`). Branch: `codex/bobby-companion-build69`.

## Included

- One launch capability probe; educational questions and sentence-length fuzzy guesses use the companion. Follow-up chips go directly to it. Asset offers require the existing confirmation before any desk read. Friendly errors allow one retry.
- Exact six-language memory consent, with Anthropic and money questions named. Declining is remembered. No notes or context leave before acceptance.
- Eight bundled questions in six languages, four available on day one and the remaining questions on return days two through five. Non-money questions may chain after an answer or skip; money questions wait for a new Bobby reply, one per reply. Taps and skips are entirely local. Missed calendar days do not create catch-up days.
- Separate device-only Keychain notes, guest support, seven-day money/inferred expiry and thirty-day other expiry. Notes expose catalog wording, provenance, expiry, correction, single deletion, confirmed all-note deletion and confirmed memory off. Both confirmation sheets name the consequence and give cancellation the same size and surface, while deletion uses the destructive color. Existing desk memory and theses keep their stores.
- Context is sent only with consent and a matching enabled server capability/catalog/notice. A personalized reply displays the notes mark. Fact source/year stay outside narration; the server currently sends null.
- The explicit “Answer this question” control types on tap and speaks on hold; check-in answers use `answer` in place of `question`. The usual question field and microphone stay usable for the person’s own next question, which never marks a check-in as asked. Only validated enum patches are saved. Failed answers leave the question/options visible with the localized error line; inferred notes are marked for confirmation.
- The envelope's fact is a separate card with source/year outside narration. The exact server fixture is Debug-only. Choosing the day-three exercise requests an educational explanation.
- Equal consent choices and privacy details stay pinned. Check-in options/skip and reply close reserve the microphone strip; the sphere moves and shrinks when space is needed, with 44pt controls and Dynamic Type scaling.
- Device notes and consent are wiped on account deletion, Memory's confirmed Delete everything, and first launch after reinstall. Signing out keeps device notes; the notes screen explains this. Details opens the localized privacy URL at `#notes`.
- New microphone/speech purpose strings cover answers as well as questions.

## Verification and limits

Simulator evidence, captured real envelopes, run logs and release/upload state live in `_harness/context-2026-10-10/` outside the source checkout. The previous pass validated all eight layout configurations: Spanish/German × SE 3 (375×667, same smallest supported viewport as SE 2)/17 Pro Max × default/+1 Dynamic Type. Final small-phone evidence uses `shots/small-default-v2` and `small-plus1-v2`; the earlier small folders are superseded. Large evidence uses `shots/large-default` and `large-plus1`. Screenshots retain their names with `-fixed`.

Production GET was independently verified as 405 with context true, catalog 1 and notice memory-1. Full Spanish and German live day-one UI paths passed: consent, four local choices, later personalized reply, notes, correction, deletion and memory off. Captured envelopes have no context fields before consent; later replies carry personalized:true/checkIn:null/fact:null together. No contract mismatch was observed in these replies. Live screenshots use `-live`. The prior pass used the then-published catalog. The third pass copies merged PR #179 from origin/main byte-for-byte, including labels for all typed/spoken-only values and catalog-level unsure. Notes use those labels; typed exercise patches accept source shown.

Tier 3 fixture tests passed for the fact card, answer-error recovery, and Spanish/German exercise explanations. Spanish/German typed fixtures and the Spanish live typed path passed: four noted enum patches advanced through the day-one chain, appeared in notes, and kept the orientation allowance unchanged at consumed 5 / remaining 0. The previous pass’s complete native regression passed all 1,144 tests; 291 JavaScript checks and the web production build passed. The last German typed note UI check passed on the final additive-label/privacy code. The speech final-to-answer route is covered by the real shared-page event path in JavaScript tests; real microphone capture remains a device check.

Physical iPhone microphone, speaker/echo, TestFlight installation remain separate acceptance checks. No merge, App Store submission or web deploy is part of this release. No API, server test or shared contract files were edited. Android changes visible in the PR are inherited from the explicitly selected dial68 base; this companion commit is iOS only.

## Release state

Draft PR: https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/178 remains a draft. All earlier build-69 archives are superseded. The third-pass archive is `_harness/context-2026-10-10/Bobby-1.8-69-c.xcarchive`; its verified readiness and actual upload outcome are recorded in `codex-status.md` and `build69-c-archive-verification.json`. The earlier upload was blocked by `exportArchive Failed to Use Accounts`. No Apple acceptance, processing or internal availability is claimed from local signing.

After Xcode → Settings → Accounts sign-in, run `zsh /Users/mrrobot/Developer/GitHub/bobby-wt/_harness/context-2026-10-10/upload-build69-c.zsh`. This command requires third-pass archive verification and exports for internal TestFlight only. The older `upload-build69-final.zsh` now forwards to this verified archive so it cannot upload the superseded one.

The first branch push triggered Vercel's existing automatic preview integration. That exact preview was removed; automatic previews for this branch are now disabled. Production was not promoted or changed.

The full native run exposed two existing test adapter issues: an expired fixed notification date and a WKWebView frame test without `ST`. Their fixtures now use a future date and the actual card state/window scene. Both targeted tests and the subsequent complete 1,137-test native run passed after these corrections; no notification or market-presentation implementation was changed.

The inherited draft-head Android emulator job failed after successful Gradle runs and screenshot collection; this iOS follow-up does not edit Android. Its job log is preserved in the harness; final-head checks must be read separately.

## Third design-review pass

Only the companion screens and their new strings changed. The explanation exit now says “Back to Bobby” in all six languages; the notes exit also names Bobby; single-note deletion names the note. Declining the memory consent returns directly to the explanation and does not ask again. Portuguese additions use Brazilian Portuguese.

Current evidence and release state are in `_harness/context-2026-10-10/codex-status.md` and `codex-build69-c-answer.md`. Review screenshots use names ending in `-c.png`; they cover chained interest/barrier questions, money after another reply, both destructive confirmation sheets and a typed-only belief note in Spanish and German. These are native simulator paths with the Debug fixture server, separate from the previous pass’s captured live-server paths and physical-iPhone acceptance.

The third pass’s full native regression passed 1,146 tests and its JavaScript checks passed all 294, including real panel-pointer dispatch, held answer input and cancellation back to personal questions. The web production build passed. Both Spanish and German complete C paths and control geometry passed on the SE 3 at +1 Dynamic Type. Their screenshots come from the native Debug fixture server, including the typed-only belief value `banks_keep_it`; production capability was separately rechecked as context:true/catalog:1/memory-1.
