-- ============================================================
-- Reset the 2026-08-23 baseline before applying the EXACT legacy schema.
-- The baseline created four empty tables by hand (agent_profiles,
-- forum_threads, forum_posts, api_cache); a `pg_dump --schema-only` of the
-- legacy project will CREATE them again with the real constraints, indexes
-- and triggers, so they must not pre-exist. They are empty on the
-- destination (T0 baseline 2026-09-03: 0 rows each) — this migration
-- refuses to run if any of them holds data.
-- Rehearsal rule (Codex): the exact schema is applied on a CLEAN destination
-- (this reset → dump → outbox), never layered on top of the baseline.
-- ============================================================
do $$
declare v_n bigint;
begin
  select (select count(*) from public.agent_profiles) + (select count(*) from public.forum_threads)
       + (select count(*) from public.forum_posts) + (select count(*) from public.api_cache) into v_n;
  if v_n > 0 then
    raise exception 'reset_baseline: destination baseline tables are not empty (% rows) — refusing to drop', v_n;
  end if;
end $$;
drop table if exists public.forum_posts cascade;
drop table if exists public.forum_threads cascade;
drop table if exists public.agent_profiles cascade;
drop table if exists public.api_cache cascade;
