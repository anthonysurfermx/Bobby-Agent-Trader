// ============================================================
// GET /api/agent-run — Self-contained autonomous agent cycle
// Vercel cron every 8h or manual trigger
// All logic inlined (Vercel serverless can't import from src/)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 120 };

// ---- Types ----
interface RawSignal {
  source: string;
  chain: string;
  tokenSymbol: string;
  tokenAddress: string;
  signalType: string;
  amountUsd: number;
  triggerWalletCount?: number;
  soldRatioPct?: number;
  marketCapUsd?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

interface FilteredSignal extends RawSignal {
  filterScore: number;
  reasons: string[];
}

interface TradeDecision {
  action: 'BUY' | 'SKIP';
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  amountUsd: number;
  reason: string;
  confidence: number;
  signalSources: string[];
}

// ---- HMAC for OKX ----
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// ---- Token Registry (inline for Vercel serverless) ----
const TOKEN_REGISTRY: Record<string, Record<string, { address: string; decimals: number }>> = {
  '196': { // X Layer
    USDC: { address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22', decimals: 6 },
    WETH: { address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', decimals: 18 },
    WBTC: { address: '0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1', decimals: 8 },
    OKB:  { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  },
  '1': { // Ethereum
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    WETH: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
    WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  },
  '8453': { // Base
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    WETH: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  },
};

// ---- DEX Aggregator helpers (inline, reuse HMAC auth) ----
async function getSwapQuote(
  chainId: string, fromSymbol: string, toSymbol: string, amountUsd: number
): Promise<{ fromAmount: string; toAmount: string; fromToken: string; toToken: string } | null> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return null;

  const chainTokens = TOKEN_REGISTRY[chainId];
  if (!chainTokens || !chainTokens[fromSymbol] || !chainTokens[toSymbol]) return null;

  const from = chainTokens[fromSymbol];
  const to = chainTokens[toSymbol];
  const fromAmount = String(Math.round(amountUsd * (10 ** from.decimals)));

  const path = `/api/v5/dex/aggregator/quote?chainId=${chainId}&fromTokenAddress=${from.address}&toTokenAddress=${to.address}&amount=${fromAmount}`;
  const ts = new Date().toISOString();
  const sig = await hmacSign(ts + 'GET' + path, secretKey);

  try {
    const resp = await fetch(`https://www.okx.com${path}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sig,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });
    const data = await resp.json();
    if (data?.data?.[0]) {
      return {
        fromToken: fromSymbol,
        toToken: toSymbol,
        fromAmount,
        toAmount: data.data[0].toTokenAmount || '0',
      };
    }
  } catch (e) { console.error('[DEX] Quote error:', e); }
  return null;
}

async function getSwapCalldata(
  chainId: string, fromSymbol: string, toSymbol: string, amountUsd: number,
  userWallet: string, slippage = '0.5'
): Promise<{ to: string; data: string; value: string; gas: string } | null> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return null;

  const chainTokens = TOKEN_REGISTRY[chainId];
  if (!chainTokens || !chainTokens[fromSymbol] || !chainTokens[toSymbol]) return null;

  const from = chainTokens[fromSymbol];
  const to = chainTokens[toSymbol];
  const fromAmount = String(Math.round(amountUsd * (10 ** from.decimals)));

  const path = `/api/v5/dex/aggregator/swap?chainId=${chainId}&fromTokenAddress=${from.address}&toTokenAddress=${to.address}&amount=${fromAmount}&userWalletAddress=${userWallet}&slippage=${slippage}`;
  const ts = new Date().toISOString();
  const sig = await hmacSign(ts + 'GET' + path, secretKey);

  try {
    const resp = await fetch(`https://www.okx.com${path}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sig,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });
    const data = await resp.json();
    const tx = data?.data?.[0]?.tx;
    if (tx) {
      return { to: tx.to, data: tx.data, value: tx.value || '0', gas: tx.gas || '500000' };
    }
  } catch (e) { console.error('[DEX] Swap calldata error:', e); }
  return null;
}

async function getApproveCalldata(
  chainId: string, tokenSymbol: string, amount: string
): Promise<{ to: string; data: string } | null> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return null;

  const chainTokens = TOKEN_REGISTRY[chainId];
  if (!chainTokens || !chainTokens[tokenSymbol]) return null;

  const token = chainTokens[tokenSymbol];
  // Native tokens don't need approval
  if (token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') return null;

  const path = `/api/v5/dex/aggregator/approve-transaction?chainId=${chainId}&tokenContractAddress=${token.address}&approveAmount=${amount}`;
  const ts = new Date().toISOString();
  const sig = await hmacSign(ts + 'GET' + path, secretKey);

  try {
    const resp = await fetch(`https://www.okx.com${path}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sig,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });
    const data = await resp.json();
    if (data?.data?.[0]) {
      return { to: data.data[0].to, data: data.data[0].data };
    }
  } catch (e) { console.error('[DEX] Approve error:', e); }
  return null;
}

// ---- Collect OKX dex signals directly ----
async function collectDexSignals(): Promise<RawSignal[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  const chains = ['1', '501', '8453']; // ETH, SOL, Base
  const signals: RawSignal[] = [];

  for (const chainIndex of chains) {
    try {
      const path = '/api/v6/dex/market/signal/list';
      const body = JSON.stringify({ chainIndex, walletType: '1,2,3', minAmountUsd: '5000' });
      const timestamp = new Date().toISOString();
      const signature = await hmacSign(timestamp + 'POST' + path + body, secretKey);

      const res = await fetch(`https://web3.okx.com${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase,
          'OK-ACCESS-PROJECT': projectId,
        },
        body,
      });

      if (!res.ok) continue;
      const json = await res.json() as { code: string; data: unknown };
      if (json.code !== '0' || !Array.isArray(json.data)) continue;

      for (const s of json.data as Array<Record<string, unknown>>) {
        const token = s.token as Record<string, unknown> | undefined;
        signals.push({
          source: 'okx_dex_signal',
          chain: chainIndex,
          tokenSymbol: String(token?.symbol || 'UNKNOWN'),
          tokenAddress: String(token?.tokenAddress || ''),
          signalType: String(s.walletType || ''),
          amountUsd: parseFloat(String(s.amountUsd || '0')),
          triggerWalletCount: parseInt(String(s.triggerWalletCount || '0')),
          soldRatioPct: parseFloat(String(s.soldRatioPercent || '0')),
          marketCapUsd: parseFloat(String(token?.marketCapUsd || '0')),
        });
      }
    } catch (err) {
      console.error(`[Agent] Chain ${chainIndex} signal error:`, err);
    }
  }

  return signals;
}

// ---- Filter signals ----
function filterSignals(signals: RawSignal[]): FilteredSignal[] {
  const filtered: FilteredSignal[] = [];

  for (const signal of signals) {
    const reasons: string[] = [];
    let score = 0;

    if (signal.source === 'okx_dex_signal') {
      if (signal.amountUsd < 5000) continue;

      const wallets = signal.triggerWalletCount || 0;
      if (wallets >= 3) { score += 30; reasons.push(`${wallets} wallets`); }
      else if (wallets >= 2) { score += 15; reasons.push(`${wallets} wallets`); }
      else score += 5;

      const sold = signal.soldRatioPct || 0;
      if (sold < 10) { score += 25; reasons.push(`Only ${sold}% sold`); }
      else if (sold < 30) { score += 15; }
      else if (sold > 70) continue;

      if (signal.amountUsd > 100000) { score += 20; reasons.push(`$${(signal.amountUsd / 1000).toFixed(0)}K`); }
      else if (signal.amountUsd > 25000) { score += 10; }

      if (signal.signalType === '1') { score += 10; reasons.push('Smart Money'); }
      else if (signal.signalType === '3') { score += 8; reasons.push('Whale'); }
      else if (signal.signalType === '2') { score += 5; reasons.push('KOL'); }

      if (signal.marketCapUsd && signal.marketCapUsd < 100000) continue;
    }

    if (score < 20) continue;

    filtered.push({ ...signal, filterScore: Math.min(100, score), reasons });
  }

  filtered.sort((a, b) => b.filterScore - a.filterScore);
  return filtered.slice(0, 10);
}

// ---- Claude call helper (shared by all agents) ----
async function callClaude(
  systemPrompt: string,
  userMsg: string,
  toolSchema?: { name: string; description: string; input_schema: Record<string, unknown> },
): Promise<{ text: string; toolInput: Record<string, unknown> | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: '', toolInput: null };

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMsg }],
  };

  if (toolSchema) {
    body.tools = [toolSchema];
    body.tool_choice = { type: 'tool', name: toolSchema.name };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    return { text: `Claude ${res.status}: ${t.slice(0, 100)}`, toolInput: null };
  }

  const result = await res.json() as { content: Array<{ type: string; text?: string; input?: Record<string, unknown> }> };
  const toolUse = result.content.find(b => b.type === 'tool_use');
  const textBlock = result.content.find(b => b.type === 'text');

  return {
    text: textBlock?.text || '',
    toolInput: toolUse?.input || null,
  };
}

