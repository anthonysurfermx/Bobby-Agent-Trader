# Bobby 1.8 (69) — iPhone companion

Base: `codex/bobby-speaking-dial68` (`8861bf44`). Branch: `codex/bobby-companion-build69`.

## Included

- One launch capability probe; educational questions and sentence-length fuzzy guesses use the companion. Follow-up chips go directly to it. Asset offers require the existing confirmation before any desk read. Friendly errors allow one retry.
- Exact six-language memory consent, with Anthropic and money questions named. Declining is remembered. No notes or context leave before acceptance.
- Eight bundled questions in six languages, four on day one and the remaining questions on return days two through five. Taps and skips are entirely local. Missed calendar days do not create catch-up days.
- Separate device-only Keychain notes, guest support, seven-day money/inferred expiry and thirty-day other expiry. Notes expose catalog wording, provenance, expiry, correction, single/all deletion and memory off. Existing desk memory and theses keep their stores.
- Context is sent only with consent and a matching enabled server capability/catalog/notice. A personalized reply displays the notes mark. Fact rendering is reserved, with source/year outside narration; the server currently sends null.
- New microphone/speech purpose strings cover answers as well as questions.

## Verification and limits

Simulator evidence, run logs and release/upload state live in `_harness/context-2026-10-10/` outside the source checkout. Spanish and German include explanations, day-one consent/options, personalized fixture replies, notes, correction, deletion and memory off. Live Tier 1 replies were observed in both languages.

At implementation time production GET returned 405 without context metadata. Tier 2 was exercised with the endpoint mocked and remains hidden in production until context capability/catalog 1 is enabled. The bundled catalog was transcribed from the approved brief; replace it with the server-owned contract catalog once that lands.

Spoken/typed answer mapping (`answer.text` → `noted`) and the day-three explanation request are deferred. While a catalog question is open, speaking or typing returns to its options without recording free text or starting a market read. Fact cards have no live reviewed-card evidence yet.

Physical iPhone microphone, speaker/echo, TestFlight installation and the live personalized journey remain separate acceptance checks. No merge, App Store submission or web deploy is part of this release. No API, server test or shared contract files were edited. Android changes visible in the PR are inherited from the explicitly selected dial68 base; this companion commit is iOS only.

## Release state

Draft PR: https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/178. A signed 1.8 (69) archive succeeded; bundled page/catalog/consent hashes match the checkout and Debug fixtures/contract are absent. Apple upload is blocked by `exportArchive Failed to Use Accounts`. No upload acceptance, processing or internal availability is claimed.

Anthony: on the Mac, open Xcode → Settings → Accounts, sign in with the developer Apple ID, and approve any sign-in request on the iPhone.

The first branch push triggered Vercel's existing automatic preview integration. That exact preview was removed; automatic previews for this branch are now disabled. Production was not promoted or changed.

The full native run exposed two existing test adapter issues: an expired fixed notification date and a WKWebView frame test without `ST`. Their fixtures now use a future date and the actual card state/window scene. Both targeted tests and the subsequent complete 1,137-test native run passed after these corrections; no notification or market-presentation implementation was changed.
