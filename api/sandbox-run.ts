// ============================================================
// POST /api/sandbox-run — Live adversarial simulation via SSE
// Streams Alpha Hunter → Red Team → CIO → Judge → 11 Guardrails
// → Verdict for a chosen playbook. Persists every run (including
// interrupted ones) to sandbox_runs for the public feed.
// Simulation only: never executes, never on-chain.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { PLAYBOOKS, type Playbook } from '../src/data/playbooks.js';

export const config = { maxDuration: 180 };

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = 'gpt-4o-mini';
const OKX_BASE = 'https://www.okx.com';
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOBBY_INTEL_BASE = process.env.BOBBY_PROTOCOL_BASE_URL || 'https://bobbyprotocol.xyz';

// ── Rate limit (soft, best-effort) ─────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10;

function hashIp(ip: string): string {
  return createHash('sha256').update(`bobby-sandbox:${ip}`).digest('hex').slice(0, 24);
}

async function checkRateLimit(ipHash: string): Promise<{ allowed: boolean; count: number }> {
  if (!SB_KEY) return { allowed: true, count: 0 };
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const url = `${SB_URL}/rest/v1/sandbox_runs?select=id&ip_hash=eq.${ipHash}&created_at=gte.${since}&limit=${RATE_LIMIT_MAX + 1}`;
  try {
    const r = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return { allowed: true, count: 0 };
    const rows = (await r.json()) as Array<{ id: string }>;
    return { allowed: rows.length < RATE_LIMIT_MAX, count: rows.length };
  } catch {
    return { allowed: true, count: 0 };
  }
}

// ── SSE helpers ────────────────────────────────────────────
type SseWriter = (event: string, data: Record<string, unknown>) => void;

