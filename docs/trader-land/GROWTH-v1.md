# Trader Land — Growth v1 (horizon tiers, repeating pieces, growing island, movable core)

Approved by Anthony 2026-09-19 ("Lo que tú me recomiendas está bien").
Replaces the 8-piece Discovery Route that ran out on day 3–8 for a daily user.
This file is THE contract for the backend, web and iOS implementations. When code and this file
disagree, this file wins; change it first.

## 1. Rules (product)

1. **One question = one seed.** Every completed read plants one seed. The daily cap stays at
   `MAX_DAILY_AWARDS = 3` plants per local day; a capped read plants nothing (unchanged).
2. **Patience decides the piece.** A seed carries a *horizon*: how long its thesis plays out before
   it can be reviewed.

   | hours | tier       | footprint | catalog kinds (DB `kind`) |
   |-------|------------|-----------|---------------------------|
   | 24    | `common`   | 1×1       | ground, path, decor (15)  |
   | 72    | `building` | 2×1       | building (5)              |
   | 168   | `landmark` | 2×2       | landmark (5)              |

   A read plants at 24 h. The builder may **extend** a seed to 72 h or 168 h: upward only, only
   while the review has not opened (`now < seeded_at + horizon_hours`). Extending re-points the
   seed to the next piece of the new tier. Whatever the verdict (hit / invalidated / expired), the
   piece blooms at review: patience is what earns it, P&L never does. XP/Aura per close are unchanged.
   A respected NO TRADE blooms the next `common` piece at once (never a building).
3. **Pieces repeat, in the open.** Each tier has a fixed sequence (`tl_items.tier`, `tier_index`).
   A player's next piece of tier T is `sequence[n mod len]`, where `n` = inventory rows of that
   player with `source = 'route'` whose item is in tier T, in any state. When a seed is extended,
   the common slot it held is released (the next common read gets that piece again). No randomness.
4. **The island grows.** `tl_lands.size` goes 8 → 10 → 12 → 16, never back. After a placement,
   if occupied cells (all placement cells + the 4 core cells) ≥ threshold, the island grows one
   step: 8×8 at 39 cells → 10×10 · 10×10 at 60 → 12×12 · 12×12 at 87 → 16×16. Growing adds rings
   around the island: every placement and the core shift by `(next − size) / 2` on both axes.
   The island keeps its on-screen extent; tiles shrink (`src/lib/trader-land/geometry.ts`).
   Growth is only triggered by a client that declares support (header, §3), because every shipped
   iOS build (1.1 (26) live, 1.2 (31) TestFlight) rejects any island whose size is not 8 and
   shows "This island version is not supported yet". An account only grows after it used a new
   client; old clients on that account then show that message until they update.
5. **The Aura Core moves and wakes.** Its 2×2 position lives on the land (`core_x`, `core_y`,
   default 3,3). On an account island the builder can move it like a piece (tap it → Move); it
   cannot be stored or rotated. It starts **dormant** (`core_stage = 0`: stage0 art, static, drawn
   at 72 % of its stage-1 size, `DORMANT_CORE_SCALE`) and **wakes** (`core_stage = 1`: stage1 art,
   animated, full size) once 5 pieces stand on the island. Waking is permanent.
   Existing islands: stage 1 if they already have ≥ 5 placements, else 0 (migration backfill).
6. **The practice island** (signed out, `-trader-land-gate` tests, web demo) stays 8×8 with the
   core fixed at 3,3, stage 1, not movable. Only account islands change.

### Tier sequences (`tl_items.tier`, `tl_items.tier_index`, set by the migration)
- `common`: 1 `crypto_bay_data_dock`, 2 `crypto_bay_water_walkway`, 3 `risk_reef_dual_orbit_antenna`,
  4 `thesis_citadel_risk_shield`, 5 `evidence_mines_crystal_vein_rock`, 6 `axiom_archive_return_path`,
  7 `axiom_archive_aura_flower`, 8 `crypto_bay_context_buoy`, 9 `evidence_mines_open_tunnel`,
  10 `evidence_mines_lantern_drone`, 11 `thesis_citadel_wall_slab`, 12 `thesis_citadel_fortified_ramp`,
  13 `risk_reef_reef_tile`, 14 `risk_reef_blue_sluice`, 15 `axiom_archive_archive_ring_tile`
