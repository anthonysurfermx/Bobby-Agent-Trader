-- The users table of 20261001230000 with one more field: is_team = the same rule that leaves an account out of
-- every figure (admins, hand marks, the owner's listed emails), so the list and its "internas" count agree with
-- the rest of the dashboard. is_internal keeps meaning "marked by hand" (what the switch toggles).
create or replace function public.bobby_admin_users(p_query text, p_limit int, p_offset int)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as q),
  esc as (select replace(replace(replace(q.q, '\', '\\'), '%', '\%'), '_', '\_') as e, q.q from q),
  reads_since as (select min(first_read_at) as at from bobby_reader_stats),
  pf as (select * from bobby_admin_people_facts() where kind = 'account'),
  rows as (
    select b.id, nullif(b.email, '') as email, b.provider, b.wallet_address is not null and b.auth_user_id is null as wallet_only,
      case when b.wallet_address is not null then left(b.wallet_address, 6) || '…' || right(b.wallet_address, 4) end as wallet,
      b.created_at, b.last_seen_at,
      s.first_read_at, s.last_read_at, s.reads, s.platform,
      coalesce(pf.reads, 0) - coalesce(s.reads, 0) as guest_reads,
      pf.last_day as last_active_day,
      case when s.first_read_at is not null and b.created_at >= (select at from reads_since)
           then round(extract(epoch from (s.first_read_at - b.created_at)) / 60) end as activation_minutes,
      sub.provider as sub_provider, sub.status as sub_status, sub.current_period_end,
      g.pro_until, g.source as grant_source,
      bonus.reads as bonus_reads, bonus.profundo as bonus_profundo, bonus.maximo as bonus_maximo,
      exists (select 1 from bobby_admins a where a.identity_id = b.id) as is_admin,
      exists (select 1 from bobby_internal_marks m where m.identity_id = b.id) as is_internal,
      bobby_identity_internal(b.id) as is_team,
      (select count(*) from bobby_device_accounts l where l.identity_id = b.id)::int as installs,
      bobby_is_pro(b.id) as pro
    from bobby_identities b
    left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    left join pf on pf.identity_id = b.id
    left join bobby_subscriptions sub on sub.identity_id = b.id
    left join bobby_pro_grants g on g.identity_id = b.id
    left join bobby_usage_bonus bonus on bonus.identity_id = b.id, esc
    where esc.q is null or b.email ilike '%' || esc.e || '%' or b.id::text ilike esc.e || '%' or b.wallet_address ilike '%' || esc.e || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'accounts', (select count(*) from rows where not wallet_only),
    'wallets', (select count(*) from rows where wallet_only),
    'internal', (select count(*) from rows where is_team),
    'readsSince', (select at from reads_since),
    'users', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
      select * from rows order by created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb));
$$;

revoke all on function public.bobby_admin_users(text, int, int) from public, anon, authenticated;
grant execute on function public.bobby_admin_users(text, int, int) to service_role;
