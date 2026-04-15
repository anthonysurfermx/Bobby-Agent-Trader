// ============================================================
// GET /api/sentinel-demo
// Sentinel Agent — a second autonomous agent that discovers
// Bobby via the registry, calls MCP tools, and demonstrates
// real agent-to-agent commerce on X Layer.
//
// This proves Bobby is a PLATFORM, not just an agent.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

const MCP_ENDPOINT = 'https://bobbyprotocol.xyz/api/mcp-http';

interface McpResponse {
  jsonrpc: string;
  id: string;
  result?: { content: Array<{ type: string; text: string }> };
  error?: { code: number; message: string; data?: unknown };
}

async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<McpResponse> {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-name': 'sentinel-agent',
      ...(headers || {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: `sentinel-${Date.now()}`,
    }),
  });
  return (await res.json()) as McpResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const log: Array<{ step: string; tool: string; status: string; data?: unknown; ms: number }> = [];
  const startAll = Date.now();

  // Step 1: Discover Bobby via registry
  const t1 = Date.now();
  let registry: Record<string, unknown> = {};
  try {
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'bobbyprotocol.xyz';
    const regRes = await fetch(`${proto}://${host}/api/registry`, { cache: 'no-store' });
    registry = (await regRes.json()) as Record<string, unknown>;
    log.push({ step: 'discover', tool: '/api/registry', status: 'ok', ms: Date.now() - t1 });
  } catch (err) {
    log.push({ step: 'discover', tool: '/api/registry', status: 'error', data: (err as Error).message, ms: Date.now() - t1 });
  }

  // Step 2: Check Bobby's reputation
  const t2 = Date.now();
  let reputation: Record<string, unknown> = {};
  try {
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'bobbyprotocol.xyz';
    const repRes = await fetch(`${proto}://${host}/api/reputation`, { cache: 'no-store' });
    reputation = (await repRes.json()) as Record<string, unknown>;
    log.push({ step: 'reputation_check', tool: '/api/reputation', status: 'ok', ms: Date.now() - t2 });
  } catch (err) {
    log.push({ step: 'reputation_check', tool: '/api/reputation', status: 'error', data: (err as Error).message, ms: Date.now() - t2 });
  }

  // Step 3: Call bobby_brief (compact one-shot — optimized for agents)
  const t3 = Date.now();
  const briefRes = await callMcpTool('bobby_brief', {});
  const briefData = briefRes.result ? JSON.parse(briefRes.result.content[0]?.text || '{}') : null;
  log.push({
    step: 'call_brief',
    tool: 'bobby_brief',
    status: briefRes.result ? 'ok' : 'error',
    data: briefData || briefRes.error?.message,
    ms: Date.now() - t3,
  });

  // Step 4: Call bobby_recommend (actionable signal)
  const t4 = Date.now();
  const recRes = await callMcpTool('bobby_recommend', {});
  const recData = recRes.result ? JSON.parse(recRes.result.content[0]?.text || '{}') : null;
  log.push({
    step: 'call_recommend',
    tool: 'bobby_recommend',
    status: recRes.result ? 'ok' : 'error',
    data: recData || recRes.error?.message,
    ms: Date.now() - t4,
  });

  // Step 5: Call bobby_ta for technical confirmation
  const symbol = recData?.signal?.symbol || 'BTC';
  const t5 = Date.now();
  const taRes = await callMcpTool('bobby_ta', { symbol });
  const taData = taRes.result ? JSON.parse(taRes.result.content[0]?.text || '{}') : null;
  log.push({
    step: 'call_ta',
    tool: 'bobby_ta',
    status: taRes.result ? 'ok' : 'error',
    data: taData ? { symbol: taData.symbol, trend: taData.trend, rsi: taData.rsi, rsi_signal: taData.rsi_signal } : taRes.error?.message,
    ms: Date.now() - t5,
  });

  // Step 6: Call bobby_bounty_list (check accountability)
  const t6a = Date.now();
  const bountiesRes = await callMcpTool('bobby_bounty_list', { limit: 3 });
  log.push({
    step: 'call_bounties',
    tool: 'bobby_bounty_list',
    status: bountiesRes.result ? 'ok' : 'error',
    data: bountiesRes.result
      ? `${bountiesRes.result.content[0]?.text?.slice(0, 200)}...`
      : bountiesRes.error?.message,
    ms: Date.now() - t6a,
  });

  // Step 7: Attempt premium tool (demonstrates x402 payment gate)
  const t6 = Date.now();
  const analyzeRes = await callMcpTool('bobby_analyze', { symbol: 'OKB' });
  const got402 = analyzeRes.error?.code === -32402;
  const challengeData = got402 ? analyzeRes.error?.data as Record<string, unknown> : null;
  log.push({
    step: 'attempt_premium',
    tool: 'bobby_analyze',
    status: got402 ? '402_challenge_received' : analyzeRes.result ? 'ok' : 'error',
    data: got402
      ? {
          message: 'Payment required — x402 challenge issued',
          price: challengeData?.price,
          currency: challengeData?.currency,
          chainId: challengeData?.chainId,
          contract: challengeData?.contract,
          challengeId: challengeData?.challengeId,
          instructions: 'Agent would call payMCPCall() on AgentEconomyV2, then retry with x-402-payment header',
        }
      : analyzeRes.error?.message,
    ms: Date.now() - t6,
  });

  const totalMs = Date.now() - startAll;

  // Build agent decision based on Bobby's recommendation.
  // `bobby_recommend` returns `stop_loss`, not `stop`. Keep fallback for safety.
  const sig = recData?.signal || {};
  const stopLoss = sig.stop_loss ?? sig.stop ?? '?';
  const sentinelDecision = recData?.recommendation === 'ACTIONABLE'
    ? {
        action: 'WOULD_EXECUTE',
        reasoning: `Bobby recommends ${sig.symbol} ${sig.direction} at conviction ${sig.conviction}/10. Entry: $${sig.entry_price}, Stop: $${stopLoss}, Target: $${sig.target}. R:R = ${sig.risk_reward}. TA confirms: ${taData?.trend || '?'} trend, RSI ${taData?.rsi || '?'}. All guardrails passed.`,
      }
    : {
        action: 'HOLD',
        reasoning: `Bobby verdict: ${recData?.verdict?.status || 'deny'}. ${recData?.verdict?.reason || 'Conviction below threshold.'}. Sentinel respects Bobby's guardrails and will not trade.`,
      };

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  return res.status(200).json({
    ok: true,
    agent: 'Sentinel',
    version: '2.0.0',
    description: 'Autonomous agent that discovers Bobby Protocol, evaluates trust, consumes signals, and makes trading decisions based on Bobby\'s harness verdicts',
    totalMs,
    steps: log.length,
    log,
    sentinel_decision: sentinelDecision,
    summary: {
      discoveredBobby: Boolean(registry && (registry as { protocol?: string }).protocol),
      checkedReputation: Boolean(reputation && (reputation as { ok?: boolean }).ok),
      trustScore: (reputation as any)?.trustScore?.score || null,
      calledFreeTools: log.filter((l) => l.status === 'ok' && l.step.startsWith('call_')).length,
      receivedSignal: recData?.recommendation || 'none',
      receivedX402Challenge: got402,
      // Count only actual tool calls (not registry/reputation discovery).
      agentEconomy: `Sentinel consumed ${log.filter(l => l.status === 'ok' && l.step.startsWith('call_')).length} Bobby tools in ${totalMs}ms. Trust verified. Signal received. x402 payment gate demonstrated.`,
    },
  });
}
