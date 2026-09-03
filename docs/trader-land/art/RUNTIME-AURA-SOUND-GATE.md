# Trader Land Aura + sound runtime gate

Date: 2026-09-03

## Scope

Runtime-only integration of `feat/trader-land-art@ec96cc5`. No XP, economy, wallet, API, Supabase, on-chain or production behavior is connected.

## Web and iOS parity

- Both runtimes compose the Aura Core as body, ring back, floating sphere and ring front from the shared manifest.
- Rings pulse without rotating; the sphere floats; orbital motes are runtime particles; reduced-motion settings stop animation.
- The shared audio family is opt-in and maps placement, invalid placement, seed, bloom, fog and core-pulse events to distinct cues.
- Both runtimes provide bounded pan, pinch/zoom and reset controls.
- Canonical web load measured 30 art requests and approximately 0.6 MB, below the provisional atlas gate.
- Web production build: PASS.
- iOS simulator build: PASS.
- Native fixture/fog/connectors/persistence UI test: PASS, one test, zero failures.

Remote persistence, XP, economy, wallets, Supabase, on-chain behavior and production deployment remain out of scope.
