-- ============================================================
-- scripts/test-trader-land-growth.sql — Trader Land Growth v1 on a real
-- Postgres (docs/trader-land/GROWTH-v1.md §2): tier backfill and sequences,
-- grants and replays, NO TRADE blooms, horizon extends, the movable core,
-- island growth with the ring shift, the core waking, checks and revokes.
--
-- Run only against an isolated, EMPTY, throwaway local cluster — never
-- production. It creates roles and applies the real migrations in order:
--   export LC_ALL=C LANG=C
--   initdb --locale=C -U postgres -D <dir>
--   pg_ctl -D <dir> -o "-p 54391 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -w start
--   psql -h 127.0.0.1 -p 54391 -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/test-trader-land-growth.sql
--   pg_ctl -D <dir> -w stop
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;
create role anon;
create role authenticated;
create role service_role;
\ir ../supabase/bobby-protocol/supabase/migrations/20260903000005_bobby_progress.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260903000006_trader_land.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260904222250_trader_land_occupied_cells.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260904230244_trader_land_public_worlds.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260919000001_trader_land_growth.sql
-- Idempotent: a second run changes nothing and fails nothing.
\ir ../supabase/bobby-protocol/supabase/migrations/20260919000001_trader_land_growth.sql
-- Supabase grants table access to service_role; RLS policies do the rest.
grant all on all tables in schema public to service_role;
set client_min_messages = notice;

-- A ledger row to key a grant on (tl_inventory.event_id → bobby_progress_events).
create function pg_temp.ev(p uuid) returns uuid language sql as $$
  insert into public.bobby_progress_events(identity_id, client_event_id, kind, points, awarded, aura, xp_after, platform, occurred_at, day_key)
  values (p, gen_random_uuid(), 'read_complete', 10, 10, 2, 10, 'ios', now(), current_date) returning id
$$;
create function pg_temp.person() returns uuid language sql as $$
  insert into public.bobby_identities(auth_user_id) values (gen_random_uuid()) returning id
$$;
-- A bloomed piece in the identity's inventory, placed at (x, y).
create function pg_temp.put(p uuid, item text, px int, py int) returns uuid language plpgsql as $$
declare inv uuid; pl uuid;
begin
  insert into public.tl_inventory(identity_id, item_id, state, source, bloomed_at) values (p, item, 'bloomed', 'route', now()) returning id into inv;
  insert into public.tl_placements(identity_id, inventory_id, x, y) values (p, inv, px, py) returning id into pl;
  return pl;
end $$;
-- Fill the first n free cells (row-major) with 1×1 pieces.
create function pg_temp.fill(p uuid, n int) returns void language plpgsql as $$
declare s int; cx int; cy int; placed int := 0;
begin
  select size, core_x, core_y into s, cx, cy from public.tl_lands where identity_id = p;
  for gy in 0..s - 1 loop
    for gx in 0..s - 1 loop
      exit when placed >= n;
      continue when gx between cx and cx + 1 and gy between cy and cy + 1;
      continue when exists (select 1 from public.tl_placement_cells c where c.identity_id = p and c.x = gx and c.y = gy);
      perform pg_temp.put(p, 'crypto_bay_data_dock', gx, gy);
      placed := placed + 1;
    end loop;
  end loop;
  if placed < n then raise exception 'fill: only % of % cells free', placed, n; end if;
end $$;