- `building`: 1 `thesis_citadel_double_gate`, 2 `crypto_bay_candle_tower`,
  3 `evidence_mines_evidence_workshop`, 4 `risk_reef_red_team_observatory`, 5 `axiom_archive_lit_archive`
- `landmark`: 1 `crypto_bay_waiting_lighthouse`, 2 `evidence_mines_mother_crystal`,
  3 `risk_reef_double_bridge`, 4 `thesis_citadel_three_gate_citadel`, 5 `axiom_archive_base_ring_seal`

Season I (`source = 'season'`, executed-on-Base theses) is unchanged and never counts toward `n`.
Every tier id above is a bundled manifest id on iOS (old builds skip unknown ids).

## 2. Database (migration `trader_land_growth`, additive, safe under the deployed API)

File: `supabase/bobby-protocol/supabase/migrations/<timestamp>_trader_land_growth.sql`.
- `tl_items`: `tier text check (tier in ('common','building','landmark'))`, `tier_index smallint`,
  unique `(tier, tier_index)`; backfilled for the 25 items above (`route_index` stays, unused).
- `tl_inventory.horizon_hours smallint not null default 24 check (horizon_hours in (24, 72, 168))`.
- `tl_lands`: `core_x smallint not null default 3`, `core_y smallint not null default 3`,
  `core_stage smallint not null default 0 check (core_stage in (0, 1))`; `tl_lands_size_check` →
  `size in (8, 10, 12, 16)`; `tl_lands_core_inside` check `core_x >= 0 and core_y >= 0 and
  core_x + 2 <= size and core_y + 2 <= size`. Backfill `core_stage = 1` where the land has ≥ 5
  placements.
- `tl_reserve_placement_cells()` (same trigger) reads `size, core_x, core_y` from `tl_lands`
  `for share` and rejects the core rectangle `[core_x, core_x+2) × [core_y, core_y+2)` instead of
  the hardcoded 3..4. Everything else in it is unchanged.
- RPCs, all `language plpgsql`, `security invoker`, `set search_path = public, pg_temp`,
  `revoke execute … from public, anon, authenticated; grant execute … to service_role`, each
  returning `jsonb` `{ ok: true, … }` or `{ ok: false, error: '<code>' }` (no exceptions for
  expected refusals):
  - `tl_grant_piece(p_identity uuid, p_event uuid, p_state text, p_hours smallint default 24)` —
    ensures the land row, locks it `for update`, computes the tier from `p_hours`, `n`, the item
    `sequence[n mod len]` among active items, inserts the inventory row (`source 'route'`,
    `event_id`, `bloomed_at` when bloomed, `horizon_hours`) `on conflict (identity_id, event_id)
    do nothing` and returns the existing row on a replay. Returns
    `{ ok, inventory_id, item_id, tier, horizon_hours, state, held }` (`held` = n after the insert).
  - `tl_extend_seed(p_identity uuid, p_inventory uuid, p_hours smallint)` — locks the land, then
    the seed `for update`; errors `not_found` | `not_seed` | `not_upward` (p_hours ≤ current or not
    in 72/168) | `review_open` (`now() >= seeded_at + horizon_hours`). Picks the next item of the
    new tier (the seed itself excluded from `n`), updates `item_id` + `horizon_hours`. Returns
    `{ ok, inventory_id, item_id, tier, horizon_hours, review_at }`.
  - `tl_move_core(p_identity uuid, p_x int, p_y int)` — locks the land `for update`; errors
    `outside` | `occupied` (any `tl_placement_cells` row inside the target rectangle). Returns
    `{ ok, core_x, core_y }`.
  - `tl_grow_land(p_identity uuid)` — locks the land `for update`; sets `core_stage = 1` when ≥ 5
    placements; then while occupied ≥ threshold(size) and size < 16: `delete from
    tl_placement_cells where identity_id = p_identity`, update the land (new size, core + shift),
    then update each placement `x + shift, y + shift` **one row at a time in descending `x + y`
    order** (`tl_placements_one_per_cell` and the cells PK are checked per row; the trigger
    re-reserves each row's cells). Returns `{ ok, grew, from, to, shift, size, core_x, core_y,
    core_stage }` (`grew` false and `from = to` when nothing changed).
- `scripts/test-trader-land-growth.sql` exercises all of the above on a throwaway local Postgres
  (see `scripts/test-trader-land-cells.sql` for the harness: `LC_ALL=C initdb --locale=C`, TCP-only
  `pg_ctl`, never production).

## 3. HTTP API

Clients that implement this contract send **`X-Trader-Land-Client: 2`** on every
`/api/trader-land` request. The web always sends it; iOS builds after 31 send it.

### `GET /api/trader-land` (world) and every `POST` response — all additions optional for readers
```
land: { size, theme, visibility, share_code, title, published_at,           // existing
        core: { x, y, stage: 0 | 1 },
        growth: { occupied, threshold: number | null, nextSize: number | null } }
