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

  // Step 3: Call bobby_intel (free tool)
  const t3 = Date.now();
  const intelRes = await callMcpTool('bobby_intel', {});
  log.push({
    step: 'call_intel',
    tool: 'bobby_intel',
    status: intelRes.result ? 'ok' : 'error',
    data: intelRes.result
      ? `${intelRes.result.content[0]?.text?.slice(0, 200)}...`
      : intelRes.error?.message,
    ms: Date.now() - t3,
  });

  // Step 4: Call bobby_stats (free tool)
  const t4 = Date.now();
  const statsRes = await callMcpTool('bobby_stats', {});
  log.push({
    step: 'call_stats',
    tool: 'bobby_stats',
    status: statsRes.result ? 'ok' : 'error',
    data: statsRes.result
      ? `${statsRes.result.content[0]?.text?.slice(0, 200)}...`
      : statsRes.error?.message,
    ms: Date.now() - t4,
  });

  // Step 5: Call bobby_bounty_list (free tool)
  const t5 = Date.now();
  const bountiesRes = await callMcpTool('bobby_bounty_list', { limit: 5 });
  log.push({
    step: 'call_bounties',
    tool: 'bobby_bounty_list',
    status: bountiesRes.result ? 'ok' : 'error',
    data: bountiesRes.result
      ? `${bountiesRes.result.content[0]?.text?.slice(0, 200)}...`
      : bountiesRes.error?.message,
    ms: Date.now() - t5,
  });

  // Step 6: Attempt premium tool (will get 402 challenge)
  const t6 = Date.now();
  const analyzeRes = await callMcpTool('bobby_analyze', { symbol: 'OKB' });
  const got402 = analyzeRes.error?.code === -32402;
  log.push({
    step: 'attempt_premium',
    tool: 'bobby_analyze',
    status: got402 ? '402_challenge_received' : analyzeRes.result ? 'ok' : 'error',
    data: got402
      ? { message: 'Payment required — x402 challenge issued', challengeData: analyzeRes.error?.data }
      : analyzeRes.error?.message,
    ms: Date.now() - t6,
  });

  const totalMs = Date.now() - startAll;

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  return res.status(200).json({
    ok: true,
    agent: 'Sentinel',
    version: '1.0.0',
    description: 'Autonomous agent that discovers and consumes Bobby Protocol via MCP',
    totalMs,
    steps: log.length,
    log,
    summary: {
      discoveredBobby: Boolean(registry && (registry as { protocol?: string }).protocol),
      checkedReputation: Boolean(reputation && (reputation as { ok?: boolean }).ok),
      calledFreeTools: log.filter((l) => l.status === 'ok' && l.step.startsWith('call_')).length,
      receivedX402Challenge: got402,
      agentEconomy: 'Sentinel consumed 3 free MCP tools and received x402 payment gate for premium access',
    },
  });
}
