// ============================================================
// GET /api/bobby-intel — Fast intelligence endpoint for Bobby's brain
// Returns: OKX whale signals + Polymarket smart money + conviction + mood
// Designed for real-time conversational context (~10-15s vs 2min full cycle)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

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
  timestamp?: number;
}

interface FilteredSignal extends RawSignal {
  filterScore: number;
  reasons: string[];
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

interface CycleRecord {
  status: string;
  trades_executed: number;
  trades_successful?: number;
  total_usd_deployed?: number;
  llm_reasoning?: string;
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

// ---- OKX OnchainOS Whale Signals ----
async function collectDexSignals(): Promise<RawSignal[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  const chains = ['1', '501', '8453']; // ETH, SOL, Base
  const signals: RawSignal[] = [];
  const now = Date.now();

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
          timestamp: now,
        });
      }
    } catch (err) {
      console.error(`[Bobby Intel] Chain ${chainIndex} signal error:`, err);
    }
  }

  return signals;
}

// ---- Filter Signals ----
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

// ---- Dynamic Conviction Score (Regime-Aware Weights) ----
// Vance strategy: in high volatility, trust on-chain data (whales act, crowd lags).
// In low volatility, trust Polymarket consensus (smart money predicts breakouts).
function calculateDynamicConviction(
  okxScore: number,
  polyConsensus: number,
  latencyMs: number,
  btcVolatility: number, // absolute 24h change %
): number {
  const minutes = latencyMs / 60000;
  const latencyPenalty = minutes <= 5 ? 0 : Math.min(0.5, 0.02 * Math.exp(0.04 * minutes));

  // Regime-aware weights: volatility shifts trust between data sources
  // High vol (>5% daily move): trust on-chain 0.7, crowd 0.3
  // Low vol (<2%): trust consensus 0.7, on-chain 0.3
  // Mid vol: balanced 0.5/0.5
  let okxWeight: number;
  let polyWeight: number;
  if (btcVolatility > 5) {
    okxWeight = 0.7; polyWeight = 0.3;
  } else if (btcVolatility < 2) {
    okxWeight = 0.3; polyWeight = 0.7;
  } else {
    // Linear interpolation between 2-5% vol
    const t = (btcVolatility - 2) / 3;
    okxWeight = 0.3 + t * 0.4;
    polyWeight = 1 - okxWeight;
  }

  const raw = (okxScore * okxWeight) + (polyConsensus * polyWeight) - latencyPenalty;
  return Math.max(0, Math.min(1, raw));
}

// ---- Market Regime Detection ----
type MarketRegime = 'high_vol' | 'low_vol' | 'normal';

function detectRegime(btcChange24h: number): { regime: MarketRegime; label: string } {
  const abs = Math.abs(btcChange24h);
  if (abs > 5) return { regime: 'high_vol', label: `HIGH VOLATILITY (BTC ${btcChange24h > 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)` };
  if (abs < 2) return { regime: 'low_vol', label: `LOW VOLATILITY (BTC ${btcChange24h > 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)` };
  return { regime: 'normal', label: `NORMAL (BTC ${btcChange24h > 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)` };
}

// ---- Polymarket Intelligence ----
const POLY_DATA = 'https://data-api.polymarket.com';