-- ---------- schema: tiers, horizons, the land's core, checks ----------
do $$
declare seq text;
begin
  assert (select count(*) from tl_items where tier is not null) = 25, 'all 25 catalog items carry a tier';
  assert (select count(*) from tl_items where tier = 'common') = 15, '15 common pieces';
  assert (select count(*) from tl_items where tier = 'building') = 5, '5 buildings';
  assert (select count(*) from tl_items where tier = 'landmark') = 5, '5 landmarks';
  assert not exists (select 1 from tl_items where tier = 'common' and not (kind in ('ground', 'path', 'decor') and footprint_w = 1 and footprint_h = 1)), 'common = the 1×1 ground/path/decor pieces';
  assert not exists (select 1 from tl_items where tier = 'building' and not (kind = 'building' and footprint_w = 2 and footprint_h = 1)), 'building = the 2×1 buildings';
  assert not exists (select 1 from tl_items where tier = 'landmark' and not (kind = 'landmark' and footprint_w = 2 and footprint_h = 2)), 'landmark = the 2×2 landmarks';
  select string_agg(id, ',' order by tier_index) into seq from tl_items where tier = 'common';
  assert seq = 'crypto_bay_data_dock,crypto_bay_water_walkway,risk_reef_dual_orbit_antenna,thesis_citadel_risk_shield,evidence_mines_crystal_vein_rock,axiom_archive_return_path,axiom_archive_aura_flower,crypto_bay_context_buoy,evidence_mines_open_tunnel,evidence_mines_lantern_drone,thesis_citadel_wall_slab,thesis_citadel_fortified_ramp,risk_reef_reef_tile,risk_reef_blue_sluice,axiom_archive_archive_ring_tile', 'common sequence order: ' || seq;
  select string_agg(id, ',' order by tier_index) into seq from tl_items where tier = 'building';
  assert seq = 'thesis_citadel_double_gate,crypto_bay_candle_tower,evidence_mines_evidence_workshop,risk_reef_red_team_observatory,axiom_archive_lit_archive', 'building sequence order: ' || seq;
  select string_agg(id, ',' order by tier_index) into seq from tl_items where tier = 'landmark';
  assert seq = 'crypto_bay_waiting_lighthouse,evidence_mines_mother_crystal,risk_reef_double_bridge,thesis_citadel_three_gate_citadel,axiom_archive_base_ring_seal', 'landmark sequence order: ' || seq;
  assert (select count(*) from tl_items where route_index is not null) = 8, 'the legacy route_index is left alone';
  begin
    update tl_items set tier = 'rare' where id = 'crypto_bay_data_dock';
    raise exception 'unknown tier accepted';
  exception when check_violation then null; end;
  begin
    update tl_items set tier_index = 2 where id = 'crypto_bay_data_dock';
    raise exception 'duplicate (tier, tier_index) accepted';
  exception when unique_violation then null; end;
  raise notice 'PASS schema: 25 tiered items, three sequences in contract order, tier checks';
end $$;

-- ---------- grants: sequence order, wrap, replay, NO TRADE ----------
do $$
declare a uuid := pg_temp.person(); r jsonb; again jsonb; ev uuid; expect text[];
begin
  select array_agg(id order by tier_index) into expect from tl_items where tier = 'common';
  for i in 1..15 loop
    r := tl_grant_piece(a, pg_temp.ev(a), 'seed');
    assert (r->>'ok')::boolean, 'grant ok';
    assert r->>'item_id' = expect[i], format('grant %s is common #%s (%s), got %s', i, i, expect[i], r->>'item_id');
    assert (r->>'held')::int = i, format('held = %s after grant %s, got %s', i, i, r->>'held');
    assert r->>'tier' = 'common' and (r->>'horizon_hours')::int = 24 and r->>'state' = 'seed', 'a read plants a 24 h common seed';
    assert not (r->>'replay')::boolean, 'fresh grant is not a replay';
  end loop;
  assert exists (select 1 from tl_lands where identity_id = a and size = 8 and core_x = 3 and core_y = 3 and core_stage = 0), 'the grant created the default land (8×8, core 3,3, dormant)';
  ev := pg_temp.ev(a);
  r := tl_grant_piece(a, ev, 'seed');
  assert r->>'item_id' = expect[1] and (r->>'held')::int = 16, 'the 16th common grant wraps to #1';
  -- Replay on the same ledger event: same row, nothing new.
  again := tl_grant_piece(a, ev, 'seed');
  assert again->>'inventory_id' = r->>'inventory_id' and (again->>'replay')::boolean and (again->>'held')::int = 16, 'replay returns the row already granted';
  again := tl_grant_piece(a, ev, 'bloomed', 168::smallint);
  assert again->>'inventory_id' = r->>'inventory_id' and again->>'state' = 'seed' and (again->>'horizon_hours')::int = 24, 'replay ignores the new arguments';
  assert (select count(*) from tl_inventory where identity_id = a) = 16, 'a replay inserts nothing';
  -- NO TRADE: bloomed at once, next common piece.
  r := tl_grant_piece(a, pg_temp.ev(a), 'bloomed');
  assert r->>'state' = 'bloomed' and r->>'tier' = 'common' and r->>'item_id' = expect[2] and (r->>'held')::int = 17, 'NO TRADE blooms the next common piece';
  assert (select bloomed_at is not null and state = 'bloomed' from tl_inventory where id = (r->>'inventory_id')::uuid), 'bloomed_at is stamped';
  -- Season rows never count toward n.
  insert into tl_inventory(identity_id, item_id, state, source, bloomed_at) values (a, 'crypto_bay_candle_tower', 'bloomed', 'season', now());
  r := tl_grant_piece(a, pg_temp.ev(a), 'seed', 72::smallint);
  assert r->>'item_id' = 'thesis_citadel_double_gate' and r->>'tier' = 'building' and (r->>'held')::int = 1, 'a season piece does not move the building sequence';
  -- Refusals are data, not exceptions.
  assert tl_grant_piece(a, pg_temp.ev(a), 'seed', 48::smallint)->>'error' = 'bad_hours', 'unknown horizon refused';
  assert tl_grant_piece(a, pg_temp.ev(a), 'grown')->>'error' = 'bad_state', 'unknown state refused';
  assert tl_grant_piece(a, null, 'seed')->>'error' = 'bad_request', 'missing event refused';
  raise notice 'PASS grants: sequence order, wrap at 15, held, replay idempotence, NO TRADE bloom, season excluded, refusals';
