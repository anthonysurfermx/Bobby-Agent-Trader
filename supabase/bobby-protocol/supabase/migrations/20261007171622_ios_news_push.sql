-- iOS product news: a separate versioned opt-in, encrypted existing device bindings, fixed campaign recipients.
-- These tables/RPCs are service-only. No Pro gate and no inference from briefing or OS notification permission.
begin;

create table if not exists public.bobby_news_settings (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  revision int not null default 0 check (revision >= 0),
  news_enabled boolean not null default false,
  language text not null default 'en' check (language in ('en','es','de','fr','it','pt','pt-BR')),
  consent_version int,
  consent_at timestamptz,
  withdrawn_at timestamptz,
  country text check (country ~ '^[A-Z]{2}$'),
  country_source text check (country_source = 'vercel-ip'),
  country_observed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not news_enabled or (consent_version is not distinct from 1 and consent_at is not null)),
  check (consent_version is null or consent_version = 1)
);

create table if not exists public.bobby_news_campaigns (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  family_id text not null,
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  languages text[] not null,
  countries text[] not null,
  min_app_build int not null check (min_app_build >= 66),
  target_identity_id uuid references public.bobby_identities(id) on delete cascade,
  created_by uuid references public.bobby_identities(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.bobby_news_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.bobby_news_campaigns(id) on delete cascade,
  family_id text not null,
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  device_id uuid not null references public.bobby_push_devices(id) on delete cascade,
  installation_id uuid not null,
  binding_revision bigint not null,
  settings_revision int not null,
  language text not null check (language in ('en','es','de','fr','it','pt','pt-BR')),
  state text not null default 'pending' check (state in ('pending','sending','sent','unknown','failed','cancelled','expired')),
  fence int not null default 0,
  attempts int not null default 0,
  apns_id uuid not null default gen_random_uuid(),
  due_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  apns_status int,
  last_reason text,
  unique (campaign_id, installation_id)
);
create index if not exists bobby_news_deliveries_pending_idx on public.bobby_news_deliveries (campaign_id, due_at) where state = 'pending';
-- Additive for a re-applied draft/local scratch database. One launch announcement per installation across groups.
alter table public.bobby_news_campaigns add column if not exists family_id text;
update public.bobby_news_campaigns set family_id = case when id = 'bobby-languages-2026-10' or id like 'bobby-languages-2026-10-%'
  then 'bobby-languages-2026-10' else id end where family_id is null;
alter table public.bobby_news_campaigns alter column family_id set not null;
alter table public.bobby_news_deliveries add column if not exists family_id text;
update public.bobby_news_deliveries r set family_id = c.family_id from public.bobby_news_campaigns c
  where r.campaign_id = c.id and r.family_id is null;
alter table public.bobby_news_deliveries alter column family_id set not null;
create unique index if not exists bobby_news_deliveries_family_installation_key on public.bobby_news_deliveries(family_id, installation_id);

alter table public.bobby_news_settings enable row level security;
alter table public.bobby_news_campaigns enable row level security;
alter table public.bobby_news_deliveries enable row level security;
revoke all on public.bobby_news_settings, public.bobby_news_campaigns, public.bobby_news_deliveries from public, anon, authenticated;
grant all on public.bobby_news_settings, public.bobby_news_campaigns, public.bobby_news_deliveries to service_role;

create or replace function public.bobby_news_settings_get(p_identity uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('revision', revision, 'newsEnabled', news_enabled,
    'language', language, 'consentVersion', consent_version) from bobby_news_settings where identity_id = p_identity),
    jsonb_build_object('revision', 0, 'newsEnabled', false, 'language', 'en', 'consentVersion', null));
$$;

