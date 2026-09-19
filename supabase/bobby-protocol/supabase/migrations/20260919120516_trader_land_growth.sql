-- ============================================================
-- Trader Land — Growth v1 (docs/trader-land/GROWTH-v1.md §2).
--   · tl_items.tier / tier_index: the fixed, repeating piece sequence of each
--     horizon tier (common 1×1 · building 2×1 · landmark 2×2)
--   · tl_inventory.horizon_hours: how long a seed's thesis plays out before
--     it can be reviewed (24 h common · 72 h building · 168 h landmark)
--   · tl_lands.core_x / core_y / core_stage: the Aura Core moves and wakes;
--     an island grows 8 → 10 → 12 → 16 and never shrinks
--   · tl_reserve_placement_cells() reserves the core where the land keeps it,
--     reading the land FOR SHARE so a core move or a growth step serializes
--     with every placement
--   · RPCs, service_role only, that lock the land row before they touch
--     anything: tl_grant_piece, tl_extend_seed, tl_move_core, tl_grow_land,
--     and the placement writes tl_place_piece / tl_move_piece /
--     tl_remove_piece. Every write that touches an island's pieces takes the
--     land row first, so a growth step (land, then each placement) can never
--     deadlock against a place/move/remove (a plain write takes the placement
--     first).
--     Expected refusals return {ok:false,error:'<code>'}, never an exception.
--   · bobby_link_identities keeps progress.route_index from moving back now
--     that the common tier repeats (the legacy route_index no longer grows)
-- Additive and safe under the deployed API: every default reproduces today's
-- rules (core at 3,3, 24 h seeds, 8×8) and nothing calls the RPCs until the
-- API ships. Idempotent: re-running it changes nothing.
-- ============================================================
begin;

-- Take the table locks up front, in the order a live placement write takes
-- them (tl_inventory through its FK check, then tl_items and tl_lands in the
-- reservation trigger), so this migration can never deadlock with the running
-- API. If a write is in flight it waits for it, at most 5 s, then fails whole.
set local lock_timeout = '5s';
lock table public.tl_inventory, public.tl_items, public.tl_lands in access exclusive mode;

-- ---------- tier sequences ----------
alter table public.tl_items add column if not exists tier text;
alter table public.tl_items add column if not exists tier_index smallint;
alter table public.tl_items drop constraint if exists tl_items_tier_check;
alter table public.tl_items add constraint tl_items_tier_check check (tier in ('common', 'building', 'landmark'));
alter table public.tl_items drop constraint if exists tl_items_tier_key;
alter table public.tl_items add constraint tl_items_tier_key unique (tier, tier_index);

-- route_index stays (the legacy Discovery Route), unused by the new grants.
update public.tl_items t set tier = v.tier, tier_index = v.tier_index
from (values
  ('crypto_bay_data_dock',             'common',    1),
  ('crypto_bay_water_walkway',         'common',    2),
  ('risk_reef_dual_orbit_antenna',     'common',    3),
  ('thesis_citadel_risk_shield',       'common',    4),
  ('evidence_mines_crystal_vein_rock', 'common',    5),
  ('axiom_archive_return_path',        'common',    6),
  ('axiom_archive_aura_flower',        'common',    7),
  ('crypto_bay_context_buoy',          'common',    8),
  ('evidence_mines_open_tunnel',       'common',    9),
  ('evidence_mines_lantern_drone',     'common',   10),
  ('thesis_citadel_wall_slab',         'common',   11),
  ('thesis_citadel_fortified_ramp',    'common',   12),
  ('risk_reef_reef_tile',              'common',   13),
  ('risk_reef_blue_sluice',            'common',   14),
  ('axiom_archive_archive_ring_tile',  'common',   15),
  ('thesis_citadel_double_gate',       'building',  1),
  ('crypto_bay_candle_tower',          'building',  2),
  ('evidence_mines_evidence_workshop', 'building',  3),
  ('risk_reef_red_team_observatory',   'building',  4),
  ('axiom_archive_lit_archive',        'building',  5),
  ('crypto_bay_waiting_lighthouse',    'landmark',  1),
  ('evidence_mines_mother_crystal',    'landmark',  2),
  ('risk_reef_double_bridge',          'landmark',  3),
  ('thesis_citadel_three_gate_citadel','landmark',  4),
  ('axiom_archive_base_ring_seal',     'landmark',  5)
) as v(id, tier, tier_index)
where t.id = v.id and (t.tier is distinct from v.tier or t.tier_index is distinct from v.tier_index);

