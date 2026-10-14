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

Final Spanish SE3 at +1 from `bd0e14be`: **60/60 UI passed**, 65 numbered
PNGs exported under `i1a-final-se/iphone-se3-es-plus1`. Every-image visual
review is in progress. Pro full native/UI, compatibility and actual HOLD
verification remain pending; this is still **not I-1a READY**.


## I-1a checkpoint — second resume complete

Product milestone `591aaa0b`; A10 is applied and the original shared typed-background
assertion restored exactly. The two reported capture findings are corrected. A
further inspected permission-button padding defect is corrected without copy changes.

- Signed full native: **1167/1167**; Spanish Pro daily UI **60/60** (combined1227), SE3/+1 **60/60**.
- Compatibility: **18/18** offline UI; four current live methods excluded, not run: address limit.
- Actual HOLD build: **25/25** native speech plus **2/2** UI; both captures inspected. Explicit two-mode gesture JS **11/11**, language **13/13**.
- Restored TAP: page **311/311**, language **13/13** including input **1512/1512**, final legal/build guards **8/8**, permission UI **1/1**.
- Localization **1384 keys /1444 rows**; lint passed; unchanged web build passed; Android inverse **36/36**, offline server contract **716/716**.
- Frozen matrices: **130 PNGs**, each inspected; `shots-i1a/iphone-se3-es/` (+1) and `shots-i1a/iphone-17-pro-es/` (default), with indices, provenance and SHA256. Only31 replaced by the scoped padding correction; base runs retained separately.
- Immutable signed simulator app: `../_harness/ios/i1a/Bobby.app`; current signed app remains `../_harness/ios/dd/Build/Products/Debug-iphonesimulator/Bobby.app`. Version1.8/build70, TAP; bundled HTML matches generated source, strict signature verifies.
- Owned result bundles/phones removed; zero booted phones, no simulator lock.

Diagnostic distinction: a broad page run with HOLD306/311 failed five newly added
iPhone tap scenarios because their short tap correctly opens the HOLD keyboard.
Every assertion stays unchanged; no frozen cross-tree assertion failed. The brief's
full page gate is in shipping TAP,311/311; actual HOLD pins, native pipeline and both
HOLD UI flows pass. Compatibility screenshots include transition diagnostics and
are not promoted into the frozen matrix. Physical11.6 checks remain unverified.

I-1b has not changed product code at this checkpoint. SPEC4.7.6 requires six
reviewed consent previews and Claude approval before wiring that new composition;
independent first-run, handover, telemetry and keyboard work proceeds next.
