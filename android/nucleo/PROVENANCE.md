# Android Núcleo source provenance

The renderer reference is **iOS 1.7 (build 61)**, PR #140, commit `bfdc16dfe9ce947f11bbcbd4f447ffc62d0f1e92`. The canonical source was read using `git show` from that exact commit. Android incorporates the daily and first-read layout fixes, full synthesis/scenario text, six-language debate role captions, separate sphere/pill hints, readable consent scrolling, fresh native microphone-permission queries, regional company chip labels, French/Portuguese informal copy and language-aware greeting times.

The page half of Bobby 1.8 (the nudge, `ask.start`) and of the follow-ups' slice 1 came later, from the iPhone page at `harness/ios-slice1`: commits `630e01b3` (the next question is the first chip when the voice ends) and `37155fe0` (a chip says its words were Bobby's, the row goes quiet at the wall, the tighter check). They were applied to the Android copy as patches, hunk by hunk; the Android adaptations below were kept. `android/README.md`, "The next question, and who wrote the words", lists every file that still differs from the iPhone copy and why.

## Android adaptations

- `src/shared/10-bridge.js` retains `BobbyNucleo`, correlated asynchronous JSON replies, the 180-second timeout, native `receive`, and protection against mock transport replacing native transport. Account/consent events remain supported.
- `src/app/20-gl.js` keeps the approved pure sphere when WebGL is unavailable (`COMP_IN_GLASS=false`). Companion art is not placed inside the fallback sphere.
- Sign-in labels and the neutral account glyph remain Android-specific. Subscription confirmation copy names Google Play in all six languages.
- Both pages describe the Android microphone permission and on-device-only dictation. A native `consent` response is handled defensively; the Android recognizer currently has no cloud fallback and does not return that state.
- The visible-read acknowledgment observes two settled foreground frames and resets the count after backgrounding. It invokes `read.rendered` only when the native bridge advertises that method. The agreed Android native contract validates the current read and returns an explicit negative acknowledgment while server receipt transport is unsupported; its native implementation and tests are coordinated separately. The canonical server currently binds telemetry only to iOS/web and rejects the Android platform. No Android read_done is invented or sent; matching server telemetry remains a parity gap. The acknowledgment is best-effort and never delays the reading interface.
- `risk-notice.json` is authored source for notice version 6. It retains the AI and narration-provider disclosures, describes on-device-only Android dictation and no retained dictation audio, and uses informal French and Portuguese. Existing exact-version policy requires renewed acceptance; no prior consent is silently upgraded.

## Preserved product media and catalogs

`companions.json`, the 18-companion roster, existing imagery and the 36 bundled English/Spanish selection clips retain their original release-54 provenance: `/Users/mrrobot/Documents/Codex/2026-10-02/pa/work/bobby-release54`, commit `7385ec9c`. This renderer refresh does not replace them. Other selection-preview languages continue to use available offline Android voices. Live narration remains native and consent-gated.

`native-translations.json` preserves the original native catalog. The separate `native-android-translations.json` overlay supplies French, Portuguese, Italian and German strings for native Android screens. This renderer task does not rewrite that overlay.

## Build and verification

`python3 android/nucleo/build.py --release` validates and copies the authored Android risk notice and generates the release pages into `android/app/src/main/assets/nucleo/`. `--output` can generate into a scratch directory. The builder excludes development mocks, fixtures and the contract page, enforces a no-network CSP, and checks the combined JavaScript syntax. Kotlin owns account state, market data, metering, speech, narration and persistence.

`node --test android/nucleo/tests/*.test.mjs` exercises the authored Android source, including measured-height card/consent layouts, complete debate text, six-language rules, short-tap/hold behavior, account isolation, consent withdrawal and bridge correlation. Public sample responses live only under `tests/fixtures/`. These tests do not prove physical-device layout, dictation, audio delivery, account synchronization, purchases or store distribution.
