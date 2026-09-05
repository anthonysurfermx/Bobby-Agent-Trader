-- READ ONLY. Run through the configured Supabase MCP on the verified Bobby
-- project, with progress writers frozen/drained. Never infer the target from
-- legacy AGENTS.md. Returns aggregate counts only, not account/receipt data.
-- A missing prerequisite table or permission is a failure, not a clean result.
begin transaction read only;
set local statement_timeout = '15s';

with
closes as (
  select id, identity_id, meta #>> '{thesis_close,inventoryId}' as seed,
    meta #>> '{thesis_close,executed,receiptId}' as receipt
  from public.bobby_progress_events where kind='thesis_closed'
),
ledger as (
  select identity_id,sum(awarded) xp,sum(aura) aura from public.bobby_progress_events group by identity_id
),
expected_season(id) as (values
  ('crypto_bay_candle_tower'),('evidence_mines_evidence_workshop'),('risk_reef_red_team_observatory'),
  ('axiom_archive_lit_archive'),('thesis_citadel_three_gate_citadel'),('axiom_archive_base_ring_seal')
),
checks(name, failures) as (
  select 'invalid_close_seed_reference',count(*) from closes
    where seed is null or seed !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union all
  select 'invalid_execution_receipt_reference',count(*) from closes
    where receipt is not null and receipt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union all
  select 'missing_or_foreign_close_seed',count(*) from closes c
    left join public.tl_inventory i on i.id::text=lower(c.seed)
    where c.seed is not null and (i.id is null or i.identity_id<>c.identity_id)
  union all
  select 'missing_execution_receipt',count(*) from closes c
    left join public.bobby_swap_receipts r on r.id::text=lower(c.receipt)
    where c.receipt is not null and r.id is null
  union all
  select 'duplicate_seed_closes',count(*) from
    (select lower(seed) from closes where seed is not null group by lower(seed) having count(*)>1) x
  union all
  select 'reused_execution_receipts',count(*) from
    (select lower(receipt) from closes where receipt is not null group by lower(receipt) having count(*)>1) x
  union all
  select 'duplicate_season_pieces',count(*) from
    (select identity_id,item_id from public.tl_inventory where source='season'
      group by identity_id,item_id having count(*)>1) x
  union all
  select 'balance_ledger_mismatch',count(*) from public.bobby_progress p full join ledger l using(identity_id)
    where p.identity_id is null or p.xp<>coalesce(l.xp,0) or p.aura<>coalesce(l.aura,0)
  union all
  select 'bloomed_reads_without_close',count(*) from public.tl_inventory i
    join public.bobby_progress_events e on e.id=i.event_id
    where i.source='route' and i.state='bloomed' and e.kind='read_complete'
      and not exists(select 1 from closes c where lower(c.seed)=i.id::text)
  union all
  select 'close_without_bloom',count(*) from closes c join public.tl_inventory i on i.id::text=lower(c.seed)
    where i.state<>'bloomed'
  union all
  select 'missing_season_catalog',count(*) from expected_season s
    where not exists(select 1 from public.tl_items i where i.id=s.id and i.active)
  union all
  select 'candidate_schema_already_present',count(*) from information_schema.columns
    where table_schema='public' and table_name='bobby_progress' and column_name='revision'
)
select jsonb_build_object(
  'scope','pre-20260905000001-only',
  'verdict',case when sum(failures)=0 then 'CLEAR_FOR_MIGRATION_REVIEW' else 'BLOCKED' end,
  'checks',jsonb_object_agg(name,failures),
  'warning','Not production GO. Confirm project, freeze, schema versions, backup and independent approval.'
) as preflight from checks;

rollback;
