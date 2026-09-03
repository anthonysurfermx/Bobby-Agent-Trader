# Gate A v2 — Codex runtime validation

Date: 2026-09-02  
Art snapshot: `feat/trader-land-art@515ffbd`  
Web harness: `codex/trader-land-gate-a-review`  
iOS harness: `codex/trader-land-gate-a-ios`

## Verdict

**GO for the remaining art pipeline, conditional on paths staying procedural.** Do not spend credits on another generated path orientation. The model bias is real and the renderer can express straight, corner, T and cross topology from connector data with one district pavement tile.

The six-master snapshot passes the runtime gate in both React and native SwiftUI:

- the complete 8×8 island is legible on an iPhone viewport;
- 1×1, 2×1 and 2×2 footprints place and reject collisions consistently;
- albedo, glow and footprint-derived shadow layers compose without missing bundle resources;
- sprite order follows the isometric anchor Y, including the Aura Core;
- the rock's derived seed remains recognizable and visibly quieter than bloom;
- NE–SW and NW–SE procedural channels preserve one topology and one visual weight;
- undo, restore and local persistence work without wallet, API, XP or production writes.

The `shadow_1024.png` variants are grayscale luminance masks, not alpha PNGs (`hasAlpha: no`). Runtime must map luminance to alpha and tint the result black at about 55% opacity; drawing them as ordinary images produces opaque black squares. The glow variants are also opaque RGB/gray canvases and need luminance mapped to alpha before screen/additive composition. The validated implementations use SVG color matrices on web and Core Image (`CIMaskToAlpha` / `CIColorMatrix`) on iOS. This is a renderer contract, not an art regeneration request.

## Automated evidence

- Web production build: passed.
- Browser smoke: placement, invalid footprint, immediate undo, restore and persistence after reload passed.
- iOS simulator build: passed on iPhone 17 Pro / iOS 26.1.
- Native UI test `TraderLandGateTests.testPlacementPersistenceCollisionAndRestore`: 1 test, 0 failures. It covers restore to seven objects, placement to eight, persistence across app relaunch, invalid 2×1 placement at the grid edge, orientation change and final restore.

## Contract for paths

Store paths as connector data, not directional art:

```text
connectors: [NE, SW]          -> straight NE–SW
connectors: [NW, SE]          -> straight NW–SE
connectors: [NE, SE]          -> corner
connectors: [NE, SW, SE]      -> T junction
connectors: [NE, NW, SE, SW]  -> cross
```

The renderer owns the emissive filament, flow animation and seed/bloom intensity. Art supplies only the district pavement/albedo. Adjacency remains cosmetic and grants no XP or trading advantage.

## Non-blocking production notes

- The harness route and launch argument are QA-only; neither is linked from or visible in product navigation.
- Keep raw generations, contact sheets and diagnostics under `art/`; only runtime variants belong under `public/land` or the iOS bundle.
- Production should read the manifest rather than retain the harness's temporary lookup table.
- Add pinch zoom and pan after the vertical slice; initial load must continue to fit the whole island on a phone.
- Validate one additional seed for a tall silhouette before bulk derivation, but it does not require a new bloom or a new Higgsfield generation.

## Scope safety

No deploy, database access, wallet call, on-chain transaction, XP award or asset generation was performed by these harnesses.
