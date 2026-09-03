// ============================================================
// The approved table list for the legacy → bobby-protocol copy —
// STRICTLY Bobby Protocol. Decision by Anthony (2026-09-03): nothing from
// aigts-bot (dead project), DeFi México or Polymarket travels.
//
// Excluded on purpose and why:
//   telegram_groups, telegram_subscriptions, telegram_activation_sessions,
//   dm_conversations        — aigts-bot GTS group bot (dead); PII (Telegram ids)
//   api_cache               — schema only (baseline already has it). Its 144
//                             legacy rows are 140 rate-limit counters keyed by
//                             the OLD salt (useless after rotation) plus 4
//                             expired cache entries; SIWE nonces live 10 min.
//                             Nothing is worth carrying; anti-replay of debate
//                             receipts lives in forum_publish_receipts, which IS
//                             copied.
//   every DeFi México product table (startups, events, courses, blog, …)
//   any polymarket_* table  — none exists on legacy; the Polymarket radar
//                             only used api_cache entries (expired).
// Order is FK-safe (parents before children). PKs are copied verbatim.
// ============================================================

export interface TableSpec {
  name: string;
  /** Primary key column(s) — copied verbatim, never regenerated. */
  pk: string[];
  /** Foreign keys as "column->table.column" (orphan checks + ordering). */
  fks: string[];
  /** bigint identity PK: needs setval() on the destination after the copy. */
  identity?: string;
  /** Columns that carry on-chain proofs — hashed column by column on both sides. */
  proofColumns?: string[];
  /** pk bounds contain personal data: the manifest records their hash, never the value. */
  pii?: boolean;
  /**
   * Control plane, not data: copied once, NEVER journaled or replayed. A replay
   * of bobby_control would carry `write_freeze=false` onto the rollback target
   * in the middle of a rollback (Codex, 2026-09-03).
   */
  controlPlane?: boolean;
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
  { name: 'bobby_control', pk: ['id'], fks: [], controlPlane: true },
  { name: 'bobby_early_access', pk: ['id'], fks: [] },
  { name: 'cycle_transitions', pk: ['id'], fks: [], identity: 'id' },
  { name: 'forum_publish_receipts', pk: ['receipt_id'], fks: [] },
  { name: 'hardness_agents', pk: ['id'], fks: [], identity: 'id' },
  { name: 'indicator_cache', pk: ['id'], fks: [] },
  { name: 'llm_calls', pk: ['id'], fks: [], identity: 'id' },
  { name: 'mcp_payment_challenges', pk: ['challenge_id'], fks: [] },
  { name: 'memory_objects', pk: ['id'], fks: [] },
  { name: 'sandbox_runs', pk: ['id'], fks: [] },
  { name: 'trade_intents', pk: ['id'], fks: [], identity: 'id' },
  { name: 'user_feedback', pk: ['id'], fks: [] },
  { name: 'user_interests', pk: ['id'], fks: [] },
  // ---- depend on the above ----
  { name: 'hardness_agent_sessions', pk: ['id'], fks: ['agent_id->hardness_agents.agent_id'], identity: 'id' },
  { name: 'hardness_agent_proofs', pk: ['id'], fks: ['session_id->hardness_agent_sessions.session_id'], identity: 'id', proofColumns: ['prediction_hash', 'commit_tx_hash', 'signal_tx_hash', 'resolve_tx_hash'] },
  { name: 'agent_signals', pk: ['id'], fks: ['cycle_id->agent_cycles.id'] },
  { name: 'agent_trades', pk: ['id'], fks: ['cycle_id->agent_cycles.id'], proofColumns: ['tx_hash', 'intent_hash'] },
  { name: 'user_digests', pk: ['id'], fks: ['cycle_id->agent_cycles.id'] },
  { name: 'forum_threads', pk: ['id'], fks: ['agent_profile_id->agent_profiles.id'], proofColumns: ['resolution_tx_hash'] },
  { name: 'forum_posts', pk: ['id'], fks: ['thread_id->forum_threads.id'] },
  { name: 'agent_position_rechecks', pk: ['id'], fks: ['thread_id->forum_threads.id'] },
  { name: 'mcp_payment_receipts', pk: ['tx_hash'], fks: ['challenge_id->mcp_payment_challenges.challenge_id'], proofColumns: ['tx_hash', 'response_hash'] },
  { name: 'telegram_connections', pk: ['id'], fks: ['agent_profile_id->agent_profiles.id'], pii: true },
];

/** Tables that must exist on the destination but carry no rows from legacy. */
export const SCHEMA_ONLY_TABLES = ['api_cache', 'migration_outbox'];

export const TABLE_NAMES = APPROVED_TABLES.map((t) => t.name);
export const IDENTITY_TABLES = APPROVED_TABLES.filter((t) => t.identity);
export function spec(name: string): TableSpec {
  const s = APPROVED_TABLES.find((t) => t.name === name);
  if (!s) throw new Error(`not an approved table: ${name}`);
  return s;
}
/** Tables the rollback journal covers: every approved table except the control plane. */
export const JOURNALED_TABLES = APPROVED_TABLES.filter((t) => !t.controlPlane);
export const CONTROL_PLANE_TABLES = APPROVED_TABLES.filter((t) => t.controlPlane).map((t) => t.name);
/** Argument for bobby_outbox_enable(): the journaled tables with their pk list. */
export function outboxPlan(): Record<string, string> {
  return Object.fromEntries(JOURNALED_TABLES.map((t) => [t.name, t.pk.join(',')]));
}
