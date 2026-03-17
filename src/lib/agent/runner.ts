// ============================================================
// Agent Runner — The brain: collect → filter → reason → gate → execute → log
// Runs every 8 hours via Vercel cron or OpenClaw scheduler
// ============================================================

import { collectAllSignals } from './collectors';
import { filterSignals, markTraded } from './filters';
import { analyzeWithClaude } from './reasoning';
import { applyRiskGate, DEFAULT_RISK_CONFIG } from './risk-gate';
import type { CycleResult, PortfolioState, TradeResult, RiskConfig } from './types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// ---- Supabase helpers ----
async function supabaseQuery(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    console.error(`[Supabase] ${path} error:`, res.status, await res.text());
    return null;
  }

  return res.json();
}

async function getPortfolio(): Promise<PortfolioState> {
  const emptyPortfolio: PortfolioState = {
    positions: [],
    totalValueUsd: 0,
    dailyPnlUsd: 0,
    tradesLast24h: 0,
  };

  try {
    // Try to load from Supabase (tables may not exist yet)
    const positions = await supabaseQuery('agent_positions?closed_at=is.null&select=*');
    const recentTrades = await supabaseQuery(
      `agent_trades?created_at=gte.${new Date(Date.now() - 86400000).toISOString()}&select=*`
    );

    const posArray = Array.isArray(positions) ? positions : [];
    const tradesArray = Array.isArray(recentTrades) ? recentTrades : [];

    const totalValue = posArray.reduce(
      (sum: number, p: Record<string, unknown>) => sum + (Number(p.amount_usd) || 0), 0
    );

    const dailyPnl = posArray.reduce(
      (sum: number, p: Record<string, unknown>) => sum + (Number(p.unrealized_pnl) || 0), 0
    );

    return {
      positions: posArray.map((p: Record<string, unknown>) => ({
        chain: String(p.chain || ''),
        tokenSymbol: String(p.token_symbol || ''),
        tokenAddress: String(p.token_address || ''),
        amountUsd: Number(p.amount_usd) || 0,
        entryPrice: Number(p.entry_price) || 0,
      })),
      totalValueUsd: totalValue,
      dailyPnlUsd: dailyPnl,
      tradesLast24h: tradesArray.length,
    };
  } catch (err) {
    console.warn('[Agent] Portfolio fetch failed (tables may not exist yet):', err);
    return emptyPortfolio;
  }
}

async function logCycle(result: CycleResult) {
  try {
  // Insert cycle
  const cycle = await supabaseQuery('agent_cycles', {
    method: 'POST',
    body: JSON.stringify({
      started_at: result.startedAt,
      completed_at: result.completedAt,
      signals_found: result.signalsFound,
      signals_filtered: result.signalsFiltered,
      llm_decisions: result.llmDecisions,
      trades_executed: result.tradesExecuted,
      trades_blocked: result.tradesBlocked,
      total_usd_deployed: result.totalUsdDeployed,
      latency_ms: result.latencyMs,
      llm_model: 'claude-sonnet-4-20250514',
      llm_reasoning: result.llmReasoning,
      error: result.error || null,
      status: result.error ? 'failed' : 'completed',
    }),
  });

  const cycleId = Array.isArray(cycle) && cycle[0]?.id ? cycle[0].id : null;

  // Insert trades
  if (cycleId && result.trades.length > 0) {
    for (const trade of result.trades) {
      await supabaseQuery('agent_trades', {
        method: 'POST',
        body: JSON.stringify({
          cycle_id: cycleId,
          chain: trade.decision.chain,
          token_address: trade.decision.tokenAddress,
          token_symbol: trade.decision.tokenSymbol,
          direction: trade.decision.action,
          amount_usd: trade.decision.amountUsd,
          entry_price: trade.entryPrice || null,
          tx_hash: trade.txHash,
          status: trade.status,
          llm_reasoning: trade.decision.reason,
          confidence: trade.decision.confidence,
          signal_sources: trade.decision.signalSources,
        }),
      });
    }
  }

  return cycleId;
  } catch (err) {
    console.warn('[Agent] logCycle failed (tables may not exist yet):', err);
    return null;
  }
}

// ---- Execute a single swap ----
async function executeSwap(
  decision: { chain: string; tokenAddress: string; tokenSymbol: string; amountUsd: number },
  enableLive: boolean,
): Promise<TradeResult & { decision: typeof decision & { action: 'BUY'; reason: string; confidence: number; signalSources: string[] } }> {
  const fullDecision = {
    ...decision,
    action: 'BUY' as const,
    reason: '',
    confidence: 0,
    signalSources: [] as string[],
  };

  if (!enableLive) {
    return {
      decision: fullDecision,
      txHash: `SIM-${Date.now()}-${decision.tokenSymbol}`,
      status: 'simulated',
      entryPrice: 0,
    };
  }

  // Real execution via our dex-swap proxy
  try {
    const BASE_URL = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://defi-mexico-hub.vercel.app';

    // For now, we simulate — real execution needs a server-side wallet
    // which we'll add when we deploy the OpenClaw skill with a wallet
    return {
      decision: fullDecision,
      txHash: `SIM-${Date.now()}-${decision.tokenSymbol}`,
      status: 'simulated',
      entryPrice: 0,
    };
  } catch (err) {
    return {
      decision: fullDecision,
      txHash: null,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---- Send WhatsApp/Telegram notification ----
async function sendNotification(result: CycleResult) {
  // WhatsApp via Twilio (if configured)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM; // whatsapp:+14155238886
  const twilioTo = process.env.TWILIO_WHATSAPP_TO;     // whatsapp:+52...

  if (twilioSid && twilioToken && twilioFrom && twilioTo) {
    const message = formatNotification(result);

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
          },
          body: new URLSearchParams({
            From: twilioFrom,
            To: twilioTo,
            Body: message,
          }),
        }
      );

      if (!res.ok) {
        console.error('[Notification] WhatsApp error:', res.status);
      }
    } catch (err) {
      console.error('[Notification] WhatsApp error:', err);
    }
  }

  // Telegram (if configured)
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (telegramToken && telegramChatId) {
    const message = formatNotification(result);

    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
    } catch (err) {
      console.error('[Notification] Telegram error:', err);
    }
  }
}

