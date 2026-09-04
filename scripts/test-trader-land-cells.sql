-- Run only against an isolated empty local test database, never production.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
create table bobby_identities(id uuid primary key);
create table tl_lands(identity_id uuid primary key, size integer);
create table tl_items(id text primary key, footprint_w integer, footprint_h integer);
create table tl_inventory(id uuid primary key, identity_id uuid, item_id text, state text);
create table tl_placements(id uuid primary key default gen_random_uuid(), identity_id uuid, inventory_id uuid unique, x integer, y integer, rotation integer default 0);
insert into bobby_identities values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into tl_lands select id, 8 from bobby_identities;
insert into tl_items values ('wide',2,1), ('small',1,1);
insert into tl_inventory values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','wide','bloomed'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111','small','bloomed'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','11111111-1111-4111-8111-111111111111','small','seed');
\ir ../supabase/bobby-protocol/supabase/migrations/20260904222250_trader_land_occupied_cells.sql

do $$
declare owner uuid := '11111111-1111-4111-8111-111111111111'; placement uuid;
begin
 insert into tl_placements(identity_id,inventory_id,x,y) values(owner,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',1,1) returning id into placement;
 assert (select count(*) from tl_placement_cells where placement_id = placement) = 2, 'Full footprint reserved';
 begin
   insert into tl_placements(identity_id,inventory_id,x,y) values(owner,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',2,1);
   raise exception 'Overlap was accepted';
 exception when unique_violation then null; end;
 update tl_placements set rotation=90 where id=placement;
 assert exists(select 1 from tl_placement_cells where placement_id=placement and x=1 and y=2), 'Rotated footprint reserved';
 assert not exists(select 1 from tl_placement_cells where placement_id=placement and x=2 and y=1), 'Old footprint released';
 begin
   update tl_placements set x=3,y=3 where id=placement;
   raise exception 'Core overlap was accepted';
 exception when check_violation then null; end;
 assert (select x=1 and y=1 from tl_placements where id=placement), 'Failed move preserved placement';
 assert (select count(*) from tl_placement_cells where placement_id=placement)=2, 'Failed move preserved reservation';
 begin
   update tl_placements set y=7 where id=placement;
   raise exception 'Out-of-bounds rotation was accepted';
 exception when check_violation then null; end;
 begin
   insert into tl_placements(identity_id,inventory_id,x,y) values(owner,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',0,0);
   raise exception 'Seed was accepted';
 exception when check_violation then null; end;
 begin
   update tl_placements set identity_id='22222222-2222-4222-8222-222222222222' where id=placement;
   raise exception 'Mismatched owner was accepted';
 exception when check_violation then null; end;
 delete from tl_placements where id=placement;
 assert not exists(select 1 from tl_placement_cells where placement_id=placement), 'Store released reservations';
 raise notice 'PASS: full footprint, collision, rotation, core, bounds, seed, ownership, rollback, removal';
end $$;
