-- DRAFT. NOT A MIGRATION. Nothing applies this file to any shared or production database.
-- It is the contract of AgentStore (api/_lib/agent/store.ts) as Postgres: one function per method, each one
-- transaction. scripts/test-agent-engine-pg.mts runs it against a LOCAL scratch database and checks the same
-- invariants as the memory store, with real concurrent transactions. Before it becomes a migration the owner
-- decides: how long a person's question is kept (agent_tasks.question), and the product's own allowance.
-- All tables are for the service role only.

create table if not exists agent_tasks (
  id text primary key,
  owner text not null,                       -- derived by the server; never a client value
  address text,                              -- the salted address the errand came from: bounds a caller who invents owners
  session text not null, request_id text not null, body_digest text not null,
  language text not null, locale text,
  question text not null,
  parent text,
  model text not null, prompt_version text not null, toolset_version text not null,
  fence integer not null default 0, lease_worker text, lease_until timestamptz,
  created_at timestamptz not null,
  seq bigint generated always as identity,   -- the order errands were begun: what breaks a tie between two answers of one instant
  unique (owner, request_id)
);
create index if not exists agent_tasks_address_day on agent_tasks (address, created_at);
create table if not exists agent_steps (
  task text not null references agent_tasks(id) on delete cascade,
  n integer not null, at timestamptz not null,
  kind text not null check (kind in ('received','model_call','tool_started','tool_call','tool_refused','approval_requested','approval_granted','approval_denied','answer','error','cancel_requested','cancelled')),
  data jsonb not null,
  primary key (task, n)                      -- written once, numbered without gaps
);
create table if not exists agent_reads (
  task text primary key references agent_tasks(id) on delete cascade,   -- one read per task
  owner text not null, address text, day date not null, units integer not null check (units > 0)
);
create index if not exists agent_reads_owner_day on agent_reads (owner, day);
create table if not exists agent_attempts (
  id text primary key, task text not null, partition text not null, model text not null,
  reserve_usd numeric not null check (reserve_usd > 0),          -- no scale: what is checked against a cap is what is stored
  state text not null default 'reserved' check (state in ('reserved','dispatched','settled','no_charge','unknown')),
  actual_usd numeric, at timestamptz not null
);
create index if not exists agent_attempts_partition on agent_attempts (partition);
create index if not exists agent_attempts_task on agent_attempts (task);
alter table agent_tasks enable row level security; alter table agent_steps enable row level security;
alter table agent_reads enable row level security; alter table agent_attempts enable row level security;
revoke all on agent_tasks, agent_steps, agent_reads, agent_attempts from public;

-- ---------- reading ----------
create or replace function agent_task_json(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'owner', t.owner, 'address', t.address, 'session', t.session, 'requestId', t.request_id, 'idemKey', t.request_id,
    'bodyDigest', t.body_digest, 'language', t.language, 'locale', t.locale, 'question', t.question, 'parent', t.parent,
    'model', t.model, 'promptVersion', t.prompt_version, 'toolsetVersion', t.toolset_version,
    'createdAt', to_char(t.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'fence', t.fence,
    'lease', case when t.lease_worker is null then null else jsonb_build_object('worker', t.lease_worker, 'until', (extract(epoch from t.lease_until) * 1000)::bigint, 'fence', t.fence) end,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('n', s.n, 'at', to_char(s.at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'kind', s.kind, 'data', s.data) order by s.n) from agent_steps s where s.task = t.id), '[]'::jsonb))
  from agent_tasks t where t.id = p_id
$$;
create or replace function agent_is_final(p_id text) returns boolean language sql stable as $$
  select exists (select 1 from agent_steps where task = p_id and kind in ('answer','error','cancelled','approval_denied'))
$$;
-- The approval a task waits on: requested, and neither granted nor denied since.
create or replace function agent_waiting_scope(p_id text) returns jsonb language sql stable as $$
  select s.data->'scope' from agent_steps s where s.task = p_id and s.kind = 'approval_requested'
    and not exists (select 1 from agent_steps later where later.task = p_id and later.n > s.n and later.kind in ('approval_granted','approval_denied'))
  order by s.n desc limit 1
