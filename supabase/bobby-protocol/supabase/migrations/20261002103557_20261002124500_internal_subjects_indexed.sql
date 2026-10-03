create or replace function public.bobby_internal_subjects(p_with_networks boolean default true)
returns table (kind text, id text) language sql stable security invoker set search_path = public, pg_temp as $$
  with recursive seeds(aid, did) as (
    select identity_id, null::text from bobby_admins
    union select identity_id, null from bobby_internal_marks
    union select b.id, null from bobby_identities b join bobby_admin_settings s on s.key = 'internal_emails'
      where nullif(b.email, '') is not null and s.value ? lower(b.email)
    union select null::uuid, device_hash from bobby_devices where internal or admin_session
    union select null::uuid, dn.device_hash from bobby_device_networks dn
      join bobby_internal_networks n on n.network_hash = dn.network_hash and not n.ignored
      where coalesce(p_with_networks, true)
  ), walk(aid, did) as (
    select aid, did from seeds
    union
    select case when w.aid is null then l.identity_id end, case when w.aid is not null then l.device_hash end
    from walk w join bobby_device_accounts l on l.identity_id = w.aid or l.device_hash = w.did
  )
  select case when aid is not null then 'a' else 'd' end, coalesce(aid::text, did) from walk;
$$;
