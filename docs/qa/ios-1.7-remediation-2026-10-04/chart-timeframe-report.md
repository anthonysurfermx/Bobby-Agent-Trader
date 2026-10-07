# P2-a candle timeframe remediation

The current iOS and web transports fetch hourly candles independently of the desk's requested analysis horizon. Successful replies now expose `candlesTimeframe` from the same constant that builds both candle provider URLs. The chart reads that interval and the final plotted candle timestamp. When explicitly declared candle and analysis intervals differ, support/resistance, band, bracket and plan overlays are omitted from the hourly plot and do not expand its domain. Separate thesis, debate and plan cards retain their analysis data. Existing replies without candle metadata keep the explicit legacy provenance fallback.

Source at verification: modified worktree `/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader`, HEAD `393776c332b2c3f6e21d6cad457869431dd28a62`, project version 1.7/build 63. Full current hashes of the 13 owned source/test/documentation files are in `chart-timeframe-results.json`; shared contract and Swift test hashes include the earlier QA expectation changes, which were preserved.

| Check | Result | Evidence |
|---|---|---|
| iOS/shared Node runner | 165 passed, 0 failed | `nucleo-suite-after.log`; 42 new candle/schema cases |
| Initial 40 behavioral cases on unfixed source | 0 passed, 40 failed | `chart-timeframe-before.log` |
| Scripted web transport | 280 assertions passed, 0 failed | `web-transport-after.log`; actual ask routing, both provider URLs and read-model mapping exercised with local HTTP replies |
| New web transport cases before metadata fix | 254 assertions passed, 26 failed | `web-transport-before.log` |
| Golden normalization | BTC and NVDA exactly reproduce updated goldens; missing recorded interval rejected | `normalized-goldens-after.json` |
| Supplemental negative controls | 20 in-memory source mutations detected | `chart-timeframe-mutations.json`; not added to unique test totals |
| Whitespace/diff validation | Passed | `git diff --check` |
| Native Swift fixture integration | Added; root owns execution | `NucleoBridgeTests.testChartCandleMetadataUsesItsProviderIntervalForEveryAnalysisHorizon`; checks BTC/NVDA hourly URLs and metadata for 1H/4H/1D/1W questions |
| Generated iOS/web resources and native build | Root owns regeneration and validation | This agent did not generate resources or run Xcode |

The regressions cover both actual read-model source trees, BTC/NVDA recorded captures, wait/review reads, all six UI locales, matching 1H, explicit 4H/1D/1W mismatches, legacy 1H replies, enum casing, invalid final timestamps, strict rejection of missing/wrong current contract metadata, retained analysis cards and no mutation of analysis provenance. The normalizer derives its expected candle interval from the recorded provider request rather than copying the desk horizon.

Key source locations: native constant at `ios/Bobby/Sources/Nucleo/NucleoDesk.swift:196`, native result field at `:932`; iOS chart mapping at `ios/Bobby/Nucleo/src/shared/20-read-model.js:735`; web chart mapping at `nucleo/src/shared/20-read-model.js:583`; web constant/URLs at `nucleo/src/web/30-web-desk.js:83` and result field at `:326`; strict contract fields at iOS `src/contract/10-contract.js:75` and web `:63`; native regression at `ios/Bobby/Tests/NucleoBridgeTests.swift:186`; new scripted transport block at `nucleo/tests/web-transport.test.mjs:205`.

These are offline unit and mocked transport results. They do not establish live provider behavior, physical-device acceptance, purchases, archive identity, TestFlight processing or remote deployment. The legacy fallback cannot reconstruct a candle interval omitted by an older response. No commits, backend calls, payments, phone installs, Xcode builds or resource regeneration were performed by this agent.
