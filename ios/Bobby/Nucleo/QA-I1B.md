# Bobby I-1b review checkpoint

Final typing product `f3747980ca08d81ecde05af582e959e9c776c351`; restored TAP signed-build source `795e434cbc68a1c7aba318d25b0c6078a1226287`.
Non-TYPING base matrix/movie product is recorded per image in provenance.json.
Branch `codex/bobby-18-answers-first`; draft PR #183. I-1a `e5f0741b` remains the accepted checkpoint.
Build 1.8 (70), signed Debug simulator, offline fixtures only.

| Gate | Result | Evidence under H |
| --- | --- | --- |
| Generic iOS Release compile | passed; unsigned device compile only | i1b-release-compile.log / .json |
| Signed DEBUG fixture regression after Release guard | 5 passed | i1b-release-debug; 2 native + privacy2 + asset first-run hand-over UI |
| Native unit and frozen legal/build guards | 1172 passed | i1b-final-compat/iphone-se3-es-plus1/summary.json (1190 combined) |
| Offline native UI compatibility | 18 passed | Same run; CompanionBuild69UITests, NucleoPrivacyUITests, SpeakingDialUITests |
| TAP page JS, including retained cross-tree safety | 327 passed | i1b-final-shipping-page.log |
| Offline language suites / actual input pipeline | 13 passed / 1512 passed | i1b-final-shipping-languages.log |
| Android inverse and shared cases | 67 passed | i1b-shipping3-android.log |
| Localization catalog | 1384 unique keys / 1444 rows passed | i1b-shipping3-audit.log |
| Spanish SE3 +1 and Pro default | 86 passed each | i1b-shipping3-se-es and i1b-shipping3-pro-es |
| German SE3 +1 and Pro default | 86 passed each | i1b-shipping3-se-de and i1b-shipping3-pro-de |
| Targeted composer routes, four es/de phones | 10 passed each | i1b-typing-final-*; seven current typing PNGs each |
| Portuguese Pro consent and answer | 2 passed | i1b-shipping3-pro-pt |
| Actual HOLD fallback | 32 passed (25 native + 7 UI) | i1b-final-hold; original2 UI, NotNow, held append, whole placeholder, no field microphone, retained background draft without stale caption |
| Unchanged web build | passed | i1b-shipping3-web.log |
| Lint | exit0, 514 warnings, 0 errors | i1b-shipping3-lint.log |

Each 86-test matrix contains 54 daily-state captures, 12 without-help tests,
14 first-run tests and 6 additional intro/field/placeholder/discard/primer guarantees.
All seven SPEC4.11 flows passed on every es/de configuration, including outside tap and reopening with the draft intact.

H: `/Users/mrrobot/Developer/GitHub/bobby-wt/_harness/redesign-2026-10-10`. Final captures: [440 individually reviewed PNGs](/Users/mrrobot/Developer/GitHub/bobby-wt/_harness/redesign-2026-10-10/shots-i1b/index.md),
with per-device test/source/SHA256 provenance. Partial natural birth frames are diagnostic only.
Twelve recordings cover the four es/de configurations: normal hand-over, early-touch hand-over and intro.
The four normal hand-over recordings preserve the complete hold-to-first-answer transition;
relative-frame findings are in each folder's motion-review.json. Full intro and early-touch hand-over clips are included.
Only XCTest termination tails were removed from the final clips; original clip hashes,
relative cut times and final clip hashes are retained. All twelve final end frames were inspected.
No older failed run or superseded styling is promoted. Raw diagnostic runs remain under H with their actual results.

Signed review build: [/Users/mrrobot/Developer/GitHub/bobby-wt/_harness/ios/i1b/Bobby.app](/Users/mrrobot/Developer/GitHub/bobby-wt/_harness/ios/i1b/Bobby.app); signature and hashes in [/Users/mrrobot/Developer/GitHub/bobby-wt/_harness/ios/i1b/provenance.json](/Users/mrrobot/Developer/GitHub/bobby-wt/_harness/ios/i1b/provenance.json).
The frozen HTML matches current generated source and the final typing product exactly.
The complete base matrices and non-TYPING movies use f0b39bc3. The only subsequent
change to the shipping DEBUG UI was first-run TYPING-caption visibility, proven by
the exact source diff and unchanged daily HTML. The later Release guard is described below.
Twenty-eight composer PNGs were replaced after ten targeted UI cases passed on each es/de phone.
Every image has its actual product commit; restoring HOLD to TAP changed only generated build metadata.
The final 1190 compatibility run uses the clean signed-build source above, after the Release fix.
The earlier 1188/2 diagnostic is retained and not claimed as green. Its privacy fixture
launches inherited Spanish despite hardcoded English selectors and looked for the old
first-run asset question. The test launch now specifies app.language=en, the approved
educational example and the daily retry after hand-over; all legal, scroll, short-tap,
persistence and withdrawal assertions remain.
The Release fix adds only two DEBUG
conditional directives around the companion fixture block; removing them recovers exact
pre-fix source. Release now compiles, and two native fixture cases, both privacy checks and actual first-run
asset hand-over passed on the rebuilt signed DEBUG app. No visible code or HTML changed. Owned result bundles and created capture simulators are removed; no simulator lock or booted device is retained.

## Scope and pin inventory

Approved consent, four complete body lines before the fade, NotNow, question-free re-consent,
hold hint and T18 bounds landed together in `5cd22184`. The two A11 shared cases are named in [TREES.md](TREES.md):
"the keyboard gives way: with nothing typed it closes, and words they had typed are there the next time it opens"
and "a row rebuilt under a native sheet draws nothing out of place, and is right again when the sheet has gone".
Only their iPhone expectations changed; Android branches and every guard remain. T8 native home pins retain ownership/reporting and now establish full-name educational order and wall behavior.
The original shared typed-background assertion and HOLD/native safety pins are retained.

First-run RAM hand-over is account-bound, single-use, timed and cancelled on background/withdrawal/account change.
Telemetry requires current risk acceptance. Keyboard/field microphone/held draft and A10 are exercised by actual UI fixtures.
Release guard: NucleoSession’s inner companion fixture block names a DEBUG-only type.
It is now enclosed in DEBUG, with the existing generic signed-out fixture safety retained.
The additional mandatory Release gate compiles generic iOS with signing disabled only
for that compile; simulator builds remain signed. Its exact command is in
H/i1b-release-compile.json. No archive or device installation was performed by Codex.

Legal risk-v6 and memory-1 text remain byte-for-byte frozen; no authored diff under api/, src/, android/ or nucleo/.
No archive, Apple upload or merge. I-2 and I-3 have separate briefs and were not started.

## Not verified by this checkpoint

Four live test methods were excluded, not run: the brief forbids live calls from this Mac after its address allowance was exhausted.
Real recognition, calls/Siri, route changes, silent-switch behavior, echo, haptics, VoiceOver usability and physical timing remain unverified on a real iPhone (SPEC11.6).
G1 TAP approval and the G6 real-device silent-switch check remain open; all owner gates of SPEC13 are separate from this local checkpoint.
This evidence makes no TestFlight, App Review, production or real-payment claim.
