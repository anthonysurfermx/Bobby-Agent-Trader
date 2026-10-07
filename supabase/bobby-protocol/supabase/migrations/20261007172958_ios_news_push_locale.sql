-- Preserve the app's exact regional locale and avoid invalidating pending deliveries on a preference refresh.
-- Forward-only change: the initial news push migration may already be deployed.
begin;

alter table public.bobby_news_settings add column if not exists locale text;
update public.bobby_news_settings set locale = case language
  when 'en' then 'en-US' when 'es' then 'es-MX' when 'fr' then 'fr-FR' when 'de' then 'de-DE'
  when 'it' then 'it-IT' when 'pt-BR' then 'pt-BR' else 'pt-PT' end where locale is null;
alter table public.bobby_news_settings alter column locale set default 'en-US';
alter table public.bobby_news_settings alter column locale set not null;
alter table public.bobby_news_settings drop constraint if exists bobby_news_settings_locale_check;
alter table public.bobby_news_settings add constraint bobby_news_settings_locale_check check (
  (language = 'en' and locale in ('en-US','en-GB','en-AU','en-CA','en-IE'))
  or (language = 'es' and locale in ('es-MX','es-ES','es-US'))
  or (language = 'fr' and locale = 'fr-FR') or (language = 'de' and locale = 'de-DE')
  or (language = 'it' and locale = 'it-IT') or (language = 'pt' and locale = 'pt-PT')
  or (language = 'pt-BR' and locale = 'pt-BR')
);

create or replace function public.bobby_news_settings_get(p_identity uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('revision', revision, 'newsEnabled', news_enabled,
    'language', language, 'locale', locale, 'consentVersion', consent_version) from bobby_news_settings where identity_id = p_identity),
    jsonb_build_object('revision', 0, 'newsEnabled', false, 'language', 'en', 'locale', 'en-US', 'consentVersion', null));
$$;

create or replace function public.bobby_news_settings_patch(p_identity uuid, p_expected_revision int, p_patch jsonb, p_country text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare s bobby_news_settings; previous bobby_news_settings; k text; v_enabled boolean; v_changed boolean;
begin
  if p_identity is null or p_expected_revision is null or p_expected_revision < 0 or p_patch is null
    or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'invalid_news_settings' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('newsEnabled','language','locale','consentVersion') then raise exception 'invalid_news_key' using errcode = '22023'; end if;
  end loop;
  if p_country is not null and p_country !~ '^[A-Z]{2}$' then raise exception 'invalid_country' using errcode = '22023'; end if;
  if p_patch ? 'language' and (jsonb_typeof(p_patch -> 'language') <> 'string'
    or (p_patch ->> 'language') not in ('en','es','de','fr','it','pt','pt-BR')) then raise exception 'invalid_language' using errcode = '22023'; end if;
  if p_patch ? 'locale' and (not (p_patch ? 'language') or jsonb_typeof(p_patch -> 'locale') <> 'string'
    or not (
      ((p_patch ->> 'language') = 'en' and (p_patch ->> 'locale') in ('en-US','en-GB','en-AU','en-CA','en-IE'))
      or ((p_patch ->> 'language') = 'es' and (p_patch ->> 'locale') in ('es-MX','es-ES','es-US'))
      or ((p_patch ->> 'language') = 'fr' and (p_patch ->> 'locale') = 'fr-FR')
      or ((p_patch ->> 'language') = 'de' and (p_patch ->> 'locale') = 'de-DE')
      or ((p_patch ->> 'language') = 'it' and (p_patch ->> 'locale') = 'it-IT')
      or ((p_patch ->> 'language') = 'pt' and (p_patch ->> 'locale') = 'pt-PT')
      or ((p_patch ->> 'language') = 'pt-BR' and (p_patch ->> 'locale') = 'pt-BR')
    )) then raise exception 'invalid_locale' using errcode = '22023'; end if;
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
  previous := s;
  if v_enabled is true and not s.news_enabled then
    s.news_enabled := true; s.consent_version := 1; s.consent_at := now(); s.withdrawn_at := null;
  end if;
  if v_enabled is false and (s.news_enabled or s.consent_version is not null) then
    s.news_enabled := false; s.consent_version := null; s.withdrawn_at := now();
  end if;
  if p_patch ? 'language' then
    s.language := p_patch ->> 'language';
    -- Older callers that provide only a language retain their canonical-locale behavior.
    s.locale := coalesce(p_patch ->> 'locale', case s.language
      when 'en' then 'en-US' when 'es' then 'es-MX' when 'fr' then 'fr-FR' when 'de' then 'de-DE'
      when 'it' then 'it-IT' when 'pt-BR' then 'pt-BR' else 'pt-PT' end);
  end if;
  v_changed := s.news_enabled is distinct from previous.news_enabled or s.consent_version is distinct from previous.consent_version
    or s.language is distinct from previous.language or s.locale is distinct from previous.locale;
  update bobby_news_settings set revision = revision + case when v_changed then 1 else 0 end,
    news_enabled = s.news_enabled, consent_version = s.consent_version, consent_at = s.consent_at,
    withdrawn_at = s.withdrawn_at, language = s.language, locale = s.locale,
    country = coalesce(p_country, country), country_source = case when p_country is not null then 'vercel-ip' else country_source end,
    country_observed_at = case when p_country is not null then now() else country_observed_at end,
    updated_at = case when v_changed or p_country is not null then now() else updated_at end
    where identity_id = p_identity;
  return jsonb_build_object('ok', true, 'settings', bobby_news_settings_get(p_identity));
end;
$$;

-- Reassert service-only access after replacing the RPCs, including under permissive default ACLs.
revoke all on function public.bobby_news_settings_get(uuid), public.bobby_news_settings_patch(uuid,int,jsonb,text) from public, anon, authenticated;
grant execute on function public.bobby_news_settings_get(uuid), public.bobby_news_settings_patch(uuid,int,jsonb,text) to service_role;
commit;
