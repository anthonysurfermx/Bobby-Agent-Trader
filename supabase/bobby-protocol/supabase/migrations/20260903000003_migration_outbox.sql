-- ============================================================
-- migration_outbox — zero-RPO rollback journal for the cut-over.
--
-- After the cut-over the app writes to THIS project. If we must return to
-- the legacy project, every write made in between would be lost unless it
-- was journaled. This table + trigger capture INSERT/UPDATE/DELETE on the
-- approved tables (full new row, pk, old pk on delete) so
-- scripts/migration/replay-outbox.mts can apply them to the other side.
-- Enabled only around the cut-over window (bobby_outbox_enable / disable);
-- the journal is service-role only.
-- ============================================================
create table if not exists public.migration_outbox (
  id            bigint generated always as identity primary key,
  table_name    text not null,
  op            text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  pk            jsonb not null,
  row_data      jsonb,
  captured_at   timestamptz not null default now(),
  replayed_at   timestamptz,
  replay_target text
);
create index if not exists migration_outbox_pending on public.migration_outbox (id) where replayed_at is null;
alter table public.migration_outbox enable row level security;
drop policy if exists migration_outbox_service_all on public.migration_outbox;
create policy migration_outbox_service_all on public.migration_outbox for all to service_role using (true) with check (true);

-- The trigger reads the pk column list from its argument (comma separated).
create or replace function public.bobby_outbox_capture() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_pk_cols text[] := string_to_array(tg_argv[0], ',');
  v_pk jsonb := '{}'::jsonb;
  v_row jsonb;
  v_col text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  foreach v_col in array v_pk_cols loop
    v_pk := v_pk || jsonb_build_object(v_col, v_row -> v_col);
  end loop;
  insert into public.migration_outbox (table_name, op, pk, row_data)
  values (tg_table_name, tg_op, v_pk, case when tg_op = 'DELETE' then null else v_row end);
  return null;
end $$;
revoke all on function public.bobby_outbox_capture() from public, anon, authenticated;

-- Attach the capture trigger to a list of tables: select bobby_outbox_enable('{"forum_threads":"id","dm_conversations":"telegram_user_id,bot_key"}'::jsonb);
create or replace function public.bobby_outbox_enable(p_tables jsonb) returns int
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_t record; v_n int := 0;
begin
  for v_t in select key as tbl, value #>> '{}' as pk from jsonb_each(p_tables) loop
    execute format('drop trigger if exists bobby_outbox on public.%I', v_t.tbl);
    execute format('create trigger bobby_outbox after insert or update or delete on public.%I for each row execute function public.bobby_outbox_capture(%L)', v_t.tbl, v_t.pk);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
create or replace function public.bobby_outbox_disable() returns int
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_t record; v_n int := 0;
begin
  for v_t in select event_object_table as tbl from information_schema.triggers where trigger_name = 'bobby_outbox' and trigger_schema = 'public' group by event_object_table loop
    execute format('drop trigger if exists bobby_outbox on public.%I', v_t.tbl);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.bobby_outbox_enable(jsonb) from public, anon, authenticated;
revoke all on function public.bobby_outbox_disable() from public, anon, authenticated;
grant execute on function public.bobby_outbox_enable(jsonb), public.bobby_outbox_disable() to service_role;
