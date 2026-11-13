-- Watches of the agent engine (api/_lib/agent/watch*.ts, door api/agent-watch.ts). New objects only: one table and
-- the functions the server calls through PostgREST with the service role. Nobody else can read, write or execute
-- any of it: every privilege is revoked from PUBLIC, anon and authenticated by name, and RLS is on with no policy.
-- The same statements as docs/agent-engine/agent-watches.sql (scripts/test-agent-watch.mts compares them and runs
-- them against a scratch database).
-- What is kept: an asset, a direction, a size, a length and the close it is measured from, tied to an account; no
-- word a person typed or said. A watch looks for at most 30 days and is removed 7 days after it ended.
-- Applied to production on 2026-11-12 (schema_migrations 20261113004301) with the owner's yes, for the private pilot.

create table if not exists agent_watches (
  id text primary key check (id ~ '^watch_[a-f0-9]{32}$'),
  identity uuid not null references public.bobby_identities(id) on delete cascade,   -- resolved by the server; never a client value
  request_id text not null, body_digest text not null,
  symbol text not null check (symbol ~ '^[A-Z]{1,8}$'),
  direction text not null check (direction in ('falls','rises','moves')),
  percent numeric not null check (percent > 0 and percent <= 50),
  days integer not null check (days between 1 and 30),
  language text not null check (language in ('en','es','fr','pt','it','de')), locale text,
  reference jsonb not null,                  -- { day, close, currency }: the close everything is measured from
  created_at timestamptz not null, expires_at timestamptz not null,
  state text not null default 'active' check (state in ('active','met','expired','cancelled')),
  ended_at timestamptz,
  checked_through text, unreadable boolean not null default false,
  met jsonb, result jsonb, seen_at timestamptz,
  push text not null default 'none' check (push in ('none','pending','sending','sent','failed')),
  next_check_at timestamptz not null,
  fence integer not null default 0, lease_worker text, lease_until timestamptz,
  unique (identity, request_id),
  check ((state = 'active') = (ended_at is null))
);
create index if not exists agent_watches_due on agent_watches (next_check_at) where state = 'active';
create index if not exists agent_watches_identity on agent_watches (identity, created_at desc);
create index if not exists agent_watches_push on agent_watches (ended_at) where push = 'pending';
create index if not exists agent_watches_ended on agent_watches (ended_at) where state <> 'active';
alter table agent_watches enable row level security;
revoke all on agent_watches from public;

-- ---------- reading ----------
create or replace function agent_watch_ts(p timestamptz) returns text language sql immutable set search_path = public, pg_temp as $$
  select to_char(p at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
create or replace function agent_watch_json(p_id text) returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', w.id, 'identity', w.identity, 'requestId', w.request_id, 'bodyDigest', w.body_digest,
    'symbol', w.symbol, 'direction', w.direction, 'percent', w.percent, 'days', w.days, 'language', w.language, 'locale', w.locale,
    'reference', w.reference, 'createdAt', agent_watch_ts(w.created_at), 'expiresAt', agent_watch_ts(w.expires_at),
    'state', w.state, 'endedAt', agent_watch_ts(w.ended_at), 'checkedThrough', w.checked_through, 'unreadable', w.unreadable,
    'met', w.met, 'result', w.result, 'seenAt', agent_watch_ts(w.seen_at), 'push', w.push)
  from agent_watches w where w.id = p_id
$$;
create or replace function agent_watch_get(p_identity uuid, p_id text) returns jsonb language sql stable set search_path = public, pg_temp as $$
  select agent_watch_json(w.id) from agent_watches w where w.id = p_id and w.identity = p_identity
$$;
create or replace function agent_watch_list(p_identity uuid) returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(agent_watch_json(w.id) order by w.created_at desc, w.id), '[]'::jsonb)
  from agent_watches w where w.identity = p_identity and w.state <> 'cancelled'
$$;

