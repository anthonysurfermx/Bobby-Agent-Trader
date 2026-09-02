-- ============================================================
-- Atomic, single-use forum publication (phase 0, Codex review #3).
--
-- forum-publish used to create the thread and then insert posts one by
-- one: a failing post left a half debate and a 200. Now a single RPC
--   1. records the receipt id (PRIMARY KEY → a second use aborts the whole
--      transaction with 23505 → PostgREST 409),
--   2. inserts the thread,
--   3. inserts every post,
-- all-or-nothing. Service role only. New table + function; no existing
-- table is altered. Idempotent.
-- ============================================================
create table if not exists public.forum_publish_receipts (
  receipt_id   uuid primary key,
  wallet       text not null,
  thread_id    uuid,
  consumed_at  timestamptz not null default now()
);
alter table public.forum_publish_receipts enable row level security;
drop policy if exists forum_publish_receipts_service_all on public.forum_publish_receipts;
create policy forum_publish_receipts_service_all on public.forum_publish_receipts
  for all to service_role using (true) with check (true);

create or replace function public.bobby_publish_debate(
  p_receipt_id uuid,
  p_wallet text,
  p_thread jsonb,
  p_posts jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_thread_id uuid;
  v_post jsonb;
begin
  if p_receipt_id is null or p_wallet is null or p_thread is null or jsonb_typeof(p_posts) <> 'array' or jsonb_array_length(p_posts) < 2 then
    raise exception 'bobby_publish_debate: invalid arguments' using errcode = '22023';
  end if;
  if p_wallet !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'bobby_publish_debate: invalid wallet' using errcode = '22023';
  end if;
  -- conviction is stored on the protocol scale 0..1 (judge-mode / checkpoint / cycles multiply by 10 for display)
  if (p_thread->>'conviction_score') is null or (p_thread->>'conviction_score')::real < 0 or (p_thread->>'conviction_score')::real > 1 then
    raise exception 'bobby_publish_debate: conviction_score must be within 0..1' using errcode = '22023';
  end if;

  -- single use: duplicate receipt → unique_violation → whole call rolls back
  insert into public.forum_publish_receipts (receipt_id, wallet) values (p_receipt_id, lower(p_wallet));

  insert into public.forum_threads (
    topic, trigger_reason, trigger_data, language, conviction_score, price_at_creation,
    symbol, direction, entry_price, stop_price, target_price, expires_at, scope, owner_wallet
  ) values (
    left(p_thread->>'topic', 200),
    'User debate in Bobby Chat',
    coalesce(p_thread->'trigger_data', '{}'::jsonb),
    coalesce(p_thread->>'language', 'en'),
    (p_thread->>'conviction_score')::real,
    '{}'::jsonb,
    p_thread->>'symbol',
    p_thread->>'direction',
    (p_thread->>'entry_price')::real,
    (p_thread->>'stop_price')::real,
    (p_thread->>'target_price')::real,
    coalesce((p_thread->>'expires_at')::timestamptz, now() + interval '48 hours'),
    'public',
    lower(p_wallet)
  ) returning id into v_thread_id;

  for v_post in select * from jsonb_array_elements(p_posts) loop
    insert into public.forum_posts (thread_id, agent, content, data_snapshot)
    values (v_thread_id, v_post->>'agent', left(v_post->>'content', 4000), '{}'::jsonb);
  end loop;

  update public.forum_publish_receipts set thread_id = v_thread_id where receipt_id = p_receipt_id;
  return v_thread_id;
end $$;
revoke all on function public.bobby_publish_debate(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bobby_publish_debate(uuid, text, jsonb, jsonb) to service_role;
