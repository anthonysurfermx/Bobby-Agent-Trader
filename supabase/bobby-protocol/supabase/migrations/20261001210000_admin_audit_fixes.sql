-- Fixes from the dashboard audit of 2026-10-01 (Codex, on 065138a):
--   · the spend guard sums the desk only again (other surfaces now write the ledger too); the dashboard shows the
--     guard's own calendar-month figure next to the all-surface breakdown;
--   · net revenue uses the store commission and tax carried by each event, and refunds subtract;
--   · a coupon at its redemption cap is not counted as active;
--   · a refunded read (deleted within 15 minutes) is taken back out of the reader stats;
--   · bobby_admin_coverage: since when each source has data, so the dashboard never implies older history;
--   · bobby_admin_members: every paid subscription and gifted Pro, not a scan of recent accounts.

create or replace function public.bobby_llm_spend()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'day', coalesce(sum(usd) filter (where created_at >= date_trunc('day', now())), 0),
    'month', coalesce(sum(usd), 0))
  from bobby_llm_usage where surface = 'desk' and created_at >= date_trunc('month', now());
$$;
revoke all on function public.bobby_llm_spend() from public, anon, authenticated;
grant execute on function public.bobby_llm_spend() to service_role;

alter table public.bobby_purchase_events add column if not exists commission_pct numeric(6, 4);
alter table public.bobby_purchase_events add column if not exists tax_pct numeric(6, 4);

create or replace function public.bobby_net_share(p_commission numeric, p_tax numeric, p_takehome numeric)
returns numeric language sql immutable set search_path = public, pg_temp as $$
  select case when p_commission is not null then greatest(0, 1 - p_commission - coalesce(p_tax, 0))
              when p_takehome is not null then p_takehome else 0.85 end;
$$;

create or replace function public.bobby_admin_coverage()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'eventsSince', (select min(created_at) from bobby_events),
    'devicesSince', (select min(first_seen) from bobby_devices),
    'readsSince', (select min(created_at) from bobby_reads),
    'readerStatsSince', (select min(first_read_at) from bobby_reader_stats),
    'purchasesSince', (select min(event_at) from bobby_purchase_events),
    'ledgerSince', (select min(created_at) from bobby_llm_usage),
    'ledgerSurfaces', coalesce((select jsonb_agg(distinct surface) from bobby_llm_usage), '[]'::jsonb));
$$;

-- A failed analysis deletes its read seconds later (refundRead): take it back out of the reader stats.
create or replace function public.bobby_untrack_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text;
begin
  if old.created_at <= now() - interval '15 minutes' or (old.identity_id is null and old.device_hash is null) then return old; end if;
  key := case when old.identity_id is not null then 'a:' || old.identity_id::text else 'd:' || old.device_hash end;
  begin
    update bobby_reader_stats set reads = greatest(reads - 1, 0) where reader = key;
    delete from bobby_reader_stats where reader = key and reads = 0;
  exception when others then
    raise warning 'bobby_untrack_reader: %', sqlerrm;
  end;
  return old;
end;
$$;
drop trigger if exists bobby_reads_untrack_reader on public.bobby_reads;
create trigger bobby_reads_untrack_reader after delete on public.bobby_reads
  for each row execute function public.bobby_untrack_reader();

create or replace function public.bobby_admin_members()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('identityId', s.identity_id, 'email', b.email, 'provider', s.provider,
        'status', s.status, 'productId', s.product_id, 'currentPeriodEnd', s.current_period_end, 'updatedAt', s.updated_at,
        'active', s.status in ('active', 'trialing') and (s.current_period_end is null or s.current_period_end > now()))
        order by s.updated_at desc) from bobby_subscriptions s left join bobby_identities b on b.id = s.identity_id), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('identityId', g.identity_id, 'email', b.email, 'source', g.source,
        'proUntil', g.pro_until, 'active', g.pro_until > now()) order by g.pro_until desc)
        from bobby_pro_grants g left join bobby_identities b on b.id = g.identity_id), '[]'::jsonb));
$$;

