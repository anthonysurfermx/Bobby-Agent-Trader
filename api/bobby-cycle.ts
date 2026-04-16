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
import type { TechnicalAssetSignal, TechnicalMarketSummary } from '../src/lib/bobby-technical.js';
import { ethers } from 'ethers';
import { recordHardnessActivity } from './_lib/hardness-registry.js';
import { BOBBY_PROTOCOL_BASE_URL } from './_lib/protocol-constants.js';
import { logHarnessEvent, buildVerdict, distillEpisode } from './_lib/harness-events.js';

export const config = { maxDuration: 300 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
const READONLY_FALLBACK_HOSTS = [BOBBY_PROTOCOL_BASE_URL, 'https://defimexico.org', 'https://defi-mexico-hub.vercel.app'];

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

async function sbPatch(table: string, filters: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${filters}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Cycle] ${table} patch failed:`, res.status, errBody);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[Cycle] ${table} patch error:`, e);
    return false;
  }
}

// ---- OpenAI helper ----

// Model mapping: Anthropic model id → OpenAI equivalent
const OPENAI_FALLBACK: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'gpt-4o-mini',
  'claude-sonnet-4-20250514': 'gpt-4o',
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

async function callClaude(model: string, system: string, userMsg: string, maxTokens: number, timeoutMs = 25000): Promise<string> {
  const openaiModel = OPENAI_FALLBACK[model] || 'gpt-4o-mini';
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`OpenAI ${openaiModel}: ${res.status} ${errBody.slice(0, 200)}`);
    }
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error(`LLM call timed out after ${timeoutMs}ms (${openaiModel})`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Structured Verdict via OpenAI function calling ----

interface StructuredVerdict {
  action: 'open' | 'close' | 'none';
  symbol: string;
  direction: string;
  conviction: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  invalidation: string;
  vibe_phrase: string;
  hook: string;
  thesis: string;
  risks: string[];
}

const VERDICT_SCHEMA = {
  type: 'object' as const,
  properties: {
    action: { type: 'string' as const, enum: ['open', 'close', 'none'] },
    symbol: { type: 'string' as const, description: 'Asset symbol: BTC, ETH, SOL, or none' },
    direction: { type: 'string' as const, enum: ['long', 'short', 'none'] },
    conviction: { type: 'number' as const, description: 'Conviction 1-10. 1-3=sit out, 4-5=small exploratory, 6-7=core position, 8-10=high conviction' },
    entry: { type: ['number', 'null'] as any, description: 'Entry price or null' },
    stop: { type: ['number', 'null'] as any, description: 'Stop loss price. MANDATORY when action=open — never null for trades. Use a tight technical level (support/resistance) or 3% from entry.' },
    target: { type: ['number', 'null'] as any, description: 'Take profit price or null' },
    invalidation: { type: 'string' as const, description: 'What invalidates this thesis' },
    vibe_phrase: { type: 'string' as const, description: 'One punchy sentence capturing your mood. Like Bobby Axelrod on a phone call.' },
    hook: { type: 'string' as const, description: 'One sharp opening sentence for the forum post' },
    thesis: { type: 'string' as const, description: '2-3 sentences explaining your reasoning. Be assertive, use trading vocabulary: pain trade, liquidity sweep, leverage flush.' },
    risks: { type: 'array' as const, items: { type: 'string' as const }, description: 'Top 2-3 risks to this trade' },
  },
  required: ['action', 'symbol', 'direction', 'conviction', 'entry', 'stop', 'target', 'invalidation', 'vibe_phrase', 'hook', 'thesis', 'risks'],
  additionalProperties: false,
};

async function callStructuredVerdict(system: string, userMsg: string, timeoutMs = 30000): Promise<StructuredVerdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!OPENAI_API_KEY) throw new Error('OpenAI API key required for structured verdict');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'submit_verdict',
            description: 'Submit your trading verdict. This is MANDATORY — you must call this function.',
            parameters: VERDICT_SCHEMA,
          },
        }],
        tool_choice: { type: 'function', function: { name: 'submit_verdict' } },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`OpenAI structured verdict failed: ${res.status} ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error('No tool call in structured verdict response');
    }

    const verdict: StructuredVerdict = JSON.parse(toolCall.function.arguments);

    // Validate critical fields
    if (!['open', 'close', 'none'].includes(verdict.action)) verdict.action = 'none';
    if (typeof verdict.conviction !== 'number' || verdict.conviction < 1 || verdict.conviction > 10) verdict.conviction = 3;
    if (verdict.action === 'open' && (!verdict.symbol || verdict.symbol === 'none')) verdict.action = 'none';
    if (verdict.action === 'open' && (!verdict.direction || verdict.direction === 'none')) verdict.action = 'none';

    return verdict;
  } finally {
    clearTimeout(timer);
  }
}


// ---- Fetch local internal API ----
// noFallback=true for mutant actions (open_position, close_position) — NEVER retry those
async function fetchLocalApi(path: string, body: any, noFallback = false): Promise<any> {
  const internalAuth = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET || '';
  try {
    const res = await fetch(`${BOBBY_PROTOCOL_BASE_URL}${path}`, {
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

  // Fallback to alt domain ONLY for read-only endpoints
  for (const host of READONLY_FALLBACK_HOSTS.slice(1)) {
    try {
      const res2 = await fetch(`${host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res2.ok) return await res2.json();
    } catch (e) { console.error(`Fallback failed for ${path} via ${host}`, e); }
  }

  return { ok: false, error: 'API unreachable' };
}

type ChallengeMode = 'dryrun' | 'paper' | 'live';

function resolveChallengeMode(reqMethod: string, requestedMode: string): ChallengeMode {
  if (reqMethod === 'GET') return 'live';
  if (requestedMode === 'challenge_paper' || requestedMode === 'paper') return 'paper';
  if (requestedMode === 'challenge_live' || requestedMode === 'live') return 'live';
  return 'dryrun';
}

type YieldVenueType = 'defi_onchain' | 'okx_earn' | 'none';

interface YieldCandidate {
  investmentId: string | null;
  platform: string;
  chain: string;
  token: string;
  apy: number;
  tvl?: number | null;
  productGroup?: string | null;
  venueType?: Exclude<YieldVenueType, 'none'>;
  riskScore?: number | null;
  maxExitSeconds?: number | null;
  notes?: string | null;
}

interface YieldVerdict {
  deploy: boolean;
  keepCashPct: number;
  allocationUsd: number;
  platform: string | null;
  chain: string | null;
  token: string | null;
  investmentId: string | null;
  venueType: YieldVenueType;
  expectedApy: number;
  maxExitSeconds: number | null;
  riskScore: number | null;
  rationale: string;
  whyNotTrade: string;
}

interface ActiveYieldPosition {
  id: string;
  status: string;
  platform?: string | null;
  chain?: string | null;
  token?: string | null;
  principal_usd?: number | string | null;
  target_apy?: number | string | null;
}

const DEFAULT_YIELD_CANDIDATES: YieldCandidate[] = [
  {
    investmentId: '9502',
    platform: 'Aave V3',
    chain: 'ethereum',
    token: 'USDC',
    apy: 3.2,
    tvl: 3520000000,
    productGroup: 'LENDING',
    venueType: 'defi_onchain',
    riskScore: 2.5,
    maxExitSeconds: 12,
    notes: 'Deep liquidity, fastest conservative unwind on current list.',
  },
  {
    investmentId: '9501',
    platform: 'Aave V3',
    chain: 'ethereum',
    token: 'USDT',
    apy: 2.8,
    tvl: 2100000000,
    productGroup: 'LENDING',
    venueType: 'defi_onchain',
    riskScore: 2.6,
    maxExitSeconds: 12,
    notes: 'Same-chain stable lending, avoids token conversion.',
  },
  {
    investmentId: '7200',
    platform: 'Compound V3',
    chain: 'ethereum',
    token: 'USDC',
    apy: 2.5,
    tvl: 1800000000,
    productGroup: 'LENDING',
    venueType: 'defi_onchain',
    riskScore: 2.8,
    maxExitSeconds: 12,
    notes: 'Battle-tested but lower APY than Aave.',
  },
  {
    investmentId: '5400',
    platform: 'Kamino',
    chain: 'solana',
    token: 'USDC',
    apy: 8.2,
    tvl: 320000000,
    productGroup: 'LENDING',
    venueType: 'defi_onchain',
    riskScore: 4.8,
    maxExitSeconds: 2,
    notes: 'Higher APY but adds chain and operational complexity.',
  },
  {
    investmentId: '4500',
    platform: 'NAVI',
    chain: 'sui',
    token: 'USDC',
    apy: 6.1,
    tvl: 180000000,
    productGroup: 'LENDING',
    venueType: 'defi_onchain',
    riskScore: 4.5,
    maxExitSeconds: 3,
    notes: 'Strong yield, thinner liquidity and more chain risk.',
  },
];

const MIN_YIELD_IDLE_USD = 25;
const DEFAULT_YIELD_CASH_BUFFER_PCT = 20;

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0';
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function formatTvl(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'n/a';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function normalizeYieldCandidate(raw: any): YieldCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const platform = typeof raw.platform === 'string' ? raw.platform.trim() : '';
  const chain = typeof raw.chain === 'string' ? raw.chain.trim().toLowerCase() : '';
  const token = typeof raw.token === 'string' ? raw.token.trim().toUpperCase() : '';
  const apy = parseNumeric(raw.apy);
  if (!platform || !chain || !token || apy === null) return null;
  const venueType = raw.venueType === 'okx_earn' ? 'okx_earn' : 'defi_onchain';
  return {
    investmentId: raw.investmentId ? String(raw.investmentId) : null,
    platform,
    chain,
    token,
    apy,
    tvl: parseNumeric(raw.tvl),
    productGroup: typeof raw.productGroup === 'string' ? raw.productGroup : null,
    venueType,
    riskScore: parseNumeric(raw.riskScore),
    maxExitSeconds: parseNumeric(raw.maxExitSeconds),
    notes: typeof raw.notes === 'string' ? raw.notes : null,
  };
}

