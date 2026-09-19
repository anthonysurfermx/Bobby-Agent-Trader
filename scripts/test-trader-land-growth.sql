-- ============================================================
-- scripts/test-trader-land-growth.sql — Trader Land Growth v1 on a real
-- Postgres (docs/trader-land/GROWTH-v1.md §2): tier backfill and sequences,
-- grants and replays, NO TRADE blooms, horizon extends, the movable core,
-- island growth with the ring shift, the core waking, the placement writes
-- (land lock first, stale frames refused) and their races with a growth
-- step, the identity link's route counter, checks and revokes.
-- The race section drives extra sessions through dblink (contrib, shipped
-- with every PostgreSQL build) back into this same throwaway cluster.
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
-- Production's service_role carries BYPASSRLS (verified on bobby-protocol);
-- without it a service-role write to an RLS table fails only in the fixture.
create role service_role bypassrls;

-- agent_trades as production shapes it (the columns the deletion path touches;
-- user_id carries an identity id and has no FK, so deletion must null it).
create table if not exists public.agent_trades (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  token_address text not null,
  token_symbol text not null,
  direction text not null,
  amount_usd numeric not null,
  user_id uuid
);
grant all on public.agent_trades to service_role;
\ir ../supabase/bobby-protocol/supabase/migrations/20260903000005_bobby_progress.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260903000006_trader_land.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260904222250_trader_land_occupied_cells.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260904230244_trader_land_public_worlds.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20260919120516_trader_land_growth.sql
-- Idempotent: a second run changes nothing and fails nothing.
\ir ../supabase/bobby-protocol/supabase/migrations/20260919120516_trader_land_growth.sql
-- bobby_link_identities re-parents swap receipts; the real table (migration
-- 20260903000009) needs the agent schema, so a stand-in with the same key.
create table if not exists public.bobby_swap_receipts (id uuid primary key default gen_random_uuid(), identity_id uuid references public.bobby_identities(id) on delete set null);
create extension if not exists dblink;
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

-- Extending an OLDER seed: n is a count (§1.3 sequence[n mod len]), so the
-- next common read steps back one piece rather than returning the extended
-- seed's own piece; that piece comes back when the sequence wraps. This pins
-- the contract formula; the §1.3 parenthetical only describes the latest seed.
do $$
declare v uuid := pg_temp.person(); s1 jsonb; s2 jsonb; s3 jsonb; r jsonb;
begin
  s1 := tl_grant_piece(v, pg_temp.ev(v), 'seed');
  s2 := tl_grant_piece(v, pg_temp.ev(v), 'seed');
  s3 := tl_grant_piece(v, pg_temp.ev(v), 'seed');
  assert s3->>'item_id' = 'risk_reef_dual_orbit_antenna', 'three commons';
  assert (tl_extend_seed(v, (s2->>'inventory_id')::uuid, 72::smallint)->>'ok')::boolean, 'the middle seed goes to 3 days';
  r := tl_grant_piece(v, pg_temp.ev(v), 'seed');
  assert r->>'item_id' = 'risk_reef_dual_orbit_antenna' and (r->>'held')::int = 3, 'n = 2 → common #3 again: ' || r::text;
  raise notice 'PASS extend: an older seed releases a count, not its own piece (contract formula)';
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
  -- A target drawn on another island size is refused before anything else.
  r := tl_move_core(c, 6, 0, 10);
  assert r->>'error' = 'resized' and (r->>'size')::int = 8, 'a core target drawn on a 10×10 is refused on an 8×8: ' || r::text;
  assert (tl_move_core(c, 6, 0, 8)->>'ok')::boolean, 'the same target drawn on the 8×8 moves the core';
  raise notice 'PASS core: outside/occupied/not_found/resized/ok, trigger rejects the moved rectangle, old cells freed';
end $$;

