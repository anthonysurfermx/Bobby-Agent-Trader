// ============================================================
// GET /api/chat-analyze?query=bitcoin&amount=1000&risk=medium
// Combined analysis: discover markets + scan holders + VPIN + probability
// Returns ranked opportunities with edge calculations
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GAMMA_URL = 'https://gamma-api.polymarket.com';
const DATA_URL = 'https://data-api.polymarket.com';

const MAX_MARKETS = 5;
const MAX_HOLDERS = 10;

// --- Types ---

interface MarketInfo {
  question: string;
  conditionId: string;
  slug: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  endDate: string;
}

interface AnalysisResult {
  agentRate: number;
  smartMoneyDirection: 'Yes' | 'No' | 'Divided' | 'No Signal';
  smartMoneyPct: number;
  botCount: number;
  totalScanned: number;
  dominantStrategy: string;
  redFlags: string[];
  vpinScore: number | null;
  vpinClassification: string | null;
}

interface ProbabilityResult {
  winProbability: number;
  recommendedSide: 'Yes' | 'No' | null;
  confidence: 'high' | 'medium' | 'low';
  edge: number;
  kellyFraction: number;
  smartMoneySize: number;
  breakdown: {
    marketImplied: number;
    agentAdjustment: number;
    vpinAdjustment: number;
    redFlagPenalty: number;
    marketImpact: number;
  };
}

interface OpportunityResult {
  market: MarketInfo;
  analysis: AnalysisResult;
  probability: ProbabilityResult;
}

// --- Math utilities (from scan-traders.ts) ---

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

async function fetchJSON(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// --- Lightweight bot detection (subset of scan-traders for speed) ---

interface HolderDetection {
  address: string;
  side: 'Yes' | 'No';
  positionSize: number;
  botScore: number;
  classification: 'bot' | 'likely-bot' | 'mixed' | 'human';
  strategy: string;
}

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

async function detectHolder(address: string, side: 'Yes' | 'No', positionSize: number): Promise<HolderDetection> {
  const [tradesData, mergeData] = await Promise.all([
    fetchJSON(`${DATA_URL}/trades?user=${address}&limit=300`),
    fetchJSON(`${DATA_URL}/activity?user=${address}&type=MERGE&limit=200`),
  ]);

  const trades: any[] = Array.isArray(tradesData) ? tradesData : [];
  const merges: any[] = Array.isArray(mergeData) ? mergeData : [];

  if (trades.length < 5) {
    // Ghost whale check
    if (positionSize > 10000) {
      return { address, side, positionSize, botScore: 85, classification: 'bot', strategy: 'UNCLASSIFIED' };
    }
    return { address, side, positionSize, botScore: 20, classification: 'human', strategy: 'UNCLASSIFIED' };
  }

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
    if (activeHours >= 22) s4 = 90;
    else if (activeHours >= 16) s4 = 30 + (activeHours - 16) / 6 * 60;
    else s4 = Math.max(0, (activeHours / 16) * 20);
  }

  // S5: Win Rate (simplified — use trade PnL approximation)
  let s5 = 0;

  // S6: Market Concentration
  let s6 = 0;
  if (trades.length > 10) {
    const slugs = new Map<string, number>();
    for (const t of trades) {
      const slug = (t.slug || '').split('-').slice(0, 3).join('-');
      slugs.set(slug, (slugs.get(slug) || 0) + 1);
    }
    const topSlug = Math.max(...slugs.values());
    const concentration = topSlug / trades.length;
    if (concentration > 0.8) s6 = 70 + (concentration - 0.8) / 0.2 * 30;
    else if (concentration > 0.5) s6 = 30 + (concentration - 0.5) / 0.3 * 40;
  }

  // S8: Maker/Taker
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
      const tradeSide = (t.side || '').toUpperCase();
      if ((tradeSide === 'BUY' && price >= takerBuyThreshold) || (tradeSide === 'SELL' && price <= takerSellThreshold)) {
        takerCount++;
      }
    }
    const takerRatio = takerCount / trades.length;
    if (takerRatio > 0.85) s8 = 90;
    else if (takerRatio > 0.70) s8 = 50 + (takerRatio - 0.70) / 0.15 * 40;
    else if (takerRatio > 0.50) s8 = 20 + (takerRatio - 0.50) / 0.20 * 30;
  }

  // S9: Fresh Wallet
  let s9 = 0;
  if (trades.length > 0 && trades.length < 500) {
    const earliest = trades[trades.length - 1];
    const earliestTs = parseFloat(earliest.timestamp || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const walletAgeDays = (nowSec - earliestTs) / 86400;
    const firstTradeUSD = Math.abs(parseFloat(earliest.size || 0) * parseFloat(earliest.price || 0));
    if (walletAgeDays < 7 && firstTradeUSD > 1000) s9 = 75;
    else if (walletAgeDays < 7 && firstTradeUSD > 500) s9 = 50;
  }

  // Both-sides bonus
  let bothSidesBonus = 0;
  // Skip full position fetch for speed — use merge ratio as proxy
  if (mergeCount > tradeCount * 0.2) bothSidesBonus = 15;
  else if (mergeCount > tradeCount * 0.1) bothSidesBonus = 8;

  const rawScore = s1 * WEIGHTS.intervalRegularity + s2 * WEIGHTS.splitMergeRatio + s3 * WEIGHTS.sizingConsistency +
    s4 * WEIGHTS.activity24h + s5 * WEIGHTS.winRateExtreme + s6 * WEIGHTS.marketConcentration +
    s8 * WEIGHTS.makerTakerRatio + s9 * WEIGHTS.freshWalletScore;

  const botScore = Math.min(100, Math.round(rawScore + bothSidesBonus));
  const classification = botScore >= 80 ? 'bot' : botScore >= 60 ? 'likely-bot' : botScore >= 40 ? 'mixed' : 'human';

  // Simplified strategy classification
  let strategy = 'UNCLASSIFIED';
  if (mergeCount > tradeCount * 0.15 && bothSidesBonus >= 15) strategy = 'MARKET_MAKER';
  else if (s8 > 60 && s1 > 50) strategy = 'SNIPER';
  else if (s1 > 70) strategy = 'MOMENTUM';

  return { address, side, positionSize, botScore, classification, strategy };
}

