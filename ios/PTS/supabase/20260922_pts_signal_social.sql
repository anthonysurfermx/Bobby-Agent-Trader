-- Applied to Supabase bobby-protocol (qbvdqkknnuweatptjohi) on 2026-09-22 as
-- migration "20260922_pts_signal_social" (approved by Anthony). Rollback SQL is
-- in docs/PTS-voice-contract.md.
--
-- PTS demo: shared likes and comments on curated signals.
-- Additive and isolated behind the pts_ prefix. Tables are closed to direct
-- access; the app goes through SECURITY DEFINER RPCs. A member is a random
-- device secret; only its SHA-256 is stored and it is never returned.

create table if not exists public.pts_signal_likes (
  signal_id text not null check (signal_id ~ '^[a-z0-9-]{3,64}$'),
  member_hash text not null check (char_length(member_hash) = 64),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (signal_id, member_hash)
);

create table if not exists public.pts_signal_comments (
  id uuid primary key default gen_random_uuid(),
  signal_id text not null check (signal_id ~ '^[a-z0-9-]{3,64}$'),
  member_hash text not null check (char_length(member_hash) = 64),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists pts_signal_comments_signal_created_idx on public.pts_signal_comments (signal_id, created_at);
create index if not exists pts_signal_comments_member_created_idx on public.pts_signal_comments (member_hash, created_at);

alter table public.pts_signal_likes enable row level security;
alter table public.pts_signal_comments enable row level security;
revoke all on public.pts_signal_likes, public.pts_signal_comments from anon, authenticated;

create or replace function public.pts_member_hash(p_secret text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_secret is null or char_length(p_secret) < 32 or char_length(p_secret) > 128 then
    raise exception 'invalid_member' using errcode = '22023';
  end if;
  return encode(extensions.digest(p_secret, 'sha256'), 'hex');
end $$;
revoke all on function public.pts_member_hash(text) from public, anon, authenticated;

create or replace function public.pts_signal_feed(p_signal_id text, p_secret text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member text := case when p_secret is null then null else public.pts_member_hash(p_secret) end;
begin
  return jsonb_build_object(
    'signal_id', p_signal_id,
    'like_count', (select count(*) from public.pts_signal_likes where signal_id = p_signal_id),
    'liked', exists (select 1 from public.pts_signal_likes where signal_id = p_signal_id and member_hash = v_member),
    'likes', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.display_name, 'at', l.created_at) order by l.created_at desc)
      from (select display_name, created_at from public.pts_signal_likes
            where signal_id = p_signal_id order by created_at desc limit 50) l), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.display_name, 'body', c.body, 'at', c.created_at,
                                          'mine', coalesce(c.member_hash = v_member, false)) order by c.created_at)
      from (select * from public.pts_signal_comments
            where signal_id = p_signal_id order by created_at desc limit 100) c), '[]'::jsonb)
  );
end $$;

create or replace function public.pts_toggle_like(p_signal_id text, p_secret text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member text := public.pts_member_hash(p_secret);
begin
  if exists (select 1 from public.pts_signal_likes where signal_id = p_signal_id and member_hash = v_member) then
    delete from public.pts_signal_likes where signal_id = p_signal_id and member_hash = v_member;
  else
    insert into public.pts_signal_likes (signal_id, member_hash, display_name)
    values (p_signal_id, v_member, btrim(p_name));
  end if;
  return public.pts_signal_feed(p_signal_id, p_secret);
end $$;

create or replace function public.pts_add_comment(p_signal_id text, p_secret text, p_name text, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member text := public.pts_member_hash(p_secret);
begin
  -- Per-member and per-signal ceilings keep a leaked key from flooding a demo.
  if (select count(*) from public.pts_signal_comments
      where member_hash = v_member and created_at > now() - interval '10 minutes') >= 10
     or (select count(*) from public.pts_signal_comments
      where signal_id = p_signal_id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.pts_signal_comments (signal_id, member_hash, display_name, body)
  values (p_signal_id, v_member, btrim(p_name), btrim(p_body));
  return public.pts_signal_feed(p_signal_id, p_secret);
end $$;

create or replace function public.pts_delete_comment(p_comment_id uuid, p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member text := public.pts_member_hash(p_secret);
  v_signal text;
begin
  delete from public.pts_signal_comments where id = p_comment_id and member_hash = v_member
  returning signal_id into v_signal;
  if v_signal is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return public.pts_signal_feed(v_signal, p_secret);
end $$;

create or replace function public.pts_signal_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(signal_id, jsonb_build_object('likes', likes, 'comments', comments)), '{}'::jsonb)
  from (
    select signal_id, sum(likes)::int as likes, sum(comments)::int as comments
    from (
      select signal_id, count(*) as likes, 0::bigint as comments from public.pts_signal_likes group by signal_id
      union all
      select signal_id, 0::bigint, count(*) from public.pts_signal_comments group by signal_id
    ) t group by signal_id
  ) s;
$$;

revoke all on function public.pts_signal_feed(text, text) from public;
revoke all on function public.pts_toggle_like(text, text, text) from public;
revoke all on function public.pts_add_comment(text, text, text, text) from public;
revoke all on function public.pts_delete_comment(uuid, text) from public;
revoke all on function public.pts_signal_summary() from public;
grant execute on function public.pts_signal_feed(text, text) to anon, authenticated;
grant execute on function public.pts_toggle_like(text, text, text) to anon, authenticated;
grant execute on function public.pts_add_comment(text, text, text, text) to anon, authenticated;
grant execute on function public.pts_delete_comment(uuid, text) to anon, authenticated;
grant execute on function public.pts_signal_summary() to anon, authenticated;