-- ---------- placement writes: the land row first, stale frames and races refused as data ----------
do $$
declare k uuid := pg_temp.person(); other uuid := pg_temp.person(); inv uuid; inv2 uuid; seed uuid; theirs uuid; pl uuid; r jsonb;
begin
  insert into tl_inventory(identity_id, item_id, state, source, bloomed_at) values (k, 'crypto_bay_data_dock', 'bloomed', 'route', now()) returning id into inv;
  insert into tl_inventory(identity_id, item_id, state, source, bloomed_at) values (k, 'crypto_bay_data_dock', 'bloomed', 'route', now()) returning id into inv2;
  insert into tl_inventory(identity_id, item_id, state, source) values (k, 'crypto_bay_data_dock', 'seed', 'route') returning id into seed;
  insert into tl_inventory(identity_id, item_id, state, source, bloomed_at) values (other, 'crypto_bay_data_dock', 'bloomed', 'route', now()) returning id into theirs;
  assert tl_place_piece(k, inv, 0, 0, 0, 8)->>'error' = 'not_found', 'no land, nowhere to place';
  insert into tl_lands(identity_id) values (k), (other);
  -- The frame the caller validated on must still be the island's.
  r := tl_place_piece(k, inv, 0, 0, 0, 10);
  assert r->>'error' = 'resized' and (r->>'size')::int = 8, 'coordinates drawn on a 10×10 are refused on an 8×8: ' || r::text;
  assert not exists (select 1 from tl_placements where inventory_id = inv), 'and nothing is placed';
  r := tl_place_piece(k, inv, 0, 0, 0, 8);
  assert (r->>'ok')::boolean, 'placed: ' || r::text;
  pl := (r->>'placement_id')::uuid;
  assert exists (select 1 from tl_placements where id = pl and identity_id = k and x = 0 and y = 0), 'the row is written';
  assert (select count(*) from tl_placement_cells where placement_id = pl) = 1, 'and its cell reserved';
  -- Every database refusal is data ('changed'), never an exception.
  assert tl_place_piece(k, inv, 1, 0)->>'error' = 'changed', 'a piece placed twice';
  assert tl_place_piece(k, inv2, 0, 0)->>'error' = 'changed', 'an occupied cell';
  r := tl_place_piece(k, inv2, 3, 4);
  assert r->>'error' = 'changed' and r->>'detail' = 'The Aura Core footprint is reserved', 'the core: ' || r::text;
  assert tl_place_piece(k, inv2, 8, 0)->>'detail' = 'Placement is outside the island', 'outside';
  assert tl_place_piece(k, seed, 1, 1)->>'detail' = 'Placement requires an owned, bloomed piece', 'a seed';
  assert tl_place_piece(k, theirs, 1, 1)->>'error' = 'changed', 'someone else''s piece';
  assert tl_place_piece(k, gen_random_uuid(), 1, 1)->>'error' = 'changed', 'an unknown piece';
  assert (select count(*) from tl_placements where identity_id = k) = 1 and (select count(*) from tl_placement_cells where identity_id = k) = 1, 'refusals leave the island as it was';
  -- Move.
  r := tl_move_piece(k, pl, 7, 7, 90, 8);
  assert (r->>'ok')::boolean and r->>'placement_id' = pl::text, 'moved: ' || r::text;
  assert exists (select 1 from tl_placements where id = pl and x = 7 and y = 7 and rotation = 90), 'the row moved';
  assert (select array_agg(x || ':' || y) from tl_placement_cells where placement_id = pl) = array['7:7'], 'and its cell followed';
  assert tl_move_piece(k, pl, 3, 3, 0, 8)->>'error' = 'changed', 'onto the core';
  assert tl_move_piece(k, pl, 0, 0, 0, 10)->>'error' = 'resized', 'drawn on another size';
  assert exists (select 1 from tl_placements where id = pl and x = 7 and y = 7), 'refused moves leave the piece';
  assert tl_move_piece(other, pl, 0, 0, 0, 8)->>'error' = 'not_found', 'someone else''s placement is not found';
  assert tl_move_piece(k, gen_random_uuid(), 0, 0, 0, 8)->>'error' = 'not_found', 'an unknown placement';
  -- Remove (by id: no frame).
  assert tl_remove_piece(other, pl)->>'error' = 'not_found', 'someone else cannot store it';
  assert (tl_remove_piece(k, pl)->>'ok')::boolean, 'stored';
  assert not exists (select 1 from tl_placements where id = pl) and not exists (select 1 from tl_placement_cells where placement_id = pl), 'row and cells released';
  assert tl_remove_piece(k, pl)->>'error' = 'not_found', 'storing twice';
  raise notice 'PASS placement writes: place/move/remove, resized, changed with the database reason, not_found';
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