-- ---------- the person's side ----------
-- One account's creates run one after another (the advisory lock), so its limit holds whatever arrives at once.
create or replace function agent_watch_create(p_watch jsonb, p_limit integer, p_now timestamptz) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_identity uuid := (p_watch->>'identity')::uuid; v_id text; v_digest text;
begin
  if v_identity is null or p_limit is null or p_now is null then raise exception 'invalid watch' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agent_watch:' || v_identity::text, 0));
  select id, body_digest into v_id, v_digest from agent_watches where identity = v_identity and request_id = p_watch->>'requestId';
  if found then
    if v_digest = p_watch->>'bodyDigest' then return jsonb_build_object('state', 'replay', 'watch', agent_watch_json(v_id)); end if;
    return jsonb_build_object('state', 'mismatch');
  end if;
  if exists (select 1 from agent_watches where id = p_watch->>'id') then return jsonb_build_object('state', 'mismatch'); end if;
  if (select count(*) from agent_watches where identity = v_identity and state = 'active') >= p_limit then return jsonb_build_object('state', 'limit'); end if;
  insert into agent_watches (id, identity, request_id, body_digest, symbol, direction, percent, days, language, locale, reference, created_at, expires_at, next_check_at)
  values (p_watch->>'id', v_identity, p_watch->>'requestId', p_watch->>'bodyDigest', p_watch->>'symbol', p_watch->>'direction', (p_watch->>'percent')::numeric,
    (p_watch->>'days')::integer, p_watch->>'language', p_watch->>'locale', p_watch->'reference', (p_watch->>'createdAt')::timestamptz, (p_watch->>'expiresAt')::timestamptz, p_now);
  return jsonb_build_object('state', 'new', 'watch', agent_watch_json(p_watch->>'id'));
end $$;
-- A cancel said twice is the same cancel; a watch that already ended another way is not cancelled.
create or replace function agent_watch_cancel(p_identity uuid, p_id text, p_now timestamptz) returns boolean language plpgsql set search_path = public, pg_temp as $$
declare v_state text;
begin
  select state into v_state from agent_watches where id = p_id and identity = p_identity for update;
  if not found then return false; end if;
  if v_state = 'cancelled' then return true; end if;
  if v_state <> 'active' then return false; end if;
  update agent_watches set state = 'cancelled', ended_at = p_now, lease_worker = null, lease_until = null where id = p_id;
  return true;
end $$;
create or replace function agent_watch_seen(p_identity uuid, p_id text, p_now timestamptz) returns boolean language plpgsql set search_path = public, pg_temp as $$
begin
  update agent_watches set seen_at = coalesce(seen_at, p_now) where id = p_id and identity = p_identity and state in ('met', 'expired');
  return found;
end $$;

-- ---------- the worker's side ----------
create or replace function agent_watch_claim_due(p_worker text, p_lease_ms integer, p_limit integer, p_now timestamptz) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_ids text[];
begin
  if p_worker is null or p_lease_ms is null or p_lease_ms < 1 or p_limit is null or p_limit < 1 or p_now is null then return '[]'::jsonb; end if;
  with due as (
    select id from agent_watches where state = 'active' and next_check_at <= p_now and (lease_until is null or lease_until <= p_now)
    order by next_check_at, id limit p_limit for update skip locked
  ), held as (
    update agent_watches w set fence = w.fence + 1, lease_worker = p_worker, lease_until = p_now + make_interval(secs => p_lease_ms / 1000.0)
    from due where w.id = due.id returning w.id
  )
  select array_agg(id) into v_ids from held;
  return coalesce((select jsonb_agg(jsonb_build_object('watch', agent_watch_json(w.id), 'fence', w.fence) order by w.next_check_at, w.id) from agent_watches w where w.id = any(v_ids)), '[]'::jsonb);