-- The overview of 20261001180000 with the fixes above.
create or replace function public.bobby_admin_overview(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  days jsonb;
  accounts jsonb; activity jsonb; funnel jsonb; subs jsonb; revenue jsonb; llm jsonb; coupons jsonb;
begin
  select coalesce(jsonb_agg(to_char(g, 'YYYY-MM-DD') order by g), '[]'::jsonb) into days
    from generate_series(since, date_trunc('day', now()), interval '1 day') g;

  -- Accounts: Apple/Google sign-ins (wallet-only identities are counted apart).
  select jsonb_build_object(
    'total', count(*) filter (where auth_user_id is not null),
    'new', count(*) filter (where auth_user_id is not null and created_at >= since),
    'wallets', count(*) filter (where auth_user_id is null),
    'active7d', count(*) filter (where auth_user_id is not null and last_seen_at > now() - interval '7 days'),
    'byProvider', coalesce((select jsonb_object_agg(p, n) from (
        select coalesce(provider, 'other') p, count(*) n from bobby_identities where auth_user_id is not null group by 1) x), '{}'::jsonb),
    'daily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(*) from bobby_identities b where b.auth_user_id is not null and b.created_at >= g and b.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into accounts from bobby_identities;

  -- Activity: reads per day and platform (bobby_reads keeps 35 days), premium levels, readers.
  select jsonb_build_object(
    'reads', (select count(*) from bobby_reads where created_at >= since),
    'readsDaily', (select jsonb_build_object(
        'web', coalesce(jsonb_agg(w order by g), '[]'::jsonb), 'ios', coalesce(jsonb_agg(i order by g), '[]'::jsonb),
        'android', coalesce(jsonb_agg(a order by g), '[]'::jsonb)) from (
        select g,
          count(r.id) filter (where r.platform = 'web') w, count(r.id) filter (where r.platform = 'ios') i,
          count(r.id) filter (where r.platform = 'android') a
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join bobby_reads r on r.created_at >= g and r.created_at < g + interval '1 day' group by g) s),
    'levels', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (
        select level, count(*) n from bobby_level_uses where created_at >= since group by 1) x),
    'activeReaders7d', (select count(*) from bobby_reader_stats where last_read_at > now() - interval '7 days'),
    'activation', (select jsonb_build_object(
        'accounts', count(*),
        'activated', count(s.reader),
        'medianMinutes', round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_read_at - b.created_at)) / 60)
                          filter (where s.reader is not null))::numeric, 1))
      from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
      where b.auth_user_id is not null and b.created_at >= since)
  ) into activity;

  -- Funnel per platform over the window. Devices are guest installs/browsers; accounts are attributed to the
  -- platform of their first read.
  select jsonb_build_object(
    'web', jsonb_build_object(
      'visitors', (select count(distinct device_hash) from bobby_events where event = 'visit' and platform = 'web' and created_at >= since),
      'deskVisitors', (select count(distinct device_hash) from bobby_events where event = 'visit' and platform = 'web' and surface = 'desk' and created_at >= since),
      'appStoreClicks', (select count(*) from bobby_events where event = 'appstore_click' and created_at >= since),
      'signinStarts', (select count(*) from bobby_events where event = 'signin_start' and platform = 'web' and created_at >= since),
      'guestReaders', (select count(*) from bobby_reader_stats where identity_id is null and platform = 'web' and first_read_at >= since),
      'accounts', (select count(*) from bobby_reader_stats s join bobby_identities b on b.id = s.identity_id
                    where s.platform = 'web' and b.created_at >= since),
      'paywallViews', (select count(*) from bobby_events where event = 'paywall_view' and platform = 'web' and created_at >= since),
      'pro', (select count(*) from bobby_subscriptions where provider = 'stripe' and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now()))),
    'ios', jsonb_build_object(
      'guestReaders', (select count(*) from bobby_reader_stats where identity_id is null and platform = 'ios' and first_read_at >= since),
      'accounts', (select count(*) from bobby_reader_stats s join bobby_identities b on b.id = s.identity_id
                    where s.platform = 'ios' and b.created_at >= since),
      'paywallViews', (select count(*) from bobby_events where event = 'paywall_view' and platform = 'ios' and created_at >= since),
      'pro', (select count(*) from bobby_subscriptions where provider = 'apple' and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now()))),
    'visitsDaily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(distinct e.device_hash) from bobby_events e where e.event = 'visit' and e.created_at >= g and e.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s),
    'topSurfaces', (select coalesce(jsonb_agg(jsonb_build_object('surface', surface, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(surface, 'other') surface, count(distinct device_hash) n from bobby_events
        where event = 'visit' and created_at >= since group by 1 order by 2 desc limit 8) x),
    'topReferrers', (select coalesce(jsonb_agg(jsonb_build_object('referrer', referrer, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(referrer, utm_source, 'direct') referrer, count(distinct device_hash) n from bobby_events
        where event = 'visit' and created_at >= since group by 1 order by 2 desc limit 8) x)
  ) into funnel;

  -- Memberships: paid subscriptions and gifted Pro (referrals, admin grants).
  select jsonb_build_object(
    'active', count(*) filter (where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now())),
    'byStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from bobby_subscriptions group by 1) x), '{}'::jsonb),
    'byProvider', coalesce((select jsonb_object_agg(provider, n) from (
        select provider, count(*) n from bobby_subscriptions
        where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()) group by 1) x), '{}'::jsonb),
    'giftedPro', (select count(*) from bobby_pro_grants where pro_until > now())
  ) into subs from bobby_subscriptions;

  -- Revenue from purchase events (production only; sandbox apart for App Review tests). Net = price × (1 − store
  -- commission − tax) when the event carries them, else its take-home share, else 85%; refunds (negative prices)
  -- subtract from both gross and net.
  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and prod), 0),
    'netUsd', coalesce(sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) filter (where price_usd is not null and prod), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and prod), 0),
    'newSubscriptions', count(*) filter (where type = 'INITIAL_PURCHASE' and prod),
    'renewals', count(*) filter (where type = 'RENEWAL' and prod),
    'cancellations', count(*) filter (where type = 'CANCELLATION' and prod),
    'expirations', count(*) filter (where type = 'EXPIRATION' and prod),
    'sandboxEvents', count(*) filter (where not prod),
    'daily', (select coalesce(jsonb_agg(v order by g), '[]'::jsonb) from (
        select g, coalesce((select sum(p.price_usd) from bobby_purchase_events p
          where p.price_usd > 0 and coalesce(p.environment, 'PRODUCTION') = 'PRODUCTION' and p.event_at >= g and p.event_at < g + interval '1 day'), 0) v
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into revenue
  from (select *, coalesce(environment, 'PRODUCTION') = 'PRODUCTION' as prod from bobby_purchase_events where event_at >= since) p;

  -- LLM spend from the cost ledger and the estimated credit left per provider.
  select jsonb_build_object(
    'providers', (select jsonb_object_agg(p, jsonb_build_object(
        'today', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at >= date_trunc('day', now())),
        'week', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '7 days'),
        'month', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '30 days'),
        'calls', (select count(*) from bobby_llm_usage where provider = p and created_at >= since),
        'failures', (select count(*) from bobby_llm_usage where provider = p and created_at >= since and not ok),
        'balanceMark', (select jsonb_build_object('amount', amount_usd, 'at', created_at) from bobby_llm_credit_marks
                          where provider = p and kind = 'balance' order by created_at desc limit 1),
        'estimatedLeft', (select m.amount_usd
            + coalesce((select sum(t.amount_usd) from bobby_llm_credit_marks t where t.provider = p and t.kind = 'topup' and t.created_at > m.created_at), 0)
            - coalesce((select sum(u.usd) from bobby_llm_usage u where u.provider = p and u.created_at > m.created_at), 0)
            from bobby_llm_credit_marks m where m.provider = p and m.kind = 'balance' order by m.created_at desc limit 1),
        'lastCreditAlert', (select updated_at from api_cache where cache_key = 'provider-credit-alert:' || p)))
      from unnest(array['anthropic', 'openai']) p),
    'bySurface', coalesce((select jsonb_agg(jsonb_build_object('surface', surface, 'provider', provider, 'usd', usd, 'calls', calls, 'failures', failures) order by usd desc) from (
        select surface, provider, sum(usd) usd, count(*) calls, count(*) filter (where not ok) failures from bobby_llm_usage
        where created_at >= since group by 1, 2) x), '[]'::jsonb),
    'guard', bobby_llm_spend(),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('anthropic', a, 'openai', o) order by g), '[]'::jsonb) from (
        select g,
          coalesce(sum(u.usd) filter (where u.provider = 'anthropic'), 0) a, coalesce(sum(u.usd) filter (where u.provider = 'openai'), 0) o
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join bobby_llm_usage u on u.created_at >= g and u.created_at < g + interval '1 day' group by g) s)
  ) into llm;

  select jsonb_build_object(
    'active', (select count(*) from bobby_coupons where active and (expires_at is null or expires_at > now())
                and (max_redemptions is null or redeemed < max_redemptions)),
    'redemptions', (select count(*) from bobby_coupon_redemptions where created_at >= since),
    'giftedReadsLeft', (select coalesce(sum(reads), 0) from bobby_usage_bonus)
  ) into coupons;

  return jsonb_build_object('days', days, 'since', since, 'accounts', accounts, 'activity', activity, 'funnel', funnel,
    'subscriptions', subs, 'revenue', revenue, 'llm', llm, 'coupons', coupons, 'coverage', bobby_admin_coverage());
