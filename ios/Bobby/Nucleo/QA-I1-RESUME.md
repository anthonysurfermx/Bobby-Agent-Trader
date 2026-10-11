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

## Pending checkpoint

**I-1a is not READY.** SPEC 12.2 requires Claude review for an unlisted cross-tree pin change. The proposed exception is in `scripts/test-nucleo-input-pipeline.mjs`: current native/app background requires empty draft and IDLE, per Addendum A2; web, onboarding and historical-source pins retain their existing expectations. The adapter now loads the actual conversation reset and RAM declarations. Its pointer-retry assertion remains unchanged and exposed a real stale-gesture bug, now fixed. The concrete exception is posted in the shared `codex-status.md`; approval is pending. No checkpoint push or I-1b start occurred.

Visual review also found the appended dictation wrapping into a clipped second line in diagnostic `23-without-help-appended.png`. This set must not be promoted. `58-level-repriced-no-read.png` still shows the native sheet; the final repriced-state capture must wait for dismissal. The approved failure/recovered-answer composition remains intact. Frozen Spanish Pro and SE +1 matrices remain outstanding.

Interactive prototype review is unverified: browser URL policy blocked `file://`. Physical iPhone speech, audio routing, playback, haptics, VoiceOver and real purchases were not tested. Live tests remain **not run: address limit**; no production requests, archive, Apple upload, merge or authored changes to the forbidden product trees.

Both saved runs removed result bundles and owned capture simulators. No simulator remains booted.
