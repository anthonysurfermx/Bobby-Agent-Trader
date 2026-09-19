-- Keep the event ledger, daily cap, counters and route grant in one transaction.
-- Only the trusted API can execute these functions; identity comes from verified auth.
create or replace function public.bobby_apply_progress(
  p_identity uuid, p_platform text, p_events jsonb default '[]', p_profile jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_row public.bobby_progress%rowtype;
  v_event public.bobby_progress_events%rowtype;
  v_input jsonb;
  v_results jsonb := '[]';
  v_grant jsonb;
  v_points integer;
  v_awarded integer;
  v_aura integer;
  v_before integer;
  v_day date;
  v_at timestamptz;
  v_daily integer;
  v_import integer := 0;
  v_claim integer;
  v_duplicate boolean;
  v_restore boolean := coalesce((p_profile->>'restore')::boolean, false);
begin
  if p_identity is null or p_platform not in ('ios','web') or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'Invalid progress request';
  end if;
  -- Land first: compatible with Growth's lock order and re-entrant route grants.
  insert into public.tl_lands(identity_id) values(p_identity) on conflict do nothing;
  perform 1 from public.tl_lands where identity_id=p_identity for update;
  insert into public.bobby_progress(identity_id) values(p_identity) on conflict do nothing;
  select * into strict v_row from public.bobby_progress where identity_id=p_identity for update;

  v_claim := greatest(0, least(100000, coalesce((p_profile->>'localXpClaim')::integer, 0)));
  -- Old builds report a total that already includes this batch. New clients
  -- send only historical XP, explicitly excluding ALL pending batches.
  if coalesce((p_profile->>'localXpIncludesPending')::boolean, true) then
    select greatest(0, v_claim - coalesce(sum(case e->>'kind' when 'read_complete' then 10 when 'no_trade_respected' then 20 else 0 end),0))::integer
      into v_claim from jsonb_array_elements(p_events) e;
  end if;
  if v_claim > 0 and v_row.xp=0 and not exists(select 1 from public.bobby_progress_events where identity_id=p_identity) then
    v_import := least(300,v_claim);
    v_row.xp := v_import;
    insert into public.bobby_progress_events(identity_id,client_event_id,kind,points,awarded,aura,xp_after,platform,occurred_at,day_key,meta)
      values(p_identity,gen_random_uuid(),'legacy_import',v_import,v_import,0,v_row.xp,p_platform,now(),(now() at time zone 'UTC')::date,jsonb_build_object('claimed',v_claim));
  end if;

  for v_input in select value from jsonb_array_elements(p_events) order by value->>'at' loop
    if v_input->>'kind' not in ('read_complete','no_trade_respected') then raise exception 'Invalid award kind'; end if;
    select * into v_event from public.bobby_progress_events
      where identity_id=p_identity and client_event_id=(v_input->>'id')::uuid;
    v_duplicate := found;
    v_before := v_row.xp;
    if not v_duplicate then
      v_at := least(greatest((v_input->>'at')::timestamptz,now()-interval '30 days'),now()+interval '5 minutes');
      v_day := ((v_at at time zone 'UTC') - make_interval(mins => greatest(-840,least(840,coalesce((v_input->>'tzOffsetMin')::integer,0)))))::date;
      select count(*) into v_daily from public.bobby_progress_events
        where identity_id=p_identity and day_key=v_day and awarded>0 and kind in ('read_complete','no_trade_respected');
      v_points := case v_input->>'kind' when 'read_complete' then 10 else 20 end;
      v_awarded := case when v_daily < 3 then v_points else 0 end;
      v_aura := case when v_awarded=0 then 0 when v_input->>'kind'='read_complete' then 2 else 6 end;
      v_row.xp := v_row.xp+v_awarded;
      v_row.aura := coalesce(v_row.aura,0)+v_aura;
      if v_awarded>0 and (v_row.last_day is null or v_day>v_row.last_day) then
        v_row.streak := case when v_row.last_day is null then 1 when v_day-v_row.last_day=1 then v_row.streak+1 when v_day-v_row.last_day=2 then v_row.streak else 1 end;
        v_row.last_day := v_day;
      end if;
      if v_row.daily_awards_day is null or v_day >= v_row.daily_awards_day then
        v_row.daily_awards_day := v_day;
        v_row.daily_awards := v_daily + case when v_awarded>0 then 1 else 0 end;
      end if;
      insert into public.bobby_progress_events(identity_id,client_event_id,kind,points,awarded,aura,xp_after,platform,occurred_at,day_key,meta)
        values(p_identity,(v_input->>'id')::uuid,v_input->>'kind',v_points,v_awarded,v_aura,v_row.xp,p_platform,v_at,v_day,
          coalesce(v_input->'meta','{}'::jsonb) || case when v_input ? 'thesis' then jsonb_build_object('thesis',v_input->'thesis') else '{}'::jsonb end)
        returning * into v_event;
    end if;
    v_grant := null;
    if v_event.awarded>0 and v_event.kind in ('read_complete','no_trade_respected') then
      v_grant := public.tl_grant_piece(p_identity,v_event.id,case when v_event.kind='no_trade_respected' then 'bloomed' else 'seed' end,24::smallint);
      if not coalesce((v_grant->>'ok')::boolean,false) then raise exception 'Route grant unavailable'; end if;
      if not coalesce((v_grant->>'replay')::boolean,false) then v_row.route_index := least(8,coalesce(v_row.route_index,0)+1); end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id',v_event.client_event_id,'awarded',case when v_duplicate then 0 else v_event.awarded end,
      'aura',case when v_duplicate then 0 else v_event.aura end,'xpBefore',v_before,'xpAfter',v_row.xp,'duplicate',v_duplicate,'grant',v_grant));
  end loop;

  update public.bobby_progress set
    xp=v_row.xp,aura=v_row.aura,route_index=v_row.route_index,streak=v_row.streak,last_day=v_row.last_day,
    daily_awards=v_row.daily_awards,daily_awards_day=v_row.daily_awards_day,last_platform=p_platform,updated_at=now(),
    companion_id=case when p_profile ? 'companionId' and (not v_restore or companion_id is null) then p_profile->>'companionId' else companion_id end,
    vibe_id=case when p_profile ? 'vibeId' and not v_restore then p_profile->>'vibeId' else vibe_id end,
    onboarded=onboarded or coalesce((p_profile->>'onboarded')::boolean,false),
    risk_notice_version=greatest(risk_notice_version,coalesce((p_profile->>'riskNoticeVersion')::integer,0)),
    quick_access=case when p_profile ? 'quickAccess' and not v_restore then p_profile->'quickAccess' else quick_access end
    where identity_id=p_identity returning * into v_row;
  return jsonb_build_object('progress',to_jsonb(v_row),'results',v_results,'legacyImported',v_import);