end;
$$;


-- The lifecycle (20261001200000) with nested funnel counts: engaged (desk or a read) ⊇ read1 ⊇ account after a
-- read ⊇ Pro after a read, so no step can exceed the one before it.
create or replace function public.bobby_admin_lifecycle(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  pf text; funnels jsonb := '{}'::jsonb; stages jsonb;
begin
  foreach pf in array array['web', 'ios'] loop
    funnels := funnels || jsonb_build_object(pf, (
      with cohort as (
        select dv.* from bobby_devices dv where dv.platform = pf and dv.first_seen >= since
      ), facts as (
        select c.device_hash, c.first_seen, c.last_seen, c.active_days, c.identity_id, c.linked_at,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'visit' and e.surface = 'home') as home,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'visit' and e.surface = 'desk') as desk,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'appstore_click') as appstore,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'signin_start') as signin,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'paywall_view') as paywall,
          coalesce(g.reads, 0) + coalesce(a.reads, 0) as reads,
          least(g.first_read_at, a.first_read_at) as first_read,
          c.identity_id is not null and bobby_is_pro(c.identity_id) as pro
        from cohort c
        left join bobby_reader_stats g on g.reader = 'd:' || c.device_hash
        left join bobby_reader_stats a on c.identity_id is not null and a.reader = 'a:' || c.identity_id::text
      )
      select jsonb_build_object(
        'devices', count(*),
        'home', count(*) filter (where home),
        'desk', count(*) filter (where desk),
        'appStoreClick', count(*) filter (where appstore),
        'read1', count(*) filter (where reads >= 1),
        'read2', count(*) filter (where reads >= 2),
        'read5', count(*) filter (where reads >= 5),
        'signinStart', count(*) filter (where signin),
        'account', count(*) filter (where identity_id is not null),
        'returned', count(*) filter (where active_days >= 2),
        'paywall', count(*) filter (where paywall),
        'pro', count(*) filter (where pro),
        -- The nested funnel: each step is a subset of the one before it.
        'engaged', count(*) filter (where desk or reads >= 1),
        'accountAfterRead', count(*) filter (where reads >= 1 and identity_id is not null),
        'proAfterRead', count(*) filter (where reads >= 1 and identity_id is not null and pro),
        'returnedAfterRead', count(*) filter (where reads >= 1 and active_days >= 2),
        'medianMinutesToFirstRead', round((percentile_cont(0.5) within group (order by extract(epoch from (first_read - first_seen)) / 60)
            filter (where first_read is not null and first_read >= first_seen))::numeric, 1),
        'medianMinutesToAccount', round((percentile_cont(0.5) within group (order by extract(epoch from (linked_at - first_seen)) / 60)
            filter (where linked_at is not null and linked_at >= first_seen))::numeric, 1),
        'retention', jsonb_build_object(
          'd1', jsonb_build_object('eligible', count(*) filter (where first_seen <= now() - interval '1 day'),
                  'returned', count(*) filter (where first_seen <= now() - interval '1 day' and last_seen >= first_seen + interval '1 day')),
          'd7', jsonb_build_object('eligible', count(*) filter (where first_seen <= now() - interval '7 days'),
                  'returned', count(*) filter (where first_seen <= now() - interval '7 days' and last_seen >= first_seen + interval '7 days')))
      ) from facts));
  end loop;

  -- People today: each account once (its reads, last activity across its devices) and each guest device that
  -- never signed in. new = no read yet (seen in the last 7 days); activated = 1–4 reads; engaged = 5+ reads;
  -- atRisk = quiet 7–30 days; lost = quiet 30+ days; Pro separately.
  with people as (
    select 'account' as kind,
      (select dv.platform from bobby_devices dv where dv.identity_id = b.id order by dv.first_seen limit 1) as platform,
      coalesce(s.reads, 0) + coalesce((select sum(g.reads) from bobby_devices dv join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
                                        where dv.identity_id = b.id), 0) as reads,
      greatest(b.last_seen_at, s.last_read_at, (select max(dv.last_seen) from bobby_devices dv where dv.identity_id = b.id)) as last_seen,
      bobby_is_pro(b.id) as pro
    from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    where b.auth_user_id is not null
    union all
    select 'guest', dv.platform, coalesce(g.reads, 0), greatest(dv.last_seen, g.last_read_at), false
    from bobby_devices dv left join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
    where dv.identity_id is null
  )
  select jsonb_build_object(
    'total', count(*),
    'accounts', count(*) filter (where kind = 'account'),
    'guests', count(*) filter (where kind = 'guest'),
    'new', count(*) filter (where not pro and reads = 0 and last_seen > now() - interval '7 days'),
    'activated', count(*) filter (where not pro and reads between 1 and 4 and last_seen > now() - interval '7 days'),
    'engaged', count(*) filter (where not pro and reads >= 5 and last_seen > now() - interval '7 days'),
    'pro', count(*) filter (where pro),
    'atRisk', count(*) filter (where not pro and last_seen <= now() - interval '7 days' and last_seen > now() - interval '30 days'),
    'lost', count(*) filter (where not pro and last_seen <= now() - interval '30 days'),
    'byPlatform', coalesce((select jsonb_object_agg(p, n) from (select coalesce(platform, 'unknown') p, count(*) n from people group by 1) x), '{}'::jsonb)
  ) into stages from people;

  return jsonb_build_object('since', since, 'web', funnels -> 'web', 'ios', funnels -> 'ios', 'stages', stages);
