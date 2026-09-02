# Trader Land — plan v0.1 (2026-09-02)

> **Documento histórico.** La especificación activa es
> [`SYSTEM-DESIGN-v0.2.md`](./SYSTEM-DESIGN-v0.2.md). El brief de producción
> para Claude + Higgsfield está en
> [`HIGGSFIELD-ASSET-BRIEF-v0.2.md`](./HIGGSFIELD-ASSET-BRIEF-v0.2.md).

> Focus Tree earns you tiles for attention. Trader Land earns you tiles for
> **discipline**. The world is a picture of how you behave in the market, not
> of how much you trade or how much you made.

Status: concept + schema + gamification for review (Codex + Kimi K3). Nothing
here is built yet except the teaser (map popup "SOON" in web + iOS, shipped
2026-09-02). Everything below is proposed, not decided.

---

## 0. What Focus Tree does, and what we copy

What we verified about Focus Tree (focustree.app, App Store listing, growth
write-up):

- A **session** (study timer, apps blocked) is the unit of value.
- Every completed session drops **tiles / items** you place on an isometric
  **garden** grid. "Discover your reward" moment at the end of each session.
- Gardens are **visible to friends**; there are **shared gardens** for groups,
  streaks you can see on each other, and community **challenges**.
- Growth came from TikTok creators + a very aesthetic-first design (audience
  ~80% female, 13–22), CAC ≈ $0.10/install through creators.

What we copy: session → reward reveal → build your world → friends see it →
group base → challenges → seasons.

What we change: the session is a **Desk Session** (open the desk, run the
three-agent analysis on one asset, decide, log the decision). The reward is
for the *quality of the decision process*, never for the trade itself.

## 1. Non-negotiables (from Bobby's rules)

1. **Never reward volume, frequency or P&L.** No XP, Aura, drops, quests or
   leaderboards can depend on number of trades, size, or profit.
2. **Bobby never executes.** Trader Land reads decisions; it never places
   orders, never holds keys, never connects to an exchange to *do* anything.
3. **Analysis, not advice.** The game layer cannot nudge anyone toward a
   trade ("trade now to get the tile"). Rewards are symmetric for NO TRADE.
4. **Caps.** Awards are capped per day and per week (today: 3 awards/day).
   The land grows at most a few tiles a day for everyone, whales included.
5. **Server awards, client renders.** The client never writes XP/Aura/items.
   One RPC awards; everything is ledgered.
6. **Free drops only.** Real money buys cosmetics with known content. No paid
   loot boxes, no paid odds.

## 2. Core loop

```
open desk ─▶ desk session (asset → 3-agent debate → verdict)
        ─▶ your decision (plan with invalidation | NO TRADE accepted)
        ─▶ quality score (0–100) computed server-side
        ─▶ reward reveal: XP + Aura + a drop (tile / building / decor)
        ─▶ build: place it on your land (30 s of play)
        ─▶ share / visit squad base / react
```

Session quality (server-computed, all boolean-ish, all discipline):

| Signal | Points | How we know |
|---|---|---|
| Read the full analysis (scrolled to the end, ≥ N seconds on it) | 25 | client telemetry, server-verified timing |
| Accepted a NO TRADE verdict (or logged NO TRADE yourself) | 25 | decision record |
| Logged a thesis with **entry, stop and invalidation** | 25 | thesis record present and complete |
| Waited for confirmation (thesis trigger is a close, not a market order) | 15 | thesis trigger type |
| Came back to close the loop (marked the thesis hit / invalidated / expired) | 10 | thesis resolution |

Score → Aura: `aura = round(score / 10)` (0–10 per session). XP keeps today's
rule (20 NO TRADE / 10 actionable), cap 3 awards/day, streak with 1 grace day.

Pity + rarity for drops (free, odds shown in-app): common 70 % · rare 22 % ·
epic 7 % · legendary 1 %. Guaranteed rare every 7 sessions, epic every 30.

## 3. The world

- **Isometric grid**, 2:1 tiles, night palette, neon green/blue accents,
  chunky low-poly (same direction as the map teaser).
