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
--                          (forum: public-scope threads and their posts only)
--   service_role         : everything (bypasses RLS; policies listed for clarity)
--   user_feedback        : anon may INSERT (column-checked)
--   caches               : anon may SELECT fresh rows
--   everything else      : service role only — including the per-wallet
--                          tables (agent_messages, user_interests,
--                          user_digests, agent_profiles) and sandbox_runs,
--                          which the browser now reads through /api/* with a
--                          wallet session (Codex review, blocker 2).
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

-- ---------- public-read tables (track record, proofs) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'agent_cycles','agent_events','agent_trades','agent_positions','agent_signals',
    'hardness_agent_proofs'
  ] loop
    perform public.bobby_rls_reset(t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_all', t);
  end loop;
end $$;

-- ---------- forum: only PUBLIC threads (and their posts) are readable ----------
-- Personal agent cycles write scope='private' + owner_wallet; those rows are
-- served by /api/my-threads to the proven owner only.
select public.bobby_rls_reset('forum_threads');
create policy forum_threads_public_read on public.forum_threads
  for select to anon, authenticated using (coalesce(scope, 'public') <> 'private');
create policy forum_threads_service_all on public.forum_threads
  for all to service_role using (true) with check (true);

select public.bobby_rls_reset('forum_posts');
create policy forum_posts_public_read on public.forum_posts
  for select to anon, authenticated using (
    exists (
      select 1 from public.forum_threads t
      where t.id = forum_posts.thread_id and coalesce(t.scope, 'public') <> 'private'
    )
  );
create policy forum_posts_service_all on public.forum_posts
  for all to service_role using (true) with check (true);

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
    'agent_messages','user_interests','user_digests','sandbox_runs',
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

-- ---------- policy introspection for the adversarial gate ----------
-- scripts/infra/rls-adversarial.mts asserts the matrix from pg_policies
-- instead of inferring it from "0 rows affected" (Codex review, blocker 1).
-- Service role only.
create or replace function public.bobby_rls_matrix()
returns table (tablename text, policyname text, cmd text, roles text[], permissive text, qual text, with_check text)
language sql security definer set search_path = public, pg_catalog as $$
  select p.tablename::text, p.policyname::text, p.cmd::text, p.roles::text[], p.permissive::text, p.qual::text, p.with_check::text
  from pg_policies p
  where p.schemaname = 'public'
  order by p.tablename, p.policyname
$$;
revoke all on function public.bobby_rls_matrix() from public, anon, authenticated;
grant execute on function public.bobby_rls_matrix() to service_role;

-- Also report tables in public with RLS disabled (the gate fails on any of the protected ones).
create or replace function public.bobby_rls_status()
returns table (tablename text, rls_enabled boolean)
language sql security definer set search_path = public, pg_catalog as $$
  select c.relname::text, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
$$;
revoke all on function public.bobby_rls_status() from public, anon, authenticated;
grant execute on function public.bobby_rls_status() to service_role;

-- ---------- verification (run after applying) ----------
-- select * from public.bobby_rls_matrix();
-- Expected: no policy with roles = {public}; anon only ever appears on
-- SELECT (plus INSERT on user_feedback), and never on agent_messages,
-- user_interests, user_digests, agent_profiles, sandbox_runs.