end;
$$;
revoke execute on function public.bobby_apply_progress(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bobby_apply_progress(uuid,text,jsonb,jsonb) to service_role;

-- Closing a thesis must not bloom its seed before the ledger/counters commit.
-- The API supplies a verified public-price verdict; the transaction rechecks
-- ownership, horizon, readiness and whether a swap bonus was already consumed.
create or replace function public.bobby_close_seed(
  p_identity uuid,p_inventory uuid,p_hours integer,p_platform text,p_tz integer,
  p_closed jsonb,p_season text[] default '{}'
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_seed public.tl_inventory%rowtype;
  v_row public.bobby_progress%rowtype;
  v_ledger uuid := gen_random_uuid();
  v_day date := ((now() at time zone 'UTC')-make_interval(mins=>greatest(-840,least(840,p_tz))))::date;
  v_closed jsonb := p_closed;
  v_executed jsonb := nullif(p_closed->'executed','null'::jsonb);
  v_xp integer := 15;
  v_aura integer := 6;
  v_season text;
  v_replay jsonb;
begin
  if p_platform not in ('ios','web') then raise exception 'Invalid platform'; end if;
  perform 1 from public.tl_lands where identity_id=p_identity for update;
  select * into v_row from public.bobby_progress where identity_id=p_identity for update;
  if not found then return jsonb_build_object('ok',false,'error','progress_unavailable'); end if;
  select * into v_seed from public.tl_inventory where id=p_inventory and identity_id=p_identity for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_seed.state <> 'seed' then
    select meta->'thesis_close' into v_replay from public.bobby_progress_events
      where identity_id=p_identity and kind='thesis_closed' and meta->'thesis_close'->>'inventoryId'=p_inventory::text limit 1;
    if v_replay is not null then return jsonb_build_object('ok',true,'closed',v_replay,'replay',true); end if;
    return jsonb_build_object('ok',false,'error','already_bloomed');
  end if;
  if v_seed.horizon_hours<>p_hours or now()<v_seed.seeded_at+make_interval(hours=>v_seed.horizon_hours) then
    return jsonb_build_object('ok',false,'error','review_not_ready','reviewAt',v_seed.seeded_at+make_interval(hours=>v_seed.horizon_hours));
  end if;
  if v_executed is not null and exists(select 1 from public.bobby_progress_events
    where identity_id=p_identity and meta->'thesis_close'->'executed'->>'receiptId'=v_executed->>'receiptId') then
    v_executed := null;
  end if;
  if v_executed is not null then v_xp:=25;v_aura:=10; end if;
  if v_row.last_day is null or v_day>v_row.last_day then
    v_row.streak:=case when v_row.last_day is null then 1 when v_day-v_row.last_day=1 then v_row.streak+1 when v_day-v_row.last_day=2 then v_row.streak else 1 end;
    v_row.last_day:=v_day;
  end if;
  v_closed:=v_closed || jsonb_build_object('inventoryId',v_seed.id,'itemId',v_seed.item_id,'executed',v_executed,
    'xp',v_xp,'aura',v_aura,'xpAfter',v_row.xp+v_xp,'ledgerEventId',v_ledger,'plantEventId',v_seed.event_id,'reviewedAt',now());
  insert into public.bobby_progress_events(id,identity_id,client_event_id,kind,points,awarded,aura,xp_after,platform,occurred_at,day_key,meta)
    values(v_ledger,p_identity,gen_random_uuid(),'thesis_closed',v_xp,v_xp,v_aura,v_row.xp+v_xp,p_platform,now(),v_day,jsonb_build_object('thesis_close',v_closed));
  if v_executed is not null then
    select candidate into v_season from unnest(p_season) with ordinality as s(candidate,n)
      where exists(select 1 from public.tl_items where id=candidate and active)
      and not exists(select 1 from public.tl_inventory where identity_id=p_identity and source='season' and item_id=candidate)
      order by n limit 1;
    if v_season is not null then
      insert into public.tl_inventory(identity_id,item_id,state,source,event_id,bloomed_at)
        values(p_identity,v_season,'bloomed','season',v_ledger,now());
    end if;
  end if;
  v_closed:=v_closed || jsonb_build_object('seasonItemId',v_season);
  update public.bobby_progress_events set meta=jsonb_build_object('thesis_close',v_closed) where id=v_ledger;
  update public.tl_inventory set state='bloomed',bloomed_at=now() where id=v_seed.id;
  update public.bobby_progress set xp=v_row.xp+v_xp,aura=v_row.aura+v_aura,streak=v_row.streak,last_day=v_row.last_day,
    last_platform=p_platform,updated_at=now() where identity_id=p_identity;
  return jsonb_build_object('ok',true,'closed',v_closed,'replay',false);
end;
$$;
revoke execute on function public.bobby_close_seed(uuid,uuid,integer,text,integer,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.bobby_close_seed(uuid,uuid,integer,text,integer,jsonb,text[]) to service_role;