end $$;

-- ---------- extend: upward only, before the review, next piece of the new tier ----------
do $$
declare b uuid := pg_temp.person(); other uuid := pg_temp.person(); s1 jsonb; s2 jsonb; r jsonb; seeded timestamptz; theirs uuid;
begin
  s1 := tl_grant_piece(b, pg_temp.ev(b), 'seed');
  s2 := tl_grant_piece(b, pg_temp.ev(b), 'seed');
  assert s1->>'item_id' = 'crypto_bay_data_dock' and s2->>'item_id' = 'crypto_bay_water_walkway', 'two common seeds';
  r := tl_extend_seed(b, (s2->>'inventory_id')::uuid, 72::smallint);
  select seeded_at into seeded from tl_inventory where id = (s2->>'inventory_id')::uuid;
  assert (r->>'ok')::boolean and r->>'item_id' = 'thesis_citadel_double_gate' and r->>'tier' = 'building' and (r->>'horizon_hours')::int = 72, 'extend to 72 h re-points the seed to building #1';
  assert (r->>'review_at')::timestamptz = seeded + interval '72 hours', 'review_at = seeded_at + 72 h';
  assert (select item_id = 'thesis_citadel_double_gate' and horizon_hours = 72 and state = 'seed' from tl_inventory where id = (s2->>'inventory_id')::uuid), 'the row carries the new piece and horizon';
  -- The common slot it held is released: the next common read gets that piece again.
  r := tl_grant_piece(b, pg_temp.ev(b), 'seed');
  assert r->>'item_id' = 'crypto_bay_water_walkway' and (r->>'held')::int = 2, 'released common slot is granted again';
  -- not_upward
  assert tl_extend_seed(b, (s2->>'inventory_id')::uuid, 72::smallint)->>'error' = 'not_upward', 'same horizon refused';
  assert tl_extend_seed(b, (s2->>'inventory_id')::uuid, 24::smallint)->>'error' = 'not_upward', 'shorter horizon refused';
  assert tl_extend_seed(b, (s1->>'inventory_id')::uuid, 100::smallint)->>'error' = 'not_upward', 'a horizon outside 72/168 refused';
  assert tl_extend_seed(b, (s1->>'inventory_id')::uuid, null)->>'error' = 'not_upward', 'no horizon refused';
  -- 72 → 168: landmark #1; the seed itself is excluded from n.
  r := tl_extend_seed(b, (s2->>'inventory_id')::uuid, 168::smallint);
  assert r->>'item_id' = 'crypto_bay_waiting_lighthouse' and r->>'tier' = 'landmark' and (r->>'review_at')::timestamptz = seeded + interval '168 hours', '72 → 168 re-points to landmark #1';
  -- The next building seed takes building #1 again (the 72 h slot was released too).
  r := tl_extend_seed(b, (s1->>'inventory_id')::uuid, 72::smallint);
  assert r->>'item_id' = 'thesis_citadel_double_gate', 'building slot released by the 168 h extend';
  -- not_seed
  r := tl_grant_piece(b, pg_temp.ev(b), 'bloomed');
  assert tl_extend_seed(b, (r->>'inventory_id')::uuid, 72::smallint)->>'error' = 'not_seed', 'a bloomed piece cannot be extended';
  -- review_open: the window already closed.
  r := tl_grant_piece(b, pg_temp.ev(b), 'seed');
  update tl_inventory set seeded_at = now() - interval '24 hours' where id = (r->>'inventory_id')::uuid;
  s1 := tl_extend_seed(b, (r->>'inventory_id')::uuid, 72::smallint);
  assert s1->>'error' = 'review_open' and (s1->>'review_at')::timestamptz = now(), 'review open at exactly seeded_at + horizon';
  assert (select item_id = r->>'item_id' and horizon_hours = 24 from tl_inventory where id = (r->>'inventory_id')::uuid), 'a refused extend changes nothing';
  update tl_inventory set seeded_at = now() - interval '23 hours 59 minutes' where id = (r->>'inventory_id')::uuid;
  assert (tl_extend_seed(b, (r->>'inventory_id')::uuid, 168::smallint)->>'ok')::boolean, 'one minute before the review a seed can still grow (24 → 168 directly)';
  -- not_found: unknown id and another identity's seed.
  assert tl_extend_seed(b, gen_random_uuid(), 72::smallint)->>'error' = 'not_found', 'unknown seed';
  theirs := (tl_grant_piece(other, pg_temp.ev(other), 'seed')->>'inventory_id')::uuid;
  assert tl_extend_seed(b, theirs, 72::smallint)->>'error' = 'not_found', 'someone else''s seed is not found';
  assert (select horizon_hours = 24 from tl_inventory where id = theirs), 'and stays untouched';
  raise notice 'PASS extend: upward/not_upward/review_open/not_seed/not_found, item swap, released slots';
