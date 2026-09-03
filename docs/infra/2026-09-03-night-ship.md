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

## Full gate on production 7f4bdcb
`GATE PASSED` — **183/183** (policy matrix incl. the 8 new tables, canaries, legitimate path
through the API). Evidence: `evidence/2026-09-03-gate-passed-production-7f4bdcb.txt`.

## 5. One identity across web and iOS (615e6df) — after Codex's review of d1d2dd3

Codex was right: the web (wallet session) and the phone (Apple) each created their own
`bobby_identities` row and nothing joined them, so "same XP on both" was false. Now:

- `bobby_link_identities(keep, merge)` (migration 0007, applied): atomic merge —
  ledger, inventory and pre-calls re-parented, the merged land dropped (pieces back to
  inventory), wallet moved to the kept row, progress **recomputed from the union of the
  ledgers** (xp, aura, streak, distinct route positions), refuses two different accounts
  or wallets.
- `/api/identity-link`: `issue` (6-char code, 10 min, single use) / `claim` (merges the
  code's identity into the caller's). Either door can do either.
- Web: the "Guardado" pill opens a link panel (generate a code / paste one).
- iOS: the account sheet claims a code from the desk or generates one.
- Probe on production (`evidence/2026-09-03-identity-link-probe-production.txt`): wallet
  identity 30 XP + auth identity 10 XP → after claim **one identity, 40 XP on both
  doors**, wallet attached, `linkedAuth=true`, code single-use (404 on reuse), a second
  account trying to claim the linked identity → 409.

Correct statement of the capability today: **iOS syncs progress across installs and
devices that use the same Apple ID; linking with the desk's wallet session takes one
6-character code, once.**

## 6. iOS login (branch `ios/apple-login`, d1d2dd3 → 32648b6)
Anthony enabled the Apple provider on the `bobby-protocol` Auth (client id
`xyz.bobbyprotocol.bobby`, no OAuth secret — native only, users without email allowed)
and the App ID capability. The app now has: `AccountSession` (native Sign in with Apple
with nonce → `auth/v1/token?grant_type=id_token` → Keychain, refresh on demand),
`ProgressSync` (every award queued on the phone, reported to `/api/progress` with the
access token, server state applied back, first sync claims pre-sign-in XP),
`AccountSheet` from the desk menu ("Save progress"). Entitlement
`com.apple.developer.applesignin` added via project.yml. Codex fixes in 32648b6: award
queue keyed per account (`bind` on sign-in migrates the anonymous queue once; another
Apple ID starts from server state; `signOut(store:)` detaches), sync drains the queue in
batches of 50 with no truncation, `applyServer` also applies `lastDay` /
`dailyAwards` / `dailyAwardsDay`, link-code UI, `CURRENT_PROJECT_VERSION` 13. Builds on
Xcode 26.1.1; the sheet and the Apple button verified in the iPhone 17 Pro simulator.
The real Apple round trip still needs a device with an Apple ID: build 13 is prepared in
the project, **not yet archived or uploaded** to TestFlight.

## Open
- Trader Land UI wiring and `art_url` (other session).
