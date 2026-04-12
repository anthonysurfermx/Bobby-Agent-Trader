const SB_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
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

export async function createSession(session: AgentSessionRecord) {
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
