-- Bobby dynamic control flags (phase 0 of the DeFi México → Bobby split).
-- Read by api/_lib/control.ts with the service role. No anon/authenticated
-- policies on purpose: RLS on + no policy = only the service role can read
-- or write. Flip the flags from the Supabase dashboard; no redeploy needed.
--
-- Apply to the database Bobby currently uses (then it migrates with the rest).

create table if not exists public.bobby_control (
  id text primary key default 'global',
  write_freeze boolean not null default false,
  canary boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.bobby_control enable row level security;

insert into public.bobby_control (id, write_freeze, canary, note)
values ('global', false, false, 'created by phase 0 migration')
on conflict (id) do nothing;

-- Keep updated_at honest.
create or replace function public.bobby_control_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bobby_control_touch on public.bobby_control;
create trigger bobby_control_touch
before update on public.bobby_control
for each row execute function public.bobby_control_touch();
