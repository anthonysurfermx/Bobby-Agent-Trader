# Bobby 1.2 (35): remembered avatar mute

Date: 2026-09-22. Follows `9028620`, preserving the restored machine, onboarding order and [complete bilingual catalog](ios-avatar-voice-35.md).

## Behavior

The speaker control is available in onboarding, the desk and the Squad gallery. All three use the same `NeuralVoice` instance and device preference, `avatar.voiceMuted`. Muting immediately stops playback, resets the mouth meter and invalidates audio responses still in flight. Muted clip and narration calls return before starting playback or making a TTS request. Changing avatar or style does not enable voice again. Enabling or muting remains saved after relaunch.

The control has a minimum 44-point hit area, a state-dependent speaker icon, English/Spanish action and state labels, and a hint explaining persistence. The gallery has its own accessibility identifier so automation can distinguish it from the desk behind its sheet. The preference controls avatar narration; machine effects retain their separate playback behavior.

## Verification

- **52 distinct tests have passing results:** the main run passed 45 unit tests and five UI tests; the two additional persistence UI tests passed after correcting their ambiguous gallery selector. No failures remain unresolved. The original main result still records those two selector failures and is retained rather than rewritten.
- The eight `AvatarVoiceTests` include actual playback and audible mouth meters for all **108 clips**, denied network access for bundled samples, every companion/style request in both languages with stubbed transport, stale callback handling, saved mute, no TTS calls while muted, and rejection of an audio response arriving after mute.
- The other unit suites cover all six machine assets and playback lifecycle, release boundaries and existing build-34 behavior.
- The seven UI scenarios cover English/Spanish onboarding order and styles, English/Spanish desk mute, Squad selection and stop, and English/Spanish mute persistence across onboarding, the gallery and two app relaunches. Muted 3/3 screenshots were visually checked; the title, progress, speaker and all three styles remain visible.
- The native voice boundary script and `git diff --check` pass.
- Release archive and strict code-signature verification pass. Bundle `xyz.bobbyprotocol.bobby` remains **1.2 (35)**. All 108 archived MP3 hashes match both the audited catalog and the listening page. No microphone or speech-recognition permission is present.
- Executable SHA-256: `3f766377089138b4ce61f60731cddad96d36917a13c85f0499df2592a381dee6`.

An earlier attempt lost CoreSimulator before tests started. It is excluded from the test count. The passing results above use one dedicated iPhone 17 Pro / iOS 26.1 simulator with test parallelism disabled. These results verify decoded samples and playback state, not the speaker or Bluetooth route of a physical iPhone.

## Artifacts

Latest archive: `output/avatar-voice-mute-35/Bobby-1.2-35-final.xcarchive`. This is signed with the existing Apple Development identity; distribution export remains separate.

The same output folder includes `archive-verification.json`, the archive log, `tests-main.xcresult`, `tests-persistence.xcresult`, their logs and summaries, and `screenshots/onboarding-muted-es.png` / `onboarding-muted-en.png`. Earlier archives remain available as historical candidates.

The local listening page is `output/avatar-voice-review/index.html`, served at `http://127.0.0.1:8765/`. It presents all 18 avatars, Spanish/English, introduction and Chill/Direct/Pro samples, explicit Play/Stop and a browser-persisted mute. It uses the exact bundled recordings, stops the previous sample when changing selection, and generates no new audio. Its browser preference is independent of the native app's device preference. To reopen it, serve that folder with `python3 -m http.server 8765 --bind 127.0.0.1 --directory output/avatar-voice-review`.

No physical-device installation, push, upload or deployment was performed.

## Follow-up documents

- [Five product improvements](bobby-five-improvements-2026-09-22.md).
- [Voice-removal timeline and attribution](ios-voice-removal-timeline-2026-09-22.md).
