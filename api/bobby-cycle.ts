// ============================================================
// POST /api/bobby-cycle — Autonomous market cycle
// The MAIN artifact is the market analysis, NOT the trade.
// Flow: Intel → Snapshot → Debate → Forum → Digest
// Works for ALL users — with or without positions
// Triggered by: cron (every 8h), droplet worker, or manual
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { txUrl } from './_lib/chains.js';
import type { TechnicalAssetSignal, TechnicalMarketSummary } from '../src/lib/bobby-technical.js';
import { BOBBY_PROTOCOL_BASE_URL } from './_lib/protocol-constants.js';
import { getBobbyControl } from './_lib/control.js';
import { externalEffectsAllowed, noteSuppressedEffect } from './_lib/effects.js';
import { evaluateCommitPolicy, assessCommitReceipt, digestKind } from './_lib/commit-policy.js';
import { recordAuthHeaders } from './_lib/record-auth.js';
import { logHarnessEvent, buildVerdict, distillEpisode } from './_lib/harness-events.js';
import { callLlm } from './_lib/llm.js';
import { internalAuthHeaders, requireInternalAuth, requireOpsAuth } from './_lib/request-security.js';
import { bobbyDbUrl, bobbyServiceKeyOptional } from './_lib/bobby-db.js';

export const config = { maxDuration: 300 };

const SB_URL = bobbyDbUrl();
// Writers never fall back to the anon key (Codex review): with RLS on, an
// anon write fails silently. Missing service role → explicit 503 below.
const SB_KEY = bobbyServiceKeyOptional();
const READONLY_FALLBACK_HOSTS = [BOBBY_PROTOCOL_BASE_URL];

function extractBoundedSection(source: string, openTag: string, closeTag: string, maxLength = 50_000): string {
  const start = source.indexOf(openTag);
  if (start === -1) return '';
  const end = source.indexOf(closeTag, start + openTag.length);
  if (end === -1) return '';
  return source.slice(start, Math.min(end + closeTag.length, start + maxLength));
}

function extractPrefixedLine(source: string, prefix: string, maxLength = 220): string | null {
  const start = source.indexOf(prefix);
  if (start === -1) return null;
  const valueStart = start + prefix.length;
  const lineEnd = source.indexOf('\n', valueStart);
  const valueEnd = Math.min(lineEnd === -1 ? source.length : lineEnd, valueStart + maxLength);
  return source.slice(valueStart, valueEnd).trim() || null;
}

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

// Thin adapter over _lib/llm.ts (retry/backoff/abort live there).
async function callClaude(model: string, system: string, userMsg: string, maxTokens: number, timeoutMs = 25000): Promise<string> {
  const openaiModel = OPENAI_FALLBACK[model] || 'gpt-4o-mini';
  const result = await callLlm({
    endpoint: 'bobby-cycle',
    system,
    user: userMsg,
    model: openaiModel,
    maxTokens,
    timeoutMs,
  });
  return result.text;
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
  const result = await callLlm({
    endpoint: 'bobby-cycle',
    system,
    user: userMsg,
    model: 'gpt-4o',
    maxTokens: 500,
    timeoutMs,
    tool: {
      name: 'submit_verdict',
      description: 'Submit your trading verdict. This is MANDATORY — you must call this function.',
      parameters: VERDICT_SCHEMA,
    },
  });

  if (!result.toolInput) {
    throw new Error('No tool call in structured verdict response');
  }
  const verdict = result.toolInput as unknown as StructuredVerdict;

  // Validate critical fields
  if (!['open', 'close', 'none'].includes(verdict.action)) verdict.action = 'none';
  if (typeof verdict.conviction !== 'number' || verdict.conviction < 1 || verdict.conviction > 10) verdict.conviction = 3;
  if (verdict.action === 'open' && (!verdict.symbol || verdict.symbol === 'none')) verdict.action = 'none';
  if (verdict.action === 'open' && (!verdict.direction || verdict.direction === 'none')) verdict.action = 'none';

  return verdict;
}


