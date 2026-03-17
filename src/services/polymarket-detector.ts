const BASE_URL = '/api/polymarket-data';

export interface BotSignals {
  intervalRegularity: number;   // S1: 0-100
  splitMergeRatio: number;      // S2: 0-100
  sizingConsistency: number;    // S3: 0-100
  activity24h: number;          // S4: 0-100
  winRateExtreme: number;       // S5: 0-100
  marketConcentration: number;  // S6: 0-100
  ghostWhale: number;           // S7: 0-100 (no trades but large positions)
  bothSidesBonus: number;       // Bonus modifier
  makerTakerRatio: number;      // S8: 0-100 (high taker ratio = informed)
  freshWalletScore: number;     // S9: 0-100 (new wallet + big trade = insider)
}

export type StrategyType = 'MARKET_MAKER' | 'HYBRID' | 'SNIPER' | 'MOMENTUM' | 'UNCLASSIFIED';

export interface StrategyProfile {
  type: StrategyType;
  label: string;           // Human-readable name
  confidence: number;      // 0-100 how sure we are
  description: string;     // One-line explanation
  avgROI: number;          // Average ROI per resolved position
  sizeCV: number;          // Coefficient of variation of trade sizes
  bimodal: boolean;        // Whether entry price distribution is bimodal
  directionalBias: number; // 0-100, how one-sided the positions are
}

export interface BotDetectionResult {
  address: string;
  botScore: number;             // 0-100 final score
  signals: BotSignals;
  classification: 'bot' | 'likely-bot' | 'mixed' | 'human';
  strategy: StrategyProfile;
  tradeCount: number;
  mergeCount: number;
  activeHours: number;
  bothSidesPercent: number;
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

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 1;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function scoreFromCV(cv: number, inverted: boolean): number {
  // inverted=true means low CV = high score (regular = bot)
  if (inverted) {
    if (cv < 0.3) return 90 + (0.3 - cv) / 0.3 * 10;
    if (cv < 0.7) return 40 + (0.7 - cv) / 0.4 * 50;
    return Math.max(0, 20 - (cv - 0.7) * 20);
  }
  return cv < 0.3 ? 90 : cv < 0.7 ? 50 : 10;
}

export interface MarketContext {
  holderAmount?: number;       // this wallet's position size in the scanned market
  totalMarketVolume?: number;  // total market volume for relative sizing
}

export type SignalProgress = {
  phase: 'fetching' | 'analyzing';
  signal?: string;
  signals: Partial<BotSignals>;
  tradeCount?: number;
  mergeCount?: number;
};

// --- Strategy Classification Utilities ---

/**
 * Lightweight bimodality detector using histogram bins.
 * Divides price range [0, 1] into 20 bins (0.05 each).
 * Returns true if two non-adjacent bins each hold >15% of trades.
 * O(N) single pass, zero dependencies.
 */
function isBimodal(
  prices: number[],
  minPeakVolumePct = 0.15,
  minBinSeparation = 2,
): boolean {
  if (prices.length < 20) return false;

  const BINS = 20;
  const histogram = new Array(BINS).fill(0);

  for (let i = 0; i < prices.length; i++) {
    const binIndex = Math.floor(Math.max(0, Math.min(0.9999, prices[i])) * BINS);
    histogram[binIndex]++;
  }

  const minPeakThreshold = prices.length * minPeakVolumePct;
  const peaks: number[] = [];

  for (let i = 0; i < BINS; i++) {
    if (histogram[i] < minPeakThreshold) continue;
    const left = i === 0 ? 0 : histogram[i - 1];
    const right = i === BINS - 1 ? 0 : histogram[i + 1];
    if (histogram[i] > left && (i === BINS - 1 || histogram[i] > right)) {
      peaks.push(i);
    }
  }

  if (peaks.length < 2) return false;
  for (let i = 0; i < peaks.length - 1; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      if (Math.abs(peaks[j] - peaks[i]) >= minBinSeparation) return true;
    }
  }
  return false;
}