// ---- Build signal context string (shared) ----
function buildSignalContext(signals: FilteredSignal[], polyConsensusData?: SmartMoneyConsensus[]): string {
  const polyContext = polyConsensusData && polyConsensusData.length > 0
    ? `\n\nPolymarket Smart Money Consensus (${polyConsensusData.length} markets with 2+ top traders):\n${polyConsensusData.slice(0, 5).map((m, i) =>
        `[P${i + 1}] "${m.title}" — ${m.traderCount} traders, ${m.topOutcomePct.toFixed(0)}% on ${m.topOutcome}, price ${Math.round(m.currentPrice * 100)}¢, entry ${Math.round(m.avgEntryPrice * 100)}¢, edge ${m.edgePct.toFixed(1)}%`
      ).join('\n')}`
    : '';

  return `Signals (${signals.length}):\n${signals.map((s, i) =>
    `[${i + 1}] ${s.tokenSymbol} (chain ${s.chain}) — $${s.amountUsd.toLocaleString()} — score ${s.filterScore} — ${s.reasons.join(', ')}`
  ).join('\n')}${polyContext}`;
}

// ---- Trade decision tool schema ----
const tradeToolSchema = {
  name: 'execute_decisions',
  description: 'Submit trading decisions',
  input_schema: {
    type: 'object' as const,
    properties: {
      reasoning: { type: 'string' },
      trades: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['BUY', 'SKIP'] },
            chain: { type: 'string' },
            token_address: { type: 'string' },
            token_symbol: { type: 'string' },
            amount_usd: { type: 'number' },
            reason: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['action', 'token_symbol', 'reason', 'confidence'],
        },
      },
    },
    required: ['reasoning', 'trades'],
  },
};

// ---- Multi-Agent Debate System ----
// Agent 1: Alpha Hunter — finds opportunities
// Agent 2: Red Team — finds reasons trades will FAIL
// Agent 3: Judge — makes final decision with both perspectives

interface DebateResult {
  decisions: TradeDecision[];
  reasoning: string;
  alphaView: string;
  redTeamView: string;
  judgeVerdict: string;
}

