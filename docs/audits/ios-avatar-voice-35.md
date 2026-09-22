# Bobby 1.2 (35): avatar narration, forge and bilingual consistency

Date: 2026-09-22. Base: verified `origin/main` at `6f117bf7ec78cb5c479ecde8a2ec8de1f3a604bc`. This revision supersedes the first build-35 candidate from `540f8bd`.

**Latest candidate:** the subsequent [persistent-mute revision](ios-avatar-voice-mute-35.md) retains these fixes and adds the remembered voice control. Its archive is `output/avatar-voice-mute-35/Bobby-1.2-35-final.xcarchive`. The evidence below describes the earlier voice-consistency revision.

## Changes

The requested onboarding order is **choose a companion (1/3) → aura machine (2/3) → Chill / Direct / Pro (3/3)**. The scan still gates its Next button, including the existing eight-second render timeout. Selecting or tapping a companion previews its introduction; the last step previews its current style and lets the user compare all three.

The machine's original hum and four charge assets have been restored from project history. Scan milestones play charge cues, completion stops the hum and plays the aura chime. A playback session with mixing replaces the ambient session that respected the silent switch. Leaving onboarding or backgrounding stops the players; resuming an unfinished scan restarts the hum.

The complete offline voice catalog contains **108 clips**: 18 companions × 2 languages for introductions, plus 12 persona IDs × 3 styles × 2 languages. Forty previously missing clips have been generated through the existing persona TTS endpoint, checking `X-TTS-Provider: openai` before saving. Four unclear Spanish samples were rerecorded after transcription review, including one of the existing 68 clips. English and Spanish use the same assigned persona, and style IDs map to the endpoint's delivery settings.

Desk narration no longer forces `mode: free`, which selected one generic Edge voice for every avatar. Normal narrated answers now request the same persona and style as the previews. This uses the existing metered TTS route; it is output narration, not an interactive conversation session. Server/provider outage fallback may still use a generic provider or on-device speech; it cannot promise identical timbre in that degraded mode.

The Squad gallery now observes narration and drives the selected avatar's talking animation, stopping the previous voice when browsing or closing. A stale playback or speech-cancellation callback can no longer stop a newer avatar's mouth animation. Broken bundled audio also falls back to the existing narration path. The speaker still stops active audio and invalidates pending responses.

## Catalog coverage

| Companion | Persona | English introduction | Spanish introduction | Styles in both languages |
|---|---|---|---|---|
| Bobby / Orb | ash | bundled | bundled | Chill / Direct / Pro |
| Byte | ballad | bundled | bundled | Chill / Direct / Pro |
| Kora | coral | bundled | bundled | Chill / Direct / Pro |
| Zip | sage | bundled | bundled | Chill / Direct / Pro |
| Glitch | cedar | bundled | bundled | Chill / Direct / Pro |
| Momo | marin | bundled | bundled | Chill / Direct / Pro |
| Flux | alloy | bundled | bundled | Chill / Direct / Pro |
| Rook | onyx | bundled | bundled | Chill / Direct / Pro |
| Halo | shimmer | bundled | bundled | Chill / Direct / Pro |
| Axiom | fable | bundled | bundled | Chill / Direct / Pro |
| Iris | sage | bundled | bundled | Chill / Direct / Pro |
| Sol | coral | bundled | bundled | Chill / Direct / Pro |
| Zuri | nova | bundled | bundled | Chill / Direct / Pro |
| Mira | alloy | bundled | bundled | Chill / Direct / Pro |
| Nalu | marin | bundled | bundled | Chill / Direct / Pro |
| Vega | shimmer | bundled | bundled | Chill / Direct / Pro |
| Noor | fable | bundled | bundled | Chill / Direct / Pro |
| Keo | mellow | bundled | bundled | Chill / Direct / Pro |

Shared persona IDs retain the existing character assignments; the catalog does not claim 18 unique synthesizer voices.

## Verification