// --- VPIN calculation (inline, from vpin.ts) ---

function calculateVPIN(trades: any[]): { vpin: number; classification: string } | null {
  if (trades.length < 50) return null;

  const totalVolume = trades.reduce((sum: number, t: any) => sum + Math.abs(t.size * t.price), 0);
  if (totalVolume <= 0) return null;

  const numBuckets = Math.min(50, Math.floor(trades.length / 3));
  if (numBuckets < 5) return null;

  const bucketVolume = totalVolume / numBuckets;
  let buyVol = 0, sellVol = 0, currentVol = 0;
  const imbalances: number[] = [];

  for (const t of trades) {
    const vol = Math.abs(t.size * t.price);
    if ((t.side || '').toUpperCase() === 'BUY') buyVol += vol;
    else sellVol += vol;
    currentVol += vol;

    if (currentVol >= bucketVolume) {
      imbalances.push(Math.abs(buyVol - sellVol) / currentVol);
      buyVol = 0; sellVol = 0; currentVol = 0;
    }
  }

  if (imbalances.length < 3) return null;
  const vpin = imbalances.reduce((s, v) => s + v, 0) / imbalances.length;
  const classification = vpin > 0.75 ? 'extreme' : vpin > 0.60 ? 'high' : vpin > 0.40 ? 'moderate' : 'low';
  return { vpin: Math.round(vpin * 1000) / 1000, classification };
}

// --- Win Probability (inline, from probability.ts) ---

