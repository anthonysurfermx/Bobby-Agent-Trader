-- DRAFT. NOT A MIGRATION. Nothing applies this file and it has never run against any database.
-- It states, as Postgres, the contract of AgentStore (api/_lib/agent/store.ts) so the owner can read what a
-- production store would need before deciding. Every function is one transaction; all tables are for the
-- service role only.

create table if not exists agent_tasks (
  id text primary key,
  owner text not null,                       -- derived by the server; never a client value
  session text not null,
  request_id text not null,
  body_digest text not null,
  language text not null, locale text,
  question text not null,                    -- the person's words: decide retention before this exists
  parent text references agent_tasks(id),
  model text not null, prompt_version text not null, toolset_version text not null,
  fence integer not null default 0,
  lease_worker text, lease_until timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, request_id)
);
create table if not exists agent_steps (
  task text not null references agent_tasks(id) on delete cascade,
  n integer not null, at timestamptz not null default now(),
  kind text not null check (kind in ('received','model_call','tool_call','tool_refused','approval_requested','approval_granted','approval_denied','answer','error','cancel_requested','cancelled')),
  data jsonb not null,
  primary key (task, n)                      -- written once, numbered without gaps
);
create table if not exists agent_reads (
  task text primary key references agent_tasks(id) on delete cascade,  -- one read per task
  owner text not null, day date not null, units integer not null check (units > 0)
);
create table if not exists agent_attempts (
  id uuid primary key default gen_random_uuid(),
  task text not null, partition text not null, model text not null,
  reserve_usd numeric(12,6) not null check (reserve_usd > 0),
  state text not null default 'reserved' check (state in ('reserved','dispatched','settled','no_charge','unknown')),
  actual_usd numeric(12,6), at timestamptz not null default now()
);
alter table agent_tasks enable row level security; alter table agent_steps enable row level security;
alter table agent_reads enable row level security; alter table agent_attempts enable row level security;
revoke all on agent_tasks, agent_steps, agent_reads, agent_attempts from public, anon, authenticated;

-- What an attempt holds of a cap: its cost once known, nothing once known free, its whole reservation otherwise.
create or replace function agent_held(p_partition text) returns numeric language sql stable as $$
  select coalesce(sum(case state when 'settled' then coalesce(actual_usd, reserve_usd) when 'no_charge' then 0 else reserve_usd end), 0)
  from agent_attempts where partition = p_partition
$$;

-- reserve(): the partition's cap, the task's cap and "no blind second attempt", checked and written under one lock.
create or replace function agent_reserve(p_partition text, p_cap numeric, p_task_cap numeric, p_task text, p_model text, p_reserve numeric)
returns jsonb language plpgsql as $$
declare v_id uuid; v_task numeric;
begin
  if p_cap <= 0 or p_task_cap <= 0 or p_reserve <= 0 then return jsonb_build_object('ok', false, 'code', 'not_configured'); end if;
  perform pg_advisory_xact_lock(hashtext('agent_budget:' || p_partition));
  if exists (select 1 from agent_attempts where task = p_task and state in ('dispatched', 'unknown')) then return jsonb_build_object('ok', false, 'code', 'work_unresolved'); end if;
  select coalesce(sum(case state when 'settled' then coalesce(actual_usd, reserve_usd) when 'no_charge' then 0 else reserve_usd end), 0) into v_task from agent_attempts where task = p_task;
  if v_task + p_reserve > p_task_cap then return jsonb_build_object('ok', false, 'code', 'task_cap'); end if;
  if agent_held(p_partition) + p_reserve > p_cap then return jsonb_build_object('ok', false, 'code', 'budget_exhausted'); end if;
  insert into agent_attempts (task, partition, model, reserve_usd) values (p_task, p_partition, p_model, p_reserve) returning id into v_id;
  return jsonb_build_object('ok', true, 'attemptId', v_id);
end $$;

-- approve(): owner, task, the waiting approval and its exact digest, and the person's read, in one transaction.
create or replace function agent_approve(p_owner text, p_task text, p_digest text, p_reads_per_day integer)
returns jsonb language plpgsql as $$
declare v_scope jsonb; v_used integer; v_units integer; v_n integer;
begin
  perform 1 from agent_tasks where id = p_task and owner = p_owner for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if exists (select 1 from agent_steps where task = p_task and kind in ('answer','error','cancelled','approval_denied')) then return jsonb_build_object('state', 'not_waiting'); end if;
  select data->'scope' into v_scope from agent_steps s where task = p_task and kind = 'approval_requested'
    and not exists (select 1 from agent_steps later where later.task = p_task and later.n > s.n and later.kind in ('approval_granted','approval_denied'))
    order by n desc limit 1;
  if v_scope is null then
    if exists (select 1 from agent_steps where task = p_task and kind = 'approval_granted' and data->>'digest' = p_digest) then return jsonb_build_object('state', 'already'); end if;
    return jsonb_build_object('state', 'not_waiting');
  end if;
  if v_scope->>'digest' <> p_digest then return jsonb_build_object('state', 'mismatch'); end if;
  v_units := (v_scope->'consumption'->>'reads')::integer;
  if not exists (select 1 from agent_reads where task = p_task) then
    perform pg_advisory_xact_lock(hashtext('agent_reads:' || p_owner));
    select coalesce(sum(units), 0) into v_used from agent_reads where owner = p_owner and day = (now() at time zone 'utc')::date;
    if p_reads_per_day is not null and v_used + v_units > p_reads_per_day then return jsonb_build_object('state', 'limit'); end if;
    insert into agent_reads (task, owner, day, units) values (p_task, p_owner, (now() at time zone 'utc')::date, v_units);
  end if;
  select coalesce(max(n), 0) + 1 into v_n from agent_steps where task = p_task;
  insert into agent_steps (task, n, kind, data) values (p_task, v_n, 'approval_granted', jsonb_build_object('digest', p_digest, 'scope', v_scope));
  return jsonb_build_object('state', 'granted');
end $$;

-- Still to write as functions, each one transaction, mirroring store.ts line for line:
--   agent_begin(owner, request_id, body_digest, …)  insert … on conflict (owner, request_id) do nothing; replay or mismatch by digest
--   agent_claim(task, worker, lease_seconds)        refuse when final, waiting or leased; fence = fence + 1
--   agent_append(task, fence, kind, data)           refuse a stale fence or a final task; n = max(n) + 1 under the task's row lock
--   agent_cancel(owner, task), agent_deny(owner, task), agent_refund(task), agent_settle(attempt, outcome, usd)
-- and a reconcile job that treats an attempt left `dispatched` beyond the function's maximum duration as `unknown`.