- **52 successful test executions, zero failures or skips** on iPhone 17 Pro / iOS 26.1: 48 in the main run (44 unit + four English/Spanish onboarding and mute UI tests), followed by three Spanish-locale unit checks and the additional gallery UI test. These cover 49 distinct tests.
- Actual AVAudioPlayer playback and non-silent mouth meters for **all 108 bundled clips**, with network transport denied for the catalog test. Every companion/persona/style request was also checked in English and Spanish with stubbed HTTP transport and real returned MP3 playback (54 avatar/style combinations per language).
- All six machine audio assets decode and produce audible samples. Tests cover looping, scan cues, the final chime, stopping and resuming.
- FFmpeg decoded all 108 files without a short/silent result. Local faster-whisper transcripts were reviewed for language and expected phrases; ambiguous clips received a larger-model second pass. Four Spanish recordings were regenerated after unclear pronunciation. The final catalog report contains matching language labels and SHA-256 hashes for all 108 files. Automated transcription is supporting evidence, not a claim of human listening on an iPhone.
- Five UI tests verify the restored order, all three style choices, entry to the desk, English/Spanish speaker controls, and speaking/stopping when changing avatars in the Squad. Screenshots of 2/3 and 3/3 in both languages were visually inspected.
- The native boundary guard passes. An existing account test's hardcoded English support URL was corrected to use its expected device-language URL; that test passes in both locales.
- Release archive and `codesign --verify --deep --strict` pass. The archived application is `xyz.bobbyprotocol.bobby`, **1.2 (35)**, contains **108 matching MP3 hashes**, and has no microphone or speech-recognition permission.
- Archived executable SHA-256: `1ec4d123aaa6299e74e117073daf3fedd35943195eda08857ba7f279463e727c`.

An initial simulator run was interrupted by SIGTERM during a simulator restart, then canceled after losing its runner. It is not included in the passing count; the clean serialized runs above are the final evidence. No physical-device installation, push, upload or deployment was performed.

Final local artifacts are in `output/avatar-voice-consistency-35/`: `Bobby-1.2-35-final.xcarchive`, `archive-verification.json`, `tests-en.xcresult`, `tests-es.xcresult`, summaries/logs, `catalog-audit.json`, `catalog-metrics.json`, and the `screenshots/` folder. The archive uses the existing Apple Development identity; distribution export/re-signing is still separate.

The native target retains no microphone permission, speech recognizer, Realtime session client or ChatGPT route. Its `LIVE` market-status label is not a voice call. No backend, trading, cron, debate-model, PTS or web behavior changes are included.

## Reproduction

1. `python3 scripts/audit-ios-avatar-audio.py --output /tmp/avatar-audio.json` checks catalog completeness and decodes every clip through FFmpeg, rejecting short or silent audio. `--transcribe` additionally runs local faster-whisper for language/text review; install it with `uv run --with faster-whisper python ...`. Generation is opt-in with `--generate-missing` and consumes the existing persona TTS service.
2. `node scripts/check-ios-avatar-voice-boundary.mjs` checks the native feature boundary and prevents forcing generic free narration from the desk.
3. `xcodegen generate --spec ios/Bobby/project.yml`; test scheme `Bobby`, Debug, with parallel testing off, in English and Spanish. Select `AvatarVoiceTests`, `ForgeAudioTests`, `ReleaseAuditTests`, `Build34Tests` plus the five avatar onboarding/speaker/gallery tests in `ReleaseReadinessTests`.
4. Archive scheme `Bobby`, Release, destination `generic/platform=iOS`. Project version remains **1.2 (35)**. No version override is needed.

## Physical-device limit

The simulator checks actual decoded audio and playback meters, not a physical iPhone's speaker or Bluetooth route. No iPhone installation or App Store upload is part of this verification. The original `output/avatar-voice-35/` artifact is preserved; use `output/avatar-voice-consistency-35/Bobby-1.2-35-final.xcarchive` for this revision.
