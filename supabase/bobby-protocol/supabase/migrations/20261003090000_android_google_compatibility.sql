-- Android compatibility for canonical production 69c355e8ff9b1e854e051ac2857fd45a937e3710, with explicit known legacy fixture anchors.
-- Discover scalar-column CHECK names rather than assuming generated names in a live project.
-- Unexpected constraint/function drift aborts the migration, preserving all existing guards.
begin;

-- The deployed source writes these optional fields; earlier versioned schema omits them.
-- Do not infer payment from either field: positive paid proof remains independently required.
alter table public.bobby_subscriptions add column if not exists environment text check (environment in ('production', 'sandbox'));
alter table public.bobby_subscriptions add column if not exists period_type text check (period_type in ('normal', 'trial', 'intro', 'prepaid'));
do $migration$
begin
  if (select count(*) from pg_attribute where attrelid='public.bobby_subscriptions'::regclass
      and attname in ('environment','period_type') and not attisdropped
      and atttypid in ('text'::regtype,'character varying'::regtype)) <> 2 then
    raise exception 'Unexpected subscription environment/period_type column types';
  end if;
  if (select count(*) from pg_attribute where attrelid='public.bobby_subscriptions'::regclass
      and attname in ('apple_status','apple_product_id','apple_environment','apple_period_type')
      and not attisdropped and atttypid='text'::regtype) <> 4 or
     not exists(select 1 from pg_attribute where attrelid='public.bobby_subscriptions'::regclass
      and attname='apple_current_period_end' and not attisdropped and atttypid='timestamptz'::regtype) then
    raise exception 'Apply canonical Apple/card sidecar migration before Android compatibility';
  end if;
end;
$migration$;

do $migration$
declare
  item record; guard record; col smallint; found_count integer; expr text;
begin
  for item in select * from (values
    ('bobby_progress', 'last_platform', 'bobby_progress_android_platform', true, false),
    ('bobby_progress_events', 'platform', 'bobby_progress_events_android_platform', false, false),
    ('bobby_pre_calls', 'platform', 'bobby_pre_calls_android_platform', false, false),
    ('bobby_swap_receipts', 'platform', 'bobby_swap_receipts_android_platform', false, false),
    ('bobby_subscriptions', 'provider', 'bobby_subscriptions_google_provider', false, true),
    ('bobby_brief_paid_periods', 'provider', 'bobby_brief_paid_periods_google_provider', false, true)
  ) as targets(table_name, column_name, new_name, nullable, is_provider) loop
    select attnum into strict col from pg_attribute
      where attrelid = format('public.%I', item.table_name)::regclass and attname = item.column_name and not attisdropped;
    select count(*) into found_count from pg_constraint
      where conrelid = format('public.%I', item.table_name)::regclass and contype = 'c' and conkey = array[col];
    if found_count <> 1 then raise exception 'Expected one CHECK for %.%, found %', item.table_name, item.column_name, found_count; end if;
    select conname, pg_get_constraintdef(oid) as definition into strict guard from pg_constraint
      where conrelid = format('public.%I', item.table_name)::regclass and contype = 'c' and conkey = array[col];
    -- Canonical pg_get_constraintdef output: the known allowlist, optionally already extended.
    expr := regexp_replace(guard.definition, '\s+', '', 'g');
    if item.is_provider then
      if expr not in ('CHECK((provider=ANY(ARRAY[''stripe''::text,''apple''::text])))',
                       'CHECK((provider=ANY(ARRAY[''stripe''::text,''apple''::text,''google''::text])))') then
        raise exception 'Unexpected provider CHECK %.%: %', item.table_name, guard.conname, guard.definition;
      end if;
      expr := format('%I in (''stripe'', ''apple'', ''google'')', item.column_name);
    else
      if expr not in (
        format('CHECK((%1$s=ANY(ARRAY[''ios''::text,''web''::text])))', item.column_name),
        format('CHECK((%1$s=ANY(ARRAY[''ios''::text,''web''::text,''android''::text])))', item.column_name),
        format('CHECK(((%1$sISNULL)OR(%1$s=ANY(ARRAY[''ios''::text,''web''::text]))))', item.column_name),
        format('CHECK(((%1$sISNULL)OR(%1$s=ANY(ARRAY[''ios''::text,''web''::text,''android''::text]))))', item.column_name)
      ) then raise exception 'Unexpected platform CHECK %.%: %', item.table_name, guard.conname, guard.definition; end if;
      expr := format('%I in (''ios'', ''web'', ''android'')', item.column_name);
      if item.nullable then expr := format('%I is null or (%s)', item.column_name, expr); end if;
    end if;
    execute format('alter table public.%I drop constraint %I', item.table_name, guard.conname);
    execute format('alter table public.%I add constraint %I check (%s)', item.table_name, item.new_name, expr);
  end loop;
