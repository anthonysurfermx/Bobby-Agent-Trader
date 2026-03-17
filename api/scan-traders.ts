// ============================================================
// GET /api/scan-traders?count=50&offset=0
// Escanea N traders del leaderboard Polymarket con bot detection
// Server-side port de polymarket-detector.ts (sin UI callbacks)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const DATA_URL = 'https://data-api.polymarket.com';
const BATCH_SIZE = 5;

// --- Tipos ---

interface ScanResult {
  address: string;
  userName: string;
  rank: number;
  pnl: number;
  volume: number;
  botScore: number;
  classification: 'bot' | 'likely-bot' | 'mixed' | 'human';
  strategy: {
    type: string;
    directionalBias: number;
    label: string;
    confidence: number;
  };
}

// --- Utilidades matemáticas (port directo de polymarket-detector.ts) ---

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 1;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function scoreFromCV(cv: number, inverted: boolean): number {
  if (inverted) {
    if (cv < 0.3) return 90 + (0.3 - cv) / 0.3 * 10;
    if (cv < 0.7) return 40 + (0.7 - cv) / 0.4 * 50;
    return Math.max(0, 20 - (cv - 0.7) * 20);
  }
  return cv < 0.3 ? 90 : cv < 0.7 ? 50 : 10;
}

function isBimodal(prices: number[]): boolean {
  if (prices.length < 20) return false;
  const BINS = 20;
  const histogram = new Array(BINS).fill(0);
  for (const p of prices) {
    histogram[Math.floor(Math.max(0, Math.min(0.9999, p)) * BINS)]++;
  }
  const minPeak = prices.length * 0.15;
  const peaks: number[] = [];
  for (let i = 0; i < BINS; i++) {
    if (histogram[i] < minPeak) continue;
    const left = i === 0 ? 0 : histogram[i - 1];
    const right = i === BINS - 1 ? 0 : histogram[i + 1];
    if (histogram[i] > left && (i === BINS - 1 || histogram[i] > right)) peaks.push(i);
  }
  if (peaks.length < 2) return false;
  for (let i = 0; i < peaks.length - 1; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      if (Math.abs(peaks[j] - peaks[i]) >= 2) return true;
    }
  }
  return false;
}

function computeAvgROI(positions: any[]): number {
  const resolved = positions.filter((p: any) => {
    const pnl = parseFloat(p.cashPnl || 0);
    const avg = parseFloat(p.avgPrice || 0);
    return pnl !== 0 && avg > 0;
  });
  if (resolved.length === 0) return 0;
  let totalROI = 0;
  for (const p of resolved) {
    const cost = parseFloat(p.avgPrice);
    const pnl = parseFloat(p.cashPnl);
    const size = parseFloat(p.size) || 1;
    totalROI += pnl / (cost * size);
  }
  return totalROI / resolved.length;
}

function computeDirectionalBias(positions: any[]): number {
  if (positions.length === 0) return 0;
  const yesCount = positions.filter((p: any) => (p.outcome || '').toLowerCase() === 'yes').length;
  const noCount = positions.length - yesCount;
  return Math.round((Math.max(yesCount, noCount) / positions.length) * 100);
}

// --- Clasificación de estrategia ---

const WEIGHTS = {
  intervalRegularity: 0.18,
  splitMergeRatio: 0.22,
  sizingConsistency: 0.13,
  activity24h: 0.13,
  winRateExtreme: 0.12,
  marketConcentration: 0.08,
  makerTakerRatio: 0.10,
  freshWalletScore: 0.04,
};

