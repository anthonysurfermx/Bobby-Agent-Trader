-- agent_cycles: columns the cycle-close PATCH has been sending since the
-- yield feature landed. Their absence made PostgREST reject the PATCH with
-- 400, leaving every cycle stuck in "running" until the next cron swept it
-- to "failed". Idempotent by design.

alter table public.agent_cycles
  add column if not exists idle_cash_usd numeric,
  add column if not exists yield_debate_triggered boolean not null default false,
  add column if not exists yield_recommendation_status text not null default 'none',
  add column if not exists yield_position_id uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'agent_cycles_yield_reco_status_check'
  ) then
    alter table public.agent_cycles
      add constraint agent_cycles_yield_reco_status_check
      check (yield_recommendation_status in ('none','recommended','active','skipped'));
  end if;
end $$;