- Grid grows with level: 8×8 (L1) → 12×12 (L4) → 16×16 (L7). New rows appear
  as **fog of war lifting** (the teaser already shows the fog).
- **Regions** unlock by level and have their own tile/building sets:
  - Crypto Bay (L1) — docks, holographic candlestick towers.
  - Gold Mines (L3) — mines, lanterns, ore carts.
  - Wall Street Citadel (L5) — walls, the bull statue, towers.
  - Risk Reef (L7) — lighthouse, cliffs, warning beacons.
- **Base camp fire** in the middle grows with your streak (3 states). A missed
  day (after the grace day) shrinks it. It never disappears.
- **Companion + pet + gear** stand on the land (we already have them worn).
- **Squad base**: a shared 12×12 land per squad. Each member's weekly
  discipline adds shared buildings. Shared land shows who contributed.
- **Seasons** (8 weeks): themed quests, a season set of cosmetics earned with
  Aura, and an end-of-season shareable "Tu temporada en Trader Land" card.

## 4. Gamification system

### Currencies

| Currency | Earned by | Spent on | Cap |
|---|---|---|---|
| Discipline XP (exists) | full reads, NO TRADE, thesis logged | levels, region unlocks | 3 awards/day |
| Aura (new, soft) | session quality score, streak bonus, quests | catalog buildings/tiles, season set | 40/day |
| Money (cosmetics only) | IAP / web checkout | skins, land themes, pets' outfits | n/a |

### Levels (extend today's 0/50/150/400/1000)

L1 0 · L2 50 · L3 150 · L4 400 · L5 1000 · L6 2000 · L7 3500 · L8 5500 ·
L9 8000 · L10 12000. Names stay the current ones for 1–5; 6–10 to name.

### Quests

- **Solo weekly**: "5 full reads", "3 NO TRADE accepted", "2 theses closed".
- **Squad weekly**: "40 full reads as a squad", "streak: 4 members × 5 days".
- **Season**: "unlock Gold Mines", "close 20 theses with invalidation".
- Never: "place N trades", "reach +X %", "trade every day".

### Social

- Friends (contacts sync opt-in, handles, QR).
- Visit lands; react (🔥 ⚡ 🛡️ 🧠 — reactions are discipline-flavored).
- Activity feed: "Ana accepted NO TRADE on NVDA · +20" — never P&L.
- Leaderboards: streak, full reads, theses closed. Weekly, friends/squad
  scope by default, global optional. **No P&L, no volume, ever.**

### Retention hooks (all discipline-flavored)

- Daily "desk open" tile (tiny, not tied to trading).
- Streak at risk push (only when a grace day is about to expire).
- Squad quest close-to-done push.
- No market-urgency pushes from the game layer (the desk has its own alerts
  and they are not tied to rewards).

### Monetization (v1: none; v2)

- Cosmetics with known content (skins, land themes, pet outfits).
- Bobby PRO (voice minutes, more analyses/day) — not a game item.
- Season set purchasable outright as a bundle with all items listed.

## 5. Data model (Supabase Postgres, RLS on, awards via RPC only)

