-- ============================================================
-- Trader Land v1 — the world's persistence on bobby-protocol, keyed by
-- bobby_identities (wallet session or Supabase Auth), following the phase-0
-- convention: service_role writes through /api, anon may only read the public
-- catalog. Product rules: docs/trader-land/SYSTEM-DESIGN-v0.2.md — XP is
-- permanent, Aura is soft currency (never bought in v1), pieces are earned in
-- a deterministic Discovery Route (no chests, no odds), seeds bloom when the
-- process closes. Catalog generated from docs/trader-land/art/lot-catalog-v01.json
-- (25 lots, v01).
-- ============================================================

-- progress gains the world's soft resources
alter table public.bobby_progress add column if not exists aura integer not null default 0 check (aura >= 0);
alter table public.bobby_progress add column if not exists route_index integer not null default 0 check (route_index >= 0);
alter table public.bobby_progress_events add column if not exists aura integer not null default 0 check (aura >= 0);
alter table public.bobby_progress_events drop constraint if exists bobby_progress_events_kind_check;
alter table public.bobby_progress_events add constraint bobby_progress_events_kind_check check (kind in ('read_complete', 'no_trade_respected', 'thesis_closed', 'legacy_import'));

create table if not exists public.tl_items (
  id            text primary key,
  world         text not null,
  attribution   text not null,
  kind          text not null check (kind in ('ground', 'path', 'decor', 'building', 'landmark')),
  footprint_w   integer not null default 1,
  footprint_h   integer not null default 1,
  name          jsonb not null,
  route_index   integer unique,            -- position in the Discovery Route, null = not on it yet
  art_url       text,                      -- filled when the web atlases land (public/trader-land/)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.tl_lands (
  identity_id   uuid primary key references public.bobby_identities(id) on delete cascade,
  size          integer not null default 8 check (size in (8, 12, 16)),
  theme         text not null default 'night',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.tl_inventory (
  id            uuid primary key default gen_random_uuid(),
  identity_id   uuid not null references public.bobby_identities(id) on delete cascade,
  item_id       text not null references public.tl_items(id),
  state         text not null default 'seed' check (state in ('seed', 'bloomed')),
  source        text not null check (source in ('route', 'quest', 'season')),
  event_id      uuid references public.bobby_progress_events(id),
  seeded_at     timestamptz not null default now(),
  bloomed_at    timestamptz,
  constraint tl_inventory_once_per_event unique (identity_id, event_id)
);
create index if not exists tl_inventory_identity on public.tl_inventory (identity_id, seeded_at desc);

create table if not exists public.tl_placements (
  id            uuid primary key default gen_random_uuid(),
  identity_id   uuid not null references public.bobby_identities(id) on delete cascade,
  inventory_id  uuid not null unique references public.tl_inventory(id) on delete cascade,
  x             integer not null check (x >= 0),
  y             integer not null check (y >= 0),
  rotation      integer not null default 0 check (rotation in (0, 90, 180, 270)),
  placed_at     timestamptz not null default now(),
  constraint tl_placements_one_per_cell unique (identity_id, x, y)
);

insert into public.tl_items (id, world, attribution, kind, footprint_w, footprint_h, name, route_index, art_url) values
('crypto_bay_data_dock', 'crypto_bay', 'Paciencia', 'ground', 1, 1, '{"en":"Data Dock","es":"Data Dock"}'::jsonb, 1, '/trader-land/crypto_bay_data_dock.webp'),
('crypto_bay_water_walkway', 'crypto_bay', 'Paciencia', 'path', 1, 1, '{"en":"Water Walkway","es":"Water Walkway"}'::jsonb, 2, '/trader-land/crypto_bay_water_walkway.webp'),
('crypto_bay_context_buoy', 'crypto_bay', 'Paciencia', 'decor', 1, 1, '{"en":"Context Buoy","es":"Context Buoy"}'::jsonb, null, '/trader-land/crypto_bay_context_buoy.webp'),
('crypto_bay_candle_tower', 'crypto_bay', 'Paciencia', 'building', 2, 1, '{"en":"Candle Tower","es":"Candle Tower"}'::jsonb, null, '/trader-land/crypto_bay_candle_tower.webp'),
('crypto_bay_waiting_lighthouse', 'crypto_bay', 'Paciencia', 'landmark', 2, 2, '{"en":"Waiting Lighthouse","es":"Waiting Lighthouse"}'::jsonb, null, '/trader-land/crypto_bay_waiting_lighthouse.webp'),
('evidence_mines_crystal_vein_rock', 'evidence_mines', 'Claridad', 'ground', 1, 1, '{"en":"Crystal Vein Rock","es":"Crystal Vein Rock"}'::jsonb, 6, '/trader-land/evidence_mines_crystal_vein_rock.webp'),
('evidence_mines_open_tunnel', 'evidence_mines', 'Claridad', 'path', 1, 1, '{"en":"Open Tunnel","es":"Open Tunnel"}'::jsonb, null, '/trader-land/evidence_mines_open_tunnel.webp'),
('evidence_mines_lantern_drone', 'evidence_mines', 'Claridad', 'decor', 1, 1, '{"en":"Lantern Drone","es":"Lantern Drone"}'::jsonb, null, '/trader-land/evidence_mines_lantern_drone.webp'),
('evidence_mines_evidence_workshop', 'evidence_mines', 'Claridad', 'building', 2, 1, '{"en":"Evidence Workshop","es":"Evidence Workshop"}'::jsonb, null, '/trader-land/evidence_mines_evidence_workshop.webp'),
('evidence_mines_mother_crystal', 'evidence_mines', 'Claridad', 'landmark', 2, 2, '{"en":"Mother Crystal","es":"Mother Crystal"}'::jsonb, null, '/trader-land/evidence_mines_mother_crystal.webp'),
('thesis_citadel_wall_slab', 'thesis_citadel', 'Riesgo', 'ground', 1, 1, '{"en":"Wall Slab","es":"Wall Slab"}'::jsonb, null, '/trader-land/thesis_citadel_wall_slab.webp'),
('thesis_citadel_fortified_ramp', 'thesis_citadel', 'Riesgo', 'path', 1, 1, '{"en":"Fortified Ramp","es":"Fortified Ramp"}'::jsonb, null, '/trader-land/thesis_citadel_fortified_ramp.webp'),
('thesis_citadel_risk_shield', 'thesis_citadel', 'Riesgo', 'decor', 1, 1, '{"en":"Risk Shield","es":"Risk Shield"}'::jsonb, 4, '/trader-land/thesis_citadel_risk_shield.webp'),
('thesis_citadel_double_gate', 'thesis_citadel', 'Riesgo', 'building', 2, 1, '{"en":"Double Gate","es":"Double Gate"}'::jsonb, 5, '/trader-land/thesis_citadel_double_gate.webp'),
('thesis_citadel_three_gate_citadel', 'thesis_citadel', 'Riesgo', 'landmark', 2, 2, '{"en":"Three Gate Citadel","es":"Three Gate Citadel"}'::jsonb, null, '/trader-land/thesis_citadel_three_gate_citadel.webp'),
('risk_reef_reef_tile', 'risk_reef', 'Contradicción', 'ground', 1, 1, '{"en":"Reef Tile","es":"Reef Tile"}'::jsonb, null, '/trader-land/risk_reef_reef_tile.webp'),
('risk_reef_blue_sluice', 'risk_reef', 'Contradicción', 'path', 1, 1, '{"en":"Blue Sluice","es":"Blue Sluice"}'::jsonb, null, '/trader-land/risk_reef_blue_sluice.webp'),
('risk_reef_dual_orbit_antenna', 'risk_reef', 'Contradicción', 'decor', 1, 1, '{"en":"Dual Orbit Antenna","es":"Dual Orbit Antenna"}'::jsonb, 3, '/trader-land/risk_reef_dual_orbit_antenna.webp'),
('risk_reef_red_team_observatory', 'risk_reef', 'Contradicción', 'building', 2, 1, '{"en":"Red Team Observatory","es":"Red Team Observatory"}'::jsonb, null, '/trader-land/risk_reef_red_team_observatory.webp'),
('risk_reef_double_bridge', 'risk_reef', 'Contradicción', 'landmark', 2, 2, '{"en":"Double Bridge","es":"Double Bridge"}'::jsonb, null, '/trader-land/risk_reef_double_bridge.webp'),
('axiom_archive_archive_ring_tile', 'axiom_archive', 'Cierre', 'ground', 1, 1, '{"en":"Archive Ring Tile","es":"Archive Ring Tile"}'::jsonb, null, '/trader-land/axiom_archive_archive_ring_tile.webp'),
('axiom_archive_return_path', 'axiom_archive', 'Cierre', 'path', 1, 1, '{"en":"Return Path","es":"Return Path"}'::jsonb, 7, '/trader-land/axiom_archive_return_path.webp'),
('axiom_archive_aura_flower', 'axiom_archive', 'Cierre', 'decor', 1, 1, '{"en":"Aura Flower","es":"Aura Flower"}'::jsonb, 8, '/trader-land/axiom_archive_aura_flower.webp'),
('axiom_archive_lit_archive', 'axiom_archive', 'Cierre', 'building', 2, 1, '{"en":"Lit Archive","es":"Lit Archive"}'::jsonb, null, '/trader-land/axiom_archive_lit_archive.webp'),
('axiom_archive_base_ring_seal', 'axiom_archive', 'Cierre', 'landmark', 2, 2, '{"en":"Base Ring Seal","es":"Base Ring Seal"}'::jsonb, null, '/trader-land/axiom_archive_base_ring_seal.webp')
on conflict (id) do update set world = excluded.world, attribution = excluded.attribution, kind = excluded.kind, footprint_w = excluded.footprint_w, footprint_h = excluded.footprint_h, name = excluded.name, route_index = excluded.route_index;

-- ---------- RLS (phase-0 convention) ----------
alter table public.tl_items enable row level security;
alter table public.tl_lands enable row level security;
alter table public.tl_inventory enable row level security;
alter table public.tl_placements enable row level security;
drop policy if exists tl_items_public_read on public.tl_items;
create policy tl_items_public_read on public.tl_items for select to anon, authenticated using (active);
drop policy if exists tl_items_service_all on public.tl_items;
create policy tl_items_service_all on public.tl_items for all to service_role using (true) with check (true);
drop policy if exists tl_lands_service_all on public.tl_lands;
create policy tl_lands_service_all on public.tl_lands for all to service_role using (true) with check (true);
drop policy if exists tl_inventory_service_all on public.tl_inventory;
create policy tl_inventory_service_all on public.tl_inventory for all to service_role using (true) with check (true);
drop policy if exists tl_placements_service_all on public.tl_placements;
create policy tl_placements_service_all on public.tl_placements for all to service_role using (true) with check (true);

