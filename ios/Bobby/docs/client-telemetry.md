# Native client telemetry — local validation, 2026-10-03

The iOS client emits first-party foreground, background and 30-second active-foreground heartbeat observations. Each foreground epoch uses a new random session UUID; account generation changes discard queued events, receipts and the previous session. An inactive permission/control-center transition pauses the heartbeat without inventing a background transition. The existing random install identity and BobbyAccessAPI device/platform/authentication headers are reused.

`POST /api/client-telemetry` uses schemaVersion 1, eventId/sessionId UUIDs, sequence, captured occurredAt and optional app version/build. No question, symbol, read content, email, account identifier or bearer appears in the event body. The timestamp and logical order are captured at enqueue, preserved for a retry. The server owns receipt verification and presence expiry. A missing heartbeat is not proof of a crash or of an offline person.

The in-memory best-effort queue holds at most 24 events and 8 read references, with a 5-second whole-transport deadline, no lifecycle retries and one read-event retry retaining the same event ID/timestamp/sequence. Queued lifecycle observations expire after 5 seconds; reads after 30 seconds. Background/inactive/account changes cancel pending sends; nothing is persisted for later replay. Unit-test hosts and recorded-fixture mode suppress the production telemetry transport.

Núcleo forwards its request UUID to desk-debate. A successful, valid final response may contain telemetry:{requestId,receipt}; a missing receipt preserves the existing reading behavior and cannot produce received/rendered confirmation. Receipts are limited to 1024 bytes and remain native. read_received records validated response reception. read_rendered requires the trusted bundled app page to acknowledge the latest completed read after two actual animation frames with a settled, nonempty result card intersecting the viewport, with no native sheet or hidden page. Native rejects unknown/older requests, busy desk, old account/foreground epochs and background acknowledgments. The DEBUG classic desk observes start/reception but has no presentation claim. WebKit content-process termination emits webview_terminated while retaining the original page-reload behavior; no app-crash event is invented.

Verified locally:

- Xcode Debug app and test targets compiled for iPhone 17 Pro simulator, iOS 26.1. Existing marketing version/build remain 1.6 (54).
- 64/64 selected XCTest cases passed: 11 telemetry/queue/receipt/lifecycle, 1 real WKWebView animation-frame test, 35 bridge tests and 17 account-isolation tests.
- 48 Node tests plus 38 read-model assertions passed across shipping bundled-page sources, including 4 new presentation tests.
- Release bundled HTML was regenerated offline from the source with build.py --release, and JavaScript syntax checks passed. This is bundled-resource generation, not an archived or distributed release.
- Two pre-existing refusal goldens were updated only to include bonus: 0, matching the existing BobbyReadAccess.json contract. The first run detected those stale fixtures; the final run passed.

Final command:

```sh
xcodebuild test -project Bobby.xcodeproj -scheme Bobby -configuration Debug \
  -destination 'platform=iOS Simulator,id=29853E44-D7C5-4733-B06C-D39800CAE8A7' \
  -derivedDataPath /private/tmp/bobby-live-native/DerivedData \
  -clonedSourcePackagesDirPath /Users/mrrobot/Library/Developer/Xcode/DerivedData/Bobby-flqrxqdbxsiduqazbauqycyybreq/SourcePackages \
  -disableAutomaticPackageResolution -skipPackageUpdates -parallel-testing-enabled NO \
  -only-testing:BobbyTests/BobbyTelemetryTests -only-testing:BobbyTests/NucleoPresentationTelemetryTests \
  -only-testing:BobbyTests/NucleoBridgeTests -only-testing:BobbyTests/AccountIsolationTests CODE_SIGNING_ALLOWED=NO
```

Evidence:

- Log: /private/tmp/bobby-live-native/xcode-test-final.log
- XCResult: /private/tmp/bobby-live-native/DerivedData/Logs/Test/Test-Bobby-2026.10.03_00-59-19-+0100.xcresult
- Adjacent client-telemetry-evidence.json records source/log hashes and baseline provenance.

Not verified: physical-device behavior, real signed receipt acceptance against production, production dashboard data from an installed build, background delivery under actual iOS suspension, App Store/TestFlight build installation, crash reporting or release/distribution. No deployment, archive, upload, transaction, real AI/TTS request or remote mutation was performed. Shipping the API alone cannot establish native emitter coverage in an already installed app.
