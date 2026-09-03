-- ============================================================
-- Final audit 2026-09-03 — P0-1, P0-2, C-04, plus the agent_cycles identifiers
-- Codex's RLS matrix flagged. Every change is additive or a revoke; nothing is
-- dropped that a server path depends on (all server readers use the service
-- key, verified: api-cache.ts, rate-limit-persistent.ts, wallet-session.ts).
-- ============================================================

-- P0-1: api_cache carried the identity-link pairing code as its lookup key,
-- and this policy let anon read every unexpired row — exactly the window in
-- which the code was valid. The SIWE nonce rows share the table. Nothing in
-- src/ reads api_cache; only the server does, with the service key.
drop policy if exists api_cache_anon_read on public.api_cache;
revoke all on public.api_cache from anon, authenticated;

-- P0-2: agent_trades carries owner_address / user_id / tx_hash next to
-- per-trade PnL and had USING (true) for anon. /api/bobby-pnl's aggregate-only
-- branch was decorative while the table answered to the anon key directly.
drop policy if exists agent_trades_public_read on public.agent_trades;
revoke all on public.agent_trades from anon, authenticated;

-- The public dashboard keeps a deliberately shaped view: the columns it
-- renders, no identifiers, no hashes, no signatures, and ONLY protocol-owned
-- rows. A user's own trades are reachable exclusively through /api/bobby-pnl
-- with their identity. The view runs as its owner, so RLS on the base table
-- does not apply to it — the column list and the WHERE are the policy.
create or replace view public.agent_trades_public
with (security_barrier = true) as
  select id, cycle_id, chain, token_address, token_symbol, direction, amount_usd,
         entry_price, stop_price, target_price, exit_price, status, outcome,
         realized_pnl_pct, llm_reasoning, confidence, signal_sources,
         created_at, settled_at, expires_at
    from public.agent_trades
   where owner_address is null and user_id is null;
revoke all on public.agent_trades_public from public;
grant select on public.agent_trades_public to anon, authenticated, service_role;

-- Same class: agent_cycles has user_id + owner_address and USING (true).
drop policy if exists agent_cycles_public_read on public.agent_cycles;
revoke all on public.agent_cycles from anon, authenticated;
create or replace view public.agent_cycles_public
with (security_barrier = true) as
  select id, started_at, completed_at, status, error, signals_found,
         signals_filtered, llm_decisions, trades_executed, trades_blocked,
         trades_successful, total_usd_deployed, latency_ms, llm_model,
         llm_reasoning, mood, dynamic_conviction, safe_mode_active, vibe_phrase,
         idle_cash_usd, yield_debate_triggered
    from public.agent_cycles
   where owner_address is null and user_id is null;
revoke all on public.agent_cycles_public from public;
grant select on public.agent_cycles_public to anon, authenticated, service_role;

-- C-04: the identity merge deleted the merged row without re-parenting
-- bobby_swap_receipts; the FK is ON DELETE SET NULL, so receipts lost their
-- identity. The endpoint that called this is retired (P0-1), but the RPC is
-- the durable definition and must be right if it is ever called again.
-- Only the added line differs from 20260903000007.
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