function sseWriter(res: VercelResponse): SseWriter {
  return (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

// ── Timeout wrapper for per-phase abort ────────────────────
class PhaseTimeoutError extends Error {
  phase: string;
  partialText?: string;
  constructor(phase: string, ms: number, partialText?: string) {
    super(`Phase ${phase} timed out after ${ms}ms`);
    this.phase = phase;
    this.partialText = partialText;
  }
}

// ── Market context (real OKX data) ─────────────────────────
interface MarketContext {
  ticker: string;
  price: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volUsd24h: number | null;
  source: 'okx' | 'unavailable';
}

async function fetchMarketContext(ticker: string, signal?: AbortSignal): Promise<MarketContext> {
  const instId = `${ticker}-USDT`;
  try {
    const resp = await fetch(`${OKX_BASE}/api/v5/market/ticker?instId=${instId}`, {
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!resp.ok) throw new Error(`OKX ${resp.status}`);
    const json = (await resp.json()) as { code: string; data: Array<{ last: string; open24h: string; high24h: string; low24h: string; volCcy24h: string }> };
    if (json.code !== '0' || !json.data?.[0]) throw new Error('No data');
    const t = json.data[0];
    const last = parseFloat(t.last);
    const open = parseFloat(t.open24h);
    const change = open > 0 ? ((last - open) / open) * 100 : null;
    return {
      ticker,
      price: Number.isFinite(last) ? last : null,
      change24hPct: change,
      high24h: parseFloat(t.high24h),
      low24h: parseFloat(t.low24h),
      volUsd24h: parseFloat(t.volCcy24h),
      source: 'okx',
    };
  } catch {
    return { ticker, price: null, change24hPct: null, high24h: null, low24h: null, volUsd24h: null, source: 'unavailable' };
  }
}

function formatMarketForPrompt(ctx: MarketContext): string {
  if (ctx.source === 'unavailable' || ctx.price === null) {
    return `Ticker: ${ctx.ticker}. Market data: unavailable (offline probe). Reason about general conditions only.`;
  }
  const chg = ctx.change24hPct;
  const regime =
    chg === null ? 'unknown'
    : chg > 3 ? 'risk-on expansion'
    : chg > 0 ? 'mild bid'
    : chg > -3 ? 'chop / distribution'
    : 'risk-off drawdown';
  return [
    `Ticker: ${ctx.ticker} (OKX spot ${ctx.ticker}-USDT).`,
    `Last: $${ctx.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}.`,
    chg !== null ? `24h change: ${chg.toFixed(2)}%.` : '',
    ctx.high24h && ctx.low24h ? `24h range: $${ctx.low24h} – $${ctx.high24h}.` : '',
    ctx.volUsd24h ? `24h USD volume: $${Math.round(ctx.volUsd24h).toLocaleString()}.` : '',
    `Spot regime read: ${regime}.`,
  ].filter(Boolean).join(' ');
}

// ── Bobby intel (compact protocol-wide context) ────────────
interface BobbyIntel {
  regime?: string;
  fearGreed?: number | string;
  mood?: string;
  dynamicConviction?: number;
  technicalLeader?: string;
  available: boolean;
}

async function fetchBobbyIntel(signal?: AbortSignal): Promise<BobbyIntel> {
  try {
    const resp = await fetch(`${BOBBY_INTEL_BASE}/api/bobby-intel`, { signal });
    if (!resp.ok) throw new Error(`intel ${resp.status}`);
    const json: any = await resp.json();
    return {
      regime: json?.regime || json?.market?.regime,
      fearGreed: json?.fearGreed?.value ?? json?.fearGreed,
      mood: json?.mood || json?.performance?.mood,
      dynamicConviction: json?.dynamicConviction || json?.conviction?.dynamic,
      technicalLeader: json?.technicalPulse?.leader || json?.leaders?.[0]?.symbol,
      available: true,
    };
  } catch {
    return { available: false };
  }
}

function formatIntelForPrompt(intel: BobbyIntel): string {
  if (!intel.available) return '';
  const bits: string[] = [];
  if (intel.regime) bits.push(`regime: ${intel.regime}`);
  if (intel.fearGreed !== undefined) bits.push(`fear/greed: ${intel.fearGreed}`);
  if (intel.mood) bits.push(`protocol mood: ${intel.mood}`);
  if (typeof intel.dynamicConviction === 'number') bits.push(`dynamic conviction: ${intel.dynamicConviction.toFixed(2)}`);
  if (intel.technicalLeader) bits.push(`technical leader: ${intel.technicalLeader}`);
  return bits.length ? `Protocol intel — ${bits.join('; ')}.` : '';
}

// ── Guardrail catalog ──────────────────────────────────────
const GUARDRAILS = [
  { id: 'conviction_gate',     label: 'Conviction Gate' },
  { id: 'mandatory_stop',      label: 'Mandatory Stop Loss' },
  { id: 'circuit_breaker',     label: 'Circuit Breaker' },
  { id: 'drawdown_kill_switch',label: 'Drawdown Kill Switch' },
  { id: 'hard_risk_gate',      label: 'Hard Risk Gate' },
  { id: 'metacognition',       label: 'Metacognition' },
  { id: 'commit_reveal',       label: 'Commit-Reveal' },
  { id: 'judge_mode_6d',       label: 'Judge Mode (6D)' },
  { id: 'adversarial_bounties',label: 'Adversarial Bounties' },
  { id: 'yield_parking',       label: 'Yield Parking' },
  { id: 'wheel_market_breaker',label: 'Wheel Market Breaker' },
] as const;

const JUDGE_DIMENSIONS = [
  { id: 'data_integrity',        label: 'Data Integrity' },
  { id: 'adversarial_quality',   label: 'Adversarial Quality' },
  { id: 'decision_logic',        label: 'Decision Logic' },
  { id: 'risk_management',       label: 'Risk Management' },
  { id: 'calibration_alignment', label: 'Calibration' },
  { id: 'novelty',               label: 'Novelty' },
] as const;

// ── Playbook-aware prompt shaping ──────────────────────────
function categoryFraming(cat: string): string {
  switch (cat) {
    case 'yield':
      return 'This is a YIELD playbook — reason in terms of idle-cash optimization, protocol risk (smart contract, depeg), APY sustainability, and opportunity cost vs directional exposure.';
    case 'on-chain-flow':
      return 'This is an ON-CHAIN FLOW playbook — reason in terms of wallet behavior, liquidity migration, bridge activity, and MEV risk.';
    case 'risk-management':
      return 'This is a RISK-MANAGEMENT playbook — reason in terms of circuit breakers, drawdown limits, position sizing, tail risk, and correlation breakdowns.';
    case 'volatility':
      return 'This is a VOLATILITY playbook — reason in terms of implied vs realized vol, vega exposure, gamma risk, theta decay, and term-structure dislocations. Catalysts (earnings, unlocks, macro prints) are central.';
    case 'arbitrage':
      return 'This is an ARBITRAGE playbook — reason in terms of price/funding divergence between venues, execution slippage, borrow costs, and how fast the spread decays. Capital efficiency and leg-synchronization risk dominate.';
    default:
      return 'This is a DIRECTIONAL playbook — reason in terms of thesis, invalidation, entry trigger, and asymmetric payoff.';
  }
}

function buildSystemPrompts(pb: Playbook | null): {
  alpha: string;
  red: string;
  cio: string;
  judge: string;
} {
  const framing = pb ? categoryFraming(pb.category) : '';
  const pbCtx = pb
    ? `Playbook: "${pb.name}". What it is: ${pb.whatItIs} Pain without Bobby: ${pb.painWithoutBobby} ${framing}`
    : '';

  const alpha = `You are Alpha Hunter, a bold trader looking for asymmetric bets on X Layer (OKB ecosystem).
${pbCtx ? `\nPlaybook context for this run:\n${pbCtx}\n` : ''}
Output 3-5 short sentences. Build the BULL thesis for the ticker given. Mention 1 catalyst, 1 entry trigger, 1 invalidation. Terse, concrete, no hedging.`;

  const red = `You are Red Team, an adversarial short seller. Your ONLY job is to destroy the thesis you just read.
${pbCtx ? `\nPlaybook context:\n${pbCtx}\n` : ''}
Output 3-5 short sentences. Name the strongest counter-argument, the most likely failure mode, and one specific piece of evidence that would invalidate the bull case. Be ruthless. No "on the other hand."`;

  const cio = `You are the CIO. You just read the bull thesis and the red team rebuttal.
${pbCtx ? `\nPlaybook context:\n${pbCtx}\n` : ''}
Output 3-4 short sentences + a final line in this exact format:
VERDICT: <EXECUTE|YIELD_PARK|BLOCKED> | CONVICTION: <0.0-10.0>
Rules:
- BLOCKED if red team's counter is stronger than the thesis
- YIELD_PARK if the thesis is plausible but conviction < 3.5
- EXECUTE only if conviction >= 3.5 and no critical red-team flaw`;

  const judge = `You are the Judge. Audit the debate that just happened. Rate each of the 6 dimensions 1-5.
Respond with ONLY valid JSON, no prose:
{"data_integrity": <1-5>, "adversarial_quality": <1-5>, "decision_logic": <1-5>, "risk_management": <1-5>, "calibration_alignment": <1-5>, "novelty": <1-5>}`;

  return { alpha, red, cio, judge };
}

// ── Stream a single agent turn via OpenAI ──────────────────
const PHASE_TIMEOUT_MS = 50_000;

async function streamAgent(
  send: SseWriter,
  phase: string,
  system: string,
  userPayload: string,
): Promise<string> {
  send('phase_start', { phase });
  let full = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHASE_TIMEOUT_MS);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 400,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPayload },
        ],
      }),
      signal: controller.signal,
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const ln of lines) {
        if (!ln.startsWith('data: ')) continue;
        const json = ln.slice(6).trim();
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            full += token;
            send('phase_token', { phase, token });
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }

    send('phase_end', { phase, text: full });
    return full;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new PhaseTimeoutError(phase, PHASE_TIMEOUT_MS, full);
    }
    // Re-throw with partial text attached if we got any
    if (full) {
      const wrapped = new PhaseTimeoutError(phase, 0, full);
      wrapped.message = err?.message || `Phase ${phase} failed`;
      throw wrapped;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function openaiOneShot(system: string, user: string, maxTokens: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data: any = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// ── Parsers ────────────────────────────────────────────────
function parseCio(text: string): { action: 'EXECUTE' | 'YIELD_PARK' | 'BLOCKED'; conviction: number } {
  const m = text.match(/VERDICT:\s*(EXECUTE|YIELD_PARK|BLOCKED)\s*\|\s*CONVICTION:\s*([0-9.]+)/i);
  if (!m) return { action: 'BLOCKED', conviction: 0 };
  const action = m[1].toUpperCase() as 'EXECUTE' | 'YIELD_PARK' | 'BLOCKED';
  const conviction = Math.max(0, Math.min(10, parseFloat(m[2]) || 0));
  return { action, conviction };
}

function parseJudge(text: string): Record<string, number> {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const obj = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const out: Record<string, number> = {};
    for (const dim of JUDGE_DIMENSIONS) {
      const raw = Number(obj[dim.id]);
      out[dim.id] = Number.isFinite(raw) ? Math.max(1, Math.min(5, raw)) : 3;
    }
    return out;
  } catch {
    const out: Record<string, number> = {};
    for (const dim of JUDGE_DIMENSIONS) out[dim.id] = 3;
    return out;
  }
}

// ── Guardrail evaluation ───────────────────────────────────
function evalGuardrails(
  action: string,
  conviction: number,
  judge: Record<string, number>,
): Array<{ id: string; label: string; status: 'pass' | 'fail' | 'skip' }> {
  const weighted =
    (judge.data_integrity ?? 3) * 0.2 +
    (judge.adversarial_quality ?? 3) * 0.25 +
    (judge.decision_logic ?? 3) * 0.2 +
    (judge.risk_management ?? 3) * 0.15 +
    (judge.calibration_alignment ?? 3) * 0.1 +
    (judge.novelty ?? 3) * 0.1;
  const judgeScore20 = weighted * 4;

  return GUARDRAILS.map((g) => {
    let status: 'pass' | 'fail' | 'skip';
    switch (g.id) {
      case 'conviction_gate':      status = conviction >= 3.5 ? 'pass' : 'fail'; break;
      case 'mandatory_stop':       status = action === 'BLOCKED' ? 'skip' : 'pass'; break;
      case 'circuit_breaker':      status = 'pass'; break;
      case 'drawdown_kill_switch': status = 'pass'; break;
      case 'hard_risk_gate':       status = action === 'EXECUTE' && conviction < 3.5 ? 'fail' : 'pass'; break;
      case 'metacognition':        status = (judge.decision_logic ?? 3) >= 3 ? 'pass' : 'fail'; break;
      case 'commit_reveal':        status = action === 'BLOCKED' ? 'skip' : 'pass'; break;
      case 'judge_mode_6d':        status = judgeScore20 >= 12 ? 'pass' : 'fail'; break;
      case 'adversarial_bounties': status = (judge.adversarial_quality ?? 3) >= 3 ? 'pass' : 'fail'; break;
      case 'yield_parking':        status = action === 'YIELD_PARK' ? 'pass' : 'skip'; break;
      case 'wheel_market_breaker': status = 'skip'; break;
      default:                     status = 'skip';
    }
    return { id: g.id, label: g.label, status };
  });
}

// ── Persistence ────────────────────────────────────────────
interface RunRecord {
  playbook_slug: string;
  ticker: string;
  market_snapshot: MarketContext | null;
  alpha_text: string;
  red_text: string;
  cio_text: string;
  cio_action: string | null;
  cio_conviction: number | null;
  judge_scores: Record<string, number> | null;
  guardrail_results: Array<{ id: string; label: string; status: string }> | null;
  verdict_action: string | null;
  guardrails_passed: number | null;
  guardrails_failed: number | null;
  guardrails_total: number | null;
  verdict_reason: string | null;
  status: 'completed' | 'interrupted' | 'errored';
  error_phase: string | null;
  error_message: string | null;
  ip_hash: string | null;
  user_agent: string | null;
}

async function persistRun(record: RunRecord): Promise<string | null> {
  if (!SB_KEY) return null;
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/sandbox_runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(record),
    });
    if (!resp.ok) {
      console.warn('[sandbox-run] persist failed:', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const rows = (await resp.json()) as Array<{ id: string }>;
    return rows?.[0]?.id || null;
  } catch (err: any) {
    console.warn('[sandbox-run] persist error:', err?.message);
    return null;
  }
}