$$;
create or replace function agent_push(p_id text, p_kind text, p_data jsonb, p_now timestamptz) returns jsonb language plpgsql as $$
declare v_n integer;
begin
  select coalesce(max(n), 0) + 1 into v_n from agent_steps where task = p_id;
  insert into agent_steps (task, n, at, kind, data) values (p_id, v_n, p_now, p_kind, p_data);
  return jsonb_build_object('n', v_n, 'at', to_char(p_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'kind', p_kind, 'data', p_data);
end $$;
-- Writes `cancelled`. A read taken for a metered action that never ran asked no source: it goes back here.
create or replace function agent_end_cancelled(p_id text, p_now timestamptz, p_by text) returns void language plpgsql as $$
declare v_back boolean := false;
begin
  update agent_tasks set lease_worker = null, lease_until = null where id = p_id;
  if not exists (select 1 from agent_steps where task = p_id and kind = 'tool_call' and data->>'metered' = 'true') then
    delete from agent_reads where task = p_id;
    v_back := found;
  end if;
  perform agent_push(p_id, 'cancelled', case when v_back then jsonb_build_object('by', p_by, 'readGivenBack', true) else jsonb_build_object('by', p_by) end, p_now);
end $$;

create or replace function agent_get(p_owner text, p_id text) returns jsonb language sql stable as $$
  select agent_task_json(id) from agent_tasks where id = p_id and owner = p_owner
$$;
create or replace function agent_latest_completed(p_owner text, p_session text) returns jsonb language sql stable as $$
  select agent_task_json(t.id) from agent_tasks t join agent_steps s on s.task = t.id and s.kind = 'answer'
  where t.owner = p_owner and t.session = p_session order by s.at desc, t.seq desc limit 1
$$;

-- ---------- a task's life ----------
create or replace function agent_begin(p_task jsonb, p_received jsonb, p_now timestamptz, p_tasks_per_address integer) returns jsonb language plpgsql as $$
declare v_id text; v_digest text; v_address text := p_task->>'address';
begin
  -- One errand per (owner, request): requests that arrive together queue here, and all but the first find it.
  perform pg_advisory_xact_lock(hashtext('agent_begin:' || (p_task->>'owner') || ':' || (p_task->>'requestId')));
  select id, body_digest into v_id, v_digest from agent_tasks where owner = p_task->>'owner' and request_id = p_task->>'requestId';
  if found then
    if v_digest = p_task->>'bodyDigest' then return jsonb_build_object('state', 'replay', 'task', agent_task_json(v_id)); end if;
    return jsonb_build_object('state', 'mismatch');
  end if;
  if exists (select 1 from agent_tasks where id = p_task->>'id') then return jsonb_build_object('state', 'mismatch'); end if;
  if v_address is not null then
    perform pg_advisory_xact_lock(hashtext('agent_address:' || v_address));
    if (select count(*) from agent_tasks where address = v_address and (created_at at time zone 'utc')::date = (p_now at time zone 'utc')::date) >= p_tasks_per_address then
      return jsonb_build_object('state', 'crowded');
    end if;
  end if;
  insert into agent_tasks (id, owner, address, session, request_id, body_digest, language, locale, question, parent, model, prompt_version, toolset_version, created_at)
  values (p_task->>'id', p_task->>'owner', v_address, p_task->>'session', p_task->>'requestId', p_task->>'bodyDigest', p_task->>'language', p_task->>'locale', p_task->>'question', p_task->>'parent', p_task->>'model', p_task->>'promptVersion', p_task->>'toolsetVersion', p_now)
  on conflict (id) do nothing;
  -- The same task id arriving at once under another owner: one of them is new, the other is told mismatch.
  if not found then return jsonb_build_object('state', 'mismatch'); end if;
  perform agent_push(p_task->>'id', 'received', p_received, p_now);
  return jsonb_build_object('state', 'new', 'task', agent_task_json(p_task->>'id'));
end $$;

create or replace function agent_claim(p_id text, p_worker text, p_lease_ms integer, p_now timestamptz) returns jsonb language plpgsql as $$
declare v agent_tasks%rowtype;
begin
  select * into v from agent_tasks where id = p_id for update;
  if not found or agent_is_final(p_id) then return null; end if;
  if v.lease_worker is not null and v.lease_until > p_now then return null; end if;
  -- A cancel accepted while a runner held the task, and never completed by it, is completed here.
  if exists (select 1 from agent_steps where task = p_id and kind = 'cancel_requested') then perform agent_end_cancelled(p_id, p_now, 'store'); return null; end if;
  if agent_waiting_scope(p_id) is not null then return null; end if;
  update agent_tasks set fence = fence + 1, lease_worker = p_worker, lease_until = p_now + make_interval(secs => p_lease_ms / 1000.0) where id = p_id;
  return jsonb_build_object('fence', v.fence + 1, 'task', agent_task_json(p_id));
end $$;

create or replace function agent_append(p_id text, p_fence integer, p_kind text, p_data jsonb, p_now timestamptz) returns jsonb language plpgsql as $$
declare v agent_tasks%rowtype;
begin
  select * into v from agent_tasks where id = p_id for update;
  -- A runner that lost its lease, or a task that already ended, writes nothing.
  -- `is distinct from`: a missing fence is no fence (with <> a NULL would pass).
  if not found or v.lease_worker is null or v.fence is distinct from p_fence or agent_is_final(p_id) then return null; end if;
  -- What would end or advance the task (an answer, an error, a request for approval, the start of metered work) and
  -- crosses an accepted cancel is not stored: decided here, in the same transaction as the write.
  if p_kind in ('answer', 'error', 'approval_requested', 'cancelled', 'tool_started') and exists (select 1 from agent_steps where task = p_id and kind = 'cancel_requested') then
    perform agent_end_cancelled(p_id, p_now, 'runner'); return null;
  end if;
  -- A metered tool that brought no figure gives the read back in the write that says so.
  if p_kind = 'tool_call' and p_data->>'metered' = 'true' and p_data->>'refunded' = 'true' then delete from agent_reads where task = p_id; end if;
  return agent_push(p_id, p_kind, p_data, p_now);
end $$;

create or replace function agent_release(p_id text, p_fence integer) returns void language plpgsql as $$
declare v agent_tasks%rowtype; v_at timestamptz;
begin
  select * into v from agent_tasks where id = p_id for update;
  if not found or v.lease_worker is null or v.fence is distinct from p_fence then return; end if;
  update agent_tasks set lease_worker = null, lease_until = null where id = p_id;
  if not agent_is_final(p_id) and exists (select 1 from agent_steps where task = p_id and kind = 'cancel_requested') then
    select at into v_at from agent_steps where task = p_id order by n desc limit 1;   -- the last step's own time, as in the memory store
    perform agent_end_cancelled(p_id, v_at, 'store');
  end if;
end $$;

create or replace function agent_remaining(p_owner text, p_now timestamptz, p_reads_per_day integer) returns integer language sql stable as $$
  select case when p_reads_per_day is null then null else greatest(0, p_reads_per_day - coalesce((select sum(units) from agent_reads where owner = p_owner and day = (p_now at time zone 'utc')::date), 0))::integer end
$$;

-- approve(): owner, task, the waiting approval and its exact digest, and the person's read, in one transaction.
create or replace function agent_approve(p_owner text, p_id text, p_digest text, p_now timestamptz, p_reads_per_day integer) returns jsonb language plpgsql as $$
declare v agent_tasks%rowtype; v_scope jsonb; v_units integer; v_day date := (p_now at time zone 'utc')::date;
begin
  select * into v from agent_tasks where id = p_id and owner = p_owner for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  v_scope := agent_waiting_scope(p_id);
  -- "Already" is said of the LAST yes only: an older approval of the same task is not this one.
  if v_scope is null and (select data->>'digest' from agent_steps where task = p_id and kind = 'approval_granted' order by n desc limit 1) = p_digest then
    return jsonb_build_object('state', 'already', 'remaining', agent_remaining(p_owner, p_now, p_reads_per_day));
  end if;
  if v_scope is null or agent_is_final(p_id) or exists (select 1 from agent_steps where task = p_id and kind = 'cancel_requested') then return jsonb_build_object('state', 'not_waiting'); end if;
  if v_scope->>'digest' is distinct from p_digest then return jsonb_build_object('state', 'mismatch'); end if;
  v_units := (v_scope->'consumption'->>'reads')::integer;
  if not exists (select 1 from agent_reads where task = p_id) then
    if p_reads_per_day is not null then
      -- The owner's day and the address's day are counted under their own locks: two yeses at once cannot both fit the last read.
      perform pg_advisory_xact_lock(hashtext('agent_reads:' || p_owner));
      if coalesce((select sum(units) from agent_reads where owner = p_owner and day = v_day), 0) + v_units > p_reads_per_day then return jsonb_build_object('state', 'limit'); end if;
      if v.address is not null then
        perform pg_advisory_xact_lock(hashtext('agent_reads_address:' || v.address));
        if coalesce((select sum(units) from agent_reads where address = v.address and day = v_day), 0) + v_units > p_reads_per_day * 4 then return jsonb_build_object('state', 'limit'); end if;
      end if;
    end if;
    insert into agent_reads (task, owner, address, day, units) values (p_id, p_owner, v.address, v_day, v_units);
  end if;
  perform agent_push(p_id, 'approval_granted', jsonb_build_object('digest', p_digest, 'scope', v_scope), p_now);
  return jsonb_build_object('state', 'granted', 'remaining', agent_remaining(p_owner, p_now, p_reads_per_day));
end $$;

create or replace function agent_deny(p_owner text, p_id text, p_now timestamptz) returns boolean language plpgsql as $$
begin
  perform 1 from agent_tasks where id = p_id and owner = p_owner for update;
  if not found or agent_waiting_scope(p_id) is null or agent_is_final(p_id) then return false; end if;
  perform agent_push(p_id, 'approval_denied', '{}'::jsonb, p_now);
  return true;
end $$;

create or replace function agent_cancel(p_owner text, p_id text, p_now timestamptz) returns boolean language plpgsql as $$
declare v agent_tasks%rowtype; v_asked boolean; v_idle boolean;
begin
  select * into v from agent_tasks where id = p_id and owner = p_owner for update;
  if not found or agent_is_final(p_id) then return false; end if;
  v_asked := exists (select 1 from agent_steps where task = p_id and kind = 'cancel_requested');
  v_idle := v.lease_worker is null or v.lease_until <= p_now;
  if not v_asked then perform agent_push(p_id, 'cancel_requested', '{}'::jsonb, p_now); end if;
  -- Nobody is running it, or whoever was never came back: it is cancelled now.
  if v_idle then perform agent_end_cancelled(p_id, p_now, 'store'); end if;
  return true;
end $$;

create or replace function agent_refund(p_id text) returns void language sql as $$ delete from agent_reads where task = p_id $$;

-- ---------- provider money ----------
-- What an attempt holds of a cap: its cost once known, nothing once known free, its whole reservation otherwise.
create or replace function agent_committed(p_partition text) returns numeric language sql stable as $$
  select coalesce(sum(case state when 'settled' then coalesce(actual_usd, reserve_usd) when 'no_charge' then 0 else reserve_usd end), 0)
  from agent_attempts where partition = p_partition
$$;
-- reserve(): the partition's cap, the task's cap and "no blind second attempt", checked and written under one lock.
create or replace function agent_reserve(p_partition text, p_cap numeric, p_task_cap numeric, p_task text, p_model text, p_reserve numeric, p_now timestamptz) returns jsonb language plpgsql as $$
declare v_id text; v_task numeric;
begin
  if p_cap is null or p_task_cap is null or p_reserve is null or not (p_cap > 0) or not (p_task_cap > 0) or not (p_reserve > 0) then return jsonb_build_object('ok', false, 'code', 'not_configured'); end if;
  -- Two locks, always in this order. The task's own: its cap and its unresolved work belong to the task across every
  -- partition (a task whose runs straddle midnight has two). Then the partition's.
  perform pg_advisory_xact_lock(hashtext('agent_task_money:' || p_task));
  perform pg_advisory_xact_lock(hashtext('agent_budget:' || p_partition));
  if exists (select 1 from agent_attempts where task = p_task and state in ('dispatched', 'unknown')) then return jsonb_build_object('ok', false, 'code', 'work_unresolved'); end if;
  select coalesce(sum(case state when 'settled' then coalesce(actual_usd, reserve_usd) when 'no_charge' then 0 else reserve_usd end), 0) into v_task from agent_attempts where task = p_task;
  if v_task + p_reserve > p_task_cap + 0.000000001 then return jsonb_build_object('ok', false, 'code', 'task_cap'); end if;
  if agent_committed(p_partition) + p_reserve > p_cap + 0.000000001 then return jsonb_build_object('ok', false, 'code', 'budget_exhausted'); end if;
  v_id := 'att_' || replace(gen_random_uuid()::text, '-', '');
  insert into agent_attempts (id, task, partition, model, reserve_usd, at) values (v_id, p_task, p_partition, p_model, p_reserve, p_now);
  return jsonb_build_object('ok', true, 'attemptId', v_id);
end $$;
create or replace function agent_dispatch(p_attempt text) returns void language plpgsql as $$
begin
  update agent_attempts set state = 'dispatched' where id = p_attempt and state = 'reserved';
  if not found then raise exception 'attempt is not reserved'; end if;
end $$;
-- Settled once: a second settle of the same attempt changes nothing.
create or replace function agent_settle(p_attempt text, p_outcome text, p_actual numeric) returns void language plpgsql as $$
begin
  if not exists (select 1 from agent_attempts where id = p_attempt) then raise exception 'unknown attempt'; end if;
  update agent_attempts set state = p_outcome,
    actual_usd = case p_outcome when 'settled' then greatest(0, coalesce(p_actual, reserve_usd)) when 'no_charge' then 0 else null end
  where id = p_attempt and state in ('reserved', 'dispatched');
end $$;

-- Still to write before this is a migration: a reconcile job that turns an attempt left `dispatched` beyond the
-- function's maximum duration into `unknown`; a purge of finished tasks after the retention the owner decides;
-- grants to the service role only (Supabase grants ALL to anon and authenticated by default: revoke from both).