/**
 * Compute average ROI from resolved positions.
 * ROI = (payout - cost) / cost. For binary markets, payout is $1 for winners.
 * Uses avgPrice as entry cost. Only counts positions with nonzero PnL.
 */
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
    // ROI = profit / invested capital
    totalROI += pnl / (cost * size);
  }
  return totalROI / resolved.length;
}

/**
 * Compute directional bias: how one-sided is this wallet?
 * Returns 0-100 where 100 = all positions on one side (YES or NO).
 */
function computeDirectionalBias(positions: any[]): number {
  if (positions.length === 0) return 0;
  const yesCount = positions.filter((p: any) => (p.outcome || '').toLowerCase() === 'yes').length;
  const noCount = positions.length - yesCount;
  const dominant = Math.max(yesCount, noCount);
  return Math.round((dominant / positions.length) * 100);
}

/**
 * Classify wallet trading strategy based on behavioral signals.
 * Uses refined heuristics from whale research:
 *   - MARKET_MAKER: both sides + low size variance + high merge activity
 *   - HYBRID: bimodal entries + moderate both-sides + some merges
 *   - SNIPER: directional + high ROI + low both-sides
 *   - MOMENTUM: directional + regular intervals + high concentration
 */
function classifyStrategy(
  trades: any[],
  positions: any[],
  mergeCount: number,
  bothSidesPercent: number,
  intervalRegularity: number,
  sizeCV: number,
): StrategyProfile {
  const entryPrices = trades
    .map((t: any) => parseFloat(t.price))
    .filter((p: number) => !isNaN(p) && p > 0 && p < 1);

  const bimodal = isBimodal(entryPrices);
  const avgROI = computeAvgROI(positions);
  const directionalBias = computeDirectionalBias(positions);
  const tradeCount = trades.length;
  const mergeRatio = tradeCount > 0 ? (mergeCount / (tradeCount + mergeCount)) * 100 : 0;

  const base = { avgROI: Math.round(avgROI * 100), sizeCV: Math.round(sizeCV * 100) / 100, bimodal, directionalBias };

  // Not enough data to classify
  if (tradeCount < 10 && positions.length < 5) {
    return { type: 'UNCLASSIFIED', label: 'Insufficient Data', confidence: 0, description: 'Not enough trade history to classify strategy', ...base };
  }

  // 1. MARKET MAKER: both sides >= 45%, merge ratio >= 15%, consistent sizing
  if (bothSidesPercent >= 45 && mergeRatio >= 15 && sizeCV < 0.8) {
    const conf = Math.min(95,
      Math.round((bothSidesPercent / 100) * 40 + (mergeRatio / 50) * 30 + (1 - Math.min(sizeCV, 1)) * 30)
    );
    return { type: 'MARKET_MAKER', label: 'The House', confidence: conf, description: 'Provides liquidity on both sides, collects spread. Consistent sizing, high merge activity.', ...base };
  }

  // 2. HYBRID: bimodal entry prices + moderate both-sides + some merge activity
  if (bimodal && bothSidesPercent >= 15 && mergeRatio >= 5) {
    const conf = Math.min(90,
      Math.round(40 + (bothSidesPercent > 30 ? 20 : 10) + (mergeRatio > 15 ? 20 : 10) + (bimodal ? 10 : 0))
    );
    return { type: 'HYBRID', label: 'Spread + Alpha', confidence: conf, description: 'Market-making base with directional overlays when model detects mispricing.', ...base };
  }

  // 3. SNIPER: directional, high ROI, low both-sides
  if (bothSidesPercent <= 10 && avgROI > 0.3 && directionalBias >= 70) {
    const conf = Math.min(90,
      Math.round((directionalBias / 100) * 30 + Math.min(avgROI * 40, 40) + (bothSidesPercent < 5 ? 20 : 10))
    );
    return { type: 'SNIPER', label: 'Latency Arb', confidence: conf, description: 'Directional bets capturing oracle lag. High ROI per trade, reacts to spot price moves.', ...base };
  }

  // 4. MOMENTUM: directional, regular intervals, high market concentration
  if (bothSidesPercent <= 15 && intervalRegularity >= 70 && directionalBias >= 80) {
    const conf = Math.min(85,
      Math.round((intervalRegularity / 100) * 40 + (directionalBias / 100) * 30 + 20)
    );
    return { type: 'MOMENTUM', label: 'Trend Rider', confidence: conf, description: 'Scales into one direction with rhythmic intervals. Follows short-term momentum.', ...base };
  }

  // 5. Softer fallbacks: check partial matches

  // Near-SNIPER: directional + decent ROI but intervals might be irregular
  if (bothSidesPercent <= 15 && avgROI > 0.15 && directionalBias >= 65) {
    return { type: 'SNIPER', label: 'Latency Arb', confidence: 45, description: 'Likely directional trader exploiting price lag. Moderate confidence.', ...base };
  }

  // Near-MARKET_MAKER: both sides but less merge activity
  if (bothSidesPercent >= 35 && sizeCV < 1.0) {
    return { type: 'MARKET_MAKER', label: 'The House', confidence: 40, description: 'Shows market-making behavior with both-sides positions. Moderate confidence.', ...base };
  }

  return { type: 'UNCLASSIFIED', label: 'Mixed Strategy', confidence: 20, description: 'Trading pattern does not match known archetypes clearly.', ...base };
}

