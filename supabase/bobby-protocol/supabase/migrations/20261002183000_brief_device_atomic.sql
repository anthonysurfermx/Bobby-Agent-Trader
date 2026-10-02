-- One transaction owns both the push binding mutation and its sealed replay receipt.
-- The previous begin -> device RPC -> finish sequence could commit a credential rotation while
-- losing the answer, leaving the phone with an obsolete proof and no way to recover.
-- Apply after 20261002180000_pro_briefings.sql, before serving the build-54 API.
create or replace function public.bobby_push_device_write_once(
  p_identity uuid, p_key text, p_digest text, p_action text, p_installation uuid,
  p_registration uuid, p_expected_revision bigint, p_proof_verifier text,
  p_new_verifier text, p_token_ciphertext text, p_token_fingerprint text,
  p_environment text, p_topic text, p_permission text, p_app_build int,
  p_max_active int, p_sealed_credential text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  v_receipt public.bobby_brief_idempotency;
  v_device jsonb;
  v_response jsonb;
  v_status int;
  v_inserted int;
begin
  if p_identity is null or p_key is null or p_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
     or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
     or p_action is null or p_action not in ('register', 'rebind') or p_new_verifier is null
     or p_new_verifier !~ '^[0-9a-f]{64}$'
     or p_sealed_credential is null or length(p_sealed_credential) not between 16 and 4096 then
    perform public.bobby_brief_bad('device_write');
  end if;
  if (p_action = 'register' and (p_installation is null or p_registration is not null or p_expected_revision is not null or p_proof_verifier is not null))
     or (p_action = 'rebind' and (p_registration is null or p_expected_revision is null or p_proof_verifier is null)) then
    perform public.bobby_brief_bad('device_action');
  end if;

  -- INSERT ON CONFLICT waits for a concurrent transaction with this operation key. The row lock
  -- then sees its final receipt. No abandoned in-progress row is ever blindly replayed.
  insert into public.bobby_brief_idempotency (identity_id, scope, idem_key, digest, expires_at)
    values (p_identity, 'device_atomic', p_key, p_digest, now() + interval '24 hours')
    on conflict (identity_id, scope, idem_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_receipt from public.bobby_brief_idempotency
    where identity_id = p_identity and scope = 'device_atomic' and idem_key = p_key for update;
  if v_receipt.digest <> p_digest then return jsonb_build_object('state', 'mismatch'); end if;
  if v_receipt.state = 'done' then
    return jsonb_build_object('state', 'replay', 'status', v_receipt.status, 'response', v_receipt.response);
  end if;
  if v_inserted = 0 then
    -- An old in-progress row has no trusted mutation outcome. A concurrent writer has already
    -- completed before this lock is acquired, so it would have returned the receipt above.
    return jsonb_build_object('state', 'in_progress');
  end if;

  if p_action = 'register' then
    v_device := public.bobby_push_device_register(p_identity, p_installation, p_token_ciphertext,
      p_token_fingerprint, p_environment, p_topic, p_permission, p_app_build,
      p_new_verifier, p_max_active);
  else
    v_device := public.bobby_push_device_rebind(p_identity, p_registration, p_expected_revision,
      p_proof_verifier, p_new_verifier, p_token_ciphertext, p_token_fingerprint,
      p_environment, p_topic, p_permission, p_app_build, p_max_active);
  end if;
  if coalesce((v_device ->> 'ok')::boolean, false) then
    v_status := case when p_action = 'register' then 201 else 200 end;
    v_response := jsonb_build_object('device', v_device, 'sealedCredential', p_sealed_credential);
  else
    v_status := case when v_device ->> 'code' = 'not_found' then 404 else 409 end;
    v_response := jsonb_build_object('device', v_device);
  end if;
  update public.bobby_brief_idempotency
    set state = 'done', status = v_status, response = v_response::text, updated_at = now()
    where identity_id = p_identity and scope = 'device_atomic' and idem_key = p_key;
  return jsonb_build_object('state', 'done', 'status', v_status, 'response', v_response::text);
end;
$$;

revoke all on function public.bobby_push_device_write_once(uuid,text,text,text,uuid,uuid,bigint,text,text,text,text,text,text,text,int,int,text)
  from public, anon, authenticated;
grant execute on function public.bobby_push_device_write_once(uuid,text,text,text,uuid,uuid,bigint,text,text,text,text,text,text,text,int,int,text)
  to service_role;
