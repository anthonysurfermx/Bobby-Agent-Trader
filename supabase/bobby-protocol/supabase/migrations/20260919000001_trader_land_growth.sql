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
--   · four RPCs, service_role only, that lock the land row before they touch
--     anything: tl_grant_piece, tl_extend_seed, tl_move_core, tl_grow_land.
--     Expected refusals return {ok:false,error:'<code>'}, never an exception.
-- Additive and safe under the deployed API: every default reproduces today's
-- rules (core at 3,3, 24 h seeds, 8×8) and nothing calls the RPCs until the
-- API ships. Idempotent: re-running it changes nothing.
-- ============================================================
begin;

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
  -- this placement, or this placement reads the land they committed.
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
create or replace function public.tl_move_core(p_identity uuid, p_x int, p_y int)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_size integer;
begin
  select size into v_size from public.tl_lands where identity_id = p_identity for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
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
revoke execute on function public.tl_move_core(uuid, int, int) from public, anon, authenticated;
grant execute on function public.tl_move_core(uuid, int, int) to service_role;

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

commit;