-- ---------- horizons ----------
alter table public.tl_inventory add column if not exists horizon_hours smallint not null default 24;
alter table public.tl_inventory drop constraint if exists tl_inventory_horizon_hours_check;
alter table public.tl_inventory add constraint tl_inventory_horizon_hours_check check (horizon_hours in (24, 72, 168));

-- ---------- the growing island and its core ----------
alter table public.tl_lands add column if not exists core_x smallint not null default 3;
alter table public.tl_lands add column if not exists core_y smallint not null default 3;
alter table public.tl_lands add column if not exists core_stage smallint not null default 0;
alter table public.tl_lands drop constraint if exists tl_lands_core_stage_check;
alter table public.tl_lands add constraint tl_lands_core_stage_check check (core_stage in (0, 1));
alter table public.tl_lands drop constraint if exists tl_lands_size_check;
alter table public.tl_lands add constraint tl_lands_size_check check (size in (8, 10, 12, 16));
alter table public.tl_lands drop constraint if exists tl_lands_core_inside;
alter table public.tl_lands add constraint tl_lands_core_inside check (core_x >= 0 and core_y >= 0 and core_x + 2 <= size and core_y + 2 <= size);

-- Islands that already stand on 5 pieces start awake; waking is permanent.
update public.tl_lands l set core_stage = 1
where l.core_stage = 0 and (select count(*) from public.tl_placements p where p.identity_id = l.identity_id) >= 5;

-- ---------- occupied cells: the core comes from the land ----------
create or replace function public.tl_reserve_placement_cells() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  piece record;
  land_size integer;
  core_col integer;
  core_row integer;
  width integer;
  height integer;
begin
  select i.identity_id, i.state, t.footprint_w, t.footprint_h into piece
    from public.tl_inventory i join public.tl_items t on t.id = i.item_id
    where i.id = new.inventory_id;
  -- FOR SHARE: a concurrent core move or growth step (FOR UPDATE) waits for
  -- this placement, or this placement reads the land they committed. The
  -- API's writes (tl_place_piece / tl_move_piece) already hold the land
  -- FOR UPDATE by now, which is what keeps them clear of a growth deadlock.
  select l.size, l.core_x, l.core_y into land_size, core_col, core_row
    from public.tl_lands l where l.identity_id = new.identity_id for share;
  if piece.identity_id is distinct from new.identity_id or piece.state is distinct from 'bloomed' then
    raise exception 'Placement requires an owned, bloomed piece' using errcode = '23514';
  end if;
  width := case when new.rotation in (90, 270) then piece.footprint_h else piece.footprint_w end;
  height := case when new.rotation in (90, 270) then piece.footprint_w else piece.footprint_h end;
  if land_size is null or width < 1 or height < 1 or new.x < 0 or new.y < 0
    or new.x + width > land_size or new.y + height > land_size then
    raise exception 'Placement is outside the island' using errcode = '23514';
  end if;
  if new.x < core_col + 2 and new.x + width > core_col and new.y < core_row + 2 and new.y + height > core_row then
    raise exception 'The Aura Core footprint is reserved' using errcode = '23514';
  end if;
  delete from public.tl_placement_cells where placement_id = new.id;
  insert into public.tl_placement_cells(identity_id, x, y, placement_id)
    select new.identity_id, cx, cy, new.id
    from generate_series(new.x, new.x + width - 1) cx
    cross join generate_series(new.y, new.y + height - 1) cy;
  return new;
end;
$$;
revoke all on function public.tl_reserve_placement_cells() from public, anon, authenticated;
grant execute on function public.tl_reserve_placement_cells() to service_role;

-- ---------- tl_grant_piece: one awarded read / NO TRADE → the next piece of its tier ----------
-- n = the identity's 'route' rows whose item is in the tier (any state);
-- the piece is sequence[n mod len] among the tier's active items. Keyed on
-- the ledger event: a replay returns the row it already granted.
create or replace function public.tl_grant_piece(p_identity uuid, p_event uuid, p_state text, p_hours smallint default 24)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tier text;
  v_n integer;
  v_len integer;
  v_item text;
  v_row public.tl_inventory%rowtype;
  v_replay boolean := false;