function classifyStrategy(
  trades: any[], positions: any[], mergeCount: number,
  bothSidesPercent: number, intervalRegularity: number, sizeCV: number,
) {
  const entryPrices = trades.map((t: any) => parseFloat(t.price)).filter((p: number) => !isNaN(p) && p > 0 && p < 1);
  const bimodal = isBimodal(entryPrices);
  const avgROI = computeAvgROI(positions);
  const directionalBias = computeDirectionalBias(positions);
  const tradeCount = trades.length;
  const mergeRatio = tradeCount > 0 ? (mergeCount / (tradeCount + mergeCount)) * 100 : 0;

  const base = { avgROI: Math.round(avgROI * 100), sizeCV: Math.round(sizeCV * 100) / 100, bimodal, directionalBias };

  if (tradeCount < 10 && positions.length < 5) {
    return { type: 'UNCLASSIFIED', label: 'Insufficient Data', confidence: 0, ...base };
  }
  if (bothSidesPercent >= 45 && mergeRatio >= 15 && sizeCV < 0.8) {
    const conf = Math.min(95, Math.round((bothSidesPercent / 100) * 40 + (mergeRatio / 50) * 30 + (1 - Math.min(sizeCV, 1)) * 30));
    return { type: 'MARKET_MAKER', label: 'The House', confidence: conf, ...base };
  }
  if (bimodal && bothSidesPercent >= 15 && mergeRatio >= 5) {
    const conf = Math.min(90, Math.round(40 + (bothSidesPercent > 30 ? 20 : 10) + (mergeRatio > 15 ? 20 : 10) + (bimodal ? 10 : 0)));
    return { type: 'HYBRID', label: 'Spread + Alpha', confidence: conf, ...base };
  }
  if (bothSidesPercent <= 10 && avgROI > 0.3 && directionalBias >= 70) {
    const conf = Math.min(90, Math.round((directionalBias / 100) * 30 + Math.min(avgROI * 40, 40) + (bothSidesPercent < 5 ? 20 : 10)));
    return { type: 'SNIPER', label: 'Latency Arb', confidence: conf, ...base };
  }
  if (bothSidesPercent <= 15 && intervalRegularity >= 70 && directionalBias >= 80) {
    const conf = Math.min(85, Math.round((intervalRegularity / 100) * 40 + (directionalBias / 100) * 30 + 20));
    return { type: 'MOMENTUM', label: 'Trend Rider', confidence: conf, ...base };
  }
  if (bothSidesPercent <= 15 && avgROI > 0.15 && directionalBias >= 65) {
    return { type: 'SNIPER', label: 'Latency Arb', confidence: 45, ...base };
  }
  if (bothSidesPercent >= 35 && sizeCV < 1.0) {
    return { type: 'MARKET_MAKER', label: 'The House', confidence: 40, ...base };
  }
  return { type: 'UNCLASSIFIED', label: 'Mixed Strategy', confidence: 20, ...base };
}

// --- Bot Detection (server-side, sin UI callbacks) ---

