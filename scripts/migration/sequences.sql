-- Sync identity sequences on the TARGET after the copy: the copied rows keep
-- their bigint ids, so the sequence must start above the highest one or the
-- first insert after the cut-over fails with a duplicate key.
-- Tables with bigint identity PKs (legacy OpenAPI, 2026-09-03). Verified afterwards by bobby_sequence_check() in verify.mts.
select setval(pg_get_serial_sequence('public.agent_memory', 'id'),            coalesce((select max(id) from public.agent_memory), 0) + 1, false);
select setval(pg_get_serial_sequence('public.cycle_transitions', 'id'),       coalesce((select max(id) from public.cycle_transitions), 0) + 1, false);
select setval(pg_get_serial_sequence('public.llm_calls', 'id'),               coalesce((select max(id) from public.llm_calls), 0) + 1, false);
select setval(pg_get_serial_sequence('public.hardness_agents', 'id'),         coalesce((select max(id) from public.hardness_agents), 0) + 1, false);
select setval(pg_get_serial_sequence('public.hardness_agent_sessions', 'id'), coalesce((select max(id) from public.hardness_agent_sessions), 0) + 1, false);
select setval(pg_get_serial_sequence('public.hardness_agent_proofs', 'id'),   coalesce((select max(id) from public.hardness_agent_proofs), 0) + 1, false);
select setval(pg_get_serial_sequence('public.trade_intents', 'id'),           coalesce((select max(id) from public.trade_intents), 0) + 1, false);
-- Verify: select sequencename, last_value from pg_sequences where schemaname = 'public';
