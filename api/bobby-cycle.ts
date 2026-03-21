// ============================================================
// POST /api/bobby-cycle — Autonomous market cycle
// The MAIN artifact is the market analysis, NOT the trade.
// Flow: Intel → Snapshot → Debate → Forum → Digest
// Works for ALL users — with or without positions
// Triggered by: cron (every 8h), droplet worker, or manual
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { canOpenPosition, getPositionSize } from '../src/lib/onchainos/risk-manager.js';
import type { TradeParams } from '../src/lib/onchainos/types.js';

export const config = { maxDuration: 120 };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

// ---- Supabase helpers ----

async function sbInsert(table: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[Cycle] ${table} insert failed:`, res.status, errBody);
      return null;
    }
    const rows = await res.json();
    return rows[0] || null;
  } catch (e) { console.error(`[Cycle] ${table} insert error:`, e); return null; }
}

async function sbQuery(table: string, query: string): Promise<any[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ---- Claude helper ----

async function callClaude(model: string, system: string, userMsg: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  if (!res.ok) throw new Error(`Claude ${model}: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text || '';
}

// ---- Fetch local internal API ----
// noFallback=true for mutant actions (open_position, close_position) — NEVER retry those
async function fetchLocalApi(path: string, body: any, noFallback = false): Promise<any> {
  // Always use production domain — VERCEL_URL points to preview deployments that may have stale env vars
  const host = 'https://defimexico.org';
  const internalAuth = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET || '';
  try {
    const res = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(internalAuth ? { 'x-internal-secret': internalAuth } : {}),
      },
      body: JSON.stringify(body)
    });
    if (res.ok) return await res.json();
    // For mutant actions, return the error — do NOT fallback
    if (noFallback) return { ok: false, error: `${path}: ${res.status}` };
  } catch (e) {
    console.error(`Failed to fetch ${path}`, e);
    if (noFallback) return { ok: false, error: `${path}: network error` };
  }

  // Fallback to prod domain ONLY for read-only endpoints
  try {
    const res2 = await fetch(`https://defimexico.org${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res2.ok) return await res2.json();
  } catch (e) { console.error(`Fallback failed for ${path}`, e); }

  return { ok: false, error: 'API unreachable' };
}

type ChallengeMode = 'dryrun' | 'paper' | 'live';

function resolveChallengeMode(reqMethod: string, requestedMode: string): ChallengeMode {
  if (reqMethod === 'GET') return 'live';
  if (requestedMode === 'challenge_paper' || requestedMode === 'paper') return 'paper';
  if (requestedMode === 'challenge_live' || requestedMode === 'live') return 'live';
  return 'dryrun';
}

// ---- Fetch market intel (frozen snapshot) ----

async function fetchIntel(): Promise<any | null> {
  const urls = [
    'https://defimexico.org/api/bobby-intel',
    'https://defi-mexico-hub.vercel.app/api/bobby-intel',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return await res.json();
    } catch { continue; }
  }
  return null;
}

// ---- Fetch OKX positions (optional — works without) ----

async function fetchPositions(mode: 'paper' | 'live' = 'live'): Promise<any[]> {
  try {
    const urls = [
      'https://defimexico.org/api/okx-perps',
      'https://defi-mexico-hub.vercel.app/api/okx-perps',
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'positions', params: { mode } }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) return data.positions || [];
        }
      } catch { continue; }
    }
    return [];
  } catch { return []; }
}

// ---- Track record from resolved forum threads ----

async function getTrackRecord(): Promise<{ wins: number; losses: number; winRate: number; lastCalls: string }> {
  const data = await sbQuery('forum_threads',
    'resolution=neq.pending&resolution=not.is.null&select=resolution,symbol,conviction_score,resolution_pnl_pct&order=resolved_at.desc&limit=10'
  );
  if (!data.length) return { wins: 0, losses: 0, winRate: 50, lastCalls: 'No history' };
  const wins = data.filter((d: any) => d.resolution === 'win').length;
  const losses = data.filter((d: any) => d.resolution === 'loss').length;
  const total = data.length || 1;
  const lastCalls = data.slice(0, 5).map((d: any) =>
    `${d.symbol}: ${d.resolution?.toUpperCase()} (${d.resolution_pnl_pct > 0 ? '+' : ''}${d.resolution_pnl_pct}%)`
  ).join(', ') || 'No history';
  return { wins, losses, winRate: Math.round((wins / total) * 100), lastCalls };
}

// ---- Main handler ----

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Anthropic API key not configured' });
  }

  // Auth: Vercel crons send GET with CRON_SECRET, manual POST requires BOBBY_CYCLE_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const cycleSecret = process.env.BOBBY_CYCLE_SECRET || cronSecret;
  if (req.method === 'GET' && cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized cron call' });
    }
  }
  if (req.method === 'POST' && cycleSecret) {
    const bodyKind = (req.body as any)?.kind;
    // Allow dryrun without auth for testing — dryrun never executes real trades
    if (bodyKind !== 'challenge_dryrun') {
      const authHeader = req.headers.authorization;
      const bodySecret = (req.body as any)?.secret;
      if (authHeader !== `Bearer ${cycleSecret}` && bodySecret !== cycleSecret) {
        return res.status(401).json({ error: 'Unauthorized — set BOBBY_CYCLE_SECRET' });
      }
    }
  }

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const language = body.language || 'es';
  const lang = language === 'es' ? 'es' : 'en';
  const kind = req.method === 'GET' ? 'cron' : (body.kind || 'manual');
  const requestedMode = body.mode || kind;
  const challengeMode = resolveChallengeMode(req.method, requestedMode);
  const okxMode = challengeMode === 'paper' ? 'paper' : 'live';
  const isDryRun = challengeMode === 'dryrun';
  const shouldCommitOnchain = challengeMode === 'live';
  const shouldPublishTwitter = challengeMode === 'live';
  const startTime = Date.now();

  try {
    // ============================================================
    // PHASE 1: Freeze market snapshot
    // ============================================================
    const [intel, positions, track] = await Promise.all([
      fetchIntel(),
      fetchPositions(okxMode),
      getTrackRecord(),
    ]);

    const testState = body.testState as {
      balanceOverride?: number;
      availableBalanceOverride?: number;
      positionsOverride?: Array<Record<string, unknown>>;
    } | undefined;
    const useTestState = challengeMode === 'paper' && !!testState;
    const effectivePositions = useTestState && Array.isArray(testState?.positionsOverride)
      ? testState.positionsOverride
      : positions;
    const overriddenBalance = useTestState && typeof testState?.balanceOverride === 'number'
      ? testState.balanceOverride
      : null;
    const overriddenAvailableBalance = useTestState && typeof testState?.availableBalanceOverride === 'number'
      ? testState.availableBalanceOverride
      : overriddenBalance;

    if (!intel?.briefing) {
      return res.status(503).json({ error: 'Could not fetch market data' });
    }

    const marketSnapshot = {
      regime: intel.regime,
      fgi: intel.fearGreed,
      dxy: intel.dxy,
      btcPrice: intel.prices?.find((p: any) => p.symbol === 'BTC')?.price,
      ethPrice: intel.prices?.find((p: any) => p.symbol === 'ETH')?.price,
      performance: intel.performance,
    };

    // ============================================================
    // PHASE 2: Create cycle record (snapshot is now immutable)
    // ============================================================
    const cycle = await sbInsert('agent_cycles', {
      started_at: new Date().toISOString(),
      status: 'running',
      signals_found: intel.meta?.signalsRaw || 0,
      signals_filtered: intel.meta?.signalsFiltered || 0,
      dynamic_conviction: intel.performance?.dynamicConviction || null,
      safe_mode_active: intel.performance?.isSafeMode || false,
      mood: intel.performance?.mood || 'cautious',
    });
    const cycleId = cycle?.id as string | undefined;

    // ============================================================
    // PHASE 3: Multi-agent debate (frozen on the snapshot)
    // ============================================================

    // TEST VERDICT: skip debate and inject manual verdict (paper mode only, requires auth)
    const testVerdict = body.testVerdict as {
      execute: boolean; conviction: number; symbol: string;
      direction: string; entry: number; stop: number; target: number;
    } | undefined;
    const useTestVerdict = testVerdict && challengeMode === 'paper';

    const langRule = lang === 'es'
      ? 'Responde en español mexicano. Términos de trading en inglés están bien.'
      : 'Respond in English.';

    const memoryBlock = `\nBOBBY'S TRACK RECORD: Win Rate ${track.winRate}% | Last calls: ${track.lastCalls}${
      track.winRate < 60 ? '\nWARNING: Accuracy below 60%. Be extra cautious.' : ''
    }`;

    const positionsBlock = effectivePositions.length > 0
      ? `\nOPEN POSITIONS:\n${effectivePositions.map((p: any) =>
          `${p.symbol} ${p.direction?.toUpperCase()} ${p.leverage} | PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl?.toFixed(2)} (${p.unrealizedPnlPct?.toFixed(1)}%)`
        ).join('\n')}`
      : '\nNO OPEN POSITIONS — Bobby is fully cash. Free to recommend fresh setups.';

    const contextBlock = `${intel.briefing}${memoryBlock}${positionsBlock}`;

    let alphaPost: string;
    let redPost: string;
    let cioPost: string;

    if (useTestVerdict) {
      // TEST MODE: skip 3 LLM calls, inject manual verdict
      alphaPost = `[TEST] Manual verdict injected: ${testVerdict.direction} ${testVerdict.symbol} at $${testVerdict.entry}`;
      redPost = `[TEST] Red Team skipped — test mode active`;
      cioPost = `[TEST] Manual override for paper trading validation.\n\nVERDICT: ${JSON.stringify(testVerdict)}`;
      console.log(`[Cycle] TEST VERDICT: ${testVerdict.direction} ${testVerdict.symbol} conviction ${testVerdict.conviction}/10`);
    } else {

    // Alpha Hunter (Haiku — cheap, aggressive, scans full market)
    alphaPost = await callClaude('claude-haiku-4-5-20251001',
      `You are Alpha Hunter — a young hungry female trader. Scan ALL assets (crypto + stocks). Find the single BEST trade. Be SPECIFIC: entry, target, stop, leverage. ${langRule} 2-3 short paragraphs.`,
      `MARKET SCAN:\n${contextBlock}`, 350
    );

    // Red Team (Sonnet — adversarial, needs nuance)
    redPost = await callClaude('claude-sonnet-4-20250514',
      `You are Red Team — 15-year risk veteran who lost $30M trusting "obvious" trades. Destroy Alpha's thesis. Attack data gaps, selection bias, timing. ${langRule} 2-3 short paragraphs. Every paragraph is a kill shot.${
        track.winRate < 60 ? ' Bobby has been WRONG recently. Be extra aggressive.' : ''
      }`,
      `MARKET DATA:\n${contextBlock}\n\nALPHA HUNTER'S THESIS:\n${alphaPost}`, 350
    );

    // Bobby CIO (Sonnet — judge, structured output for reliable parsing)
    cioPost = await callClaude('claude-sonnet-4-20250514',
      `You are Bobby CIO. You heard Alpha and Red Team. Pick a side.

RULES:
- 2 short paragraphs of reasoning in ${lang === 'es' ? 'Spanish' : 'English'}.
- Then you MUST end with a JSON block exactly like this (no markdown fences):
VERDICT: {"execute":true,"conviction":7,"symbol":"BTC","direction":"long","entry":70500,"stop":69200,"target":73900,"invalidation":"DXY breaks above 126"}
- If sitting out: {"execute":false,"conviction":3,"symbol":"BTC","direction":"none","entry":null,"stop":null,"target":null,"invalidation":"Would enter if DXY drops below 124"}
- conviction is 1-10 integer. symbol must be one of: BTC,ETH,SOL (only these 3 for now).
- direction must be "long", "short", or "none".
- NEVER omit the VERDICT line. It is mandatory.${
        track.winRate < 60 ? '\nYour recent calls have been poor. Acknowledge it.' : ''
      }`,
      `MARKET DATA:\n${contextBlock}\n\nALPHA:\n${alphaPost}\n\nRED TEAM:\n${redPost}`, 400
    );
    } // end else (non-test debate)

    // Parse structured VERDICT from CIO output
    let symbol: string | null = null;
    let direction: string | null = null;
    let conviction: number | null = null;
    let entryPrice: number | null = null;
    let stopPrice: number | null = null;
    let targetPrice: number | null = null;
    let cioSaysExecute = false; // CRITICAL: only execute if CIO explicitly says so
    let structuredVerdictRejectReason: string | null = null;

    const verdictMatch = cioPost.match(/VERDICT:\s*(\{[^}]+\})/);
    if (verdictMatch) {
      try {
        const v = JSON.parse(verdictMatch[1]);
        conviction = typeof v.conviction === 'number' ? v.conviction / 10 : null;
        symbol = v.symbol && v.symbol !== 'none' ? v.symbol.toUpperCase() : null;
        direction = v.direction && v.direction !== 'none' ? v.direction.toLowerCase() : null;
        entryPrice = typeof v.entry === 'number' ? v.entry : null;
        stopPrice = typeof v.stop === 'number' ? v.stop : null;
        targetPrice = typeof v.target === 'number' ? v.target : null;
        // execute:true requires ALL fields to be present in JSON — no regex backfill
        if (v.execute === true && symbol && direction && conviction !== null && stopPrice) {
          cioSaysExecute = true;
        } else if (v.execute === true) {
          const missing: string[] = [];
          if (!symbol) missing.push('symbol');
          if (!direction) missing.push('direction');
          if (conviction === null) missing.push('conviction');
          if (!stopPrice) missing.push('stop');
          structuredVerdictRejectReason = `Structured VERDICT invalid for execution: missing ${missing.join(', ')}`;
        }
      } catch (e) {
        console.warn('[Cycle] Failed to parse CIO VERDICT JSON:', e);
        structuredVerdictRejectReason = 'Structured VERDICT JSON parse failed';
      }
    }

    // Fallback: regex extraction ONLY for forum/digest — NEVER for execution decisions
    if (conviction === null) {
      const convMatch = cioPost.match(/(\d+)\s*\/\s*10/);
      conviction = convMatch ? parseInt(convMatch[1]) / 10 : null;
    }
    if (!symbol) {
      const symMatch = (alphaPost + cioPost).match(/\b(BTC|ETH|SOL)\b/i);
      symbol = symMatch ? symMatch[1].toUpperCase() : null;
    }
    if (!direction) {
      const dirMatch = cioPost.match(/\b(long|short)\b/i);
      direction = dirMatch ? dirMatch[1].toLowerCase() : null;
    }
    // Regex fallback NEVER enables execution — only structured VERDICT with complete fields can

    // ============================================================
    // PHASE 4a: Create forum thread FIRST (canonical ID for everything)
    // ============================================================
    const now = new Date();
    const topicDate = lang === 'es' ? now.toLocaleDateString('es-MX') : now.toLocaleDateString('en-US');
    const hours = now.getUTCHours();
    const session = hours < 12 ? (lang === 'es' ? 'Mañana' : 'Morning') :
                    hours < 18 ? (lang === 'es' ? 'Tarde' : 'Afternoon') :
                    (lang === 'es' ? 'Noche' : 'Evening');
    const topic = `${session} Cycle — ${topicDate}`;

    const thread = await sbInsert('forum_threads', {
      topic,
      trigger_reason: `Autonomous ${kind} cycle`,
      trigger_data: { regime: intel.regime, fgi: intel.fearGreed, dxy: intel.dxy },
      language: lang,
      conviction_score: conviction,
      price_at_creation: Object.fromEntries((intel.prices || []).map((p: any) => [p.symbol, p.price])),
      symbol,
      direction,
      entry_price: entryPrice,
      stop_price: stopPrice,
      target_price: targetPrice,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      kind,
    });
    const threadId = thread?.id as string | undefined;

    // Save debate posts immediately
    if (threadId) {
      const snapshot = { regime: intel.regime, fgi: intel.fearGreed, dxy: intel.dxy, trackRecord: track };
      for (const post of [
        { agent: 'alpha', content: alphaPost },
        { agent: 'redteam', content: redPost },
        { agent: 'cio', content: cioPost },
      ]) {
        await sbInsert('forum_posts', {
          thread_id: threadId,
          agent: post.agent,
          content: post.content,
          data_snapshot: snapshot,
        });
      }
    }

    // ============================================================
    // PHASE 4b: Execute on OKX & X Layer ($100 Challenge Integration)
    // ============================================================
    let executionResult: any = null;
    let tpslResult: any = null;
    let tradeRejectedReason: string | null = null;
    let txHash: string | null = null;
    let finalBalanceStr: string | null = null;
    let effectiveBalanceForExecution: number | null = overriddenBalance;

    // Always fetch balance from the selected execution venue (live or paper)
    if (overriddenBalance !== null) {
      finalBalanceStr = String(overriddenBalance);
    } else {
      try {
        const balCheck = await fetchLocalApi('/api/okx-perps', { action: 'balance', params: { mode: okxMode } });
        if (balCheck.ok) {
          finalBalanceStr = String(balCheck.totalEquity || '???');
          effectiveBalanceForExecution = balCheck.totalEquity || null;
        }
      } catch { /* non-blocking */ }
    }

    if (!isDryRun && cioSaysExecute && symbol && direction && conviction !== null && conviction >= 0.6) {
      try {
        const currentPrice = intel.prices?.find((p: any) => p.symbol === symbol)?.price || entryPrice;
        
        // 1. Fetch balance via OKX Perps API
        const balRes = overriddenBalance !== null
          ? {
              ok: true,
              totalEquity: overriddenBalance,
              availableBalance: overriddenAvailableBalance ?? overriddenBalance,
            }
          : await fetchLocalApi('/api/okx-perps', { action: 'balance', params: { mode: okxMode } });
        
        if (balRes.ok) {
          const totalEq = balRes.totalEquity || 100;
          finalBalanceStr = String(totalEq);
          const availBal = balRes.availableBalance || totalEq;
          const balanceObj = { ccy: 'USDT', availBal: String(availBal), totalEq: String(totalEq), frozenBal: '0' };
          
          const positionSizeUsd = getPositionSize(totalEq, conviction);
          const leverage = 5; // Hardcoded for challenge
          
          if (positionSizeUsd > 0) {
            const tradeParams: TradeParams = {
              instId: `${symbol}-USDT-SWAP`,
              side: direction === 'long' ? 'buy' : 'sell',
              size: String(positionSizeUsd),
              lever: String(leverage),
              ordType: 'market',
              slTriggerPx: stopPrice ? String(stopPrice) : undefined
            };

            // 2. Risk Manager Validation
            const riskValidation = canOpenPosition(tradeParams, balanceObj, conviction, effectivePositions.length, currentPrice);

            if (riskValidation.valid) {
              // 3. Execute Trade on OKX
              const openRes = await fetchLocalApi('/api/okx-perps', {
                action: 'open_position',
                params: { symbol, direction, leverage, amount: positionSizeUsd, conviction, mode: okxMode, skipOnchainCommit: true, internalSecret: cycleSecret },
              }, true);

              if (openRes.ok) {
                executionResult = openRes;

                // 4. Set TP/SL — MANDATORY for challenge
                if (stopPrice || targetPrice) {
                  tpslResult = await fetchLocalApi('/api/okx-perps', {
                    action: 'set_tpsl',
                    params: { symbol, direction, stopLoss: stopPrice, takeProfit: targetPrice, mode: okxMode, internalSecret: cycleSecret }
                  }, true /* noFallback */);
                  // If TP/SL failed and we have a stop, this is dangerous — close position
                  if (!tpslResult?.ok && stopPrice) {
                    console.error('[Cycle] TP/SL FAILED — closing unprotected position');
                    const closeRes = await fetchLocalApi('/api/okx-perps', {
                      action: 'close_position',
                      params: { symbol, direction, mode: okxMode, internalSecret: cycleSecret }
                    }, true /* noFallback */);
                    // Verify the close actually worked
                    executionResult = null;
                    if (!closeRes?.ok) {
                      console.error('[Cycle] EMERGENCY: close_position FAILED — position may still be open without SL!');
                      tradeRejectedReason = 'EMERGENCY: TP/SL failed AND close failed — manual intervention required';
                      // Send emergency Telegram notification
                      const TG_BOT = process.env.TELEGRAM_BOT_TOKEN;
                      const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '1026323121';
                      if (TG_BOT) {
                        fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            chat_id: TG_CHAT,
                            text: `🚨 BOBBY EMERGENCY 🚨\n\nPosition ${direction?.toUpperCase()} ${symbol} is OPEN without Stop Loss!\nTP/SL failed AND close_position failed.\n\nManual intervention required NOW.\nOpen OKX app and close the position manually.`,
                            parse_mode: 'HTML',
                          }),
                        }).catch(e => console.error('[Cycle] Telegram alert failed:', e));
                      }
                    } else {
                      tradeRejectedReason = 'TP/SL failed — position closed for safety';
                    }
                  }
                }

                // 5. On-chain commit only for live challenge mode
                if (executionResult && shouldCommitOnchain) {
                  try {
                    const commitRes = await fetchLocalApi('/api/xlayer-record', {
                      action: 'commit',
                      threadId: threadId || `bobby-cycle-${Date.now()}`,
                      symbol,
                      agent: 'cio',
                      conviction: conviction !== null ? Math.round(conviction * 10) : 5,
                      entryPrice: currentPrice,
                      targetPrice,
                      stopPrice,
                    }, true);
                    if (commitRes.ok) {
                      txHash = commitRes.txHash;
                    } else {
                      // Trade executed but commit failed — mark as uncommitted
                      console.warn('[Cycle] Trade executed but on-chain commit failed');
                    }
                  } catch (commitErr) {
                    console.warn('[Cycle] On-chain commit exception (trade still open):', commitErr);
                  }
                } else if (executionResult && challengeMode === 'paper') {
                  txHash = 'paper-mode';
                }

              } else {
                tradeRejectedReason = openRes.error || 'OKX API execution failed';
              }
            } else {
              tradeRejectedReason = riskValidation.reason || 'Unknown risk validation failure';
            }
          }
        } else {
          tradeRejectedReason = 'Could not fetch OKX balance';
        }
      } catch (err) {
        tradeRejectedReason = `Execution exception: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else if (conviction !== null && conviction < 0.6) {
      tradeRejectedReason = 'Conviction below 6/10 threshold';
    } else if (!isDryRun && structuredVerdictRejectReason) {
      tradeRejectedReason = structuredVerdictRejectReason;
    }

    // ============================================================
    // PHASE 5: Update thread with execution results
    // ============================================================
    if (threadId) {
      try {
        // Update status — columns may not exist yet, so non-blocking
        await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify({
            status: executionResult ? 'executed' : (tradeRejectedReason ? 'rejected' : 'active'),
          }),
      });
      } catch (patchErr) {
        console.warn('[Cycle] Thread status update failed (non-blocking):', patchErr);
      }
    }

    // ============================================================
    // PHASE 5: Generate digest summary (for "mientras dormías...")
    // ============================================================
    const digestSymbol = symbol || 'market';
    const digestDirection = direction || 'neutral';
    const convNum = conviction !== null ? Math.round(conviction * 10) : 0;

    const digestPrompt = `Summarize this trading cycle in 2-3 sentences for someone who just woke up. Be direct and conversational — like a morning text from a smart friend.

CONTEXT:
- Symbol analyzed: ${digestSymbol}
- Direction: ${digestDirection}
- Conviction: ${convNum}/10
- Market regime: ${intel.regime || 'unknown'}
- Open positions: ${effectivePositions.length > 0 ? effectivePositions.map((p: any) => `${p.symbol} ${p.direction} ${p.unrealizedPnlPct?.toFixed(1)}%`).join(', ') : 'none'}
- Win rate: ${track.winRate}%

CIO VERDICT:
${cioPost}

EXECUTION RESULT:
${executionResult ? `TRADE EXECUTED ON OKX ${challengeMode === 'paper' ? 'DEMO' : '& COMMITTED ON X LAYER'}` : `NO TRADE. Reason: ${tradeRejectedReason}`}

CHALLENGE MODE:
${challengeMode.toUpperCase()}

${lang === 'es' ? 'Responde en español mexicano, casual pero inteligente. Como un mensaje de WhatsApp de tu trader de confianza. Menciona brevemente si se abrio trade o por que no.' : 'Respond in English, casual but smart. Like a morning text from your trusted trader. Mention if a trade was opened or why not.'}`;

    const digestSummary = await callClaude('claude-haiku-4-5-20251001',
      'You write ultra-concise morning market digests. No greetings, no fluff. Jump straight to what matters.',
      digestPrompt, 150
    );

    // Build highlights array
    const highlights = [{
      symbol: digestSymbol,
      direction: digestDirection,
      conviction: convNum,
      verdict: conviction !== null && conviction >= 0.6 ? 'execute' : conviction !== null && conviction >= 0.4 ? 'watch' : 'reject',
    }];

    // Save global digest (for anonymous users + anyone who opens Bobby)
    const digest = await sbInsert('user_digests', {
      cycle_id: cycleId || null,
      thread_id: threadId || null,
      wallet_address: null, // Global digest
      summary: digestSummary,
      highlights: JSON.stringify(highlights),
      positions_snapshot: effectivePositions.length > 0 ? JSON.stringify(effectivePositions) : null,
      market_snapshot: JSON.stringify(marketSnapshot),
      language: lang,
      kind,
    });

    // ============================================================
    // PHASE 6: Update cycle as completed
    // ============================================================
    if (cycleId) {
      const latencyMs = Date.now() - startTime;
      await fetch(`${SB_URL}/rest/v1/agent_cycles?id=eq.${cycleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({
          completed_at: new Date().toISOString(),
          status: 'completed',
          latency_ms: latencyMs,
          llm_reasoning: `Debate: ${digestSymbol} ${digestDirection} ${convNum}/10`,
        }),
      });
    }

    // ============================================================
    // PHASE 7: Twitter Integration (Challenge Mode)
    // ============================================================
    const TWITTER_BEARER = process.env.TWITTER_BEARER_TOKEN;
    
    // Construct tweet
    const executeStr = executionResult ? `✅ EXECUTED: ${direction?.toUpperCase()} @ $${entryPrice}` : `⛔ NO TRADE: ${tradeRejectedReason || 'No setup'}`;
    const balanceNow = finalBalanceStr || '???';
    const initBal = 100;
    const pnlPct = balanceNow !== '???' ? (((parseFloat(balanceNow) - initBal) / initBal) * 100).toFixed(1) : '0';
    const totalTrades = track.wins + track.losses;
    
    const tweetText = `🤖 Bobby's $100 Challenge Update

📊 Scanned ${intel.prices?.length || 50} markets
🧠 Conviction: ${convNum}/10 on ${digestSymbol}
${executeStr}

💰 Balance: $${balanceNow} (${parseFloat(pnlPct) >= 0 ? '+' : ''}${pnlPct}%)
📈 Win rate: ${track.wins}/${totalTrades} trades (${track.winRate}%)
${txHash ? `🔗 On-chain: ${txHash.slice(0, 10)}...` : '🔗 No on-chain commit'}

#BobbyTrader #VibeTrading #OKX`;

    if (TWITTER_BEARER && shouldPublishTwitter) {
      try {
        await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TWITTER_BEARER}`
          },
          body: JSON.stringify({ text: tweetText })
        });
      } catch (e) { console.error('Tweet failed', e); }
    }

    return res.status(200).json({
      ok: true,
      challengeMode,
      executionVenue: isDryRun ? 'none' : okxMode,
      cycleId,
      threadId: threadId || null,
      digestId: digest?.id || null,
      topic,
      conviction,
      symbol: digestSymbol,
      direction: digestDirection,
      highlights,
      summary: digestSummary,
      positions: effectivePositions.length,
      executed: !!executionResult,
      tradeRejectedReason,
      txHash,
      tpslOk: tpslResult?.ok ?? null,
      usedTestVerdict: !!useTestVerdict,
      usedTestState: !!useTestState,
      effectiveBalance: effectiveBalanceForExecution,
      tweet: tweetText,
      latencyMs: Date.now() - startTime,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cycle] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