-- ---------- races with a growth step: no deadlock, no piece one ring off ----------
-- Real sessions (dblink into this cluster), ordered by locks, not by sleeps.
-- Before the placement RPCs, a plain UPDATE / DELETE / INSERT on
-- tl_placements took the placement first and the land second (the trigger's
-- FOR SHARE) while tl_grow_land takes the land first and each placement
-- second: cases A and B died with "deadlock detected", and in case C the
-- piece meant for the 8×8 corner (7,7) landed one ring inside the 10×10.
create function pg_temp.session(name text) returns int language plpgsql as $$
begin
  perform dblink_connect(name, format('host=127.0.0.1 port=%s user=%s dbname=%s', current_setting('port'), current_user, current_database()));
  return (select pid from dblink(name, 'select pg_backend_pid()') as t(pid int));
end $$;
-- Wait until a session is parked on a lock (its request is queued behind ours).
create function pg_temp.parked(pid int) returns void language plpgsql as $$
begin
  for i in 1..1000 loop
    perform pg_stat_clear_snapshot();
    if exists (select 1 from pg_stat_activity a where a.pid = parked.pid and a.wait_event_type = 'Lock') then return; end if;
    perform pg_sleep(0.01);
  end loop;
  raise exception 'session % never waited on a lock', pid;
end $$;
-- The async answer of a session (an error there, e.g. a deadlock, fails the test).
create function pg_temp.answer(name text) returns jsonb language plpgsql as $$
declare out jsonb;
begin
  select r into out from dblink_get_result(name) as t(r jsonb);
  perform 1 from dblink_get_result(name) as t(r jsonb);
  return out;
end $$;
-- An 8×8 at the growth threshold: 35 1×1 pieces row-major around the core + 4 core cells = 39.
create function pg_temp.full_island() returns uuid language plpgsql as $$
declare p uuid := pg_temp.person();
begin
  insert into public.tl_lands(identity_id) values (p);
  perform pg_temp.fill(p, 35);
  return p;
end $$;
create temp table race(name text primary key, identity_id uuid, placement uuid, inventory uuid);
insert into race select 'move', pg_temp.full_island();
insert into race select 'remove', pg_temp.full_island();
-- (a separate statement: the one that built the island cannot see its rows yet)
update race r set placement = p.id from tl_placements p where p.identity_id = r.identity_id and p.x = 0 and p.y = 0;
-- A bloomed piece in hand, not on the island.
create function pg_temp.in_hand(p uuid) returns uuid language sql as $$
  insert into public.tl_inventory(identity_id, item_id, state, source, bloomed_at) values (p, 'crypto_bay_data_dock', 'bloomed', 'route', now()) returning id
$$;
insert into race select 'place', pg_temp.full_island();
update race set inventory = pg_temp.in_hand(identity_id) where name = 'place';

do $$
declare
  g_pid int := pg_temp.session('grow'); w_pid int := pg_temp.session('writer'); l_pid int := pg_temp.session('pause');
  v_id uuid; v_pl uuid; v_inv uuid; grew jsonb; out jsonb;