function calcProbability(
  marketImplied: number, smartMoneyDirection: string, smartMoneyPct: number,
  evaluatingSide: string, agentRate: number, redFlagCount: number,
  vpinScore: number | null, betAmountUSD: number, marketVolumeUSD: number,
): ProbabilityResult {
  let agentAdjustment = 0;
  if (smartMoneyDirection === evaluatingSide && smartMoneyPct > 50) {
    agentAdjustment = Math.min(10, ((smartMoneyPct - 50) / 50) * 10);
  } else if (smartMoneyDirection !== 'Divided' && smartMoneyDirection !== 'No Signal' && smartMoneyDirection !== evaluatingSide) {
    agentAdjustment = -Math.min(10, ((smartMoneyPct - 50) / 50) * 10);
  }

  let redFlagPenalty = 0;
  if (agentRate >= 60) redFlagPenalty = -10;
  else if (agentRate >= 40) redFlagPenalty = -5;
  if (redFlagCount >= 3) redFlagPenalty -= 5;
  redFlagPenalty = Math.max(-15, redFlagPenalty);

  let vpinAdjustment = 0;
  if (vpinScore !== null && vpinScore > 0.5) {
    const strength = (vpinScore - 0.5) / 0.5;
    if (smartMoneyDirection === evaluatingSide) vpinAdjustment = Math.min(8, strength * 8);
    else if (smartMoneyDirection !== 'Divided' && smartMoneyDirection !== 'No Signal') vpinAdjustment = -Math.min(8, strength * 8);
  }
  vpinAdjustment = Math.round(vpinAdjustment * 10) / 10;

  let marketImpact = 0;
  if (marketVolumeUSD > 0 && betAmountUSD > 0) {
    const sizeRatio = betAmountUSD / marketVolumeUSD;
    if (sizeRatio >= 0.50) marketImpact = -20;
    else if (sizeRatio >= 0.25) marketImpact = -10 - ((sizeRatio - 0.25) / 0.25) * 10;
    else if (sizeRatio >= 0.05) marketImpact = -2 - ((sizeRatio - 0.05) / 0.20) * 8;
    marketImpact = Math.round(marketImpact * 10) / 10;
  }

  const winProbability = Math.max(5, Math.min(95,
    Math.round(marketImplied + agentAdjustment + vpinAdjustment + redFlagPenalty + marketImpact)
  ));

  const marketPrice = marketImplied / 100;
  const ourProbability = winProbability / 100;
  const edge = marketPrice > 0 ? (ourProbability - marketPrice) / marketPrice : 0;

  const b = marketPrice > 0 ? (1 / marketPrice) - 1 : 0;
  const kellyRaw = b > 0 ? (b * ourProbability - (1 - ourProbability)) / b : 0;
  const kellyFraction = Math.max(0, Math.min(0.25, kellyRaw * 0.5));

  const smartMoneySize = betAmountUSD > 0
    ? Math.max(1, Math.round(kellyFraction * betAmountUSD))
    : Math.max(0.01, Math.round(kellyFraction * 100) / 100);

  let confidence: 'high' | 'medium' | 'low';
  if (edge > 0.1 && redFlagCount === 0 && marketImpact > -5) confidence = 'high';
  else if (edge > 0 && marketImpact > -10) confidence = 'medium';
  else confidence = 'low';

  return {
    winProbability,
    recommendedSide: edge > 0 ? evaluatingSide as 'Yes' | 'No' : null,
    confidence,
    edge: Math.round(edge * 1000) / 1000,
    kellyFraction: Math.round(kellyFraction * 1000) / 1000,
    smartMoneySize,
    breakdown: {
      marketImplied: Math.round(marketImplied),
      agentAdjustment: Math.round(agentAdjustment * 10) / 10,
      vpinAdjustment,
      redFlagPenalty: Math.round(redFlagPenalty * 10) / 10,
      marketImpact,
    },
  };
}

// --- Market discovery ---

function parseOutcomePrices(raw: string | string[]): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [0, 0];
  } catch {
    return [0, 0];
  }
}