begin
  if p_identity is null or p_event is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  if p_state is null or p_state not in ('seed', 'bloomed') then
    return jsonb_build_object('ok', false, 'error', 'bad_state');
  end if;
  v_tier := case p_hours when 24 then 'common' when 72 then 'building' when 168 then 'landmark' end;
  if v_tier is null then
    return jsonb_build_object('ok', false, 'error', 'bad_hours');
  end if;

  insert into public.tl_lands(identity_id) values (p_identity) on conflict (identity_id) do nothing;
  perform 1 from public.tl_lands where identity_id = p_identity for update;

  select * into v_row from public.tl_inventory where identity_id = p_identity and event_id = p_event;
  if found then
    v_replay := true;
  else
    select count(*) into v_n
      from public.tl_inventory i join public.tl_items t on t.id = i.item_id
      where i.identity_id = p_identity and i.source = 'route' and t.tier = v_tier;
    select count(*) into v_len from public.tl_items where tier = v_tier and active;
    if v_len = 0 then
      return jsonb_build_object('ok', false, 'error', 'empty_tier');
    end if;
    select id into v_item from public.tl_items where tier = v_tier and active
      order by tier_index offset (v_n % v_len) limit 1;
    insert into public.tl_inventory(identity_id, item_id, state, source, event_id, bloomed_at, horizon_hours)
      values (p_identity, v_item, p_state, 'route', p_event, case when p_state = 'bloomed' then now() end, p_hours)
      on conflict (identity_id, event_id) do nothing
      returning * into v_row;
    if not found then
      select * into v_row from public.tl_inventory where identity_id = p_identity and event_id = p_event;
      v_replay := true;
    end if;
  end if;

  select t.tier into v_tier from public.tl_items t where t.id = v_row.item_id;
  select count(*) into v_n
    from public.tl_inventory i join public.tl_items t on t.id = i.item_id
    where i.identity_id = p_identity and i.source = 'route' and t.tier = v_tier;
  return jsonb_build_object(
    'ok', true, 'inventory_id', v_row.id, 'item_id', v_row.item_id, 'tier', v_tier,
    'horizon_hours', v_row.horizon_hours, 'state', v_row.state, 'held', v_n,
    'seeded_at', v_row.seeded_at, 'replay', v_replay);