async function multiAgentDebate(
  signals: FilteredSignal[],
  polyConsensusData?: SmartMoneyConsensus[],
  selfOptimizedPrompt?: string,
): Promise<DebateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { decisions: [], reasoning: 'No API key', alphaView: '', redTeamView: '', judgeVerdict: '' };

  const signalCtx = buildSignalContext(signals, polyConsensusData);

  // ── AGENT 1: Alpha Hunter (parallel with Red Team) ──
  const alphaPrompt = selfOptimizedPrompt || `You are the Alpha Hunter agent. Your ONLY job is to find the best trading opportunities.
Analyze signals aggressively. Look for: high wallet convergence, low sold ratio, large volume, smart money patterns.
For Polymarket, find edges where smart money entry price diverges from current price.
Be BULLISH and find alpha. Max 3 trades. Call execute_decisions.`;

  const alphaPromise = callClaude(
    alphaPrompt,
    `${signalCtx}\n\nFind the best alpha opportunities and call execute_decisions.`,
    tradeToolSchema,
  );

  // ── AGENT 2: Red Team (parallel with Alpha) ──
  const redTeamPromise = callClaude(
    `You are the Red Team agent — the Devil's Advocate. Your ONLY job is to find reasons why trades will FAIL.
For each signal, analyze: honeypot risk, rug pull patterns, low liquidity traps, pump-and-dump cycles,
whale manipulation, front-running exposure, smart money exit signals (high sold ratio).
For Polymarket, check if consensus is just herd behavior vs informed positioning.
Be SKEPTICAL and adversarial. Output a risk assessment for each signal.`,
    `${signalCtx}\n\nFor each signal, explain WHY this trade could fail. Be specific and adversarial.`,
  );

  // Run Alpha + Red Team in parallel
  const [alphaResult, redTeamResult] = await Promise.all([alphaPromise, redTeamPromise]);

  const alphaView = alphaResult.toolInput
    ? (alphaResult.toolInput as { reasoning: string }).reasoning || ''
    : alphaResult.text;
  const redTeamView = redTeamResult.text;

  // ── AGENT 3: Judge — sees both perspectives ──
  const alphaTrades = alphaResult.toolInput
    ? (alphaResult.toolInput as { trades: Array<Record<string, unknown>> }).trades || []
    : [];

  const judgeResult = await callClaude(
    `You are the Judge agent. You receive two perspectives on crypto trades:
1. The Alpha Hunter found opportunities (bullish view)
2. The Red Team found risks (bearish view)

YOUR JOB: Make the FINAL decision. Only approve trades where Alpha's thesis survives Red Team scrutiny.
Adjust confidence DOWN if Red Team raised valid concerns. SKIP if risks outweigh opportunity.
Max 3 trades. Call execute_decisions with your final verdict.`,
    `ALPHA HUNTER THESIS:\n${alphaView}\n\nAlpha proposed trades:\n${JSON.stringify(alphaTrades, null, 1)}\n\nRED TEAM RISKS:\n${redTeamView}\n\nMake your final judgment. Call execute_decisions.`,
    tradeToolSchema,
  );

  const judgeVerdict = judgeResult.toolInput
    ? (judgeResult.toolInput as { reasoning: string }).reasoning || ''
    : judgeResult.text;

  // Parse judge decisions
  const judgeTrades = judgeResult.toolInput
    ? (judgeResult.toolInput as { trades: Array<Record<string, unknown>> }).trades || []
    : [];

  const decisions: TradeDecision[] = judgeTrades
    .filter(t => t.action === 'BUY' && Number(t.confidence) >= 0.7)
    .slice(0, 3)
    .map(t => ({
      action: 'BUY' as const,
      chain: String(t.chain || '1'),
      tokenAddress: String(t.token_address || ''),
      tokenSymbol: String(t.token_symbol),
      amountUsd: Number(t.amount_usd) || 25,
      reason: String(t.reason),
      confidence: Number(t.confidence),
      signalSources: ['okx_dex_signal'],
    }));

  console.log(`[Agent] Debate: Alpha proposed ${alphaTrades.length}, Judge approved ${decisions.length}`);

  return {
    decisions,
    reasoning: judgeVerdict,
    alphaView,
    redTeamView,
    judgeVerdict,
  };
}

// ---- Kelly Criterion Dynamic Position Sizing ----
// f* = (p(b+1) - 1) / b
// p = probability of success (confidence), b = win/loss ratio
function kellySize(confidence: number, bankroll: number, maxExposurePct = 0.33): number {
  // Estimate win/loss ratio from historical or use 2:1 default for crypto
  const b = 2.0;
  const p = Math.max(0.5, Math.min(0.95, confidence)); // clamp

  const kelly = (p * (b + 1) - 1) / b;
  if (kelly <= 0) return 0; // negative edge = don't bet

  // Half-Kelly for safety (standard practice)
  const halfKelly = kelly * 0.5;

  // Apply to bankroll with max exposure cap
  const size = Math.min(bankroll * halfKelly, bankroll * maxExposurePct);

  // Floor at $5, cap at $75
  return Math.max(5, Math.min(75, Math.round(size * 100) / 100));
}

// ---- Prompt Self-Optimization ----
// Analyzes last N cycles' outcomes and generates an improved system prompt
async function selfOptimizePrompt(recentCycles: Array<{ llm_reasoning: string; trades_executed: number; status: string }>): Promise<string | null> {
  if (recentCycles.length < 3) return null; // need at least 3 cycles

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const cyclesSummary = recentCycles.slice(0, 10).map((c, i) =>
    `Cycle ${i + 1}: ${c.status} | ${c.trades_executed} trades | Reasoning: "${(c.llm_reasoning || '').slice(0, 150)}"`
  ).join('\n');

  try {
    const result = await callClaude(
      `You are a meta-optimization agent. Analyze the trading agent's recent cycle outcomes and generate an IMPROVED system prompt.
Focus on: What patterns led to good/bad decisions? What biases appear? What should the agent prioritize differently?
Output ONLY the new system prompt text (1-3 paragraphs). Keep rules about max trades and confidence thresholds.`,
      `Recent cycle history:\n${cyclesSummary}\n\nGenerate an improved Alpha Hunter system prompt based on these patterns.`,
    );

    const newPrompt = result.text?.trim();
    if (newPrompt && newPrompt.length > 50 && newPrompt.length < 2000) {
      console.log('[Agent] Self-optimized prompt generated');
      return newPrompt;
    }
  } catch (err) {
    console.warn('[Agent] Prompt optimization failed:', err);
  }
  return null;
}

