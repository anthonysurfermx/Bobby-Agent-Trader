-- ============================================================
-- BP-09 (2026-09-04 review): manual wallet cycles were written without
-- owner_address / user_id, and migration 0010's public view read exactly that
-- absence as "protocol-owned" — publishing a user's halt reasons, timing and
-- capital counters. Provenance is now POSITIVE: a row is public only when its
-- producer said so. Untagged rows are private.
-- ============================================================

alter table public.agent_cycles
  add column if not exists visibility text not null default 'private';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agent_cycles_visibility_check') then
    alter table public.agent_cycles
      add constraint agent_cycles_visibility_check check (visibility in ('public', 'private'));
  end if;
end $$;
create index if not exists agent_cycles_public_idx on public.agent_cycles (started_at desc) where visibility = 'public';

-- Historical rows: NOT reclassified here. They stay private until an operator
-- reviews them. A conservative statement an operator may run after review, for
-- rows demonstrably produced by the scheduled protocol cycle:
--   update public.agent_cycles set visibility = 'public'
--    where visibility = 'private' and owner_address is null and user_id is null
--      and llm_model is not null and mood is not null;   -- review the sample first

create or replace view public.agent_cycles_public
with (security_barrier = true) as
  select id, started_at, completed_at, status, error, signals_found,
         signals_filtered, llm_decisions, trades_executed, trades_blocked,
         trades_successful, total_usd_deployed, latency_ms, llm_model,
         llm_reasoning, mood, dynamic_conviction, safe_mode_active, vibe_phrase,
         idle_cash_usd, yield_debate_triggered
    from public.agent_cycles
   where visibility = 'public';
revoke all on public.agent_cycles_public from public;
grant select on public.agent_cycles_public to anon, authenticated, service_role;

-- A trade inherits its cycle's provenance; a trade with no cycle or with a
-- private cycle is never public, whatever its own ownership columns say.
create or replace view public.agent_trades_public
with (security_barrier = true) as
  select t.id, t.cycle_id, t.chain, t.token_address, t.token_symbol, t.direction, t.amount_usd,
         t.entry_price, t.stop_price, t.target_price, t.exit_price, t.status, t.outcome,
         t.realized_pnl_pct, t.llm_reasoning, t.confidence, t.signal_sources,
         t.created_at, t.settled_at, t.expires_at
    from public.agent_trades t
    join public.agent_cycles c on c.id = t.cycle_id
   where c.visibility = 'public' and t.owner_address is null and t.user_id is null;
revoke all on public.agent_trades_public from public;
grant select on public.agent_trades_public to anon, authenticated, service_role;