end $$;
-- Every write of a worker names its fence and finds the watch still active: a stale worker, or one whose watch
-- the person cancelled meanwhile, writes nothing.
create or replace function agent_watch_quiet(p_id text, p_fence integer, p_through text, p_unreadable boolean, p_next timestamptz) returns boolean language plpgsql set search_path = public, pg_temp as $$
begin
  update agent_watches set checked_through = coalesce(p_through, checked_through), unreadable = coalesce(p_unreadable, false), next_check_at = p_next, lease_worker = null, lease_until = null
  where id = p_id and fence = p_fence and state = 'active' and lease_worker is not null;
  return found;
end $$;
create or replace function agent_watch_met(p_id text, p_fence integer, p_met jsonb, p_result jsonb, p_now timestamptz) returns boolean language plpgsql set search_path = public, pg_temp as $$
begin
  if p_met is null or p_result is null then return false; end if;
  update agent_watches set state = 'met', ended_at = p_now, met = p_met, result = p_result, checked_through = p_met->>'day', unreadable = false, push = 'pending', lease_worker = null, lease_until = null
  where id = p_id and fence = p_fence and state = 'active' and lease_worker is not null;
  return found;
end $$;
create or replace function agent_watch_expire(p_id text, p_fence integer, p_unreadable boolean, p_now timestamptz) returns boolean language plpgsql set search_path = public, pg_temp as $$
begin
  update agent_watches set state = 'expired', ended_at = p_now, unreadable = coalesce(p_unreadable, false), lease_worker = null, lease_until = null
  where id = p_id and fence = p_fence and state = 'active' and lease_worker is not null;
  return found;
end $$;

-- ---------- the notification ----------
-- Claimed before anything is sent, and a claim is never given twice: whoever claimed and died sends nothing more.
create or replace function agent_watch_claim_pushes(p_limit integer, p_now timestamptz) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_ids text[];
begin
  if p_limit is null or p_limit < 1 then return '[]'::jsonb; end if;
  with owed as (
    select id from agent_watches where push = 'pending' and state = 'met' order by ended_at, id limit p_limit for update skip locked
  ), taken as (
    update agent_watches w set push = 'sending' from owed where w.id = owed.id returning w.id
  )
  select array_agg(id) into v_ids from taken;
  return coalesce((select jsonb_agg(agent_watch_json(w.id) order by w.ended_at, w.id) from agent_watches w where w.id = any(v_ids)), '[]'::jsonb);
end $$;
-- The devices of an account that may be notified now. At most five, as an account may register.
create or replace function agent_watch_devices(p_identity uuid) returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('tokenCiphertext', d.token_ciphertext, 'environment', d.environment, 'topic', d.topic)), '[]'::jsonb)
  from (select token_ciphertext, environment, topic from public.bobby_push_devices
        where identity_id = p_identity and status = 'active' and permission in ('authorized', 'provisional') order by last_seen_at desc limit 5) d
$$;
create or replace function agent_watch_pushed(p_id text, p_outcome text) returns void language sql set search_path = public, pg_temp as $$
  update agent_watches set push = p_outcome where id = p_id and push = 'sending' and p_outcome in ('sent', 'failed')
$$;

-- ---------- keeping ----------
create or replace function agent_watch_purge(p_now timestamptz, p_keep_days integer, p_limit integer) returns integer language plpgsql set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if p_now is null or p_keep_days is null or p_keep_days < 1 or p_limit is null or p_limit < 1 then return 0; end if;
  with gone as (
    select id from agent_watches where state <> 'active' and ended_at < p_now - make_interval(days => p_keep_days) order by ended_at limit p_limit for update skip locked
  )
  delete from agent_watches w using gone where w.id = gone.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- who may call ----------
-- Nobody but the service role: each role is named, as in agent-engine.sql (Supabase grants to anon and
-- authenticated by default, so revoking from PUBLIC alone is not enough).
do $$
declare v_role text; v_fn regprocedure;
begin
  for v_fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'agent\_watch\_%' loop
    execute format('revoke all on function %s from public', v_fn);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_fn, v_role); end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', v_fn); end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on agent_watches from %I', v_role); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant select, insert, update, delete on agent_watches to service_role'; end if;
end $$;
