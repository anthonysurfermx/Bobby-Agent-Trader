-- T0 manifest for the Bobby Protocol cut-over (run READ-ONLY on legacy at freeze time, then on the
-- destination after restore; the two outputs must be identical row for row).
-- Per table: row count, newest timestamp, md5 of every row's text representation in a stable order.
with t(name, ts_col) as (values
 ('agent_cycles','started_at'),('agent_events','created_at'),('agent_trades','created_at'),('agent_positions','opened_at'),('agent_signals','created_at'),
 ('forum_threads','created_at'),('forum_posts','created_at'),('user_feedback','created_at'),('api_cache','updated_at'),('indicator_cache',null),
 ('agent_messages','created_at'),('user_interests','created_at'),('user_digests','created_at'),('sandbox_runs','created_at'),('forum_publish_receipts','consumed_at'),
 ('mcp_payment_challenges','created_at'),('mcp_payment_receipts',null),('hardness_agents',null),('hardness_agent_sessions',null),('hardness_agent_proofs',null),
 ('memory_objects','created_at'),('agent_config',null),('agent_macro_events',null),('agent_market_snapshots',null),('agent_source_health',null),('agent_position_rechecks',null),
 ('telegram_groups',null),('telegram_activation_sessions',null),('telegram_subscriptions',null),('telegram_connections','created_at'),
 ('agent_profiles','created_at'),('dm_conversations',null),('trade_intents',null),('llm_calls',null),('cycle_transitions',null),('agent_memory',null),
 ('bobby_control','updated_at'),('bobby_early_access','created_at'))
select name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', name), false, true, '')))[1]::text as rows,
  case when ts_col is not null then (xpath('/row/m/text()', query_to_xml(format('select max(%I)::text as m from public.%I', ts_col, name), false, true, '')))[1]::text end as max_ts,
  (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) as h from public.%I t', name), false, true, '')))[1]::text as content_md5
from t order by name;