create or replace function public.bobby_news_settings_patch(p_identity uuid, p_expected_revision int, p_patch jsonb, p_country text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare s bobby_news_settings; k text; v_enabled boolean;
begin
  if p_identity is null or p_expected_revision is null or p_expected_revision < 0 or p_patch is null
    or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'invalid_news_settings' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('newsEnabled','language','consentVersion') then raise exception 'invalid_news_key' using errcode = '22023'; end if;
  end loop;
  if p_country is not null and p_country !~ '^[A-Z]{2}$' then raise exception 'invalid_country' using errcode = '22023'; end if;
  if p_patch ? 'language' and (jsonb_typeof(p_patch -> 'language') <> 'string'
    or (p_patch ->> 'language') not in ('en','es','de','fr','it','pt','pt-BR')) then raise exception 'invalid_language' using errcode = '22023'; end if;
  if p_patch ? 'newsEnabled' and jsonb_typeof(p_patch -> 'newsEnabled') <> 'boolean' then raise exception 'invalid_news_consent' using errcode = '22023'; end if;
  v_enabled := case when p_patch ? 'newsEnabled' then (p_patch ->> 'newsEnabled')::boolean else null end;
  if v_enabled is true and (p_patch -> 'consentVersion') is distinct from '1'::jsonb then raise exception 'news_consent_required' using errcode = '22023'; end if;
  if v_enabled is distinct from true and p_patch ? 'consentVersion' then raise exception 'invalid_news_consent' using errcode = '22023'; end if;

  select * into s from bobby_news_settings where identity_id = p_identity for update;
  if not found then
    if p_expected_revision <> 0 then return jsonb_build_object('ok', false, 'revision', 0); end if;
    insert into bobby_news_settings(identity_id) values (p_identity) on conflict do nothing;
    select * into s from bobby_news_settings where identity_id = p_identity for update;
  end if;
  if s.revision <> p_expected_revision then return jsonb_build_object('ok', false, 'revision', s.revision); end if;
  if v_enabled is true then s.news_enabled := true; s.consent_version := 1; s.consent_at := now(); s.withdrawn_at := null; end if;
  if v_enabled is false then s.news_enabled := false; s.consent_version := null; s.withdrawn_at := now(); end if;
  if p_patch ? 'language' then s.language := p_patch ->> 'language'; end if;
  update bobby_news_settings set revision = revision + 1, news_enabled = s.news_enabled, consent_version = s.consent_version,
    consent_at = s.consent_at, withdrawn_at = s.withdrawn_at, language = s.language,
    country = coalesce(p_country, country), country_source = case when p_country is not null then 'vercel-ip' else country_source end,
    country_observed_at = case when p_country is not null then now() else country_observed_at end, updated_at = now()
    where identity_id = p_identity;
  return jsonb_build_object('ok', true, 'settings', bobby_news_settings_get(p_identity));
end;
$$;

drop function if exists public.bobby_news_audience(text[], text[], int, uuid);
create or replace function public.bobby_news_audience(p_languages text[], p_countries text[], p_min_build int, p_identity uuid, p_campaign text default null)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with eligible as (
    select d.installation_id, s.language, s.country from bobby_push_devices d join bobby_news_settings s on s.identity_id = d.identity_id
    where d.status = 'active' and d.environment = 'production' and d.permission in ('authorized','provisional')
      and d.app_build >= greatest(p_min_build, 66) and s.news_enabled and s.consent_version = 1
      and s.language = any(p_languages) and (cardinality(p_countries) = 0 or s.country = any(p_countries))
      and (p_identity is null or s.identity_id = p_identity)
      and (p_campaign is null
        or exists (select 1 from bobby_news_deliveries r where r.campaign_id = p_campaign and r.installation_id = d.installation_id
          and r.state = 'pending' and r.device_id = d.id and r.identity_id = d.identity_id and r.binding_revision = d.binding_revision
          and r.settings_revision = s.revision and r.language = s.language)
        or (not exists (select 1 from bobby_news_campaigns where id = p_campaign)
          and not exists (select 1 from bobby_news_deliveries r where r.installation_id = d.installation_id
            and r.family_id = case when p_campaign = 'bobby-languages-2026-10' or p_campaign like 'bobby-languages-2026-10-%'
              then 'bobby-languages-2026-10' else p_campaign end)))
  )
  select jsonb_build_object('eligible', (select count(*) from eligible),
    'registeredDevices', (select count(*) from bobby_push_devices where status = 'active' and environment = 'production'
      and (p_identity is null or identity_id = p_identity)),
    'optInAccounts', (select count(*) from bobby_news_settings where news_enabled and consent_version = 1
      and (p_identity is null or identity_id = p_identity)),
    'byLanguage', coalesce((select jsonb_object_agg(language, n) from (select language, count(*) n from eligible group by language) x), '{}'::jsonb),
    'byCountry', coalesce((select jsonb_object_agg(country, n) from (select coalesce(country, 'unknown') country, count(*) n from eligible group by country) x), '{}'::jsonb));
$$;

create or replace function public.bobby_news_campaign_prepare(p_campaign text, p_digest text, p_languages text[], p_countries text[],
  p_min_build int, p_identity uuid, p_actor uuid)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare c bobby_news_campaigns; n int; v_family text;
begin
  if p_campaign is null or p_campaign !~ '^[a-z0-9][a-z0-9-]{0,79}$' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_languages is null or cardinality(p_languages) not between 1 and 7 or p_countries is null or cardinality(p_countries) > 250
    or p_min_build is null or p_min_build < 66 or p_min_build > 1000000 or p_actor is null
    or exists (select 1 from unnest(p_languages) l where l is null or l not in ('en','es','de','fr','it','pt','pt-BR'))
    or exists (select 1 from unnest(p_countries) country_code where country_code is null or country_code !~ '^[A-Z]{2}$')
    then raise exception 'invalid_news_campaign' using errcode = '22023'; end if;
  -- One preparation transaction per id; repeated requests resume the frozen recipients without enlarging them.
  perform pg_advisory_xact_lock(hashtextextended('bobby-news-' || p_campaign, 0));
  select * into c from bobby_news_campaigns where id = p_campaign;
  if found then
    if c.digest <> p_digest or c.languages <> p_languages or c.countries <> p_countries
      or c.min_app_build <> p_min_build or c.target_identity_id is distinct from p_identity then
      return jsonb_build_object('ok', false, 'code', 'campaign_conflict');
    end if;
    return jsonb_build_object('ok', true, 'created', false);
  end if;
  if (bobby_news_audience(p_languages, p_countries, p_min_build, p_identity) ->> 'eligible')::int = 0 then
    return jsonb_build_object('ok', true, 'created', false, 'empty', true);
  end if;
  v_family := case when p_campaign = 'bobby-languages-2026-10' or p_campaign like 'bobby-languages-2026-10-%'
    then 'bobby-languages-2026-10' else p_campaign end;
  insert into bobby_news_campaigns(id, family_id, digest, languages, countries, min_app_build, target_identity_id, created_by)
    values (p_campaign, v_family, p_digest, p_languages, p_countries, p_min_build, p_identity, p_actor);
  insert into bobby_news_deliveries(campaign_id, family_id, identity_id, device_id, installation_id, binding_revision, settings_revision, language)
    select p_campaign, v_family, d.identity_id, d.id, d.installation_id, d.binding_revision, s.revision, s.language
      from bobby_push_devices d join bobby_news_settings s on s.identity_id = d.identity_id
      where d.status = 'active' and d.environment = 'production' and d.permission in ('authorized','provisional')
        and d.app_build >= p_min_build and s.news_enabled and s.consent_version = 1 and s.language = any(p_languages)
        and (cardinality(p_countries) = 0 or s.country = any(p_countries)) and (p_identity is null or s.identity_id = p_identity)
    on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'created', true, 'recipients', n);
