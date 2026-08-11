// ============================================================
// POST /api/voice-tool
// Executes a tool the Realtime voice session asked for, server-side.
//
// The browser never talks to data providers directly and never holds a key.
// Every branch here is READ-ONLY. `propose_trade` returns a draft for the UI
// to render as a confirmation card — it does not place, sign or settle anything.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const SELF = process.env.BOBBY_PROTOCOL_BASE_URL || 'https://bobbyprotocol.xyz';

type ToolName = 'get_market' | 'run_debate' | 'get_protocol_stats' | 'propose_trade';

const ALLOWED: ToolName[] = ['get_market', 'run_debate', 'get_protocol_stats', 'propose_trade'];

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return response.json();
}

async function getMarket(symbol: string) {
  const ticker = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (!ticker) throw new Error('symbol required');
  const stockSymbols = new Set(['NVDA', 'AAPL', 'TSLA', 'META', 'GOOGL', 'AMZN', 'MSFT', 'AMD', 'INTC', 'COIN', 'MSTR', 'PLTR', 'NFLX', 'DIS', 'JPM', 'GS', 'SPY', 'QQQ']);
  if (stockSymbols.has(ticker)) {
    const stock = (await getJson(`${SELF}/api/stock-price?symbols=${ticker}`)) as { quotes?: Array<Record<string, number | string>> };
    const quote = stock.quotes?.[0];
    if (!quote || !Number(quote.price)) return { symbol: ticker, available: false, assetType: 'equity' };
    return {
      symbol: ticker, assetType: 'equity', currency: 'USD', marketStatus: 'market-data', available: true,
      price: Number(quote.price), change_24h_pct: Number(quote.change24h || 0), high_24h: Number(quote.dayHigh || 0), low_24h: Number(quote.dayLow || 0),
    };
  }
  const data = await getJson(`${SELF}/api/okx-market?instId=${ticker}-USDT&type=all`);
  const t = (data as { ticker?: Record<string, string> }).ticker;
  const funding = (data as { funding?: Record<string, string> }).funding;
  if (!t?.last) return { symbol: ticker, available: false };
  const last = Number(t.last);
  const open = Number(t.open24h);
  return {
    symbol: ticker,
    price: last,
    change_24h_pct: open ? Number((((last - open) / open) * 100).toFixed(2)) : null,
    high_24h: Number(t.high24h),
    low_24h: Number(t.low24h),
    funding_rate: funding?.fundingRate ? Number(funding.fundingRate) : null,
  };
}

async function runDebate(symbol: string, context?: string) {
  const ticker = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const intel = (await getJson(`${SELF}/api/bobby-intel?symbol=${ticker}`)) as Record<string, unknown>;
  return {
    symbol: ticker,
    context: context ?? null,
    conviction: intel.conviction ?? null,
    direction: intel.direction ?? null,
    regime: intel.regime ?? null,
    mood: intel.mood ?? null,
    signals: intel.signals ?? null,
    note: 'Analysis only. Bobby does not execute trades.',
  };
}

async function getProtocolStats() {
  const stats = (await getJson(`${SELF}/api/bobby-protocol-stats`)) as {
    contracts?: { trackRecord?: { stats?: Record<string, string> }; agentEconomy?: { stats?: Record<string, string> } };
    protocolTotals?: Record<string, unknown>;
  };
  const tr = stats.contracts?.trackRecord?.stats ?? {};
  const ec = stats.contracts?.agentEconomy?.stats ?? {};
  return {
    decisions_committed: tr.totalCommitments ?? null,
    decisions_revealed: tr.totalTrades ?? null,
    win_rate_pct: tr.winRateBps ? Number(tr.winRateBps) / 100 : null,
    mcp_calls: ec.totalMcpCalls ?? null,
    total_interactions: stats.protocolTotals?.totalInteractions ?? null,
    basis: 'paper/simulated track record, committed on-chain before outcome',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tool, args } = (req.body ?? {}) as { tool?: ToolName; args?: Record<string, unknown> };

  if (!tool || !ALLOWED.includes(tool)) {
    return res.status(400).json({ error: `unknown tool`, allowed: ALLOWED });
  }

  try {
    switch (tool) {
      case 'get_market':
        return res.status(200).json(await getMarket(String(args?.symbol ?? '')));

      case 'run_debate':
        return res.status(200).json(
          await runDebate(String(args?.symbol ?? ''), args?.context ? String(args.context) : undefined),
        );

      case 'get_protocol_stats':
        return res.status(200).json(await getProtocolStats());

      // Draft only. Rendered as a card the human must approve; nothing is sent
      // anywhere and no position is opened by this endpoint.
      case 'propose_trade':
        return res.status(200).json({
          status: 'awaiting_human_confirmation',
          proposal: {
            symbol: String(args?.symbol ?? '').toUpperCase(),
            direction: args?.direction === 'short' ? 'short' : 'long',
            size_usd: args?.size_usd ?? null,
            entry: args?.entry ?? null,
            stop: args?.stop ?? null,
            rationale: args?.rationale ?? null,
          },
          note: 'Rendered on screen as a proposal. Not executed. The human must confirm it themselves.',
        });
    }
  } catch (error) {
    console.error('[VoiceTool]', tool, error instanceof Error ? error.message : error);
    return res.status(200).json({ error: 'tool_failed', tool, detail: 'Data unavailable right now.' });
  }
}
