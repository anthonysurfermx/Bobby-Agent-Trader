# Bobby 1.8 (70): Increment 0 evidence

This preparation keeps build-69 screens, wording and normal runtime behavior. The source branch starts at `0e11b1f5` and incorporates main through `12f7c3aa` (including server PR180). The original branch and draft PR178 are retained. This branch supersedes PR178 once Increment 1 lands; it is not an Increment 1 implementation.

## Changes and decisions

- Bundle the server catalog byte for byte, decode optional `why`, and forward its localized value without rendering it. A build-69 catalog without `why` still decodes and produces its original wire shape.
- Freeze all four risk-notice titles and bodies in six languages, version 6, the memory-consent title/paragraphs/buttons, and notice ID `memory-1` in an independent test resource. Its header requires the owner's written approval before changing expected text. The existing More details label is pinned too.
- Make the iPhone source canonical in `ios/Bobby/Nucleo/TREES.md`, with the exact parity assertions and test inventory Increment 1 will need to revisit.
- Add signed, offline screenshot tooling and twelve named states. New waiting/notes hooks require both DEBUG and fixtures. They cannot affect ordinary launches or a release build.
- Repair stale test adapters and wait for accessibility disappearance after deleting notes. No assertions are removed; no application behavior is changed to make tests pass.
- Add page/localization gates to CI. No authored changes to API, web source, Android, the web Nucleo tree, or migrations. Changes inherited from build 69 or merged main are distinguished from this increment's edits.

Catalog SHA256: `980a3203aa252436ee66943e523f0557462aec8d559d1ed517247a0fb6b93b5c`. The bundled file equals `shared/harness/companion-contract-v1/questions.json` at main `12f7c3aa`. Removing only `why` yields the build-69 catalog. The shipping iPhone source tree, both HTML bundles, memory copy, and RiskNotice implementation remain byte-identical to `0e11b1f5`.

## Before changes

| Gate | Baseline |
| --- | --- |
| Native units, signed build 69 | 1,146 passed |
| CompanionBuild69UITests, all methods | 18 attempted: 14 passed, 4 failed |
| iPhone page JavaScript | 294 passed |
| Production web build | Passed |
| Native localization audit | Passed: 1,369 source keys, 1,423 rows |
| Extra language suites | Initially 10/13; repaired test adapters bring all 13/13 to green |

The raw baseline assertion results are retained. Claude's subsequent FROM CLAUDE section identifies this Mac's exhausted address allowance; the final status of the three memory/typed live cases is **not run: address limit**, not a confirmed product failure:

- `testLiveSpanishMemory`: memory consent absent; accessibility evidence contains the daily network-limit response.
- `testLiveTypedSpanishAnswers`: memory consent absent. The baseline live run also contains the German network-limit response.
- `testLiveGermanMemory`: the expected next Skip button was absent at line 330. The failure itself did not attach a hierarchy, so its exact cause is not established.
- `testSpanishCompanionAndMemory`: immediate deletion assertion raced accessibility at line 369. This test now waits for the same element to disappear; the final offline run verifies deletion and memory-off behavior.

No additional live attempts are made after recording those results, as explicitly instructed by Claude, even after the server allowance changes. The original live tests stay intact. Baseline summary and failure text are under `_harness/redesign-2026-10-10/`; no result bundle is retained after export.

## Final validation

| Gate | Result |
| --- | --- |
| Native units, signed 1.8 (70) | 1,152 passed, including 4 legal snapshot and 2 catalog tests |
| CompanionBuild69UITests, offline methods | 14/14 passed; four live methods deliberately excluded |
| iPhone page JavaScript | 298 passed |
| Language suites | 13/13 passed (input adapter: 1,512 assertions; output: 279; regional: 939) |
| Companion server contract on merged main | 667 checks passed |
| Production web build | Passed again after merging PR180 |
| ESLint | Passed |
| Native localization audit | Passed: 1,369 source keys, 1,423 rows |
| Signature / app metadata | `codesign --verify --strict` passed; 1.8 / 70 |
| RedesignShots | Pending es/de × SE3/17 Pro, default text size |

## Capture evidence

Pending visual review and promotion to `_harness/redesign-2026-10-10/shots-i0/`. Every run retains named PNGs, an index, summary, log and export manifest. Result bundles and throwaway simulators are removed after export. Only one simulator is booted at a time; the shared DerivedData and SourcePackages caches are reused with package resolution disabled. No archive, Apple upload, deployment or live purchase is part of this increment.
