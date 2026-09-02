-- ============================================================
-- ROLLBACK for 20260902_bobby_rls_hardening.sql — restores the EXACT
-- policy set captured from the legacy database on 2026-09-02 (before the
-- hardening was applied), so the OLD production code (browser writes with
-- the anon key) works again if the new code has to be rolled back.
--
-- This re-opens the known holes (anyone with the anon key can write). It
-- exists only so that "roll back the code" never leaves production broken;
-- apply it together with the code rollback and re-apply the hardening
-- once the new code is back.
--
-- Idempotent: drops whatever policies exist on each table first.
-- ============================================================
create or replace function public.bobby_rls_reset_tmp(tbl text)
returns void language plpgsql as $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tbl loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
  end loop;
end $$;

-- ---- tables that had RLS ON with public (anon) policies ----
select public.bobby_rls_reset_tmp('agent_cycles');
alter table public.agent_cycles enable row level security;
create policy "Public read agent_cycles" on public.agent_cycles for select to public using (true);
create policy "Service write agent_cycles" on public.agent_cycles for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('agent_messages');
alter table public.agent_messages enable row level security;
create policy "Public read agent_messages" on public.agent_messages for select to public using (true);
create policy "Service write agent_messages" on public.agent_messages for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('agent_positions');
alter table public.agent_positions enable row level security;
create policy "Public read agent_positions" on public.agent_positions for select to public using (true);
create policy "Service write agent_positions" on public.agent_positions for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('agent_signals');
alter table public.agent_signals enable row level security;
create policy "Public read agent_signals" on public.agent_signals for select to public using (true);
create policy "Service write agent_signals" on public.agent_signals for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('agent_trades');
alter table public.agent_trades enable row level security;
create policy "Public read agent_trades" on public.agent_trades for select to public using (true);
create policy "Service write agent_trades" on public.agent_trades for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('api_cache');
alter table public.api_cache enable row level security;
create policy "api_cache_anon_read" on public.api_cache for select to anon using (expires_at > now());
create policy "api_cache_service_all" on public.api_cache for all to service_role using (true) with check (true);

select public.bobby_rls_reset_tmp('forum_posts');
alter table public.forum_posts enable row level security;
create policy "Public read posts" on public.forum_posts for select to public using (true);
create policy "Service write posts" on public.forum_posts for all to public using (true);

select public.bobby_rls_reset_tmp('forum_threads');
alter table public.forum_threads enable row level security;
create policy "Public read threads" on public.forum_threads for select to public using (true);
create policy "Service write threads" on public.forum_threads for all to public using (true);

select public.bobby_rls_reset_tmp('mcp_payment_challenges');
alter table public.mcp_payment_challenges enable row level security;
create policy "service_all_challenges" on public.mcp_payment_challenges for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('mcp_payment_receipts');
alter table public.mcp_payment_receipts enable row level security;
create policy "service_all_receipts" on public.mcp_payment_receipts for all to public using (true) with check (true);

select public.bobby_rls_reset_tmp('sandbox_runs');
alter table public.sandbox_runs enable row level security;
create policy "sandbox_runs_public_read" on public.sandbox_runs for select to public using (true);

select public.bobby_rls_reset_tmp('user_digests');
alter table public.user_digests enable row level security;
create policy "Public read digests" on public.user_digests for select to public using (true);
create policy "Service update digests" on public.user_digests for update to public using (true);
create policy "Service write digests" on public.user_digests for insert to public with check (true);

select public.bobby_rls_reset_tmp('user_feedback');
alter table public.user_feedback enable row level security;
create policy "Anyone can submit" on public.user_feedback for insert to public with check (true);

-- these had RLS ON and NO policies (service role only) — unchanged by the hardening
-- agent_profiles, telegram_connections, llm_calls, cycle_transitions, agent_memory, trade_intents, dm_conversations,
-- bobby_control, bobby_early_access, forum_publish_receipts: keep as they are (reset to service-only where the hardening added an explicit policy).
do $$
declare t text;
begin
  foreach t in array array['agent_profiles','telegram_connections','llm_calls','cycle_transitions','agent_memory','trade_intents','dm_conversations'] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      perform public.bobby_rls_reset_tmp(t);
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- ---- tables that had RLS OFF before the hardening (indicator_cache also had two public policies) ----
do $$
declare t text;
begin
  foreach t in array array['user_interests','agent_config','telegram_groups','telegram_activation_sessions','telegram_subscriptions',
    'indicator_cache','agent_market_snapshots','agent_macro_events','agent_source_health','agent_position_rechecks',
    'hardness_agents','hardness_agent_sessions','hardness_agent_proofs','agent_events','memory_objects'] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      perform public.bobby_rls_reset_tmp(t);
      execute format('alter table public.%I disable row level security', t);
    end if;
  end loop;
end $$;
create policy "Anon insert indicator_cache" on public.indicator_cache for insert to public with check (true);
create policy "Anon update indicator_cache" on public.indicator_cache for update to public using (true) with check (true);

drop function public.bobby_rls_reset_tmp(text);
drop function if exists public.bobby_rls_matrix();
drop function if exists public.bobby_rls_status();
