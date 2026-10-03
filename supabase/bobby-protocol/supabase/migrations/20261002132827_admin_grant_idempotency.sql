-- Durable dashboard grants. The receipt, additive benefit and audit commit in one transaction.
-- Deploy this migration before the candidate API; during the transition the legacy 5-argument RPC
-- rejects grants. Never restore its additive implementation while the operation-key API is served.
-- iOS 53 reads the existing bonus/Pro tables and requires no balance-contract change.
create table if not exists public.bobby_admin_grant_operations (
  operation_id uuid primary key,
  -- These identifiers deliberately have no account FK: deletion must not free an operation key for
  -- reuse. The receipt stores no token, email or free text and does not block account deletion.
  admin_id uuid not null,
  identity_id uuid not null,
  payload jsonb not null,
  payload_fingerprint text not null check (length(payload_fingerprint) = 32),
  result jsonb,
  audit_id bigint,
  created_at timestamptz not null default now()
);
alter table public.bobby_admin_grant_operations enable row level security;
revoke all on public.bobby_admin_grant_operations from public, anon, authenticated;
grant select, insert, update on public.bobby_admin_grant_operations to service_role;

create or replace function public.bobby_admin_grant_once(
  p_operation uuid, p_admin uuid, p_identity uuid, p_reads int, p_profundo int, p_maximo int, p_pro_days int
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r int := coalesce(p_reads, 0); pf int := coalesce(p_profundo, 0); mx int := coalesce(p_maximo, 0); pd int := coalesce(p_pro_days, 0);
  request_payload jsonb; fingerprint text; receipt public.bobby_admin_grant_operations%rowtype;
  b public.bobby_usage_bonus%rowtype; until timestamptz; answer jsonb; action_id bigint;
begin
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'valid grant operation id required' using errcode = '22023';
  end if;
  -- Validate the live role again inside the transaction, including replays after role removal.
  if not exists (select 1 from public.bobby_admins a join public.bobby_identities i on i.id = a.identity_id
    where a.identity_id = p_admin and i.auth_user_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if r not between 0 and 1000 or pf not between 0 and 200 or mx not between 0 and 100 or pd not between 0 and 366 then
    raise exception 'grant out of range' using errcode = '22023';
  end if;
  if r + pf + mx + pd = 0 then raise exception 'empty grant' using errcode = '22023'; end if;
  request_payload := jsonb_build_object('identityId', p_identity, 'reads', r, 'profundo', pf, 'maximo', mx, 'proDays', pd);
  fingerprint := md5(request_payload::text);
  insert into public.bobby_admin_grant_operations(operation_id, admin_id, identity_id, payload, payload_fingerprint)
    values (p_operation, p_admin, p_identity, request_payload, fingerprint) on conflict (operation_id) do nothing;
  -- A concurrent INSERT waits for the winner's transaction; this row lock serializes all replays.
  select * into strict receipt from public.bobby_admin_grant_operations where operation_id = p_operation for update;
  -- Exact canonical JSON is checked as well as the fingerprint; hash collisions cannot grant access.
  if receipt.admin_id <> p_admin or receipt.identity_id is distinct from p_identity
    or receipt.payload_fingerprint <> fingerprint or receipt.payload <> request_payload then
    return jsonb_build_object('ok', false, 'error', 'operation_conflict');
  end if;
  if receipt.result is not null then return receipt.result; end if;
  if not exists (select 1 from public.bobby_identities where id = p_identity) then
    answer := jsonb_build_object('ok', false, 'error', 'not_found');
    update public.bobby_admin_grant_operations set result = answer where operation_id = p_operation;
    return answer;
  end if;
  -- Failure at the audit, benefit or receipt rolls back all three. No separate HTTP audit is needed.
  insert into public.bobby_admin_actions(admin_id, action, target, detail)
    values (p_admin, 'grant', p_identity::text, request_payload || jsonb_build_object('operationId', p_operation, 'status', 'ok'))
    returning id into action_id;
  if r + pf + mx > 0 then
    insert into public.bobby_usage_bonus as u(identity_id, reads, profundo, maximo) values (p_identity, r, pf, mx)
      on conflict (identity_id) do update set reads = least(u.reads + excluded.reads, 100000),
        profundo = least(u.profundo + excluded.profundo, 100000), maximo = least(u.maximo + excluded.maximo, 100000), updated_at = now()
      returning * into b;
  end if;
  if pd > 0 then
    insert into public.bobby_pro_grants as g(identity_id, pro_until, source) values (p_identity, now() + make_interval(days => pd), 'admin')
      on conflict (identity_id) do update set pro_until = greatest(g.pro_until, now()) + make_interval(days => pd), updated_at = now()
      returning pro_until into until;
  end if;
  answer := jsonb_build_object('ok', true, 'operationId', p_operation,
    'bonus', case when b.identity_id is null then null else jsonb_build_object('reads', b.reads, 'profundo', b.profundo, 'maximo', b.maximo) end,
    'proUntil', until);
  update public.bobby_admin_grant_operations set result = answer, audit_id = action_id where operation_id = p_operation;
  return answer;
end;
$$;
revoke all on function public.bobby_admin_grant_once(uuid, uuid, uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.bobby_admin_grant_once(uuid, uuid, uuid, int, int, int, int) to service_role;

-- Keep the signature so an old deployed API fails visibly instead of silently adding duplicate gifts.
create or replace function public.bobby_admin_grant(p_identity uuid, p_reads int, p_profundo int, p_maximo int, p_pro_days int)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  raise exception 'grant operation id required; use bobby_admin_grant_once' using errcode = '22023';
end;
$$;
revoke all on function public.bobby_admin_grant(uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.bobby_admin_grant(uuid, int, int, int, int) to service_role;
