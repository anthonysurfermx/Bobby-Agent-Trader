-- A Pro account keeps its gifted Quick balance while its unlimited Pro reads are active.
-- The balance is displayed on web/iOS and remains available after Pro expires; Pro reads
-- continue to use the existing unlimited path and do not spend the gift.
create or replace function public.bobby_read_access(p_identity uuid, p_device text, p_paywall boolean)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare used int; oldest timestamptz;
begin
  if p_identity is not null then
    if bobby_is_pro(p_identity) then
      return jsonb_build_object('tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null,
        'bonus', coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0));
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and not bonus and created_at > now() - interval '7 days';
    return jsonb_build_object('tier', 'free', 'used', used, 'limit', 10,
      'resetsAt', case when used > 0 then oldest + interval '7 days' else null end,
      'bonus', coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0));
  end if;
  if p_device is null then
    return jsonb_build_object('tier', 'anon', 'used', null, 'limit', null, 'resetsAt', null);
  end if;
  select count(*) into used from bobby_reads
    where identity_id is null and device_hash = p_device and created_at > now() - interval '30 days';
  return jsonb_build_object('tier', 'anon', 'used', used, 'limit', 3, 'resetsAt', null);
end;
$$;

revoke all on function public.bobby_read_access(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.bobby_read_access(uuid, text, boolean) to service_role;

-- Preserve the full duration of admin-gifted Pro for an already paying member.
-- Replacing the function leaves existing operation receipts and replay behavior unchanged.
create or replace function public.bobby_admin_grant_once(
  p_operation uuid, p_admin uuid, p_identity uuid, p_reads int, p_profundo int, p_maximo int, p_pro_days int
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r int := coalesce(p_reads, 0); pf int := coalesce(p_profundo, 0); mx int := coalesce(p_maximo, 0); pd int := coalesce(p_pro_days, 0);
  request_payload jsonb; fingerprint text; receipt public.bobby_admin_grant_operations%rowtype;
  b public.bobby_usage_bonus%rowtype; until timestamptz; paid_until timestamptz; answer jsonb; action_id bigint;
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
  if pd > 0 and exists (
    select 1 from public.bobby_subscriptions s where s.identity_id = p_identity
      and s.status in ('active', 'trialing') and s.current_period_end is null
  ) then
    -- An open-ended paid period has no date after which to place gifted Pro days. No audit,
    -- reads, Pro grant or receipt is committed; the same intent may be retried after billing sync.
    delete from public.bobby_admin_grant_operations where operation_id = p_operation;
    return jsonb_build_object('ok', false, 'error', 'paid_period_end_unknown');
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
    -- A paid member receives the full gifted duration after the current paid period.
    select max(s.current_period_end) into paid_until from public.bobby_subscriptions s
      where s.identity_id = p_identity and s.status in ('active', 'trialing') and s.current_period_end > now();
    insert into public.bobby_pro_grants as g(identity_id, pro_until, source)
      values (p_identity, greatest(now(), coalesce(paid_until, now())) + make_interval(days => pd), 'admin')
      on conflict (identity_id) do update
        set pro_until = greatest(g.pro_until, now(), coalesce(paid_until, now())) + make_interval(days => pd),
            source = 'admin', updated_at = now()
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
