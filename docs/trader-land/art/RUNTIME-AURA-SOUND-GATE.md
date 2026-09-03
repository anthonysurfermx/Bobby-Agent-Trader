# Trader Land Aura + sound runtime gate

Date: 2026-09-03

## Scope

Runtime-only integration of `feat/trader-land-art@ec96cc5`. No XP, economy, wallet, API, Supabase, on-chain or production behavior is connected.

## Web

- Aura Core is composed from manifest layers in this order: body, ring back, floating sphere, ring front.
- The sphere floats on a seven-second sine-like cycle. Rings only pulse/tilt through non-rotational scaling. Seven motes are runtime particles.
- `prefers-reduced-motion` disables the motion layers.
- Sound is opt-in after a user gesture. The 16-second core loop stops on mute/unmount.
- Event map: select blueprint → tick; valid/invalid placement → confirm/thunk; seed/bloom → reveal/chord; fog expansion → reveal plus five-attribute chord; core pulse → rotating orbital whoosh family.
- Pointer drag, two-pointer pinch, trackpad zoom and explicit zoom/reset controls share one bounded camera.
- Measured canonical first view: 30 art requests and approximately 0.6 MB transferred locally. Atlas work is deferred: current cost is below the provisional 60-request / 2 MB gate.
- Browser check: meaningful content, no Vite error overlay, animated sphere transform changed during sampling, sound changed from off to on after a real click.

## iOS

- Uses the same manifest animation layers and the same bundled M4A cue family.
- AVAudioPlayer runs under the platform's ambient behavior, so sound is opt-in and respects device playback policy.
- Native magnify and drag gestures share bounded camera state with zoom/reset controls.
- Reduce Motion produces a static layered Core.
- `TraderLandGateTests.testSharedFixtureFogConnectorsAndPersistence`: PASS, one test, zero failures.
- Visual inspection: PASS on iPhone 17 Pro / iOS 26.1.

## Decision

This gate passes. Keep the assets un-atlased until a denser snapshot or network measurement crosses the threshold. Remote persistence and game economy remain intentionally blocked behind the infrastructure migration.