export async function detectBot(
  address: string,
  onProgress?: (p: SignalProgress) => void,
  marketCtx?: MarketContext,
): Promise<BotDetectionResult> {
  onProgress?.({ phase: 'fetching', signals: {} });

  const [tradesData, mergeData, positionsData] = await Promise.all([
    fetchJSON(`${BASE_URL}/trades?user=${address}&limit=500`),
    fetchJSON(`${BASE_URL}/activity?user=${address}&type=MERGE&limit=500`),
    fetchJSON(`${BASE_URL}/positions?user=${address}&limit=200`),
  ]);

  const trades: any[] = Array.isArray(tradesData) ? tradesData : [];
  const merges: any[] = Array.isArray(mergeData) ? mergeData : [];
  const positions: any[] = Array.isArray(positionsData) ? positionsData : [];

  const emitSignal = (name: string, signals: Partial<BotSignals>) => {
    onProgress?.({ phase: 'analyzing', signal: name, signals, tradeCount: trades.length, mergeCount: merges.length });
  };
  const tick = () => new Promise<void>(r => setTimeout(r, 80));

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
      // Bots with burst trading (like gabagool22) can have high CV but very short intervals
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 30) {
        // Sub-30s average = machine speed regardless of CV
        s1 = 85 + Math.min(15, (30 - avgInterval) / 30 * 15);
      } else {
        s1 = scoreFromCV(cv, true);
      }
    }
  }

  emitSignal('INTERVAL', { intervalRegularity: Math.round(s1) });
  await tick();

  // S2: SPLIT/MERGE Activity
  let s2 = 0;
  const mergeCount = merges.length;
  const tradeCount = trades.length;
  if (tradeCount > 0) {
    const ratio = mergeCount / (tradeCount + mergeCount);
    if (ratio > 0.3) s2 = 90 + Math.min(10, (ratio - 0.3) * 30);
    else if (ratio > 0.1) s2 = 40 + (ratio - 0.1) / 0.2 * 50;
    else if (mergeCount > 0) s2 = 10 + mergeCount * 2;
    else s2 = 0;
  }

  // Both-sides detection (bonus signal that amplifies S2)
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

  // Both-sides bonus: if >30% of positions are on both sides, boost S2
  const bothSidesBonus = bothSidesPercent > 50 ? 20 : bothSidesPercent > 30 ? 15 : bothSidesPercent > 10 ? 8 : 0;

  emitSignal('SPLIT/MERGE', { intervalRegularity: Math.round(s1), splitMergeRatio: Math.round(s2), bothSidesBonus: Math.round(bothSidesBonus) });
  await tick();

  // S3: Position Sizing Consistency
  let s3 = 0;
  if (trades.length > 10) {
    const usdSizes = trades.map((t: any) => parseFloat(t.size) * parseFloat(t.price));
    const cv = coefficientOfVariation(usdSizes);
    s3 = scoreFromCV(cv, true);
  }

  emitSignal('SIZING', { intervalRegularity: Math.round(s1), splitMergeRatio: Math.round(s2), sizingConsistency: Math.round(s3), bothSidesBonus: Math.round(bothSidesBonus) });
  await tick();

  // S4: 24/7 Activity
  let s4 = 0;
  let activeHours = 0;
  if (trades.length > 20) {
    // Need trades over multiple days to detect 24/7
    // Use activity endpoint with broader time range
    const hourBuckets = new Set<number>();
    for (const t of trades) {
      const hour = new Date(t.timestamp * 1000).getUTCHours();
      hourBuckets.add(hour);
    }
    activeHours = hourBuckets.size;

    if (activeHours >= 22) s4 = 90 + (activeHours - 22) * 5;
    else if (activeHours >= 16) s4 = 30 + (activeHours - 16) / 6 * 60;
    else s4 = Math.max(0, (activeHours / 16) * 20);
  }

  emitSignal('24/7', { intervalRegularity: Math.round(s1), splitMergeRatio: Math.round(s2), sizingConsistency: Math.round(s3), activity24h: Math.round(s4), bothSidesBonus: Math.round(bothSidesBonus) });
  await tick();

  // S5: Win Rate (from positions PnL)
  let s5 = 0;
  if (positions.length > 5) {
    const winners = positions.filter((p: any) => parseFloat(p.cashPnl || 0) > 0).length;
    const losers = positions.filter((p: any) => parseFloat(p.cashPnl || 0) < 0).length;
    const total = winners + losers;
    if (total > 0) {
      const winRate = winners / total;
      if (winRate > 0.85) s5 = 80 + (winRate - 0.85) / 0.15 * 20;
      else if (winRate > 0.65) s5 = 30 + (winRate - 0.65) / 0.2 * 50;
      else {
        // Per feedback: normal win rate should not penalize if other signals are strong
        s5 = 10;
      }
    }
  }

  emitSignal('WIN_RATE', { intervalRegularity: Math.round(s1), splitMergeRatio: Math.round(s2), sizingConsistency: Math.round(s3), activity24h: Math.round(s4), winRateExtreme: Math.round(s5), bothSidesBonus: Math.round(bothSidesBonus) });
  await tick();

  // S6: Market Concentration
  let s6 = 0;
  if (trades.length > 10) {
    const categories = new Map<string, number>();
    for (const t of trades) {
      const slug = (t.slug || '').toLowerCase();
      let cat = 'other';
      if (slug.includes('up-or-down') || slug.includes('15-minute') || slug.includes('btc') || slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('eth') || slug.includes('solana') || slug.includes('sol')) {
        cat = 'crypto-shortterm';
      } else if (slug.includes('temperature') || slug.includes('weather') || slug.includes('rain') || slug.includes('snow')) {
        cat = 'weather';
      } else if (slug.includes('nba') || slug.includes('nfl') || slug.includes('epl') || slug.includes('mlb') || slug.includes('soccer') || slug.includes('football')) {
        cat = 'sports';
      } else if (slug.includes('trump') || slug.includes('biden') || slug.includes('election') || slug.includes('president')) {
        cat = 'politics';
      }
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }

    const topCategory = Math.max(...categories.values());
    const concentration = topCategory / trades.length;

    if (concentration > 0.8) s6 = 70 + (concentration - 0.8) / 0.2 * 30;
    else if (concentration > 0.5) s6 = 30 + (concentration - 0.5) / 0.3 * 40;
    else s6 = Math.max(0, concentration * 40);
  }

  emitSignal('CONCENTRATION', { intervalRegularity: Math.round(s1), splitMergeRatio: Math.round(s2), sizingConsistency: Math.round(s3), activity24h: Math.round(s4), winRateExtreme: Math.round(s5), marketConcentration: Math.round(s6), bothSidesBonus: Math.round(bothSidesBonus) });
  await tick();

  // S7: Ghost Whale Detection
  // Wallets with no/few trades but large positions = likely smart contract or programmatic
  let s7 = 0;
  if (trades.length <= 5) {
    // No trade history is suspicious if they hold positions
    if (positions.length > 0) {
      const totalPositionValue = positions.reduce((acc: number, p: any) => acc + (parseFloat(p.currentValue) || 0), 0);
      if (totalPositionValue > 50000) s7 = 95;
      else if (totalPositionValue > 10000) s7 = 80;
      else if (totalPositionValue > 1000) s7 = 60;
      else s7 = 30;
    }
    // If we have market context, use holder amount
    if (marketCtx?.holderAmount) {
      if (marketCtx.holderAmount > 50000) s7 = Math.max(s7, 95);
      else if (marketCtx.holderAmount > 10000) s7 = Math.max(s7, 80);
      else if (marketCtx.holderAmount > 1000) s7 = Math.max(s7, 60);
    }
  }

  emitSignal('GHOST', { intervalRegularity: Math.round(s1), splitMergeRatio: Math.round(s2), sizingConsistency: Math.round(s3), activity24h: Math.round(s4), winRateExtreme: Math.round(s5), marketConcentration: Math.round(s6), ghostWhale: Math.round(s7), bothSidesBonus: Math.round(bothSidesBonus), makerTakerRatio: 0, freshWalletScore: 0 });

  // S8: Maker/Taker Ratio
  // Informed traders are predominantly takers (cross the spread for immediate execution)
  // Uses median price as reference to handle asymmetric markets (e.g. 90¢/10¢)
  let s8 = 0;
  if (trades.length > 15) {
    const tradePrices = trades.map((t: any) => parseFloat(t.price)).filter((p: number) => !isNaN(p));
    const sortedPrices = [...tradePrices].sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0.5;
    // Taker threshold: 10% above/below median (adapts to market price level)
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
    else s8 = 0;
  }

  // S9: Fresh Wallet Detection
  // New wallets with large first trades = insider signal
  let s9 = 0;
  if (trades.length > 0 && trades.length < 500) {
    // trades are DESC by timestamp; last element = earliest trade
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

  await tick();

  // Compute sizeCV for strategy classification (reuse trades data)
  let sizeCV = 1;
  if (trades.length > 10) {
    const usdSizes = trades.map((t: any) => parseFloat(t.size) * parseFloat(t.price)).filter((v: number) => !isNaN(v));
    sizeCV = coefficientOfVariation(usdSizes);
  }

  // Final score: if ghost whale is active, use alternate weighting
  let rawScore: number;
  if (s7 > 0 && trades.length <= 5) {
    // Ghost whale mode: heavy weight on ghost signal since other signals have no data
    rawScore = s7 * 0.50 + s5 * 0.20 + s2 * 0.15 + bothSidesPercent * 0.15;
  } else {
    rawScore =
      s1 * WEIGHTS.intervalRegularity +
      s2 * WEIGHTS.splitMergeRatio +
      s3 * WEIGHTS.sizingConsistency +
      s4 * WEIGHTS.activity24h +
      s5 * WEIGHTS.winRateExtreme +
      s6 * WEIGHTS.marketConcentration +
      s8 * WEIGHTS.makerTakerRatio +
      s9 * WEIGHTS.freshWalletScore;
  }

  const botScore = Math.min(100, Math.round(rawScore + bothSidesBonus));

  let classification: BotDetectionResult['classification'];
  if (botScore >= 80) classification = 'bot';
  else if (botScore >= 60) classification = 'likely-bot';
  else if (botScore >= 40) classification = 'mixed';
  else classification = 'human';

  // Strategy classification: what TYPE of bot/trader is this?
  const strategy = classifyStrategy(
    trades,
    positions,
    mergeCount,
    bothSidesPercent,
    s1,  // intervalRegularity score
    sizeCV,
  );

  return {
    address,
    botScore,
    signals: {
      intervalRegularity: Math.round(s1),
      splitMergeRatio: Math.round(s2),
      sizingConsistency: Math.round(s3),
      activity24h: Math.round(s4),
      winRateExtreme: Math.round(s5),
      marketConcentration: Math.round(s6),
      ghostWhale: Math.round(s7),
      bothSidesBonus: Math.round(bothSidesBonus),
      makerTakerRatio: Math.round(s8),
      freshWalletScore: Math.round(s9),
    },
    classification,
    strategy,
    tradeCount,
    mergeCount,
    activeHours,
    bothSidesPercent: Math.round(bothSidesPercent),
  };
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