// ---- Fetch local internal API ----
// noFallback=true for mutant actions (open_position, close_position) — NEVER retry those
async function fetchLocalApi(path: string, body: any, noFallback = false): Promise<any> {
  const authHeaders = path === '/api/protocol-record'
    ? recordAuthHeaders()
    : internalAuthHeaders();
  // Sepolia canary fix: on preview/dev deployments self-calls MUST stay on THIS
  // deployment — routing through the production domain would make the cycle
  // write on-chain through prod (X Layer, old recorder). VERCEL_URL is the
  // current deployment host; the bypass header clears SSO protection when
  // "Protection Bypass for Automation" is enabled on the project.
  const selfHost =
    process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : BOBBY_PROTOCOL_BASE_URL;
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
  try {
    const res = await fetch(`${selfHost}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
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
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
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

type YieldVenueType = 'defi_onchain' | 'none';

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
  const venueType: YieldVenueType = 'defi_onchain'; // okx_earn retired 2026-09-03: on-chain venues only
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
  const serializedVerdict = extractPrefixedLine(cioPost, 'VERDICT:', 4_000);
  if (!serializedVerdict) return null;

  try {
    const raw = JSON.parse(serializedVerdict);
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
  return `\n<TECHNICAL_PULSE source="market data (public)">\nREGIME: ${technicalPulse.regime}\n${leaderLine}\n${assetLines}\n</TECHNICAL_PULSE>`;
}

function directionMatchesTechnical(
  asset: TechnicalAssetSignal | null,
  direction: string | null,
): boolean | null {
  if (!asset || !direction || asset.direction === 'none') return null;
  return asset.direction === direction;
}

// ---- Track record from resolved forum threads ----

async function getTrackRecord(): Promise<{ wins: number; losses: number; winRate: number; lastCalls: string }> {
  // Codex r2 #1: this record is published in public posts — protocol threads only.
  const data = await sbQuery('forum_threads',
    'scope=eq.public&resolution=neq.pending&resolution=not.is.null&select=resolution,symbol,conviction_score,resolution_pnl_pct&order=resolved_at.desc&limit=10'
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
  if (!SB_KEY) return res.status(503).json({ error: 'Service-role key not configured (BOBBY_SUPABASE_SERVICE_ROLE_KEY)' });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
  }

  // Every path can spend API quota and persist cycle output; live paths can
  // additionally execute trades and write on-chain, so auth is fail-closed.
  // Scheduled runs (GET, Vercel cron) authenticate with the internal/cron
  // secret; MANUAL runs (POST) need the independent ops secret on top.
  if (!requireInternalAuth(req, res)) return;
  if (req.method === 'POST' && !requireOpsAuth(req, res)) return;

  // Dynamic kill switches: a write freeze stops every cycle (not only live);
  // canary forces dryrun with zero external effects.
  const control = await getBobbyControl();
  if (control.writeFreeze) {
    return res.status(503).json({ error: 'Bobby writes are frozen', source: control.source, note: control.note });
  }
  const canary = control.canary || process.env.BOBBY_CYCLE_CANARY === '1';

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const language = body.language || 'es';
  const lang = language === 'es' ? 'es' : 'en';
  const kind = canary ? 'canary' : (req.method === 'GET' ? 'cron' : (body.kind || 'manual'));
  const requestedMode = body.mode || kind;
  const yieldCandidates = resolveYieldCandidates(body.yieldCandidates);
  const challengeMode: ChallengeMode = canary ? 'dryrun' : resolveChallengeMode(req.method, requestedMode);
  if (challengeMode === 'live' && process.env.PROTOCOL_CUTOVER_FREEZE === 'true') {
    return res.status(503).json({
      error: 'Live Bobby cycles are frozen during the protocol cutover',
    });
  }
  const isDryRun = challengeMode === 'dryrun';
  const effects = { mode: challengeMode, canary };
  const effectsAllowed = externalEffectsAllowed(effects);
  if (!effectsAllowed) noteSuppressedEffect('all-external', effects, `kind=${kind}`);
  const shouldPublishTwitter = challengeMode === 'live' && effectsAllowed;
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
      Promise.resolve([] as any[]), // OKX positions: retired 2026-09-03 (no account reads)
      getTrackRecord(),
      getRecentContradictions(),
      Promise.resolve(null), // OKX OnchainOS smart-money leaderboard: retired 2026-09-03
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

    // Smart-money leaderboard (OKX OnchainOS) retired 2026-09-03: no block.
    const smartMoneyBlock = '';
    void smartMoney;

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
      `You are Alpha Hunter — a young hungry female trader. Scan ALL assets (crypto + stocks). Find the single BEST trade. Be SPECIFIC: entry, target, stop, leverage. You MUST reference the TECHNICAL_PULSE section — cite the composite score, the signal (BULLISH/BEARISH), and at least 2 specific indicators (RSI, MACD, BB, SuperTrend, AHR999) with their exact values from the TECHNICAL_PULSE block. If the technical score supports your thesis, say so explicitly.${contradictionNote} ${langRule} 2-3 short paragraphs.`,
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
      `${redTeamIntensity} Reference the TECHNICAL_PULSE composite score — if it contradicts Alpha, use it as ammunition. Cite specific indicator readings (RSI, MACD, BB, SuperTrend) from the TECHNICAL_PULSE block with exact numbers. ${langRule} 2-3 short paragraphs.${
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
    const layer1 = extractBoundedSection(contextBlock, '<LAYER_1_REGIME>', '</LAYER_1_REGIME>');
    const layer3 = extractBoundedSection(contextBlock, '<LAYER_3_METACOGNITION>', '</LAYER_3_METACOGNITION>');
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

    // Parse verdict from structured output or the authenticated structured test value.
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
    } else if (useTestVerdict && testVerdict) {
      // The test verdict is already a structured, authenticated request value;
      // never round-trip it through free-form text and regex parsing.
      structuredExecuteRequested = testVerdict.execute === true;
      conviction = typeof testVerdict.conviction === 'number' ? testVerdict.conviction / 10 : null;
      symbol = testVerdict.symbol && testVerdict.symbol !== 'none' ? testVerdict.symbol.toUpperCase() : null;
      direction = testVerdict.direction && testVerdict.direction !== 'none' ? testVerdict.direction.toLowerCase() : null;
      entryPrice = typeof testVerdict.entry === 'number' ? testVerdict.entry : null;
      stopPrice = typeof testVerdict.stop === 'number' ? testVerdict.stop : null;
      targetPrice = typeof testVerdict.target === 'number' ? testVerdict.target : null;
    }

    // Parse VIBE_PHRASE from CIO output (for both paths)
    const vibePhrase = extractPrefixedLine(cioPost, 'VIBE_PHRASE:')
      || (typeof structuredVerdict !== 'undefined' ? structuredVerdict.vibe_phrase?.slice(0, 220) : null);

    // Regex fallback for display only (forum/digest) — NEVER for execution
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
    }

    // ============================================================
    // PHASE 3c: Unified on-chain commit (TrackRecordV2 via recorder API)
    // ============================================================
    // Single chain-neutral path: /api/protocol-record selects the active
    // chain, applies the protocol write latches, and runs the V2
    // announce -> Pyth anchor -> commitTrade sequence. Awaited on purpose:
    // an orphaned promise can die when the serverless function returns,
    // and a live trade must never exist without its on-chain proof.
    //
    // Three states, fail-closed. Runs OUTSIDE the threadId guard: a failed
    // thread insert on a live actionable thesis must resolve to 'blocked'
    // (policy: invalid), never silently skip the commit.
    //   not_required — neutral/paper/dryrun/low conviction: execution
    //                  follows its own gates.
    //   confirmed    — real receipt (ok && onchain && txHash): may execute.
    //   blocked      — policy rejected it, the recorder failed, or the
    //                  response has no real receipt: OKX must not run.
    //
    // HardnessRegistry sync is intentionally NOT here (decision 2026-08-26):
    // the old helper opened its own wallet and managed nonces separately,
    // which can collide with the recorder's commit -> economy -> oracle
    // sequence. Reintroduce it later behind a single wallet/nonce
    // coordinator inside the recorder — never from this cycle.
    let onchainCommitTx: string | null = null;
    let onchainCommitError: string | null = null;
    let commitState: 'not_required' | 'confirmed' | 'blocked';
    const frozenMarketPrice = (intel.prices || []).find((p: any) => p.symbol === symbol)?.price ?? null;
    const commitRequirement = evaluateCommitPolicy({
      challengeMode,
      cioSaysExecute,
      direction,
      conviction,
      threadId,
      marketPrice: frozenMarketPrice,
      stopPrice,
      targetPrice,
    });
    if (commitRequirement.state === 'not_required') {
      commitState = 'not_required';
      console.log(`[Cycle] No on-chain commit needed: ${commitRequirement.reason}`);
    } else if (commitRequirement.state === 'invalid') {
      commitState = 'blocked';
      onchainCommitError = commitRequirement.reason;
      console.error('[Cycle] Commit required but thesis is uncommittable — live execution will be blocked:', onchainCommitError);
    } else {
      try {
        const commitRes = await fetchLocalApi('/api/protocol-record', {
          action: 'commit',
          threadId,
          symbol,
          agent: 'cio',
          direction,
          conviction: Math.min(10, Math.max(0, Math.round((conviction ?? 0) * 10))),
          entryPrice: commitRequirement.entryPrice,
          stopPrice: commitRequirement.stopPrice,
          ...(commitRequirement.targetPrice !== null ? { targetPrice: commitRequirement.targetPrice } : {}),
        }, true);
        const receipt = assessCommitReceipt(commitRes);
        if (receipt.confirmed === true) {
          commitState = 'confirmed';
          onchainCommitTx = receipt.txHash;
          console.log(`[Cycle] On-chain commit confirmed: ${onchainCommitTx}`);
        } else {
          commitState = 'blocked';
          onchainCommitError = receipt.reason;
          console.error('[Cycle] On-chain commit not confirmed — live execution will be blocked:', onchainCommitError);
        }
      } catch (e: any) {
        commitState = 'blocked';
        onchainCommitError = e?.message || 'commit exception';
        console.error('[Cycle] On-chain commit exception — live execution will be blocked:', onchainCommitError);
      }
    }

    // ============================================================
    // PHASE 4b: Execution — RETIRED (2026-09-03, Base-only decision)
    // Bobby no longer opens, closes or sizes positions on OKX, paper or
    // live, and reads no OKX account. A thesis is committed on-chain and
    // published; any swap happens on Base through Uniswap, built by
    // /api/base-swap and signed by the human. The variables below stay so
    // the rest of the cycle (yield debate, forum thread, summaries) keeps
    // its shape with execution = none.
    // ============================================================
    let executionResult: any = null;
    let tpslResult: any = null;
    let tradeRejectedReason: string | null = null;
    let txHash: string | null = onchainCommitTx;
    let finalBalanceStr: string | null = overriddenBalance !== null ? String(overriddenBalance) : null;
    let effectiveBalanceForExecution: number | null = overriddenBalance;
    let availableCashUsd: number | null = overriddenAvailableBalance;

    if (commitState === 'blocked') {
      tradeRejectedReason = `On-chain commit required but not confirmed: ${onchainCommitError}`;
      console.error(`[Cycle] ${tradeRejectedReason}`);
    } else if (!isDryRun && cioSaysExecute && symbol && direction && conviction !== null && conviction >= 0.35) {
      tradeRejectedReason = `Execution retired: Bobby publishes the thesis; ${symbol} ${direction} is not opened by the cycle (Base/Uniswap swaps are user-signed)`;
      console.log(`[Cycle] ${tradeRejectedReason}`);
    } else if (!isDryRun && cioSaysClose && symbol && direction) {
      tradeRejectedReason = `Execution retired: close ${direction} ${symbol} is a thesis update, not an order`;
      console.log(`[Cycle] ${tradeRejectedReason}`);
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
- Trading venue: none (cycle execution retired; swaps are user-signed on Base via Uniswap)
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
      const yieldVibePhrase = extractPrefixedLine(yieldCioPost, 'VIBE_PHRASE:');

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
          venue_type: 'defi_onchain',
          funding_source: 'wallet', // no exchange account behind Bobby since 2026-09-03
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
${executionResult ? 'TRADE EXECUTED' : `NO TRADE (cycle never executes; swaps are user-signed on Base). Reason: ${tradeRejectedReason}`}

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
      // 'cron' describes how the cycle fired; user_digests' check constraint
      // only knows the semantic types scheduled|morning|alert|manual.
      kind: digestKind(kind),
    });

    const yieldStatusSnapshot = yieldRecommendationStatus(activeYieldPosition, yieldRecommendation, yieldDebateTriggered);

    // ============================================================
    // PHASE 6: Update cycle as completed
    // ============================================================
    let cycleCloseOk = true;
    if (cycleId) {
      const latencyMs = Date.now() - startTime;
      // Critical PATCH: a silent 400 here left every cycle stuck in "running"
      // until the next cron swept it to "failed". sbPatch logs and reports.
      cycleCloseOk = await sbPatch('agent_cycles', `id=eq.${cycleId}`, {
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
      });
      if (!cycleCloseOk) {
        console.error(`[Cycle] CRITICAL: failed to mark cycle ${cycleId} as completed — it will show as failed after the next sweep`);
      }
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

#BobbyTrader #VibeTrading #Base`;

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
    if (threadId && !effectsAllowed) noteSuppressedEffect('delivery', effects, `thread ${threadId}`);
    if (threadId && effectsAllowed) {
      fetch(`${BOBBY_PROTOCOL_BASE_URL}/api/telegram-deliver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...internalAuthHeaders(),
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
            ? `On-chain proof: [${txHash.slice(0, 14)}...](${txUrl(txHash)})`
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
      executionVenue: 'none', // cycle execution retired 2026-09-03
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
      commitState,
      onchainCommitTx,
      onchainCommitError,
      cycleCloseOk,
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
      const marked = await sbPatch('agent_cycles', `id=eq.${cycleId}`, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        vibe_phrase: `Error: ${msg.slice(0, 150)}`,
      });
      if (!marked) console.error(`[Cycle] CRITICAL: failed to mark cycle ${cycleId} as failed`);
    }

    return res.status(500).json({ error: msg });
  }
}