inventory[i]: { …existing,
        horizon: { hours: 24 | 72 | 168, tier: 'common'|'building'|'landmark',
                   reviewAt: ISO string, extendable: boolean, extendTo: number[] } }  // extendTo ⊆ [72,168]
inventory[i].review.reviewAt = seeded_at + horizon_hours (still a non-null string: old iOS requires it)
tiers: [ { id, hours, footprint: [w, h], length, held, next: PieceSummary } ]       // common, building, landmark
route: { index: held_common mod 15, total: 15, next: next common PieceSummary, complete: false }  // legacy, for build 31
review: { windowHours: 24, ready }                                                   // legacy, unchanged
capabilities: { move: true, close: true, extend: true, moveCore: true, grow: true }
```
`PieceSummary = { id, world, attribution, kind, name: { en, es }, footprint: [w, h] }`.

### `POST /api/trader-land` actions (new ones)
- `{ action: 'extend', inventoryId, hours: 72 | 168 }` → `tl_extend_seed`. Response
  `{ ok, extended: { inventoryId, item: PieceSummary, horizon: {…as above} }, ...world }`.
  Errors: 404 `not_found`, 409 `{ error: 'This seed already bloomed' }` (`not_seed`),
  409 `{ error: 'Its review is already open', reviewAt }` (`review_open`),
  400 `{ error: 'A horizon can only grow' }` (`not_upward`).
- `{ action: 'move_core', x, y }` (ints 0..15) → `tl_move_core`. Response `{ ok, coreMoved: { x, y },
  ...world }`. Errors: 400 `{ error: 'Outside the island' }`, 409 `{ error: 'The island changed.
  Reload and try again.' }` (occupied — same message as a placement collision).
- `place`: bounds are the land's size and the core rectangle from the land (no hardcoded 3,3).
  When the request carries `X-Trader-Land-Client: 2`, after a successful placement the API calls
  `tl_grow_land` and adds `grew: { from, to, shift } | null` to the response (world re-read after).
- `move`: bounds/core from the land as for `place` (no growth on move).
- `close`: readiness uses `seeded_at + horizon_hours`; the bloom CAS also matches
  `horizon_hours=eq.<value read>` so a concurrent extend makes the close fail with 409.

### `POST /api/progress` — response shape unchanged, additive fields only
`results[i].world` stays a RouteGrant `{ routeIndex, item, inventoryId, state, bloomedInventoryId:
null, routeComplete: false }`, now filled by `tl_grant_piece` (read → seed 24 h common, NO TRADE →
bloomed common). Additions: `horizon: { hours: 24, tier: 'common', reviewAt, extendable, extendTo }`
for a seed, and `tiers: { common: PieceSummary, building: PieceSummary, landmark: PieceSummary }` =
what a 24 h / 3 d / 7 d horizon would bloom into (building/landmark = next of that tier; common =
the seed's own piece), so the desk can preview the choice. `routeIndex` = `min(held_common, 8)`
and `bobby_progress.route_index` stays capped at 8 (iOS 1.1 shows `routeIndex/8`).

### Public (`/api/trader-land-public`, share card)
Public worlds add `core: { x, y, stage }`. `size` was already public. The share card draws the
island at its size with `geometry.ts`, the core at its position/stage; `cardVersion` includes the core.

## 4. Clients

### Geometry (web: `src/lib/trader-land/geometry.ts`; iOS mirrors it in `GateLayout`/`LandSpriteGeometry`)
```
N = land size;  tileW = 92·8/N;  tileH = 46·8/N;  origin = (430, 391 − (N − 1)·tileH/2)
iso(c, r) = (origin.x + (c − r)·tileW/2, origin.y + (c + r)·tileH/2)
sprite: frame side = min(360·8/N, tileW·(w + h)/2·0.9/visibleWidth) · scale; the art's anchor sits on the
        footprint's BOTTOM vertex (ground = centre.y + tileH·(cols + rows)/4); rotated pieces mirror.
core:   2×2 at (core.x, core.y); stage 0 → stage0 albedo (+glow), static, scale 0.72; stage 1 → animated.
```
Slab corners, island centre, canvas and the archipelago layout never change. Max camera zoom
scales by N/8; for N ≥ 12 the "home" zoom is 1.25 so 1×1 tiles stay tappable. Stroke widths and
fixed hit boxes scale by `8/N`.

### Behaviour both clients implement
- Accept sizes 8/10/12/16 (iOS drops its `size == 8` guard; public islands of any size are drawn).
- Draw and reserve the core from `land.core` (account island) or the public payload (neighbours);
  fall back to 3,3 stage 1 when absent (older server).
- Tap the core on an account island → selection "Aura Core" with a **Move** action (no Store, no
  Rotate) → draft of a 2×2 with uid `aura-core` → Confirm posts `move_core`.
- Clear undo/draft state when a response changes `land.size` or `land.core`; show a notice when a
  place response has `grew` ("Your island grew to 10×10" / "Tu isla creció a 10×10").
- Show growth progress (e.g. "10×10 · 22/60") in the island footer, and the core state.
- Seeds show their horizon and tier; while `horizon.extendable`, offer the `extendTo` options
  ("3 days · building 2×1" / "7 days · landmark 2×2") with the next piece of that tier
  (`tiers[].next`), and a confirm step ("You can't shorten it later" / "No se puede acortar después").
- Desk, right after a read: the harvest/seed card shows the planted piece and the same horizon
  choice (24 h selected, 3 d, 7 d) — iOS extends through a standalone authenticated POST (not
  `TraderLandSync`); the web adds the missing seed card (today the web shows nothing).
- NO TRADE: bloomed 1×1, no picker.
- Copy: "one question = one seed, patience decides the piece"; no "discovery route complete",
  no "8 × 8 island that does not expand". Spanish and English.
- iOS `TraderLandFocus` gains `.seed(inventoryID: String)` (scroll to the reviews list, highlight it).

## 5. Rollout
1. Apply the migration on bobby-protocol (qbvdqkknnuweatptjohi) via MCP `apply_migration`, rename
   the repo file to the version it records. Additive: the live API keeps working (core default
   3,3 = today's rule; `tl_grant_piece` unused until the API ships).
2. Merge + deploy API and web together; verify GET world and a public island in production.
3. iOS: build after 31 (island name + growth) to TestFlight.