end $$;

-- ---------- the core moves; the trigger reserves it where the land keeps it ----------
do $$
declare c uuid := pg_temp.person(); pl uuid; r jsonb;
begin
  insert into tl_lands(identity_id) values (c);
  pl := pg_temp.put(c, 'crypto_bay_data_dock', 5, 5);
  assert tl_move_core(c, 7, 7)->>'error' = 'outside', 'a 2×2 at 7,7 leaves an 8×8';
  assert tl_move_core(c, -1, 0)->>'error' = 'outside', 'negative is outside';
  assert tl_move_core(c, 0, 7)->>'error' = 'outside', 'bottom edge is outside';
  assert tl_move_core(c, 4, 4)->>'error' = 'occupied', 'a piece at 5,5 blocks the core at 4,4';
  assert tl_move_core(c, 5, 4)->>'error' = 'occupied', 'and at 5,4';
  assert tl_move_core(gen_random_uuid(), 0, 0)->>'error' = 'not_found', 'no land, nothing to move';
  assert (select core_x = 3 and core_y = 3 from tl_lands where identity_id = c), 'refusals leave the core';
  r := tl_move_core(c, 0, 5);
  assert (r->>'ok')::boolean and (r->>'core_x')::int = 0 and (r->>'core_y')::int = 5, 'core moved to 0,5';
  assert (select core_x = 0 and core_y = 5 from tl_lands where identity_id = c), 'stored on the land';
  -- The trigger now rejects the moved rectangle and frees the old one.
  begin
    perform pg_temp.put(c, 'crypto_bay_data_dock', 1, 6);
    raise exception 'a piece under the moved core was accepted';
  exception when check_violation then null; end;
  begin
    perform pg_temp.put(c, 'thesis_citadel_double_gate', 1, 4);  -- 2×1 at (1..2, 4) is clear; rotated 90 it would hit (1,5)
    update tl_placements set rotation = 90 where identity_id = c and x = 1 and y = 4;
    raise exception 'a rotated footprint under the moved core was accepted';
  exception when check_violation then null; end;
  perform pg_temp.put(c, 'crypto_bay_data_dock', 3, 3);
  perform pg_temp.put(c, 'crypto_bay_data_dock', 4, 4);
  assert (select count(*) from tl_placement_cells where identity_id = c) = 3, 'the old core cells take pieces now';
  begin
    update tl_placements set x = 0, y = 6 where id = pl;
    raise exception 'moving a piece under the core was accepted';
  exception when check_violation then null; end;
  assert tl_move_core(c, 2, 2)->>'error' = 'occupied', 'pieces at 3,3 block the core coming back';
  raise notice 'PASS core: outside/occupied/not_found/ok, trigger rejects the moved rectangle, old cells freed';
