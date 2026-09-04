-- Shared worlds: a builder can publish their island under a short share code
-- so anyone can visit it, and published islands appear in the public gallery.
-- Additive and idempotent: existing rows stay private; nothing is re-shaped.
-- Reads stay behind /api/trader-land-public (service role); anon has no
-- direct access to tl_lands (lock_down_public_reads convention).
alter table public.tl_lands
  add column if not exists visibility text not null default 'private',
  add column if not exists share_code text,
  add column if not exists title text,
  add column if not exists published_at timestamptz;
alter table public.tl_lands drop constraint if exists tl_lands_visibility_check;
alter table public.tl_lands add constraint tl_lands_visibility_check check (visibility in ('private', 'public'));
alter table public.tl_lands drop constraint if exists tl_lands_title_check;
alter table public.tl_lands add constraint tl_lands_title_check check (title is null or char_length(title) between 1 and 40);
alter table public.tl_lands drop constraint if exists tl_lands_share_code_check;
alter table public.tl_lands add constraint tl_lands_share_code_check check (share_code is null or share_code ~ '^[a-z0-9]{10}$');
create unique index if not exists tl_lands_share_code_key on public.tl_lands (share_code) where share_code is not null;
create index if not exists tl_lands_public_recent on public.tl_lands (published_at desc) where visibility = 'public';
