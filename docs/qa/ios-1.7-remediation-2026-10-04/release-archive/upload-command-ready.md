# Executed build 63 candidate upload: Apple accepted

The user has authorized upload. Root coordinates execution after UI acceptance and the Claude review. Root triggered this exact command after the completed QA/Claude review; Apple upload acceptance is now confirmed by the separate receipt.

```sh
python3 /private/tmp/bobby-ios17-remediation-20261004/native/archive63-wrapper.py upload --expected-head be3e8b1389294e7d477a77b87e107f044ea3f55e --out /private/tmp/bobby-ios17-remediation-20261004/archive63-r2 --qa-input-receipt /private/tmp/bobby-ios17-remediation-20261004/archive63-r2/qa-test-only-input-receipt.json
```

Run in the authorized outside-sandbox Xcode/signing context. Use the verified archive63-r2/Bobby-1.7-63.xcarchive; the default archive63 path preserves the first failed signing-configuration attempt. The command reuses the existing manual ExportOptions-63-Upload.plist, preserves 1.7/63 and does not request automatic provisioning updates. It requires at least 3 GiB free at upload launch and stops its own process group below 2 GiB.

`--expected-head` binds to the preserved archive preflight (be3), not a later docs/test commit. Current source verification keeps 749 input hashes strict and permits only the exact three riskNoticeVersion6 launch-argument additions in StoreShots.swift, proven to belong only to BobbyUITests and excluded from the Release archive target. It does not ignore test directories generally. Product/resources/project/scheme/cache/export-options remain bound to the original hashes. Eight meaningful guard cases passed, including product drift, receipt tampering and wrong archive attribution rejection; the signed archive was reverified after the test-only commit. See [guard checks](../native/archive63-qa-input-guard-checks.json) and [exact approved delta](retry/qa-test-only-input-receipt.json).

Preserve upload-phase/xcodebuild.log, phase-receipt.json and upload-acceptance.json. Exit 0 without an explicit upload-success marker is not upload acceptance. Apple acceptance, TestFlight processing, draft build attachment, review submission and physical installation each require separate receipts.

Execution completed: [explicit Apple acceptance](retry/candidate-upload-receipt.json), [phase result](retry/upload-phase/phase-receipt.json) and [full Apple log](retry/upload-phase/xcodebuild.log). No App Review submission or publication was performed. Do not execute this already completed upload again.