async function fetchPolyLeaderboard(limit = 15): Promise<Array<{ proxyWallet: string; userName: string; rank: number; pnl: number; volume: number }>> {
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
  traders: Array<{ proxyWallet: string }>,
  positionsByWallet: Map<string, PolyPosition[]>
): SmartMoneyConsensus[] {
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

  const results: SmartMoneyConsensus[] = [];
  for (const [conditionId, m] of marketMap) {
    if (m.traders.size < 2) continue;
    let topOutcome = '';
    let topCapital = 0;
    for (const [outcome, capital] of m.outcomeCapital) {
      if (capital > topCapital) { topOutcome = outcome; topCapital = capital; }
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
  const traders = await fetchPolyLeaderboard(15);
  if (traders.length === 0) return [];

  const positionsByWallet = new Map<string, PolyPosition[]>();

  // Batch fetch: 5 at a time to avoid rate limits
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

  return aggregatePolyConsensus(traders, positionsByWallet);
}

// ---- Supabase: Recent Cycles (performance history) ----
async function fetchRecentCycles(limit = 5): Promise<CycleRecord[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(
      `${url}/rest/v1/agent_cycles?select=status,trades_executed,trades_successful,total_usd_deployed,llm_reasoning&order=started_at.desc&limit=${limit}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function calculateWinRate(cycles: CycleRecord[]): number {
  if (cycles.length === 0) return 1;
  const completed = cycles.filter(c => c.status === 'completed');
  if (completed.length === 0) return 1;
  const withTrades = completed.filter(c => c.trades_executed > 0);
  if (withTrades.length === 0) return 0.5;

  const hasSuccessData = withTrades.some(c => typeof c.trades_successful === 'number');
  if (hasSuccessData) {
    const totalExecuted = withTrades.reduce((sum, c) => sum + c.trades_executed, 0);
    const totalSuccessful = withTrades.reduce((sum, c) => sum + (c.trades_successful || 0), 0);
    return totalExecuted > 0 ? totalSuccessful / totalExecuted : 0.5;
  }
  return withTrades.length / completed.length;
}

function getAgentMood(winRate: number): 'confident' | 'cautious' | 'defensive' {
  if (winRate >= 0.7) return 'confident';
  if (winRate >= 0.5) return 'cautious';
  return 'defensive';
}

// ---- Prediction Calibration Curve (Metacognition Upgrade A) ----
// Answers: "When Bobby says X% conviction, does he actually win X% of the time?"
interface CalibrationBucket {
  bucket: string;       // e.g. "0.5-0.7"
  midpoint: number;     // predicted win rate (center of bucket)
  actual: number;       // actual win rate (break_even excluded from win count)
  count: number;        // sample size (excluding break_even)
  overconfident: boolean;
  reliable: boolean;    // Codex P1: bucket has enough samples (>=5) to trust
}
interface CalibrationData {
  curve: CalibrationBucket[];
  calibrationError: number;  // weighted avg |predicted - actual| (Codex: weight by count)
  isOverconfident: boolean;  // actual < predicted in high-conviction buckets WITH reliable data
  adjustment: number;        // multiplier for high-conviction only (Codex: capped, min sample)
  sampleSize: number;
  breakEvenCount: number;    // Codex: tracked separately, not inflating/deflating win rate
}

async function fetchCalibrationCurve(): Promise<CalibrationData> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const defaultData: CalibrationData = {
    curve: [], calibrationError: 0, isOverconfident: false, adjustment: 1.0, sampleSize: 0, breakEvenCount: 0,
  };

  if (!url || !key) return defaultData;

  try {
    const res = await fetch(
      `${url}/rest/v1/forum_threads?resolution=neq.pending&resolution=not.is.null&conviction_score=not.is.null&select=conviction_score,resolution`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return defaultData;
    const rows = await res.json() as Array<{ conviction_score: number; resolution: string }>;
    if (rows.length < 5) return { ...defaultData, sampleSize: rows.length };

    // Codex P1: Separate break_even — don't count as win or loss
    const breakEvenCount = rows.filter(r => r.resolution === 'break_even').length;
    const decisive = rows.filter(r => r.resolution === 'win' || r.resolution === 'loss');

    // Group into buckets (conviction is 0-1 scale, per bobby-cycle.ts line 353)
    const bucketDefs = [
      { label: '0.0-0.3', min: 0, max: 0.3, mid: 0.15 },
      { label: '0.3-0.5', min: 0.3, max: 0.5, mid: 0.4 },
      { label: '0.5-0.7', min: 0.5, max: 0.7, mid: 0.6 },
      { label: '0.7-0.85', min: 0.7, max: 0.85, mid: 0.775 },
      { label: '0.85-1.0', min: 0.85, max: 1.01, mid: 0.925 },
    ];

    const MIN_BUCKET_SIZE = 5; // Codex P1: minimum samples to trust a bucket
    const curve: CalibrationBucket[] = [];
    let weightedErrorSum = 0;
    let totalWeightedCount = 0;

    for (const b of bucketDefs) {
      const inBucket = decisive.filter(r => r.conviction_score >= b.min && r.conviction_score < b.max);
      if (inBucket.length === 0) continue;
      const wins = inBucket.filter(r => r.resolution === 'win').length;
      const actual = wins / inBucket.length;
      const reliable = inBucket.length >= MIN_BUCKET_SIZE;
      const error = Math.abs(b.mid - actual);

      // Codex P1: weight calibration error by sample count
      if (reliable) {
        weightedErrorSum += error * inBucket.length;
        totalWeightedCount += inBucket.length;
      }

      curve.push({
        bucket: b.label,
        midpoint: b.mid,
        actual: parseFloat(actual.toFixed(3)),
        count: inBucket.length,
        overconfident: actual < b.mid,
        reliable,
      });
    }

    const calibrationError = totalWeightedCount > 0
      ? parseFloat((weightedErrorSum / totalWeightedCount).toFixed(3))
      : 0;

    // Codex P1: only flag overconfident if RELIABLE high-conviction buckets show it
    const highReliable = curve.filter(c => c.midpoint >= 0.5 && c.reliable);
    const isOverconfident = highReliable.some(c => c.overconfident);

    // Codex P1: adjustment multiplier ONLY from reliable high-conviction buckets
    // Capped at 0.65-1.0 to prevent over-correction from noisy data
    let adjustment = 1.0;
    if (isOverconfident && highReliable.length > 0) {
      const weightedActual = highReliable.reduce((s, c) => s + c.actual * c.count, 0);
      const weightedPredicted = highReliable.reduce((s, c) => s + c.midpoint * c.count, 0);
      if (weightedPredicted > 0) {
        adjustment = parseFloat(Math.max(0.65, Math.min(1.0, weightedActual / weightedPredicted)).toFixed(3));
      }
    }

    return {
      curve,
      calibrationError,
      isOverconfident,
      adjustment,
      sampleSize: decisive.length,
      breakEvenCount,
    };
  } catch { return defaultData; }
}

// ---- OKX CEX Prices (spot + commodities) ----
async function fetchLivePrices(): Promise<Array<{ symbol: string; price: number; change24h: number }>> {
  const instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'OKB-USDT', 'XAUT-USDT', 'PAXG-USDT'];
  try {
    const res = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    if (!res.ok) return [];
    const json = await res.json() as { code: string; data: Array<{ instId: string; last: string; open24h: string }> };
    if (json.code !== '0') return [];

    const tickerMap = new Map(json.data.map(t => [t.instId, t]));
    const prices = instruments.map(inst => {
      const t = tickerMap.get(inst);
      if (!t) return null;
      const last = parseFloat(t.last);
      const open = parseFloat(t.open24h);
      return {
        symbol: inst.split('-')[0],
        price: last,
        change24h: open > 0 ? parseFloat((((last - open) / open) * 100).toFixed(2)) : 0,
      };
    }).filter(Boolean) as Array<{ symbol: string; price: number; change24h: number }>;

    // Also fetch silver (SWAP only)
    try {
      const swapRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=XAG-USDT-SWAP');
      const swapJson = await swapRes.json() as { code: string; data: Array<{ last: string; open24h: string }> };
      if (swapJson.code === '0' && swapJson.data?.[0]) {
        const s = swapJson.data[0];
        const last = parseFloat(s.last);
        const open = parseFloat(s.open24h);
        prices.push({
          symbol: 'XAG',
          price: last,
          change24h: open > 0 ? parseFloat((((last - open) / open) * 100).toFixed(2)) : 0,
        });
      }
    } catch { /* non-critical */ }

    return prices;
  } catch { return []; }
}

// ---- Funding Rates (Long/Short Squeeze Detection) ----
// Critical CIO-level data: high positive funding = everyone long → squeeze risk
interface FundingRate { symbol: string; rate: number; annualized: number; nextFundingTime: string }

async function fetchFundingRates(): Promise<FundingRate[]> {
  const instruments = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP'];
  try {
    const results = await Promise.all(instruments.map(async (instId) => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`);
        if (!res.ok) return null;
        const json = await res.json() as { code: string; data: Array<{ instId: string; fundingRate: string; nextFundingRate: string; nextFundingTime: string }> };
        if (json.code !== '0' || !json.data?.[0]) return null;
        const d = json.data[0];
        const rate = parseFloat(d.fundingRate);
        return {
          symbol: instId.split('-')[0],
          rate,
          annualized: parseFloat((rate * 3 * 365 * 100).toFixed(1)), // 3 settlements/day × 365
          nextFundingTime: d.nextFundingTime,
        };
      } catch { return null; }
    }));
    return results.filter(Boolean) as FundingRate[];
  } catch { return []; }
}

