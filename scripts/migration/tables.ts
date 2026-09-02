// ============================================================
// The approved table list for the legacy → bobby-protocol copy.
// Source of truth for every tool in scripts/migration/. Derived from the
// legacy PostgREST OpenAPI (2026-09-03) and the repo migrations; order is
// FK-safe (parents before children). Everything else in the legacy project
// (DeFi México product tables: startups, events, courses, blog…) stays where
// it is — this is a copy-out of Bobby's data, not a move of the database.
// ============================================================

export interface TableSpec {
  name: string;
  /** Primary key column(s) — copied verbatim, never regenerated. */
  pk: string[];
  /** Foreign keys as "column->table.column" (orphan checks + ordering). */
  fks: string[];
  /** bigint identity PK: needs setval() on the destination after the copy. */
  identity?: string;
  /** Column to order pages by when exporting (pk by default). */
  orderBy?: string;
  /** Columns that carry on-chain proofs — must survive the copy byte for byte. */
  proofColumns?: string[];
}

export const APPROVED_TABLES: TableSpec[] = [
  // ---- no dependencies ----
  { name: 'agent_config', pk: ['key'], fks: [] },
  { name: 'agent_cycles', pk: ['id'], fks: [] },
  { name: 'agent_events', pk: ['id'], fks: [], proofColumns: ['payment_tx', 'trade_tx'] },
  { name: 'agent_macro_events', pk: ['event_key'], fks: [] },
  { name: 'agent_market_snapshots', pk: ['symbol', 'venue', 'ts'], fks: [] },
  { name: 'agent_memory', pk: ['id'], fks: [], identity: 'id' },
  { name: 'agent_messages', pk: ['id'], fks: [] },
  { name: 'agent_positions', pk: ['id'], fks: [] },
  { name: 'agent_profiles', pk: ['id'], fks: [] },
  { name: 'agent_source_health', pk: ['source', 'checked_at'], fks: [] },
  { name: 'api_cache', pk: ['cache_key'], fks: [] },
  { name: 'bobby_control', pk: ['id'], fks: [] },
  { name: 'bobby_early_access', pk: ['id'], fks: [] },
  { name: 'cycle_transitions', pk: ['id'], fks: [], identity: 'id' },
  { name: 'dm_conversations', pk: ['telegram_user_id', 'bot_key'], fks: [] },
  { name: 'forum_publish_receipts', pk: ['receipt_id'], fks: [] },
  { name: 'hardness_agents', pk: ['id'], fks: [], identity: 'id' },
  { name: 'hardness_agent_sessions', pk: ['id'], fks: [], identity: 'id' },
  { name: 'hardness_agent_proofs', pk: ['id'], fks: [], identity: 'id', proofColumns: ['prediction_hash', 'commit_tx_hash', 'signal_tx_hash', 'resolve_tx_hash'] },
  { name: 'indicator_cache', pk: ['id'], fks: [] },
  { name: 'llm_calls', pk: ['id'], fks: [], identity: 'id' },
  { name: 'mcp_payment_challenges', pk: ['challenge_id'], fks: [] },
  { name: 'memory_objects', pk: ['id'], fks: [] },
  { name: 'sandbox_runs', pk: ['id'], fks: [] },
  { name: 'telegram_groups', pk: ['id'], fks: [] },
  { name: 'trade_intents', pk: ['id'], fks: [], identity: 'id' },
  { name: 'user_feedback', pk: ['id'], fks: [] },
  { name: 'user_interests', pk: ['id'], fks: [] },
  // ---- depend on the above ----
  { name: 'agent_signals', pk: ['id'], fks: ['cycle_id->agent_cycles.id'] },
  { name: 'agent_trades', pk: ['id'], fks: ['cycle_id->agent_cycles.id'], proofColumns: ['tx_hash', 'intent_hash'] },
  { name: 'user_digests', pk: ['id'], fks: ['cycle_id->agent_cycles.id'] },
  { name: 'forum_threads', pk: ['id'], fks: ['agent_profile_id->agent_profiles.id'], proofColumns: ['resolution_tx_hash'] },
  { name: 'forum_posts', pk: ['id'], fks: ['thread_id->forum_threads.id'] },
  { name: 'agent_position_rechecks', pk: ['id'], fks: ['thread_id->forum_threads.id'] },
  { name: 'mcp_payment_receipts', pk: ['tx_hash'], fks: ['challenge_id->mcp_payment_challenges.challenge_id'], proofColumns: ['tx_hash', 'response_hash'] },
  { name: 'telegram_connections', pk: ['id'], fks: ['agent_profile_id->agent_profiles.id'] },
  { name: 'telegram_activation_sessions', pk: ['id'], fks: ['telegram_group_id->telegram_groups.telegram_group_id'] },
  { name: 'telegram_subscriptions', pk: ['id'], fks: ['telegram_group_id->telegram_groups.telegram_group_id'] },
];

export const TABLE_NAMES = APPROVED_TABLES.map((t) => t.name);
export function spec(name: string): TableSpec {
  const s = APPROVED_TABLES.find((t) => t.name === name);
  if (!s) throw new Error(`not an approved table: ${name}`);
  return s;
}
