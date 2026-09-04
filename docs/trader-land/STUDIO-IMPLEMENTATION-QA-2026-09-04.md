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

## Backend deploy — synced moves (2026-09-04, late)

Scope: `api/trader-land.ts` (`action: 'move'`, fail-closed world read, 409 → "reload"),
`api/_lib/trader-land.ts` (land read fails instead of inventing an 8×8), migration
`20260904222250_trader_land_occupied_cells.sql`, `scripts/test-trader-land-cells.sql`.

Pre-flight on production (`bobby-protocol`, read-only): 0 placements, 1 land, 0 inventory,
25 items, no `tl_placement_cells` / trigger / function present → the final revalidation
`update tl_placements set x = x` could not fail.

Local gate: throwaway Postgres 17 (`initdb --locale=C`, TCP 127.0.0.1:54331) →
`scripts/test-trader-land-cells.sql` PASS (footprint, collision, rotation, core, bounds,
seed, ownership, rollback, removal); migration re-applied on the same database without
error (idempotent: `if not exists` / `or replace` / `drop … if exists`).
`tsc -p tsconfig.api.json` clean, `npm run build` clean.

Production migration: applied through the Supabase MCP `apply_migration` (the runbook's
only write path; `execute_sql` is read-only). Recorded as version `20260904222250`, name
`trader_land_occupied_cells`; the repo file was renamed to match so `supabase db push`
stays in sync. Verified: table + PK, RLS on, single `service_role` policy, grants only to
`service_role`, trigger `tl_placement_cells_reserve` on `tl_placements`.

Production smoke (write path, always rolled back — a `DO` block that ends in
`RAISE EXCEPTION`): footprint reserved (2 cells), overlap → `unique_violation`, rotation
re-reserves and releases, Aura Core / out-of-bounds / seed / foreign owner →
`check_violation`, legal move re-reserves, delete releases. Result:
`SMOKE_ROLLBACK PASS`. Post-check: 0 smoke identities, 0 cells, no smoke migration row.

Code: `16abb54` on `main` → Vercel `dpl_25GJzt5DkybbD8bEU4xSRhN6V3Mq` (production).
Probe: an unauthenticated `POST {action:'move'}` returned 400 (unknown discriminator) on
the previous deployment and must return 401 (auth) once the new function is live.

Client effect: the shipped web page gates synced moves on `world.capabilities.move`;
`world()` now returns `capabilities: { move: true }`. iOS build 15 already sends
`action: 'move'` with `placementId`.

Still open: real-iPhone gesture validation; cross-device sync check with a linked test
account (needs a signed-in identity with bloomed inventory).

Verified 2026-09-04 22:28 UTC: `dpl_25GJzt5DkybbD8bEU4xSRhN6V3Mq` READY on `bobbyprotocol.xyz`.
Unauthenticated `POST {action:'move'}` → 401 (schema now lists `place | move | remove`),
`rotation: 45` → 400, `GET` → 401. Runtime logs: only the expected 4xx from the probes, no 5xx.

## Shared worlds (2026-09-05, early) — "que la gente pueda ver los mundos de los demás"

Two layers, web first:
1. **Worlds gallery** `/agentic-world/bobby/trader-land/worlds` — the five districts with their
   real pieces (art from the manifest, names from `tl_items`), then the islands the community
   published (mini isometric renders via `IslandThumb`), then how to share.
2. **Publishing** — on the studio, *Share* → name (≤40 chars) → *Publish*. The island gets a
   10-char share code and a link `/agentic-world/bobby/trader-land/w/<code>`; visitors see it
   read-only in the studio's visitor mode (no editing, no account, no builder identity).
   *Hide* flips it private; the code is kept so a re-publish restores the same link.

Data: migration `20260904230244_trader_land_public_worlds.sql` (applied on production via
`apply_migration`, version as recorded): `tl_lands.visibility/share_code/title/published_at`,
check constraints, partial unique index on `share_code`, index for the gallery. Applied twice
on a local Postgres without error; constraints rejected a bad code and a 41-char title.
API: `POST /api/trader-land { action: 'publish' | 'unpublish' }`, `world().share`, and the new
public read-only `GET /api/trader-land-public[?code=]` (CDN cache 30 s, never returns identities).
Fix in passing: the catalog id `axiom_archive_return_path` did not exist in the art manifest
(`…_return_path_curve`); both manifest loaders now alias it so the Discovery Route piece renders.

Local verification (dev server + mocked public API): gallery renders 5 districts × 5 pieces (+ core
card), 2 community cards with thumbnails and stats; visitor mode shows title, districts, no Undo,
no Share, "Construir la mía" + "Ver más mundos"; practice-mode Share panel invites sign-in.
Not verified yet: a real publish end-to-end (needs a signed-in identity on production) and iOS
(opens the web link; native gallery pending).
