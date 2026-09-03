# Night ship — 2026-09-03 (Europe morning, Mexico asleep)

Anthony's brief: Bobby Protocol fully on production over the new Supabase before Mexico
wakes up — login, points, Base contracts, debates, voice, identity — and Trader Land
connected to the new database. Everything below is live on bobbyprotocol.xyz.

## 1. Migration closed (08:35–08:41 UTC)
Rollback drill end-to-end: freeze both → replay journal → legacy sequences (psql, real
`nextval`) → manifests under freeze → legacy == destination (data tables) → destination
reopened, still primary. `DRILL PASSED`. Evidence: `evidence/2026-09-03-rollback-drill/`.
Legacy `egpixaunlnzauztbrnuz` stays frozen read-only; journal armed on 32 tables.

## 2. Login + points in production (68fcdeb → ea41669)
- Identity: SIWE wallet session (web, live today) or a Supabase access token (iOS, once
  Sign in with Apple is enabled in the `bobby-protocol` dashboard) → one row in
  `bobby_identities`.
- `/api/progress`: server-owned XP rules (10 read / 20 NO TRADE / 15 thesis closed, 3
  awards a day, streak with a grace day), append-only ledger idempotent per client event,
  bounded one-time import of pre-sign-in XP. Tables service-role only (gate convention).
- Web desk: "Guardar progreso" pill → wallet sign-in → every award reconciles with the
  server; verified visually on production.
- Probe on production: 401 without session; awards 10/20/10, fourth capped at 0;
  replay detected; unknown kind 400. `evidence/2026-09-03-progress-probe-production.txt`.
- Gate A+B on production: 141/141 (`evidence/2026-09-03-gate-AB-68fcdeb.txt`); the full
  gate is queued behind the forum-publish window.

## 3. Trader Land on the new Supabase (7f4bdcb)
- `20260903000006_trader_land.sql`: `tl_items` seeded from `lot-catalog-v01.json` (25
  lots, 5 worlds × Paciencia/Claridad/Riesgo/Contradicción/Cierre, 8 on the First Light
  Discovery Route), `tl_lands` (8×8 per identity), `tl_inventory` (seed → bloomed, one
  piece per awarded event), `tl_placements` (grid, no overlap). `bobby_progress` gains
  `aura` and `route_index`.
- Rules (SYSTEM-DESIGN v0.2): a read plants a seed, a respected NO TRADE blooms, a closed
  thesis blooms the oldest seed; aura 2/6/6; deterministic route, no chests, no odds.
- `/api/trader-land`: GET world (land, inventory with items, placements, route next/total,
  catalog); POST place / remove with ownership, bloomed-only, bounds, footprint and
  overlap checks.
- Probe on production: read → seed, NO TRADE → bloom, route 2/8, place 200, re-place
  409, seed refused 409, remove 200, thesis_closed blooms the seed, anon 401.
  `evidence/2026-09-03-trader-land-probe-production.txt`.
- Pending for the world's UI (other session): `art_url` per item once the web atlases
  land in `public/trader-land/`; the catalog JSON is already served at
  `/trader-land/lot-catalog-v01.json`.

## 4. Base / voice / identity smoke on the new production
Voice `/api/bobby-voice-free` → 200 audio/mpeg (61 KB); MCP `tools/list` → 22 tools;
`/api/agent-identity` OK; Base reads: block 50.8 M, TrackRecord 1 commitment, mcpFee
0.000025 ETH; Base signer `0xdf475d7d…f4ec` holds **0.001245 ETH** (enough for a few
commits; top up before a busy day). Last daily cycle 2026-09-02 12:01 UTC (0 trades);
the next one runs at 12:00 UTC on the new database.

## Open
- Full gate run for 7f4bdcb (queued, waits for the forum-publish window).
- iOS: enable Sign in with Apple in Supabase Auth (dashboard) and point the app's
  progress sync at `/api/progress` with the access token.
- Trader Land UI wiring and `art_url` (other session).