// ---- Fetch recent cycles for self-optimization ----
async function fetchRecentCycles(limit = 10): Promise<Array<{ llm_reasoning: string; trades_executed: number; status: string }>> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(
      `${url}/rest/v1/agent_cycles?select=llm_reasoning,trades_executed,status&order=started_at.desc&limit=${limit}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ---- Risk gate with Kelly Criterion ----
function applyRiskGate(decisions: TradeDecision[], bankroll = 500): { approved: TradeDecision[]; blocked: number; sizingMethod: string } {
  const approved: TradeDecision[] = [];
  let exposure = 0;
  const maxExposure = bankroll * 0.3; // 30% max portfolio exposure

  for (const d of decisions) {
    if (d.confidence < 0.7) continue;

    // Kelly Criterion dynamic sizing replaces static $50 cap
    const kellyAmount = kellySize(d.confidence, bankroll);
    d.amountUsd = kellyAmount;

    if (exposure + d.amountUsd > maxExposure) continue;
    approved.push(d);
    exposure += d.amountUsd;
  }

  return { approved, blocked: decisions.length - approved.length, sizingMethod: 'half-kelly' };
}

// ---- Polymarket Intelligence — Direct API calls ----

const POLY_DATA = 'https://data-api.polymarket.com';
const POLY_GAMMA = 'https://gamma-api.polymarket.com';

interface PolyLeaderboardEntry {
  proxyWallet: string;
  userName: string;
  rank: number;
  pnl: number;
  volume: number;
}

interface PolyPosition {
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  slug: string;
}

interface SmartMoneyConsensus {
  conditionId: string;
  title: string;
  slug: string;
  traderCount: number;
  totalCapital: number;
  topOutcome: string;
  topOutcomePct: number;
  avgEntryPrice: number;
  currentPrice: number;
  edgePct: number;
}

async function fetchPolyLeaderboard(limit = 20): Promise<PolyLeaderboardEntry[]> {
  try {
    const res = await fetch(`${POLY_DATA}/v1/leaderboard?limit=${limit}&timePeriod=MONTH&category=OVERALL`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((t: Record<string, unknown>) => ({
      proxyWallet: String(t.proxyWallet || ''),
      userName: String(t.userName || 'Unknown'),
      rank: Number(t.rank || 0),
      pnl: Number(t.pnl || 0),
      volume: Number(t.volume || 0),
    }));
  } catch { return []; }
}

async function fetchPolyPositions(wallet: string): Promise<PolyPosition[]> {
  try {
    const res = await fetch(`${POLY_DATA}/positions?user=${wallet}&limit=100&sortBy=CURRENT`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((p: Record<string, unknown>) => Number(p.currentValue || 0) > 0.5)
      .map((p: Record<string, unknown>) => ({
        conditionId: String(p.conditionId || ''),
        title: String(p.title || ''),
        outcome: String(p.outcome || ''),
        size: Number(p.size || 0),
        avgPrice: Number(p.avgPrice || 0),
        curPrice: Number(p.curPrice || 0),
        currentValue: Number(p.currentValue || 0),
        slug: String(p.slug || ''),
      }));
  } catch { return []; }
}

function aggregatePolyConsensus(
  traders: PolyLeaderboardEntry[],
  positionsByWallet: Map<string, PolyPosition[]>
): SmartMoneyConsensus[] {
  // Group all positions by conditionId
  const marketMap = new Map<string, {
    title: string;
    slug: string;
    traders: Set<string>;
    outcomeCapital: Map<string, number>;
    totalCapital: number;
    entryPrices: number[];
    currentPrices: number[];
  }>();

  for (const trader of traders) {
    const positions = positionsByWallet.get(trader.proxyWallet) || [];
    for (const pos of positions) {
      if (!pos.conditionId) continue;
      let market = marketMap.get(pos.conditionId);
      if (!market) {
        market = {
          title: pos.title,
          slug: pos.slug,
          traders: new Set(),
          outcomeCapital: new Map(),
          totalCapital: 0,
          entryPrices: [],
          currentPrices: [],
        };
        marketMap.set(pos.conditionId, market);
      }
      market.traders.add(trader.proxyWallet);
      market.outcomeCapital.set(
        pos.outcome,
        (market.outcomeCapital.get(pos.outcome) || 0) + pos.currentValue
      );
      market.totalCapital += pos.currentValue;
      market.entryPrices.push(pos.avgPrice);
      market.currentPrices.push(pos.curPrice);
    }
  }

  // Convert to consensus array, filter 2+ traders
  const results: SmartMoneyConsensus[] = [];
  for (const [conditionId, m] of marketMap) {
    if (m.traders.size < 2) continue;

    // Find top outcome
    let topOutcome = '';
    let topCapital = 0;
    for (const [outcome, capital] of m.outcomeCapital) {
      if (capital > topCapital) {
        topOutcome = outcome;
        topCapital = capital;
      }
    }

    const avgEntry = m.entryPrices.reduce((a, b) => a + b, 0) / m.entryPrices.length;
    const avgCurrent = m.currentPrices.reduce((a, b) => a + b, 0) / m.currentPrices.length;

    results.push({
      conditionId,
      title: m.title,
      slug: m.slug,
      traderCount: m.traders.size,
      totalCapital: m.totalCapital,
      topOutcome,
      topOutcomePct: m.totalCapital > 0 ? (topCapital / m.totalCapital) * 100 : 0,
      avgEntryPrice: avgEntry,
      currentPrice: avgCurrent,
      edgePct: avgCurrent > 0 ? ((avgCurrent - avgEntry) / avgEntry) * 100 : 0,
    });
  }

  results.sort((a, b) => b.traderCount - a.traderCount || b.totalCapital - a.totalCapital);
  return results.slice(0, 10);
}

async function collectPolymarketIntelligence(): Promise<SmartMoneyConsensus[]> {
  console.log('[Agent] Fetching Polymarket leaderboard...');
  const traders = await fetchPolyLeaderboard(15);
  if (traders.length === 0) return [];

  console.log(`[Agent] ${traders.length} top traders, fetching positions...`);
  const positionsByWallet = new Map<string, PolyPosition[]>();

  // Batch fetch: 5 at a time
  for (let i = 0; i < traders.length; i += 5) {
    const batch = traders.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(t => fetchPolyPositions(t.proxyWallet))
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        positionsByWallet.set(batch[idx].proxyWallet, r.value);
      }
    });
  }

  const consensus = aggregatePolyConsensus(traders, positionsByWallet);
  console.log(`[Agent] ${consensus.length} Polymarket consensus markets found`);
  return consensus;
}

// ---- Fetch advisor profiles for personalized greetings ----
interface AdvisorProfile {
  wallet_address: string;
  user_name: string;
  advisor_name: string;
  categories: string[];
  language: string;
  scan_interval_hours: number;
}

async function fetchAdvisorProfiles(): Promise<AdvisorProfile[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(`${url}/rest/v1/agent_profiles?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

interface GreetingContext {
  cycle: {
    signals_found: number;
    signals_filtered: number;
    trades_executed: number;
    trades_blocked: number;
    llm_reasoning: string;
    total_usd_deployed: number;
    latency_ms: number;
  };
  topFilteredSignals: FilteredSignal[];
  trades: Array<{ tokenSymbol: string; amountUsd: number; confidence: number; chain: string }>;
  polymarketData: SmartMoneyConsensus[];
  debate?: { alphaView: string; redTeamView: string; judgeVerdict: string };
  sizingMethod?: string;
}

function generateGreeting(profile: AdvisorProfile, ctx: GreetingContext, memoryFollowUp?: MemoryFollowUp | null): string {
  const hour = new Date().getUTCHours();
  const lang = profile.language || 'es';
  const hrs = profile.scan_interval_hours || 8;
  const { cycle, topFilteredSignals, trades, polymarketData } = ctx;

  // Time-aware greeting
  const greetingMap: Record<string, [string, string, string]> = {
    es: [`Buenos días ${profile.user_name}!`, `Buenas tardes ${profile.user_name}!`, `Buenas noches ${profile.user_name}!`],
    pt: [`Bom dia ${profile.user_name}!`, `Boa tarde ${profile.user_name}!`, `Boa noite ${profile.user_name}!`],
    en: [`Good morning ${profile.user_name}!`, `Good afternoon ${profile.user_name}!`, `Good evening ${profile.user_name}!`],
  };
  const greetings = greetingMap[lang] || greetingMap.en;
  const greeting = hour >= 5 && hour < 12 ? greetings[0] : hour >= 12 && hour < 18 ? greetings[1] : greetings[2];

  const chainName = (c: string) => c === '1' ? 'ETH' : c === '501' ? 'SOL' : c === '8453' ? 'Base' : c;

  const L: string[] = [
    `*${profile.advisor_name}*`,
    '',
    greeting,
    '',
  ];

  // ── MEMORY SECTION: Follow-up on last recommendation ──
  if (memoryFollowUp) {
    const { title, entryPrice, currentPrice, hoursAgo } = memoryFollowUp;
    const diff = currentPrice - entryPrice;
    const pctChange = entryPrice > 0 ? ((diff / entryPrice) * 100).toFixed(1) : '0.0';
    const sign = diff >= 0 ? '+' : '';
    const correct = diff >= 0;

    if (lang === 'es') {
      L.push(`--- Seguimiento ---`);
      L.push(`Hace ${hoursAgo}h te recomendé "${title}" a ${entryPrice}¢. Ahora está en ${currentPrice}¢ (${sign}${pctChange}%).`);
      L.push(correct
        ? 'Mi lectura fue correcta.'
        : 'Mi lectura necesita ajuste — el mercado se movió en contra.');
    } else if (lang === 'pt') {
      L.push(`--- Acompanhamento ---`);
      L.push(`Há ${hoursAgo}h recomendei "${title}" a ${entryPrice}¢. Agora está em ${currentPrice}¢ (${sign}${pctChange}%).`);
      L.push(correct
        ? 'Minha leitura estava correta.'
        : 'Minha leitura precisa de ajuste — o mercado se moveu contra.');
    } else {
      L.push(`--- Follow-up ---`);
      L.push(`${hoursAgo}h ago I recommended "${title}" at ${entryPrice}¢. Now at ${currentPrice}¢ (${sign}${pctChange}%).`);
      L.push(correct
        ? 'My read was correct.'
        : 'My read needs adjustment — the market moved against.');
    }
    L.push('');
  }

  // ── OKX SECTION: COLLECT → FILTER → THINK → EXECUTE ──

  if (lang === 'es') {
    // COLLECT
    L.push(`--- OKX OnchainOS ---`);
    L.push(`Escaneé ${cycle.signals_found} señales on-chain (ETH, SOL, Base).`);
    if (topFilteredSignals.length > 0) {
      L.push(`Top señales detectadas:`);
      for (const s of topFilteredSignals.slice(0, 3)) {
        L.push(`  • ${s.tokenSymbol} (${chainName(s.chain)}) — $${(s.amountUsd / 1000).toFixed(1)}K — ${s.reasons.join(', ')}`);
      }
    }

    // FILTER
    L.push('');
    L.push(`${cycle.signals_found} → ${cycle.signals_filtered} pasaron filtros de calidad.`);

    // THINK — Multi-Agent Debate
    if (ctx.debate) {
      L.push('');
      L.push(`--- Debate Multi-Agente ---`);
      L.push(`Alpha Hunter: _${ctx.debate.alphaView.slice(0, 120)}_`);
      L.push(`Red Team: _${ctx.debate.redTeamView.slice(0, 120)}_`);
      L.push(`Juez: _${ctx.debate.judgeVerdict.slice(0, 120)}_`);
    } else if (cycle.llm_reasoning) {
      L.push('');
      L.push(`Mi análisis: _${cycle.llm_reasoning}_`);
    }

    // EXECUTE
    if (trades.length > 0) {
      L.push('');
      const sizing = ctx.sizingMethod === 'half-kelly' ? ' (Half-Kelly)' : '';
      for (const t of trades) {
        L.push(`  BUY ${t.tokenSymbol} — $${t.amountUsd.toFixed(2)}${sizing} — confianza ${(t.confidence * 100).toFixed(0)}%`);
      }
      L.push(`Total desplegado: $${cycle.total_usd_deployed.toFixed(2)}`);
      if (cycle.trades_blocked > 0) {
        L.push(`${cycle.trades_blocked} operación(es) bloqueada(s) por risk gate.`);
      }
    } else {
      L.push('');
      L.push('Sin operaciones esta vez — seguiré monitoreando.');
    }

    // ── POLYMARKET SECTION ──
    if (polymarketData.length > 0) {
      L.push('');
      L.push(`--- Polymarket Smart Money ---`);
      L.push(`${polymarketData.length} mercados con consenso de 2+ top traders:`);
      for (const m of polymarketData.slice(0, 3)) {
        const price = Math.round(m.currentPrice * 100);
        const entry = Math.round(m.avgEntryPrice * 100);
        const dir = m.edgePct > 0 ? '+' : '';
        L.push(`  • "${m.title}"`);
        L.push(`    ${m.traderCount} traders → ${m.topOutcome} (${m.topOutcomePct.toFixed(0)}%) | ${price}¢ (entrada ${entry}¢, edge ${dir}${m.edgePct.toFixed(1)}%)`);
      }
      const best = polymarketData[0];
      L.push('');
      L.push(`Recomendación: "${best.title}" → ${best.topOutcome} a ${Math.round(best.currentPrice * 100)}¢.`);
      L.push(`Si en ${hrs}h se confirma, potencial ${(1 / best.currentPrice).toFixed(2)}x.`);
    }

    L.push('');
    L.push(`Latencia: ${(cycle.latency_ms / 1000).toFixed(1)}s | Categorías: ${profile.categories.join(', ')}`);
    L.push(`Nos vemos en ${hrs} horas.`);

  } else if (lang === 'pt') {
    L.push(`--- OKX OnchainOS ---`);
    L.push(`Escaneei ${cycle.signals_found} sinais on-chain (ETH, SOL, Base).`);
    if (topFilteredSignals.length > 0) {
      L.push(`Top sinais detectados:`);
      for (const s of topFilteredSignals.slice(0, 3)) {
        L.push(`  • ${s.tokenSymbol} (${chainName(s.chain)}) — $${(s.amountUsd / 1000).toFixed(1)}K — ${s.reasons.join(', ')}`);
      }
    }

    L.push('');
    L.push(`${cycle.signals_found} → ${cycle.signals_filtered} passaram filtros de qualidade.`);

    if (ctx.debate) {
      L.push('');
      L.push(`--- Debate Multi-Agente ---`);
      L.push(`Alpha Hunter: _${ctx.debate.alphaView.slice(0, 120)}_`);
      L.push(`Red Team: _${ctx.debate.redTeamView.slice(0, 120)}_`);
      L.push(`Juiz: _${ctx.debate.judgeVerdict.slice(0, 120)}_`);
    } else if (cycle.llm_reasoning) {
      L.push('');
      L.push(`Minha análise: _${cycle.llm_reasoning}_`);
    }

    if (trades.length > 0) {
      L.push('');
      const sizing = ctx.sizingMethod === 'half-kelly' ? ' (Half-Kelly)' : '';
      for (const t of trades) {
        L.push(`  BUY ${t.tokenSymbol} — $${t.amountUsd.toFixed(2)}${sizing} — confiança ${(t.confidence * 100).toFixed(0)}%`);
      }
      L.push(`Total: $${cycle.total_usd_deployed.toFixed(2)}`);
    } else {
      L.push('');
      L.push('Sem operações desta vez — continuarei monitorando.');
    }

    if (polymarketData.length > 0) {
      L.push('');
      L.push(`--- Polymarket Smart Money ---`);
      L.push(`${polymarketData.length} mercados com consenso de 2+ top traders:`);
      for (const m of polymarketData.slice(0, 3)) {
        const price = Math.round(m.currentPrice * 100);
        const entry = Math.round(m.avgEntryPrice * 100);
        const dir = m.edgePct > 0 ? '+' : '';
        L.push(`  • "${m.title}"`);
        L.push(`    ${m.traderCount} traders → ${m.topOutcome} (${m.topOutcomePct.toFixed(0)}%) | ${price}¢ (entrada ${entry}¢, edge ${dir}${m.edgePct.toFixed(1)}%)`);
      }
      const best = polymarketData[0];
      L.push('');
      L.push(`Recomendação: "${best.title}" → ${best.topOutcome} a ${Math.round(best.currentPrice * 100)}¢.`);
      L.push(`Se em ${hrs}h a tendência confirmar, potencial ${(1 / best.currentPrice).toFixed(2)}x.`);
    }

    L.push('');
    L.push(`Latência: ${(cycle.latency_ms / 1000).toFixed(1)}s | Categorias: ${profile.categories.join(', ')}`);
    L.push(`Nos vemos em ${hrs} horas.`);

  } else {
    L.push(`--- OKX OnchainOS ---`);
    L.push(`Scanned ${cycle.signals_found} on-chain signals (ETH, SOL, Base).`);
    if (topFilteredSignals.length > 0) {
      L.push(`Top signals detected:`);
      for (const s of topFilteredSignals.slice(0, 3)) {
        L.push(`  • ${s.tokenSymbol} (${chainName(s.chain)}) — $${(s.amountUsd / 1000).toFixed(1)}K — ${s.reasons.join(', ')}`);
      }
    }

    L.push('');
    L.push(`${cycle.signals_found} → ${cycle.signals_filtered} passed quality filters.`);

    if (ctx.debate) {
      L.push('');
      L.push(`--- Multi-Agent Debate ---`);
      L.push(`Alpha Hunter: _${ctx.debate.alphaView.slice(0, 120)}_`);
      L.push(`Red Team: _${ctx.debate.redTeamView.slice(0, 120)}_`);
      L.push(`Judge: _${ctx.debate.judgeVerdict.slice(0, 120)}_`);
    } else if (cycle.llm_reasoning) {
      L.push('');
      L.push(`My analysis: _${cycle.llm_reasoning}_`);
    }

    if (trades.length > 0) {
      L.push('');
      const sizing = ctx.sizingMethod === 'half-kelly' ? ' (Half-Kelly)' : '';
      for (const t of trades) {
        L.push(`  BUY ${t.tokenSymbol} — $${t.amountUsd.toFixed(2)}${sizing} — confidence ${(t.confidence * 100).toFixed(0)}%`);
      }
      L.push(`Total deployed: $${cycle.total_usd_deployed.toFixed(2)}`);
      if (cycle.trades_blocked > 0) {
        L.push(`${cycle.trades_blocked} trade(s) blocked by risk gate.`);
      }
    } else {
      L.push('');
      L.push('No trades this cycle — still watching.');
    }

    if (polymarketData.length > 0) {
      L.push('');
      L.push(`--- Polymarket Smart Money ---`);
      L.push(`${polymarketData.length} markets with 2+ top trader consensus:`);
      for (const m of polymarketData.slice(0, 3)) {
        const price = Math.round(m.currentPrice * 100);
        const entry = Math.round(m.avgEntryPrice * 100);
        const dir = m.edgePct > 0 ? '+' : '';
        L.push(`  • "${m.title}"`);
        L.push(`    ${m.traderCount} traders → ${m.topOutcome} (${m.topOutcomePct.toFixed(0)}%) | ${price}¢ (entry ${entry}¢, edge ${dir}${m.edgePct.toFixed(1)}%)`);
      }
      const best = polymarketData[0];
      L.push('');
      L.push(`Recommendation: "${best.title}" → ${best.topOutcome} at ${Math.round(best.currentPrice * 100)}¢.`);
      L.push(`If trend holds in ${hrs}h, potential ${(1 / best.currentPrice).toFixed(2)}x return.`);
    }

    L.push('');
    L.push(`Latency: ${(cycle.latency_ms / 1000).toFixed(1)}s | Categories: ${profile.categories.join(', ')}`);
    L.push(`See you in ${hrs} hours.`);
  }

  return L.join('\n');
}

// ---- Save greeting messages to Supabase ----
async function saveGreetings(greetings: Array<{ wallet_address: string; advisor_name: string; message: string }>) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || greetings.length === 0) return;

  try {
    await fetch(`${url}/rest/v1/agent_messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(greetings.map(g => ({
        wallet_address: g.wallet_address,
        advisor_name: g.advisor_name,
        message: g.message,
        created_at: new Date().toISOString(),
      }))),
    });
  } catch (err) {
    console.warn('[Agent] Greeting save failed:', err);
  }
}

// ---- Fetch last greeting for memory continuity ----
interface LastGreeting {
  message: string;
  created_at: string;
}

async function fetchLastGreeting(wallet: string): Promise<LastGreeting | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/agent_messages?wallet_address=eq.${wallet}&select=message,created_at&order=created_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { message: data[0].message, created_at: data[0].created_at };
  } catch { return null; }
}

// ---- Parse recommendation from a previous greeting and fetch current price ----
interface MemoryFollowUp {
  title: string;
  outcome: string;
  entryPrice: number;
  currentPrice: number;
  hoursAgo: number;
}

function parseRecommendation(message: string): { title: string; outcome: string; price: number; slug?: string } | null {
  // Match patterns like: Recomendación: "BTC > $100K" → Yes a 72¢.
  // or: Recommendation: "BTC > $100K" → Yes at 72¢.
  // or: Recomendação: "BTC > $100K" → Yes a 72¢.
  const m = message.match(/Recomendaci[oó]n|Recommendation|Recomenda[çc][aã]o/);
  if (!m) return null;

  const lineStart = message.indexOf(m[0]);
  const lineEnd = message.indexOf('\n', lineStart);
  const line = message.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  const parts = line.match(/"([^"]+)"\s*→\s*(\w+)\s*(?:a|at)\s*(\d+)¢/);
  if (!parts) return null;

  // Try to extract slug from the full message — look for the market title in polymarket section
  // The slug is not directly in the greeting, so we'll search by title via gamma API
  return { title: parts[1], outcome: parts[2], price: parseInt(parts[3]) };
}

async function fetchMarketCurrentPrice(title: string): Promise<number | null> {
  try {
    // Search gamma API by title (slug not available, use search)
    const res = await fetch(`${POLY_GAMMA}/markets?title=${encodeURIComponent(title)}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const market = data[0] as Record<string, unknown>;
    // outcomePrices is a JSON string like "[0.72, 0.28]"
    const prices = market.outcomePrices;
    if (typeof prices === 'string') {
      const parsed = JSON.parse(prices);
      if (Array.isArray(parsed) && parsed.length > 0) return parseFloat(parsed[0]);
    }
    return null;
  } catch { return null; }
}