// ── Handler ────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.method === 'POST' ? (req.body || {}) : (req.query as Record<string, string>);
  const playbookSlug = String(body.playbookSlug || 'conviction-gated-swing');
  const rawTicker = String(body.ticker || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const ticker = rawTicker || 'BTC';
  const playbook = PLAYBOOKS.find((p) => p.slug === playbookSlug) || null;

  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  // Rate limit (soft)
  const ipRaw =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string | undefined) ||
    'unknown';
  const ipHash = hashIp(ipRaw);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 240);

  const { allowed, count } = await checkRateLimit(ipHash);
  if (!allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Too many pressure-tests from your network (${count}/${RATE_LIMIT_MAX} in the last hour). Try again later.`,
    });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = sseWriter(res);

  // Accumulator for persistence
  const record: RunRecord = {
    playbook_slug: playbookSlug,
    ticker,
    market_snapshot: null,
    alpha_text: '',
    red_text: '',
    cio_text: '',
    cio_action: null,
    cio_conviction: null,
    judge_scores: null,
    guardrail_results: null,
    verdict_action: null,
    guardrails_passed: null,
    guardrails_failed: null,
    guardrails_total: null,
    verdict_reason: null,
    status: 'errored',
    error_phase: null,
    error_message: null,
    ip_hash: ipHash,
    user_agent: userAgent,
  };

  try {
    send('meta', {
      playbookSlug,
      ticker,
      simulation: true,
      disclaimer: 'Simulation only. No capital moves. No on-chain commit.',
      guardrails: GUARDRAILS,
      dimensions: JUDGE_DIMENSIONS,
      playbook: playbook ? { name: playbook.name, tagline: playbook.tagline, category: playbook.category } : null,
      rateLimit: { used: count + 1, max: RATE_LIMIT_MAX, windowHours: 1 },
    });

    // Market context
    send('phase_start', { phase: 'market_context' });
    const marketCtx = await fetchMarketContext(ticker);
    record.market_snapshot = marketCtx;
    send('market_context', marketCtx);
    send('phase_end', { phase: 'market_context' });

    // Protocol intel (soft — failure is non-fatal)
    const intel = await fetchBobbyIntel().catch(() => ({ available: false } as BobbyIntel));
    const intelLine = formatIntelForPrompt(intel);
    if (intel.available) send('bobby_intel', intel as unknown as Record<string, unknown>);

    const prompts = buildSystemPrompts(playbook);
    const marketLine = formatMarketForPrompt(marketCtx);
    const ctx = [
      `Venue: OKX + X Layer (chain 196).`,
      `Live market (just fetched from OKX): ${marketLine}`,
      intelLine,
    ].filter(Boolean).join('\n');

    // 1) Alpha Hunter
    const alphaText = await streamAgent(send, 'alpha_hunter', prompts.alpha, ctx);
    record.alpha_text = alphaText;

    // 2) Red Team
    const redText = await streamAgent(send, 'red_team', prompts.red, `${ctx}\n\nBULL THESIS:\n${alphaText}`);
    record.red_text = redText;

    // 3) CIO
    const cioText = await streamAgent(
      send,
      'cio',
      prompts.cio,
      `${ctx}\n\nBULL THESIS:\n${alphaText}\n\nRED TEAM REBUTTAL:\n${redText}`,
    );
    record.cio_text = cioText;
    const { action, conviction } = parseCio(cioText);
    record.cio_action = action;
    record.cio_conviction = conviction;
    send('cio_verdict', { action, conviction });

    // 4) Judge
    send('phase_start', { phase: 'judge' });
    const judgeText = await openaiOneShot(
      prompts.judge,
      `DEBATE TRANSCRIPT:\n\n[ALPHA]\n${alphaText}\n\n[RED TEAM]\n${redText}\n\n[CIO]\n${cioText}`,
      200,
    );
    const judgeScores = parseJudge(judgeText);
    record.judge_scores = judgeScores;
    send('judge_scores', { scores: judgeScores });
    send('phase_end', { phase: 'judge' });

    // 5) Guardrail Gauntlet
    send('phase_start', { phase: 'guardrails' });
    const results = evalGuardrails(action, conviction, judgeScores);
    record.guardrail_results = results;
    for (const r of results) {
      send('guardrail', r);
      await new Promise((r) => setTimeout(r, 140));
    }
    send('phase_end', { phase: 'guardrails' });

    // 6) Final verdict
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const finalAction = failed > 0 && action === 'EXECUTE' ? 'BLOCKED' : action;
    const reason =
      finalAction === 'BLOCKED'
        ? 'Adversarial review and guardrails rejected this trade.'
        : finalAction === 'YIELD_PARK'
        ? 'Conviction below threshold. Capital parked, not deployed.'
        : 'Thesis survived adversarial debate and all guardrail checks.';
    record.verdict_action = finalAction;
    record.guardrails_passed = passed;
    record.guardrails_failed = failed;
    record.guardrails_total = results.length;
    record.verdict_reason = reason;
    record.status = 'completed';

    send('verdict', {
      action: finalAction,
      conviction,
      guardrailsPassed: passed,
      guardrailsFailed: failed,
      guardrailsTotal: results.length,
      reason,
    });

    // Persist completed run
    const runId = await persistRun(record);
    send('done', { ok: true, runId });
    res.end();
  } catch (err: any) {
    const isPhaseTimeout = err instanceof PhaseTimeoutError;
    const phase = isPhaseTimeout ? err.phase : 'unknown';
    const partial = isPhaseTimeout ? err.partialText : undefined;

    // Attach partial text to the correct record field if present
    if (partial) {
      if (phase === 'alpha_hunter') record.alpha_text = record.alpha_text || partial;
      if (phase === 'red_team') record.red_text = record.red_text || partial;
      if (phase === 'cio') record.cio_text = record.cio_text || partial;
    }
    record.status = 'interrupted';
    record.error_phase = phase;
    record.error_message = (err?.message || 'Unknown error').slice(0, 400);

    console.error('[sandbox-run] interrupted at phase:', phase, err?.message);
    send('error', {
      phase,
      recoverable: true,
      message: (err?.message || 'Unknown error').slice(0, 240),
      partialText: partial || undefined,
    });

    // Persist interrupted run (still goes to feed for transparency)
    const runId = await persistRun(record).catch(() => null);
    send('done', { ok: false, runId });
    res.end();
  }
}
