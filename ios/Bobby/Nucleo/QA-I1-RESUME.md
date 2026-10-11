# Increment 1 resume — 2026-10-11

Source product milestone: `3f642664`, branch `codex/bobby-18-answers-first`.
The interrupted session was preserved first in `60f439d1`; its backup remains untouched.

Fresh local verification, fixtures only:

- Signed Debug simulator build and native unit tests: **1166/1166 passed**, including the purpose/primer pairing guard and frozen legal guards.
- Page JS: **306/306 passed** after regenerating both bundled release pages.
- Offline language suites: **13/13 passed**; actual input pipeline **1512/1512 passed**.
- Localization audit: **1384 keys / 1444 rows**, passed.
- Unchanged web production build: passed. Simulator app signature: verified.
- Focused Pro UI: **11/11 passed**, 15 diagnostic screenshots inspected individually. The combined focused run was **18/19** because its newly added unit guard compared localized Spanish with the English base plist; that guard was corrected and passes in the fresh full native run.

Harness evidence root: `../_harness/redesign-2026-10-10/` relative to the worktree.
Native summary: `resume-native-final/iphone-17-pro-es/summary.json`.
JS and language logs: `resume-page4.log`, `resume-languages2.log`.
Diagnostic captures: `resume-focused/iphone-17-pro-es/`, with manifest and index.
Signed app: `../_harness/ios/dd/Build/Products/Debug-iphonesimulator/Bobby.app`.

## Second resume: A10, 2026-10-11

Claude refused the cross-tree exception and corrected A2 through A10. The original
all-surface `background/foreground events do not submit or discard a typed draft`
assertion is restored exactly. The adapter still loads the actual lifecycle helpers.
Pointer ownership, pending permission and native speech are cancelled on background;
visible typed/heard drafts, failures with retry UUID/previous, and the answer remain
in RAM. Native formats the original limit deadline again on return.

`NucleoBridgeTests.testConversationRetryKeepsUUIDLanguageQuestionAndPreviousAndNeverReadsMarket`
now expects the kept retry after background, per A10. The HOLD pins in
`NativeSpeechPipelineTests` and the input pipeline remain unchanged.

The field now measures after its actual width, font and button padding are placed,
grows in complete lines up to four, and scrolls beyond that. Capture 58 waits for
absence of the native level sheet. Neither previous diagnostic set is promoted.

Current fast gates: page **311/311**, input **1512/1512**, language **13/13**,
localization **1384 keys / 1444 rows**, untouched production web build passed.
Corrected signed native suite passed **1167/1167** (including legal guards and A10 UUID/deadline tests). Fixture UI and the frozen Spanish Pro / SE +1 matrices are pending;
**I-1a is not READY** until those results and every image are reviewed.

Evidence is under `a10-*` at the shared harness root. The initial `a10-focused`
binary predates the native A2 pin inversion and the deadline snapshot addition;
keep its results as diagnostics and use the corrected rerun for completion.

Interactive prototype review remains unverified (the earlier browser blocked
`file://`). Physical iPhone speech, audio routing, playback, haptics, VoiceOver and
real purchases are unverified. Live tests remain **not run: address limit**.
No live request, archive, Apple upload, merge or authored forbidden-tree change.
