# Trader Land — web/iOS parity gate

Date: 2026-09-03  
Canonical fixture: `public/land/v1/world-snapshot-v01.json`

## Verdict

**PASS.** React and native SwiftUI now decode the same world fixture and the same 27-item art manifest. Neither renderer keeps a private initial-placement table.

## Canonical output

- Grid: 8×8.
- Initial reveal: focus 1/2, inner 6×6.
- Fixed Core: `aura_core` at 3,3 with a 2×2 footprint.
- Placed objects: 7 fixture placements plus the Core, displayed as 8 placed.
- Path topology: `path-a → SE`; `path-b → NW`.
- First expansion: focus 2/2, full 8×8.

## Shared behavior

- Manifest-driven footprint and sprite metadata.
- 512 WebP bloom albedo by default; 1024 PNG fallback.
- Seed albedo from the manifest's `derived_seed` variant.
- Sprite scale from normalized `contentBounds` and footprint width.
- Shadow and glow luminance masks decoded at runtime.
- Fog blocks placement until the complete footprint is revealed.
- Neighbor-derived procedural path connectors.
- Local undo, restore, and persistence only.

## Automated evidence

- Web production build: passed.
- iOS simulator build on iPhone 17 Pro / iOS 26.1: passed.
- Native UI test `testSharedFixtureFogConnectorsAndPersistence`: 1 test, 0 failures.
- The UI test verifies canonical count and focus, computed SE/NW connectors, fog rejection, full reveal, placement, persistence after relaunch, 2×1 edge rejection, rotation, and restore.
- Native bundle contains `world-snapshot-v01.json` and the complete `gate-A` catalog.

## Bugs caught by the parity gate

1. Web could persist an empty state before its asynchronous fixture fetch completed. Persistence now starts only after the fixture loads.
2. Web expected `derived_seed.variants`, but the manifest correctly exposes `derived_seed` as one variant. Seed now changes albedo instead of merely disabling glow.
3. Native fog overlays intercepted taps. They are now visual-only and placement validation receives the tap.
4. XCTest lost scrolled state labels. The harness exposes a fixed accessibility status and connector identifiers computed by the renderer.

## Scope

No production route, database, Supabase migration, wallet, XP, Aura reward, or on-chain state was touched. The next safe layer is Core motion and reactive sound, followed by pinch/pan. Canonical progress sync remains gated behind the infrastructure migration.
