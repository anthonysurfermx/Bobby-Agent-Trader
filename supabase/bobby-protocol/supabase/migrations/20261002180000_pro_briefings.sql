-- Bobby Pro market briefings (build 53, 2026-10-02). Contract: docs/product/pro-market-briefings-implementation.md §3;
-- the typed client is api/_lib/briefings/db.ts (camelCase JSON, {ok, code} results).
--
-- What lives here
--   · bobby_brief_settings           one row per account: three cadence switches, language, companion, followed assets,
--                                    analysis/audio consent (+ version, accepted-at) and privacy_epoch. Revisioned (CAS).
--   · bobby_brief_shared             the shared, non-personal evidence + narrative per (cadence, period, language).
--   · bobby_briefs                   one report per (account, cadence, period): lease/fence, the settings frozen at claim,
--                                    immutable content once ready, uses_memory + memory_assets (which remembered symbols
--                                    shaped it, so a "forget" can withdraw exactly those reports).
--   · bobby_push_devices             account-bound installations: encrypted APNs token, keyed fingerprint, binding_revision,
--                                    credential verifier (never the credential). One active owner per token/installation.
--   · bobby_brief_outbox             one delivery intent per (report, installation), stable apns_id/collapse_id, fenced.
--   · bobby_brief_provider_attempts  every paid HTTP attempt: reserved → dispatched → settled | no_charge | unknown,
--                                    reconciled to released | settled_assumed. No personal data (work_ref is a shared key).
--   · bobby_brief_audio(+_links)     shared narration audio keyed by sha256 cache key; links tie a report segment to it.
--   · bobby_brief_idempotency        request receipts (sealed by the API) per (account, scope, key).
--
-- Invariants
--   · Leases + fencing: every claim increments `fence` and sets lease_owner/lease_expires_at; every commit, publish and
--     result requires `fence = p_fence and lease_expires_at > now()` (a stale or late worker can never commit). Claims
--     are single statements (short transactions) over `for update skip locked`.
--   · Replayed cron = no second report: unique (identity_id, cadence, period_key) and (brief_id, installation_id).
--   · Binding revision is a fenced delivery precondition, not a delivery identity. Same-owner token rotation re-fences
--     unsent rows to the new revision (D7); an owner change cancels the previous owner's unsent rows.
--   · Budget: reservations are serialized by one advisory lock; an `unknown` attempt blocks its work item until
--     reconciliation assumes the charge (D8).
--   · Privacy: pausing/deleting memory, forgetting an asset or withdrawing analysis consent bumps privacy_epoch, fences
--     in-flight personal preparation and withdraws/purges memory-based content (triggers below + settings_patch).
--   · Pro is always the live bobby_is_pro answer (subscription or unexpired grant), checked at seed, claim, publish,
--     dispatch and read. Never a cached flag.
--
-- Access. The Auth project may differ from the data project, so access is API-only: RLS on with no policies, every
-- table and function revoked from public, anon and authenticated BY NAME (Supabase's default ACLs grant to the
-- latter two and `revoke ... from public` does not remove them — 20260928210000), granted to service_role. Service
-- credentials bypass RLS, so every account-facing RPC takes the server-derived identity and applies an explicit
-- owner predicate. Functions are security invoker with a pinned search_path.
--
-- Retention (D11, proposals): enforced by bobby_brief_purge with parameters from api/_lib/briefings/config.ts
-- (reports 90 d, audio 14 d, outbox 30 d, provider attempts 400 d, revoked/invalid devices 30 d, idempotency 24 h,
-- shared evidence 120 d) — nothing is hard-coded here. Deleting the identity cascades every per-account row.
-- Idempotent: applied twice in scripts/test-briefings-pg.mts.

-- ============================================================ tables

