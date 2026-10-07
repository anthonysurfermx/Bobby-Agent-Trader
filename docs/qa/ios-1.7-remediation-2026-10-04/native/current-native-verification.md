# Current native unit and contract verification

The official complete xcresult reports **536/536 Passed**, zero failed, skipped or expected failures: 534 cases in BobbyTests and two cases in NucleoContractUITests. The independently inspected recursive test tree confirms these exact case identities and results; parent nodes are not counted as tests. The repaired request-spy assertions and the added parser/profile isolation regressions pass.

Executed source: `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`, whose product changes are507616c9 and subsequent DEBUG/test repair is ecc4ff49. Own clean iPhone17Pro/iOS26.1 arm64 simulator0025, Xcode26.1.1, Debug configuration. Process exited0 after156.56seconds. The guard observed at least5.45GiB free during this run.

One internal QoS/priority inversion runtime warning is preserved. It is not a failed assertion and does not establish a physical performance defect. Earlier zero-execution infrastructure and failed/incomplete query-spy attempts remain historical; their logs are not substituted for a successful official summary.

Retained small official exports: [summary](native-unit-contract-a135d6e1-summary.json), [complete test tree](native-unit-contract-a135d6e1-tests.json), [execution and hashes](native-unit-contract-a135d6e1-execution.json), [full text log](native-unit-contract-a135d6e1.log). The original xcresult is preserved at `/private/tmp/bobby-ios17-remediation-20261004/native-unit-contract-a135d6e1.xcresult`.

This verifies local simulator unit/contract behavior. Remaining UI classes, Release/signing, TestFlight processing/install, physical WebKit/voice/authentication/notifications and Store payment lifecycle have their own acceptance gates.
