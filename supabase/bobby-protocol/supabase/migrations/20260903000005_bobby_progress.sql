-- ============================================================
-- 20260903_bobby_progress.sql — shared companion progress for Bobby App
-- (iOS + web): identity, XP / level / streak state, the append-only award
-- ledger, and pre-calls (first item of the agreed gamification backlog).
--
-- Today XP lives in UserDefaults (iOS) and localStorage (web) with the same
-- rules; nothing survives a reinstall and app <-> web never meet. This moves
-- the source of truth to the database behind /api/progress. The server owns
-- the rules (points per kind, 3 awards a day, streak with one grace day);
-- clients only report events, so XP cannot be granted by a tampered client.
-- XP is always recomputable from bobby_progress_events.
--
-- Identity: a row in bobby_identities is either a Supabase Auth user (Sign
-- in with Apple on iOS, Apple / Google / magic link on web) or a SIWE wallet
-- (existing web session). One person can later link both — the wallet
-- column on the auth row — which is how progress follows them across
-- platforms. Nothing here references auth.users by FK on purpose: auth may
-- live in the bobby-protocol project while these tables still sit in the
-- legacy database until the cut-over.
--
-- RLS follows the phase-0 convention: service_role does everything through
-- /api; anon sees nothing; authenticated may only SELECT its own rows.
-- Idempotent (IF NOT EXISTS everywhere). Safe on top of the RLS hardening.
-- ============================================================

create table if not exists public.bobby_identities (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique,
  wallet_address  text unique,
  email           text,
  provider        text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  constraint bobby_identities_has_subject check (auth_user_id is not null or wallet_address is not null),
  constraint bobby_identities_wallet_lower check (wallet_address is null or wallet_address = lower(wallet_address))
);

create table if not exists public.bobby_progress (
  identity_id          uuid primary key references public.bobby_identities(id) on delete cascade,
  companion_id         text,
  vibe_id              text not null default 'directo',
  onboarded            boolean not null default false,
  risk_notice_version  integer not null default 0,
  xp                   integer not null default 0 check (xp >= 0),
  streak               integer not null default 0 check (streak >= 0),
  last_day             date,
  daily_awards         integer not null default 0 check (daily_awards >= 0),
  daily_awards_day     date,
  quick_access         jsonb not null default '["BTC","NVDA","ETH"]'::jsonb,
  last_platform        text check (last_platform is null or last_platform in ('ios', 'web')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.bobby_progress_events (
  id               uuid primary key default gen_random_uuid(),
  identity_id      uuid not null references public.bobby_identities(id) on delete cascade,
  client_event_id  uuid not null,
  -- legacy_import: one bounded credit (≤300) for XP earned on a device before
  -- the first sign-in; only accepted while the identity's ledger is empty.
  kind             text not null check (kind in ('read_complete', 'no_trade_respected', 'legacy_import')),
  points           integer not null check (points >= 0),
  awarded          integer not null check (awarded >= 0),
  xp_after         integer not null check (xp_after >= 0),
  platform         text not null check (platform in ('ios', 'web')),
  occurred_at      timestamptz not null,
  day_key          date not null,
  meta             jsonb,
  created_at       timestamptz not null default now(),
  constraint bobby_progress_events_once unique (identity_id, client_event_id)
);
create index if not exists bobby_progress_events_identity_time
  on public.bobby_progress_events (identity_id, occurred_at desc);

-- Pre-call: LONG / SHORT / NO TRADE stated BEFORE the verdict, calibrated at
-- 24h by the server (never by the client). Rewards go through the ledger.
create table if not exists public.bobby_pre_calls (
  id            uuid primary key default gen_random_uuid(),
  identity_id   uuid not null references public.bobby_identities(id) on delete cascade,
  symbol        text not null,
  call          text not null check (call in ('long', 'short', 'no_trade')),
  verdict       text,
  price_at      numeric,
  called_at     timestamptz not null default now(),
  settle_at     timestamptz not null,
  settled_at    timestamptz,
  outcome       text check (outcome is null or outcome in ('aligned', 'misaligned', 'void')),
  event_id      uuid references public.bobby_progress_events(id),
  platform      text not null check (platform in ('ios', 'web'))
);
create index if not exists bobby_pre_calls_pending
  on public.bobby_pre_calls (settle_at) where settled_at is null;

-- ---------- RLS (phase-0 convention) ----------
alter table public.bobby_identities      enable row level security;
alter table public.bobby_progress        enable row level security;
alter table public.bobby_progress_events enable row level security;
alter table public.bobby_pre_calls       enable row level security;

drop policy if exists bobby_identities_service_all      on public.bobby_identities;
drop policy if exists bobby_progress_service_all        on public.bobby_progress;
drop policy if exists bobby_progress_events_service_all on public.bobby_progress_events;
drop policy if exists bobby_pre_calls_service_all       on public.bobby_pre_calls;
create policy bobby_identities_service_all      on public.bobby_identities      for all to service_role using (true) with check (true);
create policy bobby_progress_service_all        on public.bobby_progress        for all to service_role using (true) with check (true);
create policy bobby_progress_events_service_all on public.bobby_progress_events for all to service_role using (true) with check (true);
create policy bobby_pre_calls_service_all       on public.bobby_pre_calls       for all to service_role using (true) with check (true);

-- Phase-0 convention (enforced by the RLS gate): per-user tables are
-- service-role only — no anon or authenticated policy at all. Every read and
-- write goes through /api/progress with a wallet session or a Supabase access
-- token. (An earlier draft added authenticated own-row SELECT policies; the
-- gate rejected them and they were dropped.)

-- Verification (after applying): select * from public.bobby_rls_matrix()
-- where table_name like 'bobby_%'; expect service_role ALL + authenticated
-- SELECT only, nothing for anon or public.
