-- LOCAL FIXTURE ONLY. Never run this against a real Supabase project.
-- Requires a dedicated empty database named bobby_android_compatibility_test.
-- Uses actual baseline table definitions and RPC bodies; auxiliary land/admin fixtures are minimal.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'bobby_android_compatibility_test' then raise exception 'Use the dedicated local fixture database'; end if;
end $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.bobby_identities(id uuid primary key, auth_user_id uuid, internal boolean not null default false);
create table public.agent_cycles(id uuid primary key);
create table public.agent_trades(id uuid primary key);

create table if not exists public.bobby_progress (
  identity_id          uuid primary key references public.bobby_identities(id) on delete cascade,
  companion_id         text,
  vibe_id              text not null default 'directo',
  onboarded            boolean not null default false,
  risk_notice_version  integer not null default 0,
  xp                   integer not null default 0 check (xp >= 0),
  streak               integer not null default 0 check (streak >= 0),
  last_day             date,
  daily_awards         integer not null default 0 check (daily_awards >= 0),
  daily_awards_day     date,
  quick_access         jsonb not null default '["BTC","NVDA","ETH"]'::jsonb,
  last_platform        text check (last_platform is null or last_platform in ('ios', 'web')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.bobby_progress_events (
  id               uuid primary key default gen_random_uuid(),
  identity_id      uuid not null references public.bobby_identities(id) on delete cascade,
  client_event_id  uuid not null,
  -- legacy_import: one bounded credit (≤300) for XP earned on a device before
  -- the first sign-in; only accepted while the identity's ledger is empty.
  kind             text not null check (kind in ('read_complete', 'no_trade_respected', 'legacy_import')),
  points           integer not null check (points >= 0),
  awarded          integer not null check (awarded >= 0),
  xp_after         integer not null check (xp_after >= 0),
  platform         text not null check (platform in ('ios', 'web')),
  occurred_at      timestamptz not null,
  day_key          date not null,
  meta             jsonb,
  created_at       timestamptz not null default now(),
  constraint bobby_progress_events_once unique (identity_id, client_event_id)
);

create table if not exists public.bobby_pre_calls (
  id            uuid primary key default gen_random_uuid(),
  identity_id   uuid not null references public.bobby_identities(id) on delete cascade,
  symbol        text not null,
  call          text not null check (call in ('long', 'short', 'no_trade')),
  verdict       text,
  price_at      numeric,
  called_at     timestamptz not null default now(),
  settle_at     timestamptz not null,
  settled_at    timestamptz,
  outcome       text check (outcome is null or outcome in ('aligned', 'misaligned', 'void')),
  event_id      uuid references public.bobby_progress_events(id),
  platform      text not null check (platform in ('ios', 'web'))
);

create table if not exists public.bobby_subscriptions (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple')),
  status text not null,
  product_id text,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  apple_original_transaction_id text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.bobby_brief_paid_periods (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple')),
  product_id text not null check (length(product_id) between 1 and 120),
  period_start timestamptz not null,
  period_end timestamptz not null,
  environment text not null check (environment in ('production', 'sandbox', 'unknown')),
  period_type text not null check (period_type in ('normal', 'intro', 'trial', 'unknown')),
  paid_amount numeric(14, 4) not null check (paid_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  proof_source text not null check (proof_source in ('revenuecat', 'stripe')),
  proof_id text not null check (length(proof_id) between 1 and 160),
  proof_sha256 text not null check (proof_sha256 ~ '^[0-9a-f]{64}$'),
  verification_state text not null check (verification_state in ('confirmed', 'unverified')),
  verified_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (period_start < period_end)
);

create table if not exists public.bobby_swap_receipts (
  id                  uuid primary key default gen_random_uuid(),
  identity_id         uuid references public.bobby_identities(id) on delete set null,
  -- The agent cycle whose recommendation produced this calldata (null for manual swaps)
  cycle_id            uuid references public.agent_cycles(id) on delete set null,
  -- The agent_trades row written when the receipt confirmed (exposure, PnL, settlement)
  agent_trade_id      uuid,
  -- Single-use intent id minted by the cycle; one confirmed swap per intent
  intent_jti          text,
  wallet_address      text not null,
  chain_id            integer not null default 8453 check (chain_id = 8453),
  engine              text not null default 'uniswap-v3-swaprouter02',
  router_address      text not null,
  token_in_address    text not null,
  token_out_address   text not null,
  token_in_symbol     text not null,
  token_out_symbol    text not null,
  amount_in_raw       numeric(78, 0) not null check (amount_in_raw > 0),
  quoted_out_raw      numeric(78, 0) not null check (quoted_out_raw > 0),
  min_amount_out_raw  numeric(78, 0) not null check (min_amount_out_raw > 0),
  route               text not null,
  calldata_hash       text not null,
  deadline            timestamptz not null,
  status              text not null default 'built' check (status in ('built', 'confirmed', 'failed', 'expired')),
  tx_hash             text,
  block_number        numeric(78, 0),
  block_timestamp     timestamptz,
  amount_out_raw      numeric(78, 0),
  platform            text not null default 'web' check (platform in ('ios', 'web')),
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint bobby_swap_receipts_wallet_lower check (wallet_address = lower(wallet_address)),
  constraint bobby_swap_receipts_built_once unique (wallet_address, calldata_hash),
  constraint bobby_swap_receipts_tx_once unique (chain_id, tx_hash)
);

-- Later release migrations add these columns/kind before the real atomic RPCs.
alter table public.bobby_progress add column aura integer not null default 0;
alter table public.bobby_progress add column route_index integer not null default 0;
alter table public.bobby_progress_events add column aura integer not null default 0;
alter table public.bobby_progress_events drop constraint bobby_progress_events_kind_check;
alter table public.bobby_progress_events add check(kind in ('read_complete','no_trade_respected','legacy_import','thesis_closed'));
create table public.tl_lands(identity_id uuid primary key references public.bobby_identities(id));
create table public.tl_inventory(id uuid primary key default gen_random_uuid(), identity_id uuid references public.bobby_identities(id), item_id text,
  state text, source text default 'route', seeded_at timestamptz default now(), bloomed_at timestamptz, event_id uuid, horizon_hours integer default 24);
create table public.tl_items(id text primary key, active boolean default true);
create table public.bobby_pro_grants(identity_id uuid primary key references public.bobby_identities(id), pro_until timestamptz);
-- Custom existing names prove the migration discovers constraints by column, rather than assuming names.
alter table public.bobby_subscriptions rename constraint bobby_subscriptions_provider_check to fixture_custom_subscription_provider;
alter table public.bobby_swap_receipts rename constraint bobby_swap_receipts_platform_check to fixture_custom_swap_platform;
alter table public.bobby_subscriptions enable row level security;
revoke all on public.bobby_subscriptions from public, anon, authenticated;
grant all on all tables in schema public to service_role;
create function public.bobby_internal_identity_ids() returns setof uuid language sql stable as $$ select id from bobby_identities where internal $$;
revoke all on function public.bobby_internal_identity_ids() from public, anon, authenticated;
grant execute on function public.bobby_internal_identity_ids() to service_role;
\ir ../supabase/bobby-protocol/supabase/migrations/20260919183000_atomic_progress.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20261002140000_subscription_environment.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20261002150000_checkout_reservation_apple_mirror.sql
\ir ../supabase/bobby-protocol/supabase/migrations/20261002184500_brief_paid_source_guard.sql
-- Auxiliary overview/economics fixtures use the exact release anchors and active membership distinction.
create function public.bobby_admin_overview(p_days int, p_internal boolean default false) returns jsonb language plpgsql as $$
declare incl boolean := coalesce(p_internal,false); subs jsonb;
begin
  with live as (select * from bobby_subscriptions where current_period_end>now())
  select jsonb_build_object('paid', (select count(*) from live where status = 'active'),
    'giftedPro', (select count(*) from bobby_pro_grants)) into subs;
  return jsonb_build_object('subscriptions', subs);
end $$;
create function public.bobby_admin_economics(p_days int, p_internal boolean default false) returns jsonb language plpgsql as $$
declare incl boolean := coalesce(p_internal,false); subs jsonb := '{}';
begin return jsonb_build_object('subscriptions', subs, 'days', p_days); end $$;
revoke all on function public.bobby_admin_overview(int,boolean), public.bobby_admin_economics(int,boolean) from public, anon, authenticated;
grant execute on function public.bobby_admin_overview(int,boolean), public.bobby_admin_economics(int,boolean) to service_role;
\ir ../supabase/bobby-protocol/supabase/migrations/20261003090000_android_google_compatibility.sql
create function pg_temp.expect(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAILED: %', label; end if; raise notice 'PASS: %', label; end $$;
insert into bobby_identities(id,auth_user_id,internal)
  select ('11111111-1111-4111-8111-'||lpad(n::text,12,'0'))::uuid, gen_random_uuid(), n=5 from generate_series(1,8) n;
select pg_temp.expect((bobby_apply_progress('11111111-1111-4111-8111-000000000001','android','[]','{"companionId":"byte"}')#>>'{progress,last_platform}')='android','real Android progress RPC persists Android');
select pg_temp.expect((bobby_close_seed('11111111-1111-4111-8111-000000000001',gen_random_uuid(),24,'android',0,'{}')->>'error')='not_found','real Android close RPC passes platform guard and retains ownership check');
insert into tl_inventory(identity_id,item_id,state,seeded_at) values('11111111-1111-4111-8111-000000000001','fixture_seed','seed',now()-interval '25 hours');
select pg_temp.expect((bobby_close_seed('11111111-1111-4111-8111-000000000001',(select id from tl_inventory limit 1),24,'android',0,'{}')->>'ok')::boolean,'real Android close RPC commits ready seed');
select pg_temp.expect(exists(select 1 from bobby_progress_events where platform='android' and kind='thesis_closed' and awarded=15),'Android close preserves the award ledger');
insert into bobby_pre_calls(identity_id,symbol,call,settle_at,platform) values('11111111-1111-4111-8111-000000000001','BTC','long',now()+interval '1 day','android');
select pg_temp.expect(exists(select 1 from bobby_pre_calls where platform='android'),'Android pre-call column allowed');
insert into bobby_swap_receipts(wallet_address,router_address,token_in_address,token_out_address,token_in_symbol,token_out_symbol,amount_in_raw,quoted_out_raw,min_amount_out_raw,route,calldata_hash,deadline,platform)
  values('0xfixture','router','in','out','USDC','ETH',1,1,1,'route','hash',now()+interval '5 minutes','android');
select pg_temp.expect(exists(select 1 from bobby_swap_receipts where platform='android'),'Android swap receipt column allowed');
do $$ begin
  begin update bobby_swap_receipts set chain_id=196; raise exception 'Chain guard unexpectedly removed'; exception when check_violation then null; end;
  begin update bobby_progress set last_platform='unknown'; raise exception 'Unknown platform admitted'; exception when check_violation then null; end;
end $$;
select pg_temp.expect((select count(*)=2 from information_schema.columns where table_schema='public' and table_name='bobby_subscriptions'
  and column_name in ('environment','period_type') and data_type='text' and is_nullable='YES'),'deployed mirror metadata columns are present and nullable');
select pg_temp.expect(not has_table_privilege('authenticated','public.bobby_subscriptions','INSERT'),'provider migration retains service-only subscription writes');
select pg_temp.expect(not has_function_privilege('authenticated','public.bobby_apply_progress(uuid,text,jsonb,jsonb)','EXECUTE'),'RPC privileges remain service-only');
select pg_temp.expect(not has_function_privilege('authenticated','public.bobby_admin_paid_provider_totals(boolean)','EXECUTE'),'paid provider totals remain service-only');
insert into bobby_subscriptions(identity_id,provider,status,product_id,current_period_end,stripe_subscription_id)
  select id, case right(id::text,1) when '2' then 'apple' when '3' then 'stripe' else 'google' end,
    'active', 'fixture_product', now()+interval '30 days', case right(id::text,1) when '3' then 'sub_fixture' end
  from bobby_identities where right(id::text,1)<>'6' and right(id::text,1)<>'8';
insert into bobby_pro_grants(identity_id,pro_until) values('11111111-1111-4111-8111-000000000006',now()+interval '30 days');
insert into bobby_brief_paid_periods(identity_id,provider,product_id,period_start,period_end,environment,period_type,paid_amount,currency,proof_source,proof_id,proof_sha256,verification_state,verified_at)
  select identity_id,provider,product_id,now()-interval '1 day',current_period_end,
    case right(identity_id::text,1) when '7' then 'sandbox' else 'production' end,
    case right(identity_id::text,1) when '4' then 'trial' else 'normal' end,
    5,'USD',case provider when 'stripe' then 'stripe' else 'revenuecat' end,identity_id::text,repeat('a',64),'confirmed',now()
  from bobby_subscriptions;
select pg_temp.expect(bobby_brief_is_paid_pro('11111111-1111-4111-8111-000000000001'),'positive corroborated Google production proof is paid');
select pg_temp.expect(not bobby_brief_is_paid_pro('11111111-1111-4111-8111-000000000004'),'trial is not a paid period');
select pg_temp.expect(not bobby_brief_is_paid_pro('11111111-1111-4111-8111-000000000007'),'sandbox is not a paid period');
select pg_temp.expect(not bobby_brief_is_paid_pro('11111111-1111-4111-8111-000000000006'),'grant alone is not a paid subscription');
select pg_temp.expect(bobby_admin_paid_provider_totals(false)='{"stripe":1,"apple":1,"google":1}'::jsonb,'paid provider totals explicitly include all three stores and exclude internal/trial/sandbox/grants');
select pg_temp.expect(bobby_admin_paid_provider_totals(true)='{"stripe":1,"apple":1,"google":2}'::jsonb,'internal inclusion remains explicit');
select pg_temp.expect((bobby_admin_overview(30,false)#>'{subscriptions,paidByProvider}')='{"stripe":1,"apple":1,"google":1}'::jsonb,'overview paid provider integration returns verified counts');
select pg_temp.expect((bobby_admin_economics(30,false)#>>'{subscriptions,paid}')::int=3,'economics paid counts exclude gifts and trials');
update bobby_brief_paid_periods set paid_amount=0 where identity_id='11111111-1111-4111-8111-000000000001';
select pg_temp.expect(not bobby_brief_is_paid_pro('11111111-1111-4111-8111-000000000001'),'zero paid amount cannot grant paid briefing');
update bobby_brief_paid_periods set paid_amount=5,proof_source='stripe' where identity_id='11111111-1111-4111-8111-000000000001';
select pg_temp.expect(not bobby_brief_is_paid_pro('11111111-1111-4111-8111-000000000001'),'Stripe proof cannot authorize Google subscription');
update bobby_brief_paid_periods set proof_source='revenuecat' where identity_id='11111111-1111-4111-8111-000000000001';
do $$ begin
  begin
    insert into bobby_subscriptions(identity_id,provider,status,current_period_end) values('11111111-1111-4111-8111-000000000001','stripe','active',now()+interval '30 days')
      on conflict(identity_id) do update set provider=excluded.provider,status=excluded.status,current_period_end=excluded.current_period_end;
    raise exception 'Provider overwrite unexpectedly allowed';
  exception when check_violation then if sqlerrm <> 'subscription_provider_conflict' then raise; end if; end;
  begin update bobby_subscriptions set identity_id='11111111-1111-4111-8111-000000000008' where identity_id='11111111-1111-4111-8111-000000000001';
    raise exception 'Account reassignment unexpectedly allowed';
  exception when check_violation then if sqlerrm <> 'subscription_provider_conflict' then raise; end if; end;
end $$;
select pg_temp.expect((select provider='google' from bobby_subscriptions where identity_id='11111111-1111-4111-8111-000000000001'),'atomic upsert keeps the active provider');
update bobby_subscriptions set current_period_end=null where identity_id='11111111-1111-4111-8111-000000000001';
do $$ begin
  begin update bobby_subscriptions set provider='apple' where identity_id='11111111-1111-4111-8111-000000000001';
    raise exception 'Unbounded active provider overwrite unexpectedly allowed';
  exception when check_violation then if sqlerrm <> 'subscription_provider_conflict' then raise; end if; end;
end $$;
select pg_temp.expect((select provider='google' from bobby_subscriptions where identity_id='11111111-1111-4111-8111-000000000001'),'null-ended active subscription still blocks another provider');
update bobby_subscriptions set status='expired' where identity_id='11111111-1111-4111-8111-000000000001';
update bobby_subscriptions set provider='apple',status='active',current_period_end=now()+interval '30 days' where identity_id='11111111-1111-4111-8111-000000000001';
select pg_temp.expect((select provider='apple' from bobby_subscriptions where identity_id='11111111-1111-4111-8111-000000000001'),'a truly ended membership permits another provider');

-- Preserve the canonical card/Apple sidecar while extending only Google ownership.
insert into bobby_subscriptions(identity_id,provider,status,current_period_end,stripe_subscription_id,apple_status,apple_current_period_end)
values('11111111-1111-4111-8111-000000000008','stripe','past_due',now()-interval '1 day','sub_sidecar','active',now()+interval '30 days');
select pg_temp.expect(bobby_is_pro('11111111-1111-4111-8111-000000000008'),'canonical Apple sidecar still grants Pro beside past-due card');
do $$ begin
  begin update bobby_subscriptions set provider='google',status='active',current_period_end=now()+interval '30 days' where identity_id='11111111-1111-4111-8111-000000000008';
    raise exception 'Recoverable card/Apple obligation overwritten';
  exception when check_violation then if sqlerrm <> 'subscription_provider_conflict' then raise; end if; end;
end $$;
select pg_temp.expect((select provider='stripe' and stripe_subscription_id='sub_sidecar' and apple_status='active' from bobby_subscriptions where identity_id='11111111-1111-4111-8111-000000000008'),'Google guard preserves card ID and Apple sidecar');
update bobby_subscriptions set status='canceled',apple_status='expired',apple_current_period_end=now()-interval '1 day' where identity_id='11111111-1111-4111-8111-000000000008';
update bobby_subscriptions set provider='google',status='active',current_period_end=now()+interval '30 days' where identity_id='11111111-1111-4111-8111-000000000008';
select pg_temp.expect((select provider='google' and stripe_subscription_id='sub_sidecar' from bobby_subscriptions where identity_id='11111111-1111-4111-8111-000000000008'),'terminal card can yield to Google while retaining cancellation references');
delete from bobby_subscriptions where identity_id='11111111-1111-4111-8111-000000000008';

-- The live primary overview has a newer production/non-trial counter than the Git migration.
-- Exercise that exact verified anchor as well as the legacy fixture above, then reapply.
do $$
declare definition text; patched_anchor text; live_anchor text;
begin
  definition := pg_get_functiondef('public.bobby_admin_overview(integer,boolean)'::regprocedure);
  patched_anchor := '''paid'', (select count(*) from live where public.bobby_brief_is_paid_pro(identity_id)), ''paidByProvider'', public.bobby_admin_paid_provider_totals(incl),';
  live_anchor := '''paid'', (select count(*) from live where status = ''active'' and environment = ''production'' and coalesce(period_type, ''normal'') <> ''trial''),';
  if strpos(definition,patched_anchor)=0 then raise exception 'Fixture paid anchor missing'; end if;
  execute replace(definition,patched_anchor,live_anchor);
end;
$$;
\ir ../supabase/bobby-protocol/supabase/migrations/20261003090000_android_google_compatibility.sql
select pg_temp.expect(strpos(pg_get_functiondef('public.bobby_admin_overview(integer,boolean)'::regprocedure),'paidByProvider')>0,'verified live overview anchor migrates and preserves provider totals');
select pg_temp.expect((select count(*)=2 from pg_constraint where conrelid='public.bobby_subscriptions'::regclass and conname in ('bobby_subscriptions_environment_check','bobby_subscriptions_period_type_check')),'mirror metadata CHECKs remain intact across reapplication');
