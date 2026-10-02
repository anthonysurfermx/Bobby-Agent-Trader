-- Build 55: additive briefing languages; no schedule, consent, eligibility or budget changes.
begin;
alter table public.bobby_brief_settings drop constraint if exists bobby_brief_settings_language_check;
alter table public.bobby_brief_settings add constraint bobby_brief_settings_language_check check (language in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de'));
alter table public.bobby_brief_shared drop constraint if exists bobby_brief_shared_language_check;
alter table public.bobby_brief_shared add constraint bobby_brief_shared_language_check check (language in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de'));
alter table public.bobby_briefs drop constraint if exists bobby_briefs_language_check;
alter table public.bobby_briefs add constraint bobby_briefs_language_check check (language in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de'));
alter table public.bobby_brief_outbox drop constraint if exists bobby_brief_outbox_language_check;
alter table public.bobby_brief_outbox add constraint bobby_brief_outbox_language_check check (language in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de'));
alter table public.bobby_brief_audio drop constraint if exists bobby_brief_audio_language_check;
alter table public.bobby_brief_audio add constraint bobby_brief_audio_language_check check (language in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de'));

create or replace function public.bobby_brief_settings_patch(p_identity uuid, p_expected_revision int, p_patch jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  s bobby_brief_settings;
  o bobby_brief_settings;
  k text;
  v jsonb;
  a text[];
  c text;
begin
  if p_identity is null or p_expected_revision is null or p_expected_revision < 0 then perform bobby_brief_bad('arguments'); end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then perform bobby_brief_bad('patch'); end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('openingEnabled', 'closeEnabled', 'weeklyEnabled', 'language', 'companionId', 'assets', 'analysisConsentEnabled',
                 'analysisConsentVersion', 'audioConsentEnabled', 'audioConsentVersion') then
      perform bobby_brief_bad('key ' || k);
    end if;
  end loop;

  select * into s from bobby_brief_settings where identity_id = p_identity for update;
  if not found then
    if p_expected_revision <> 0 then return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'revision', 0); end if;
    insert into bobby_brief_settings (identity_id, revision) values (p_identity, 0) on conflict (identity_id) do nothing;
    select * into s from bobby_brief_settings where identity_id = p_identity for update;
  end if;
  if s.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'revision', s.revision);
  end if;
  o := s;

  if p_patch ? 'openingEnabled' then s.opening_enabled := bobby_brief_jbool(p_patch, 'openingEnabled'); end if;
  if p_patch ? 'closeEnabled' then s.close_enabled := bobby_brief_jbool(p_patch, 'closeEnabled'); end if;
  if p_patch ? 'weeklyEnabled' then s.weekly_enabled := bobby_brief_jbool(p_patch, 'weeklyEnabled'); end if;
  if p_patch ? 'language' then
    if jsonb_typeof(p_patch -> 'language') <> 'string' or (p_patch ->> 'language') not in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de') then perform bobby_brief_bad('language'); end if;
    s.language := p_patch ->> 'language';
  end if;
  if p_patch ? 'companionId' then
    v := p_patch -> 'companionId';
    if jsonb_typeof(v) = 'null' then s.companion_id := null;
    elsif jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z0-9_-]{1,32}$' then s.companion_id := v #>> '{}';
    else perform bobby_brief_bad('companionId');
    end if;
  end if;
  if p_patch ? 'assets' then
    v := p_patch -> 'assets';
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 6 then perform bobby_brief_bad('assets'); end if;
    if exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Z0-9.-]{1,12}$') then
      perform bobby_brief_bad('assets');
    end if;
    select coalesce(array_agg(x order by i), '{}') into a from jsonb_array_elements_text(v) with ordinality t(x, i);
    if (select count(distinct x) from unnest(a) x) <> cardinality(a) then perform bobby_brief_bad('assets'); end if;
    s.assets := a;
  end if;

  -- Consents: enabling requires a version in the same patch and records the acceptance time; withdrawing clears it.
  if p_patch ? 'analysisConsentEnabled' then s.analysis_consent_enabled := bobby_brief_jbool(p_patch, 'analysisConsentEnabled'); end if;
  if p_patch ? 'analysisConsentVersion' then s.analysis_consent_version := bobby_brief_jversion(p_patch, 'analysisConsentVersion'); end if;
  if s.analysis_consent_enabled then
    if s.analysis_consent_version is null then perform bobby_brief_bad('analysisConsentVersion'); end if;
    if not o.analysis_consent_enabled or o.analysis_consent_version is distinct from s.analysis_consent_version then s.analysis_consent_at := now(); end if;
  else
    s.analysis_consent_version := null;
  end if;
  if p_patch ? 'audioConsentEnabled' then s.audio_consent_enabled := bobby_brief_jbool(p_patch, 'audioConsentEnabled'); end if;
  if p_patch ? 'audioConsentVersion' then s.audio_consent_version := bobby_brief_jversion(p_patch, 'audioConsentVersion'); end if;
  if s.audio_consent_enabled then
    if s.audio_consent_version is null then perform bobby_brief_bad('audioConsentVersion'); end if;
    if not o.audio_consent_enabled or o.audio_consent_version is distinct from s.audio_consent_version then s.audio_consent_at := now(); end if;
  else
    s.audio_consent_version := null;
  end if;

  update bobby_brief_settings set
    revision = o.revision + 1, opening_enabled = s.opening_enabled, close_enabled = s.close_enabled, weekly_enabled = s.weekly_enabled,
    language = s.language, companion_id = s.companion_id, assets = s.assets,
    analysis_consent_enabled = s.analysis_consent_enabled, analysis_consent_version = s.analysis_consent_version, analysis_consent_at = s.analysis_consent_at,
    audio_consent_enabled = s.audio_consent_enabled, audio_consent_version = s.audio_consent_version, audio_consent_at = s.audio_consent_at,
    updated_at = now()
  where identity_id = p_identity;

  foreach c in array array['morning', 'close', 'weekly'] loop
    if bobby_brief_cadence_on(o, c) and not bobby_brief_cadence_on(s, c) then
      update bobby_briefs set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
        where identity_id = p_identity and cadence = c and state in ('pending', 'preparing');
      update bobby_brief_outbox ob set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
        from bobby_briefs b
        where ob.brief_id = b.id and b.identity_id = p_identity and b.cadence = c and ob.state in ('pending', 'claimed');
    elsif not bobby_brief_cadence_on(o, c) and bobby_brief_cadence_on(s, c) then
      update bobby_briefs set state = 'pending', updated_at = now()
        where identity_id = p_identity and cadence = c and state = 'cancelled' and content is null and push_expires_at > now();
    end if;
  end loop;

  if o.analysis_consent_enabled and not s.analysis_consent_enabled then
    perform bobby_brief_privacy_bump(p_identity, 'analysis_consent_withdrawn', false);
  end if;
  return jsonb_build_object('ok', true, 'settings', bobby_brief_settings_json(p_identity));
end;
$$;

create or replace function public.bobby_brief_shared_claim(p_cadence text, p_period_key text, p_language text, p_worker text,
  p_lease_seconds int, p_max_attempts int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_shared; v_attempts int;
begin
  if p_cadence not in ('morning', 'close', 'weekly') or p_language not in ('en', 'es', 'fr', 'pt', 'pt-BR', 'it', 'de') then perform bobby_brief_bad('arguments'); end if;
  if coalesce(length(p_worker), 0) not between 1 and 64 or coalesce(p_lease_seconds, 0) not between 5 and 900 or coalesce(p_max_attempts, 0) < 1 then
    perform bobby_brief_bad('lease');
  end if;
  insert into bobby_brief_shared (cadence, period_key, language) values (p_cadence, p_period_key, p_language)
    on conflict (cadence, period_key, language) do nothing;
  select * into r from bobby_brief_shared where cadence = p_cadence and period_key = p_period_key and language = p_language for update skip locked;
  if not found then return jsonb_build_object('state', 'busy'); end if;
  if r.state = 'ready' then return jsonb_build_object('state', 'ready', 'id', r.id, 'narrative', r.narrative, 'evidence', r.evidence); end if;
  if r.state = 'failed' then return jsonb_build_object('state', 'failed', 'id', r.id); end if;
  if r.state = 'preparing' and r.lease_expires_at > now() then return jsonb_build_object('state', 'busy'); end if;
  v_attempts := r.attempts + case when r.state = 'preparing' then 1 else 0 end;
  if v_attempts >= p_max_attempts then
    update bobby_brief_shared set state = 'failed', attempts = v_attempts, lease_owner = null, lease_expires_at = null,
        last_error = coalesce(last_error, 'attempts'), updated_at = now() where id = r.id;
    return jsonb_build_object('state', 'failed', 'id', r.id);
  end if;
  update bobby_brief_shared set state = 'preparing', attempts = v_attempts, fence = fence + 1, lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    where id = r.id returning fence into r.fence;
  return jsonb_build_object('state', 'claimed', 'id', r.id, 'fence', r.fence, 'attempts', v_attempts);
end;
$$;

commit;