end;
$$;

-- Economics (20261001200000) with the same net formula.
create or replace function public.bobby_admin_economics(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  prod_events jsonb; costs jsonb; subs jsonb;
begin
  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and event_at >= since), 0),
    'netUsd', coalesce(sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) filter (where price_usd is not null and event_at >= since), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and event_at >= since), 0),
    'newPaying', count(distinct identity_id) filter (where type = 'INITIAL_PURCHASE' and event_at >= since),
    'initialPurchases30d', count(*) filter (where type = 'INITIAL_PURCHASE' and event_at > now() - interval '30 days'),
    'expirations30d', count(*) filter (where type = 'EXPIRATION' and event_at > now() - interval '30 days'),
    'lastPriceUsd', (select price_usd from bobby_purchase_events where price_usd > 0 and coalesce(environment, 'PRODUCTION') = 'PRODUCTION'
                      order by event_at desc limit 1),
    'takehome', avg(bobby_net_share(commission_pct, tax_pct, takehome)) filter (where commission_pct is not null or takehome is not null)
  ) into prod_events
  from bobby_purchase_events where coalesce(environment, 'PRODUCTION') = 'PRODUCTION';

  select jsonb_build_object(
    'marketingUsd', coalesce(sum(amount_usd) filter (where kind = 'marketing'), 0),
    'infraUsd', coalesce(sum(amount_usd) filter (where kind = 'infra'), 0),
    'otherUsd', coalesce(sum(amount_usd) filter (where kind = 'other'), 0),
    'byChannel', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'usd', usd) order by usd desc) from (
        select coalesce(channel, 'other') ch, sum(amount_usd) usd from bobby_costs
        where kind = 'marketing' and spent_on >= since::date group by 1) x), '[]'::jsonb)
  ) into costs from bobby_costs where spent_on >= since::date;

  select jsonb_build_object(
    'active', count(*) filter (where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
  ) into subs from bobby_subscriptions;

  return jsonb_build_object(
    'days', d, 'since', since,
    'revenue', prod_events,
    'costs', costs,
    'subscriptions', subs,
    'newAccounts', (select count(*) from bobby_identities where auth_user_id is not null and created_at >= since),
    'activeReaders30d', (select count(*) from bobby_reader_stats where last_read_at > now() - interval '30 days'),
    'llmUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at >= since),
    'llm30dUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at > now() - interval '30 days'),
    'assumptions', coalesce((select value from bobby_admin_settings where key = 'unit_economics'), '{}'::jsonb));
end;
$$;


revoke all on function public.bobby_net_share(numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.bobby_admin_coverage() from public, anon, authenticated;
revoke all on function public.bobby_untrack_reader() from public, anon, authenticated;
revoke all on function public.bobby_admin_members() from public, anon, authenticated;
revoke all on function public.bobby_admin_overview(int) from public, anon, authenticated;
revoke all on function public.bobby_admin_economics(int) from public, anon, authenticated;
revoke all on function public.bobby_admin_lifecycle(int) from public, anon, authenticated;
grant execute on function public.bobby_admin_lifecycle(int) to service_role;
grant execute on function public.bobby_net_share(numeric, numeric, numeric) to service_role;
grant execute on function public.bobby_admin_coverage() to service_role;
grant execute on function public.bobby_admin_members() to service_role;
grant execute on function public.bobby_admin_overview(int) to service_role;
grant execute on function public.bobby_admin_economics(int) to service_role;