```sql
-- identity (agent_profiles exists; add the game columns there or use profiles)
alter table agent_profiles add column if not exists handle text unique;
alter table agent_profiles add column if not exists companion_id text;
alter table agent_profiles add column if not exists level int not null default 1;
alter table agent_profiles add column if not exists xp int not null default 0;
alter table agent_profiles add column if not exists aura int not null default 0;
alter table agent_profiles add column if not exists streak int not null default 0;
alter table agent_profiles add column if not exists last_session_day date;
alter table agent_profiles add column if not exists country text;

create table if not exists desk_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  client text not null check (client in ('ios','web')),
  asset_symbol text not null,
  verdict text not null check (verdict in ('long','short','none','no_trade')),
  decision text not null check (decision in ('plan','no_trade','skipped')),
  started_at timestamptz not null default now(),
  read_completed_at timestamptz,
  ended_at timestamptz,
  quality_score int not null default 0 check (quality_score between 0 and 100),
  xp_awarded int not null default 0,
  aura_awarded int not null default 0,
  drop_item_id uuid,
  session_day date generated always as ((started_at at time zone 'utc')::date) stored,
  created_at timestamptz not null default now()
);
create index on desk_sessions (user_id, session_day);

create table if not exists theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  session_id uuid references desk_sessions(id),
  asset_symbol text not null,
  direction text not null check (direction in ('long','short')),
  trigger_kind text not null check (trigger_kind in ('close_above','close_below','market')),
  trigger_px numeric, stop_px numeric, targets numeric[],
  invalidation_text text not null check (length(invalidation_text) >= 20),
  status text not null default 'open' check (status in ('open','hit','invalidated','expired')),
  respected_stop boolean,            -- self-reported at close (read-only sync later)
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  outcome jsonb                      -- auto-filled by the resolver cron from public prices
);

-- every award, append-only; the only writer is the RPC below
create table if not exists discipline_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('full_read','no_trade','thesis_logged','confirmation_waited','thesis_closed','streak_day','quest','desk_open')),
  session_id uuid references desk_sessions(id),
  xp int not null default 0,
  aura int not null default 0,
  event_day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
create index on discipline_events (user_id, event_day);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null check (kind in ('tile','building','decor','pet','gear','skin','theme')),
  region text check (region in ('crypto_bay','gold_mines','wall_street_citadel','risk_reef','base')),
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  name jsonb not null,               -- {en, es}
  art_url text not null,
  footprint_w int not null default 1, footprint_h int not null default 1,
  cost_aura int,                     -- null = drop-only
  unlock_level int not null default 1,
  season_id uuid,
  paid_cosmetic boolean not null default false
);

create table if not exists inventory (
  user_id uuid not null references auth.users(id),
  item_id uuid not null references items(id),
  qty int not null default 1 check (qty >= 0),
  source text not null check (source in ('drop','aura','purchase','quest','season')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists lands (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id),
  owner_squad_id uuid,
  size int not null default 8 check (size in (8,12,16)),
  theme text not null default 'night',
  regions_unlocked text[] not null default '{crypto_bay}',
  snapshot_url text,
  updated_at timestamptz not null default now(),
  check ((owner_user_id is null) <> (owner_squad_id is null))
);

create table if not exists land_placements (
  id uuid primary key default gen_random_uuid(),
  land_id uuid not null references lands(id) on delete cascade,
  item_id uuid not null references items(id),
  placed_by uuid not null references auth.users(id),
  x int not null, y int not null, rotation int not null default 0 check (rotation in (0,90,180,270)),
  placed_at timestamptz not null default now(),
  unique (land_id, x, y)              -- footprint overlap is validated in the RPC
);

create table if not exists friendships (
  user_id uuid not null references auth.users(id),
  friend_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  name text not null, code text unique not null,
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists squad_members (
  squad_id uuid not null references squads(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null, starts_at timestamptz not null, ends_at timestamptz not null
);
create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('solo','squad','season')),
  season_id uuid references seasons(id),
  title jsonb not null,
  rule jsonb not null,               -- {kind:'full_read', count:5, window:'week'}
  reward jsonb not null              -- {aura:15, item_slug:'...'}
);
create table if not exists quest_progress (
  quest_id uuid not null references quests(id),
  subject_id uuid not null,          -- user or squad
  progress int not null default 0,
  completed_at timestamptz,
  period_start date not null,
  primary key (quest_id, subject_id, period_start)
);

create table if not exists reactions (
  id bigserial primary key,
  land_id uuid not null references lands(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  emoji text not null check (emoji in ('🔥','⚡','🛡️','🧠')),
  created_at timestamptz not null default now(),
  unique (land_id, user_id, emoji)
);

-- weekly discipline leaderboard (never P&L)
create materialized view if not exists lb_weekly as
select user_id,
       date_trunc('week', created_at)::date as week,
       count(*) filter (where kind = 'full_read') as full_reads,
       count(*) filter (where kind = 'thesis_closed') as theses_closed,
       max(xp) as best_award
from discipline_events group by 1, 2;
```

RPC (SECURITY DEFINER, the only writer of XP/Aura/inventory):