// ---- Open Interest (Crowded Trade Detection) ----
interface OpenInterestData { symbol: string; oi: number; oiCcy: number }

async function fetchOpenInterest(): Promise<OpenInterestData[]> {
  const instruments = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP'];
  try {
    const results = await Promise.all(instruments.map(async (instId) => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`);
        if (!res.ok) return null;
        const json = await res.json() as { code: string; data: Array<{ instId: string; oi: string; oiCcy: string; ts: string }> };
        if (json.code !== '0' || !json.data?.[0]) return null;
        return {
          symbol: instId.split('-')[0],
          oi: parseInt(json.data[0].oi),
          oiCcy: parseFloat(json.data[0].oiCcy),
        };
      } catch { return null; }
    }));
    return results.filter(Boolean) as OpenInterestData[];
  } catch { return []; }
}

// ---- Top Traders Long/Short Ratio (Smart Money Positioning) ----
interface LongShortRatio { symbol: string; longRatio: number; shortRatio: number; ts: string }

async function fetchTopTradersLSRatio(): Promise<LongShortRatio[]> {
  const instruments = [
    { symbol: 'BTC', instId: 'BTC-USDT-SWAP' },
    { symbol: 'ETH', instId: 'ETH-USDT-SWAP' },
    { symbol: 'SOL', instId: 'SOL-USDT-SWAP' },
  ];
  try {
    const results = await Promise.all(instruments.map(async ({ symbol, instId }) => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio-contract-top-trader?instId=${instId}&period=1H`);
        if (!res.ok) return null;
        const json = await res.json() as { code: string; data: string[][] };
        if (json.code !== '0' || !json.data?.[0]) return null;
        const latest = json.data[0]; // [timestamp, ratio]
        const ratio = parseFloat(latest[1]);
        // ratio > 1 means more longs, < 1 means more shorts
        const longPct = parseFloat((ratio / (1 + ratio) * 100).toFixed(1));
        const shortPct = parseFloat((100 - longPct).toFixed(1));
        return {
          symbol,
          longRatio: longPct,
          shortRatio: shortPct,
          ts: latest[0],
        };
      } catch { return null; }
    }));
    return results.filter(Boolean) as LongShortRatio[];
  } catch { return []; }
}

// ---- Fear & Greed Index (Market Sentiment) ----
interface FearGreedData { value: number; classification: string }

async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ value: string; value_classification: string }> };
    if (!json.data?.[0]) return null;
    return {
      value: parseInt(json.data[0].value),
      classification: json.data[0].value_classification,
    };
  } catch { return null; }
}

// ---- DXY (US Dollar Index — calculated from ECB forex rates) ----
async function fetchDXY(): Promise<{ dxy: number } | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF');
    if (!res.ok) return null;
    const json = await res.json() as { rates: { EUR: number; JPY: number; GBP: number; CAD: number; SEK: number; CHF: number } };
    const r = json.rates;
    // ICE DXY formula: 50.14348112 × (1/EUR)^0.576 × JPY^0.136 × (1/GBP)^0.119 × CAD^0.091 × SEK^0.042 × CHF^0.036
    const dxy = 50.14348112
      * Math.pow(1 / r.EUR, 0.576)
      * Math.pow(r.JPY, 0.136)
      * Math.pow(1 / r.GBP, 0.119)
      * Math.pow(r.CAD, 0.091)
      * Math.pow(r.SEK, 0.042)
      * Math.pow(r.CHF, 0.036);
    return { dxy: parseFloat(dxy.toFixed(2)) };
  } catch { return null; }
}