end $$;

-- ---------- growth: wake at 5, no growth below the threshold, 8 → 10 → 12 with the ring shift ----------
create temp table before_grow(id uuid primary key, x int, y int);
do $$
declare d uuid := pg_temp.person(); r jsonb; bad int;
begin
  insert into tl_lands(identity_id) values (d);
  perform pg_temp.put(d, 'crypto_bay_data_dock', 0, 0);
  perform pg_temp.put(d, 'crypto_bay_data_dock', 1, 1);
  perform pg_temp.put(d, 'crypto_bay_data_dock', 6, 7);
  perform pg_temp.put(d, 'crypto_bay_waiting_lighthouse', 0, 2);  -- 2×2 over (0..1, 2..3)
  r := tl_grow_land(d);
  assert (r->>'ok')::boolean and not (r->>'grew')::boolean and (r->>'core_stage')::int = 0 and not (r->>'woke')::boolean, '4 pieces: dormant, no growth';
  perform pg_temp.put(d, 'crypto_bay_data_dock', 1, 4);
  r := tl_grow_land(d);
  assert (r->>'core_stage')::int = 1 and (r->>'woke')::boolean and not (r->>'grew')::boolean, 'the 5th piece wakes the core';
  assert (r->>'from')::int = 8 and (r->>'to')::int = 8 and (r->>'shift')::int = 0, 'no growth: from = to, shift 0';
  -- 5 pieces = 8 cells; 34 cells + 4 core = 38 < 39.
  perform pg_temp.fill(d, 26);
  assert (select count(*) + 4 from tl_placement_cells where identity_id = d) = 38, 'occupied 38';
  r := tl_grow_land(d);
  assert not (r->>'grew')::boolean and (r->>'size')::int = 8, 'threshold not reached: no growth at 38';
  update tl_lands set core_stage = 0 where identity_id = d;  -- (test only) waking is re-derived, never undone by the RPC
  r := tl_grow_land(d);
  assert (r->>'core_stage')::int = 1, 'the RPC wakes an island that stands on ≥ 5 pieces';
  -- 39 → 10×10, shift 1.
  perform pg_temp.fill(d, 1);
  insert into before_grow select id, x, y from tl_placements where identity_id = d;
  r := tl_grow_land(d);
  assert (r->>'grew')::boolean and (r->>'from')::int = 8 and (r->>'to')::int = 10 and (r->>'shift')::int = 1 and (r->>'size')::int = 10, 'grew 8 → 10 by one ring: ' || r::text;
  assert (r->>'core_x')::int = 4 and (r->>'core_y')::int = 4, 'the core shifted to 4,4';
  assert (select size = 10 and core_x = 4 and core_y = 4 and core_stage = 1 from tl_lands where identity_id = d), 'land stored';
  select count(*) into bad from before_grow b join tl_placements p using (id) where p.x <> b.x + 1 or p.y <> b.y + 1;
  assert bad = 0 and (select count(*) from before_grow) = (select count(*) from tl_placements where identity_id = d), 'every placement shifted by (+1,+1)';
  assert exists (select 1 from tl_placements p join before_grow b using (id) where b.x = 0 and b.y = 0 and p.x = 1 and p.y = 1), '(0,0) → (1,1) while (1,1) → (2,2)';
  assert exists (select 1 from tl_placements p join before_grow b using (id) where b.x = 6 and b.y = 7 and p.x = 7 and p.y = 8), '(6,7) → (7,8)';
  assert (select count(*) from tl_placement_cells where identity_id = d) = 35, 'every cell re-reserved (35)';
  select count(*) into bad from tl_placement_cells c join tl_placements p on p.id = c.placement_id
    join tl_inventory i on i.id = p.inventory_id join tl_items t on t.id = i.item_id
    where c.x < p.x or c.y < p.y or c.x >= p.x + t.footprint_w or c.y >= p.y + t.footprint_h;
  assert bad = 0, 'each cell sits inside its own shifted footprint';
  assert (select count(*) from tl_placement_cells c join tl_placements p on p.id = c.placement_id join before_grow b using (id) where b.x = 0 and b.y = 2) = 4, 'the 2×2 holds its 4 cells at (1..2, 3..4)';
  assert not exists (select 1 from tl_placement_cells where identity_id = d and x between 4 and 5 and y between 4 and 5), 'the shifted core rectangle is clear';
  assert not exists (select 1 from tl_placement_cells where identity_id = d and (x = 0 or y = 0)), 'the new outer ring is empty';
  begin
    perform pg_temp.put(d, 'crypto_bay_data_dock', 5, 5);
    raise exception 'a piece under the shifted core was accepted';
  exception when check_violation then null; end;
  perform pg_temp.put(d, 'crypto_bay_data_dock', 9, 9);  -- the new far corner is on the island
  r := tl_grow_land(d);
  assert not (r->>'grew')::boolean and (r->>'size')::int = 10, '10×10 at 40 occupied does not grow';
  -- 60 → 12×12, shift 1 again.
  perform pg_temp.fill(d, 60 - 4 - (select count(*)::int from tl_placement_cells where identity_id = d));
  r := tl_grow_land(d);
  assert (r->>'grew')::boolean and (r->>'from')::int = 10 and (r->>'to')::int = 12 and (r->>'shift')::int = 1 and (r->>'core_x')::int = 5, 'grew 10 → 12 at 60: ' || r::text;
  assert (select count(*) from tl_placement_cells where identity_id = d) = 56, 'cells kept through the second ring';
  raise notice 'PASS growth: wake at 5, threshold not reached, 8→10 and 10→12 ring shifts (far corner first), cells re-reserved, core shifted';
