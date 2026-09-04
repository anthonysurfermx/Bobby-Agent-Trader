-- Reserve every occupied tile, not only a piece's origin. A primary key
-- arbitrates concurrent placements/moves inside the database transaction.
-- Existing invalid layouts cause the migration to roll back for review;
-- no user placement is silently deleted or moved.
begin;

create table if not exists public.tl_placement_cells (
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  x integer not null,
  y integer not null,
  placement_id uuid not null references public.tl_placements(id) on delete cascade,
  primary key (identity_id, x, y)
);
create index if not exists tl_placement_cells_placement on public.tl_placement_cells(placement_id);
alter table public.tl_placement_cells enable row level security;
drop policy if exists tl_placement_cells_service_all on public.tl_placement_cells;
create policy tl_placement_cells_service_all on public.tl_placement_cells
  for all to service_role using (true) with check (true);
revoke all on public.tl_placement_cells from anon, authenticated;
grant all on public.tl_placement_cells to service_role;

create or replace function public.tl_reserve_placement_cells() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  piece record;
  land_size integer;
  width integer;
  height integer;
begin
  select i.identity_id, i.state, t.footprint_w, t.footprint_h into piece
    from public.tl_inventory i join public.tl_items t on t.id = i.item_id
    where i.id = new.inventory_id;
  select size into land_size from public.tl_lands where identity_id = new.identity_id;
  if piece.identity_id is distinct from new.identity_id or piece.state is distinct from 'bloomed' then
    raise exception 'Placement requires an owned, bloomed piece' using errcode = '23514';
  end if;
  width := case when new.rotation in (90, 270) then piece.footprint_h else piece.footprint_w end;
  height := case when new.rotation in (90, 270) then piece.footprint_w else piece.footprint_h end;
  if land_size is null or width < 1 or height < 1 or new.x < 0 or new.y < 0
    or new.x + width > land_size or new.y + height > land_size then
    raise exception 'Placement is outside the island' using errcode = '23514';
  end if;
  if new.x < 5 and new.x + width > 3 and new.y < 5 and new.y + height > 3 then
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

drop trigger if exists tl_placement_cells_reserve on public.tl_placements;
create trigger tl_placement_cells_reserve after insert or update on public.tl_placements
  for each row execute function public.tl_reserve_placement_cells();

-- Revalidate and reserve current footprints without changing their content.
update public.tl_placements set x = x;
commit;