async function discoverMarkets(query: string): Promise<MarketInfo[]> {
  // Search Gamma API
  const url = `${GAMMA_URL}/markets?active=true&closed=false&limit=50&order=volume24hr&ascending=false`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const allMarkets: any[] = await res.json();

  const now = Date.now();
  const q = query.toLowerCase();
  const isTrending = q === 'trending' || q === 'tendencias' || q === 'top';

  // For trending queries, return top markets by volume (no keyword filter)
  if (isTrending) {
    const activeMarkets = allMarkets.filter((m: any) => new Date(m.endDate).getTime() > now);
    activeMarkets.sort((a: any, b: any) => (parseFloat(b.volume24hr) || parseFloat(b.volume) || 0) - (parseFloat(a.volume24hr) || parseFloat(a.volume) || 0));
    return activeMarkets.slice(0, MAX_MARKETS).map((m: any) => {
      const prices = parseOutcomePrices(m.outcomePrices);
      return {
        question: m.question || m.slug,
        conditionId: m.conditionId || '',
        slug: m.slug || '',
        yesPrice: prices[0] || 0,
        noPrice: prices[1] || 0,
        volume: parseFloat(m.volume) || 0,
        endDate: m.endDate || '',
      };
    });
  }

  // Known asset aliases
  const assetAliases: Record<string, string[]> = {
    bitcoin: ['btc', 'bitcoin'],
    ethereum: ['eth', 'ethereum'],
    solana: ['sol', 'solana'],
    xrp: ['xrp', 'ripple'],
    dogecoin: ['doge', 'dogecoin'],
  };

  // Expand query with aliases
  const searchTerms = [q];
  for (const [, aliases] of Object.entries(assetAliases)) {
    if (aliases.some(a => q.includes(a))) {
      searchTerms.push(...aliases);
    }
  }

  const matches = allMarkets.filter((m: any) => {
    if (new Date(m.endDate).getTime() <= now) return false;
    const slug = (m.slug || '').toLowerCase();
    const question = (m.question || '').toLowerCase();
    return searchTerms.some(t => slug.includes(t) || question.includes(t));
  });

  // Sort by volume desc, take top N
  matches.sort((a: any, b: any) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));

  return matches.slice(0, MAX_MARKETS).map((m: any) => {
    const prices = parseOutcomePrices(m.outcomePrices);
    return {
      question: m.question || m.slug,
      conditionId: m.conditionId || '',
      slug: m.slug || '',
      yesPrice: prices[0] || 0,
      noPrice: prices[1] || 0,
      volume: parseFloat(m.volume) || 0,
      endDate: m.endDate || '',
    };
  });
}

// --- Holders fetch for a specific market ---

async function getMarketHolders(conditionId: string): Promise<{ address: string; side: 'Yes' | 'No'; amount: number }[]> {
  const url = `${DATA_URL}/positions?market=${conditionId}&sizeThreshold=100&limit=${MAX_HOLDERS}&sortBy=SIZE&sortOrder=DESC`;
  const data = await fetchJSON(url);
  if (!Array.isArray(data)) return [];

  return data.map((p: any) => ({
    address: p.proxyWallet || p.asset || '',
    side: ((p.outcome || '').toLowerCase() === 'yes' ? 'Yes' : 'No') as 'Yes' | 'No',
    amount: parseFloat(p.currentValue) || parseFloat(p.size) || 0,
  })).filter((h: any) => h.address && h.amount > 0);
}

// --- Analyze a single market ---