function formatNotification(result: CycleResult): string {
  const lines = [
    `*Agent Radar — Cycle Complete*`,
    ``,
    `Signals: ${result.signalsFound} found → ${result.signalsFiltered} filtered`,
    `Decisions: ${result.llmDecisions} analyzed`,
    `Trades: ${result.tradesExecuted} executed, ${result.tradesBlocked} blocked`,
  ];

  if (result.trades.length > 0) {
    lines.push('', '*Trades:*');
    for (const t of result.trades) {
      const emoji = t.status === 'confirmed' ? '✅' : t.status === 'simulated' ? '🧪' : '❌';
      lines.push(`${emoji} ${t.decision.action} ${t.decision.tokenSymbol} — $${t.decision.amountUsd} (${(t.decision.confidence * 100).toFixed(0)}%)`);
      lines.push(`   _${t.decision.reason}_`);
    }
  }

  if (result.totalUsdDeployed > 0) {
    lines.push('', `Total deployed: *$${result.totalUsdDeployed.toFixed(2)}*`);
  }

  lines.push('', `_${result.llmReasoning}_`);
  lines.push('', `Latency: ${result.latencyMs}ms`);

  return lines.join('\n');
}

// ============================================================
// MAIN ENTRY — Run one complete agent cycle
// ============================================================
export async function runAgentCycle(
  riskConfig: RiskConfig = DEFAULT_RISK_CONFIG,
): Promise<CycleResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  console.log('[Agent] Starting cycle at', startedAt);

  try {
    // Phase 1: Collect signals
    console.log('[Agent] Phase 1: Collecting signals...');
    const rawSignals = await collectAllSignals();
    console.log(`[Agent] Collected ${rawSignals.length} raw signals`);

    // Phase 2: Filter
    console.log('[Agent] Phase 2: Filtering signals...');
    const filteredSignals = filterSignals(rawSignals);
    console.log(`[Agent] ${filteredSignals.length} signals passed filters`);

    if (filteredSignals.length === 0) {
      const result: CycleResult = {
        cycleId: '',
        startedAt,
        completedAt: new Date().toISOString(),
        signalsFound: rawSignals.length,
        signalsFiltered: 0,
        llmDecisions: 0,
        tradesExecuted: 0,
        tradesBlocked: 0,
        totalUsdDeployed: 0,
        latencyMs: Date.now() - startMs,
        trades: [],
        llmReasoning: 'No actionable signals found this cycle.',
      };

      await logCycle(result);
      await sendNotification(result);
      return result;
    }

    // Phase 3: LLM Reasoning
    console.log('[Agent] Phase 3: Claude analysis...');
    const portfolio = await getPortfolio();
    const { decisions, reasoning } = await analyzeWithClaude(filteredSignals, portfolio);
    console.log(`[Agent] Claude produced ${decisions.length} trade decisions`);

    // Phase 4: Risk Gate
    console.log('[Agent] Phase 4: Risk gate...');
    const { approved, blocked } = applyRiskGate(decisions, portfolio, riskConfig);
    console.log(`[Agent] ${approved.length} approved, ${blocked.length} blocked`);

    // Phase 5: Execute
    console.log('[Agent] Phase 5: Executing trades...');
    const trades: TradeResult[] = [];

    for (const decision of approved) {
      const tradeResult = await executeSwap(decision, riskConfig.enableLiveTrading);
      tradeResult.decision = { ...decision, action: 'BUY' };
      trades.push(tradeResult);
      markTraded(decision.chain, decision.tokenAddress);
    }

    const totalDeployed = trades
      .filter(t => t.status !== 'failed')
      .reduce((sum, t) => sum + t.decision.amountUsd, 0);

    // Phase 6: Log + Notify
    const result: CycleResult = {
      cycleId: '',
      startedAt,
      completedAt: new Date().toISOString(),
      signalsFound: rawSignals.length,
      signalsFiltered: filteredSignals.length,
      llmDecisions: decisions.length,
      tradesExecuted: trades.filter(t => t.status !== 'failed').length,
      tradesBlocked: blocked.length,
      totalUsdDeployed: totalDeployed,
      latencyMs: Date.now() - startMs,
      trades,
      llmReasoning: reasoning,
    };

    console.log('[Agent] Phase 6: Logging...');
    const cycleId = await logCycle(result);
    result.cycleId = cycleId || '';

    await sendNotification(result);

    console.log(`[Agent] Cycle complete in ${result.latencyMs}ms — ${result.tradesExecuted} trades`);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Agent] Cycle failed:', msg);

    const result: CycleResult = {
      cycleId: '',
      startedAt,
      completedAt: new Date().toISOString(),
      signalsFound: 0,
      signalsFiltered: 0,
      llmDecisions: 0,
      tradesExecuted: 0,
      tradesBlocked: 0,
      totalUsdDeployed: 0,
      latencyMs: Date.now() - startMs,
      trades: [],
      llmReasoning: '',
      error: msg,
    };

    await logCycle(result);
    await sendNotification(result);
    return result;
  }
}
