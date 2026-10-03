-- Optional Android FCM FID support. Apply after the deployed briefings/source-guard migrations.
-- Does not enable FCM or change provider credentials. Existing APNs signatures and wire contract remain.
begin;
alter table public.bobby_push_devices add column if not exists provider text not null default 'apns';
alter table public.bobby_push_devices add column if not exists fcm_project_id text;
alter table public.bobby_push_devices add column if not exists package_name text;
alter table public.bobby_push_devices add column if not exists target_type text;
alter table public.bobby_brief_outbox add column if not exists claim_provider text;
alter table public.bobby_brief_outbox add column if not exists provider_status int;
alter table public.bobby_brief_outbox add column if not exists provider_message_id text;
-- Existing in-flight claims were APNs; preserve their callbacks during a rolling deployment.
update public.bobby_brief_outbox o set claim_provider='apns' where o.state='claimed' and o.claim_provider is null
  and exists(select 1 from public.bobby_push_devices d where d.id=o.device_id and d.provider='apns');
do $constraints$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.bobby_push_devices'::regclass and conname='bobby_push_devices_provider_target_check') then
    alter table public.bobby_push_devices add constraint bobby_push_devices_provider_target_check check (
      (provider='apns' and fcm_project_id is null and package_name is null and target_type is null)
      or (provider='fcm' and fcm_project_id is not null and fcm_project_id ~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
        and package_name is not null and package_name='xyz.bobbyprotocol.bobby' and target_type is not null and target_type='fid'
        and environment='production' and topic=package_name and permission='authorized'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.bobby_brief_outbox'::regclass and conname='bobby_brief_outbox_provider_check') then
    alter table public.bobby_brief_outbox add constraint bobby_brief_outbox_provider_check check (claim_provider is null or claim_provider in ('apns','fcm'));
  end if;
end $constraints$;

-- Preserve v1 rebind semantics; explicitly clear FCM metadata when a proven client switches to APNs.
-- Refuse unexpected drift instead of replacing an unknown production function.
do $apns_rebind$ declare v_oid regprocedure := 'public.bobby_push_device_rebind(uuid,uuid,bigint,text,text,text,text,text,text,text,integer,integer)'::regprocedure; v_def text;
begin
  v_def:=pg_get_functiondef(v_oid);
  if position('provider = ''apns''' in v_def)=0 then
    if position('environment = p_environment, topic = p_topic, permission = p_permission' in v_def)=0
      or position('if d.identity_id = p_identity then' in v_def)=0 then raise exception 'Unknown APNs rebind definition; manual review required'; end if;
    v_def:=replace(v_def,'environment = p_environment, topic = p_topic, permission = p_permission',
      'provider = ''apns'', fcm_project_id = null, package_name = null, target_type = null, environment = p_environment, topic = p_topic, permission = p_permission');
    v_def:=replace(v_def,'if d.identity_id = p_identity then',
      'if d.identity_id = p_identity and d.provider = ''fcm'' then
    update bobby_brief_outbox set state = ''pending'', fence = fence + 1, lease_owner = null, lease_expires_at = null, updated_at = now()
      where device_id = d.id and identity_id = p_identity and state = ''claimed'';
  end if;
  if d.identity_id = p_identity then');
    execute v_def;
  end if;
end $apns_rebind$;

create or replace function public.bobby_brief_fcm_capability_v2()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('registrationVersion',2,'targetType','fid');
$$;

create or replace function public.bobby_push_device_write_once_fcm_v2(
  p_identity uuid, p_key text, p_digest text, p_action text, p_installation uuid,
  p_registration uuid, p_expected_revision bigint, p_proof_verifier text,
  p_new_verifier text, p_token_ciphertext text, p_token_fingerprint text,
  p_environment text, p_topic text, p_permission text, p_app_build int,
  p_max_active int, p_sealed_credential text, p_fcm_project text, p_package text, p_analysis_consent_version int)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  v_receipt public.bobby_brief_idempotency;
  v_device jsonb;
  v_response jsonb;
  v_status int;
  v_inserted int;
  v_settings public.bobby_brief_settings;
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

  if p_fcm_project is null or p_fcm_project !~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' or p_package is distinct from 'xyz.bobbyprotocol.bobby'
    or p_environment is distinct from 'production' or p_topic is distinct from p_package or p_permission is distinct from 'authorized'
    or p_analysis_consent_version is null or p_analysis_consent_version not between 1 and 1000 then perform public.bobby_brief_bad('fcm_target'); end if;

  -- INSERT ON CONFLICT waits for a concurrent transaction with this operation key. The row lock
  -- then sees its final receipt. No abandoned in-progress row is ever blindly replayed.
  insert into public.bobby_brief_idempotency (identity_id, scope, idem_key, digest, expires_at)
    values (p_identity, 'device_fcm_vtwo', p_key, p_digest, now() + interval '24 hours')
    on conflict (identity_id, scope, idem_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_receipt from public.bobby_brief_idempotency
    where identity_id = p_identity and scope = 'device_fcm_vtwo' and idem_key = p_key for update;
  if v_receipt.digest <> p_digest then return jsonb_build_object('state', 'mismatch'); end if;
  if v_receipt.state = 'done' then
    return jsonb_build_object('state', 'replay', 'status', v_receipt.status, 'response', v_receipt.response);
  end if;
  if v_inserted = 0 then
    -- An old in-progress row has no trusted mutation outcome. A concurrent writer has already
    -- completed before this lock is acquired, so it would have returned the receipt above.
    return jsonb_build_object('state', 'in_progress');
  end if;

  select * into v_settings from public.bobby_brief_settings where identity_id = p_identity for update;
  if not found or v_settings.weekly_enabled is not true or v_settings.analysis_consent_enabled is not true
    or v_settings.analysis_consent_version is distinct from p_analysis_consent_version then
    -- Refusal is not cached: accepting consent later may retry this uncommitted operation.
    delete from public.bobby_brief_idempotency where identity_id = p_identity and scope = 'device_fcm_vtwo' and idem_key = p_key;
    return jsonb_build_object('state','done','status',400,'response',jsonb_build_object('device',jsonb_build_object('ok',false,'code','consent_required'))::text);
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
    if not exists (select 1 from public.bobby_push_devices where id = (v_device->>'registrationId')::uuid and installation_id = p_installation) then
      perform public.bobby_brief_bad('installation_mismatch'); -- rollback the mutation and receipt together
    end if;
    update public.bobby_push_devices set provider='fcm', fcm_project_id=p_fcm_project, package_name=p_package, target_type='fid'
      where id=(v_device->>'registrationId')::uuid;
    -- A response from the previous transport/revision cannot finish the new binding's delivery intent.
    update public.bobby_brief_outbox set state='pending', fence=fence+1, lease_owner=null, lease_expires_at=null, updated_at=now()
      where device_id=(v_device->>'registrationId')::uuid and identity_id=p_identity and state='claimed';
    v_status := case when p_action = 'register' then 201 else 200 end;
    v_response := jsonb_build_object('device', v_device, 'sealedCredential', p_sealed_credential);
  else
    v_status := case when v_device ->> 'code' = 'not_found' then 404 else 409 end;
    v_response := jsonb_build_object('device', v_device);
  end if;
  update public.bobby_brief_idempotency
    set state = 'done', status = v_status, response = v_response::text, updated_at = now()
    where identity_id = p_identity and scope = 'device_fcm_vtwo' and idem_key = p_key;
  return jsonb_build_object('state', 'done', 'status', v_status, 'response', v_response::text);
end;
$$;

do $outbox_drift$ declare c text; r text; begin
 c:=pg_get_functiondef('public.bobby_brief_outbox_claim(text,integer,integer)'::regprocedure);
 r:=pg_get_functiondef('public.bobby_brief_outbox_result(uuid,bigint,text,integer,text,integer)'::regprocedure);
 if position('bobby_brief_outbox_claim_v2' in c)=0 and (position('for update of o skip locked' in c)=0 or position('bobby_brief_is_paid_pro(r.identity_id)' in c)=0 or position('s.privacy_epoch <> b.privacy_epoch' in c)=0) then
   raise exception 'Unknown outbox claim definition; manual review required'; end if;
 if position('bobby_brief_outbox_result_v2' in r)=0 and (position('r.claim_binding_revision' in r)=0 or position('r.lease_expires_at <= now()' in r)=0 or position('bobby_push_device_invalidate' in r)=0) then
   raise exception 'Unknown outbox result definition; manual review required'; end if;
end $outbox_drift$;

create or replace function public.bobby_brief_outbox_claim_v2(p_worker text, p_lease_seconds int, p_limit int, p_providers text[],
  p_fcm_project text, p_package text, p_analysis_consent_version int)
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
  if p_providers is null or cardinality(p_providers) not between 1 and 2 or p_providers <@ array['apns','fcm'] is not true
    or p_analysis_consent_version is null or p_analysis_consent_version not between 1 and 1000 then perform bobby_brief_bad('providers'); end if;
  if 'fcm' = any(p_providers) and (p_fcm_project is null or p_fcm_project !~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
    or p_package is distinct from 'xyz.bobbyprotocol.bobby') then perform bobby_brief_bad('fcm_project'); end if;
  if coalesce(length(p_worker), 0) not between 1 and 64 or coalesce(p_lease_seconds, 0) not between 5 and 900 then perform bobby_brief_bad('lease'); end if;
  update bobby_brief_outbox set state = 'expired', lease_owner = null, lease_expires_at = null, updated_at = now()
    where id in (select id from bobby_brief_outbox
                  where expires_at <= now() and (state = 'pending' or (state = 'claimed' and lease_expires_at <= now()))
                  limit 500 for update skip locked);
  for v_round in 1..5 loop
    v_ids := array(select o.id from bobby_brief_outbox o join bobby_push_devices d0 on d0.id = o.device_id
       where d0.provider = any(p_providers)
         and (d0.provider = 'apns' or (d0.fcm_project_id = p_fcm_project and d0.package_name = p_package and d0.target_type = 'fid'))
         and o.expires_at > now()
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
         or b.state is distinct from 'ready' or b.cadence is distinct from 'weekly' or b.identity_id <> r.identity_id
         or s.identity_id is null or not bobby_brief_cadence_on(s, b.cadence)
         or (d.provider = 'fcm' and (s.analysis_consent_enabled is not true or s.analysis_consent_version is distinct from p_analysis_consent_version))
         or (b.uses_memory and s.privacy_epoch <> b.privacy_epoch)
         or not bobby_brief_is_paid_pro(r.identity_id) then
        update bobby_brief_outbox set state = 'cancelled', attempts = v_attempts, lease_owner = null, lease_expires_at = null,
            last_reason = 'stale', updated_at = now() where id = r.id;
      else
        update bobby_brief_outbox set state = 'claimed', attempts = v_attempts, fence = fence + 1, lease_owner = p_worker,
            lease_expires_at = now() + make_interval(secs => p_lease_seconds), claim_binding_revision = r.binding_revision, claim_provider = d.provider, updated_at = now()
          where id = r.id returning fence into v_fence;
        v_items := v_items || jsonb_build_array(jsonb_build_object('id', r.id, 'fence', v_fence, 'briefId', r.brief_id, 'deviceId', r.device_id,
          'provider', d.provider, 'fcmProjectId', d.fcm_project_id, 'packageName', d.package_name, 'targetType', d.target_type,
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
create or replace function public.bobby_brief_outbox_result_v2(p_id uuid, p_fence bigint, p_outcome text, p_provider_status int, p_reason text,
  p_retry_after_seconds int, p_provider text, p_message_id text)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare r bobby_brief_outbox; v_attempts int; v_state text; v_delay int;
begin
  if p_provider is null or p_provider not in ('apns','fcm') then perform bobby_brief_bad('provider'); end if;
  if p_outcome = 'accepted' and p_provider = 'fcm' and (p_message_id is null or length(p_message_id) > 512
    or p_message_id !~ '^projects/[a-z][a-z0-9-]{4,28}[a-z0-9]/messages/[A-Za-z0-9._:/-]+$') then perform bobby_brief_bad('receipt'); end if;
  if p_outcome is null or p_outcome not in ('accepted', 'retry', 'invalid_token', 'ambiguous', 'config') then perform bobby_brief_bad('outcome'); end if;
  select * into r from bobby_brief_outbox where id = p_id for update;
  if not found or r.state <> 'claimed' or r.claim_provider is distinct from p_provider or r.fence <> p_fence or r.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'stale_fence');
  end if;
  if p_outcome='accepted' and p_provider='fcm' and not exists (
    select 1 from bobby_push_devices d where d.id=r.device_id and d.provider='fcm'
      and p_message_id like 'projects/' || d.fcm_project_id || '/messages/%') then perform bobby_brief_bad('receipt_project'); end if;
  v_delay := least(greatest(coalesce(p_retry_after_seconds, case when p_outcome = 'config' then 60 else 30 end), 5), case when p_provider='fcm' then 86400 else 3600 end);
  if p_outcome = 'accepted' then
    v_state := 'sent';
    update bobby_brief_outbox set state = 'sent', attempts = attempts + 1, provider_status = p_provider_status, apns_status = case when p_provider = 'apns' then p_provider_status else apns_status end, provider_message_id = case when p_provider = 'apns' then r.apns_id::text else p_message_id end, last_reason = null, sent_at = now(),
        lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
  elsif p_outcome = 'config' then
    v_state := 'pending';
    update bobby_brief_outbox set state = 'pending', due_at = now() + make_interval(secs => v_delay), provider_status = p_provider_status, apns_status = case when p_provider = 'apns' then p_provider_status else apns_status end,
        last_reason = left(p_reason, 48), lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
  elsif p_outcome = 'invalid_token' then
    v_attempts := r.attempts + 1;
    perform bobby_push_device_invalidate(r.device_id, r.claim_binding_revision, coalesce(p_reason, 'invalid_token'));
    v_state := case when r.binding_revision <> r.claim_binding_revision and v_attempts < 3 then 'pending' else 'failed' end;
    update bobby_brief_outbox set state = v_state, attempts = v_attempts, provider_status = p_provider_status, apns_status = case when p_provider = 'apns' then p_provider_status else apns_status end, last_reason = left(p_reason, 48),
        due_at = case when v_state = 'pending' then now() else due_at end, lease_owner = null, lease_expires_at = null, updated_at = now()
      where id = p_id;
  else
    v_attempts := r.attempts + 1;
    v_state := case when v_attempts >= 3 then 'failed' else 'pending' end;
    update bobby_brief_outbox set state = v_state, attempts = v_attempts, provider_status = p_provider_status, apns_status = case when p_provider = 'apns' then p_provider_status else apns_status end, last_reason = left(p_reason, 48),
        due_at = now() + make_interval(secs => v_delay), lease_owner = null, lease_expires_at = null, updated_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- Old workers claim APNs only. A provider without configuration is never selected or charged an attempt.
create or replace function public.bobby_brief_outbox_claim(p_worker text,p_lease_seconds int,p_limit int)
returns jsonb language sql volatile security invoker set search_path=public,pg_temp as $$
 -- Preserve the exact v1 claim JSON shape for existing APNs workers.
 select jsonb_build_object('items',coalesce(jsonb_agg(item-'provider'-'fcmProjectId'-'packageName'-'targetType' order by ord),'[]'::jsonb))
 from jsonb_array_elements(bobby_brief_outbox_claim_v2(p_worker,p_lease_seconds,p_limit,array['apns'],null,'xyz.bobbyprotocol.bobby',1)->'items')
   with ordinality as t(item,ord);
$$;
create or replace function public.bobby_brief_outbox_result(p_id uuid,p_fence bigint,p_outcome text,p_apns_status int,p_reason text,p_retry_after_seconds int)
returns jsonb language sql volatile security invoker set search_path=public,pg_temp as $$
 select bobby_brief_outbox_result_v2(p_id,p_fence,p_outcome,p_apns_status,p_reason,p_retry_after_seconds,'apns',null);
$$;

-- Service-only invoker RPCs; no widening of client registry access or existing RLS.
revoke all on function public.bobby_brief_fcm_capability_v2() from public,anon,authenticated;
grant execute on function public.bobby_brief_fcm_capability_v2() to service_role;
revoke all on function public.bobby_push_device_write_once_fcm_v2(uuid,text,text,text,uuid,uuid,bigint,text,text,text,text,text,text,text,integer,integer,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.bobby_push_device_write_once_fcm_v2(uuid,text,text,text,uuid,uuid,bigint,text,text,text,text,text,text,text,integer,integer,text,text,text,integer) to service_role;
revoke all on function public.bobby_brief_outbox_claim_v2(text,integer,integer,text[],text,text,integer) from public,anon,authenticated;
grant execute on function public.bobby_brief_outbox_claim_v2(text,integer,integer,text[],text,text,integer) to service_role;
revoke all on function public.bobby_brief_outbox_result_v2(uuid,bigint,text,integer,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.bobby_brief_outbox_result_v2(uuid,bigint,text,integer,text,integer,text,text) to service_role;

commit;
