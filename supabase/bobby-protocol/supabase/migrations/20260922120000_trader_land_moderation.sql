-- Publication is approved server-side; reports are private and cannot self-ban.
begin;
alter table public.tl_lands
  add column if not exists moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  add column if not exists community_blocked boolean not null default false;

create table if not exists public.tl_content_reports (
  id uuid primary key default gen_random_uuid(),
  target_identity uuid not null references public.bobby_identities(id) on delete cascade,
  reporter_hash text not null check (reporter_hash ~ '^[a-f0-9]{64}$'),
  code text not null check (code ~ '^[a-z0-9]{10}$'),
  title text,
  reason text not null check (reason in ('offensive','harassment','spam','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (reporter_hash, target_identity)
);
alter table public.tl_content_reports enable row level security;
revoke all on public.tl_content_reports from public, anon, authenticated;
grant select, insert, update, delete on public.tl_content_reports to service_role;
create index if not exists tl_content_reports_queue on public.tl_content_reports(status, created_at);

-- The same row lock serializes publication with an operator blocking a creator.
create or replace function public.tl_publish_reviewed(p_identity uuid, p_code text, p_title text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_land public.tl_lands%rowtype;
begin
  select * into v_land from public.tl_lands where identity_id = p_identity for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_land.community_blocked then return jsonb_build_object('ok',false,'error','community_blocked'); end if;
  if p_code is null or p_code !~ '^[a-z0-9]{10}$' or char_length(p_title) > 40 then
    return jsonb_build_object('ok',false,'error','invalid_publication');
  end if;
  update public.tl_lands set visibility='public', share_code=coalesce(share_code,p_code),
    title=p_title, moderation_status='approved', published_at=now() where identity_id=p_identity;
  return jsonb_build_object('ok',true,'code',coalesce(v_land.share_code,p_code));
end $$;
revoke all on function public.tl_publish_reviewed(uuid,text,text) from public, anon, authenticated;
grant execute on function public.tl_publish_reviewed(uuid,text,text) to service_role;
commit;