```sql
-- award_session(session_id) — idempotent per session
-- 1. recompute quality_score from the session + thesis rows (server truth)
-- 2. enforce caps: ≤3 XP awards/day, ≤40 aura/day, 1 award per session
-- 3. insert discipline_events, update agent_profiles (xp, aura, streak, level)
-- 4. roll the drop with pity counters stored on the profile, insert inventory
-- 5. return {xp, aura, level, evolved, drop}
-- place_item(land_id, item_id, x, y, rot) — checks ownership/membership,
--   inventory qty, grid bounds, footprint overlap; decrements inventory.
```

RLS sketch: users read/write their own profile fields that are not
award-related (handle, companion); read friends' and squad lands; all award
tables are read-own + insert-via-RPC only. `items`, `quests`, `seasons` public
read.

Integrity: the client sends session telemetry (read_completed_at, scroll
depth) but the server bounds it (a "full read" needs ≥ 20 s between
started_at and read_completed_at, server clock). No award without a server-
side session row created before the analysis ran.

## 6. Designs (Higgsfield, credits)

Art direction: night palette, neon green (#22c55e) / electric blue (#3b82f6),
chunky low-poly, soft rim light, isometric 2:1 at 30°, transparent cutouts.
Everything generated with `nano_banana_pro` (2 credits) + `remove_background`
(free so far), trimmed to square sprites.

| Set | Count | Credits |
|---|---|---|
| Base tiles (grass, rock, sand, water, fog) | 5 | 10 |
| Buildings, 3 per region × 4 | 12 | 24 |
| Decor (flags, lanterns, crates, crystals…) | 8 | 16 |
| Base camp fire, 3 states | 3 | 6 |
| Region "reveal" splash per region | 4 | 8 |
| Season 1 cosmetics (themes + skins) | 6 | 12 |
| Retakes (~30 %) | — | ~23 |
| **Total** | 38 | **≈ 100** |

Balance today: 306.8 credits. Pets (4) and gear (12) already exist.

## 7. Tech

- **Web**: PixiJS (or three.js orthographic, already in the desk) isometric
  renderer, sprites from `public/land/`. Placement UI = tap tile → ghost →
  confirm / rotate (Focus Tree's −, ↻, ✓ controls).
- **iOS**: SpriteKit scene (orthographic, 2:1 tiles) inside SwiftUI, or reuse
  SceneKit with an orthographic camera to keep the mascot GLBs on the land.
- **Server**: Supabase RPC + a resolver cron (theses) + snapshot generator
  (share cards) on Vercel.
- **Sync**: today's local progress (UserDefaults / localStorage) migrates to
  the profile on first sign-in (SMS/Apple/email); XP carries over (the teaser
  already promises this).

## 8. Phases

| Phase | Scope | Estimate |
|---|---|---|
| P0 (done) | Teaser: map popup SOON, XP carries over | — |
| P1 | Auth + profile sync, `award_session` RPC, solo land 8×8, 12 items, drop reveal, place/rotate, share card | 2–3 weeks |
| P2 | Friends, visit lands, reactions, squads + shared base, weekly quests | 2 weeks |
| P3 | Seasons, season set, leaderboards (discipline only), cosmetics store | 2 weeks |
| P4 | Proof of Discipline on Base: weekly Merkle root of discipline events anchored on-chain, land verifiable (ties into the Builder Quest work) | 1 week |

## 9. Risks / open questions

1. **Gambling adjacency**: a game around trading decisions can look like it
   rewards trading. Mitigation: symmetric NO TRADE rewards, discipline-only
   metrics, caps, no urgency, disclaimers in the land itself. Needs legal
   read before public launch (same reviewer as the Builder Quest).
2. **App Store 5.3 / 3.1.1**: no paid loot, odds shown, cosmetics-only IAP,
   no real-money trading UI in-app. Keep the land free.
3. **Fake discipline**: users could log theses just to farm. Mitigation:
   closing the loop is what pays (thesis_closed + respected_stop), caps,
   pity counters server-side, quality score requires real time on the read.
4. **Cost**: Higgsfield ≈ 100 credits; Supabase free tier ok for P1–P2;
   TTS cost is the bigger line (see TTS memo).
5. **Two-platform parity**: every mechanic ships on web + iOS the same week
   (we just did this for gear, pets, forge, world teaser — it is doable).
