# TestFlight voice identity regression — September 30, 2026

## Evidence

- User heard Apple's system narration instead of the selected Bobby companion during a BTC reading on physical TestFlight. Exact installed build was not independently established.
- Source: NeuralVoice used an 8-second network timeout, switched analyses to AVSpeechSynthesizer on HTTP/transport/playback failure, and did not retry transport errors.
- Production short Spanish persona probe: HTTP 200, X-TTS-Provider openai, 57,600 audio bytes, 2.55 seconds.
- Production analysis-length Spanish persona probe: HTTP 504 / FUNCTION_INVOCATION_TIMEOUT, 30.26 seconds. Vercel runtime logs confirm the timeout on deployment dpl_HQbRn8tQ1R85nKRvpF3Ca26WXE4y. This reproduces the fallback path; it does not establish the exact provider failure in the user's session.

A repeated production analysis-length probe succeeded: HTTP 200, OpenAI MP3, 604,032 bytes, 6.98 seconds. This establishes an intermittent failure, not reliable success for every request.

## Local correction

- NeuralVoice never calls AVSpeechSynthesizer.speak after network failure.
- Transport and server failures retry once, preserving persona/vibe. Invalid requests and throttling end without immediate retry.
- Stop/mute cancel in-flight requests and discard late responses.
- Requests require playable audio from the selected persona provider; no silent Edge substitution in persona mode.
- Bounded 20-second attempts; native/page watchdogs permit both attempts. Failure produces one bridge end event and a localized message while the analysis remains readable.
- Backend changes are local in the separate app-review-backend worktree: 12-second abort signal for OpenAI synthesis, persona-only mode, explicit failure at exhausted/unavailable paid budget, no Edge identity substitution. No production deployment performed.

## Tests and limitations

Initial 16 native voice tests passed. Final rerun passed 15 tests and exposed one outdated assertion expecting no mode field; that test was updated to require persona mode and passed in a targeted rerun. All 16 voice tests are now verified across those final runs. 39 JavaScript tests passed. Backend persona checks, four routing checks and 51 App Review regression checks passed with mocked services.

Test artifacts: /private/tmp/bobby-voice-fix.xcresult, /private/tmp/bobby-voice-fix-native.log, /private/tmp/bobby-voice-fix-js-final.log, /private/tmp/bobby-voice-backend-regression.log.

The existing installed TestFlight build is not fixed by local edits. Build 49 is the corrective candidate. A verified archive/upload and physical TestFlight check are required. Do not label another task's uploaded build 48 as containing this correction without matching its source and archive. No App Review submission or production release performed.

## Final candidate status

Archive 1.5 (49) succeeded at /private/tmp/bobby-release-20260930/Bobby-1.5-49.xcarchive. Info.plist verifies build 49 and payments still disabled. Upload was attempted through Xcode but the native Go To dialog did not respond, so there is NO upload receipt for this corrective build. Backend deployment is awaiting explicit authorization requested in this chat. The correction is not yet available on the user’s installed TestFlight app.