async function analyzeMarket(market: MarketInfo, betAmountUSD: number): Promise<OpportunityResult> {
  // 1. Scan holders
  const holders = await getMarketHolders(market.conditionId);
  const detections: HolderDetection[] = [];

  // Run in batches of 3 for speed
  for (let i = 0; i < holders.length; i += 3) {
    const batch = holders.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(h => detectHolder(h.address, h.side, h.amount))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') detections.push(r.value);
    }
  }

  // 2. Compute analysis
  const totalScanned = detections.length;
  const bots = detections.filter(d => d.classification === 'bot' || d.classification === 'likely-bot');
  const agentRate = totalScanned > 0 ? Math.round((bots.length / totalScanned) * 100) : 0;

  // Smart money direction
  const yesAgentCap = bots.filter(b => b.side === 'Yes').reduce((s, b) => s + b.positionSize, 0);
  const noAgentCap = bots.filter(b => b.side === 'No').reduce((s, b) => s + b.positionSize, 0);
  const totalAgentCap = yesAgentCap + noAgentCap;

  let smartMoneyDirection: 'Yes' | 'No' | 'Divided' | 'No Signal' = 'No Signal';
  let smartMoneyPct = 0;
  if (totalAgentCap > 0) {
    if (yesAgentCap > noAgentCap * 1.5) {
      smartMoneyDirection = 'Yes';
      smartMoneyPct = Math.round((yesAgentCap / totalAgentCap) * 100);
    } else if (noAgentCap > yesAgentCap * 1.5) {
      smartMoneyDirection = 'No';
      smartMoneyPct = Math.round((noAgentCap / totalAgentCap) * 100);
    } else {
      smartMoneyDirection = 'Divided';
      smartMoneyPct = Math.round((Math.max(yesAgentCap, noAgentCap) / totalAgentCap) * 100);
    }
  }

  // Dominant strategy
  const strategyCounts: Record<string, number> = {};
  for (const b of bots) {
    strategyCounts[b.strategy] = (strategyCounts[b.strategy] || 0) + 1;
  }
  const dominantStrategy = Object.entries(strategyCounts)
    .filter(([k]) => k !== 'UNCLASSIFIED')
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

  // Red flags
  const redFlags: string[] = [];
  if (agentRate >= 60) redFlags.push(`High bot concentration: ${agentRate}%`);
  if (smartMoneyDirection === 'Divided') redFlags.push('Smart money divided');
  if (bots.filter(b => b.strategy === 'SNIPER').length >= 2) redFlags.push('Multiple snipers detected');

  // 3. VPIN
  let vpinData: { vpin: number; classification: string } | null = null;
  try {
    const tradesRes = await fetch(`${DATA_URL}/trades?market=${market.conditionId}&limit=500`);
    if (tradesRes.ok) {
      const rawTrades = await tradesRes.json();
      if (Array.isArray(rawTrades) && rawTrades.length >= 50) {
        const vpinTrades = rawTrades.map((t: any) => ({
          price: parseFloat(t.price) || 0,
          size: parseFloat(t.size) || 0,
          side: (t.side || 'BUY').toUpperCase(),
        }));
        vpinData = calculateVPIN(vpinTrades);
      }
    }
  } catch { /* VPIN is supplementary */ }

  if (vpinData && vpinData.vpin > 0.60) {
    redFlags.push(`Elevated VPIN (${Math.round(vpinData.vpin * 100)}%)`);
  }

  // 4. Determine evaluating side
  let evaluatingSide: 'Yes' | 'No';
  if (smartMoneyDirection === 'Yes') evaluatingSide = 'Yes';
  else if (smartMoneyDirection === 'No') evaluatingSide = 'No';
  else evaluatingSide = market.yesPrice >= market.noPrice ? 'Yes' : 'No';

  const marketImplied = (evaluatingSide === 'Yes' ? market.yesPrice : market.noPrice) * 100;

  // 5. Calculate probability
  const probability = calcProbability(
    marketImplied, smartMoneyDirection, smartMoneyPct,
    evaluatingSide, agentRate, redFlags.length,
    vpinData?.vpin ?? null, betAmountUSD, market.volume,
  );

  return {
    market,
    analysis: {
      agentRate,
      smartMoneyDirection,
      smartMoneyPct,
      botCount: bots.length,
      totalScanned,
      dominantStrategy,
      redFlags,
      vpinScore: vpinData?.vpin ?? null,
      vpinClassification: vpinData?.classification ?? null,
    },
    probability,
  };
}

// --- Risk filter ---

function filterByRisk(opportunities: OpportunityResult[], risk: string): OpportunityResult[] {
  switch (risk) {
    case 'low':
      return opportunities.filter(o =>
        o.probability.confidence === 'high' && o.probability.edge > 0.05 && o.analysis.redFlags.length < 2
      );
    case 'high':
      return opportunities.filter(o => o.probability.edge > -0.05);
    case 'medium':
    default:
      return opportunities.filter(o =>
        (o.probability.confidence === 'high' || o.probability.confidence === 'medium') && o.probability.edge > 0
      );
  }
}

// --- Handler ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = (req.query.query as string) || '';
  const amount = parseFloat(req.query.amount as string) || 1000;
  const risk = (req.query.risk as string) || 'medium';

  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  const startTime = Date.now();

  try {
    // 1. Discover markets
    const markets = await discoverMarkets(query);
    if (markets.length === 0) {
      return res.status(200).json({
        ok: true,
        opportunities: [],
        query,
        scanTime: Date.now() - startTime,
        message: `No active markets found for "${query}". Try: bitcoin, trump, nba, ethereum, etc.`,
      });
    }

    // 2. Analyze each market (in parallel, limited)
    const analysisResults = await Promise.allSettled(
      markets.map(m => analyzeMarket(m, amount))
    );

    let opportunities: OpportunityResult[] = [];
    for (const r of analysisResults) {
      if (r.status === 'fulfilled') opportunities.push(r.value);
    }

    // 3. Filter by risk
    const filtered = filterByRisk(opportunities, risk);

    // If filter removed everything, show all with a note
    const finalResults = filtered.length > 0 ? filtered : opportunities;

    // 4. Sort by edge descending
    finalResults.sort((a, b) => b.probability.edge - a.probability.edge);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15');
    return res.status(200).json({
      ok: true,
      opportunities: finalResults,
      query,
      risk,
      amount,
      scanTime: Date.now() - startTime,
      marketsFound: markets.length,
      filtered: filtered.length > 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ChatAnalyze] ERROR', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