end;
$$;
revoke execute on function public.tl_grant_piece(uuid, uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.tl_grant_piece(uuid, uuid, text, smallint) to service_role;

-- ---------- tl_extend_seed: a longer horizon re-points the seed to the next piece of the new tier ----------
-- Upward only, only before the review opens. The common slot the seed held
-- is released because n counts rows by the tier of their current item.
create or replace function public.tl_extend_seed(p_identity uuid, p_inventory uuid, p_hours smallint)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_seed public.tl_inventory%rowtype;
  v_tier text;
  v_n integer;
  v_len integer;
  v_item text;
  v_review_at timestamptz;
begin
  perform 1 from public.tl_lands where identity_id = p_identity for update;
  select * into v_seed from public.tl_inventory where id = p_inventory and identity_id = p_identity for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_seed.state <> 'seed' then
    return jsonb_build_object('ok', false, 'error', 'not_seed');
  end if;
  if p_hours is null or p_hours not in (72, 168) or p_hours <= v_seed.horizon_hours then
    return jsonb_build_object('ok', false, 'error', 'not_upward');
  end if;
  v_review_at := v_seed.seeded_at + make_interval(hours => v_seed.horizon_hours);
  if now() >= v_review_at then
    return jsonb_build_object('ok', false, 'error', 'review_open', 'review_at', v_review_at);
  end if;

  v_tier := case p_hours when 72 then 'building' else 'landmark' end;
  select count(*) into v_n
    from public.tl_inventory i join public.tl_items t on t.id = i.item_id
    where i.identity_id = p_identity and i.source = 'route' and t.tier = v_tier and i.id <> v_seed.id;
  select count(*) into v_len from public.tl_items where tier = v_tier and active;
  if v_len = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_tier');
  end if;
  select id into v_item from public.tl_items where tier = v_tier and active
    order by tier_index offset (v_n % v_len) limit 1;
  update public.tl_inventory set item_id = v_item, horizon_hours = p_hours where id = v_seed.id;
  return jsonb_build_object(
    'ok', true, 'inventory_id', v_seed.id, 'item_id', v_item, 'tier', v_tier, 'horizon_hours', p_hours,
    'review_at', v_seed.seeded_at + make_interval(hours => p_hours));
end;
$$;
revoke execute on function public.tl_extend_seed(uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function public.tl_extend_seed(uuid, uuid, smallint) to service_role;

-- ---------- tl_move_core: the 2×2 core goes where no piece stands ----------
-- p_size: the island size the client drew the target on (null = unknown). A
-- growth shifts every cell by a ring, so a target drawn on another size is
-- refused ('resized') instead of landing one ring off.
drop function if exists public.tl_move_core(uuid, int, int);
create or replace function public.tl_move_core(p_identity uuid, p_x int, p_y int, p_size int default null)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_size integer;
begin
  select size into v_size from public.tl_lands where identity_id = p_identity for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_size is not null and p_size <> v_size then
    return jsonb_build_object('ok', false, 'error', 'resized', 'size', v_size);
  end if;
  if p_x is null or p_y is null or p_x < 0 or p_y < 0 or p_x + 2 > v_size or p_y + 2 > v_size then
    return jsonb_build_object('ok', false, 'error', 'outside');
  end if;
  if exists (select 1 from public.tl_placement_cells
             where identity_id = p_identity and x between p_x and p_x + 1 and y between p_y and p_y + 1) then
    return jsonb_build_object('ok', false, 'error', 'occupied');
  end if;
  update public.tl_lands set core_x = p_x, core_y = p_y, updated_at = now() where identity_id = p_identity;
  return jsonb_build_object('ok', true, 'core_x', p_x, 'core_y', p_y);
end;
$$;
revoke execute on function public.tl_move_core(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.tl_move_core(uuid, int, int, int) to service_role;

-- ---------- placement writes: the land row first, then the piece ----------
-- tl_grow_land holds the land FOR UPDATE, drops the island's cells and then
-- shifts each placement. A plain write on tl_placements waits the other way
-- round: an INSERT/UPDATE holds its row (and unique index entry) when the
-- AFTER trigger asks for the land FOR SHARE, and a DELETE holds its row when
-- its cascade reaches the cells the growth already took. Either can deadlock
-- with a growth step, so these three take the land first.
-- p_size is the island size the caller validated the coordinates on (null =
-- unchecked): a growth that commits in between shifts every cell, so the
-- write is refused ('resized') rather than applied one ring off. Any refusal
-- by the trigger or a key means the island changed since the caller read it
-- ('changed'; `detail` is the database's message).
create or replace function public.tl_place_piece(p_identity uuid, p_inventory uuid, p_x int, p_y int, p_rotation int default 0, p_size int default null)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_size integer;
  v_id uuid;
begin
  select size into v_size from public.tl_lands where identity_id = p_identity for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_size is not null and p_size <> v_size then
    return jsonb_build_object('ok', false, 'error', 'resized', 'size', v_size);
  end if;
  begin
    insert into public.tl_placements(identity_id, inventory_id, x, y, rotation)
      values (p_identity, p_inventory, p_x, p_y, coalesce(p_rotation, 0))
      returning id into v_id;
  exception when unique_violation or check_violation or foreign_key_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'changed', 'detail', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'placement_id', v_id);
end;
$$;
revoke execute on function public.tl_place_piece(uuid, uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.tl_place_piece(uuid, uuid, int, int, int, int) to service_role;

create or replace function public.tl_move_piece(p_identity uuid, p_placement uuid, p_x int, p_y int, p_rotation int default 0, p_size int default null)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_size integer;
  v_id uuid;
begin
  select size into v_size from public.tl_lands where identity_id = p_identity for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_size is not null and p_size <> v_size then
    return jsonb_build_object('ok', false, 'error', 'resized', 'size', v_size);
  end if;
  begin
    update public.tl_placements set x = p_x, y = p_y, rotation = coalesce(p_rotation, 0)
      where id = p_placement and identity_id = p_identity
      returning id into v_id;
  exception when unique_violation or check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'changed', 'detail', sqlerrm);
  end;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'placement_id', v_id);
end;
$$;
revoke execute on function public.tl_move_piece(uuid, uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.tl_move_piece(uuid, uuid, int, int, int, int) to service_role;

-- Storing a piece needs no frame: it is addressed by id. The land lock only
-- keeps it from interleaving with a growth step (its cascade deletes the
-- cells the growth is re-reserving).
create or replace function public.tl_remove_piece(p_identity uuid, p_placement uuid)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  perform 1 from public.tl_lands where identity_id = p_identity for update;
  delete from public.tl_placements where id = p_placement and identity_id = p_identity returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'placement_id', v_id);
end;
$$;
revoke execute on function public.tl_remove_piece(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tl_remove_piece(uuid, uuid) to service_role;

-- ---------- tl_grow_land: wake the core at 5 pieces, add rings at the thresholds ----------
-- occupied = placement cells + the 4 core cells. 8×8 at 39 → 10×10, 10×10
-- at 60 → 12×12, 12×12 at 87 → 16×16. A ring shifts every placement and the
-- core by (next − size)/2 on both axes. Placements move one row at a time,
-- far corner first (x + y desc): tl_placements_one_per_cell is checked per
-- row, and the reservation trigger re-reserves each row's cells after the
-- old cells were released.
create or replace function public.tl_grow_land(p_identity uuid)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_land public.tl_lands%rowtype;
  v_from integer;
  v_next integer;
  v_threshold integer;
  v_shift integer;
  v_total_shift integer := 0;
  v_occupied integer;
  v_woke boolean := false;
  v_placement record;
begin
  select * into v_land from public.tl_lands where identity_id = p_identity for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_from := v_land.size;
  if v_land.core_stage = 0 and (select count(*) from public.tl_placements where identity_id = p_identity) >= 5 then
    update public.tl_lands set core_stage = 1, updated_at = now() where identity_id = p_identity;
    v_land.core_stage := 1;
    v_woke := true;
  end if;
  loop
    v_next := case v_land.size when 8 then 10 when 10 then 12 when 12 then 16 end;
    v_threshold := case v_land.size when 8 then 39 when 10 then 60 when 12 then 87 end;
    exit when v_next is null;
    select count(*) + 4 into v_occupied from public.tl_placement_cells where identity_id = p_identity;
    exit when v_occupied < v_threshold;
    v_shift := (v_next - v_land.size) / 2;
    delete from public.tl_placement_cells where identity_id = p_identity;
    update public.tl_lands
      set size = v_next, core_x = core_x + v_shift, core_y = core_y + v_shift, updated_at = now()
      where identity_id = p_identity
      returning * into v_land;
    for v_placement in
      select id from public.tl_placements where identity_id = p_identity order by x + y desc, x desc
    loop
      update public.tl_placements set x = x + v_shift, y = y + v_shift where id = v_placement.id;
    end loop;
    v_total_shift := v_total_shift + v_shift;
  end loop;
  return jsonb_build_object(
    'ok', true, 'grew', v_land.size <> v_from, 'from', v_from, 'to', v_land.size, 'shift', v_total_shift,
    'size', v_land.size, 'core_x', v_land.core_x, 'core_y', v_land.core_y, 'core_stage', v_land.core_stage,
    'woke', v_woke);
end;
$$;
revoke execute on function public.tl_grow_land(uuid) from public, anon, authenticated;
grant execute on function public.tl_grow_land(uuid) to service_role;

-- ---------- bobby_link_identities: progress.route_index never moves back ----------
-- The merge recomputed route_index as the count of distinct legacy route
-- pieces (tl_items.route_index 1..8). Common grants now cycle through 15
-- pieces and only 7 of them carry a legacy index (the Double Gate is a
-- building), so an account showing 8 would drop to 7 on a link. The counter
-- is now the largest of: what either identity already showed, the common
-- pieces held (GROWTH-v1 §3, capped at 8) and the legacy count. Only the
-- v_stored / v_common reads and the `v_route := greatest(…)` line differ
-- from 20260903000010 (no API calls this RPC today; /api/identity-link is
-- retired, but this is its durable definition).
create or replace function public.bobby_link_identities(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_keep public.bobby_identities%rowtype;
  v_merge public.bobby_identities%rowtype;
  v_xp integer; v_aura integer; v_events integer; v_streak integer; v_route integer;
  v_last_day date; v_daily integer; v_daily_day date;
  v_stored integer; v_common integer;
begin
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'bobby_link_identities: need two different identities' using errcode = '22023';
  end if;
  select * into v_keep from public.bobby_identities where id = p_keep for update;
  select * into v_merge from public.bobby_identities where id = p_merge for update;
  if v_keep.id is null or v_merge.id is null then
    raise exception 'bobby_link_identities: identity not found' using errcode = '22023';
  end if;
  if v_keep.auth_user_id is not null and v_merge.auth_user_id is not null and v_keep.auth_user_id <> v_merge.auth_user_id then
    raise exception 'bobby_link_identities: both identities already belong to different accounts' using errcode = '22023';
  end if;
  if v_keep.wallet_address is not null and v_merge.wallet_address is not null and v_keep.wallet_address <> v_merge.wallet_address then
    raise exception 'bobby_link_identities: both identities already have different wallets' using errcode = '22023';
  end if;
  -- Read before the merged row (and its progress, on delete cascade) goes away.
  select coalesce(max(route_index), 0) into v_stored from public.bobby_progress where identity_id in (p_keep, p_merge);

  delete from public.tl_placements where identity_id = p_merge;
  delete from public.tl_lands where identity_id = p_merge;
  update public.bobby_progress_events set identity_id = p_keep where identity_id = p_merge;
  update public.tl_inventory set identity_id = p_keep where identity_id = p_merge;
  update public.bobby_pre_calls set identity_id = p_keep where identity_id = p_merge;
  -- C-04 (final audit): receipts follow the person, they are not orphaned.
  update public.bobby_swap_receipts set identity_id = p_keep where identity_id = p_merge;
  update public.bobby_identities set
    auth_user_id = coalesce(v_keep.auth_user_id, v_merge.auth_user_id),
    email = coalesce(v_keep.email, v_merge.email),
    provider = coalesce(v_keep.provider, v_merge.provider),
    last_seen_at = now()
  where id = p_keep;
  delete from public.bobby_identities where id = p_merge;
  if v_merge.wallet_address is not null and v_keep.wallet_address is null then
    update public.bobby_identities set wallet_address = v_merge.wallet_address where id = p_keep;
  end if;
  select coalesce(sum(awarded), 0), coalesce(sum(aura), 0), count(*) into v_xp, v_aura, v_events
    from public.bobby_progress_events where identity_id = p_keep;
  select count(distinct i.route_index) into v_route
    from public.tl_inventory inv join public.tl_items i on i.id = inv.item_id
    where inv.identity_id = p_keep and inv.source = 'route' and i.route_index is not null;
  select count(*) into v_common
    from public.tl_inventory inv join public.tl_items i on i.id = inv.item_id
    where inv.identity_id = p_keep and inv.source = 'route' and i.tier = 'common';
  v_route := greatest(v_stored, least(v_common, 8), least(v_route, 8));
  select max(day_key) into v_last_day from public.bobby_progress_events where identity_id = p_keep and awarded > 0;
  select count(*) into v_daily from public.bobby_progress_events where identity_id = p_keep and awarded > 0 and day_key = v_last_day;
  v_daily_day := v_last_day;
  with days as (select distinct day_key d from public.bobby_progress_events where identity_id = p_keep and awarded > 0),
       ordered as (select d, lag(d) over (order by d) prev from days),
       breaks as (select d, case when prev is null or d - prev > 2 then 1 else 0 end brk from ordered),
       runs as (select d, sum(brk) over (order by d) run from breaks)
  select count(*) into v_streak from runs where run = (select max(run) from runs);
  insert into public.bobby_progress (identity_id) values (p_keep) on conflict (identity_id) do nothing;
  update public.bobby_progress set
    xp = v_xp, aura = v_aura, route_index = least(v_route, 8), streak = coalesce(v_streak, 0),
    last_day = v_last_day, daily_awards = coalesce(v_daily, 0), daily_awards_day = v_daily_day,
    updated_at = now()
  where identity_id = p_keep;
  return jsonb_build_object('kept', p_keep, 'merged', p_merge, 'xp', v_xp, 'aura', v_aura, 'events', v_events, 'streak', coalesce(v_streak, 0), 'route_index', least(v_route, 8));
end $$;
revoke all on function public.bobby_link_identities(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bobby_link_identities(uuid, uuid) to service_role;

commit;