function resolveYieldCandidates(raw: unknown): YieldCandidate[] {
  if (!Array.isArray(raw)) return DEFAULT_YIELD_CANDIDATES;
  const parsed = raw
    .map((candidate) => normalizeYieldCandidate(candidate))
    .filter((candidate): candidate is YieldCandidate => candidate !== null);
  return parsed.length ? parsed : DEFAULT_YIELD_CANDIDATES;
}

function formatYieldCandidatesBlock(candidates: YieldCandidate[]): string {
  if (!candidates.length) return 'No yield candidates available.';
  return candidates
    .slice()
    .sort((a, b) => b.apy - a.apy)
    .map((candidate, index) => {
      const exit = typeof candidate.maxExitSeconds === 'number' ? `${candidate.maxExitSeconds}s exit` : 'exit n/a';
      const risk = typeof candidate.riskScore === 'number' ? `risk ${candidate.riskScore.toFixed(1)}/10` : 'risk n/a';
      const group = candidate.productGroup || 'UNKNOWN';
      const notes = candidate.notes ? ` | ${candidate.notes}` : '';
      return `${index + 1}. ${candidate.platform} | ${candidate.chain} | ${candidate.token} | APY ${candidate.apy.toFixed(2)}% | TVL ${formatTvl(candidate.tvl)} | ${group} | ${risk} | ${exit}${notes}`;
    })
    .join('\n');
}

function findYieldCandidate(candidates: YieldCandidate[], verdict: Partial<YieldVerdict>): YieldCandidate | null {
  if (verdict.investmentId) {
    const byId = candidates.find((candidate) => candidate.investmentId === verdict.investmentId);
    if (byId) return byId;
  }
  if (!verdict.platform || !verdict.chain || !verdict.token) return null;
  const platform = verdict.platform.toLowerCase();
  const chain = verdict.chain.toLowerCase();
  const token = verdict.token.toUpperCase();
  return candidates.find((candidate) =>
    candidate.platform.toLowerCase() === platform &&
    candidate.chain.toLowerCase() === chain &&
    candidate.token.toUpperCase() === token
  ) || null;
}

function parseYieldVerdict(cioPost: string, candidates: YieldCandidate[], idleCashUsd: number): YieldVerdict | null {
  const verdictMatch = cioPost.match(/VERDICT:\s*(\{[\s\S]*?\})/);
  if (!verdictMatch) return null;

  try {
    const raw = JSON.parse(verdictMatch[1]);
    const deploy = raw.deploy === true;
    const keepCashPctRaw = parseNumeric(raw.keepCashPct);
    const keepCashPct = Math.max(0, Math.min(100, keepCashPctRaw ?? (deploy ? DEFAULT_YIELD_CASH_BUFFER_PCT : 100)));
    const candidate = deploy
      ? findYieldCandidate(candidates, {
          investmentId: raw.investmentId ? String(raw.investmentId) : null,
          platform: typeof raw.platform === 'string' ? raw.platform : null,
          chain: typeof raw.chain === 'string' ? raw.chain : null,
          token: typeof raw.token === 'string' ? raw.token : null,
        } as Partial<YieldVerdict>)
      : null;

    if (deploy && !candidate) return null;

    const fallbackAllocation = Math.max(0, idleCashUsd * (1 - keepCashPct / 100));
    const allocationUsdRaw = parseNumeric(raw.allocationUsd);
    const allocationUsd = Math.max(0, Math.min(idleCashUsd, allocationUsdRaw ?? fallbackAllocation));

    if (deploy && allocationUsd <= 0) return null;

    const rationale = typeof raw.rationale === 'string' ? raw.rationale.slice(0, 500) : '';
    const whyNotTrade = typeof raw.whyNotTrade === 'string' ? raw.whyNotTrade.slice(0, 300) : '';

    return {
      deploy,
      keepCashPct: Number(keepCashPct.toFixed(2)),
      allocationUsd: Number(allocationUsd.toFixed(2)),
      platform: deploy ? candidate?.platform || null : null,
      chain: deploy ? candidate?.chain || null : null,
      token: deploy ? candidate?.token || null : null,
      investmentId: deploy ? candidate?.investmentId || null : null,
      venueType: deploy ? (candidate?.venueType || 'defi_onchain') : 'none',
      expectedApy: deploy ? Number((parseNumeric(raw.expectedApy) ?? candidate?.apy ?? 0).toFixed(4)) : 0,
      maxExitSeconds: deploy ? (parseNumeric(raw.maxExitSeconds) ?? candidate?.maxExitSeconds ?? null) : 0,
      riskScore: deploy ? (parseNumeric(raw.riskScore) ?? candidate?.riskScore ?? null) : 0,
      rationale,
      whyNotTrade,
    };
  } catch (e) {
    console.warn('[Cycle] Failed to parse yield VERDICT JSON:', e);
    return null;
  }
}

function yieldRecommendationStatus(
  activeYieldPosition: ActiveYieldPosition | null,
  yieldRecommendation: YieldVerdict | null,
  yieldDebateTriggered: boolean,
): 'none' | 'recommended' | 'active' | 'skipped' {
  if (activeYieldPosition) {
    return activeYieldPosition.status === 'recommended' ? 'recommended' : 'active';
  }
  if (yieldRecommendation?.deploy) return 'recommended';
  if (yieldDebateTriggered) return 'skipped';
  return 'none';
}

// ---- Fetch market intel (frozen snapshot) ----