end $$;

-- 12 → 16 shifts by two rings; a single UPDATE could not do it (sanity check of the risk the RPC avoids).
do $$
declare e uuid := pg_temp.person(); r jsonb;
begin
  insert into tl_lands(identity_id, size, core_x, core_y) values (e, 12, 5, 5);
  perform pg_temp.put(e, 'crypto_bay_data_dock', 0, 0);
  perform pg_temp.put(e, 'crypto_bay_data_dock', 2, 2);
  begin
    update tl_placements set x = x + 2, y = y + 2 where identity_id = e;
    raise exception 'a one-statement shift was expected to collide';
  exception when unique_violation then null; end;
  perform pg_temp.fill(e, 87 - 4 - 2);
  r := tl_grow_land(e);
  assert (r->>'grew')::boolean and (r->>'from')::int = 12 and (r->>'to')::int = 16 and (r->>'shift')::int = 2 and (r->>'core_x')::int = 7 and (r->>'core_y')::int = 7, 'grew 12 → 16 by two rings: ' || r::text;
  assert exists (select 1 from tl_placements where identity_id = e and x = 2 and y = 2) and exists (select 1 from tl_placements where identity_id = e and x = 4 and y = 4), '(0,0) → (2,2) and (2,2) → (4,4)';
  assert (select count(*) from tl_placement_cells where identity_id = e) = 83, 'all 83 cells re-reserved';
  r := tl_grow_land(e);
  assert not (r->>'grew')::boolean and (r->>'size')::int = 16, '16×16 is the last size';
  raise notice 'PASS growth: 12→16 by two rings, 16 is final';
end $$;

-- ---------- checks on the land ----------
do $$
declare f uuid := pg_temp.person();
begin
  insert into tl_lands(identity_id) values (f);
  begin update tl_lands set size = 9 where identity_id = f; raise exception 'size 9 accepted'; exception when check_violation then null; end;
  begin update tl_lands set size = 14 where identity_id = f; raise exception 'size 14 accepted'; exception when check_violation then null; end;
  update tl_lands set size = 10 where identity_id = f;
  update tl_lands set size = 16 where identity_id = f;
  begin update tl_lands set core_x = 15 where identity_id = f; raise exception 'core past the edge accepted'; exception when check_violation then null; end;
  begin update tl_lands set core_y = -1 where identity_id = f; raise exception 'negative core accepted'; exception when check_violation then null; end;
  update tl_lands set core_x = 14, core_y = 14 where identity_id = f;
  begin update tl_lands set size = 8 where identity_id = f; raise exception 'a shrink that strands the core accepted'; exception when check_violation then null; end;
  begin update tl_lands set core_stage = 2 where identity_id = f; raise exception 'core_stage 2 accepted'; exception when check_violation then null; end;
  begin
    insert into tl_inventory(identity_id, item_id, source, horizon_hours) values (f, 'crypto_bay_data_dock', 'route', 48);
    raise exception 'horizon 48 accepted';
  exception when check_violation then null; end;
  raise notice 'PASS checks: size (8,10,12,16), core inside, core_stage, horizon_hours';
