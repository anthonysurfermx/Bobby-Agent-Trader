# Trader Land Studio — implementation and verification

Status: implemented locally, not deployed. The broader visual/functional goal
remains open until device gestures and authenticated cross-device behavior pass.

Final availability audit: `xcrun xctrace list devices` reports no connected iOS
hardware; all registered iPhones/iPads are offline. Tool discovery still exposes
no Supabase connector. The same external validation dependency has persisted
across three goal turns. Work is blocked pending a connected iPhone, a linked
test account and access to the confirmed Bobby staging backend. No production
release or successful cross-device validation is claimed.

## Working surfaces

- Web: `Bobby-Agent-Trader-genz-ux`, branch `codex/genz-ux-trader-land`.
- iOS: `.claude/worktrees/ios-login`, branch `codex/ios-base-swaps`.
- The original checkout was left untouched because it contains unrelated work.
- No commits, pushes, production migrations, account grants, or trading actions.

## Delivered locally

- Full-screen island, responsive collection, district navigation, visual cards,
  camera controls, quiet green/cream UI, existing layered artwork retained.
- Explicit build/move preview, rotated multi-tile footprints, confirm/cancel,
  collision feedback, return to collection, and undo.
- Web pointer pan/pinch/drag, anchored wheel zoom, keyboard placement controls.
- Visible 44px drag handles on both clients. Drag translation preserves the
  initial grab point, including grabs from a multi-cell piece's second tile.
  New previews prefer a free side tile rather than spawning behind the core.
- The web build/move detail is fixed outside collection scrolling, matching the
  native sticky action area.
- iOS dedicated gesture recognizers, cached images and luminance masks, grid
  outlines, sticky build/move actions, sound lifecycle cleanup, accessible tiles.
- Practice storage is separate from the earned inventory on both platforms.
- New iOS authenticated world client uses the existing account token and
  `/api/trader-land`; reads and mutations preserve the last confirmed state.
  Errors require a reload before another mutation. Account changes invalidate
  requests and clear the previous island. No practice data is uploaded.
- API move support and fail-closed reads: unavailable placement/catalog data is
  not treated as an empty island.
- Database migration reserves all footprint cells with a unique key so concurrent
  writes cannot overlap. It validates ownership, bloom state, bounds and the core.

## Verified

| Surface | Evidence |
| --- | --- |
| Web production build | `npm run build` passes, including API TypeScript check. Existing vendor chunk-size/annotation warnings remain. |
| Web UI | Real browser checks: place, move, overlap rejection, 2x1 rotation, undo, reload persistence, pan, keyboard movement. Desktop and 390px mobile inspected. |
| Final web DOM | 64 tiles, zero broken images, no horizontal overflow at 1280x720. |
| Web grab behavior | Dragging the 2x1 preview by its handle moved (0,0)→(1,0); dragging its second tile then moved (1,0)→(2,0), with camera position and scale unchanged. |
| Small mobile controls | At 320x568, cancel/rotate/place stayed within the viewport and were each 44px tall. At 390x844, the selected-piece action remains fixed while the collection scrolls. |
| Shared drag geometry | 38 cases each in JavaScript and Swift pass across five zoom levels, including tiny movements, diagonal movement and grid bounds. |
| iOS build | `xcodebuild ... build` and `build-for-testing` pass for simulator. The authored UI test suite compiles; it was not executed as an automated suite. |
| iOS UI | Dedicated iPhone 17 Pro simulator: 8→9 pieces after confirm; occupied core rejected; move keeps 9; undo keeps 9; reopening restores 9. Rotated 1x2 preview accepted at (6,5), rejected at (6,6) under practice focus. Cancel does not place it. |
| iOS sync contract | Standalone Swift test passes decoding, account authorization, rotation, move, conflict handling, reload recovery, timeout handling, identity isolation, and sign-out. All requests intercepted by URLProtocol. |
| Database rules | Isolated local PostgreSQL tests pass full footprints, collisions, rotation, reserved core, bounds, seeds, ownership, rollback and removal cleanup. |
| Concurrent database writes | Two local SQL sessions attempted overlapping footprints with different origins: exactly one saved piece and its two reserved cells; the other transaction failed with a uniqueness conflict. |
| Patch hygiene | `git diff --check` passes in both worktrees. |

## Reproduce local contract checks

From `ios/Bobby` in the iOS worktree:

```sh
swiftc -parse-as-library Sources/TraderLandSync.swift scripts/TraderLandSyncContract.swift -o /tmp/trader-land-sync-contract
/tmp/trader-land-sync-contract
swiftc -parse-as-library Sources/TraderLandGeometry.swift scripts/TraderLandGeometryContract.swift -o /tmp/trader-land-geometry-contract
/tmp/trader-land-geometry-contract
```

From the web worktree: `node scripts/test-trader-land-gestures.mjs`.

For database tests, use `scripts/test-trader-land-cells.sql` only against an empty,
isolated local PostgreSQL database. It creates fixture tables and roles; never
point it at production. The temporary test cluster used here was stopped after
verification. Its files remain under `/tmp/trader-land-db.X8m2Gb` for inspection.

## Release gates still open

1. Verify native drag and two-finger pinch on a real device. The computer-control
   drag tool repeatedly reported no available window, including for the new
   handle, so gesture code is
   implemented but those gestures are not signed off. Tap-to-move is verified.
2. Test the same linked identity in web and iOS against a staging backend with
   the new move handler and migration. Contract mocks do not prove live sync.
3. Apply the migration through Supabase MCP to the confirmed **Bobby** project,
   not the older DeFi Mexico project. No Supabase MCP was available in this run;
   the migration has NOT been applied remotely. Existing invalid layouts make
   the migration roll back instead of silently deleting or moving pieces.
4. Review the release baselines before publishing: the web files match the
   starting versions on local `origin/main`, but the native iOS app is absent
   from that ref and lives on its separate iOS branch. Do not push either entire
   feature history as a substitute for reviewing integration.
5. Run the normal signed app path and authenticated island on device. The
   unsigned simulator hit a pre-existing Reown wallet-pairing/keychain startup
   crash. Only the debug `-trader-land-gate` fixture skips wallet initialization;
   normal and Release startup behavior is unchanged.

The user-facing preview is `http://127.0.0.1:8080/trader-land` while the local Vite
server is running. Neither that preview nor the simulator is a production release.