begin
  -- A. A move drawn on the 8×8 queues behind a growth that holds the land.
  select identity_id, placement into v_id, v_pl from race where name = 'move';
  perform dblink_exec('grow', 'begin');
  perform * from dblink('grow', format('select 1 from tl_lands where identity_id = %L for update', v_id)) as t(x int);
  perform dblink_send_query('writer', format('select tl_move_piece(%L, %L, 7, 7, 0, 8)', v_id, v_pl));
  perform pg_temp.parked(w_pid);
  select r into grew from dblink('grow', format('select tl_grow_land(%L)', v_id)) as t(r jsonb);
  perform dblink_exec('grow', 'commit');
  out := pg_temp.answer('writer');
  assert (grew->>'grew')::boolean and (grew->>'to')::int = 10, 'A: the growth went through: ' || grew::text;
  assert out->>'error' = 'resized' and (out->>'size')::int = 10, 'A: the move waited on the land, then was refused as drawn on the 8×8: ' || out::text;
  assert exists (select 1 from tl_placements where id = v_pl and x = 1 and y = 1), 'A: the piece only took the ring shift';

  -- B. A store lands while the growth is mid-shift (paused on its first row).
  select identity_id, placement into v_id, v_pl from race where name = 'remove';
  perform dblink_exec('pause', 'begin');
  perform * from dblink('pause', format('select 1 from tl_placements where identity_id = %L order by x + y desc, x desc limit 1 for update', v_id)) as t(x int);
  perform dblink_send_query('grow', format('select tl_grow_land(%L)', v_id));
  perform pg_temp.parked(g_pid);
  perform dblink_send_query('writer', format('select tl_remove_piece(%L, %L)', v_id, v_pl));
  perform pg_temp.parked(w_pid);
  perform dblink_exec('pause', 'commit');
  grew := pg_temp.answer('grow');
  out := pg_temp.answer('writer');
  assert (grew->>'grew')::boolean, 'B: the growth finished: ' || grew::text;
  assert (out->>'ok')::boolean, 'B: the store waited for it, then stored the shifted piece: ' || out::text;
  assert not exists (select 1 from tl_placements where id = v_pl) and not exists (select 1 from tl_placement_cells where placement_id = v_pl), 'B: row and cells gone';
  assert (select count(*) from tl_placement_cells where identity_id = v_id) = 34, 'B: the other 34 cells re-reserved in the 10×10';

  -- C. A placement at the 8×8 corner (7,7) queues behind a growth.
  select identity_id, inventory into v_id, v_inv from race where name = 'place';
  perform dblink_exec('grow', 'begin');
  perform * from dblink('grow', format('select 1 from tl_lands where identity_id = %L for update', v_id)) as t(x int);
  perform dblink_send_query('writer', format('select tl_place_piece(%L, %L, 7, 7, 0, 8)', v_id, v_inv));
  perform pg_temp.parked(w_pid);
  select r into grew from dblink('grow', format('select tl_grow_land(%L)', v_id)) as t(r jsonb);
  perform dblink_exec('grow', 'commit');
  out := pg_temp.answer('writer');
  assert (grew->>'grew')::boolean, 'C: the growth went through';
  assert out->>'error' = 'resized', 'C: the placement was refused, not applied one ring inside: ' || out::text;
  assert not exists (select 1 from tl_placements where inventory_id = v_inv), 'C: the piece stays in hand';

  perform dblink_disconnect('grow'); perform dblink_disconnect('writer'); perform dblink_disconnect('pause');
  raise notice 'PASS races: move / store / place against a growth step — no deadlock, stale frames refused';
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
\ir ../supabase/bobby-protocol/supabase/migrations/20260919120516_trader_land_growth.sql
set client_min_messages = notice;
do $$
begin
  assert (select core_stage from tl_lands where identity_id = (select ga from bf)) = 1, 'a land with 5 placements is backfilled awake';
  assert (select core_stage from tl_lands where identity_id = (select ha from bf)) = 0, 'a land with 4 placements stays dormant';
  raise notice 'PASS backfill: core_stage = 1 only at ≥ 5 placements';
end $$;