end;
$migration$;

-- Keep the deployed RPC bodies and their privileges; change exactly the platform guard.
-- Do not copy old progress/review logic over a later deployment.
do $migration$
declare
  signature text; definition text;
  old_guard constant text := 'p_platform not in (''ios'',''web'')';
  new_guard constant text := 'p_platform not in (''ios'',''web'',''android'')';
begin
  foreach signature in array array[
    'public.bobby_apply_progress(uuid,text,jsonb,jsonb)',
    'public.bobby_close_seed(uuid,uuid,integer,text,integer,jsonb,text[])'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if strpos(definition, old_guard) > 0 then
      if (length(definition) - length(replace(definition, old_guard, ''))) / length(old_guard) <> 1 then
        raise exception 'Ambiguous platform guard in %', signature;
      end if;
      execute replace(definition, old_guard, new_guard);
    elsif strpos(definition, new_guard) = 0 then raise exception 'Unexpected platform guard in %', signature;
    end if;
  end loop;
end;
$migration$;

-- Serialize every provider mirror write on the account parent, including the first insert.
-- This preserves the existing membership during races and late webhooks. It cannot prevent an
-- external charge that already happened; checkout/store-sheet reservation is a separate sales gate.
create or replace function public.bobby_guard_subscription_provider()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_row public.bobby_subscriptions%rowtype;
begin
  if tg_op = 'UPDATE' and new.identity_id is distinct from old.identity_id then
    raise exception using errcode = '23514', message = 'subscription_provider_conflict';
  end if;
  perform 1 from public.bobby_identities where id = new.identity_id for update;
  select * into current_row from public.bobby_subscriptions where identity_id = new.identity_id;
  -- Preserve the live Apple/card sidecar trigger. Only Google ownership crosses this new guard.
  if found and ((current_row.provider = 'google' and new.provider <> 'google' and
      current_row.status in ('active','trialing') and
      (current_row.current_period_end is null or current_row.current_period_end > now()))
    or (new.provider = 'google' and current_row.provider <> 'google' and
      ((current_row.status in ('active','trialing') and
          (current_row.current_period_end is null or current_row.current_period_end > now()))
       or (current_row.provider = 'stripe' and current_row.stripe_subscription_id is not null and
          current_row.status not in ('canceled','incomplete_expired'))
       or (current_row.apple_status in ('active','trialing') and
          (current_row.apple_current_period_end is null or current_row.apple_current_period_end > now()))))) then
    raise exception using errcode = '23514', message = 'subscription_provider_conflict';
  end if;
  return new;
end;
$$;
revoke all on function public.bobby_guard_subscription_provider() from public, anon, authenticated;
grant execute on function public.bobby_guard_subscription_provider() to service_role;
drop trigger if exists bobby_subscriptions_provider_guard on public.bobby_subscriptions;
create trigger bobby_subscriptions_provider_guard before insert or update on public.bobby_subscriptions
  for each row execute function public.bobby_guard_subscription_provider();

-- Positive production proof must match the current membership and exact paid period.
-- Google and Apple need RevenueCat proof; direct Stripe and RC Web Billing remain distinct.
create or replace function public.bobby_brief_is_paid_pro(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from bobby_subscriptions s
      join bobby_identities i on i.id = s.identity_id and i.auth_user_id is not null
      join bobby_brief_paid_periods p on p.identity_id = s.identity_id
     where s.identity_id = p_identity and s.status = 'active'
       and s.current_period_end is not null and s.current_period_end > now()
       and p.provider = s.provider and p.product_id = s.product_id and p.period_end = s.current_period_end
       and p.period_start <= now() and p.period_end > now()
       and p.environment = 'production' and p.period_type in ('normal', 'intro') and p.paid_amount > 0
       and p.verification_state = 'confirmed' and p.verified_at <= now()
       and (
         (p.provider in ('apple', 'google') and p.proof_source = 'revenuecat')
         or (p.provider = 'stripe' and s.stripe_subscription_id is null and p.proof_source = 'revenuecat')
         or (p.provider = 'stripe' and s.stripe_subscription_id is not null and p.proof_source = 'stripe')
       )
  );
$$;
revoke all on function public.bobby_brief_is_paid_pro(uuid) from public, anon, authenticated;
grant execute on function public.bobby_brief_is_paid_pro(uuid) to service_role;

-- Explicit zeroes for all stores. Grants, active status alone, trials and sandbox are not paid counts.
create or replace function public.bobby_admin_paid_provider_totals(p_internal boolean default false)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with paid as (
    select s.provider, count(*) as n from public.bobby_subscriptions s
    where public.bobby_brief_is_paid_pro(s.identity_id)
      and (coalesce(p_internal, false) or not coalesce(s.identity_id in (select public.bobby_internal_identity_ids()), false))
    group by s.provider
  )
  select jsonb_build_object(
    'stripe', coalesce((select n from paid where provider = 'stripe'), 0),
    'apple', coalesce((select n from paid where provider = 'apple'), 0),
    'google', coalesce((select n from paid where provider = 'google'), 0)
  );
$$;
revoke all on function public.bobby_admin_paid_provider_totals(boolean) from public, anon, authenticated;
grant execute on function public.bobby_admin_paid_provider_totals(boolean) to service_role;

-- Keep the canonical 69c payer classification and revenue semantics unchanged.
-- Current owner-bound paid periods are additional metrics, not replacement payer totals.
-- Legacy anchors remain supported for isolated compatibility fixtures; unknown bodies abort.
do $migration$
declare
  signature text; definition text; old_anchor text; new_anchor text; anchor_count integer; old_count integer;
  canonical_overview_anchor constant text := '''paid'', (select count(*) from live where commercial = ''paid''),';
  live_overview_anchor constant text := '''paid'', (select count(*) from live where status = ''active'' and environment = ''production'' and coalesce(period_type, ''normal'') <> ''trial''),';
  legacy_overview_anchor constant text := '''paid'', (select count(*) from live where status = ''active''),';
  canonical boolean;
begin
  definition := pg_get_functiondef('public.bobby_admin_overview(integer,boolean)'::regprocedure);
  canonical := strpos(definition, canonical_overview_anchor) > 0;
  foreach signature in array array['public.bobby_admin_overview(integer,boolean)', 'public.bobby_admin_economics(integer,boolean)'] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if signature like '%overview%' then
      if canonical then
        old_anchor := canonical_overview_anchor;
        new_anchor := old_anchor || ' ''verifiedPaidPeriods'', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(public.bobby_admin_paid_provider_totals(incl))), ''verifiedPaidPeriodsByProvider'', public.bobby_admin_paid_provider_totals(incl),';
      else
        old_anchor := case when strpos(definition, live_overview_anchor) > 0 then live_overview_anchor else legacy_overview_anchor end;
        new_anchor := '''paid'', (select count(*) from live where public.bobby_brief_is_paid_pro(identity_id)), ''paidByProvider'', public.bobby_admin_paid_provider_totals(incl),';
      end if;
    else
      old_anchor := '''subscriptions'', subs,';
      if canonical then
        new_anchor := '''subscriptions'', subs || jsonb_build_object(''verifiedPaidPeriods'', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(public.bobby_admin_paid_provider_totals(incl))), ''verifiedPaidPeriodsByProvider'', public.bobby_admin_paid_provider_totals(incl)),';
      else
        new_anchor := '''subscriptions'', subs || jsonb_build_object(''paid'', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(public.bobby_admin_paid_provider_totals(incl))), ''paidByProvider'', public.bobby_admin_paid_provider_totals(incl)),';
      end if;
    end if;
    anchor_count := (length(definition) - length(replace(definition, new_anchor, ''))) / length(new_anchor);
    if anchor_count > 1 then raise exception 'Ambiguous verified paid totals anchor in %', signature; end if;
    old_count := (length(definition) - length(replace(definition, old_anchor, ''))) / length(old_anchor);
    if anchor_count = 1 and old_count <> (case when canonical and signature like '%overview%' then 1 else 0 end) then
      raise exception 'Unexpected or ambiguous remaining paid totals anchor in %', signature;
    end if;
    if anchor_count = 0 then
      if (length(definition) - length(replace(definition, old_anchor, ''))) / length(old_anchor) <> 1 then
        raise exception 'Unexpected or ambiguous paid totals anchor in %', signature;
      end if;
      definition := replace(definition, old_anchor, new_anchor);
    end if;
    -- The 69c bodies already require explicit production/store evidence. Only legacy SQL changes here.
    definition := replace(definition, 'coalesce(x.environment, ''PRODUCTION'') = ''PRODUCTION''',
      '(x.environment = ''PRODUCTION'' and upper(coalesce(x.store, '''')) in (''APP_STORE'', ''MAC_APP_STORE'', ''PLAY_STORE'', ''GOOGLE_PLAY'', ''STRIPE'', ''RC_BILLING''))');
    definition := replace(definition, 'coalesce(environment, ''PRODUCTION'') = ''PRODUCTION''',
      '(environment = ''PRODUCTION'' and upper(coalesce(store, '''')) in (''APP_STORE'', ''MAC_APP_STORE'', ''PLAY_STORE'', ''GOOGLE_PLAY'', ''STRIPE'', ''RC_BILLING''))');
    execute definition;
  end loop;
end;
$migration$;

commit;