// ---- OKX DEX Signal Leaderboard (Top On-Chain Traders) ----
interface DexLeaderEntry { address: string; pnl: number; winRate: number; tradeCount: number; chain: string }

async function fetchDexLeaderboard(): Promise<DexLeaderEntry[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  try {
    const path = '/api/v6/dex/market/signal/leaderboard';
    const body = JSON.stringify({ chainIndex: '1', rankBy: 'pnl', limit: '10' });
    const timestamp = new Date().toISOString();
    const signature = await hmacSign(timestamp + 'POST' + path + body, secretKey);

    const res = await fetch(`https://web3.okx.com${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
      body,
    });
    if (!res.ok) return [];
    const json = await res.json() as { code: string; data: unknown };
    if (json.code !== '0' || !Array.isArray(json.data)) return [];

    return (json.data as Array<Record<string, unknown>>).slice(0, 5).map(t => ({
      address: String(t.walletAddress || '').slice(0, 10) + '...',
      pnl: parseFloat(String(t.pnl || '0')),
      winRate: parseFloat(String(t.winRate || '0')),
      tradeCount: parseInt(String(t.tradeCount || '0')),
      chain: 'ETH',
    }));
  } catch { return []; }
}

// ---- OKX DEX Trending Tokens (Hot Right Now) ----
interface TrendingToken { symbol: string; price: number; change24h: number; volume24h: number; chain: string }

async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  try {
    const path = '/api/v5/dex/market/hot-token';
    const qs = '?chainIndex=1&limit=5';
    const timestamp = new Date().toISOString();
    const signature = await hmacSign(timestamp + 'GET' + path + qs, secretKey);

    const res = await fetch(`https://web3.okx.com${path}${qs}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });
    if (!res.ok) return [];
    const json = await res.json() as { code: string; data: unknown };
    if (json.code !== '0' || !Array.isArray(json.data)) return [];

    return (json.data as Array<Record<string, unknown>>).slice(0, 5).map(t => ({
      symbol: String(t.tokenSymbol || 'UNKNOWN'),
      price: parseFloat(String(t.price || '0')),
      change24h: parseFloat(String(t.priceChange24h || '0')),
      volume24h: parseFloat(String(t.volume24h || '0')),
      chain: 'ETH',
    }));
  } catch { return []; }
}

// ---- OKX Security Token Scan (Honeypot / Rug Detection) ----
interface TokenSecurity {
  symbol: string;
  address: string;
  chain: string;
  isHoneypot: boolean;
  riskLevel: 'safe' | 'caution' | 'danger' | 'unknown';
  risks: string[];
}

async function scanTokenSecurity(tokens: Array<{ symbol: string; address: string; chain: string }>): Promise<TokenSecurity[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  const results: TokenSecurity[] = [];
  // Scan max 3 tokens to stay within latency budget (5s timeout each)
  const toScan = tokens.slice(0, 3).filter(t => t.address && t.address.length > 10);

  for (const token of toScan) {
    try {
      const path = '/api/v5/dex/security/token-scan';
      const qs = `?chainIndex=${token.chain}&tokenAddress=${token.address}`;
      const timestamp = new Date().toISOString();
      const signature = await hmacSign(timestamp + 'GET' + path + qs, secretKey);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`https://web3.okx.com${path}${qs}`, {
        headers: {
          'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase,
          'OK-ACCESS-PROJECT': projectId,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        results.push({ symbol: token.symbol, address: token.address, chain: token.chain, isHoneypot: false, riskLevel: 'unknown', risks: ['API unavailable'] });
        continue;
      }

      const json = await res.json() as { code: string; data: unknown };
      if (json.code !== '0' || !Array.isArray(json.data) || json.data.length === 0) {
        results.push({ symbol: token.symbol, address: token.address, chain: token.chain, isHoneypot: false, riskLevel: 'unknown', risks: ['No security data'] });
        continue;
      }

      const d = json.data[0] as Record<string, unknown>;
      const risks: string[] = [];
      const isHoneypot = d.isHoneypot === true || d.isHoneypot === 'true';
      if (isHoneypot) risks.push('HONEYPOT — cannot sell');
      if (d.isMintable === true || d.isMintable === 'true') risks.push('Mintable supply');
      if (d.isProxy === true || d.isProxy === 'true') risks.push('Proxy contract (upgradeable)');
      if (d.canTakeBackOwnership === true) risks.push('Owner can reclaim');
      if (d.hasBlacklist === true || d.hasBlacklist === 'true') risks.push('Has blacklist function');
      if (d.hasTradingCooldown === true) risks.push('Trading cooldown');
      const buyTax = parseFloat(String(d.buyTax || '0'));
      const sellTax = parseFloat(String(d.sellTax || '0'));
      if (buyTax > 5) risks.push(`High buy tax: ${buyTax}%`);
      if (sellTax > 10) risks.push(`High sell tax: ${sellTax}%`);

      let riskLevel: 'safe' | 'caution' | 'danger' | 'unknown' = 'safe';
      if (isHoneypot || sellTax > 50) riskLevel = 'danger';
      else if (risks.length >= 3 || sellTax > 10 || buyTax > 10) riskLevel = 'caution';
      else if (risks.length === 0) riskLevel = 'safe';

      results.push({ symbol: token.symbol, address: token.address, chain: token.chain, isHoneypot, riskLevel, risks });
    } catch (err: any) {
      // Timeout or network error — fail open with warning (Gemini mitigation)
      results.push({
        symbol: token.symbol, address: token.address, chain: token.chain,
        isHoneypot: false, riskLevel: 'unknown',
        risks: [err.name === 'AbortError' ? 'Security scan timeout (5s)' : 'Scan failed'],
      });
    }
  }

  return results;
}

// ---- OKX DEX Trenches (Meme/Pump.fun Scanner) ----
interface TrenchToken { symbol: string; address: string; chain: string; devAddress: string; devLaunchCount: number; devRugCount: number; bondingProgress: number; isMigrated: boolean; liquidity: number }

async function fetchTrenchTokens(): Promise<TrenchToken[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  try {
    const path = '/api/v5/dex/market/new-token';
    const qs = '?chainIndex=501&limit=5'; // Solana pump.fun
    const timestamp = new Date().toISOString();
    const signature = await hmacSign(timestamp + 'GET' + path + qs, secretKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://web3.okx.com${path}${qs}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const json = await res.json() as { code: string; data: unknown };
    if (json.code !== '0' || !Array.isArray(json.data)) return [];

    return (json.data as Array<Record<string, unknown>>).slice(0, 5).map(t => ({
      symbol: String(t.tokenSymbol || 'UNKNOWN'),
      address: String(t.tokenAddress || ''),
      chain: 'SOL',
      devAddress: String(t.devAddress || '').slice(0, 10) + '...',
      devLaunchCount: parseInt(String(t.devLaunchCount || '0')),
      devRugCount: parseInt(String(t.devRugCount || '0')),
      bondingProgress: parseFloat(String(t.bondingProgress || '0')),
      isMigrated: t.isMigrated === true || t.isMigrated === 'true',
      liquidity: parseFloat(String(t.liquidity || '0')),
    }));
  } catch { return []; }
}

// ---- Yahoo Finance (Top Stocks Integration) ----
async function fetchTopStocks(): Promise<Array<{ symbol: string; price: number; change24h: number }>> {
  try {
    const url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=NVDA,AAPL,TSLA,META,MSFT,COIN,SPY&range=1d&interval=1d';
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    const data = await response.json() as Record<string, unknown>;
    const spark = data.spark as { result?: Array<{ symbol: string; response: Array<{ meta: Record<string, unknown> }> }> } | undefined;
    const quotes: Array<{ symbol: string; price: number; change24h: number }> = [];
    for (const item of spark?.result || []) {
      const meta = item.response?.[0]?.meta;
      if (!meta) continue;
      const price = Number(meta.regularMarketPrice || 0);
      const prev = Number(meta.chartPreviousClose || meta.previousClose || 0);
      quotes.push({
        symbol: item.symbol,
        price,
        change24h: prev > 0 ? parseFloat((((price - prev) / prev) * 100).toFixed(2)) : 0
      });
    }
    return quotes;
  } catch { return []; }
}

// ============================================================
// HANDLER — Runs all intelligence pipelines in parallel
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startMs = Date.now();

  try {
    // Run all intelligence sources in parallel
    const [rawSignals, polyConsensus, recentCycles, cryptoPrices, fundingRates, openInterest, topTradersLS, fearGreed, dxyData, stockPrices, xlayerSignals, dexLeaderboard, trendingTokens, trenchTokens, calibration] = await Promise.allSettled([
      collectDexSignals(),
      collectPolymarketIntelligence(),
      fetchRecentCycles(5),
      fetchLivePrices(),
      fetchFundingRates(),
      fetchOpenInterest(),
      fetchTopTradersLSRatio(),
      fetchFearGreed(),
      fetchDXY(),
      fetchTopStocks(),
      // X Layer on-chain signals via OnchainOS
      fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://defi-mexico-hub.vercel.app'}/api/xlayer-trade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signals' }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchDexLeaderboard(),
      fetchTrendingTokens(),
      fetchTrenchTokens(),
      fetchCalibrationCurve(),
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null)) as [any, any, any, any, FundingRate[], OpenInterestData[], LongShortRatio[], FearGreedData | null, { dxy: number } | null, any, any, DexLeaderEntry[], TrendingToken[], TrenchToken[], CalibrationData | null];

    const livePrices = [...(cryptoPrices || []), ...(stockPrices || [])];

    const filtered = filterSignals(rawSignals);
    // Codex P2: use actual signal age from timestamp, not hardcoded 0
    const newestSignal = filtered[0];
    const signalAgeMs = newestSignal?.timestamp
      ? Date.now() - Number(newestSignal.timestamp)
      : 5 * 60 * 1000; // default 5min if no timestamp
    const winRate = calculateWinRate(recentCycles);
    const mood = getAgentMood(winRate);
    // Gemini: Laplace smoothing — don't trigger safe mode with < 5 trades
    // Codex: cycles use 'completed' status, not 'resolved'
    const totalCompleted = recentCycles.filter((c: any) => c.status === 'completed' || c.status === 'resolved').length;
    const isSafeMode = totalCompleted >= 5 && winRate < 0.5;

    // Regime detection — BTC 24h volatility drives conviction weights
    const btcPrice = livePrices.find(p => p.symbol === 'BTC');
    const btcVol = btcPrice ? Math.abs(btcPrice.change24h) : 3; // default to "normal" if no BTC data
    const regime = detectRegime(btcPrice?.change24h || 0);

    // Compute conviction for top signals (regime-aware)
    const bestPolyEdge = polyConsensus.length > 0
      ? Math.min(1, Math.max(0, polyConsensus[0].edgePct / 100))
      : 0;

    const signalsWithConviction = filtered.map(s => {
      const okxNorm = s.filterScore / 100;
      const conviction = calculateDynamicConviction(okxNorm, bestPolyEdge, signalAgeMs, btcVol);
      return {
        symbol: s.tokenSymbol,
        chain: s.chain === '1' ? 'ETH' : s.chain === '501' ? 'SOL' : s.chain === '8453' ? 'Base' : s.chain,
        amountUsd: s.amountUsd,
        filterScore: s.filterScore,
        conviction: parseFloat(conviction.toFixed(3)),
        reasons: s.reasons,
        walletType: s.signalType === '1' ? 'Smart Money' : s.signalType === '3' ? 'Whale' : s.signalType === '2' ? 'KOL' : 'Unknown',
      };
    });

    // Format Polymarket consensus for Bobby's brain
    const polyFormatted = polyConsensus.map((m: any) => ({
      title: m.title,
      traderCount: m.traderCount,
      topOutcome: m.topOutcome,
      topOutcomePct: parseFloat(m.topOutcomePct.toFixed(1)),
      currentPrice: parseFloat((m.currentPrice * 100).toFixed(1)), // in cents
      entryPrice: parseFloat((m.avgEntryPrice * 100).toFixed(1)),  // in cents
      edgePct: parseFloat(m.edgePct.toFixed(1)),
      totalCapital: parseFloat(m.totalCapital.toFixed(2)),
    }));

    // Compute Dynamic Conviction Score (deterministic, regime-aware)
    const okxScore = filtered.length > 0
      ? Math.min(1, filtered.reduce((sum: number, s: any) => sum + (s.filterScore || 0), 0) / (filtered.length * 100))
      : 0;
    const polyScore = polyFormatted.length > 0
      ? Math.min(1, polyFormatted.reduce((sum: number, m: any) => sum + ((m.topOutcomePct || 0) / 100), 0) / polyFormatted.length)
      : 0;
    let dynamicConviction = calculateDynamicConviction(okxScore, polyScore, signalAgeMs, btcVol);

    // Gemini: TA as binary multiplier — if squeeze + directional cross, boost conviction
    // This is applied when TA data is available in the briefing context
    // The actual TA multiplier is computed client-side since TA endpoint is separate
    // Here we add the formula documentation for the CIO prompt
    // TA boost: if Bollinger squeeze + MACD bullish cross + price > SMA50 → conviction * 1.10
    // TA penalty: if RSI > 80 (extreme overbought) or RSI < 20 (extreme oversold against direction) → conviction * 0.90

    // Performance context
    const performance = {
      winRate: parseFloat((winRate * 100).toFixed(0)),
      mood,
      isSafeMode,
      dynamicConviction,
      recentCycles: recentCycles.slice(0, 3).map((c: any) => ({
        status: c.status,
        trades: c.trades_executed,
        successful: c.trades_successful || 0,
        deployed: c.total_usd_deployed || 0,
      })),
    };

    const latencyMs = Date.now() - startMs;

    // Format X Layer signals
    const xlayerFormatted = xlayerSignals?.data?.slice(0, 5).map((s: any) => ({
      token: s.token?.symbol || 'UNKNOWN',
      amount_usd: parseFloat(parseFloat(s.amountUsd || '0').toFixed(2)),
      wallets: parseInt(s.triggerWalletCount || '0'),
      market_cap: parseFloat(parseFloat(s.token?.marketCapUsd || '0').toFixed(0)),
    })) || [];

    // Format DEX leaderboard + trending for briefing
    const leaderFormatted = (dexLeaderboard || []).slice(0, 5);
    const trendingFormatted = (trendingTokens || []).slice(0, 5);

    // Security scan: check top trending tokens + any whale signal tokens for honeypots
    const tokensToScan = [
      ...(trendingFormatted || []).filter((t: any) => t.symbol && t.chain).map((t: any) => ({
        symbol: t.symbol, address: t.address || '', chain: t.chain === 'ETH' ? '1' : t.chain === 'SOL' ? '501' : '1',
      })),
      ...filtered.slice(0, 2).filter(s => s.tokenAddress).map(s => ({
        symbol: s.tokenSymbol, address: s.tokenAddress, chain: s.chain,
      })),
    ];
    const securityResults = tokensToScan.length > 0 ? await scanTokenSecurity(tokensToScan) : [];

    // Build the intelligence briefing text for Bobby's brain
    const trenchFormatted = (trenchTokens || []).slice(0, 5);
    const briefing = buildBriefing(signalsWithConviction, polyFormatted, livePrices || [], fundingRates || [], performance, regime, latencyMs, openInterest || [], topTradersLS || [], fearGreed, dxyData, xlayerFormatted, leaderFormatted, trendingFormatted, securityResults, trenchFormatted, calibration);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

    return res.status(200).json({
      ok: true,
      briefing,           // Pre-formatted XML-tagged block for injection into LLM context
      signals: signalsWithConviction,
      polymarket: polyFormatted,
      prices: livePrices || [],
      fundingRates: fundingRates || [],
      openInterest: openInterest || [],
      topTradersLS: topTradersLS || [],
      fearGreed,
      dxy: dxyData,
      xlayer: xlayerFormatted,
      dexLeaderboard: leaderFormatted,
      trending: trendingFormatted,
      security: securityResults,
      trenches: trenchFormatted,
      performance,
      calibration: calibration || { curve: [], calibrationError: 0, isOverconfident: false, adjustment: 1.0, sampleSize: 0, breakEvenCount: 0 },
      regime: regime.label,
      meta: {
        signalsRaw: rawSignals.length,
        signalsFiltered: filtered.length,
        polymarketsTracked: polyConsensus.length,
        latencyMs,
        ts: Date.now(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Bobby Intel] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}

// ---- Build XML-tagged intelligence briefing ----
// XML tags = high-priority structural markers for Claude.
// Prevents context hallucination — Bobby cites specific keys, not vibes.
function buildBriefing(
  signals: Array<{ symbol: string; chain: string; amountUsd: number; filterScore: number; conviction: number; reasons: string[]; walletType: string }>,
  polymarket: Array<{ title: string; traderCount: number; topOutcome: string; topOutcomePct: number; currentPrice: number; entryPrice: number; edgePct: number }>,
  prices: Array<{ symbol: string; price: number; change24h: number }>,
  fundingRates: FundingRate[],
  performance: { winRate: number; mood: string; isSafeMode: boolean; dynamicConviction: number; recentCycles: any[] },
  regime: { regime: MarketRegime; label: string },
  latencyMs: number,
  openInterest: OpenInterestData[],
  topTradersLS: LongShortRatio[],
  fearGreed: FearGreedData | null,
  dxyData: { dxy: number } | null,
  xlayerSignals?: Array<{ token: string; amount_usd: number; wallets: number; market_cap: number }>,
  dexLeaderboard?: DexLeaderEntry[],
  trendingTokens?: TrendingToken[],
  securityResults?: TokenSecurity[],
  trenchTokens?: TrenchToken[],
  calibrationData?: CalibrationData | null,
): string {
  const blocks: string[] = [];

  // Market regime
  blocks.push(`<MARKET_REGIME>${regime.label}</MARKET_REGIME>`);

  // Live prices as JSON
  const priceData = prices.map(p => ({
    symbol: p.symbol, price: p.price,
    change_24h_pct: p.change24h,
  }));
  blocks.push(`<LIVE_PRICES>\n${JSON.stringify(priceData)}\n</LIVE_PRICES>`);

  // Funding rates (squeeze detection)
  if (fundingRates.length > 0) {
    const fundingData = fundingRates.map(f => ({
      symbol: f.symbol,
      rate_pct: parseFloat((f.rate * 100).toFixed(4)),
      annualized_pct: f.annualized,
      squeeze_risk: Math.abs(f.rate) > 0.01 ? (f.rate > 0 ? 'LONG_SQUEEZE' : 'SHORT_SQUEEZE') : 'NEUTRAL',
    }));
    blocks.push(`<FUNDING_RATES>\n${JSON.stringify(fundingData)}\n</FUNDING_RATES>`);
  }

  // OKX whale signals as JSON
  if (signals.length > 0) {
    const signalData = signals.slice(0, 5).map(s => ({
      symbol: s.symbol, chain: s.chain,
      amount_K: parseFloat((s.amountUsd / 1000).toFixed(1)),
      wallet_type: s.walletType,
      conviction_pct: parseFloat((s.conviction * 100).toFixed(0)),
      reasons: s.reasons,
    }));
    blocks.push(`<WHALE_SIGNALS count="${signals.length}">\n${JSON.stringify(signalData)}\n</WHALE_SIGNALS>`);
  } else {
    blocks.push(`<WHALE_SIGNALS count="0">No significant whale movements detected.</WHALE_SIGNALS>`);
  }

  // Polymarket consensus as JSON
  if (polymarket.length > 0) {
    const polyData = polymarket.slice(0, 5).map(m => ({
      title: m.title, traders: m.traderCount,
      outcome: m.topOutcome, consensus_pct: m.topOutcomePct,
      price_cents: m.currentPrice, entry_cents: m.entryPrice,
      edge_pct: m.edgePct,
    }));
    blocks.push(`<PREDICTION_MARKETS count="${polymarket.length}">\n${JSON.stringify(polyData)}\n</PREDICTION_MARKETS>`);
  } else {
    blocks.push(`<PREDICTION_MARKETS count="0">No strong smart money consensus detected.</PREDICTION_MARKETS>`);
  }

  // Open Interest (crowded trade detection)
  if (openInterest.length > 0) {
    const oiData = openInterest.map(o => ({
      symbol: o.symbol,
      open_interest_contracts: o.oi,
      open_interest_coins: parseFloat(o.oiCcy.toFixed(2)),
    }));
    blocks.push(`<OPEN_INTEREST>\n${JSON.stringify(oiData)}\n</OPEN_INTEREST>`);
  }

  // Top traders long/short ratio (smart money positioning)
  if (topTradersLS.length > 0) {
    const lsData = topTradersLS.map(ls => ({
      symbol: ls.symbol,
      top_traders_long_pct: ls.longRatio,
      top_traders_short_pct: ls.shortRatio,
      bias: ls.longRatio > 60 ? 'HEAVILY_LONG' : ls.shortRatio > 60 ? 'HEAVILY_SHORT' : 'BALANCED',
    }));
    blocks.push(`<TOP_TRADERS_POSITIONING>\n${JSON.stringify(lsData)}\n</TOP_TRADERS_POSITIONING>`);
  }

  // Fear & Greed Index (market sentiment)
  if (fearGreed) {
    blocks.push(`<SENTIMENT>\n${JSON.stringify({ fear_greed_index: fearGreed.value, classification: fearGreed.classification, signal: fearGreed.value <= 25 ? 'EXTREME_FEAR_BUY_ZONE' : fearGreed.value >= 75 ? 'EXTREME_GREED_SELL_ZONE' : 'NEUTRAL' })}\n</SENTIMENT>`);
  }

  // DXY (US Dollar strength — inverse correlation with crypto)
  if (dxyData) {
    blocks.push(`<MACRO_CONTEXT>\n${JSON.stringify({ dxy_index: dxyData.dxy, interpretation: dxyData.dxy > 104 ? 'STRONG_DOLLAR_HEADWIND' : dxyData.dxy < 100 ? 'WEAK_DOLLAR_TAILWIND' : 'NEUTRAL_DOLLAR' })}\n</MACRO_CONTEXT>`);
  }

  // X Layer on-chain signals (smart money activity on OKX L2)
  if (xlayerSignals && xlayerSignals.length > 0) {
    blocks.push(`<XLAYER_SIGNALS count="${xlayerSignals.length}">\n${JSON.stringify(xlayerSignals)}\n</XLAYER_SIGNALS>`);
  }

  // Performance / metacognition
  const metaData = {
    win_rate_pct: performance.winRate,
    mood: performance.mood,
    safe_mode: performance.isSafeMode,
    latency_s: parseFloat((latencyMs / 1000).toFixed(1)),
  };
  blocks.push(`<AGENT_META>\n${JSON.stringify(metaData)}\n</AGENT_META>`);

  // Prediction Calibration (Metacognition Upgrade A)
  if (calibrationData && calibrationData.sampleSize >= 5) {
    const calBlock: Record<string, unknown> = {
      sample_size: calibrationData.sampleSize,
      break_even_excluded: calibrationData.breakEvenCount,
      calibration_error: calibrationData.calibrationError,
      is_overconfident: calibrationData.isOverconfident,
      conviction_adjustment: calibrationData.adjustment,
      buckets: calibrationData.curve.map(c => ({
        range: c.bucket,
        predicted: c.midpoint,
        actual_win_rate: c.actual,
        n: c.count,
        reliable: c.reliable,
        verdict: c.reliable ? (c.overconfident ? 'OVERCONFIDENT' : 'CALIBRATED') : 'LOW_SAMPLE',
      })),
    };
    let instruction = '';
    if (calibrationData.isOverconfident) {
      instruction = `\nWARNING: You are OVERCONFIDENT. When you say high conviction, you win less than expected. Apply ${calibrationData.adjustment.toFixed(2)}x multiplier to your raw conviction. Example: if you feel 8/10, report ${Math.round(8 * calibrationData.adjustment)}/10.`;
    } else if (calibrationData.calibrationError < 0.1) {
      instruction = '\nYour predictions are well-calibrated. Maintain current conviction levels.';
    }
    blocks.push(`<CALIBRATION>\n${JSON.stringify(calBlock)}${instruction}\n</CALIBRATION>`);
  }

  // DEX Leaderboard — top on-chain traders by PnL
  if (dexLeaderboard && dexLeaderboard.length > 0) {
    blocks.push(`<DEX_LEADERBOARD>\n${JSON.stringify(dexLeaderboard.map(t => ({
      address: t.address, pnl: t.pnl, win_rate: t.winRate, trades: t.tradeCount,
    })))}\n</DEX_LEADERBOARD>`);
  }

  // Trending tokens — hot on-chain right now
  if (trendingTokens && trendingTokens.length > 0) {
    blocks.push(`<TRENDING_TOKENS>\n${JSON.stringify(trendingTokens.map(t => ({
      symbol: t.symbol, price: t.price, change_24h: t.change24h, volume: t.volume24h,
    })))}\n</TRENDING_TOKENS>`);
  }

  // Meme/Pump.fun trenches — new launches with dev reputation
  if (trenchTokens && trenchTokens.length > 0) {
    const trenchData = trenchTokens.map(t => ({
      symbol: t.symbol, chain: t.chain, dev: t.devAddress,
      dev_launches: t.devLaunchCount, dev_rugs: t.devRugCount,
      bonding_pct: t.bondingProgress, migrated: t.isMigrated,
      liquidity: t.liquidity,
      warning: t.devRugCount > 0 ? `DEV HAS RUGGED ${t.devRugCount} TIMES` : null,
    }));
    blocks.push(`<MEME_TRENCHES count="${trenchTokens.length}">\n${JSON.stringify(trenchData)}\nIMPORTANT: If dev_rugs > 0, Bobby MUST warn user. If dev_rugs >= 3, refuse to recommend.\n</MEME_TRENCHES>`);
  }

  // Token security scan results — hard gate for Bobby
  if (securityResults && securityResults.length > 0) {
    const secData = securityResults.map(s => ({
      symbol: s.symbol, risk: s.riskLevel, honeypot: s.isHoneypot,
      issues: s.risks.length > 0 ? s.risks : ['Clean'],
    }));
    const dangerous = securityResults.filter(s => s.riskLevel === 'danger');
    blocks.push(`<TOKEN_SECURITY scanned="${securityResults.length}" dangerous="${dangerous.length}">\n${JSON.stringify(secData)}\nIMPORTANT: If any token has risk=danger or honeypot=true, Bobby MUST refuse to recommend it. Say: "Security scan flagged [symbol] as [risk]. I won't touch this."\n</TOKEN_SECURITY>`);
  }

  // Gemini+Codex: inject BASE_CONVICTION as anchor for LLM
  // This is the deterministic score from backend math — LLM can adjust +/- 0.15 max
  if (performance.dynamicConviction != null) {
    blocks.push(`<BASE_CONVICTION>${performance.dynamicConviction.toFixed(2)}</BASE_CONVICTION>`);
  }

  return blocks.join('\n\n');
}
