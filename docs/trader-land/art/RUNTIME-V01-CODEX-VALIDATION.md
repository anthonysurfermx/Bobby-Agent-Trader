# Trader Land runtime v01 — Codex validation

Date: 2026-09-03  
Art snapshot: `feat/trader-land-art@ba17923`  
Runtime branch: `codex/trader-land-runtime-v01`

## Outcome

The complete catalog now runs in the hidden React integration route `/internal/trader-land-gate-a`. This is still a local QA vertical: it is not linked from product navigation and performs no API, wallet, database, XP, or on-chain writes.

The implementation reads `asset-manifest.json` at runtime and fails closed when the layer contract or the full 27-item catalog is absent. There is no per-asset lookup table in the UI.

## Implemented

- 8×8 isometric island with a fixed 2×2 Aura Core.
- Five district inventories sourced from all 25 catalog lots.
- 1×1, 2×1, and 2×2 footprint placement with collision checks.
- Focus reveal from the inner 6×6 ring to the full 8×8 island.
- Fog blocks placement until a cell and the complete footprint are revealed.
- Green/red full-footprint placement preview.
- District pavement sprites with renderer-owned procedural filaments.
- Path connectors inferred from adjacent path cells; isolated paths use the selected orientation.
- Bloom/seed switching while preserving identical geometry.
- Manifest-defined luminance-mask decoding for shadow and glow layers.
- Isometric depth ordering from normalized anchor Y.
- Undo, canonical restore, and local persistence across reloads.
- Explicit copy that adjacency is cosmetic and grants no XP or trading advantage.

## Verification evidence

- Production build: passed.
- Manifest: 27 items, 166 referenced runtime URLs, 0 missing files.
- Browser: meaningful content, no Vite error overlay, 0 broken images.
- Fog gate: placement in an unrevealed cell rejected without changing the object count.
- Reveal: focus state changed from 1/2 to 2/2 and persisted.
- 2×1 building and 2×2 landmark placements: accepted only when the complete footprint was free.
- Seed state: loaded with 0 broken images.
- Reload: placed-object count and focus ring restored from local storage.
- Visual QA: top-row tall landmarks no longer clip after increasing the stage's vertical safe area.

## Deliberate boundaries

- The route remains internal and must not be promoted as the product screen yet.
- Aura/XP is represented only as local focus state; canonical progress integration waits for the migration and its own review.
- Path animation, sound, pinch zoom, pan, and production save/sync are the next vertical layer.
- No atlas is produced until the final phone cell size is locked.

## Claude review follow-up

The non-blocking review notes were incorporated before the parity gate:

- `world-snapshot-v01.json` is now the canonical initial state for both renderers.
- The first load uses `albedo_512.webp`; 1024 PNG remains the fallback and future high-zoom source.
- Sprite scale derives from normalized `contentBounds` and footprint width instead of fixed canvas sizes.
- Derived seeds now use the manifest's actual single-variant shape; the earlier harness incorrectly expected a nested `variants` object and only appeared dimmer because glow was disabled.
- A load-order race that could persist an empty world before the fixture arrived was caught and fixed. The fixture wins on first load; local persistence is enabled only after it is available.

## Suggested next gate

Promote this renderer contract into a shared world-state model, then make web and iOS consume the same snapshot fixture. The next acceptance test should compare placement, fog, and connector outputs for that fixture on both platforms before adding persistence APIs or rewards.
