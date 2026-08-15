-- Forward-only correction for the premature 8453 defaults introduced by the
-- 20260811 migration. Apply this migration before Base cutover. The marker
-- captures the actual migration boundary once, so reruns never rewrite Base or
-- Sepolia rows created afterwards.

-- This repair deliberately expires before the earliest authorized mainnet
-- window. If it was not applied by then, stop and produce a newly reviewed
-- migration from live data; never move this deadline or run the UPDATEs by
-- hand. That makes a late application fail before legitimate Base rows can be
-- relabelled as X Layer.
do $$
begin
  if clock_timestamp() >= timestamptz '2026-08-17 00:00:00+00' then
    raise exception using
      message = 'Chain provenance repair expired before Base cutover',
      hint = 'Do not bypass this guard. Reconcile live 8453 rows and ship a newly reviewed forward migration.';
  end if;
end $$;

create table if not exists public.protocol_migration_markers (
  key text primary key,
  recorded_at timestamptz not null default now()
);

alter table public.protocol_migration_markers enable row level security;
revoke all on table public.protocol_migration_markers from anon, authenticated;
grant select on table public.protocol_migration_markers to service_role;

insert into public.protocol_migration_markers(key)
values ('base_chain_provenance_backfill_v1')
on conflict (key) do nothing;

-- Only rows still carrying the premature 8453 default are candidates for
-- repair. Explicit X Layer (196) and Base Sepolia (84532) provenance is
-- preserved. Before mainnet cutover there are no legitimate 8453 rows.
update public.agent_trades
set chain_id = 196
where chain_id = 8453
  and created_at < (
  select recorded_at from public.protocol_migration_markers
  where key = 'base_chain_provenance_backfill_v1'
);

update public.agent_cycles
set chain_id = 196
where chain_id = 8453
  and started_at < (
  select recorded_at from public.protocol_migration_markers
  where key = 'base_chain_provenance_backfill_v1'
);

-- New binaries always write chain_id explicitly. The defensive fallback stays
-- legacy so an old binary cannot fabricate Base provenance after this repair.
alter table public.hardness_agent_proofs alter column chain_id set default 196;
alter table public.trade_intents alter column chain_id set default 196;
alter table public.agent_trades alter column chain_id set default 196;
alter table public.agent_cycles alter column chain_id set default 196;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_trades_chain_id_known') then
    alter table public.agent_trades
      add constraint agent_trades_chain_id_known check (chain_id in (196, 8453, 84532));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agent_cycles_chain_id_known') then
    alter table public.agent_cycles
      add constraint agent_cycles_chain_id_known check (chain_id in (196, 8453, 84532));
  end if;
end $$;

create index if not exists agent_trades_chain_id_idx
  on public.agent_trades(chain_id, created_at desc);

create index if not exists agent_cycles_chain_id_idx
  on public.agent_cycles(chain_id, started_at desc);