async function detectBotServer(address: string) {
  const [tradesData, mergeData, positionsData] = await Promise.all([
    fetchJSON(`${DATA_URL}/trades?user=${address}&limit=500`),
    fetchJSON(`${DATA_URL}/activity?user=${address}&type=MERGE&limit=500`),
    fetchJSON(`${DATA_URL}/positions?user=${address}&limit=200`),
  ]);

  const trades: any[] = Array.isArray(tradesData) ? tradesData : [];
  const merges: any[] = Array.isArray(mergeData) ? mergeData : [];
  const positions: any[] = Array.isArray(positionsData) ? positionsData : [];

  // S1: Interval Regularity
  let s1 = 0;
  if (trades.length > 10) {
    const intervals: number[] = [];
    for (let i = 0; i < trades.length - 1; i++) {
      const diff = Math.abs(trades[i].timestamp - trades[i + 1].timestamp);
      if (diff > 0 && diff < 86400) intervals.push(diff);
    }
    if (intervals.length > 5) {
      const cv = coefficientOfVariation(intervals);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      s1 = avgInterval < 30 ? 85 + Math.min(15, (30 - avgInterval) / 30 * 15) : scoreFromCV(cv, true);
    }
  }

  // S2: Split/Merge
  let s2 = 0;
  const mergeCount = merges.length;
  const tradeCount = trades.length;
  if (tradeCount > 0) {
    const ratio = mergeCount / (tradeCount + mergeCount);
    if (ratio > 0.3) s2 = 90 + Math.min(10, (ratio - 0.3) * 30);
    else if (ratio > 0.1) s2 = 40 + (ratio - 0.1) / 0.2 * 50;
    else if (mergeCount > 0) s2 = 10 + mergeCount * 2;
  }

  // Both-sides detection
  let bothSidesPercent = 0;
  if (positions.length > 0) {
    const conditionMap = new Map<string, Set<string>>();
    for (const p of positions) {
      const cid = p.conditionId || '';
      if (!conditionMap.has(cid)) conditionMap.set(cid, new Set());
      conditionMap.get(cid)!.add(p.outcome || '');
    }
    const totalConditions = conditionMap.size;
    const bothSides = Array.from(conditionMap.values()).filter(s => s.size > 1).length;
    bothSidesPercent = totalConditions > 0 ? (bothSides / totalConditions) * 100 : 0;
  }
  const bothSidesBonus = bothSidesPercent > 50 ? 20 : bothSidesPercent > 30 ? 15 : bothSidesPercent > 10 ? 8 : 0;

  // S3: Sizing Consistency
  let s3 = 0;
  if (trades.length > 10) {
    const usdSizes = trades.map((t: any) => parseFloat(t.size) * parseFloat(t.price));
    s3 = scoreFromCV(coefficientOfVariation(usdSizes), true);
  }

  // S4: 24/7 Activity
  let s4 = 0;
  if (trades.length > 20) {
    const hourBuckets = new Set<number>();
    for (const t of trades) hourBuckets.add(new Date(t.timestamp * 1000).getUTCHours());
    const activeHours = hourBuckets.size;
    if (activeHours >= 22) s4 = 90 + (activeHours - 22) * 5;
    else if (activeHours >= 16) s4 = 30 + (activeHours - 16) / 6 * 60;
    else s4 = Math.max(0, (activeHours / 16) * 20);
  }

  // S5: Win Rate
  let s5 = 0;
  if (positions.length > 5) {
    const winners = positions.filter((p: any) => parseFloat(p.cashPnl || 0) > 0).length;
    const losers = positions.filter((p: any) => parseFloat(p.cashPnl || 0) < 0).length;
    const total = winners + losers;
    if (total > 0) {
      const winRate = winners / total;
      if (winRate > 0.85) s5 = 80 + (winRate - 0.85) / 0.15 * 20;
      else if (winRate > 0.65) s5 = 30 + (winRate - 0.65) / 0.2 * 50;
      else s5 = 10;
    }
  }

  // S6: Market Concentration
  let s6 = 0;
  if (trades.length > 10) {
    const categories = new Map<string, number>();
    for (const t of trades) {
      const slug = (t.slug || '').toLowerCase();
      let cat = 'other';
      if (slug.includes('up-or-down') || slug.includes('15-minute') || slug.includes('btc') || slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('eth') || slug.includes('solana') || slug.includes('sol')) cat = 'crypto-shortterm';
      else if (slug.includes('nba') || slug.includes('nfl') || slug.includes('epl') || slug.includes('mlb') || slug.includes('soccer') || slug.includes('football')) cat = 'sports';
      else if (slug.includes('trump') || slug.includes('biden') || slug.includes('election') || slug.includes('president')) cat = 'politics';
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }
    const topCategory = Math.max(...categories.values());
    const concentration = topCategory / trades.length;
    if (concentration > 0.8) s6 = 70 + (concentration - 0.8) / 0.2 * 30;
    else if (concentration > 0.5) s6 = 30 + (concentration - 0.5) / 0.3 * 40;
    else s6 = Math.max(0, concentration * 40);
  }

  // S7: Ghost Whale
  let s7 = 0;
  if (trades.length <= 5 && positions.length > 0) {
    const totalValue = positions.reduce((acc: number, p: any) => acc + (parseFloat(p.currentValue) || 0), 0);
    if (totalValue > 50000) s7 = 95;
    else if (totalValue > 10000) s7 = 80;
    else if (totalValue > 1000) s7 = 60;
    else s7 = 30;
  }

  // S8: Maker/Taker Ratio (adapts to market price level using median)
  let s8 = 0;
  if (trades.length > 15) {
    const tradePrices = trades.map((t: any) => parseFloat(t.price)).filter((p: number) => !isNaN(p));
    const sortedPrices = [...tradePrices].sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0.5;
    const takerBuyThreshold = Math.min(0.95, medianPrice + 0.05);
    const takerSellThreshold = Math.max(0.05, medianPrice - 0.05);
    let takerCount = 0;
    for (const t of trades) {
      const price = parseFloat(t.price);
      const side = (t.side || '').toUpperCase();
      if ((side === 'BUY' && price >= takerBuyThreshold) || (side === 'SELL' && price <= takerSellThreshold)) {
        takerCount++;
      }
    }
    const takerRatio = takerCount / trades.length;
    if (takerRatio > 0.85) s8 = 90;
    else if (takerRatio > 0.70) s8 = 50 + (takerRatio - 0.70) / 0.15 * 40;
    else if (takerRatio > 0.50) s8 = 20 + (takerRatio - 0.50) / 0.20 * 30;
  }

  // S9: Fresh Wallet Detection
  let s9 = 0;
  if (trades.length > 0 && trades.length < 500) {
    const earliest = trades[trades.length - 1];
    const earliestTs = parseFloat(earliest.timestamp || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const walletAgeDays = (nowSec - earliestTs) / 86400;
    const firstTradeUSD = Math.abs(parseFloat(earliest.size || 0) * parseFloat(earliest.price || 0));
    if (walletAgeDays < 7) {
      if (firstTradeUSD > 5000) s9 = 95;
      else if (firstTradeUSD > 1000) s9 = 75;
      else if (firstTradeUSD > 500) s9 = 50;
      else s9 = 20;
    } else if (walletAgeDays < 30) {
      if (firstTradeUSD > 5000) s9 = 60;
      else if (firstTradeUSD > 1000) s9 = 30;
    }
  }

  // sizeCV for strategy
  let sizeCV = 1;
  if (trades.length > 10) {
    const usdSizes = trades.map((t: any) => parseFloat(t.size) * parseFloat(t.price)).filter((v: number) => !isNaN(v));
    sizeCV = coefficientOfVariation(usdSizes);
  }

  // Final score
  let rawScore: number;
  if (s7 > 0 && trades.length <= 5) {
    rawScore = s7 * 0.50 + s5 * 0.20 + s2 * 0.15 + bothSidesPercent * 0.15;
  } else {
    rawScore = s1 * WEIGHTS.intervalRegularity + s2 * WEIGHTS.splitMergeRatio + s3 * WEIGHTS.sizingConsistency + s4 * WEIGHTS.activity24h + s5 * WEIGHTS.winRateExtreme + s6 * WEIGHTS.marketConcentration + s8 * WEIGHTS.makerTakerRatio + s9 * WEIGHTS.freshWalletScore;
  }

  const botScore = Math.min(100, Math.round(rawScore + bothSidesBonus));
  const classification = botScore >= 80 ? 'bot' : botScore >= 60 ? 'likely-bot' : botScore >= 40 ? 'mixed' : 'human';

  const strategy = classifyStrategy(trades, positions, mergeCount, bothSidesPercent, s1, sizeCV);

  return { botScore, classification, strategy };
}

// --- Handler ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const count = Math.min(parseInt(req.query.count as string) || 50, 50);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    // 1. Fetch leaderboard page
    const lbUrl = `${DATA_URL}/v1/leaderboard?limit=${count}&offset=${offset}`;
    const lbRes = await fetch(lbUrl);
    if (!lbRes.ok) throw new Error(`Leaderboard: ${lbRes.status}`);
    const leaderboard: any[] = await lbRes.json();

    // 2. Run detectBot in batches
    const results: ScanResult[] = [];

    for (let i = 0; i < leaderboard.length; i += BATCH_SIZE) {
      const batch = leaderboard.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (trader: any) => {
          const detection = await detectBotServer(trader.proxyWallet);
          return {
            address: trader.proxyWallet,
            userName: trader.userName || trader.proxyWallet.slice(0, 8),
            rank: offset + (leaderboard.indexOf(trader) + 1),
            pnl: parseFloat(trader.pnl) || 0,
            volume: parseFloat(trader.volume) || 0,
            botScore: detection.botScore,
            classification: detection.classification,
            strategy: {
              type: detection.strategy.type,
              directionalBias: detection.strategy.directionalBias,
              label: detection.strategy.label,
              confidence: detection.strategy.confidence,
            },
          } as ScanResult;
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    return res.status(200).json({
      ok: true,
      results,
      meta: {
        offset,
        count: results.length,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ScanTraders] ERROR', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}

async function fetchJSON(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
