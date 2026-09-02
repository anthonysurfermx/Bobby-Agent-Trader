-- ============================================================
-- Bobby RLS hardening (phase 0, gate 4).
--
-- Today the core tables carry policies like
--   "Service write agent_cycles" | ALL | public | using=true
-- which let ANYONE with the anon key insert, update or delete cycles,
-- threads, posts, trades and payment challenges. This migration replaces
-- that with the target matrix from docs/infra/2026-09-02-migration-safety-check.md:
--
--   anon / authenticated : SELECT only where the data is public by design
--   service_role         : everything (bypasses RLS; policies listed for clarity)
--   user_feedback        : anon may INSERT (column-checked)
--   caches               : anon may SELECT fresh rows
--   everything else      : service role only
--
-- Apply ONLY after the browser writes are served by /api/* (commit
-- "browser writes move behind validated, rate-limited endpoints") is
-- deployed, otherwise the chat and the forum lose their writes.
-- Idempotent: every statement is drop-if-exists / create.
-- ============================================================

-- ---------- helpers ----------
create or replace function public.bobby_rls_reset(tbl text)
returns void language plpgsql as $$
declare pol record;
begin
  execute format('alter table public.%I enable row level security', tbl);
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tbl loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
  end loop;
end $$;

-- ---------- public-read tables (track record, forum, proofs) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'agent_cycles','agent_events','agent_trades','agent_positions','agent_signals',
    'forum_threads','forum_posts','sandbox_runs','hardness_agent_proofs',
    'agent_messages','user_interests','user_digests'
  ] loop
    perform public.bobby_rls_reset(t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_all', t);
  end loop;
end $$;

-- ---------- anon may submit feedback (nothing else) ----------
select public.bobby_rls_reset('user_feedback');
create policy user_feedback_anon_insert on public.user_feedback
  for insert to anon, authenticated with check (true);
create policy user_feedback_service_all on public.user_feedback
  for all to service_role using (true) with check (true);

-- ---------- caches: fresh rows readable, writes by the backend ----------
select public.bobby_rls_reset('api_cache');
create policy api_cache_anon_read on public.api_cache
  for select to anon, authenticated using (expires_at > now());
create policy api_cache_service_all on public.api_cache
  for all to service_role using (true) with check (true);

select public.bobby_rls_reset('indicator_cache');
create policy indicator_cache_anon_read on public.indicator_cache
  for select to anon, authenticated using (true);
create policy indicator_cache_service_all on public.indicator_cache
  for all to service_role using (true) with check (true);

-- ---------- service-role only (payments, hardness, memory, telegram, config) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'mcp_payment_challenges','mcp_payment_receipts',
    'hardness_agents','hardness_agent_sessions',
    'memory_objects','agent_config','agent_macro_events','agent_market_snapshots',
    'agent_source_health','agent_position_rechecks',
    'telegram_groups','telegram_activation_sessions','telegram_subscriptions','telegram_connections',
    'agent_profiles','dm_conversations','trade_intents','llm_calls','cycle_transitions','agent_memory'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      perform public.bobby_rls_reset(t);
      execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_all', t);
    end if;
  end loop;
end $$;

drop function public.bobby_rls_reset(text);

-- ---------- verification (run after applying) ----------
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' and tablename in (...) order by 1, 2;
-- Expected: no policy with roles = {public}; anon only ever appears on
-- SELECT (plus INSERT on user_feedback).
