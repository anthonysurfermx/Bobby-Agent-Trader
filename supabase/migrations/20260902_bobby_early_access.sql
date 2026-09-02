-- Bobby early-access list with explicit consent and provenance (phase 0).
-- Until now the landing wrote into DeFi México's newsletter_subscribers with
-- an "interest" tag, so Bobby's consent could not be told apart from the
-- newsletter's. This table is Bobby's own record; it migrates with Bobby.

create table if not exists public.bobby_early_access (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  consent boolean not null default true,
  consent_text text not null,            -- the exact wording the person saw
  consent_at timestamptz not null default now(),
  source_page text not null default '/app',
  language text not null default 'en' check (language in ('en','es')),
  campaign text not null default 'bobby-ios-early-access',
  referrer text,
  user_agent text,
  ip_hash text,                          -- sha256(salt + ip); never the raw IP
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bobby_early_access_email_idx on public.bobby_early_access (email_normalized);
create index if not exists bobby_early_access_created_idx on public.bobby_early_access (created_at desc);

alter table public.bobby_early_access enable row level security;
-- No anon/authenticated policies: only the service role (the API) reads or writes.
drop policy if exists bobby_early_access_service_all on public.bobby_early_access;
create policy bobby_early_access_service_all on public.bobby_early_access
  for all to service_role using (true) with check (true);