-- ---------- the identity link keeps progress.route_index ----------
-- Commons 1..8 carry only 7 legacy route indexes (the Double Gate, legacy
-- #5, is a building now). The merge used to recompute the counter from the
-- legacy index alone, turning an 8 into a 7.
create function pg_temp.wallet() returns uuid language sql as $$
  insert into public.bobby_identities(wallet_address) values ('0x' || md5(gen_random_uuid()::text)) returning id
$$;
do $$
declare k uuid := pg_temp.person(); m uuid := pg_temp.wallet(); a uuid := pg_temp.person(); b uuid := pg_temp.wallet(); r jsonb;
begin
  for i in 1..8 loop perform tl_grant_piece(k, pg_temp.ev(k), 'seed'); end loop;
  insert into bobby_progress(identity_id, route_index) values (k, 8), (m, 0);
  assert (select count(distinct t.route_index) from tl_inventory i join tl_items t on t.id = i.item_id where i.identity_id = k and t.route_index is not null) = 7, 'eight commons, seven legacy indexes';
  r := bobby_link_identities(k, m);
  assert (r->>'route_index')::int = 8 and (select route_index from bobby_progress where identity_id = k) = 8, 'the link keeps 8: ' || r::text;
  -- Two partial islands: 3 + 6 commons → 9 held, capped at 8, more than either showed.
  for i in 1..3 loop perform tl_grant_piece(a, pg_temp.ev(a), 'seed'); end loop;
  for i in 1..6 loop perform tl_grant_piece(b, pg_temp.ev(b), 'seed'); end loop;
  insert into bobby_progress(identity_id, route_index) values (a, 3), (b, 6);
  r := bobby_link_identities(a, b);
  assert (r->>'route_index')::int = 8 and (select route_index from bobby_progress where identity_id = a) = 8, 'the union of commons counts: ' || r::text;
  assert not exists (select 1 from bobby_identities where id = b) and (select count(*) from tl_inventory where identity_id = a) = 9, 'the merged identity is folded in';
  raise notice 'PASS link: route_index never moves back (stored, commons held, legacy count)';
end $$;

-- ---------- privileges: service_role only ----------
do $$
declare fn text;
begin
  assert to_regprocedure('public.tl_move_core(uuid,integer,integer)') is null, 'no 3-argument tl_move_core overload is left behind';
  foreach fn in array array['public.tl_grant_piece(uuid,uuid,text,smallint)', 'public.tl_extend_seed(uuid,uuid,smallint)', 'public.tl_move_core(uuid,integer,integer,integer)', 'public.tl_grow_land(uuid)',
      'public.tl_place_piece(uuid,uuid,integer,integer,integer,integer)', 'public.tl_move_piece(uuid,uuid,integer,integer,integer,integer)', 'public.tl_remove_piece(uuid,uuid)', 'public.tl_reserve_placement_cells()'] loop
    assert not has_function_privilege('anon', fn, 'execute'), 'anon cannot execute ' || fn;
    assert not has_function_privilege('authenticated', fn, 'execute'), 'authenticated cannot execute ' || fn;
    assert has_function_privilege('service_role', fn, 'execute'), 'service_role executes ' || fn;
    assert (select not exists (select 1 from aclexplode((select proacl from pg_proc where oid = fn::regprocedure)) a where a.grantee = 0)), 'PUBLIC has no grant on ' || fn;
    assert (select prosecdef = false and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = fn::regprocedure), fn || ' is security invoker with a pinned search_path';
  end loop;
  -- The identity merge stays what 20260903000010 made it: security definer, service_role only.
  fn := 'public.bobby_link_identities(uuid,uuid)';
  assert not has_function_privilege('anon', fn, 'execute') and not has_function_privilege('authenticated', fn, 'execute') and has_function_privilege('service_role', fn, 'execute'), fn || ' is service_role only';
  assert (select not exists (select 1 from aclexplode((select proacl from pg_proc where oid = fn::regprocedure)) a where a.grantee = 0)), 'PUBLIC has no grant on ' || fn;
  assert (select prosecdef and proconfig @> array['search_path=public, pg_catalog'] from pg_proc where oid = fn::regprocedure), fn || ' keeps security definer and its search_path';
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
  r := public.tl_place_piece(s, inv, 0, 0, 0, 8);
  assert (r->>'ok')::boolean, 'service_role places: ' || r::text;
  assert (public.tl_move_piece(s, (r->>'placement_id')::uuid, 1, 0, 0, 8)->>'ok')::boolean, 'service_role moves a piece';
  assert (public.tl_move_core(s, 5, 5, 8)->>'ok')::boolean, 'service_role moves the core';
  assert (public.tl_grow_land(s)->>'ok')::boolean, 'service_role grows';
  assert (public.tl_remove_piece(s, (r->>'placement_id')::uuid)->>'ok')::boolean, 'service_role stores a piece';
  raise notice 'PASS service_role path under RLS';
end $$;
reset role;

\echo 'PASS: trader land growth — schema, grants, extend, core, placement writes, growth, races, checks, backfill, link, privileges'