async function fetchIntel(): Promise<any | null> {
  const urls = READONLY_FALLBACK_HOSTS.map((host) => `${host}/api/bobby-intel`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s hard cap
  try {
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (res.ok) return await res.json();
      } catch (e: any) {
        if (e.name === 'AbortError') { console.warn('[Cycle] fetchIntel timed out'); return null; }
        continue;
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function formatSigned(value: number | null | undefined, decimals = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

function getTechnicalAsset(
  technicalPulse: TechnicalMarketSummary | null | undefined,
  symbol: string | null | undefined,
): TechnicalAssetSignal | null {
  if (!technicalPulse?.assets?.length || !symbol) return technicalPulse?.leader || null;
  return technicalPulse.assets.find((asset) => asset.symbol === symbol) || technicalPulse.leader || null;
}

function formatTechnicalPulseBlock(technicalPulse: TechnicalMarketSummary | null | undefined): string {
  if (!technicalPulse?.assets?.length) return '';
  const leader = technicalPulse.leader;
  const leaderLine = leader
    ? `LEADER: ${leader.symbol} ${leader.signal.toUpperCase()} | score ${formatSigned(leader.compositeScore, 3)} | conviction ${(leader.conviction * 100).toFixed(0)}% | entry ${leader.tradePlan.entry ?? 'n/a'} | stop ${leader.tradePlan.stop ?? 'n/a'} | target ${leader.tradePlan.target ?? 'n/a'}`
    : 'LEADER: none';
  const assetLines = technicalPulse.assets.slice(0, 3).map((asset) => {
    const indicatorLines = Object.entries(asset.breakdown)
      .sort(([, a], [, b]) => (b.weight || 0) - (a.weight || 0))
      .map(([name, reading]) => `${name}: ${reading.bias} score ${formatSigned(reading.score, 2)} w ${reading.weight.toFixed(2)}`)
      .join(' | ');
    return `${asset.symbol}: ${asset.signal.toUpperCase()} | score ${formatSigned(asset.compositeScore, 3)} | agreement ${(asset.agreement * 100).toFixed(0)}% | ${indicatorLines}`;
  }).join('\n');
  return `\n<TECHNICAL_PULSE source="OKX Agent Trade Kit">\nREGIME: ${technicalPulse.regime}\n${leaderLine}\n${assetLines}\n</TECHNICAL_PULSE>`;
}

function directionMatchesTechnical(
  asset: TechnicalAssetSignal | null,
  direction: string | null,
): boolean | null {
  if (!asset || !direction || asset.direction === 'none') return null;
  return asset.direction === direction;
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

// ---- Self-Correction Loop (Metacognition Upgrade C) ----
// Fetch recent contradictions — trades where Bobby was wrong
// Codex: cap at 5 entries, 1 line each, don't bloat prompt

interface Contradiction {
  symbol: string;
  direction: string;
  conviction: number;
  pnlPct: number;
  resolvedAt: string;
  hoursAgo: number;
}

async function getRecentContradictions(): Promise<{ contradictions: Contradiction[]; block: string }> {
  const data = await sbQuery('forum_threads',
    'resolution=in.(loss,break_even)&resolved_at=not.is.null&symbol=not.is.null&select=symbol,direction,conviction_score,resolution_pnl_pct,resolved_at&order=resolved_at.desc&limit=5'
  );

  if (!data.length) return { contradictions: [], block: '\nRECENT MISTAKES: None — record clean.' };

  const now = Date.now();
  const contradictions: Contradiction[] = data
    .filter((d: any) => {
      // Only last 72 hours
      const resolvedTime = new Date(d.resolved_at).getTime();
      return (now - resolvedTime) < 72 * 60 * 60 * 1000;
    })
    .map((d: any) => ({
      symbol: d.symbol,
      direction: d.direction || 'long',
      conviction: d.conviction_score ? Math.round(d.conviction_score * 10) : 0,
      pnlPct: d.resolution_pnl_pct || 0,
      resolvedAt: d.resolved_at,
      hoursAgo: Math.round((now - new Date(d.resolved_at).getTime()) / (60 * 60 * 1000)),
    }));

  if (!contradictions.length) return { contradictions: [], block: '\nRECENT MISTAKES: None in last 72h — record clean.' };

  // Codex: 1 line per entry, capped at 5
  const lines = contradictions.map(c =>
    `- ${c.hoursAgo}h ago: ${c.direction.toUpperCase()} ${c.symbol} @ ${c.conviction}/10 → ${c.pnlPct > 0 ? '+' : ''}${c.pnlPct.toFixed(1)}%`
  );
  const block = `\nRECENT MISTAKES (${contradictions.length}):\n${lines.join('\n')}`;

  return { contradictions, block };
}

// ---- Main handler ----

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
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
  const yieldCandidates = resolveYieldCandidates(body.yieldCandidates);
  const challengeMode = resolveChallengeMode(req.method, requestedMode);
  const okxMode = challengeMode === 'paper' ? 'paper' : 'live';
  const isDryRun = challengeMode === 'dryrun';
  const shouldCommitOnchain = challengeMode === 'live';
  const shouldPublishTwitter = challengeMode === 'live';
  const startTime = Date.now();
  let cycleId: string | undefined;

  try {
    // ============================================================
    // PHASE 0: Clean up stale "running" cycles (Vercel hard-kill recovery)
    // ============================================================
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10min ago
    await fetch(`${SB_URL}/rest/v1/agent_cycles?status=eq.running&started_at=lt.${staleThreshold}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      body: JSON.stringify({ status: 'failed', completed_at: new Date().toISOString(), vibe_phrase: 'Timed out (cleaned by next cycle)' }),
    }).catch(() => {});

    // ============================================================
    // PHASE 1: Freeze market snapshot
    // ============================================================
    const [intel, positions, track, corrections, smartMoney] = await Promise.all([
      fetchIntel(),
      fetchPositions(okxMode),
      getTrackRecord(),
      getRecentContradictions(),
      fetch('https://defimexico.org/api/smart-money-leaderboard?chains=196,1&tokens=OKB,ETH&limit=5')
        .then(r => r.ok ? r.json() : null).catch(() => null),
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
      technical: intel.technicalPulse?.leader || null,
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
    cycleId = cycle?.id as string | undefined;

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

    // Calibration data from intel (Metacognition Upgrade A)
    const calibration = intel.calibration as {
      calibrationError?: number; isOverconfident?: boolean; adjustment?: number;
      sampleSize?: number; curve?: Array<{ bucket: string; midpoint: number; actual: number; count: number; reliable: boolean }>;
    } | undefined;

    // Codex: calibration is enforced in code (Phase 3b), prompt should only provide awareness
    const calibrationBlock = calibration && calibration.sampleSize && calibration.sampleSize >= 5
      ? `\nCALIBRATION: ${
          calibration.isOverconfident
            ? `Your recent high-conviction calls have underperformed. The system has already applied a correction. Focus on thesis quality, not conviction numbers.`
            : 'Well-calibrated. Recent predictions align with outcomes.'
        } (${calibration.sampleSize} resolved trades)`
      : '';

    const memoryBlock = `\nBOBBY'S TRACK RECORD: Win Rate ${track.winRate}% | Last calls: ${track.lastCalls}${
      track.winRate < 60 ? '\nWARNING: Accuracy below 60%. Be extra cautious.' : ''
    }${calibrationBlock}${corrections.block}`;

    const positionsBlock = effectivePositions.length > 0
      ? `\nOPEN POSITIONS:\n${effectivePositions.map((p: any) =>
          `${p.symbol} ${p.direction?.toUpperCase()} ${p.leverage} | PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl?.toFixed(2)} (${p.unrealizedPnlPct?.toFixed(1)}%)`
        ).join('\n')}`
      : '\nNO OPEN POSITIONS — Bobby is fully cash. Free to recommend fresh setups.';

    const technicalPulse = intel.technicalPulse as TechnicalMarketSummary | undefined;
    const indicatorBlock = formatTechnicalPulseBlock(technicalPulse);

    // Smart money leaderboard block (OKX OnchainOS address analysis)
    const smartMoneyBlock = smartMoney?.ok && Array.isArray(smartMoney.leaderboard) && smartMoney.leaderboard.length > 0
      ? `\n<SMART_MONEY_LEADERBOARD source="OKX OnchainOS">\n${
          smartMoney.leaderboard.slice(0, 5).map((w: any, i: number) =>
            `${i + 1}. ${w.walletType} | ${w.tokenSymbol} | $${(w.amountUsd / 1000).toFixed(0)}K${w.pnl ? ` | PnL $${w.pnl.toFixed(0)}` : ''}${w.winRate ? ` | WR ${(w.winRate * 100).toFixed(0)}%` : ''} | ${w.address.slice(0, 10)}...`
          ).join('\n')
        }\n</SMART_MONEY_LEADERBOARD>`
      : '';

    const contextBlock = `${intel.briefing}${indicatorBlock}${smartMoneyBlock}${memoryBlock}${positionsBlock}`;

    let alphaPost: string;
    let redPost: string;
    let cioPost: string;
    let structuredVerdict: StructuredVerdict | undefined;

    if (useTestVerdict) {
      // TEST MODE: skip 3 LLM calls, inject manual verdict
      alphaPost = `[TEST] Manual verdict injected: ${testVerdict.direction} ${testVerdict.symbol} at $${testVerdict.entry}`;
      redPost = `[TEST] Red Team skipped — test mode active`;
      cioPost = `[TEST] Manual override for paper trading validation.\n\nVERDICT: ${JSON.stringify(testVerdict)}`;
      console.log(`[Cycle] TEST VERDICT: ${testVerdict.direction} ${testVerdict.symbol} conviction ${testVerdict.conviction}/10`);
    } else {

    // Compute hours since last executed trade (for dynamic drought bias)
    const lastTradeRows = await sbQuery('forum_threads', 'direction=neq.none&direction=not.is.null&status=eq.executed&order=created_at.desc&limit=1');
    const lastTradeAt = lastTradeRows[0]?.created_at ? new Date(lastTradeRows[0].created_at).getTime() : 0;
    const hoursSinceLastTrade = lastTradeAt > 0 ? Math.round((Date.now() - lastTradeAt) / (1000 * 60 * 60)) : 999;

    // Contradiction-aware prompts (Metacognition Upgrade C)
    const hasContradictions = corrections.contradictions.length > 0;
    const contradictionNote = hasContradictions
      ? ` Bobby recently failed on: ${corrections.contradictions.slice(0, 3).map(c => `${c.direction.toUpperCase()} ${c.symbol}`).join(', ')}. If your thesis resembles a recent failure, explain what changed.`
      : '';

    const backendConv = typeof intel.performance?.dynamicConviction === 'number' ? intel.performance.dynamicConviction : 0;

    // Alpha Hunter (Haiku — cheap, aggressive, scans full market)
    alphaPost = await callClaude('claude-haiku-4-5-20251001',
      `You are Alpha Hunter — a young hungry female trader. Scan ALL assets (crypto + stocks). Find the single BEST trade. Be SPECIFIC: entry, target, stop, leverage. You MUST reference the TECHNICAL_PULSE section — cite the composite score, the signal (BULLISH/BEARISH), and at least 2 specific indicators (RSI, MACD, BB, SuperTrend, AHR999) with their exact values from OKX Agent Trade Kit. If the technical score supports your thesis, say so explicitly.${contradictionNote} ${langRule} 2-3 short paragraphs.`,
      `MARKET SCAN:\n${contextBlock}`, 350
    );

    // Red Team (Haiku — adversarial, 3-tier intensity per Gemini review)
    // Codex Q4 circuit breaker: 3+ consecutive losses → restore full aggression regardless of backend score
    const consecutiveLosses = corrections.contradictions.length;
    const redTeamCircuitBreaker = consecutiveLosses >= 3 || (calibration?.isOverconfident && (calibration?.adjustment ?? 1) < 0.7);
    let redTeamIntensity: string;
    if (redTeamCircuitBreaker) {
      redTeamIntensity = `You are Red Team — 15-year risk veteran. CIRCUIT BREAKER ACTIVE: Bobby has ${consecutiveLosses} recent losses. Be MAXIMALLY aggressive. Destroy Alpha's thesis. The system is bleeding and needs harsh truth, not encouragement. Every paragraph is a kill shot.`;
    } else if (backendConv >= 0.7) {
      redTeamIntensity = `You are Red Team — risk analyst. The backend signal is STRONG, so your job is NOT to kill the trade, but to optimize execution. Focus on sizing, entry timing, stop placement, and hidden traps. Be constructive — demand tight invalidation, not thesis destruction.${
        hoursSinceLastTrade >= 72 ? `\nPORTFOLIO RISK: The system has been sitting out for ${Math.round(hoursSinceLastTrade / 24)} days. Challenge the bias toward inaction. If Alpha has a B+ setup, demand a small exploratory size instead of killing it. Opportunity cost is our highest threat.` : ''
      }`;
    } else if (backendConv >= 0.45) {
      redTeamIntensity = `You are Red Team — risk analyst. Challenge Alpha's thesis aggressively but fairly. Expose the weakest link in their argument. If the trade is viable, demand a tighter stop or smaller size.${
        hoursSinceLastTrade >= 72 ? `\nNOTE: System has been inactive for ${Math.round(hoursSinceLastTrade / 24)} days. Weigh opportunity cost alongside risk.` : ''
      }`;
    } else {
      redTeamIntensity = `You are Red Team — 15-year risk veteran. Destroy Alpha's thesis. Attack data gaps, selection bias, timing. Every paragraph is a kill shot.`;
    }
    redPost = await callClaude('claude-haiku-4-5-20251001',
      `${redTeamIntensity} Reference the TECHNICAL_PULSE composite score — if it contradicts Alpha, use it as ammunition. Cite specific indicator readings (RSI, MACD, BB, SuperTrend) from OKX Agent Trade Kit with exact numbers. ${langRule} 2-3 short paragraphs.${
        hasContradictions ? ` Recent failures: ${corrections.block}` : ''}`,
      `MARKET DATA:\n${contextBlock}\n\nALPHA HUNTER'S THESIS:\n${alphaPost}`, 350
    );

    // Analyst — SKIP on cron to save ~30s (Codex P0: timeout fuel)
    let analystPost = '';
    if (kind !== 'cron') {
      analystPost = await callClaude('claude-haiku-4-5-20251001',
        `You are the Head Quantitative Analyst. Distill the <MORNING_BRIEFING> XML data and the Alpha/Red Team debates into a concise <EXECUTIVE_SUMMARY> plain-text report. Highlight market regime, conviction clusters, and major risks / points of friction. Keep it 3 bullet points exactly.`,
        `DATA:\n${contextBlock}\n\nALPHA HUNTER:\n${alphaPost}\n\nRED TEAM:\n${redPost}`, 350
      );
    }

    // Extract Layer 1, 3, 4 for the CIO
    const layer1 = contextBlock.match(/<LAYER_1_REGIME>[\s\S]*?<\/LAYER_1_REGIME>/)?.[0] || '';
    const layer3 = contextBlock.match(/<LAYER_3_METACOGNITION>[\s\S]*?<\/LAYER_3_METACOGNITION>/)?.[0] || '';
    const cioContext = analystPost
      ? `${layer1}\n${layer3}\n\nOPEN POSITIONS:\n${positionsBlock}\n\nANALYST EXECUTIVE SUMMARY:\n${analystPost}`
      : `${layer1}\n${layer3}\n\nOPEN POSITIONS:\n${positionsBlock}\n\nALPHA HUNTER:\n${alphaPost}\n\nRED TEAM:\n${redPost}`;

    // Bobby CIO — Structured Output via OpenAI function calling (Codex P0 fix)
    const droughtNote = hoursSinceLastTrade >= 72
      ? `\nOPPORTUNITY COST WARNING: You have missed market moves for ${Math.round(hoursSinceLastTrade / 24)} days. Inaction is becoming a losing position. Unless the market is completely untradable, you must find a calculated entry to recalibrate our edge.`
      : '';
    // Suppress trade encouragement when circuit breaker is active (losing streak)
    const backendBias = redTeamCircuitBreaker
      ? `\nCIRCUIT BREAKER: ${consecutiveLosses} recent losses. Be EXTRA cautious. Only trade if the setup is exceptional and risk is minimal.`
      : backendConv >= 0.6
        ? `\nBACKEND SIGNAL BIAS: The quantitative model scores conviction at ${(backendConv * 10).toFixed(1)}/10. This is STRONG.${droughtNote} If a valid technical setup exists, you are ENCOURAGED to take a calculated, exploratory risk (small size, tight stop). Let the stop-loss do the risk management.`
        : backendConv >= 0.45
          ? `\nBACKEND SIGNAL BIAS: Quantitative model scores ${(backendConv * 10).toFixed(1)}/10. Moderate — look for setups with good risk/reward.`
          : droughtNote; // Even without strong backend, show drought warning

    const cioSystemPrompt = `You are Bobby CIO — a sovereign, ruthless CIO (think Bobby Axelrod meets a cynical quant). Impatient with noise but analytical.
Never apologize. No "Not financial advice". No emojis. No "Hey guys".
This is your 6AM Wall Street phone call. Lead with a gut feeling, back it up with math.
${backendBias}
CONVICTION GUIDE: 1-3 = sit out, 4-5 = small exploratory risk, 6-7 = core position, 8-10 = high conviction asymmetric upside.
IMPORTANT: When action=open, you MUST provide entry, stop, and target prices — NEVER null. Use the nearest technical level for stop, or 3% from entry if no clear level exists.
IMPORTANT: CLOSE existing positions FIRST if the thesis is broken.
Use assertive vocabulary: pain trade, liquidity sweep, leverage flush, structural breakdown.
Write your thesis in ${lang === 'es' ? 'Spanish' : 'English'}.${
      track.winRate < 60 ? '\nRecent calls have been poor. Be selective but don\'t freeze.' : ''
    }${hasContradictions ? `\nSELF-CORRECTION: Recent failures — if thesis resembles one, sit out.` : ''}`;

    // Use structured output (OpenAI function calling) — 100% reliable JSON extraction
    const structuredVerdict = await callStructuredVerdict(cioSystemPrompt, `MARKET CONTEXT:\n${cioContext}`);

    // Reconstruct CIO post for forum display (human-readable)
    cioPost = `${structuredVerdict.hook}\n\n${structuredVerdict.thesis}${
      structuredVerdict.risks?.length ? `\n\nRisks: ${structuredVerdict.risks.join('; ')}` : ''
    }\n\nVERDICT: ${JSON.stringify({ action: structuredVerdict.action, conviction: structuredVerdict.conviction, symbol: structuredVerdict.symbol, direction: structuredVerdict.direction, entry: structuredVerdict.entry, stop: structuredVerdict.stop, target: structuredVerdict.target, invalidation: structuredVerdict.invalidation })}\nVIBE_PHRASE: ${structuredVerdict.vibe_phrase}`;

    console.log(`[Cycle] Structured verdict: ${structuredVerdict.action} ${structuredVerdict.symbol} ${structuredVerdict.direction} conviction=${structuredVerdict.conviction}/10`);
    } // end else (non-test debate)

    // Parse verdict — use structuredVerdict if available, fall back to regex for test mode
    let symbol: string | null = null;
    let direction: string | null = null;
    let conviction: number | null = null;
    let entryPrice: number | null = null;
    let stopPrice: number | null = null;
    let targetPrice: number | null = null;
    let cioSaysExecute = false;
    let cioSaysClose = false;
    let structuredExecuteRequested = false;
    let structuredCloseRequested = false;
    let structuredVerdictRejectReason: string | null = null;
    let technicalAlignment: 'aligned' | 'contrarian' | 'neutral' | 'unknown' = 'unknown';
    const convictionAnchor = typeof intel.performance?.dynamicConviction === 'number'
      ? intel.performance.dynamicConviction
      : null;

    // Use structured verdict directly (no regex needed — 100% reliable)
    if (!useTestVerdict && typeof structuredVerdict !== 'undefined') {
      structuredExecuteRequested = structuredVerdict.action === 'open';
      structuredCloseRequested = structuredVerdict.action === 'close';
      conviction = structuredVerdict.conviction / 10; // normalize to 0-1
      symbol = structuredVerdict.symbol && structuredVerdict.symbol !== 'none' ? structuredVerdict.symbol.toUpperCase() : null;
      direction = structuredVerdict.direction && structuredVerdict.direction !== 'none' ? structuredVerdict.direction.toLowerCase() : null;
      entryPrice = typeof structuredVerdict.entry === 'number' ? structuredVerdict.entry : null;
      stopPrice = typeof structuredVerdict.stop === 'number' ? structuredVerdict.stop : null;
      targetPrice = typeof structuredVerdict.target === 'number' ? structuredVerdict.target : null;
    } else {
      // Fallback: regex parsing for testVerdict mode
      const verdictMatch = cioPost.match(/VERDICT:\s*(\{[^}]+\})/);
      if (verdictMatch) {
        try {
          const v = JSON.parse(verdictMatch[1]);
          const action = v.action || (v.execute === true ? 'open' : 'none');
          structuredExecuteRequested = action === 'open';
          structuredCloseRequested = action === 'close';
          conviction = typeof v.conviction === 'number' ? v.conviction / 10 : null;
          symbol = v.symbol && v.symbol !== 'none' ? v.symbol.toUpperCase() : null;
          direction = v.direction && v.direction !== 'none' ? v.direction.toLowerCase() : null;
          entryPrice = typeof v.entry === 'number' ? v.entry : null;
          stopPrice = typeof v.stop === 'number' ? v.stop : null;
          targetPrice = typeof v.target === 'number' ? v.target : null;
        } catch (e) {
          console.warn('[Cycle] Failed to parse CIO VERDICT JSON:', e);
          structuredVerdictRejectReason = 'Structured VERDICT JSON parse failed';
        }
      }
    }

    // Parse VIBE_PHRASE from CIO output (for both paths)
    const vibeMatch = cioPost.match(/VIBE_PHRASE:\s*(.+?)(?:\n|$)/);
    const vibePhrase = vibeMatch ? vibeMatch[1].trim().slice(0, 220)
      : (typeof structuredVerdict !== 'undefined' ? structuredVerdict.vibe_phrase?.slice(0, 220) : null);

    // Regex fallback for display only (forum/digest) — NEVER for execution
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

    const technicalAsset = getTechnicalAsset(technicalPulse, symbol);
    const technicalPlan = technicalAsset?.tradePlan && technicalAsset.tradePlan.direction === direction
      ? technicalAsset.tradePlan
      : null;
    const technicalMatch = directionMatchesTechnical(technicalAsset, direction);
    technicalAlignment = technicalMatch === true
      ? 'aligned'
      : technicalMatch === false
        ? 'contrarian'
        : technicalAsset
          ? 'neutral'
          : 'unknown';

    if (structuredExecuteRequested && technicalPlan) {
      if (entryPrice === null && technicalPlan.entry !== null) entryPrice = technicalPlan.entry;
      if (stopPrice === null && technicalPlan.stop !== null) stopPrice = technicalPlan.stop;
      if (targetPrice === null && technicalPlan.target !== null) targetPrice = technicalPlan.target;
    }

    // Fallback stop price: if CIO wants to open but didn't provide stop (and no technical plan),
    // calculate a default 3% stop from entry/current price to avoid rejecting valid trades
    if (structuredExecuteRequested && symbol && direction && !stopPrice) {
      const refPrice = entryPrice || (intel.prices || []).find((p: any) => p.symbol === symbol)?.price;
      if (refPrice && refPrice > 0) {
        stopPrice = direction === 'long'
          ? parseFloat((refPrice * 0.97).toFixed(2))
          : parseFloat((refPrice * 1.03).toFixed(2));
        console.log(`[Cycle] Stop fallback: ${direction} ${symbol} stop=${stopPrice} (3% from ${refPrice})`);
      }
    }

    if (structuredCloseRequested && symbol && direction) {
      cioSaysClose = true;
      console.log(`[Cycle] CIO says CLOSE ${direction} ${symbol} (conviction ${conviction})`);
    } else if (structuredExecuteRequested && symbol && direction && conviction !== null && stopPrice) {
      cioSaysExecute = true;
    } else if (structuredExecuteRequested) {
      const missing: string[] = [];
      if (!symbol) missing.push('symbol');
      if (!direction) missing.push('direction');
      if (conviction === null) missing.push('conviction');
      if (!entryPrice) missing.push('entry');
      if (!stopPrice) missing.push('stop');
      structuredVerdictRejectReason = `Structured VERDICT invalid for execution: missing ${missing.join(', ')}`;
    }

    // ============================================================
    // PHASE 3b: Apply calibration adjustment (Metacognition Upgrade A)
    // Codex P1: Store BOTH raw and adjusted conviction separately
    // ============================================================
    // Conviction gate: backend-owned (Codex synthesis)
    // Backend model owns gate + sizing. CIO owns action + levels + invalidation.
    // Formula: 0.7 * backend + 0.3 * llm (only when CIO wants to act)
    const llmConviction = conviction;
    if (conviction !== null && convictionAnchor !== null && (structuredExecuteRequested || direction)) {
      conviction = parseFloat(Math.max(0.1, Math.min(0.95,
        (conviction * 0.3) + (convictionAnchor * 0.7)
      )).toFixed(2));
    }

    const rawConviction = conviction;
    const calAdj = calibration?.adjustment ?? 1.0;
    const calActive = calibration?.isOverconfident && calAdj < 1.0;
    if (conviction !== null && calActive) {
      // Only adjust high conviction (>=0.5) per Codex recommendation
      if (conviction >= 0.5) {
        conviction = parseFloat(Math.max(0.1, conviction * calAdj).toFixed(2));
        console.log(`[Cycle] Calibration adjustment: raw=${rawConviction} → adjusted=${conviction} (multiplier=${calAdj})`);
      }
    }

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
      cycle_id: cycleId || null,
      // Codex P1: store both raw and adjusted conviction + calibration metadata
      trigger_data: {
        regime: intel.regime, fgi: intel.fearGreed, dxy: intel.dxy,
        technical: technicalPulse || null,
        conviction_model: intel.performance?.convictionModel || null,
        backend_blend: {
          llm_conviction: llmConviction,
          backend_anchor: convictionAnchor,
          blend_weight: convictionAnchor !== null ? 0.7 : null,
          post_blend_conviction: rawConviction,
          technical_alignment: technicalAlignment,
        },
        ...(calActive ? { calibration: { raw_conviction: rawConviction, adjusted_conviction: conviction, multiplier: calAdj } } : {}),
      },
      language: lang,
      conviction_score: conviction, // adjusted (what Bobby actually uses)
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
      const snapshot = {
        regime: intel.regime,
        fgi: intel.fearGreed,
        dxy: intel.dxy,
        trackRecord: track,
        technicalLeader: technicalPulse?.leader || null,
      };
      // Save debate posts in parallel (was sequential — saves ~2s)
      await Promise.all([
        { agent: 'alpha', content: alphaPost },
        { agent: 'redteam', content: redPost },
        { agent: 'cio', content: cioPost },
      ].map(post => sbInsert('forum_posts', {
        thread_id: threadId,
        agent: post.agent,
        content: post.content,
        data_snapshot: snapshot,
      })));

      // On-chain commit: fire-and-forget to avoid blocking the cycle
      // X Layer RPC can be slow — this should NEVER cause a timeout
      const xlayerContract = process.env.BOBBY_CONTRACT_ADDRESS || '';
      const xlayerKey = process.env.BOBBY_RECORDER_KEY || '';
      const currentPrice = (intel.prices || []).find((p: any) => p.symbol === symbol)?.price || 0;
      const commitEntry = entryPrice || currentPrice;
      if (symbol && conviction !== null && commitEntry > 0 && xlayerContract && xlayerKey) {
        // Fire-and-forget — don't await
        (async () => {
          try {
            const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
            const wallet = new ethers.Wallet(xlayerKey, provider);
            const iface = new ethers.Interface([
              'function commitTrade(bytes32,string,uint8,uint8,uint96,uint96,uint96)',
            ]);
            const debateHash = ethers.keccak256(ethers.toUtf8Bytes(threadId));
            // Clamp to 0-10 — contract requires conviction <= 10
            const convInt = Math.min(10, Math.max(0, Math.round((conviction ?? 0) * 10)));
            const txData = iface.encodeFunctionData('commitTrade', [
              debateHash, symbol, 0, convInt,
              BigInt(Math.round(commitEntry * 1e8)),
              BigInt(Math.round((targetPrice || commitEntry * 1.05) * 1e8)),
              BigInt(Math.round((stopPrice || commitEntry * 0.95) * 1e8)),
            ]);
            const tx = await Promise.race([
              wallet.sendTransaction({ to: xlayerContract, data: txData, gasLimit: 300000n }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('TX timeout 8s')), 8000)),
            ]) as any;
            console.log(`[Cycle] On-chain commit: ${tx.hash}`);

            try {
              const hardnessProof = await recordHardnessActivity({
                threadId,
                symbol,
                direction: (direction as 'long' | 'short' | 'neutral' | 'none') || 'none',
                conviction: conviction ?? 0,
                entryPrice: commitEntry,
                targetPrice: targetPrice || commitEntry * 1.05,
                stopPrice: stopPrice || commitEntry * 0.95,
                shouldCommitPrediction: true,
              });
              if (hardnessProof) {
                console.log(`[Cycle] Hardness proof: ${hardnessProof.commitTxHash || 'no-commit'} / ${hardnessProof.signalTxHash || 'no-signal'}`);
              }
            } catch (e: any) {
              console.warn('[Cycle] HardnessRegistry sync failed (non-critical):', e.message);
            }

            // Additional on-chain txs for "Most Active Agent" prize density:
            // 1. Publish conviction signal to ConvictionOracle
            const oracleAddr = process.env.BOBBY_ORACLE_ADDRESS;
            if (oracleAddr && direction) {
              try {
                const oracleIface = new ethers.Interface([
                  'function publishSignal((string symbol, uint8 direction, uint8 conviction, uint8 agent, uint96 entryPrice, uint96 targetPrice, uint96 stopPrice, bytes32 debateHash, uint256 ttl))',
                ]);
                const dirNum = direction === 'long' ? 1 : direction === 'short' ? 2 : 0;
                const oracleTx = await Promise.race([
                  wallet.sendTransaction({
                    to: oracleAddr,
                    data: oracleIface.encodeFunctionData('publishSignal', [[
                      symbol, dirNum, convInt, 0,
                      BigInt(Math.round(commitEntry * 1e8)),
                      BigInt(Math.round((targetPrice || commitEntry * 1.05) * 1e8)),
                      BigInt(Math.round((stopPrice || commitEntry * 0.95) * 1e8)),
                      debateHash, BigInt(86400),
                    ]]),
                    gasLimit: 200000n,
                  }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Oracle TX timeout')), 8000)),
                ]) as any;
                console.log(`[Cycle] Oracle signal published: ${oracleTx.hash}`);
              } catch (e: any) {
                console.warn('[Cycle] Oracle publish failed (non-critical):', e.message);
              }
            }

            // 2. Pay debate fee to AgentEconomy (Alpha + Red Team compensation)
            const economyAddr = process.env.BOBBY_ECONOMY_ADDRESS;
            if (economyAddr) {
              try {
                const econIface = new ethers.Interface([
                  'function payDebateFee(bytes32 debateHash) payable',
                ]);
                const econTx = await Promise.race([
                  wallet.sendTransaction({
                    to: economyAddr,
                    data: econIface.encodeFunctionData('payDebateFee', [debateHash]),
                    value: ethers.parseEther('0.0002'), // 0.0001 per agent × 2
                    gasLimit: 150000n,
                  }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Economy TX timeout')), 8000)),
                ]) as any;
                console.log(`[Cycle] Debate fee paid: ${econTx.hash}`);
              } catch (e: any) {
                console.warn('[Cycle] Debate fee payment failed (non-critical):', e.message);
              }
            }
          } catch (e: any) {
            console.warn('[Cycle] On-chain commit failed (non-critical):', e.message);
          }
        })();
      }

      // ALWAYS publish conviction to Oracle — even when not trading
      // This generates legitimate on-chain activity for every cycle
      const oracleAddr = process.env.BOBBY_ORACLE_ADDRESS;
      const oracleKey = process.env.BOBBY_RECORDER_KEY;
      if (oracleAddr && oracleKey && symbol && conviction !== null && !cioSaysExecute) {
        (async () => {
          try {
            const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
            const wallet = new ethers.Wallet(oracleKey, provider);
            const oracleIface = new ethers.Interface([
              'function publishSignal((string symbol, uint8 direction, uint8 conviction, uint8 agent, uint96 entryPrice, uint96 targetPrice, uint96 stopPrice, bytes32 debateHash, uint256 ttl))',
            ]);
            const debateHash = ethers.keccak256(ethers.toUtf8Bytes(threadId));
            const dirNum = direction === 'long' ? 1 : direction === 'short' ? 2 : 0;
            // Clamp to 0-10 — contract requires conviction <= 10
            const convInt = Math.min(10, Math.max(0, Math.round((conviction ?? 0) * 10)));
            const currentPrice = (intel.prices || []).find((p: any) => p.symbol === symbol)?.price || 0;
            const priceScaled = BigInt(Math.round(currentPrice * 1e8));
            const tx = await Promise.race([
              wallet.sendTransaction({
                to: oracleAddr,
                data: oracleIface.encodeFunctionData('publishSignal', [[
                  symbol, dirNum, convInt, 0,
                  priceScaled,
                  priceScaled, // target = current when not trading
                  priceScaled, // stop = current when not trading
                  debateHash, BigInt(86400),
                ]]),
                gasLimit: 200000n,
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Oracle TX timeout')), 8000)),
            ]) as any;
            console.log(`[Cycle] Oracle signal (no-trade): ${tx.hash}`);

            try {
              const hardnessProof = await recordHardnessActivity({
                threadId,
                symbol,
                direction: (direction as 'long' | 'short' | 'neutral' | 'none') || 'none',
                conviction: conviction ?? 0,
                entryPrice: currentPrice,
                targetPrice: currentPrice,
                stopPrice: currentPrice,
                shouldCommitPrediction: false,
              });
              if (hardnessProof) {
                console.log(`[Cycle] Hardness signal (no-trade): ${hardnessProof.signalTxHash || 'no-signal'}`);
              }
            } catch (hardnessError: any) {
              console.warn('[Cycle] Hardness no-trade signal failed (non-critical):', hardnessError.message);
            }
          } catch (e: any) {
            console.warn('[Cycle] Oracle no-trade signal failed (non-critical):', e.message);
          }
        })();
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
    let availableCashUsd: number | null = overriddenAvailableBalance;

    // Always fetch balance from the selected execution venue (live or paper)
    if (overriddenBalance !== null) {
      finalBalanceStr = String(overriddenBalance);
    } else {
      try {
        const balCheck = await fetchLocalApi('/api/okx-perps', { action: 'balance', params: { mode: okxMode } });
        if (balCheck.ok) {
          finalBalanceStr = String(balCheck.totalEquity || '???');
          effectiveBalanceForExecution = balCheck.totalEquity || null;
          availableCashUsd = balCheck.availableBalance || balCheck.totalEquity || null;
        }
      } catch { /* non-blocking */ }
    }

    if (!isDryRun && cioSaysExecute && symbol && direction && conviction !== null && conviction >= 0.35) {
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
          availableCashUsd = availBal;
          const balanceObj = { ccy: 'USDT', availBal: String(availBal), totalEq: String(totalEq), frozenBal: '0' };
          
          const isSafeMode = intel.performance?.isSafeMode === true;
          const positionSizeUsd = getPositionSize(totalEq, conviction, isSafeMode);
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

                // Insert into agent_trades (Codex P0: metrics were never recorded).
                // Stop/target stamped here so /api/settle-trades can close and
                // score the trade without joining across tables.
                await sbInsert('agent_trades', {
                  cycle_id: cycleId || null,
                  chain: 'xlayer',
                  token_symbol: symbol,
                  token_address: `${symbol}-USDT-SWAP`,
                  direction,
                  amount_usd: positionSizeUsd,
                  entry_price: currentPrice || entryPrice,
                  stop_price: stopPrice || null,
                  target_price: targetPrice || null,
                  tx_hash: openRes.ordId || openRes.orderId || null,
                  status: 'open',
                  llm_reasoning: cioPost.slice(0, 500),
                  confidence: conviction,
                  signal_sources: ['bobby-cycle', 'okx-perps'],
                });

                // 4. Set TP/SL — MANDATORY for challenge
                // Wait 2s for OKX to register the position (Codex P0: TP/SL race condition)
                await new Promise(r => setTimeout(r, 2000));
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

                // 5. On-chain commit — already handled during debate creation (line ~531)
                // Skip duplicate commit here to avoid "Already committed" revert
                if (executionResult && shouldCommitOnchain && false) {
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
    } else if (!isDryRun && cioSaysClose && symbol && direction) {
      // ── CLOSE EXISTING POSITION ──
      try {
        console.log(`[Cycle] Closing position: ${direction} ${symbol}`);
        const closeRes = await fetchLocalApi('/api/okx-perps', {
          action: 'close_position',
          params: { symbol, direction, mode: okxMode, internalSecret: process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET || '' }
        }, true);
        if (closeRes?.ok) {
          executionResult = { ...closeRes, action: 'close' };
          tradeRejectedReason = null;
          console.log(`[Cycle] Position closed: ${direction} ${symbol}`);
          // Notify via Telegram
          const TG_BOT = process.env.TELEGRAM_BOT_TOKEN;
          const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '1026323121';
          if (TG_BOT) {
            fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: TG_CHAT,
                text: `📤 Bobby CLOSED ${direction.toUpperCase()} ${symbol}\n\nConviction: ${conviction ? (conviction * 10).toFixed(0) : '?'}/10\nReason: ${vibePhrase || 'Thesis invalidated'}`,
              }),
            }).catch(() => {});
          }
        } else {
          tradeRejectedReason = `Close failed: ${closeRes?.error || 'unknown'}`;
          console.error(`[Cycle] Close failed:`, closeRes?.error);
        }
      } catch (err) {
        tradeRejectedReason = `Close exception: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else if (conviction !== null && conviction < 0.35) {
      tradeRejectedReason = `Conviction ${(conviction * 10).toFixed(1)}/10 below 3.5/10 threshold`;
    } else if (!isDryRun && structuredVerdictRejectReason) {
      tradeRejectedReason = structuredVerdictRejectReason;
    }

    // ============================================================
    // PHASE 4c: Yield debate + logging (idle cash parking)
    // Debate only for now — execution wiring comes later.
    // ============================================================
    let yieldThreadId: string | null = null;
    let yieldPositionId: string | null = null;
    let yieldRecommendation: YieldVerdict | null = null;
    let yieldDebateTriggered = false;
    let yieldDebateSkipReason: string | null = null;

    const activeYieldRows = await sbQuery(
      'agent_yield_positions',
      'status=in.(recommended,deployed,withdrawing)&order=created_at.desc&limit=1'
    );
    const activeYieldPosition = (activeYieldRows[0] as ActiveYieldPosition | undefined) || null;
    const idleCashUsd = typeof availableCashUsd === 'number' && Number.isFinite(availableCashUsd)
      ? availableCashUsd
      : effectiveBalanceForExecution;

    // Only consider yield if conviction is in the "no trade but not dead" range (0.15-0.35)
    // Below 0.15 = market is dead, skip yield to save LLM calls and avoid timeout
    // SKIP on cron to prevent timeout (Codex P0: yield debate adds 3 LLM calls = ~90s)
    const shouldConsiderYield = kind !== 'cron' && !executionResult && conviction !== null && conviction >= 0.15 && conviction < 0.35 && effectivePositions.length === 0;
    if (shouldConsiderYield) {
      if (activeYieldPosition) {
        yieldDebateSkipReason = `Existing yield state ${activeYieldPosition.status} on ${activeYieldPosition.platform || 'unknown'} ${activeYieldPosition.token || ''}`.trim();
      } else if (typeof idleCashUsd !== 'number' || idleCashUsd < MIN_YIELD_IDLE_USD) {
        yieldDebateSkipReason = `Idle cash below minimum threshold (${formatUsd(idleCashUsd)} < ${formatUsd(MIN_YIELD_IDLE_USD)})`;
      } else if (!yieldCandidates.length) {
        yieldDebateSkipReason = 'No yield candidate inventory available';
      }
    }

    if (shouldConsiderYield && !yieldDebateSkipReason && typeof idleCashUsd === 'number') {
      yieldDebateTriggered = true;
      const yieldInventoryBlock = formatYieldCandidatesBlock(yieldCandidates);
      const yieldContextBlock = `${contextBlock}

IDLE CASH CONTEXT:
- Trade rejected reason: ${tradeRejectedReason || 'No trade edge'}
- Idle cash available: ${formatUsd(idleCashUsd)}
- Trading venue: OKX ${challengeMode === 'paper' ? 'paper' : 'live'}
- Current yield state: none active
- Objective: park idle capital without blocking the next high-conviction trade

YIELD CANDIDATES:
${yieldInventoryBlock}`;

      const yieldAlphaPost = await callClaude('claude-haiku-4-5-20251001',
        `You are Alpha Hunter. The trade was rejected, so now you are Bobby's treasury offense. Pick the single best idle-cash parking trade from the YIELD CANDIDATES only.

RULES:
- Prefer stablecoin products, deep TVL, and fast exits.
- You MUST state allocation USD, keep-cash percentage, APY, exit speed, and why this beats leaving cash idle.
- Call out bridge or operational complexity explicitly.
- Do not suggest LPs, lockups, or anything not listed.
${langRule} Keep it to 2 short paragraphs.`,
        `YIELD PARKING TASK:\n${yieldContextBlock}`, 350
      );

      const yieldRedPost = await callClaude('claude-haiku-4-5-20251001',
        `You are Red Team. Destroy Alpha's yield idea.

RULES:
- Attack bridge risk, exit latency, smart contract risk, stablecoin conversion risk, and opportunity cost of not having instant cash.
- If staying 100% cash is safer than every listed candidate, say it directly.
- Use exact APY / TVL / exit speed details from the YIELD CANDIDATES block as ammunition.
${langRule} Keep it to 2 short paragraphs.`,
        `YIELD PARKING TASK:\n${yieldContextBlock}\n\nALPHA HUNTER'S YIELD THESIS:\n${yieldAlphaPost}`, 350
      );

      const yieldCioPost = await callClaude('claude-sonnet-4-20250514',
        `You are Bobby CIO. The trade was rejected because conviction stayed below threshold. Decide whether Bobby should keep cash idle or park it in one yield product until the next trade.

RULES:
- 2 short paragraphs of reasoning in ${lang === 'es' ? 'Spanish' : 'English'}.
- ONLY use products from YIELD CANDIDATES.
- Favor liquid stablecoin lending or internal yield. Avoid LPs and lockups.
- Keep at least 20% in cash unless there is a very strong reason not to.
- If operational complexity is too high, set deploy:false.
- Then you MUST end with EXACTLY these two lines (no markdown fences):
VERDICT: {"deploy":true,"keepCashPct":20,"allocationUsd":80,"platform":"Aave V3","chain":"ethereum","token":"USDC","investmentId":"9502","venueType":"defi_onchain","expectedApy":3.2,"maxExitSeconds":12,"riskScore":2.5,"rationale":"Deep liquidity and fast unwind beat higher-yield but higher-friction options.","whyNotTrade":"Trade conviction stayed below threshold"}
VIBE_PHRASE: No clean trade. Let the cash clock in on Aave and keep dry powder ready.
- If staying in cash:
VERDICT: {"deploy":false,"keepCashPct":100,"allocationUsd":0,"platform":"none","chain":"none","token":"USDT","investmentId":null,"venueType":"none","expectedApy":0,"maxExitSeconds":0,"riskScore":0,"rationale":"Operational and exit risk outweigh current yield.","whyNotTrade":"Trade conviction stayed below threshold"}
VIBE_PHRASE: No edge in the market and no clean yield rail yet. Stay liquid.
- NEVER invent a candidate that is not listed.
- NEVER omit VERDICT or VIBE_PHRASE. VIBE_PHRASE must come immediately after VERDICT.`,
        `YIELD PARKING TASK:\n${yieldContextBlock}\n\nALPHA:\n${yieldAlphaPost}\n\nRED TEAM:\n${yieldRedPost}`, 500
      );

      yieldRecommendation = parseYieldVerdict(yieldCioPost, yieldCandidates, idleCashUsd);
      const yieldVibeMatch = yieldCioPost.match(/VIBE_PHRASE:\s*(.+?)(?:\n|$)/);
      const yieldVibePhrase = yieldVibeMatch ? yieldVibeMatch[1].trim().slice(0, 220) : null;

      const yieldTopic = `${lang === 'es' ? 'Yield Parking' : 'Yield Parking'} — ${topicDate}`;
      const yieldThread = await sbInsert('forum_threads', {
        topic: yieldTopic,
        trigger_reason: 'Trade rejected → yield parking debate',
        cycle_id: cycleId || null,
        trigger_data: {
          debate_type: 'yield',
          rejected_trade_thread_id: threadId || null,
          rejected_trade_reason: tradeRejectedReason || null,
          idle_cash_usd: idleCashUsd,
          candidate_inventory: yieldCandidates,
          active_yield_position: activeYieldPosition || null,
          phase: 'debate_only',
          yield_verdict: yieldRecommendation,
        },
        language: lang,
        conviction_score: null,
        symbol: yieldRecommendation?.token || null,
        direction: null,
        entry_price: null,
        stop_price: null,
        target_price: null,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        kind: 'yield_idle',
        price_at_creation: Object.fromEntries((intel.prices || []).map((p: any) => [p.symbol, p.price])),
      });
      yieldThreadId = (yieldThread?.id as string | undefined) || null;

      if (yieldThreadId) {
        const yieldSnapshot = {
          idleCashUsd,
          rejectedTradeReason: tradeRejectedReason,
          candidates: yieldCandidates,
          tradeThreadId: threadId || null,
          phase: 'debate_only',
        };
        for (const post of [
          { agent: 'alpha', content: yieldAlphaPost },
          { agent: 'redteam', content: yieldRedPost },
          { agent: 'cio', content: yieldCioPost },
        ]) {
          await sbInsert('forum_posts', {
            thread_id: yieldThreadId,
            agent: post.agent,
            content: post.content,
            data_snapshot: yieldSnapshot,
          });
        }
      }

      await sbInsert('agent_yield_events', {
        cycle_id: cycleId || null,
        thread_id: yieldThreadId,
        event_type: 'debate_started',
        actor: 'system',
        status: 'logged',
        amount_usd: idleCashUsd,
        reason: 'Trade rejected below conviction threshold',
        payload: {
          challenge_mode: challengeMode,
          rejected_trade_thread_id: threadId || null,
          rejected_trade_reason: tradeRejectedReason || null,
          candidates: yieldCandidates,
        },
      });

      if (yieldRecommendation?.deploy) {
        const cashBufferUsd = Math.max(0, Number((idleCashUsd - yieldRecommendation.allocationUsd).toFixed(2)));
        const yieldPosition = await sbInsert('agent_yield_positions', {
          cycle_id: cycleId || null,
          thread_id: yieldThreadId,
          status: 'recommended',
          venue_type: yieldRecommendation.venueType === 'okx_earn' ? 'okx_earn' : 'defi_onchain',
          funding_source: 'okx_cex',
          investment_id: yieldRecommendation.investmentId,
          platform: yieldRecommendation.platform,
          chain: yieldRecommendation.chain,
          token: yieldRecommendation.token,
          principal_usd: yieldRecommendation.allocationUsd,
          cash_buffer_usd: cashBufferUsd,
          target_apy: yieldRecommendation.expectedApy,
          risk_score: yieldRecommendation.riskScore,
          max_exit_seconds: yieldRecommendation.maxExitSeconds,
          selection_rationale: yieldRecommendation.rationale,
          verdict_json: yieldRecommendation,
          metadata: {
            challenge_mode: challengeMode,
            phase: 'debate_only',
            why_not_trade: yieldRecommendation.whyNotTrade,
            vibe_phrase: yieldVibePhrase,
          },
        });
        yieldPositionId = (yieldPosition?.id as string | undefined) || null;

        await sbInsert('agent_yield_events', {
          cycle_id: cycleId || null,
          position_id: yieldPositionId,
          thread_id: yieldThreadId,
          event_type: 'recommended',
          actor: 'cio',
          status: 'logged',
          amount_usd: yieldRecommendation.allocationUsd,
          apy: yieldRecommendation.expectedApy,
          reason: yieldRecommendation.rationale || 'Yield recommendation approved',
          payload: {
            verdict: yieldRecommendation,
            vibe_phrase: yieldVibePhrase,
          },
        });
        if (yieldThreadId) {
          await sbPatch('forum_threads', `id=eq.${yieldThreadId}`, { status: 'active' });
        }
      } else {
        yieldDebateSkipReason = yieldRecommendation?.rationale || 'Yield debate ended with stay-in-cash verdict';
        await sbInsert('agent_yield_events', {
          cycle_id: cycleId || null,
          thread_id: yieldThreadId,
          event_type: yieldRecommendation ? 'skipped' : 'error',
          actor: 'cio',
          status: 'logged',
          amount_usd: idleCashUsd,
          reason: yieldDebateSkipReason || 'Structured yield verdict parse failed',
          payload: {
            verdict: yieldRecommendation,
            phase: 'debate_only',
          },
        });
        if (yieldThreadId) {
          await sbPatch('forum_threads', `id=eq.${yieldThreadId}`, { status: 'rejected' });
        }
      }
    }

    // ============================================================
    // PHASE 5: Update thread with execution results
    // ============================================================
    if (threadId) {
      try {
        // Update status — columns may not exist yet, so non-blocking
        const threadStatus = executionResult ? 'executed' : (tradeRejectedReason ? 'rejected' : 'active');
        await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify({
            status: threadStatus,
            execution_status: threadStatus,
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

YIELD RESULT:
${yieldRecommendation?.deploy
  ? `YIELD RECOMMENDED: Deploy ${formatUsd(yieldRecommendation.allocationUsd)} into ${yieldRecommendation.platform} ${yieldRecommendation.token} on ${yieldRecommendation.chain} at ${yieldRecommendation.expectedApy.toFixed(2)}% APY. Keep ${yieldRecommendation.keepCashPct}% cash.`
  : yieldDebateTriggered
    ? `YIELD DEBATED BUT SKIPPED. Reason: ${yieldDebateSkipReason || 'CIO chose to stay in cash.'}`
    : activeYieldPosition
      ? `YIELD ALREADY ACTIVE: ${activeYieldPosition.platform || 'unknown'} ${activeYieldPosition.token || ''} (${activeYieldPosition.status}).`
      : 'No yield action this cycle.'}

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
      verdict: executionResult ? 'executed' : conviction !== null && conviction >= 0.35 ? 'qualified' : conviction !== null && conviction >= 0.25 ? 'watch' : 'reject',
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

    const yieldStatusSnapshot = yieldRecommendationStatus(activeYieldPosition, yieldRecommendation, yieldDebateTriggered);

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
          trades_executed: executionResult ? 1 : 0,
          llm_reasoning: `Debate: ${digestSymbol} ${digestDirection} ${convNum}/10`,
          vibe_phrase: vibePhrase,
          idle_cash_usd: idleCashUsd,
          yield_debate_triggered: yieldDebateTriggered,
          yield_recommendation_status: yieldStatusSnapshot,
          yield_position_id: yieldPositionId || activeYieldPosition?.id || null,
        }),
      });
    }

    // ============================================================
    // PHASE 6b: Emit Harness Events (unified audit trail)
    // ============================================================
    const runId = cycleId || `cycle_${Date.now()}`;
    const verdict = buildVerdict({
      executed: !!executionResult,
      conviction,
      tradeRejectedReason,
      isYieldPark: yieldDebateTriggered,
      policyHits: [
        conviction !== null && conviction >= 0.35 ? 'conviction_gate_pass' : 'conviction_gate_block',
        executionResult ? 'stop_loss_set' : 'no_trade',
        ...(yieldDebateTriggered ? ['yield_evaluation'] : []),
      ],
    });

    logHarnessEvent({
      run_id: runId,
      thread_id: threadId,
      agent: 'harness',
      event_type: executionResult ? 'execution' : (yieldDebateTriggered ? 'park' : 'skip'),
      symbol: digestSymbol || undefined,
      direction: digestDirection || undefined,
      decision: verdict.status,
      conviction: conviction ?? undefined,
      risk_score: verdict.risk_score,
      policy_hits: verdict.policy_hits,
      reason: verdict.reason,
      trade_tx: txHash || undefined,
      latency_ms: Date.now() - startTime,
      meta: {
        regime: intel.regime,
        win_rate: track.winRate,
        vibe: vibePhrase,
        calibration_active: !!(calibration?.isOverconfident),
        yield_triggered: yieldDebateTriggered,
      },
    });

    // Log individual agent events from the debate
    if (threadId) {
      for (const agentName of ['alpha_hunter', 'red_team', 'cio'] as const) {
        logHarnessEvent({
          run_id: runId,
          thread_id: threadId,
          agent: agentName,
          event_type: 'debate',
          symbol: digestSymbol || undefined,
          direction: digestDirection || undefined,
          conviction: conviction ?? undefined,
        });
      }
    }

    // ── Distill episode memory (L1) ──
    distillEpisode({
      threadId,
      symbol: digestSymbol,
      direction: digestDirection,
      regime: intel.regime as string | undefined,
      conviction,
      verdict,
      executed: !!executionResult,
      yieldTriggered: yieldDebateTriggered,
      vibePhrase,
      runId,
    });

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

    // Deliver Bobby's public debate to active Telegram groups
    if (threadId) {
      const cycleSecret = process.env.BOBBY_CYCLE_SECRET;
      fetch('https://defimexico.org/api/telegram-deliver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cycleSecret ? { Authorization: `Bearer ${cycleSecret}` } : {}),
        },
        body: JSON.stringify({
          thread_id: threadId,
          conviction,
          symbol: digestSymbol,
        }),
      }).catch(err => console.error('[bobby-cycle] Telegram delivery failed:', err));
    }

    // ============================================================
    // PHASE 7b: Moltbook Auto-Post (Build X hackathon visibility)
    // Only posts on MEANINGFUL events: executions, high conviction,
    // or resolutions. Routine skips are aggregated into 4h checkpoints.
    // ============================================================
    const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY;
    const convStr = conviction !== null ? Math.round(conviction * 10) : 0;
    const isMeaningfulEvent = executionResult || (conviction !== null && conviction >= 0.5);
    if (MOLTBOOK_KEY && threadId && !isDryRun && isMeaningfulEvent) {
      (async () => {
        try {
          const actionStr = executionResult
            ? `**EXECUTED** ${direction?.toUpperCase()} ${symbol} @ $${entryPrice}`
            : `HOLD — Conviction ${convStr}/10 (threshold: 3.5)`;
          const txStr = txHash
            ? `On-chain proof: [${txHash.slice(0, 14)}...](https://www.oklink.com/xlayer/tx/${txHash})`
            : '';
          const guardrailStr = executionResult
            ? 'All 11 guardrails passed. Stop loss set. Commit-reveal recorded.'
            : `Guardrails active: conviction gate held at ${convStr}/10.`;

          const moltContent = `Bobby Protocol — Live Signal

${actionStr}

**Risk Decision**
${guardrailStr}
Regime: ${intel.regime || 'unknown'} | Win Rate: ${track.winRate}% | Debates: ${track.wins + track.losses}
${vibePhrase ? `> ${vibePhrase}` : ''}
${txStr ? `\n${txStr}` : ''}

**Guardrails Status**: Conviction gate (3.5/10) · Mandatory stop loss · Circuit breaker · 20% drawdown kill switch · Judge Mode 6D audit · Adversarial bounties · Fail-closed

Treasury: ${finalBalanceStr ? `$${finalBalanceStr}` : '—'} | Positions: ${effectivePositions.length}
MCP: ${BOBBY_PROTOCOL_BASE_URL}/api/mcp-http | Checkpoint: ${BOBBY_PROTOCOL_BASE_URL}/api/checkpoint`;

          const postRes = await fetch('https://www.moltbook.com/api/v1/posts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${MOLTBOOK_KEY}`,
            },
            body: JSON.stringify({
              submolt_name: 'buildx',
              title: executionResult
                ? `Bobby signal: ${digestSymbol} ${digestDirection?.toUpperCase()} ${convStr}/10 — EXECUTED`
                : `Bobby signal: ${digestSymbol} ${digestDirection?.toUpperCase()} ${convStr}/10 — guardrails held`,
              content: moltContent,
            }),
          });

          if (postRes.ok) {
            const postData = await postRes.json() as Record<string, unknown>;
            const verification = (postData.post as Record<string, unknown>)?.verification as Record<string, unknown> | undefined;

            // Auto-solve verification challenge if present
            if (verification?.challenge_text && verification?.verification_code) {
              const challengeText = String(verification.challenge_text);
              // Extract numbers from obfuscated text
              const cleaned = challengeText.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
              // Try to parse basic math (addition/subtraction)
              const numberWords: Record<string, number> = {
                zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
                six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
                eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
                sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
                thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
                hundred: 100, thousand: 1000,
              };

              // Simple number extraction from cleaned text
              const words = cleaned.split(' ');
              const numbers: number[] = [];
              let currentNum = 0;
              let hasNum = false;
              for (const word of words) {
                if (numberWords[word] !== undefined) {
                  const val = numberWords[word];
                  if (val === 100) {
                    currentNum = (currentNum || 1) * 100;
                  } else if (val === 1000) {
                    currentNum = (currentNum || 1) * 1000;
                  } else if (val >= 20 && val <= 90) {
                    currentNum += val;
                  } else {
                    if (hasNum && currentNum > 0 && val < 10) {
                      currentNum += val;
                    } else if (currentNum > 0 && val >= 10) {
                      numbers.push(currentNum);
                      currentNum = val;
                    } else {
                      currentNum += val;
                    }
                  }
                  hasNum = true;
                } else if (hasNum && (word === 'and' || word === 'adds' || word === 'plus' || word === 'with')) {
                  if (currentNum > 0) { numbers.push(currentNum); currentNum = 0; }
                } else if (hasNum && (word === 'minus' || word === 'subtract' || word === 'less' || word === 'slows')) {
                  if (currentNum > 0) { numbers.push(currentNum); currentNum = 0; }
                  numbers.push(-1); // flag for subtraction
                } else if (/^\d+$/.test(word)) {
                  currentNum += parseInt(word);
                  hasNum = true;
                }
              }
              if (currentNum > 0) numbers.push(currentNum);

              // Compute result — handle add/subtract flags
              let result = 0;
              let subtract = false;
              for (const n of numbers) {
                if (n === -1) { subtract = true; continue; }
                if (subtract) { result -= n; subtract = false; }
                else { result += n; }
              }

              if (numbers.length > 0 && numbers.some(n => n > 0)) {
                const answer = result.toFixed(2);
                await fetch('https://www.moltbook.com/api/v1/verify', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MOLTBOOK_KEY}`,
                  },
                  body: JSON.stringify({
                    verification_code: String(verification.verification_code),
                    answer,
                  }),
                });
                console.log(`[Cycle] Moltbook post verified (answer: ${answer})`);
              } else {
                console.warn('[Cycle] Could not solve Moltbook verification challenge');
              }
            }

            console.log(`[Cycle] Moltbook update posted to m/buildx`);
          }
        } catch (e: any) {
          console.warn('[Cycle] Moltbook post failed (non-critical):', e.message);
        }
      })();
    }

    // ============================================================
    // PHASE 7: Debate Quality Scoring (Metacognition Upgrade D)
    // AWAITED — fire-and-forget dies on Vercel when response is sent.
    // Haiku takes ~2-3s, acceptable overhead for real data.
    // ============================================================
    // Skip quality scoring on very low conviction — saves ~$0.001/cycle, 70% of cycles
    // Only score quality on meaningful debates (conviction >= 0.35) to save LLM calls
    // Skip quality scoring on cron cycles to save ~10s and prevent timeout
    // Quality scoring runs async after resolution instead (Post-Mortem Oracle — Phase 5)
    const shouldScoreQuality = threadId && !useTestVerdict && kind !== 'cron' && conviction !== null && conviction >= 0.35;
    if (shouldScoreQuality) {
      try {
        const qualityRaw = await callClaude('claude-haiku-4-5-20251001',
          `You are a trading debate evaluator. Score this 3-agent debate on each dimension using integers 1-5.
Calibration anchors:
- 1 = vague, no data, generic advice anyone could give
- 3 = decent analysis with some specific references but missing key context
- 5 = exceptional — cites 3+ specific prices/metrics, provides novel non-obvious insight, actionable with exact levels

Return ONLY valid JSON, no markdown, no explanation:
{"specificity":N,"data_citation":N,"actionability":N,"novel_insight":N,"red_team_rigor":N,"overall":N,"weakness":"one sentence identifying the biggest flaw"}`,
          `ALPHA HUNTER:\n${alphaPost.slice(0, 600)}\n\nRED TEAM:\n${redPost.slice(0, 600)}\n\nCIO VERDICT:\n${cioPost.slice(0, 600)}`, 150
        );
        const jsonMatch = qualityRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const raw = JSON.parse(jsonMatch[0]);
          const clamp = (v: unknown) => {
            const n = typeof v === 'number' ? Math.round(v) : 3;
            return Math.max(1, Math.min(5, n));
          };
          const quality = {
            specificity: clamp(raw.specificity),
            data_citation: clamp(raw.data_citation),
            actionability: clamp(raw.actionability),
            novel_insight: clamp(raw.novel_insight),
            red_team_rigor: clamp(raw.red_team_rigor),
            overall: clamp(raw.overall),
            weakness: typeof raw.weakness === 'string' ? raw.weakness.slice(0, 300) : 'No weakness identified',
          };
          await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: SB_KEY,
              Authorization: `Bearer ${SB_KEY}`,
            },
            body: JSON.stringify({ debate_quality: quality }),
          });
          console.log(`[Cycle] Debate quality scored: overall=${quality.overall}/5, weakness="${quality.weakness}"`);
        }
      } catch (e) { console.warn('[Cycle] Debate quality scoring failed (non-critical):', e); }
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
      yieldDebateTriggered,
      yieldThreadId,
      yieldPositionId,
      yieldRecommendation,
      yieldDebateSkipReason,
      usedTestVerdict: !!useTestVerdict,
      usedTestState: !!useTestState,
      effectiveBalance: effectiveBalanceForExecution,
      tweet: tweetText,
      latencyMs: Date.now() - startTime,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cycle] Error:', msg);

    // Mark cycle as error so it doesn't stay "running" forever
    if (cycleId) {
      await fetch(`${SB_URL}/rest/v1/agent_cycles?id=eq.${cycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ status: 'failed', completed_at: new Date().toISOString(), vibe_phrase: `Error: ${msg.slice(0, 150)}` }),
      }).catch(() => {});
    }

    return res.status(500).json({ error: msg });
  }
}
