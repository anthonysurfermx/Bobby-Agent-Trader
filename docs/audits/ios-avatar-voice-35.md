# Bobby 1.2 (35): restore avatar narration

Date: 2026-09-22. Base: verified `origin/main` at `6f117bf7ec78cb5c479ecde8a2ec8de1f3a604bc`.

## Product boundary and correction

The clarified requirement disables the interactive Live/ChatGPT features while retaining avatar voices. The previous release used `NeuralVoice.enabled = false` for both narrated responses and bundled avatar clips, and hid the speaker and voice-style preview. That switch treated all audio as part of the removed conversation feature.

Build 35 restores only avatar narration. The switch is now explicitly named `avatarNarrationEnabled`. The desk speaker can mute/enable narration, onboarding previews the companion's voice style, and avatar selection clips play again. The narrator's URLSession is injectable so playback can be verified without production requests.

The native target has no microphone permission, speech recognizer, Realtime session client, or ChatGPT route. Its `LIVE` market-status label is not a voice call. No backend, cron, debate model, PTS, or web code changes are included. Existing TTS provider selection, free desk narration, and device-speech fallback remain intact.

## Verification

- Final serialized simulator run: **40 passed, 0 failures, 0 skipped** on iPhone 17 Pro / iOS 26.1. Four new tests use the real AVAudioPlayer and bundled MP3 speech, with only HTTP transport stubbed. They verify non-silent metered samples, completion, the TTS request/persona, missing-clip fallback, stopping playback, and discarding audio received after mute.
- Two UI tests verify the three-step onboarding/voice-style preview and the accessible desk speaker's mute/enable controls. Existing account and debate regressions also pass.
- `node scripts/check-ios-avatar-voice-boundary.mjs` passes: the native source/target includes none of the microphone, recognition, Live-session, or ChatGPT endpoint integrations checked by the guard.
- One production TTS smoke request using a generic greeting and `mode: free`: HTTP 200, `audio/mpeg`, provider `edge`, 26,352 bytes, 24 kHz mono, 4.392 s of audio; response took 1.63 s. No interactive session or financial operation was requested.
- Release archive succeeds; `codesign --verify --deep --strict` succeeds. The archived Info.plist reports `xyz.bobbyprotocol.bobby`, marketing version **1.2**, build **35**, no microphone/recognition permission. The archive includes 68 MP3 clips.
- Archived executable SHA-256: `5907c9ca2668e6b3bc3433e186a48516d31324e2d59b5daf266fd9e581370b88`.

The old account test `Build34Tests.testDeletionSendsTheAccountClientHeaderAndShowsAppleManualSteps` assumes an English Apple support URL, so run this suite with `-testLanguage en -testRegion US`. An initial Spanish run exposed that existing test assumption. An intermediate rerun was terminated with SIGTERM; the final isolated run above completed cleanly. No account behavior was changed.

## Reproduction and local artifacts

Generate the Xcode project with `xcodegen generate --spec ios/Bobby/project.yml`. Build/test scheme `Bobby`, Debug, on an available iOS simulator, with parallel testing off and en-US test language. Select:

- `BobbyTests/AvatarVoiceTests`
- `BobbyTests/ReleaseAuditTests`
- `BobbyTests/Build34Tests`
- `BobbyUITests/ReleaseReadinessTests/testAvatarVoiceStyleReturnsToOnboarding`
- `BobbyUITests/ReleaseReadinessTests/testDeskCanMuteAndRestoreAvatarNarration`

Archive scheme `Bobby`, Release, destination `generic/platform=iOS`. No version override is needed: project.yml contains 1.2 / 35.

Local ignored output directory: `output/avatar-voice-35/`:

- `Bobby-1.2-35.xcarchive`: signed with the existing Apple Development identity. Distribution export/re-signing has not been performed.
- `final-tests.xcresult`, `test-summary.json`, `final-tests.log`: the clean final test run.
- `archive.log`, `tts-smoke.mp3`: build and TTS evidence.

## Remaining device check

No upload, deployment, or iPhone installation was performed. The simulator proves that the player decodes non-silent samples; it does not certify the physical iPhone's output route. On a connected iPhone, verify a voice-style preview, an avatar selection clip, and a narrated verdict through the built-in speaker and the usual Bluetooth route. Confirm mute stops audio and backgrounding stops speech. Live/ChatGPT must remain unavailable.

The verified release base is 1.2 (34), and the user explicitly requested build 35. The earlier tentative 1.3 mention was not used to invent a marketing-version change.