async function buildMemoryFollowUp(lastGreeting: LastGreeting): Promise<MemoryFollowUp | null> {
  const rec = parseRecommendation(lastGreeting.message);
  if (!rec) return null;

  const currentPrice = await fetchMarketCurrentPrice(rec.title);
  if (currentPrice === null) return null;

  const hoursAgo = Math.round((Date.now() - new Date(lastGreeting.created_at).getTime()) / (1000 * 60 * 60));

  return {
    title: rec.title,
    outcome: rec.outcome,
    entryPrice: rec.price,
    currentPrice: Math.round(currentPrice * 100),
    hoursAgo,
  };
}

// ---- Supabase logging ----
async function logToSupabase(data: Record<string, unknown>) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/rest/v1/agent_cycles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.warn('[Agent] Supabase log failed:', err);
  }
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check for cron (skip for manual)
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.query.manual === 'true';
  const walletAddress = isManual ? String(req.query.wallet || '') : '';
  if (cronSecret && !isManual) {
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startMs = Date.now();
  const startedAt = new Date().toISOString();

  try {
    // Phase 0: Polymarket Intelligence (parallel with OKX)
    console.log('[Agent] Collecting signals + Polymarket intelligence...');
    const [raw, polyConsensus] = await Promise.all([
      collectDexSignals(),
      collectPolymarketIntelligence(),
    ]);
    console.log(`[Agent] ${raw.length} raw signals, ${polyConsensus.length} Polymarket consensus markets`);

    // Phase 2: Filter
    const filtered = filterSignals(raw);
    console.log(`[Agent] ${filtered.length} passed filters`);

    if (filtered.length === 0) {
      const result = {
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        signals_found: raw.length,
        signals_filtered: 0,
        llm_decisions: 0,
        trades_executed: 0,
        trades_blocked: 0,
        total_usd_deployed: 0,
        latency_ms: Date.now() - startMs,
        llm_reasoning: polyConsensus.length > 0
          ? `No OKX signals, but ${polyConsensus.length} Polymarket consensus markets detected.`
          : 'No actionable signals this cycle.',
        status: 'completed',
      };
      await logToSupabase(result);

      // Still generate greetings with Polymarket data even if no OKX signals
      const allProfiles0 = await fetchAdvisorProfiles();
      const profiles0 = isManual
        ? allProfiles0
        : allProfiles0.filter(p => new Date().getUTCHours() % (p.scan_interval_hours || 8) === 0);

      // Fetch last greetings for memory continuity (parallel)
      const memoryResults0 = await Promise.all(
        profiles0.map(async (p) => {
          const last = await fetchLastGreeting(p.wallet_address);
          return last ? buildMemoryFollowUp(last) : null;
        })
      );

      const greetings0 = profiles0.map((p, i) => ({
        wallet_address: p.wallet_address,
        advisor_name: p.advisor_name,
        message: generateGreeting(p, {
          cycle: { ...result, trades_blocked: 0 },
          topFilteredSignals: [],
          trades: [],
          polymarketData: polyConsensus,
        }, memoryResults0[i]),
      }));
      await saveGreetings(greetings0);

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        cycle: result,
        greetings: greetings0.map(g => ({ advisor: g.advisor_name, wallet: g.wallet_address.slice(0, 8) + '...' })),
        polymarket: polyConsensus.slice(0, 5).map(m => ({
          title: m.title,
          traders: m.traderCount,
          consensus: `${m.topOutcome} ${m.topOutcomePct.toFixed(0)}%`,
          price: `${Math.round(m.currentPrice * 100)}¢`,
          edge: `${m.edgePct.toFixed(1)}%`,
        })),
      });
    }

    // Phase 3: Self-optimization (fetch recent cycles + generate improved prompt)
    console.log('[Agent] Self-optimizing prompt...');
    const [recentCycles, optimizedPrompt] = await Promise.all([
      fetchRecentCycles(10),
      Promise.resolve(null), // placeholder — we need cycles first
    ]);
    const selfPrompt = recentCycles.length >= 3
      ? await selfOptimizePrompt(recentCycles)
      : null;
    if (selfPrompt) console.log('[Agent] Using self-optimized Alpha prompt');

    // Phase 4: Multi-Agent Debate (Alpha + Red Team + Judge)
    console.log('[Agent] Multi-agent debate starting...');
    const debate = await multiAgentDebate(filtered, polyConsensus, selfPrompt || undefined);
    console.log(`[Agent] Debate complete: ${debate.decisions.length} decisions`);

    // Phase 5: Kelly Criterion Risk Gate
    const { approved, blocked, sizingMethod } = applyRiskGate(debate.decisions);
    console.log(`[Agent] ${approved.length} approved (${sizingMethod}), ${blocked} blocked`);

    // Phase 6: Execute
    let trades: any[];
    if (walletAddress && isManual) {
      // Real execution mode — fetch swap calldata from OKX DEX Aggregator
      console.log(`[Agent] Fetching DEX calldata for wallet ${walletAddress.slice(0, 8)}...`);
      trades = [];
      for (const d of approved) {
        const chainId = d.chain || '196'; // Default X Layer for hackathon
        const fromAmount = String(Math.round(d.amountUsd * 1e6)); // USDC decimals
        const quote = await getSwapQuote(chainId, 'USDC', d.tokenSymbol, d.amountUsd);
        const swapTx = await getSwapCalldata(chainId, 'USDC', d.tokenSymbol, d.amountUsd, walletAddress);
        const approveTx = await getApproveCalldata(chainId, 'USDC', fromAmount);

        trades.push({
          ...d,
          txHash: null,
          status: 'pending_execution',
          execution: swapTx ? {
            needsApproval: !!approveTx,
            approveTx: approveTx || undefined,
            swapTx,
            quote: quote || { fromToken: 'USDC', toToken: d.tokenSymbol, fromAmount, toAmount: '0' },
          } : undefined,
        });
      }
    } else {
      // Cron/simulation mode
      trades = approved.map(d => ({
        ...d,
        txHash: `SIM-${Date.now()}-${d.tokenSymbol}`,
        status: 'simulated',
      }));
    }

    const totalDeployed = trades.reduce((sum, t) => sum + t.amountUsd, 0);

    // Phase 7: Log
    const result = {
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      signals_found: raw.length,
      signals_filtered: filtered.length,
      llm_decisions: debate.decisions.length,
      trades_executed: trades.length,
      trades_blocked: blocked,
      total_usd_deployed: totalDeployed,
      latency_ms: Date.now() - startMs,
      llm_model: 'claude-sonnet-4-20250514',
      llm_reasoning: debate.reasoning,
      status: 'completed',
    };

    await logToSupabase(result);

    // Phase 7: Generate personalized greetings for advisors whose interval matches
    console.log('[Agent] Generating greetings...');
    const allProfiles = await fetchAdvisorProfiles();
    const currentHour = new Date().getUTCHours();

    // For manual triggers, send to all profiles. For cron, only send to profiles
    // whose scan_interval_hours divides evenly into the current hour.
    const profiles = isManual
      ? allProfiles
      : allProfiles.filter(p => {
          const interval = p.scan_interval_hours || 8;
          return currentHour % interval === 0;
        });

    // Fetch last greetings for memory continuity (parallel)
    const memoryResults = await Promise.all(
      profiles.map(async (p) => {
        const last = await fetchLastGreeting(p.wallet_address);
        return last ? buildMemoryFollowUp(last) : null;
      })
    );

    const greetings = profiles.map((p, i) => ({
      wallet_address: p.wallet_address,
      advisor_name: p.advisor_name,
      message: generateGreeting(p, {
        cycle: result,
        topFilteredSignals: filtered,
        trades: trades.map(t => ({ tokenSymbol: t.tokenSymbol, amountUsd: t.amountUsd, confidence: t.confidence, chain: t.chain })),
        polymarketData: polyConsensus,
        debate: { alphaView: debate.alphaView, redTeamView: debate.redTeamView, judgeVerdict: debate.judgeVerdict },
        sizingMethod,
      }, memoryResults[i]),
    }));
    await saveGreetings(greetings);
    console.log(`[Agent] ${greetings.length} greetings sent`);

    console.log(`[Agent] Done in ${result.latency_ms}ms — ${trades.length} trades`);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      cycle: result,
      trades,
      debate: {
        alphaView: debate.alphaView.slice(0, 500),
        redTeamView: debate.redTeamView.slice(0, 500),
        judgeVerdict: debate.judgeVerdict.slice(0, 500),
        selfOptimized: !!selfPrompt,
        sizingMethod,
      },
      greetings: greetings.map(g => ({ advisor: g.advisor_name, wallet: g.wallet_address.slice(0, 8) + '...' })),
      topSignals: filtered.slice(0, 5).map(s => ({
        token: s.tokenSymbol,
        chain: s.chain,
        score: s.filterScore,
        reasons: s.reasons,
      })),
      polymarket: polyConsensus.slice(0, 5).map(m => ({
        title: m.title,
        traders: m.traderCount,
        consensus: `${m.topOutcome} ${m.topOutcomePct.toFixed(0)}%`,
        price: `${Math.round(m.currentPrice * 100)}¢`,
        edge: `${m.edgePct.toFixed(1)}%`,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Agent] Fatal:', msg);

    await logToSupabase({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      signals_found: 0,
      signals_filtered: 0,
      llm_decisions: 0,
      trades_executed: 0,
      trades_blocked: 0,
      total_usd_deployed: 0,
      latency_ms: Date.now() - startMs,
      llm_reasoning: '',
      error: msg,
      status: 'failed',
    });

    return res.status(500).json({ error: msg });
  }
}