create table if not exists public.bobby_brief_settings (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  revision int not null default 0 check (revision >= 0),
  opening_enabled boolean not null default false,
  close_enabled boolean not null default false,
  weekly_enabled boolean not null default false,
  language text not null default 'en' check (language in ('en', 'es')),
  companion_id text check (companion_id ~ '^[a-z0-9_-]{1,32}$'),
  assets text[] not null default '{}' check (cardinality(assets) <= 6),
  analysis_consent_enabled boolean not null default false,
  analysis_consent_version int check (analysis_consent_version between 1 and 1000),
  analysis_consent_at timestamptz,
  audio_consent_enabled boolean not null default false,
  audio_consent_version int check (audio_consent_version between 1 and 1000),
  audio_consent_at timestamptz,
  privacy_epoch int not null default 0 check (privacy_epoch >= 0),
  privacy_reason text,
  privacy_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Seeding scans the switched-on accounts of one cadence.
create index if not exists bobby_brief_settings_opening_idx on public.bobby_brief_settings (identity_id) where opening_enabled;
create index if not exists bobby_brief_settings_close_idx on public.bobby_brief_settings (identity_id) where close_enabled;
create index if not exists bobby_brief_settings_weekly_idx on public.bobby_brief_settings (identity_id) where weekly_enabled;

create table if not exists public.bobby_brief_shared (
  id uuid primary key default gen_random_uuid(),
  cadence text not null check (cadence in ('morning', 'close', 'weekly')),
  period_key text not null check (period_key ~ '^\d{4}-\d{2}-\d{2}(_\d{4}-\d{2}-\d{2})?$'),
  language text not null check (language in ('en', 'es')),
  state text not null default 'pending' check (state in ('pending', 'preparing', 'ready', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  fence bigint not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  evidence jsonb,
  narrative jsonb,
  data_as_of timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (cadence, period_key, language)
);
create index if not exists bobby_brief_shared_lease_idx on public.bobby_brief_shared (lease_expires_at) where state = 'preparing';
create index if not exists bobby_brief_shared_created_idx on public.bobby_brief_shared (created_at);

create table if not exists public.bobby_briefs (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  cadence text not null check (cadence in ('morning', 'close', 'weekly')),
  period_key text not null check (period_key ~ '^\d{4}-\d{2}-\d{2}(_\d{4}-\d{2}-\d{2})?$'),
  period_start timestamptz not null,
  period_end timestamptz not null,
  scheduled_at timestamptz not null,
  push_expires_at timestamptz not null,
  calendar_version text not null,
  policy_version text not null,
  state text not null default 'pending'
    check (state in ('pending', 'preparing', 'ready', 'failed', 'skipped', 'cancelled', 'withdrawn')),
  attempts int not null default 0 check (attempts >= 0),
  fence bigint not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  -- Frozen at claim (FrozenSettings): what the report was prepared under.
  frozen jsonb,
  settings_revision int,
  privacy_epoch int,
  language text check (language in ('en', 'es')),
  voice text,
  companion_id text,
  shared_id uuid references public.bobby_brief_shared(id) on delete set null,
  content jsonb,
  content_version int,
  quality text check (quality in ('full', 'partial', 'facts_only')),
  data_as_of timestamptz,
  uses_memory boolean not null default false,
  memory_assets text[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  withdrawn_at timestamptz,
  constraint bobby_briefs_period_order check (period_start < period_end and scheduled_at < push_expires_at),
  constraint bobby_briefs_ready_has_content check (state <> 'ready' or (content is not null and content_version is not null and language is not null)),
  unique (identity_id, cadence, period_key)
);
create index if not exists bobby_briefs_identity_idx on public.bobby_briefs (identity_id);
-- Due preparation for one period.
create index if not exists bobby_briefs_work_idx on public.bobby_briefs (cadence, period_key, created_at) where state in ('pending', 'preparing');
-- Inbox keyset (scheduled_at desc, id desc) over the owner's ready reports.
create index if not exists bobby_briefs_inbox_idx on public.bobby_briefs (identity_id, scheduled_at desc, id desc) where state = 'ready';
-- Delivery window scan for the outbox fill.
create index if not exists bobby_briefs_dispatch_idx on public.bobby_briefs (scheduled_at) where state = 'ready';
create index if not exists bobby_briefs_lease_idx on public.bobby_briefs (lease_expires_at) where state = 'preparing';
create index if not exists bobby_briefs_deadline_idx on public.bobby_briefs (push_expires_at) where state = 'pending';
create index if not exists bobby_briefs_shared_idx on public.bobby_briefs (shared_id);
create index if not exists bobby_briefs_created_idx on public.bobby_briefs (created_at);

create table if not exists public.bobby_push_devices (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  installation_id uuid not null,
  token_ciphertext text not null check (length(token_ciphertext) between 8 and 2048),
  token_fingerprint text not null check (token_fingerprint ~ '^[0-9a-f]{64}$'),
  environment text not null check (environment in ('production', 'sandbox')),
  topic text not null check (topic ~ '^[A-Za-z0-9.-]{1,128}$'),
  permission text not null check (permission in ('notDetermined', 'denied', 'authorized', 'provisional')),
  app_build int not null check (app_build between 0 and 1000000),
  credential_verifier text not null check (credential_verifier ~ '^[0-9a-f]{64}$'),
  binding_revision bigint not null default 1 check (binding_revision >= 1),
  status text not null default 'active' check (status in ('active', 'revoked', 'invalid')),
  invalid_reason text,
  revoked_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists bobby_push_devices_token_active_key on public.bobby_push_devices (token_fingerprint, topic, environment) where status = 'active';
create unique index if not exists bobby_push_devices_installation_active_key on public.bobby_push_devices (installation_id) where status = 'active';
create index if not exists bobby_push_devices_identity_idx on public.bobby_push_devices (identity_id);
create index if not exists bobby_push_devices_identity_active_idx on public.bobby_push_devices (identity_id) where status = 'active';
create index if not exists bobby_push_devices_retired_idx on public.bobby_push_devices (updated_at) where status <> 'active';

create table if not exists public.bobby_brief_outbox (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.bobby_briefs(id) on delete cascade,
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  device_id uuid not null references public.bobby_push_devices(id) on delete cascade,
  installation_id uuid not null,
  -- The device binding this intent is for, and the one the current claimant sent under (an invalid_token answer
  -- may only invalidate the binding it was actually sent to).
  binding_revision bigint not null,
  claim_binding_revision bigint,
  state text not null default 'pending' check (state in ('pending', 'claimed', 'sent', 'failed', 'expired', 'cancelled')),
  apns_id uuid not null default gen_random_uuid(),
  collapse_id text not null,
  language text not null check (language in ('en', 'es')),
  due_at timestamptz not null,
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts >= 0),
  fence bigint not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  apns_status int,
  last_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, installation_id)
);
create index if not exists bobby_brief_outbox_due_idx on public.bobby_brief_outbox (due_at) where state = 'pending';
create index if not exists bobby_brief_outbox_lease_idx on public.bobby_brief_outbox (lease_expires_at) where state = 'claimed';
create index if not exists bobby_brief_outbox_identity_idx on public.bobby_brief_outbox (identity_id);
create index if not exists bobby_brief_outbox_device_idx on public.bobby_brief_outbox (device_id);
create index if not exists bobby_brief_outbox_created_idx on public.bobby_brief_outbox (created_at);

create table if not exists public.bobby_brief_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('llm', 'tts')),
  work_ref text not null check (work_ref ~ '^[A-Za-z0-9:_.-]{1,160}$'),
  provider text not null check (provider ~ '^[a-z0-9_-]{1,32}$'),
  model text not null check (model ~ '^[A-Za-z0-9._:-]{1,64}$'),
  worker text not null check (length(worker) between 1 and 64),
  state text not null default 'reserved'
    check (state in ('reserved', 'dispatched', 'settled', 'no_charge', 'unknown', 'settled_assumed', 'released')),
  reserve_usd numeric(12, 6) not null check (reserve_usd > 0),
  actual_usd numeric(12, 6),
  tokens_in int,
  tokens_out int,
  chars int,
  latency_ms int,
  estimated boolean not null default false,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists bobby_brief_attempts_open_idx on public.bobby_brief_provider_attempts (kind, updated_at) where state in ('reserved', 'dispatched', 'unknown');
create index if not exists bobby_brief_attempts_work_idx on public.bobby_brief_provider_attempts (work_ref);
create index if not exists bobby_brief_attempts_created_idx on public.bobby_brief_provider_attempts (created_at);

create table if not exists public.bobby_brief_audio (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique check (cache_key ~ '^[0-9a-f]{64}$'),
  voice text not null check (voice ~ '^[a-z0-9_-]{1,32}$'),
  language text not null check (language in ('en', 'es')),
  state text not null default 'queued' check (state in ('queued', 'processing', 'ready', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  fence bigint not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  storage_path text check (storage_path ~ '^[A-Za-z0-9/_.-]{1,255}$'),
  bytes int check (bytes >= 0),
  mime text not null default 'audio/mpeg',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  last_used_at timestamptz not null default now(),
  constraint bobby_brief_audio_ready_has_path check (state <> 'ready' or storage_path is not null)
);
create index if not exists bobby_brief_audio_lease_idx on public.bobby_brief_audio (lease_expires_at) where state = 'processing';
create index if not exists bobby_brief_audio_used_idx on public.bobby_brief_audio (last_used_at);

create table if not exists public.bobby_brief_audio_links (
  brief_id uuid not null references public.bobby_briefs(id) on delete cascade,
  segment int not null check (segment between 0 and 3),
  audio_id uuid not null references public.bobby_brief_audio(id) on delete cascade,
  content_version int not null,
  created_at timestamptz not null default now(),
  primary key (brief_id, segment)
);
create index if not exists bobby_brief_audio_links_audio_idx on public.bobby_brief_audio_links (audio_id);

create table if not exists public.bobby_brief_idempotency (
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  scope text not null check (scope ~ '^[a-z_-]{1,32}$'),
  idem_key text not null check (idem_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'in_progress' check (state in ('in_progress', 'done')),
  status int,
  response text check (length(response) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (identity_id, scope, idem_key)
);
create index if not exists bobby_brief_idempotency_expires_idx on public.bobby_brief_idempotency (expires_at);

alter table public.bobby_brief_settings enable row level security;
alter table public.bobby_brief_shared enable row level security;
alter table public.bobby_briefs enable row level security;
alter table public.bobby_push_devices enable row level security;
alter table public.bobby_brief_outbox enable row level security;
alter table public.bobby_brief_provider_attempts enable row level security;
alter table public.bobby_brief_audio enable row level security;
alter table public.bobby_brief_audio_links enable row level security;
alter table public.bobby_brief_idempotency enable row level security;
revoke all on public.bobby_brief_settings, public.bobby_brief_shared, public.bobby_briefs, public.bobby_push_devices,
  public.bobby_brief_outbox, public.bobby_brief_provider_attempts, public.bobby_brief_audio, public.bobby_brief_audio_links,
  public.bobby_brief_idempotency from public, anon, authenticated;
grant all on public.bobby_brief_settings, public.bobby_brief_shared, public.bobby_briefs, public.bobby_push_devices,
  public.bobby_brief_outbox, public.bobby_brief_provider_attempts, public.bobby_brief_audio, public.bobby_brief_audio_links,
  public.bobby_brief_idempotency to service_role;

-- Private audio bucket (D2). Local PostgreSQL has no storage schema; Supabase does. No storage policies: only the
-- service role reads or writes it, and the API streams it after authorizing the caller.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public) values ('briefing-audio', 'briefing-audio', false) on conflict (id) do nothing$q$;
  end if;
end $$;

-- ============================================================ helpers

create or replace function public.bobby_brief_bad(p_what text)
returns void language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  raise exception 'bobby_brief: invalid %', p_what using errcode = '22023';
end;
$$;

create or replace function public.bobby_brief_cadence_on(s public.bobby_brief_settings, p_cadence text)
returns boolean language sql immutable security invoker set search_path = public, pg_temp as $$
  select case p_cadence when 'morning' then s.opening_enabled when 'close' then s.close_enabled when 'weekly' then s.weekly_enabled else false end
$$;

-- Analysis consent counts only when enabled at a real version (the API also checks the current version).
create or replace function public.bobby_brief_analysis_ok(s public.bobby_brief_settings)
returns boolean language sql immutable security invoker set search_path = public, pg_temp as $$
  select coalesce(s.analysis_consent_enabled and s.analysis_consent_version >= 1, false)
$$;

create or replace function public.bobby_brief_settings_json(p_identity uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare s bobby_brief_settings;
begin
  select * into s from bobby_brief_settings where identity_id = p_identity;
  if not found then
    return jsonb_build_object('revision', 0, 'openingEnabled', false, 'closeEnabled', false, 'weeklyEnabled', false,
      'language', 'en', 'companionId', null, 'assets', '[]'::jsonb, 'analysisConsentEnabled', false,
      'analysisConsentVersion', null, 'audioConsentEnabled', false, 'audioConsentVersion', null, 'privacyEpoch', 0);
  end if;
  return jsonb_build_object('revision', s.revision, 'openingEnabled', s.opening_enabled, 'closeEnabled', s.close_enabled,
    'weeklyEnabled', s.weekly_enabled, 'language', s.language, 'companionId', s.companion_id, 'assets', to_jsonb(s.assets),
    'analysisConsentEnabled', s.analysis_consent_enabled, 'analysisConsentVersion', s.analysis_consent_version,
    'audioConsentEnabled', s.audio_consent_enabled, 'audioConsentVersion', s.audio_consent_version, 'privacyEpoch', s.privacy_epoch);
end;
$$;

-- Strict JSON readers for settings_patch (defense in depth behind the API's zod schema).
create or replace function public.bobby_brief_jbool(p jsonb, k text)
returns boolean language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p -> k) <> 'boolean' then perform bobby_brief_bad(k); end if;
  return (p ->> k)::boolean;
end;
$$;

create or replace function public.bobby_brief_jversion(p jsonb, k text)
returns int language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'number' or (p ->> k) !~ '^[0-9]{1,4}$' or (p ->> k)::int not between 1 and 1000 then perform bobby_brief_bad(k); end if;
  return (p ->> k)::int;
end;
$$;

-- ============================================================ settings

create or replace function public.bobby_brief_settings_get(p_identity uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select bobby_brief_settings_json(p_identity)
$$;

-- CAS under `for update` (a revision-0 row is inserted first when absent, so two racing first saves serialize on it).
-- Disabling a cadence cancels its pending/preparing reports and unsent pushes (ready reports stay readable);
-- re-enabling it revives the cancelled, never-prepared reports of a still-open window. Withdrawing analysis consent
-- bumps the privacy epoch.
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
    if jsonb_typeof(p_patch -> 'language') <> 'string' or (p_patch ->> 'language') not in ('en', 'es') then perform bobby_brief_bad('language'); end if;
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

-- ============================================================ privacy

-- privacy_epoch + 1 (only for accounts with a settings row). In-flight preparation is fenced and re-queued without
-- content; memory-based reports not yet due are withdrawn; with p_purge_memory_content every memory-based report is
-- withdrawn and its content nulled. Unsent pushes of memory-based or no-longer-ready reports are cancelled.
create or replace function public.bobby_brief_privacy_bump(p_identity uuid, p_reason text, p_purge_memory_content boolean)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare v_epoch int; v_requeued int; v_withdrawn int; v_cancelled int;
begin
  if p_reason is null or p_reason not in ('memory_paused', 'memory_deleted', 'memory_forgotten', 'analysis_consent_withdrawn') then
    perform bobby_brief_bad('reason');
  end if;
  update bobby_brief_settings set privacy_epoch = privacy_epoch + 1, privacy_reason = p_reason, privacy_changed_at = now(), updated_at = now()
    where identity_id = p_identity returning privacy_epoch into v_epoch;
  if not found then return jsonb_build_object('bumped', false); end if;

  update bobby_briefs set state = 'pending', fence = fence + 1, lease_owner = null, lease_expires_at = null, frozen = null,
      content = null, content_version = null, quality = null, uses_memory = false, memory_assets = '{}', updated_at = now()
    where identity_id = p_identity and state = 'preparing';
  get diagnostics v_requeued = row_count;

  update bobby_briefs set state = 'withdrawn', content = null, memory_assets = '{}', withdrawn_at = now(), updated_at = now()
    where identity_id = p_identity and uses_memory and state in ('ready', 'withdrawn')
      and (p_purge_memory_content or scheduled_at > now());
  get diagnostics v_withdrawn = row_count;

  update bobby_brief_outbox ob set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
    from bobby_briefs b
    where ob.brief_id = b.id and b.identity_id = p_identity and ob.state in ('pending', 'claimed') and (b.uses_memory or b.state <> 'ready');
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object('bumped', true, 'privacyEpoch', v_epoch, 'requeued', v_requeued, 'withdrawn', v_withdrawn, 'cancelled', v_cancelled);
end;
$$;

-- An explicit "forget this asset": bump, then withdraw and purge every report that this symbol shaped.
create or replace function public.bobby_brief_memory_forgotten(p_identity uuid, p_symbol text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r jsonb; v_purged int;
begin
  r := bobby_brief_privacy_bump(p_identity, 'memory_forgotten', false);
  if not (r ->> 'bumped')::boolean then return r; end if;
  update bobby_briefs set state = 'withdrawn', content = null, memory_assets = '{}', withdrawn_at = coalesce(withdrawn_at, now()), updated_at = now()
    where identity_id = p_identity and p_symbol = any(memory_assets) and state in ('ready', 'withdrawn');
  get diagnostics v_purged = row_count;
  update bobby_brief_outbox ob set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
    from bobby_briefs b
    where ob.brief_id = b.id and b.identity_id = p_identity and b.state = 'withdrawn' and ob.state in ('pending', 'claimed');
  return r || jsonb_build_object('purged', v_purged);
end;
$$;

-- Memory hooks. During an identity deletion the cascade removes prefs/assets after the identity row: nothing to bump.
create or replace function public.bobby_brief_prefs_hook()
returns trigger language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from bobby_identities where id = old.identity_id) then
      perform bobby_brief_privacy_bump(old.identity_id, 'memory_deleted', true);
    end if;
    return null;
  end if;
  if old.memory_enabled and not new.memory_enabled then
    perform bobby_brief_privacy_bump(new.identity_id, 'memory_paused', false);
  end if;
  if (old.horizon is not null or old.experience is not null or old.risk is not null)
     and new.horizon is null and new.experience is null and new.risk is null then
    perform bobby_brief_privacy_bump(new.identity_id, 'memory_deleted', true);
  end if;
  return null;
end;
$$;

create or replace function public.bobby_brief_assets_hook()
returns trigger language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if exists (select 1 from bobby_identities where id = old.identity_id) then
    perform bobby_brief_memory_forgotten(old.identity_id, old.symbol);
  end if;
  return null;
end;
$$;

drop trigger if exists bobby_brief_prefs_update on public.bobby_user_prefs;
create trigger bobby_brief_prefs_update after update on public.bobby_user_prefs
  for each row execute function public.bobby_brief_prefs_hook();
drop trigger if exists bobby_brief_prefs_delete on public.bobby_user_prefs;
create trigger bobby_brief_prefs_delete after delete on public.bobby_user_prefs
  for each row execute function public.bobby_brief_prefs_hook();
-- Only an explicit forget: the 90-day retention sweep deletes older rows and must never purge reports.
drop trigger if exists bobby_brief_assets_delete on public.bobby_user_assets;
create trigger bobby_brief_assets_delete after delete on public.bobby_user_assets
  for each row when (old.last_asked_at >= now() - interval '90 days') execute function public.bobby_brief_assets_hook();

-- ============================================================ devices

create or replace function public.bobby_brief_device_args(p_token_ciphertext text, p_token_fingerprint text, p_environment text,
  p_topic text, p_permission text, p_app_build int, p_max_active int)
returns void language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if p_token_ciphertext is null or length(p_token_ciphertext) not between 8 and 2048 then perform bobby_brief_bad('token'); end if;
  if p_token_fingerprint is null or p_token_fingerprint !~ '^[0-9a-f]{64}$' then perform bobby_brief_bad('fingerprint'); end if;
  if p_environment is null or p_environment not in ('production', 'sandbox') then perform bobby_brief_bad('environment'); end if;
  if p_topic is null or p_topic !~ '^[A-Za-z0-9.-]{1,128}$' then perform bobby_brief_bad('topic'); end if;
  if p_permission is null or p_permission not in ('notDetermined', 'denied', 'authorized', 'provisional') then perform bobby_brief_bad('permission'); end if;
  if p_app_build is null or p_app_build not between 0 and 1000000 then perform bobby_brief_bad('appBuild'); end if;
  if p_max_active is null or p_max_active not between 1 and 50 then perform bobby_brief_bad('maxActive'); end if;
end;
$$;

-- First binding. An active binding of the same installation or token (any owner) is a generic conflict: taking it
-- over needs the installation proof (rebind). The per-identity advisory lock makes the device cap exact.
create or replace function public.bobby_push_device_register(p_identity uuid, p_installation uuid, p_token_ciphertext text,
  p_token_fingerprint text, p_environment text, p_topic text, p_permission text, p_app_build int, p_credential_verifier text, p_max_active int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_identity is null or p_installation is null then perform bobby_brief_bad('arguments'); end if;
  if p_credential_verifier is null or p_credential_verifier !~ '^[0-9a-f]{64}$' then perform bobby_brief_bad('verifier'); end if;
  perform bobby_brief_device_args(p_token_ciphertext, p_token_fingerprint, p_environment, p_topic, p_permission, p_app_build, p_max_active);
  perform pg_advisory_xact_lock(hashtext('bobby_push_device:' || p_identity::text));
  if exists (select 1 from bobby_push_devices where status = 'active'
             and (installation_id = p_installation or (token_fingerprint = p_token_fingerprint and topic = p_topic and environment = p_environment))) then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  if (select count(*) from bobby_push_devices where identity_id = p_identity and status = 'active') >= p_max_active then
    return jsonb_build_object('ok', false, 'code', 'device_limit');
  end if;
  begin
    insert into bobby_push_devices (identity_id, installation_id, token_ciphertext, token_fingerprint, environment, topic, permission,
      app_build, credential_verifier)
    values (p_identity, p_installation, p_token_ciphertext, p_token_fingerprint, p_environment, p_topic, p_permission, p_app_build, p_credential_verifier)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end;
  return jsonb_build_object('ok', true, 'registrationId', v_id, 'bindingRevision', 1);
end;
$$;

-- Token rotation / account switch, proven by the installation credential. Same owner: re-fence unsent intents to the
-- new revision (D7). Owner change: cancel the previous owner's unsent intents and bind p_identity (cap applies).
-- Always rotates the verifier and bumps the revision. Lock order (identity advisory lock, then the row) matches register.
create or replace function public.bobby_push_device_rebind(p_identity uuid, p_registration uuid, p_expected_revision bigint,
  p_proof_verifier text, p_new_verifier text, p_token_ciphertext text, p_token_fingerprint text, p_environment text, p_topic text,
  p_permission text, p_app_build int, p_max_active int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare d bobby_push_devices; v_rev bigint;
begin
  if p_identity is null or p_registration is null or p_expected_revision is null then perform bobby_brief_bad('arguments'); end if;
  if p_new_verifier is null or p_new_verifier !~ '^[0-9a-f]{64}$' then perform bobby_brief_bad('verifier'); end if;
  perform bobby_brief_device_args(p_token_ciphertext, p_token_fingerprint, p_environment, p_topic, p_permission, p_app_build, p_max_active);
  perform pg_advisory_xact_lock(hashtext('bobby_push_device:' || p_identity::text));
  select * into d from bobby_push_devices where id = p_registration for update;
  if not found or d.status = 'revoked' or p_proof_verifier is null or d.credential_verifier <> p_proof_verifier then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if d.binding_revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'bindingRevision', d.binding_revision);
  end if;
  if (d.identity_id <> p_identity or d.status <> 'active')
     and (select count(*) from bobby_push_devices where identity_id = p_identity and status = 'active' and id <> d.id) >= p_max_active then
    return jsonb_build_object('ok', false, 'code', 'device_limit');
  end if;
  v_rev := d.binding_revision + 1;
  if d.identity_id <> p_identity then
    update bobby_brief_outbox set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
      where device_id = d.id and state in ('pending', 'claimed');
  end if;
  begin
    update bobby_push_devices set identity_id = p_identity, token_ciphertext = p_token_ciphertext, token_fingerprint = p_token_fingerprint,
        environment = p_environment, topic = p_topic, permission = p_permission, app_build = p_app_build, credential_verifier = p_new_verifier,
        binding_revision = v_rev, status = 'active', invalid_reason = null, invalidated_at = null, updated_at = now(), last_seen_at = now()
      where id = d.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end;
  if d.identity_id = p_identity then
    update bobby_brief_outbox set binding_revision = v_rev, updated_at = now()
      where device_id = d.id and identity_id = p_identity and state in ('pending', 'claimed');
  end if;
  return jsonb_build_object('ok', true, 'registrationId', d.id, 'bindingRevision', v_rev);
end;
$$;

-- Owner-scoped, idempotent. Anything the caller cannot prove (missing, another owner, bad proof, already revoked) is
-- {state:'already'}: a late logout from account A can never detach B's rebound registration.
create or replace function public.bobby_push_device_revoke(p_identity uuid, p_registration uuid, p_expected_revision bigint, p_proof_verifier text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare d bobby_push_devices;
begin
  if p_identity is null or p_registration is null or p_expected_revision is null then perform bobby_brief_bad('arguments'); end if;
  select * into d from bobby_push_devices where id = p_registration for update;
  if not found or d.identity_id <> p_identity or d.status = 'revoked' or p_proof_verifier is null or d.credential_verifier <> p_proof_verifier then
    return jsonb_build_object('ok', true, 'state', 'already');
  end if;
  if d.binding_revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'bindingRevision', d.binding_revision);
  end if;
  update bobby_push_devices set status = 'revoked', revoked_at = now(), updated_at = now() where id = d.id;
  update bobby_brief_outbox set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
    where device_id = d.id and state in ('pending', 'claimed');
  return jsonb_build_object('ok', true, 'state', 'revoked');
end;
$$;

-- APNs said the token is dead: only for the binding it was sent under (a later rebind is untouched).
create or replace function public.bobby_push_device_invalidate(p_registration uuid, p_binding_revision bigint, p_reason text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  update bobby_push_devices set status = 'invalid', invalidated_at = now(), invalid_reason = left(coalesce(p_reason, 'invalid'), 48), updated_at = now()
    where id = p_registration and binding_revision = p_binding_revision and status = 'active';
  if not found then return jsonb_build_object('ok', true, 'invalidated', false); end if;
  update bobby_brief_outbox set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now()
    where device_id = p_registration and state in ('pending', 'claimed');
  return jsonb_build_object('ok', true, 'invalidated', true);
end;
$$;

-- ============================================================ idempotency

-- An in-progress receipt older than 60 s is an abandoned request (the API's device/voice work is far shorter):
-- the caller takes it over instead of being blocked until the TTL.
create or replace function public.bobby_brief_idem_begin(p_identity uuid, p_scope text, p_key text, p_digest text, p_ttl_seconds int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_idempotency; v_ttl int := least(greatest(coalesce(p_ttl_seconds, 86400), 60), 7 * 86400);
begin
  if p_identity is null or p_scope is null or p_key is null or p_digest is null then perform bobby_brief_bad('arguments'); end if;
  insert into bobby_brief_idempotency (identity_id, scope, idem_key, digest, expires_at)
    values (p_identity, p_scope, p_key, p_digest, now() + make_interval(secs => v_ttl))
    on conflict (identity_id, scope, idem_key) do nothing;
  if found then return jsonb_build_object('state', 'new'); end if;
  select * into r from bobby_brief_idempotency where identity_id = p_identity and scope = p_scope and idem_key = p_key for update;
  if not found then
    -- Purged between the insert and this read: a fresh receipt.
    insert into bobby_brief_idempotency (identity_id, scope, idem_key, digest, expires_at)
      values (p_identity, p_scope, p_key, p_digest, now() + make_interval(secs => v_ttl)) on conflict do nothing;
    return jsonb_build_object('state', case when found then 'new' else 'in_progress' end);
  end if;
  if r.expires_at <= now() then
    update bobby_brief_idempotency set digest = p_digest, state = 'in_progress', status = null, response = null, created_at = now(),
        updated_at = now(), expires_at = now() + make_interval(secs => v_ttl)
      where identity_id = p_identity and scope = p_scope and idem_key = p_key;
    return jsonb_build_object('state', 'new');
  end if;
  if r.digest <> p_digest then return jsonb_build_object('state', 'mismatch'); end if;
  if r.state = 'in_progress' then
    if r.updated_at < now() - interval '60 seconds' then
      update bobby_brief_idempotency set updated_at = now() where identity_id = p_identity and scope = p_scope and idem_key = p_key;
      return jsonb_build_object('state', 'new');
    end if;
    return jsonb_build_object('state', 'in_progress');
  end if;
  return jsonb_build_object('state', 'replay', 'status', r.status, 'response', r.response);
end;
$$;

create or replace function public.bobby_brief_idem_finish(p_identity uuid, p_scope text, p_key text, p_status int, p_response text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if p_status is null or p_status not between 100 and 599 then perform bobby_brief_bad('status'); end if;
  update bobby_brief_idempotency set state = 'done', status = p_status, response = p_response, updated_at = now()
    where identity_id = p_identity and scope = p_scope and idem_key = p_key and state = 'in_progress';
  return jsonb_build_object('ok', found);
end;
$$;

-- ============================================================ worker: seed / shared / personal

-- One pending report per switched-on Pro account; a replayed cron inserts nothing.
create or replace function public.bobby_brief_seed(p_cadence text, p_period_key text, p_period_start timestamptz, p_period_end timestamptz,
  p_scheduled_at timestamptz, p_push_expires_at timestamptz, p_calendar_version text, p_policy_version text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if p_cadence is null or p_cadence not in ('morning', 'close', 'weekly') then perform bobby_brief_bad('cadence'); end if;
  if p_period_key is null or p_period_key !~ (case when p_cadence = 'weekly' then '^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$' else '^\d{4}-\d{2}-\d{2}$' end) then
    perform bobby_brief_bad('period_key');
  end if;
  if p_period_start is null or p_period_end is null or p_period_start >= p_period_end
     or p_scheduled_at is null or p_push_expires_at is null or p_scheduled_at >= p_push_expires_at then
    perform bobby_brief_bad('period');
  end if;
  if coalesce(length(p_calendar_version), 0) not between 1 and 64 or coalesce(length(p_policy_version), 0) not between 1 and 64 then
    perform bobby_brief_bad('version');
  end if;
  insert into bobby_briefs (identity_id, cadence, period_key, period_start, period_end, scheduled_at, push_expires_at, calendar_version, policy_version)
  select s.identity_id, p_cadence, p_period_key, p_period_start, p_period_end, p_scheduled_at, p_push_expires_at, p_calendar_version, p_policy_version
    from bobby_brief_settings s
   where bobby_brief_cadence_on(s, p_cadence) and bobby_is_pro(s.identity_id)
  on conflict (identity_id, cadence, period_key) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('seeded', n);
end;
$$;

-- Insert-or-claim of the shared narrative row. A lease that expired without a commit counts as an attempt.
create or replace function public.bobby_brief_shared_claim(p_cadence text, p_period_key text, p_language text, p_worker text,
  p_lease_seconds int, p_max_attempts int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_shared; v_attempts int;
begin
  if p_cadence not in ('morning', 'close', 'weekly') or p_language not in ('en', 'es') then perform bobby_brief_bad('arguments'); end if;
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

create or replace function public.bobby_brief_shared_commit(p_id uuid, p_fence bigint, p_state text, p_evidence jsonb, p_narrative jsonb,
  p_data_as_of timestamptz, p_error text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_shared;
begin
  if p_state is null or p_state not in ('ready', 'retry', 'failed') then perform bobby_brief_bad('state'); end if;
  select * into r from bobby_brief_shared where id = p_id for update;
  if not found or r.state <> 'preparing' or r.fence <> p_fence or r.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'stale_fence');
  end if;
  if p_state = 'ready' then
    if p_narrative is null or jsonb_typeof(p_narrative) <> 'object' or p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
      perform bobby_brief_bad('narrative');
    end if;
    update bobby_brief_shared set state = 'ready', evidence = p_evidence, narrative = p_narrative, data_as_of = p_data_as_of,
        lease_owner = null, lease_expires_at = null, last_error = null, ready_at = now(), updated_at = now() where id = p_id;
  elsif p_state = 'retry' then
    update bobby_brief_shared set state = 'pending', attempts = attempts + 1, evidence = coalesce(p_evidence, evidence),
        lease_owner = null, lease_expires_at = null, last_error = left(p_error, 64), updated_at = now() where id = p_id;
  else
    update bobby_brief_shared set state = 'failed', lease_owner = null, lease_expires_at = null, last_error = left(p_error, 64),
        updated_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Frequent assets the composer may use: asked at least twice within 90 days, most recent first, at most 6.
create or replace function public.bobby_brief_frequent_assets(p_identity uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x.symbol order by x.last_asked_at desc, x.symbol), '[]'::jsonb)
    from (select symbol, last_asked_at from bobby_user_assets
           where identity_id = p_identity and asks >= 2 and last_asked_at >= now() - interval '90 days'
           order by last_asked_at desc, symbol limit 6) x
$$;

-- Memory is offered only with analysis consent and memory not paused (the TS layer also checks BOBBY_BRIEFINGS_MEMORY).
create or replace function public.bobby_brief_memory_for(s public.bobby_brief_settings)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare pr record;
begin
  if not bobby_brief_analysis_ok(s) then return null; end if;
  select experience, risk, memory_enabled into pr from bobby_user_prefs where identity_id = s.identity_id;
  if not coalesce(pr.memory_enabled, true) then return null; end if;
  return jsonb_build_object('experience', pr.experience, 'explainRiskDepth', pr.risk, 'frequentAssets', bobby_brief_frequent_assets(s.identity_id));
end;
$$;

-- Union of the followed (+ consented frequent) assets of the period's open reports in one language. Pending reports
-- use the current settings; preparing ones what was frozen. The TS layer intersects with the supported universe.
create or replace function public.bobby_brief_needed_assets(p_cadence text, p_period_key text, p_language text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with open_ as (
    select b.state, b.frozen, s
      from bobby_briefs b join bobby_brief_settings s on s.identity_id = b.identity_id
     where b.cadence = p_cadence and b.period_key = p_period_key and b.state in ('pending', 'preparing')
       and case when b.state = 'preparing' and b.language is not null then b.language else s.language end = p_language
  ), syms as (
    select unnest(case when o.state = 'preparing' and o.frozen is not null
                       then array(select jsonb_array_elements_text(o.frozen -> 'assets')) else (o.s).assets end) as symbol
      from open_ o
    union
    select jsonb_array_elements_text(bobby_brief_memory_for(o.s) -> 'frequentAssets') from open_ o
  )
  select jsonb_build_object('symbols', coalesce(jsonb_agg(symbol order by symbol), '[]'::jsonb)) from (select distinct symbol from syms where symbol is not null) d
$$;

-- Languages of the period's open reports (pending: current settings; preparing: what was frozen), so the worker
-- writes (and pays for) a shared narrative only in a language someone will read.
create or replace function public.bobby_brief_open_languages(p_cadence text, p_period_key text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('languages', coalesce(jsonb_agg(d.language order by d.language), '[]'::jsonb))
    from (select distinct case when b.state = 'preparing' and b.language is not null then b.language else s.language end as language
            from bobby_briefs b join bobby_brief_settings s on s.identity_id = b.identity_id
           where b.cadence = p_cadence and b.period_key = p_period_key and b.state in ('pending', 'preparing')) d
$$;

-- Claim ≤ p_limit due reports (pending, or preparing whose lease expired — counted as an attempt) with
-- `for update skip locked`. Opted-out owners → cancelled, non-Pro → skipped, past the push deadline → failed.
-- Freezes FrozenSettings per item; voice comes from the companion→voice map the TS config passes (single source).
create or replace function public.bobby_brief_claim(p_cadence text, p_period_key text, p_worker text, p_lease_seconds int, p_limit int,
  p_voices jsonb, p_default_voice text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  r record;
  s bobby_brief_settings;
  v_items jsonb := '[]'::jsonb;
  v_n int := 0;
  v_ids uuid[];
  v_lim int := least(greatest(coalesce(p_limit, 1), 1), 100);
  v_attempts int;
  v_voice text;
  v_frozen jsonb;
  v_fence bigint;
begin
  if p_cadence is null or p_cadence not in ('morning', 'close', 'weekly') or p_period_key is null then perform bobby_brief_bad('arguments'); end if;
  if coalesce(length(p_worker), 0) not between 1 and 64 or coalesce(p_lease_seconds, 0) not between 5 and 900 then perform bobby_brief_bad('lease'); end if;
  if p_voices is null or jsonb_typeof(p_voices) <> 'object' or coalesce(p_default_voice, '') !~ '^[a-z0-9_-]{1,32}$' then perform bobby_brief_bad('voices'); end if;
  -- Lock exactly the rows this call will resolve (a cursor would prefetch and hold more than it uses). Rows that
  -- resolve to cancelled/skipped/failed leave room for another bounded round.
  for v_round in 1..5 loop
    v_ids := array(select b.id from bobby_briefs b
       where b.cadence = p_cadence and b.period_key = p_period_key
         and (b.state = 'pending' or (b.state = 'preparing' and b.lease_expires_at <= now()))
       order by b.created_at, b.id
       limit v_lim - v_n
       for update of b skip locked);
    exit when cardinality(v_ids) = 0;
    for r in
      select b.id, b.identity_id, b.state, b.attempts, b.push_expires_at from bobby_briefs b where b.id = any(v_ids) order by b.created_at, b.id
    loop
      v_attempts := r.attempts + case when r.state = 'preparing' then 1 else 0 end;
      select * into s from bobby_brief_settings where identity_id = r.identity_id;
      if not found or not bobby_brief_cadence_on(s, p_cadence) then
        update bobby_briefs set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now() where id = r.id;
      elsif not bobby_is_pro(r.identity_id) then
        update bobby_briefs set state = 'skipped', lease_owner = null, lease_expires_at = null, updated_at = now() where id = r.id;
      elsif r.push_expires_at <= now() or v_attempts >= 3 then
        update bobby_briefs set state = 'failed', attempts = v_attempts, lease_owner = null, lease_expires_at = null,
            last_error = case when r.push_expires_at <= now() then 'deadline' else 'lease_expired' end, updated_at = now() where id = r.id;
      else
        v_voice := coalesce(case when s.companion_id is not null then p_voices ->> s.companion_id end, p_default_voice);
        if v_voice !~ '^[a-z0-9_-]{1,32}$' then v_voice := p_default_voice; end if;
        v_frozen := jsonb_build_object('settingsRevision', s.revision, 'privacyEpoch', s.privacy_epoch, 'language', s.language,
          'companionId', s.companion_id, 'voice', v_voice, 'assets', to_jsonb(s.assets),
          'analysisConsent', bobby_brief_analysis_ok(s), 'analysisConsentVersion', s.analysis_consent_version,
          'audioConsent', coalesce(s.audio_consent_enabled and s.audio_consent_version >= 1, false));
        update bobby_briefs set state = 'preparing', attempts = v_attempts, fence = fence + 1, lease_owner = p_worker,
            lease_expires_at = now() + make_interval(secs => p_lease_seconds), frozen = v_frozen, settings_revision = s.revision,
            privacy_epoch = s.privacy_epoch, language = s.language, voice = v_voice, companion_id = s.companion_id, updated_at = now()
          where id = r.id returning fence into v_fence;
        v_items := v_items || jsonb_build_array(jsonb_build_object('id', r.id, 'identityId', r.identity_id, 'fence', v_fence,
          'frozen', v_frozen, 'memory', bobby_brief_memory_for(s)));
        v_n := v_n + 1;
      end if;
    end loop;
    exit when v_n >= v_lim;
  end loop;
  return jsonb_build_object('items', v_items);
end;
$$;

-- Fenced publish. Re-validates the owner's Pro, the cadence switch and the privacy epoch frozen at claim.
create or replace function public.bobby_brief_publish(p_id uuid, p_fence bigint, p_shared_id uuid, p_content jsonb, p_quality text,
  p_data_as_of timestamptz, p_uses_memory boolean, p_memory_assets text[], p_settings_revision int, p_privacy_epoch int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare b bobby_briefs; s bobby_brief_settings; sh bobby_brief_shared;
begin
  select * into b from bobby_briefs where id = p_id for update;
  if not found or b.state <> 'preparing' or b.fence <> p_fence or b.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'stale_fence');
  end if;
  select * into sh from bobby_brief_shared where id = p_shared_id;
  if not found or sh.state <> 'ready' or sh.cadence <> b.cadence or sh.period_key <> b.period_key then perform bobby_brief_bad('shared'); end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 32768 then perform bobby_brief_bad('content'); end if;
  if p_quality is null or p_quality not in ('full', 'partial', 'facts_only') then perform bobby_brief_bad('quality'); end if;
  if coalesce(cardinality(p_memory_assets), 0) > 12
     or exists (select 1 from unnest(coalesce(p_memory_assets, '{}')) x where x is null or x !~ '^[A-Z0-9.-]{1,12}$') then
    perform bobby_brief_bad('memory_assets');
  end if;

  select * into s from bobby_brief_settings where identity_id = b.identity_id;
  if not bobby_is_pro(b.identity_id) then
    update bobby_briefs set state = 'skipped', lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
    return jsonb_build_object('ok', false, 'code', 'not_pro');
  end if;
  if s.identity_id is null or not bobby_brief_cadence_on(s, b.cadence) then
    update bobby_briefs set state = 'cancelled', lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
    return jsonb_build_object('ok', false, 'code', 'opted_out');
  end if;
  if s.privacy_epoch <> b.privacy_epoch or p_privacy_epoch is distinct from b.privacy_epoch then
    update bobby_briefs set state = 'pending', lease_owner = null, lease_expires_at = null, frozen = null, content = null,
        content_version = null, quality = null, uses_memory = false, memory_assets = '{}', updated_at = now() where id = p_id;
    return jsonb_build_object('ok', false, 'code', 'privacy_changed');
  end if;
  update bobby_briefs set state = 'ready', content = p_content, content_version = 1, quality = p_quality, data_as_of = p_data_as_of,
      shared_id = p_shared_id, uses_memory = coalesce(p_uses_memory, false),
      memory_assets = case when coalesce(p_uses_memory, false) then coalesce(p_memory_assets, '{}') else '{}' end,
      settings_revision = coalesce(p_settings_revision, settings_revision), lease_owner = null, lease_expires_at = null,
      last_error = null, ready_at = now(), updated_at = now()
    where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.bobby_brief_fail(p_id uuid, p_fence bigint, p_error text, p_final boolean)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare b bobby_briefs; v_state text;
begin
  select * into b from bobby_briefs where id = p_id for update;
  if not found or b.state <> 'preparing' or b.fence <> p_fence or b.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'stale_fence');
  end if;
  v_state := case when coalesce(p_final, false) or b.attempts + 1 >= 3 then 'failed' else 'pending' end;
  update bobby_briefs set state = v_state, attempts = b.attempts + 1, lease_owner = null, lease_expires_at = null,
      last_error = left(p_error, 64), updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- ============================================================ outbox

-- Intents for ready reports in their push window, owner Pro + cadence on, for the owner's active devices with an
-- allowed permission. A memory-based report additionally needs the privacy epoch it was prepared under (generic
-- reports are unaffected by an unrelated privacy change). Never a second intent per (report, installation).
create or replace function public.bobby_brief_outbox_fill(p_limit int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  insert into bobby_brief_outbox (brief_id, identity_id, device_id, installation_id, binding_revision, collapse_id, language, due_at, expires_at)
  select b.id, b.identity_id, d.id, d.installation_id, d.binding_revision, 'brief-' || b.id::text, b.language, b.scheduled_at, b.push_expires_at
    from bobby_briefs b
    join bobby_brief_settings s on s.identity_id = b.identity_id
    join bobby_push_devices d on d.identity_id = b.identity_id and d.status = 'active' and d.permission in ('authorized', 'provisional')
   where b.state = 'ready' and b.scheduled_at <= now() and b.push_expires_at > now()
     and bobby_brief_cadence_on(s, b.cadence)
     and (not b.uses_memory or s.privacy_epoch = b.privacy_epoch)
     and not exists (select 1 from bobby_brief_outbox o where o.brief_id = b.id and o.installation_id = d.installation_id)
     and bobby_is_pro(b.identity_id)
   order by b.scheduled_at, b.id
   limit least(greatest(coalesce(p_limit, 1), 1), 1000)
  on conflict (brief_id, installation_id) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end;
$$;

-- Expires overdue rows, then claims due pending rows (and claimed rows whose lease expired — an ambiguous attempt)
-- with `for update skip locked`, re-validating device binding, owner, Pro and cadence; anything stale → cancelled.
create or replace function public.bobby_brief_outbox_claim(p_worker text, p_lease_seconds int, p_limit int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  r bobby_brief_outbox;
  d bobby_push_devices;
  b bobby_briefs;
  s bobby_brief_settings;
  v_items jsonb := '[]'::jsonb;
  v_n int := 0;
  v_ids uuid[];
  v_lim int := least(greatest(coalesce(p_limit, 1), 1), 200);
  v_attempts int;
  v_fence bigint;
begin
  if coalesce(length(p_worker), 0) not between 1 and 64 or coalesce(p_lease_seconds, 0) not between 5 and 900 then perform bobby_brief_bad('lease'); end if;
  update bobby_brief_outbox set state = 'expired', lease_owner = null, lease_expires_at = null, updated_at = now()
    where id in (select id from bobby_brief_outbox
                  where expires_at <= now() and (state = 'pending' or (state = 'claimed' and lease_expires_at <= now()))
                  limit 500 for update skip locked);
  for v_round in 1..5 loop
    v_ids := array(select o.id from bobby_brief_outbox o
       where o.expires_at > now()
         and ((o.state = 'pending' and o.due_at <= now()) or (o.state = 'claimed' and o.lease_expires_at <= now()))
       order by o.due_at, o.id
       limit v_lim - v_n
       for update of o skip locked);
    exit when cardinality(v_ids) = 0;
    for r in select o.* from bobby_brief_outbox o where o.id = any(v_ids) order by o.due_at, o.id loop
      v_attempts := r.attempts + case when r.state = 'claimed' then 1 else 0 end;
      select * into d from bobby_push_devices where id = r.device_id;
      select * into b from bobby_briefs where id = r.brief_id;
      select * into s from bobby_brief_settings where identity_id = r.identity_id;
      if v_attempts >= 3 then
        update bobby_brief_outbox set state = 'failed', attempts = v_attempts, lease_owner = null, lease_expires_at = null,
            last_reason = 'attempts', updated_at = now() where id = r.id;
      elsif d.status is distinct from 'active' or d.identity_id <> r.identity_id or d.binding_revision <> r.binding_revision
         or d.permission not in ('authorized', 'provisional')
         or b.state is distinct from 'ready' or b.identity_id <> r.identity_id
         or s.identity_id is null or not bobby_brief_cadence_on(s, b.cadence)
         or (b.uses_memory and s.privacy_epoch <> b.privacy_epoch)
         or not bobby_is_pro(r.identity_id) then
        update bobby_brief_outbox set state = 'cancelled', attempts = v_attempts, lease_owner = null, lease_expires_at = null,
            last_reason = 'stale', updated_at = now() where id = r.id;
      else
        update bobby_brief_outbox set state = 'claimed', attempts = v_attempts, fence = fence + 1, lease_owner = p_worker,
            lease_expires_at = now() + make_interval(secs => p_lease_seconds), claim_binding_revision = r.binding_revision, updated_at = now()
          where id = r.id returning fence into v_fence;
        v_items := v_items || jsonb_build_array(jsonb_build_object('id', r.id, 'fence', v_fence, 'briefId', r.brief_id, 'deviceId', r.device_id,
          'bindingRevision', r.binding_revision, 'tokenCiphertext', d.token_ciphertext, 'environment', d.environment, 'topic', d.topic,
          'apnsId', r.apns_id, 'collapseId', r.collapse_id, 'language', r.language, 'expiresAt', r.expires_at, 'attempts', v_attempts));
        v_n := v_n + 1;
      end if;
    end loop;
    exit when v_n >= v_lim;
  end loop;
  return jsonb_build_object('items', v_items);
end;
$$;

-- Fenced APNs outcome. accepted → sent; retry/ambiguous → pending later (same apns_id/collapse_id), failed at 3;
-- invalid_token → invalidates the binding it was sent under (if still current) and fails the row, unless the row was
-- re-fenced to a newer token meanwhile; config → pending, attempts unchanged (an APNs auth problem burns nothing).
create or replace function public.bobby_brief_outbox_result(p_id uuid, p_fence bigint, p_outcome text, p_apns_status int, p_reason text,
  p_retry_after_seconds int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_outbox; v_attempts int; v_state text; v_delay int;
begin
  if p_outcome is null or p_outcome not in ('accepted', 'retry', 'invalid_token', 'ambiguous', 'config') then perform bobby_brief_bad('outcome'); end if;
  select * into r from bobby_brief_outbox where id = p_id for update;
  if not found or r.state <> 'claimed' or r.fence <> p_fence or r.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'stale_fence');
  end if;
  v_delay := least(greatest(coalesce(p_retry_after_seconds, case when p_outcome = 'config' then 60 else 30 end), 5), 3600);
  if p_outcome = 'accepted' then
    v_state := 'sent';
    update bobby_brief_outbox set state = 'sent', attempts = attempts + 1, apns_status = p_apns_status, last_reason = null, sent_at = now(),
        lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
  elsif p_outcome = 'config' then
    v_state := 'pending';
    update bobby_brief_outbox set state = 'pending', due_at = now() + make_interval(secs => v_delay), apns_status = p_apns_status,
        last_reason = left(p_reason, 48), lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
  elsif p_outcome = 'invalid_token' then
    v_attempts := r.attempts + 1;
    perform bobby_push_device_invalidate(r.device_id, r.claim_binding_revision, coalesce(p_reason, 'invalid_token'));
    v_state := case when r.binding_revision <> r.claim_binding_revision and v_attempts < 3 then 'pending' else 'failed' end;
    update bobby_brief_outbox set state = v_state, attempts = v_attempts, apns_status = p_apns_status, last_reason = left(p_reason, 48),
        due_at = case when v_state = 'pending' then now() else due_at end, lease_owner = null, lease_expires_at = null, updated_at = now()
      where id = p_id;
  else
    v_attempts := r.attempts + 1;
    v_state := case when v_attempts >= 3 then 'failed' else 'pending' end;
    update bobby_brief_outbox set state = v_state, attempts = v_attempts, apns_status = p_apns_status, last_reason = left(p_reason, 48),
        due_at = now() + make_interval(secs => v_delay), lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- ============================================================ budget

-- Serialized by one advisory lock: concurrent reservations can never overshoot a cap or a slot count.
-- Conservative attempt cap: every attempt of the work item that was not released (never dispatched) counts,
-- including no_charge failures. An open attempt (reserved/dispatched/unknown) of the same work item blocks a new one.
create or replace function public.bobby_brief_budget_reserve(p_kind text, p_work_ref text, p_provider text, p_model text, p_reserve_usd numeric,
  p_day_cap numeric, p_month_cap numeric, p_max_slots int, p_max_attempts_per_work int, p_worker text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_day_total numeric; v_month_total numeric; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('bobby_brief_budget'));
  if p_day_cap is null or p_month_cap is null or p_day_cap <= 0 or p_month_cap <= 0 then
    return jsonb_build_object('ok', false, 'code', 'not_configured');
  end if;
  if p_kind is null or p_kind not in ('llm', 'tts') or p_work_ref is null or p_reserve_usd is null or p_reserve_usd <= 0 or p_reserve_usd > 1000
     or coalesce(p_max_slots, 0) < 1 or coalesce(p_max_attempts_per_work, 0) < 1 then
    perform bobby_brief_bad('reservation');
  end if;
  if exists (select 1 from bobby_brief_provider_attempts where work_ref = p_work_ref and state in ('reserved', 'dispatched', 'unknown')) then
    return jsonb_build_object('ok', false, 'code', 'work_unresolved');
  end if;
  if (select count(*) from bobby_brief_provider_attempts where work_ref = p_work_ref and state <> 'released') >= p_max_attempts_per_work then
    return jsonb_build_object('ok', false, 'code', 'attempts_exhausted');
  end if;
  if (select count(*) from bobby_brief_provider_attempts where kind = p_kind and state in ('reserved', 'dispatched', 'unknown')) >= p_max_slots then
    return jsonb_build_object('ok', false, 'code', 'slots_full');
  end if;
  select coalesce(sum(bobby_brief_attempt_cost(a)) filter (where a.created_at >= v_day), 0), coalesce(sum(bobby_brief_attempt_cost(a)), 0)
    into v_day_total, v_month_total
    from bobby_brief_provider_attempts a where a.created_at >= least(v_day, v_month);
  if v_day_total + p_reserve_usd >= p_day_cap or v_month_total + p_reserve_usd >= p_month_cap then
    return jsonb_build_object('ok', false, 'code', 'budget_exhausted');
  end if;
  insert into bobby_brief_provider_attempts (kind, work_ref, provider, model, worker, reserve_usd)
    values (p_kind, p_work_ref, p_provider, p_model, p_worker, p_reserve_usd) returning id into v_id;
  return jsonb_build_object('ok', true, 'attemptId', v_id);
end;
$$;

-- Exposure of one attempt: open reservations at their reserved amount, settled at the actual (or the reservation
-- when unknown), assumed settlements at the reservation; released and no_charge cost nothing.
create or replace function public.bobby_brief_attempt_cost(a public.bobby_brief_provider_attempts)
returns numeric language sql immutable security invoker set search_path = public, pg_temp as $$
  select case
    when a.state in ('reserved', 'dispatched', 'unknown', 'settled_assumed') then a.reserve_usd
    when a.state = 'settled' then coalesce(a.actual_usd, a.reserve_usd)
    else 0 end
$$;

create or replace function public.bobby_brief_budget_dispatch(p_attempt uuid)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  update bobby_brief_provider_attempts set state = 'dispatched', dispatched_at = now(), updated_at = now()
    where id = p_attempt and state = 'reserved';
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.bobby_brief_budget_settle(p_attempt uuid, p_outcome text, p_actual_usd numeric, p_tokens_in int, p_tokens_out int,
  p_chars int, p_latency_ms int, p_estimated boolean)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  if p_outcome is null or p_outcome not in ('settled', 'no_charge', 'unknown') then perform bobby_brief_bad('outcome'); end if;
  if p_actual_usd is not null and p_actual_usd < 0 then perform bobby_brief_bad('actual'); end if;
  update bobby_brief_provider_attempts set
      state = p_outcome,
      actual_usd = case p_outcome when 'settled' then coalesce(p_actual_usd, reserve_usd) when 'no_charge' then 0 else null end,
      tokens_in = p_tokens_in, tokens_out = p_tokens_out, chars = p_chars, latency_ms = p_latency_ms, estimated = coalesce(p_estimated, false),
      settled_at = case when p_outcome = 'unknown' then null else now() end, updated_at = now()
    where id = p_attempt and state in ('reserved', 'dispatched', 'unknown');
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.bobby_brief_budget_status()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with t as (
    select a.*, bobby_brief_attempt_cost(a) as cost,
           a.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' as today
      from bobby_brief_provider_attempts a
     where a.created_at >= least(date_trunc('day', now() at time zone 'utc'), date_trunc('month', now() at time zone 'utc')) at time zone 'utc'
        or a.state in ('reserved', 'dispatched', 'unknown')
  )
  select jsonb_build_object(
    'day', jsonb_build_object(
      'reserved', coalesce(sum(cost) filter (where today and state in ('reserved', 'dispatched', 'unknown')), 0),
      'settled', coalesce(sum(cost) filter (where today and state in ('settled', 'settled_assumed')), 0)),
    'month', jsonb_build_object(
      'reserved', coalesce(sum(cost) filter (where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc' and state in ('reserved', 'dispatched', 'unknown')), 0),
      'settled', coalesce(sum(cost) filter (where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc' and state in ('settled', 'settled_assumed')), 0)),
    'slots', jsonb_build_object(
      'llm', count(*) filter (where kind = 'llm' and state in ('reserved', 'dispatched', 'unknown')),
      'tts', count(*) filter (where kind = 'tts' and state in ('reserved', 'dispatched', 'unknown'))),
    'unknown', count(*) filter (where state = 'unknown'))
  from t
$$;

-- ============================================================ audio

-- Owner + ready + content version + segment checked; the voice and language must be the ones frozen in the report.
-- Upserts the shared audio row by cache key and links (report, segment) to it.
create or replace function public.bobby_brief_audio_request(p_identity uuid, p_brief uuid, p_content_version int, p_segment int, p_cache_key text,
  p_voice text, p_language text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare b bobby_briefs; v_id uuid; v_state text;
begin
  if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$' then perform bobby_brief_bad('cache_key'); end if;
  select * into b from bobby_briefs where id = p_brief and identity_id = p_identity and state = 'ready';
  if not found or p_segment is null or p_segment < 0
     or p_segment >= least(coalesce(jsonb_array_length(case when jsonb_typeof(b.content -> 'narrationSegments') = 'array' then b.content -> 'narrationSegments' end), 0), 4) then
    return jsonb_build_object('code', 'not_found');
  end if;
  if p_content_version is distinct from b.content_version or p_voice is distinct from b.voice or p_language is distinct from b.language then
    return jsonb_build_object('code', 'content_version_conflict');
  end if;
  insert into bobby_brief_audio (cache_key, voice, language) values (p_cache_key, p_voice, p_language)
    on conflict (cache_key) do update set last_used_at = now()
    returning id, state into v_id, v_state;
  insert into bobby_brief_audio_links (brief_id, segment, audio_id, content_version) values (b.id, p_segment, v_id, b.content_version)
    on conflict (brief_id, segment) do update set audio_id = excluded.audio_id, content_version = excluded.content_version;
  return jsonb_build_object('audioId', v_id, 'state', v_state);
end;
$$;

create or replace function public.bobby_brief_audio_claim(p_audio uuid, p_worker text, p_lease_seconds int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_audio; v_attempts int; v_fence bigint;
begin
  if coalesce(length(p_worker), 0) not between 1 and 64 or coalesce(p_lease_seconds, 0) not between 5 and 900 then perform bobby_brief_bad('lease'); end if;
  select * into r from bobby_brief_audio where id = p_audio for update skip locked;
  if not found then
    return jsonb_build_object('state', case when exists (select 1 from bobby_brief_audio where id = p_audio) then 'busy' else 'failed' end);
  end if;
  if r.state = 'ready' then return jsonb_build_object('state', 'ready'); end if;
  if r.state = 'failed' then return jsonb_build_object('state', 'failed'); end if;
  if r.state = 'processing' and r.lease_expires_at > now() then return jsonb_build_object('state', 'busy'); end if;
  v_attempts := r.attempts + case when r.state = 'processing' then 1 else 0 end;
  if v_attempts >= 3 then
    update bobby_brief_audio set state = 'failed', attempts = v_attempts, lease_owner = null, lease_expires_at = null,
        last_error = coalesce(last_error, 'attempts'), updated_at = now() where id = r.id;
    return jsonb_build_object('state', 'failed');
  end if;
  update bobby_brief_audio set state = 'processing', attempts = v_attempts, fence = fence + 1, lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    where id = r.id returning fence into v_fence;
  return jsonb_build_object('state', 'claimed', 'fence', v_fence, 'attempts', v_attempts);
end;
$$;

create or replace function public.bobby_brief_audio_commit(p_audio uuid, p_fence bigint, p_state text, p_storage_path text, p_bytes int, p_error text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_audio;
begin
  if p_state is null or p_state not in ('ready', 'retry', 'release', 'failed') then perform bobby_brief_bad('state'); end if;
  select * into r from bobby_brief_audio where id = p_audio for update;
  if not found or r.state <> 'processing' or r.fence <> p_fence or r.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'stale_fence');
  end if;
  if p_state = 'ready' then
    if p_storage_path is null or p_storage_path !~ '^[A-Za-z0-9/_.-]{1,255}$' or p_bytes is null or p_bytes < 0 then perform bobby_brief_bad('storage_path'); end if;
    update bobby_brief_audio set state = 'ready', storage_path = p_storage_path, bytes = p_bytes, lease_owner = null, lease_expires_at = null,
        last_error = null, ready_at = now(), updated_at = now() where id = p_audio;
  elsif p_state = 'retry' then
    update bobby_brief_audio set state = 'queued', attempts = attempts + 1, lease_owner = null, lease_expires_at = null,
        last_error = left(p_error, 64), updated_at = now() where id = p_audio;
  elsif p_state = 'release' then
    -- A refusal that never reached the provider (caps, slots, an unresolved attempt, storage): back to queued
    -- without spending one of the key's attempts, so a busy morning cannot fail a shared narration key for good.
    update bobby_brief_audio set state = 'queued', lease_owner = null, lease_expires_at = null,
        last_error = left(p_error, 64), updated_at = now() where id = p_audio;
  else
    update bobby_brief_audio set state = 'failed', lease_owner = null, lease_expires_at = null, last_error = left(p_error, 64), updated_at = now()
      where id = p_audio;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Ownership is derived through a link to a ready (not withdrawn) report of p_identity at its current content version.
-- Anything else is not_found; a Pro lapse is disclosed only to that owner.
create or replace function public.bobby_brief_audio_authorize(p_identity uuid, p_audio uuid)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare a bobby_brief_audio;
begin
  if p_identity is null or p_audio is null or not exists (
       select 1 from bobby_brief_audio_links l join bobby_briefs b on b.id = l.brief_id
        where l.audio_id = p_audio and b.identity_id = p_identity and b.state = 'ready' and l.content_version = b.content_version) then
    return jsonb_build_object('code', 'not_found');
  end if;
  if not bobby_is_pro(p_identity) then return jsonb_build_object('code', 'subscription_required'); end if;
  update bobby_brief_audio set last_used_at = now() where id = p_audio returning * into a;
  return jsonb_build_object('state', a.state, 'storagePath', case when a.state = 'ready' then a.storage_path end, 'mime', a.mime);
end;
$$;

-- ============================================================ reads

-- Owner-scoped ready reports whose scheduled time has come, newest first (keyset on (scheduled_at desc, id desc)),
-- plus `latest`: per switched-on cadence, the state of its newest period.
create or replace function public.bobby_brief_inbox(p_identity uuid, p_cadence text, p_before_scheduled timestamptz, p_before_id uuid, p_limit int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare s bobby_brief_settings; v_items jsonb; v_latest jsonb := '[]'::jsonb; v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_identity is null then return jsonb_build_object('items', '[]'::jsonb, 'latest', '[]'::jsonb); end if;
  if p_cadence is not null and p_cadence not in ('morning', 'close', 'weekly') then perform bobby_brief_bad('cadence'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'cadence', x.cadence, 'periodStart', x.period_start, 'periodEnd', x.period_end,
      'scheduledAt', x.scheduled_at, 'dataAsOf', x.data_as_of, 'calendarVersion', x.calendar_version, 'contentVersion', x.content_version,
      'quality', x.quality, 'audioState', x.audio_state) order by x.scheduled_at desc, x.id desc), '[]'::jsonb)
    into v_items
    from (select b.id, b.cadence, b.period_start, b.period_end, b.scheduled_at, b.data_as_of, b.calendar_version, b.content_version, b.quality,
                 (select case
                             when count(*) = 0 then 'none'
                             when bool_or(a.state in ('queued', 'processing')) then 'processing'
                             when bool_and(a.state = 'ready') then 'ready'
                             else 'failed' end
                             from bobby_brief_audio_links l join bobby_brief_audio a on a.id = l.audio_id
                            where l.brief_id = b.id and l.content_version = b.content_version) as audio_state
            from bobby_briefs b
           where b.identity_id = p_identity and b.state = 'ready' and b.scheduled_at <= now()
             and (p_cadence is null or b.cadence = p_cadence)
             and (p_before_scheduled is null
                  or b.scheduled_at < p_before_scheduled
                  or (p_before_id is not null and b.scheduled_at = p_before_scheduled and b.id < p_before_id))
           order by b.scheduled_at desc, b.id desc
           limit v_lim) x;

  select * into s from bobby_brief_settings where identity_id = p_identity;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('cadence', y.cadence, 'periodKey', y.period_key, 'scheduledAt', y.scheduled_at,
        'state', case
          when y.state = 'ready' and y.scheduled_at <= now() then 'ready'
          when y.state = 'ready' or (y.state in ('pending', 'preparing') and y.push_expires_at > now()) then 'preparing'
          else 'unavailable' end) order by y.cadence), '[]'::jsonb)
      into v_latest
      from (select distinct on (b.cadence) b.cadence, b.period_key, b.scheduled_at, b.state, b.push_expires_at
              from bobby_briefs b
             where b.identity_id = p_identity and bobby_brief_cadence_on(s, b.cadence) and (p_cadence is null or b.cadence = p_cadence)
             order by b.cadence, b.scheduled_at desc, b.id desc) y;
  end if;
  return jsonb_build_object('items', v_items, 'latest', v_latest);
end;
$$;

-- Owner-scoped ready report (voice/language frozen at claim). Missing, foreign, withdrawn or not yet due → not_found;
-- subscription_required is answered only to the owner.
create or replace function public.bobby_brief_get(p_identity uuid, p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare b bobby_briefs;
begin
  select * into b from bobby_briefs where id = p_id and identity_id = p_identity and state = 'ready' and scheduled_at <= now();
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if not bobby_is_pro(p_identity) then return jsonb_build_object('code', 'subscription_required'); end if;
  return jsonb_build_object('report', jsonb_build_object('id', b.id, 'cadence', b.cadence, 'contentVersion', b.content_version,
    'periodStart', b.period_start, 'periodEnd', b.period_end, 'scheduledAt', b.scheduled_at, 'dataAsOf', b.data_as_of,
    'calendarVersion', b.calendar_version, 'quality', b.quality, 'content', b.content, 'voice', b.voice, 'language', b.language));
end;
$$;

-- ============================================================ maintenance

-- Bounded (≤ 500 rows per kind per call, skip locked). Expired leases: briefs/shared/audio back to claimable
-- (counting the attempt), brief at 3 → failed; pending/expired-lease briefs past their push deadline → failed
-- ('deadline'); reserved attempts older than p_settle_seconds → released, dispatched/unknown → settled_assumed (D8);
-- overdue outbox → expired.
create or replace function public.bobby_brief_reconcile(p_settle_seconds int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  v_settle interval := make_interval(secs => least(greatest(coalesce(p_settle_seconds, 300), 30), 86400));
  n_brief int; n_deadline int; n_shared int; n_audio int; n_released int; n_assumed int; n_outbox int;
begin
  update bobby_briefs b set state = 'failed', last_error = 'deadline', lease_owner = null, lease_expires_at = null, updated_at = now()
    where b.id in (select id from bobby_briefs
                    where push_expires_at <= now() and (state = 'pending' or (state = 'preparing' and lease_expires_at <= now()))
                    limit 500 for update skip locked);
  get diagnostics n_deadline = row_count;
  update bobby_briefs b set attempts = b.attempts + 1, state = case when b.attempts + 1 >= 3 then 'failed' else 'pending' end,
      last_error = 'lease_expired', lease_owner = null, lease_expires_at = null, updated_at = now()
    where b.id in (select id from bobby_briefs where state = 'preparing' and lease_expires_at <= now() limit 500 for update skip locked);
  get diagnostics n_brief = row_count;
  update bobby_brief_shared set state = 'pending', attempts = attempts + 1, last_error = 'lease_expired', lease_owner = null,
      lease_expires_at = null, updated_at = now()
    where id in (select id from bobby_brief_shared where state = 'preparing' and lease_expires_at <= now() limit 500 for update skip locked);
  get diagnostics n_shared = row_count;
  update bobby_brief_audio set state = 'queued', attempts = attempts + 1, last_error = 'lease_expired', lease_owner = null,
      lease_expires_at = null, updated_at = now()
    where id in (select id from bobby_brief_audio where state = 'processing' and lease_expires_at <= now() limit 500 for update skip locked);
  get diagnostics n_audio = row_count;
  update bobby_brief_provider_attempts set state = 'released', updated_at = now()
    where id in (select id from bobby_brief_provider_attempts where state = 'reserved' and updated_at <= now() - v_settle
                  limit 500 for update skip locked);
  get diagnostics n_released = row_count;
  update bobby_brief_provider_attempts set state = 'settled_assumed', actual_usd = reserve_usd, settled_at = now(), updated_at = now()
    where id in (select id from bobby_brief_provider_attempts where state in ('dispatched', 'unknown') and updated_at <= now() - v_settle
                  limit 500 for update skip locked);
  get diagnostics n_assumed = row_count;
  update bobby_brief_outbox set state = 'expired', lease_owner = null, lease_expires_at = null, updated_at = now()
    where id in (select id from bobby_brief_outbox
                  where expires_at <= now() and (state = 'pending' or (state = 'claimed' and lease_expires_at <= now()))
                  limit 500 for update skip locked);
  get diagnostics n_outbox = row_count;
  return jsonb_build_object('briefLeases', n_brief, 'deadline', n_deadline, 'sharedLeases', n_shared, 'audioLeases', n_audio,
    'released', n_released, 'assumed', n_assumed, 'outboxExpired', n_outbox);
end;
$$;

-- Retention (D11): every delete bounded by p_limit with skip locked. Returns the storage paths of the audio rows it
-- deleted (unlinked, or unused for p_audio_days) so the worker can remove the objects. Open work is never purged:
-- unresolved provider attempts, active devices, live leases.
create or replace function public.bobby_brief_purge(p_report_days int, p_audio_days int, p_outbox_days int, p_attempt_days int,
  p_device_days int, p_idem_hours int, p_shared_days int, p_limit int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 500), 1), 5000);
  v_paths text[];
  n_reports int; n_audio int; n_outbox int; n_attempts int; n_devices int; n_idem int; n_shared int;
begin
  if coalesce(p_report_days, 0) < 1 or coalesce(p_audio_days, 0) < 1 or coalesce(p_outbox_days, 0) < 1 or coalesce(p_attempt_days, 0) < 1
     or coalesce(p_device_days, 0) < 1 or coalesce(p_idem_hours, 0) < 1 or coalesce(p_shared_days, 0) < 1 then
    perform bobby_brief_bad('retention');
  end if;
  delete from bobby_briefs where id in (
    select id from bobby_briefs where scheduled_at < now() - make_interval(days => p_report_days)
       and not (state = 'preparing' and lease_expires_at > now())
     limit v_lim for update skip locked);
  get diagnostics n_reports = row_count;
  with gone as (
    delete from bobby_brief_audio where id in (
      select a.id from bobby_brief_audio a
       where not (a.state = 'processing' and a.lease_expires_at > now())
         and (a.last_used_at < now() - make_interval(days => p_audio_days)
              or (a.created_at < now() - interval '1 hour' and not exists (select 1 from bobby_brief_audio_links l where l.audio_id = a.id)))
       limit v_lim for update skip locked)
    returning storage_path)
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}'), count(*) into v_paths, n_audio from gone;
  delete from bobby_brief_outbox where id in (
    select id from bobby_brief_outbox where state in ('sent', 'failed', 'expired', 'cancelled') and created_at < now() - make_interval(days => p_outbox_days)
     limit v_lim for update skip locked);
  get diagnostics n_outbox = row_count;
  delete from bobby_brief_provider_attempts where id in (
    select id from bobby_brief_provider_attempts where state in ('settled', 'no_charge', 'settled_assumed', 'released')
       and created_at < now() - make_interval(days => p_attempt_days)
     limit v_lim for update skip locked);
  get diagnostics n_attempts = row_count;
  delete from bobby_push_devices where id in (
    select id from bobby_push_devices where status <> 'active' and updated_at < now() - make_interval(days => p_device_days)
     limit v_lim for update skip locked);
  get diagnostics n_devices = row_count;
  delete from bobby_brief_idempotency where (identity_id, scope, idem_key) in (
    select identity_id, scope, idem_key from bobby_brief_idempotency
     where expires_at <= now() or created_at < now() - make_interval(hours => p_idem_hours)
     limit v_lim for update skip locked);
  get diagnostics n_idem = row_count;
  delete from bobby_brief_shared where id in (
    select id from bobby_brief_shared where created_at < now() - make_interval(days => p_shared_days)
       and not (state = 'preparing' and lease_expires_at > now())
     limit v_lim for update skip locked);
  get diagnostics n_shared = row_count;
  return jsonb_build_object('storagePaths', to_jsonb(v_paths), 'deleted', jsonb_build_object('reports', n_reports, 'audio', n_audio,
    'outbox', n_outbox, 'attempts', n_attempts, 'devices', n_devices, 'idempotency', n_idem, 'shared', n_shared));
end;
$$;

-- ============================================================ privileges

-- Every function of this feature (including helpers and trigger functions): service_role only.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'bobby\_brief\_%' or p.proname like 'bobby\_push\_device\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
