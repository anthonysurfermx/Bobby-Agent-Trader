-- Apply only to the Bobby database, with progress writers paused during cutover.
-- These RPCs are service-only: API validation/rules remain the policy boundary.
-- Existing duplicate rewards deliberately fail the uniqueness preflight; never
-- delete or silently reconcile historical user rewards in a schema migration.
begin;

alter table public.bobby_progress add column revision bigint not null default 0;
create function public.bobby_progress_revision() returns trigger
language plpgsql set search_path = public as $$
begin
  new.revision := old.revision + 1;
  return new;
end $$;
create trigger bobby_progress_revision before update on public.bobby_progress
for each row execute function public.bobby_progress_revision();

alter table public.bobby_progress_events
  add column execution_eligible_at timestamptz,
  add column execution_asset_address text,
  add column close_inventory_id uuid references public.tl_inventory(id),
  add column execution_receipt_id uuid references public.bobby_swap_receipts(id);
-- Historical closes remain spent, even though historical reads are not newly
-- certified as execution-eligible. Invalid or duplicate references fail closed.
update public.bobby_progress_events
set close_inventory_id = (meta #>> '{thesis_close,inventoryId}')::uuid,
    execution_receipt_id = (meta #>> '{thesis_close,executed,receiptId}')::uuid
where kind = 'thesis_closed';
create unique index bobby_progress_close_once on public.bobby_progress_events(close_inventory_id);
create unique index bobby_progress_receipt_once on public.bobby_progress_events(execution_receipt_id);
alter table public.tl_inventory add column season_id text;
update public.tl_inventory set season_id = 'onchain_s1' where source = 'season';
create unique index tl_season_piece_once on public.tl_inventory(identity_id, season_id, item_id)
where source = 'season';
create index bobby_swap_execution_window on public.bobby_swap_receipts(wallet_address, block_timestamp, id)
where status = 'confirmed' and chain_id = 8453;

-- One boundary for every balance writer: compare the snapshot revision while
-- holding the row lock, then save ledger, route inventory and balance together.
create function public.bobby_commit_progress(
  p_identity uuid, p_revision bigint, p_patch jsonb, p_events jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.bobby_progress%rowtype; e jsonb; eid uuid; inv uuid;
  item public.tl_items%rowtype; route integer; grants jsonb := '{}'::jsonb;
  state text; eligible timestamptz; asset text;
begin
  -- Identity linking already locks identities before merging their ledgers.
  perform id from public.bobby_identities where id=p_identity for update;
  select * into p from public.bobby_progress where identity_id = p_identity for update;
  if not found then raise exception 'Progress not initialized'; end if;
  if p.revision is distinct from p_revision then return jsonb_build_object('retry', true); end if;
  route := p.route_index;
  for e in select value from jsonb_array_elements(p_events) loop
    if e->>'kind' not in ('read_complete', 'no_trade_respected', 'legacy_import') then
      raise exception 'Invalid plant kind';
    end if;
    -- The API supplies a canonical address, not any client meta field.
    asset := e->>'execution_asset_address';
    eligible := case when e->>'kind' = 'read_complete' and asset is not null
      then clock_timestamp() else null end;
    insert into public.bobby_progress_events
      (identity_id, client_event_id, kind, points, awarded, aura, xp_after, platform,
       occurred_at, day_key, meta, execution_eligible_at, execution_asset_address)
    values (p_identity, (e->>'client_event_id')::uuid, e->>'kind', (e->>'points')::integer,
      (e->>'awarded')::integer, coalesce((e->>'aura')::integer,0), (e->>'xp_after')::integer,
      e->>'platform', (e->>'occurred_at')::timestamptz, (e->>'day_key')::date, e->'meta', eligible, asset)
    returning id into eid;
    if (e->>'awarded')::integer > 0 and e->>'kind' <> 'legacy_import' then
      insert into public.tl_lands(identity_id) values (p_identity) on conflict do nothing;
      select * into item from public.tl_items where active and route_index = route + 1;
      inv := null;
      state := case when e->>'kind' = 'read_complete' then 'seed' else 'bloomed' end;
      if found then
        insert into public.tl_inventory(identity_id,item_id,state,source,event_id,bloomed_at)
        values (p_identity,item.id,state,'route',eid,case when state = 'bloomed' then clock_timestamp() end)
        returning id into inv;
        route := route + 1;
      end if;
      grants := grants || jsonb_build_object(e->>'client_event_id', jsonb_build_object(
        'routeIndex',route, 'item',case when inv is not null then jsonb_build_object(
          'id',item.id,'world',item.world,'attribution',item.attribution,'kind',item.kind,
          'name',item.name,'footprint',jsonb_build_array(item.footprint_w,item.footprint_h)) end,
        'inventoryId',inv,'state',case when inv is not null then state end,
        'bloomedInventoryId',null,'routeComplete',inv is null));
    end if;
  end loop;
  -- Only these columns may be patched. The server computes reward rules using
  -- the exact revision above; a stale request writes nothing and must rebase.
  update public.bobby_progress set
    xp=(p_patch->>'xp')::integer, aura=(p_patch->>'aura')::integer, route_index=route,
    streak=(p_patch->>'streak')::integer, last_day=(p_patch->>'last_day')::date,
    daily_awards=(p_patch->>'daily_awards')::integer, daily_awards_day=(p_patch->>'daily_awards_day')::date,
    last_platform=p_patch->>'last_platform', updated_at=clock_timestamp(),
    companion_id=case when p_patch ? 'companion_id' then p_patch->>'companion_id' else companion_id end,
    vibe_id=coalesce(p_patch->>'vibe_id',vibe_id),
    onboarded=coalesce((p_patch->>'onboarded')::boolean,onboarded),
    risk_notice_version=greatest(coalesce((p_patch->>'risk_notice_version')::integer,0),risk_notice_version),
    quick_access=coalesce(p_patch->'quick_access',quick_access)
  where identity_id=p_identity returning * into p;
  return jsonb_build_object('progress',to_jsonb(p),'grants',grants);
end $$;

-- Receipts are selected AFTER the progress lock, in a complete, bounded query.
-- Their persisted addresses and on-chain timestamps are authoritative; neither
-- symbol metadata nor a late confirmation timestamp can make a swap eligible.
create function public.bobby_close_seed(
  p_identity uuid, p_revision bigint, p_inventory uuid, p_closed jsonb,
  p_patch jsonb, p_day date, p_platform text, p_stables text[], p_season text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.bobby_progress%rowtype; seed public.tl_inventory%rowtype;
  plant public.bobby_progress_events%rowtype; swap public.bobby_swap_receipts%rowtype;
  item public.tl_items%rowtype; wallet text; eid uuid := gen_random_uuid();
  at_time timestamptz; closed jsonb; prior jsonb; executed jsonb := null;
  season_item jsonb := null; owned jsonb; next_item text; bonus integer := 0;
begin
  perform id from public.bobby_identities where id=p_identity for update;
  select * into p from public.bobby_progress where identity_id=p_identity for update;
  if not found then raise exception 'Progress not initialized'; end if;
  select meta->'close_result' into prior from public.bobby_progress_events
    where identity_id=p_identity and close_inventory_id=p_inventory;
  if prior is not null then return jsonb_build_object('closed',prior); end if;
  if p.revision is distinct from p_revision then return jsonb_build_object('retry',true); end if;
  select * into seed from public.tl_inventory where id=p_inventory and identity_id=p_identity for update;
  if not found then return jsonb_build_object('status',404,'error','Piece not in your inventory'); end if;
  if seed.state <> 'seed' then return jsonb_build_object('status',409,'error','This piece already bloomed'); end if;
  at_time := clock_timestamp();
  if seed.seeded_at + interval '24 hours' > at_time then
    return jsonb_build_object('status',409,'error','The market has not had time to answer yet');
  end if;
  select * into plant from public.bobby_progress_events where id=seed.event_id and identity_id=p_identity;
  select wallet_address into wallet from public.bobby_identities where id=p_identity;
  if wallet is not null and plant.execution_eligible_at is not null and
     plant.meta #>> '{thesis,direction}' in ('long','short') then
    select r.* into swap from public.bobby_swap_receipts r
      where r.wallet_address=wallet and r.chain_id=8453 and r.status='confirmed'
        and r.block_timestamp > plant.execution_eligible_at and r.block_timestamp <= at_time
        and r.tx_hash is not null
        and not exists (select 1 from public.bobby_progress_events e where e.execution_receipt_id=r.id)
        and (case when plant.meta #>> '{thesis,direction}'='long'
          then lower(r.token_out_address)=plant.execution_asset_address and lower(r.token_in_address)=any(p_stables)
          else lower(r.token_in_address)=plant.execution_asset_address and lower(r.token_out_address)=any(p_stables) end)
      order by r.block_timestamp,r.id limit 1 for update of r;
    if found then
      bonus := 10;
      executed := jsonb_build_object('receiptId',swap.id,'txHash',swap.tx_hash,
        'tokenIn',swap.token_in_symbol,'tokenOut',swap.token_out_symbol,'at',swap.block_timestamp,'xp',10,'aura',4);
    end if;
  end if;
  if bonus > 0 then
    select s.id into next_item from unnest(p_season) with ordinality s(id,n)
      where not exists (select 1 from public.tl_inventory i where i.identity_id=p_identity
        and i.source='season' and i.season_id='onchain_s1' and i.item_id=s.id)
      order by s.n limit 1;
    if next_item is not null then
      select * into item from public.tl_items where id=next_item and active;
      if not found then raise exception 'Season catalog incomplete'; end if;
      season_item := jsonb_build_object('id',item.id,'world',item.world,'attribution',item.attribution,
        'kind',item.kind,'name',item.name,'footprint',jsonb_build_array(item.footprint_w,item.footprint_h));
    end if;
  end if;
  closed := p_closed || jsonb_build_object('inventoryId',seed.id,'itemId',seed.item_id,
    'executed',executed,'xp',15+bonus,'aura',6+case when bonus>0 then 4 else 0 end,
    'xpAfter',p.xp+15+bonus,'ledgerEventId',eid);
  insert into public.bobby_progress_events
    (id,identity_id,client_event_id,kind,points,awarded,aura,xp_after,platform,occurred_at,day_key,
     meta,close_inventory_id,execution_receipt_id)
  values (eid,p_identity,eid,'thesis_closed',15+bonus,15+bonus,(closed->>'aura')::integer,
    p.xp+15+bonus,p_platform,at_time,p_day,
    jsonb_build_object('thesis_close',closed || jsonb_build_object('plantEventId',seed.event_id,'reviewedAt',at_time)),
    seed.id,swap.id);
  if next_item is not null then
    insert into public.tl_inventory(identity_id,item_id,state,source,event_id,bloomed_at,season_id)
    values(p_identity,next_item,'bloomed','season',eid,at_time,'onchain_s1');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id',item_id,'source',source)),'[]'::jsonb)
    into owned from public.tl_inventory where identity_id=p_identity and source='season' and season_id='onchain_s1';
  closed := closed || jsonb_build_object('seasonItem',season_item,'seasonInventory',owned);
  update public.bobby_progress_events set meta=meta || jsonb_build_object('close_result',closed) where id=eid;
  update public.tl_inventory set state='bloomed',bloomed_at=at_time where id=seed.id;
  update public.bobby_progress set xp=p.xp+15+bonus, aura=p.aura+(closed->>'aura')::integer,
    streak=(p_patch->>'streak')::integer,last_day=(p_patch->>'last_day')::date,
    daily_awards=(p_patch->>'daily_awards')::integer,daily_awards_day=(p_patch->>'daily_awards_day')::date,
    last_platform=p_platform,updated_at=at_time where identity_id=p_identity;
  return jsonb_build_object('closed',closed);
end $$;

revoke all on function public.bobby_progress_revision() from public,anon,authenticated;
revoke all on function public.bobby_commit_progress(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.bobby_close_seed(uuid,bigint,uuid,jsonb,jsonb,date,text,text[],text[]) from public,anon,authenticated;
grant execute on function public.bobby_commit_progress(uuid,bigint,jsonb,jsonb) to service_role;
grant execute on function public.bobby_close_seed(uuid,bigint,uuid,jsonb,jsonb,date,text,text[],text[]) to service_role;
commit;
