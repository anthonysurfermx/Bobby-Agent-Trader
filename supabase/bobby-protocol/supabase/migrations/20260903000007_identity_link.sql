-- ============================================================
-- Identity linking — one person, one progress, whichever door they used.
-- The web signs in with a wallet (SIWE), the phone with Apple; each creates
-- its own bobby_identities row. bobby_link_identities(keep, merge) folds the
-- second into the first ATOMICALLY: the ledger, inventory and pre-calls are
-- re-parented, the merged land is dropped (its placed pieces go back to the
-- inventory), the wallet moves to the kept row, progress is RECOMPUTED from
-- the union of the ledgers (never trusted from either client), and the
-- merged row disappears. Idempotent per pair; service_role only — called by
-- /api/identity-link after a short-lived code proved both sides.
-- ============================================================
create or replace function public.bobby_link_identities(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_keep public.bobby_identities%rowtype;
  v_merge public.bobby_identities%rowtype;
  v_xp integer; v_aura integer; v_events integer; v_streak integer; v_route integer;
  v_last_day date; v_daily integer; v_daily_day date;
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

  -- 1. the merged land goes away; its placed pieces return to the inventory
  delete from public.tl_placements where identity_id = p_merge;
  delete from public.tl_lands where identity_id = p_merge;
  -- 2. re-parent everything that is history or possession
  update public.bobby_progress_events set identity_id = p_keep where identity_id = p_merge;
  update public.tl_inventory set identity_id = p_keep where identity_id = p_merge;
  update public.bobby_pre_calls set identity_id = p_keep where identity_id = p_merge;
  -- 3. credentials: the kept row gains whatever the merged one had
  update public.bobby_identities set
    auth_user_id = coalesce(v_keep.auth_user_id, v_merge.auth_user_id),
    email = coalesce(v_keep.email, v_merge.email),
    provider = coalesce(v_keep.provider, v_merge.provider),
    last_seen_at = now()
  where id = p_keep;
  delete from public.bobby_identities where id = p_merge;   -- cascades bobby_progress of the merged row
  if v_merge.wallet_address is not null and v_keep.wallet_address is null then
    update public.bobby_identities set wallet_address = v_merge.wallet_address where id = p_keep;
  end if;
  -- 4. progress recomputed from the union of the ledgers (server truth)
  select coalesce(sum(awarded), 0), coalesce(sum(aura), 0), count(*) into v_xp, v_aura, v_events
    from public.bobby_progress_events where identity_id = p_keep;
  select count(*) into v_route from public.tl_inventory where identity_id = p_keep and source = 'route';
  select max(day_key) into v_last_day from public.bobby_progress_events where identity_id = p_keep and awarded > 0;
  select count(*) into v_daily from public.bobby_progress_events where identity_id = p_keep and awarded > 0 and day_key = v_last_day;
  v_daily_day := v_last_day;
  -- streak: consecutive award days ending at the last award day (one grace day allowed)
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