end;
$$;

create or replace function public.bobby_news_delivery_claim(p_campaign text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_news_deliveries; c bobby_news_campaigns;
begin
  select * into c from bobby_news_campaigns where id = p_campaign;
  if not found then return jsonb_build_object('state', 'empty'); end if;
  -- A crashed sender may have reached Apple: record uncertainty, never make it pending again.
  update bobby_news_deliveries set state = 'unknown', last_reason = 'sender_interrupted', finished_at = now()
    where campaign_id = p_campaign and state = 'sending' and started_at < now() - interval '5 minutes';
  if c.expires_at <= now() then
    update bobby_news_deliveries set state = 'expired', finished_at = now() where campaign_id = p_campaign and state = 'pending';
    return jsonb_build_object('state', 'empty');
  end if;
  select * into r from bobby_news_deliveries where campaign_id = p_campaign and state = 'pending' and due_at <= now()
    order by due_at, id for update skip locked limit 1;
  if not found then return jsonb_build_object('state', 'empty'); end if;
  update bobby_news_deliveries set state = 'sending', fence = fence + 1, attempts = attempts + 1, started_at = now() where id = r.id
    returning * into r;
  return jsonb_build_object('state', 'claimed', 'id', r.id, 'fence', r.fence, 'language', r.language,
    'apnsId', r.apns_id, 'expiresAt', c.expires_at);
end;
$$;

create or replace function public.bobby_news_delivery_authorize(p_id uuid, p_fence int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_news_deliveries; c bobby_news_campaigns; s bobby_news_settings; d bobby_push_devices;
begin
  if p_id is null or p_fence is null or p_fence < 1 then return jsonb_build_object('ok', false); end if;
  select * into r from bobby_news_deliveries where id = p_id for update;
  if not found or r.state <> 'sending' or r.fence <> p_fence then return jsonb_build_object('ok', false); end if;
  select * into c from bobby_news_campaigns where id = r.campaign_id;
  select * into s from bobby_news_settings where identity_id = r.identity_id for share;
  select * into d from bobby_push_devices where id = r.device_id for share;
  if c.expires_at <= now() or s.identity_id is null or d.id is null or not s.news_enabled or s.consent_version is distinct from 1
    or s.revision <> r.settings_revision or s.language <> r.language or d.identity_id <> r.identity_id
    or d.binding_revision <> r.binding_revision or d.status <> 'active' or d.environment <> 'production'
    or d.permission not in ('authorized','provisional') or d.app_build < c.min_app_build
    or (cardinality(c.countries) > 0 and (s.country is null or not s.country = any(c.countries)))
    or (c.target_identity_id is not null and c.target_identity_id <> r.identity_id) then
    update bobby_news_deliveries set state = case when c.expires_at <= now() then 'expired' else 'cancelled' end,
      last_reason = 'authorization_changed', finished_at = now() where id = r.id;
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'tokenCiphertext', d.token_ciphertext, 'environment', d.environment, 'topic', d.topic);
end;
$$;

create or replace function public.bobby_news_delivery_result(p_id uuid, p_fence int, p_outcome text, p_apns_status int,
  p_reason text, p_retry_seconds int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_news_deliveries; v_state text;
begin
  if p_id is null or p_fence is null or p_fence < 1 then return jsonb_build_object('ok', false); end if;
  if p_outcome is null or p_outcome not in ('accepted','retry','invalid_token','ambiguous','config','failed')
    then raise exception 'invalid_news_outcome' using errcode = '22023'; end if;
  if p_outcome = 'accepted' and p_apns_status is distinct from 200
    then raise exception 'invalid_news_acceptance' using errcode = '22023'; end if;
  select * into r from bobby_news_deliveries where id = p_id for update;
  if not found or r.state <> 'sending' or r.fence <> p_fence then return jsonb_build_object('ok', false); end if;
  v_state := case p_outcome when 'accepted' then 'sent' when 'ambiguous' then 'unknown'
    when 'config' then 'pending' when 'retry' then case when r.attempts < 3 then 'pending' else 'failed' end else 'failed' end;
  update bobby_news_deliveries set state = v_state, apns_status = p_apns_status, last_reason = left(p_reason, 48),
    due_at = now() + make_interval(secs => least(600, greatest(1, coalesce(p_retry_seconds, 30)))),
    attempts = case when p_outcome = 'config' then greatest(0, attempts - 1) else attempts end,
    finished_at = case when v_state = 'pending' then null else now() end where id = r.id;
  if p_outcome = 'invalid_token' then
    update bobby_push_devices set status = 'invalid', invalidated_at = now(), invalid_reason = left(p_reason, 48), updated_at = now()
      where id = r.device_id and binding_revision = r.binding_revision and identity_id = r.identity_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.bobby_news_campaign_status(p_campaign text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('pending', count(*) filter (where state = 'pending'), 'sending', count(*) filter (where state = 'sending'),
    'sent', count(*) filter (where state = 'sent'), 'unknown', count(*) filter (where state = 'unknown'),
    'failed', count(*) filter (where state = 'failed'), 'cancelled', count(*) filter (where state = 'cancelled'),
    'expired', count(*) filter (where state = 'expired')) from bobby_news_deliveries where campaign_id = p_campaign;
$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'bobby\_news\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
commit;
