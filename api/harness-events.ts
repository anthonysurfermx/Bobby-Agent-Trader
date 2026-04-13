// ============================================================
// GET /api/harness-events — Query harness audit trail
// Returns recent agent_events for the Finance Harness Console.
// Falls back to agent_cycles + forum_threads if agent_events
// table doesn't exist yet.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

async function sbGet(path: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    });
    if (!res.ok) return null;
    return await res.json() as unknown[];
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const eventType = req.query.type as string | undefined;

  // Try agent_events table first (new unified events)
  let typeFilter = '';
  if (eventType) typeFilter = `&event_type=eq.${eventType}`;
  const events = await sbGet(`agent_events?order=created_at.desc&limit=${limit}${typeFilter}`);

  if (events && events.length > 0) {
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({
      ok: true,
      source: 'agent_events',
      count: events.length,
      events,
    });
  }

  // Fallback: reconstruct events from agent_cycles + forum_threads
  const [cycles, threads] = await Promise.all([
    sbGet(`agent_cycles?order=created_at.desc&limit=${limit}&select=id,status,created_at,completed_at,latency_ms,trades_executed,llm_reasoning,vibe_phrase,idle_cash_usd,yield_debate_triggered`),
    sbGet(`forum_threads?order=created_at.desc&limit=${limit}&select=id,symbol,direction,conviction_score,status,resolution,entry_price,stop_price,target_price,resolution_pnl_pct,created_at,trigger_reason,debate_quality`),
  ]);

  // Transform into unified event format
  interface CycleRow {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    latency_ms: number | null;
    trades_executed: number;
    llm_reasoning: string | null;
    vibe_phrase: string | null;
    idle_cash_usd: number | null;
    yield_debate_triggered: boolean;
  }

  interface ThreadRow {
    id: string;
    symbol: string;
    direction: string;
    conviction_score: number;
    status: string;
    resolution: string;
    entry_price: number;
    stop_price: number;
    target_price: number;
    resolution_pnl_pct: number | null;
    created_at: string;
    trigger_reason: string | null;
    debate_quality: { overall_score?: number } | null;
  }

  const reconstructed = (threads as ThreadRow[] || []).map(t => {
    const executed = t.status === 'executed' || t.status === 'active';
    const conv = t.conviction_score ?? 0;
    return {
      id: t.id,
      run_id: t.id,
      thread_id: t.id,
      agent: 'harness',
      event_type: executed ? 'execution' : 'skip',
      symbol: t.symbol,
      direction: t.direction,
      decision: executed ? 'allow' : (conv >= 0.15 && conv < 0.35 ? 'stable' : 'deny'),
      conviction: conv,
      risk_score: Math.round((1 - conv) * 100),
      policy_hits: [
        conv >= 0.35 ? 'conviction_gate_pass' : 'conviction_gate_block',
        ...(t.stop_price ? ['stop_loss_set'] : []),
        ...(t.resolution === 'win' ? ['resolved_win'] : []),
        ...(t.resolution === 'loss' ? ['resolved_loss'] : []),
      ],
      reason: t.trigger_reason || (conv < 0.35 ? `Conviction ${(conv * 10).toFixed(1)}/10 below threshold` : 'Passed guardrails'),
      resolution: t.resolution,
      resolution_pnl_pct: t.resolution_pnl_pct,
      quality_score: t.debate_quality?.overall_score ?? null,
      entry_price: t.entry_price,
      stop_price: t.stop_price,
      target_price: t.target_price,
      created_at: t.created_at,
    };
  });

  // Merge cycle metadata
  const cycleMap = new Map((cycles as CycleRow[] || []).map(c => [c.id, c]));

  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  return res.status(200).json({
    ok: true,
    source: 'reconstructed',
    count: reconstructed.length,
    events: reconstructed,
    cycles_available: cycleMap.size,
  });
}