end $$;

-- Backfill: a land already standing on ≥ 5 pieces starts awake (the migration's statement, re-run on fresh rows).
create temp table bf as select pg_temp.person() as ga, pg_temp.person() as ha;
do $$
declare g uuid := (select ga from bf); h uuid := (select ha from bf);
begin
  insert into tl_lands(identity_id) values (g), (h);
  for i in 0..4 loop perform pg_temp.put(g, 'crypto_bay_data_dock', i, 0); end loop;
  for i in 0..3 loop perform pg_temp.put(h, 'crypto_bay_data_dock', i, 0); end loop;
end $$;
set client_min_messages = warning;
\ir ../supabase/bobby-protocol/supabase/migrations/20260919000001_trader_land_growth.sql
set client_min_messages = notice;
do $$
begin
  assert (select core_stage from tl_lands where identity_id = (select ga from bf)) = 1, 'a land with 5 placements is backfilled awake';
  assert (select core_stage from tl_lands where identity_id = (select ha from bf)) = 0, 'a land with 4 placements stays dormant';
  raise notice 'PASS backfill: core_stage = 1 only at ≥ 5 placements';
end $$;

-- ---------- privileges: service_role only ----------
do $$
declare fn text;
begin
  foreach fn in array array['public.tl_grant_piece(uuid,uuid,text,smallint)', 'public.tl_extend_seed(uuid,uuid,smallint)', 'public.tl_move_core(uuid,integer,integer)', 'public.tl_grow_land(uuid)', 'public.tl_reserve_placement_cells()'] loop
    assert not has_function_privilege('anon', fn, 'execute'), 'anon cannot execute ' || fn;
    assert not has_function_privilege('authenticated', fn, 'execute'), 'authenticated cannot execute ' || fn;
    assert has_function_privilege('service_role', fn, 'execute'), 'service_role executes ' || fn;
    assert (select not exists (select 1 from aclexplode((select proacl from pg_proc where oid = fn::regprocedure)) a where a.grantee = 0)), 'PUBLIC has no grant on ' || fn;
    assert (select prosecdef = false and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = fn::regprocedure), fn || ' is security invoker with a pinned search_path';
  end loop;
  raise notice 'PASS privileges: EXECUTE revoked from public/anon/authenticated, granted to service_role';
end $$;

set role anon;
do $$ begin perform public.tl_grow_land(gen_random_uuid()); raise exception 'anon executed tl_grow_land'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.tl_move_core(gen_random_uuid(), 0, 0); raise exception 'anon executed tl_move_core'; exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
do $$ begin perform public.tl_grant_piece(gen_random_uuid(), gen_random_uuid(), 'seed'); raise exception 'authenticated executed tl_grant_piece'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.tl_extend_seed(gen_random_uuid(), gen_random_uuid(), 72::smallint); raise exception 'authenticated executed tl_extend_seed'; exception when insufficient_privilege then null; end $$;
reset role;

-- The API's path: service_role, RLS on, security invoker.
create temp table svc_identity as select pg_temp.person() as id;
grant select on svc_identity to service_role;
set role service_role;
do $$
declare s uuid := (select id from svc_identity); r jsonb; inv uuid;
begin
  r := public.tl_grant_piece(s, pg_temp.ev(s), 'seed');
  assert (r->>'ok')::boolean and r->>'item_id' = 'crypto_bay_data_dock', 'service_role grants';
  r := public.tl_extend_seed(s, (r->>'inventory_id')::uuid, 168::smallint);
  assert (r->>'ok')::boolean and r->>'tier' = 'landmark', 'service_role extends';
  r := public.tl_grant_piece(s, pg_temp.ev(s), 'bloomed');
  inv := (r->>'inventory_id')::uuid;
  insert into public.tl_placements(identity_id, inventory_id, x, y) values (s, inv, 0, 0);
  assert (public.tl_move_core(s, 5, 5)->>'ok')::boolean, 'service_role moves the core';
  assert (public.tl_grow_land(s)->>'ok')::boolean, 'service_role grows';
  raise notice 'PASS service_role path under RLS';
end $$;
reset role;

\echo 'PASS: trader land growth — schema, grants, extend, core, growth, checks, backfill, privileges'
