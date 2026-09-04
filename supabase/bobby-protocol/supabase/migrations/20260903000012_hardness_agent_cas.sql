-- ============================================================
-- BP-10 (2026-09-04 review): agent registration read the current owner,
-- verified a signature against it, then did an UNCONDITIONAL service-role
-- merge on agent_id — the ownership decision was not preserved by the write,
-- and a failed read looked like "not found". Registration is now a
-- compare-and-swap inside the database, bound to the owner and row version
-- the caller authorised against; ownership transfer is a separate, explicitly
-- authorised operation with a single-use request id.
-- ============================================================

alter table public.hardness_agents add column if not exists version bigint not null default 1;

create table if not exists public.hardness_agent_ownership_nonces (
  request_id uuid primary key,
  agent_id   text not null,
  used_at    timestamptz not null default now()
);
alter table public.hardness_agent_ownership_nonces enable row level security;
revoke all on public.hardness_agent_ownership_nonces from anon, authenticated;
grant all on public.hardness_agent_ownership_nonces to service_role;

-- Create or update an agent profile. Creation is insert-only (a concurrent
-- creation loses on the unique agent_id). An update must name the owner and
-- version it authorised against; either mismatch raises. Never changes the owner.
create or replace function public.hardness_register_agent(
  p_agent_id text, p_expected_owner text, p_expected_version bigint, p_row jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_row public.hardness_agents%rowtype; v_owner text;
begin
  v_owner := lower(p_row->>'owner_address');
  if v_owner is null or v_owner !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OWNER' using errcode = '22023';
  end if;
  select * into v_row from public.hardness_agents where agent_id = p_agent_id for update;
  if not found then
    if p_expected_owner is not null or p_expected_version is not null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.hardness_agents (agent_id, owner_address, name, agent_type, version, capabilities, mcp_endpoint, webhook_url, metadata_json, risk_policy_json, status, updated_at)
    values (p_agent_id, v_owner, p_row->>'name', coalesce(p_row->>'agent_type', 'trading-agent'), 1,
            coalesce(p_row->'capabilities', '["predict"]'::jsonb), p_row->>'mcp_endpoint', p_row->>'webhook_url',
            coalesce(p_row->'metadata_json', '{}'::jsonb), coalesce(p_row->'risk_policy_json', '{}'::jsonb), coalesce(p_row->>'status', 'active'), now())
    returning * into v_row;
    return to_jsonb(v_row);
  end if;
  if p_expected_owner is null or lower(p_expected_owner) <> lower(v_row.owner_address) then
    raise exception 'OWNER_MISMATCH' using errcode = 'P0001';
  end if;
  if lower(v_row.owner_address) <> v_owner then
    raise exception 'OWNER_CHANGE_REQUIRES_TRANSFER' using errcode = 'P0001';
  end if;
  if p_expected_version is null or v_row.version <> p_expected_version then
    raise exception 'STALE_VERSION' using errcode = 'P0001';
  end if;
  update public.hardness_agents
     set name = coalesce(p_row->>'name', name),
         agent_type = coalesce(p_row->>'agent_type', agent_type),
         capabilities = coalesce(p_row->'capabilities', capabilities),
         mcp_endpoint = p_row->>'mcp_endpoint',
         webhook_url = p_row->>'webhook_url',
         metadata_json = coalesce(p_row->'metadata_json', metadata_json),
         risk_policy_json = coalesce(p_row->'risk_policy_json', risk_policy_json),
         status = coalesce(p_row->>'status', status),
         version = version + 1,
         updated_at = now()
   where agent_id = p_agent_id
   returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Explicit ownership transfer: authorised by the CURRENT owner (verified by the
-- caller), bound to the row version, and single-use via p_request_id.
create or replace function public.hardness_transfer_agent(
  p_agent_id text, p_current_owner text, p_new_owner text, p_expected_version bigint, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_row public.hardness_agents%rowtype;
begin
  if p_new_owner is null or lower(p_new_owner) !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_OWNER' using errcode = '22023';
  end if;
  begin
    insert into public.hardness_agent_ownership_nonces (request_id, agent_id) values (p_request_id, p_agent_id);
  exception when unique_violation then
    raise exception 'REQUEST_REPLAYED' using errcode = 'P0001';
  end;
  select * into v_row from public.hardness_agents where agent_id = p_agent_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if lower(v_row.owner_address) <> lower(p_current_owner) then raise exception 'OWNER_MISMATCH' using errcode = 'P0001'; end if;
  if v_row.version <> p_expected_version then raise exception 'STALE_VERSION' using errcode = 'P0001'; end if;
  update public.hardness_agents set owner_address = lower(p_new_owner), version = version + 1, updated_at = now()
   where agent_id = p_agent_id returning * into v_row;
  return to_jsonb(v_row);
end $$;

revoke all on function public.hardness_register_agent(text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.hardness_transfer_agent(text, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.hardness_register_agent(text, text, bigint, jsonb) to service_role;
grant execute on function public.hardness_transfer_agent(text, text, text, bigint, uuid) to service_role;
