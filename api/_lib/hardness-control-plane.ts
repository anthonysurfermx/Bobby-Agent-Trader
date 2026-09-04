import { assertWritesOpen } from './control.js';
import { bobbyDbUrl, bobbyServiceKey } from './bobby-db.js';
const SB_URL =
  bobbyDbUrl();
const SB_KEY =
  bobbyServiceKey() ||
  '';

function headers(prefer?: string) {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function hasSupabase(): boolean {
  return Boolean(SB_URL && SB_KEY);
}

export interface AgentRiskPolicy {
  minHardnessScore?: number;
  maxNotionalUsd?: number;
  allowedSymbols?: string[];
  requireJudge?: boolean;
  requireOnchainProof?: boolean;
  mode?: 'advisory' | 'auto' | 'paper';
}

export interface AgentRecord {
  agent_id: string;
  owner_address: string;
  name: string;
  agent_type?: string;
  version?: string | null;
  /** BP-10 optimistic-lock counter (`hardness_agents.row_version`); `version` is the agent's semver label. */
  row_version?: number;
  capabilities?: string[];
  mcp_endpoint?: string | null;
  webhook_url?: string | null;
  metadata_json?: Record<string, unknown>;
  risk_policy_json?: AgentRiskPolicy;
  status?: string;
}

export interface AgentSessionRecord {
  session_id: string;
  agent_id: string;
  intent: string;
  symbol?: string | null;
  direction?: string | null;
  request_json?: Record<string, unknown>;
  context_json?: Record<string, unknown>;
  decision_json?: Record<string, unknown>;
  policy_result?: string | null;
  hardness_score?: number | null;
  status?: string;
}

export interface AgentProofRecord {
  session_id: string;
  prediction_hash?: string | null;
  commit_tx_hash?: string | null;
  signal_tx_hash?: string | null;
  resolve_tx_hash?: string | null;
  chain_id?: number;
}

export async function upsertAgent(agent: AgentRecord) {
  await assertWritesOpen('hardness upsertAgent');
  if (!hasSupabase()) return null;
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agents?on_conflict=agent_id`, {
    method: 'POST',
    headers: headers('resolution=merge-duplicates,return=representation'),
    body: JSON.stringify({
      agent_id: agent.agent_id,
      owner_address: agent.owner_address,
      name: agent.name,
      agent_type: agent.agent_type || 'trading-agent',
      version: agent.version || null,
      capabilities: agent.capabilities || ['predict'],
      mcp_endpoint: agent.mcp_endpoint || null,
      webhook_url: agent.webhook_url || null,
      metadata_json: agent.metadata_json || {},
      risk_policy_json: agent.risk_policy_json || {},
      status: agent.status || 'active',
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function getAgent(agentId: string) {
  if (!hasSupabase()) return null;
  const query = new URLSearchParams({
    select: '*',
    agent_id: `eq.${agentId}`,
    limit: '1',
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agents?${query.toString()}`, { headers: headers() });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

/** BP-10: a read that FAILED is not "not found". Throws on any non-2xx so the caller never authorises against a guess. */
export class AgentReadError extends Error {}
export async function getAgentStrict(agentId: string): Promise<Record<string, any> | null> {
  if (!hasSupabase()) throw new AgentReadError('agent registry not configured');
  const query = new URLSearchParams({ select: '*', agent_id: `eq.${agentId}`, limit: '1' });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agents?${query.toString()}`, { headers: headers() });
  if (!res.ok) throw new AgentReadError(`agent registry read failed (HTTP ${res.status})`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new AgentReadError('agent registry read returned no array');
  return rows[0] || null;
}

export type AgentCasError = 'NOT_FOUND' | 'OWNER_MISMATCH' | 'OWNER_CHANGE_REQUIRES_TRANSFER' | 'STALE_VERSION' | 'REQUEST_REPLAYED' | 'INVALID_OWNER';
const CAS_ERRORS = new Set<AgentCasError>(['NOT_FOUND', 'OWNER_MISMATCH', 'OWNER_CHANGE_REQUIRES_TRANSFER', 'STALE_VERSION', 'REQUEST_REPLAYED', 'INVALID_OWNER']);

async function callRpc(fn: string, body: Record<string, unknown>): Promise<{ ok: true; row: Record<string, any> } | { ok: false; error: AgentCasError | 'RPC_FAILED'; detail: string }> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    const m = text.match(/(NOT_FOUND|OWNER_MISMATCH|OWNER_CHANGE_REQUIRES_TRANSFER|STALE_VERSION|REQUEST_REPLAYED|INVALID_OWNER)/);
    return { ok: false, error: m && CAS_ERRORS.has(m[1] as AgentCasError) ? (m[1] as AgentCasError) : 'RPC_FAILED', detail: text.slice(0, 300) };
  }
  try { return { ok: true, row: JSON.parse(text) }; } catch { return { ok: false, error: 'RPC_FAILED', detail: 'non-JSON rpc response' }; }
}

/**
 * BP-10: compare-and-swap registration. `expectedOwner`/`expectedVersion` are what
 * the caller AUTHORISED against (null for a creation); the database refuses the
 * write if the row moved or the owner differs. Never changes ownership.
 */
export async function registerAgentCas(agent: AgentRecord, expected: { owner: string | null; rowVersion: number | null }) {
  await assertWritesOpen('hardness registerAgentCas');
  if (!hasSupabase()) return { ok: false as const, error: 'RPC_FAILED' as const, detail: 'not configured' };
  return callRpc('hardness_register_agent', {
    p_agent_id: agent.agent_id,
    p_expected_owner: expected.owner,
    p_expected_version: expected.rowVersion, // = hardness_agents.row_version, never the semver `version`
    p_row: {
      owner_address: agent.owner_address,
      name: agent.name,
      agent_type: agent.agent_type || 'trading-agent',
      version: agent.version || null,
      capabilities: agent.capabilities || ['predict'],
      mcp_endpoint: agent.mcp_endpoint || null,
      webhook_url: agent.webhook_url || null,
      metadata_json: agent.metadata_json || {},
      risk_policy_json: agent.risk_policy_json || {},
      status: agent.status || 'active',
    },
  });
}

/** BP-10: explicit ownership transfer — current owner, row version and a single-use request id. */
export async function transferAgentOwner(agentId: string, currentOwner: string, newOwner: string, expectedRowVersion: number, requestId: string) {
  await assertWritesOpen('hardness transferAgentOwner');
  if (!hasSupabase()) return { ok: false as const, error: 'RPC_FAILED' as const, detail: 'not configured' };
  return callRpc('hardness_transfer_agent', { p_agent_id: agentId, p_current_owner: currentOwner, p_new_owner: newOwner, p_expected_version: expectedRowVersion, p_request_id: requestId });
}

export async function createSession(session: AgentSessionRecord) {
  await assertWritesOpen('hardness createSession');
  if (!hasSupabase()) return null;
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_sessions`, {
    method: 'POST',
    headers: headers('return=representation'),
    body: JSON.stringify({
      session_id: session.session_id,
      agent_id: session.agent_id,
      intent: session.intent,
      symbol: session.symbol || null,
      direction: session.direction || null,
      request_json: session.request_json || {},
      context_json: session.context_json || {},
      decision_json: session.decision_json || {},
      policy_result: session.policy_result || null,
      hardness_score: session.hardness_score ?? null,
      status: session.status || 'received',
    }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateSession(sessionId: string, patch: Record<string, unknown>) {
  await assertWritesOpen('hardness updateSession');
  if (!hasSupabase()) return false;
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_sessions?session_id=eq.${sessionId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

export async function createProof(proof: AgentProofRecord) {
  await assertWritesOpen('hardness createProof');
  if (!hasSupabase()) return null;
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_proofs`, {
    method: 'POST',
    headers: headers('return=representation'),
    body: JSON.stringify({
      session_id: proof.session_id,
      prediction_hash: proof.prediction_hash || null,
      commit_tx_hash: proof.commit_tx_hash || null,
      signal_tx_hash: proof.signal_tx_hash || null,
      resolve_tx_hash: proof.resolve_tx_hash || null,
      chain_id: proof.chain_id || 196,
    }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function listAgentSessions(agentId: string, limit = 20) {
  if (!hasSupabase()) return [];
  const query = new URLSearchParams({
    select: 'session_id,agent_id,intent,symbol,direction,policy_result,hardness_score,status,decision_json,created_at',
    agent_id: `eq.${agentId}`,
    order: 'created_at.desc',
    limit: String(limit),
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_sessions?${query.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function listProofsBySessions(sessionIds: string[]) {
  if (!hasSupabase() || sessionIds.length === 0) return [];
  const query = new URLSearchParams({
    select: 'session_id,prediction_hash,commit_tx_hash,signal_tx_hash,resolve_tx_hash,chain_id,created_at',
    session_id: `in.(${sessionIds.map((id) => `"${id}"`).join(',')})`,
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_proofs?${query.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function getConsensusRows(symbol: string) {
  if (!hasSupabase()) return [];
  const query = new URLSearchParams({
    select: 'agent_id,hardness_score,decision_json,created_at',
    symbol: `eq.${symbol}`,
    order: 'created_at.desc',
    limit: '100',
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_sessions?${query.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function listAgents(limit = 50) {
  if (!hasSupabase()) return [];
  const query = new URLSearchParams({
    select: 'agent_id,name,owner_address,agent_type,version,capabilities,status,created_at,updated_at',
    order: 'created_at.desc',
    limit: String(limit),
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agents?${query.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function countAgents() {
  if (!hasSupabase()) return 0;
  const query = new URLSearchParams({
    select: 'agent_id',
    limit: '1000',
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agents?${query.toString()}`, { headers: headers() });
  if (!res.ok) return 0;
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

export async function listRecentSessions(limit = 25) {
  if (!hasSupabase()) return [];
  const query = new URLSearchParams({
    select: 'session_id,agent_id,symbol,direction,policy_result,hardness_score,status,decision_json,created_at',
    order: 'created_at.desc',
    limit: String(limit),
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_sessions?${query.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function getAgentOutcomeStats(agentId: string) {
  if (!hasSupabase()) {
    return { totalPredictions: 0, resolved: 0, winRateBps: 0, avgHardnessScore: 0 };
  }

  const query = new URLSearchParams({
    select: 'hardness_score,decision_json,status',
    agent_id: `eq.${agentId}`,
    order: 'created_at.desc',
    limit: '500',
  });
  const res = await fetch(`${SB_URL}/rest/v1/hardness_agent_sessions?${query.toString()}`, { headers: headers() });
  if (!res.ok) {
    return { totalPredictions: 0, resolved: 0, winRateBps: 0, avgHardnessScore: 0 };
  }

  const rows = await res.json();
  const items = Array.isArray(rows) ? rows : [];
  let resolved = 0;
  let wins = 0;
  let totalHardness = 0;
  let hardnessCount = 0;

  for (const row of items) {
    if (typeof row.hardness_score === 'number') {
      totalHardness += row.hardness_score;
      hardnessCount += 1;
    }
    const outcome = row.decision_json?.outcome;
    if (outcome === 'win' || outcome === 'loss' || outcome === 'break_even') {
      resolved += 1;
      if (outcome === 'win') wins += 1;
    }
  }

  return {
    totalPredictions: items.length,
    resolved,
    winRateBps: resolved > 0 ? Math.round((wins / resolved) * 10000) : 0,
    avgHardnessScore: hardnessCount > 0 ? Math.round(totalHardness / hardnessCount) : 0,
  };
}

export function evaluatePolicy(
  policy: AgentRiskPolicy | undefined,
  input: { symbol: string; hardnessScore: number; judgePresent: boolean; requestedNotionalUsd?: number | null }
) {
  const effective = {
    minHardnessScore: policy?.minHardnessScore ?? 60,
    maxNotionalUsd: policy?.maxNotionalUsd ?? 1000,
    allowedSymbols: policy?.allowedSymbols ?? [],
    requireJudge: policy?.requireJudge ?? true,
    requireOnchainProof: policy?.requireOnchainProof ?? true,
    mode: policy?.mode ?? 'advisory',
  };

  if (effective.allowedSymbols.length > 0 && !effective.allowedSymbols.includes(input.symbol)) {
    return { policy: effective, result: 'blocked', reason: 'symbol_not_allowed' };
  }
  if (effective.requireJudge && !input.judgePresent) {
    return { policy: effective, result: 'blocked', reason: 'judge_required' };
  }
  if (input.hardnessScore < effective.minHardnessScore) {
    return { policy: effective, result: effective.mode === 'paper' ? 'paper_only' : 'blocked', reason: 'hardness_below_threshold' };
  }
  if (input.requestedNotionalUsd && input.requestedNotionalUsd > effective.maxNotionalUsd) {
    return { policy: effective, result: 'allowed_with_reduction', reason: 'max_notional_exceeded' };
  }
  if (effective.mode === 'paper') {
    return { policy: effective, result: 'paper_only', reason: 'paper_mode' };
  }
  if (effective.mode === 'advisory') {
    return { policy: effective, result: 'allowed', reason: 'advisory_mode' };
  }
  return { policy: effective, result: 'allowed', reason: 'policy_pass' };
}
