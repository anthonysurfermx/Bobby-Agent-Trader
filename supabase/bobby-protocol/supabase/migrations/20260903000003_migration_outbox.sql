-- ============================================================
-- migration_outbox — zero-RPO rollback journal for the cut-over, plus the
-- two inspection RPCs verify/replay rely on (bobby_outbox_status,
-- bobby_sequence_check).
--
-- After the cut-over the app writes to THIS project. If we must return to
-- legacy, every write made in between would be lost unless journaled. The
-- capture trigger records INSERT/UPDATE/DELETE on the approved tables (full
-- row, pk) so scripts/migration/replay-outbox.mts can apply them to the
-- other side — with both sides frozen, drained to zero, verified, and only
-- then traffic released. Service-role only. Idempotent.
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

-- select bobby_outbox_enable('{"forum_threads":"id","agent_market_snapshots":"symbol,venue,ts"}'::jsonb);
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
-- Which tables carry the capture trigger right now (replay/verify compare it with the approved list).
create or replace function public.bobby_outbox_status() returns table (table_name text)
language sql security definer set search_path = public, pg_catalog stable as $$
  select event_object_table::text from information_schema.triggers
  where trigger_name = 'bobby_outbox' and trigger_schema = 'public' group by event_object_table order by 1;
$$;
-- Identity sequences vs max(id): a REAL nextval() must land strictly above max(id).
-- (nextval is non-transactional: each call burns one value — harmless.)
create or replace function public.bobby_sequence_check() returns table (table_name text, max_id bigint, last_value bigint, next_value bigint, ok boolean)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_t text; v_seq text; v_max bigint; v_last bigint; v_next bigint;
begin
  foreach v_t in array array['agent_memory','cycle_transitions','llm_calls','hardness_agents','hardness_agent_sessions','hardness_agent_proofs','trade_intents'] loop
    v_seq := pg_get_serial_sequence('public.' || v_t, 'id');
    execute format('select max(id) from public.%I', v_t) into v_max;
    execute format('select last_value from %s', v_seq) into v_last;
    execute format('select nextval(%L)', v_seq) into v_next;
    table_name := v_t; max_id := v_max; last_value := v_last; next_value := v_next; ok := v_next > coalesce(v_max, 0);
    return next;
  end loop;
end $$;
revoke all on function public.bobby_outbox_enable(jsonb), public.bobby_outbox_disable(), public.bobby_outbox_status(), public.bobby_sequence_check() from public, anon, authenticated;
grant execute on function public.bobby_outbox_enable(jsonb), public.bobby_outbox_disable(), public.bobby_outbox_status(), public.bobby_sequence_check() to service_role;
