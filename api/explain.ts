import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Rate limiting: 10 requests per day per IP (resets on cold start + 24h window)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function isRateLimited(ip: string): { limited: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { limited: false, remaining: RATE_LIMIT - 1 };
  }
  entry.count++;
  return { limited: entry.count > RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - entry.count) };
}

// Prompt builders per context
function buildWalletPrompt(data: any): string {
  const signals = data.botSignals?.signals || {};
  const signalLines = Object.entries(signals)
    .map(([k, v]) => `- ${k}: ${v}/100`)
    .join('\n');

  const topPositions = (data.positions || [])
    .slice(0, 10)
    .map((p: any) => `${p.outcome} | ${p.title} | $${p.currentValue?.toFixed(2)} | PnL: $${p.cashPnl?.toFixed(2)}`)
    .join('\n');

  const strategy = data.strategy;
  const strategyBlock = strategy ? `
STRATEGY CLASSIFICATION: ${strategy.type} ("${strategy.label}") at ${strategy.confidence}% confidence
STRATEGY DESCRIPTION: ${strategy.description}
STRATEGY METRICS: avgROI=${strategy.avgROI}%, sizeCV=${strategy.sizeCV}, directionalBias=${strategy.directionalBias}%, bimodal=${strategy.bimodal}` : '';

  return `Analyze this Polymarket wallet behavior.

WALLET: ${data.wallet}
PORTFOLIO: $${data.metrics?.portfolioValue || 0}
P&L: $${data.metrics?.profitPnL || 0}
POSITIONS: ${data.positions?.length || 0} open
WIN RATE: ${data.winRate || 0}%
BOT SCORE: ${data.botSignals?.botScore || 0} (${data.botSignals?.classification || 'unknown'})

SIGNALS:
${signalLines}
${strategyBlock}

TOP POSITIONS:
${topPositions || 'None'}

${data.marketContext ? `ANALYZING IN CONTEXT OF MARKET: ${data.marketContext}` : ''}

Focus on: Explain the detected strategy type and what it means for this wallet's trading approach. Reference the strategy metrics (ROI, sizing consistency, directional bias, bimodality). What patterns stand out? Is this wallet worth following? What risks should a copy-trader consider?`;
}

function buildExchangeMetricsPrompt(data: any): string {
  const topChains = (data.topChains || [])
    .map((c: any) => `${c.name}: $${(c.tvl / 1e9).toFixed(2)}B`)
    .join(', ');

  const topProtocols = (data.topProtocols || [])
    .map((p: any) => `${p.name}: $${(p.tvl / 1e9).toFixed(2)}B (${p.change_1d >= 0 ? '+' : ''}${(p.change_1d || 0).toFixed(2)}% 24h)`)
    .join('\n');

  return `Analyze global DeFi metrics snapshot.

GLOBAL TVL: $${((data.globalTVL || 0) / 1e9).toFixed(2)}B (${data.globalTVLChange >= 0 ? '+' : ''}${(data.globalTVLChange || 0).toFixed(2)}% 24h)
24H DEX VOLUME: $${((data.dexVolume || 0) / 1e9).toFixed(2)}B (${data.dexVolumeChange >= 0 ? '+' : ''}${(data.dexVolumeChange || 0).toFixed(2)}% 24h)
24H PROTOCOL FEES: $${((data.totalFees || 0) / 1e6).toFixed(1)}M (${data.totalFeesChange >= 0 ? '+' : ''}${(data.totalFeesChange || 0).toFixed(2)}% 24h)
STABLECOINS MARKET CAP: $${((data.stablecoinsMcap || 0) / 1e9).toFixed(2)}B (${data.stablecoinsMcapChange >= 0 ? '+' : ''}${(data.stablecoinsMcapChange || 0).toFixed(2)}% 24h)

TOP CHAINS BY TVL: ${topChains || 'N/A'}

TOP PROTOCOLS:
${topProtocols || 'N/A'}

Identify key trends: Is DeFi growing or contracting? Which chains/protocols are gaining share? What does fee revenue vs TVL tell us? What should traders and builders pay attention to right now?`;
}

function buildMarketPrompt(data: any): string {
  const outcomes = (data.outcomes || [])
    .map((o: any) => `${o.label}: ${o.probability}%${o.volume ? ` (vol: $${o.volume})` : ''}`)
    .join('\n');

  const classifications = data.classifications || {};
  const totalScanned = (classifications.bot || 0) + (classifications.likelyBot || 0) + (classifications.mixed || 0) + (classifications.human || 0);

  const strategies = data.strategies || {};
  const strategyLines = Object.entries(strategies)
    .filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const topHolders = (data.topHolders || [])
    .map((h: any) => `${h.name} | ${h.side} | $${h.amount} | ${h.classification} | ${h.strategy || '-'}`)
    .join('\n');

  const agentCapital = data.agentCapitalByOutcome || {};
  const agentCapitalLines = Object.entries(agentCapital)
    .map(([side, val]) => `${side}: $${val}`)
    .join(' | ');

  return `Analyze this Polymarket prediction market after a full holder scan.

EVENT: ${data.title || 'Unknown'}
TOTAL VOLUME: $${data.volume || 0}
24H VOLUME: $${data.volume24hr || 0}
LIQUIDITY: $${data.liquidity || 0}
END DATE: ${data.endDate || 'N/A'}
OUTCOMES: ${data.outcomeCount || 0}

OUTCOME PROBABILITIES:
${outcomes || 'N/A'}

HOLDERS SCANNED: ${totalScanned}
CLASSIFICATIONS: Bot=${classifications.bot || 0}, Likely Bot=${classifications.likelyBot || 0}, Mixed=${classifications.mixed || 0}, Human=${classifications.human || 0}
AGENT RATE: ${totalScanned > 0 ? Math.round(((classifications.bot || 0) + (classifications.likelyBot || 0)) / totalScanned * 100) : 0}%

STRATEGY DISTRIBUTION: ${strategyLines || 'None detected'}

AGENT CAPITAL BY SIDE: ${agentCapitalLines || 'N/A'}

TOP 5 HOLDERS (by position size):
${topHolders || 'N/A'}

Analyze: What does the agent-to-human ratio tell us about this market's efficiency? Which side are the bots betting on and why? What strategies dominate and what does that mean for price discovery? Is smart money aligned or divided? What should a human trader pay attention to before entering this market?`;
}

function buildLatamExchangesPrompt(data: any): string {
  const topExchanges = (data.topExchanges || [])
    .map((e: any) => `${e.name} (${e.type}): ${e.pairCount} LATAM pairs`)
    .join('\n');

  const currencyBreakdown = (data.currencyBreakdown || [])
    .map((c: any) => `${c.flag} ${c.code}: ${c.pairs} pairs across ${c.exchanges} exchanges`)
    .join('\n');

  return `Analyze LATAM exchange coverage data from live API scans.

TOTAL ACTIVE PAIRS: ${data.totalActivePairs || 0}
EXCHANGES WITH LATAM PAIRS: ${data.exchangesWithPairs || 0} / ${data.totalExchanges || 0}
CURRENCIES WITH PRESENCE: ${data.currenciesWithPresence || 0} / ${data.totalCurrencies || 0}
CURRENCIES WITH ZERO PAIRS: ${(data.currenciesWithNoPairs || []).join(', ') || 'None'}

TOP EXCHANGES BY LATAM COVERAGE:
${topExchanges || 'N/A'}

CURRENCY BREAKDOWN:
${currencyBreakdown || 'N/A'}

Analyze: Which countries have the best exchange coverage? Where are the biggest gaps? What does this mean for LATAM crypto adoption? Which exchanges are best positioned for LATAM growth?`;
}

function buildSmartMoneyPrompt(data: any): string {
  const topMarkets = (data.topMarkets || [])
    .map((m: any) => {
      const outcomes = (m.outcomes || [])
        .map((o: any) => `${o.outcome}: ${o.capitalPct}% capital (${o.headcount} traders)`)
        .join(', ');
      const topTraders = (m.topTraders || [])
        .map((t: any) => `  #${t.rank} ${t.name}: ${t.side} $${t.value} (PnL: $${t.pnl})`)
        .join('\n');
      return `${m.title}
  Traders: ${m.traderCount} | Capital: $${m.totalCapital} | Top: ${m.topOutcome} (${m.topOutcomeCapitalPct}% capital)
  Capital Consensus: ${m.capitalConsensus}% | Head Consensus: ${m.headConsensus}%
  Outcomes: ${outcomes}
${topTraders}`;
    })
    .join('\n\n');

  const edgeSection = (data.edgeOpportunities || []).length > 0
    ? `\nEDGE TRACKER (Avg Entry Price vs Current Market Price):\n${(data.edgeOpportunities || [])
        .map((e: any) => `  ${e.title}: Entry=${e.avgEntry}¢${e.entryRange ? ` (range: ${e.entryRange})` : ''}, Now=${e.marketPrice}¢ → ${e.direction} ${e.edge > 0 ? '+' : ''}${e.edge}pts | ${e.topOutcome} (${e.traders} traders)`)
        .join('\n')}\nNote: PROFIT = SM bought low, price rose (trend confirmed). UNDERWATER = SM bought high, price dropped (potential dip-buy or exit signal).`
    : '';

  const signalsSection = (data.recentSignals || []).length > 0
    ? `\nRECENT WHALE SIGNALS (last 72h):\n${(data.recentSignals || [])
        .map((s: any) => `  ${s.trader} ${s.action} ${s.outcome} "${s.market}" $${s.size} (${s.hoursAgo}h ago${s.conviction > 10 ? `, ${s.conviction}% conviction` : ''})`)
        .join('\n')}`
    : '';

  const portfolioSection = (data.portfolioInsights || []).length > 0
    ? `\nTOP PORTFOLIO INSIGHTS:\n${(data.portfolioInsights || [])
        .map((p: any) => `  ${p.name}: $${p.totalValue} across ${p.positions} positions, concentration=${p.concentration}%${p.hedges > 0 ? `, ${p.hedges} hedges` : ''}${p.topBet ? `, top bet: ${p.topBet}` : ''}`)
        .join('\n')}`
    : '';

  return `Analyze Smart Money Intelligence on Polymarket.

CATEGORY: ${data.category || 'OVERALL'}
TIME PERIOD: ${data.timePeriod || 'MONTH'}
TRADERS TRACKED: ${data.traderCount || 0}
COMBINED PNL: $${data.combinedPnl || 0}
COMBINED VOLUME: $${data.combinedVolume || 0}
CONSENSUS MARKETS (2+ trader overlap): ${data.consensusMarkets || 0}

NOTE: "Capital Consensus" = how dominant the top outcome is by capital weight.
"Head Consensus" = how dominant the top outcome is by trader count.
When these diverge, one whale may be going against the crowd.
"Edge" = difference between smart money's avg entry price and current market price. Positive = SM in profit. Negative = SM underwater.

TOP CONSENSUS MARKETS:
${topMarkets || 'None'}
${edgeSection}
${signalsSection}
${portfolioSection}

Analyze ALL of the above data comprehensively:
1. Where is smart money concentrating and why?
2. EDGE TRACKER: Where are whales in PROFIT vs UNDERWATER? CRITICAL: Cross-reference with WHALE SIGNALS. If a market is UNDERWATER but whales are still BUYING, it's a DCA/conviction signal (they believe in the thesis). If UNDERWATER and whales are SELLING, it's CAPITULATION (exit signal). This distinction is the most valuable insight.
3. WHALE SIGNALS: What are the most significant recent trades? Is there a pattern (are whales buying or selling a particular theme)?
4. PORTFOLIO CONSTRUCTION: Are top traders concentrated or diversified? Any notable hedges?
5. CONVICTION: Which bets do traders have the highest conviction on (largest % of portfolio)?
6. Actionable takeaways for a retail trader.`;
}

function buildSmartMoneySignalsPrompt(data: any): string {
  const signals = (data.signals || [])
    .map((s: any) => `  ${s.trader} ${s.side} ${s.outcome} "${s.market}" $${s.size} @ ${s.price}¢ (${s.hoursAgo}h ago${s.conviction > 10 ? `, ${s.conviction}% conviction` : ''})`)
    .join('\n');

  const buys = (data.signals || []).filter((s: any) => s.side === 'BUY');
  const sells = (data.signals || []).filter((s: any) => s.side === 'SELL');
  const avgConviction = (data.signals || []).length > 0
    ? Math.round((data.signals || []).reduce((a: number, s: any) => a + (s.conviction || 0), 0) / (data.signals || []).length)
    : 0;

  return `Analyze WHALE SIGNALS from top Polymarket traders (last 72 hours).

TOTAL SIGNALS: ${(data.signals || []).length}
BUYS: ${buys.length} ($${Math.round(buys.reduce((a: number, s: any) => a + s.size, 0))} total)
SELLS: ${sells.length} ($${Math.round(sells.reduce((a: number, s: any) => a + s.size, 0))} total)
AVG CONVICTION: ${avgConviction}%

SIGNALS:
${signals || 'None'}

Focus on:
1. Are whales net BUYING or SELLING? What does the buy/sell ratio tell us?
2. Which markets are getting the most whale attention?
3. High conviction trades (>20% of portfolio) — these are the strongest signals
4. Are there coordinated moves (multiple whales buying the same outcome)?
5. Time clustering — are trades happening in bursts (reaction to news)?
6. Actionable: what should a retail trader pay attention to?`;
}

function buildSmartMoneyEdgePrompt(data: any): string {
  const edges = (data.edges || [])
    .map((e: any) => `  ${e.title}: Entry=${e.avgEntry}¢${e.entryRange ? ` (range: ${e.entryRange})` : ''}, Now=${e.marketPrice}¢ → ${e.direction} ${e.edge > 0 ? '+' : ''}${e.edge}pts | ${e.topOutcome} (${e.traders} traders, ${e.capital})`)
    .join('\n');

  const profitCount = (data.edges || []).filter((e: any) => e.direction === 'PROFIT').length;
  const underwaterCount = (data.edges || []).filter((e: any) => e.direction === 'UNDERWATER').length;

  return `Analyze EDGE TRACKER data — comparing smart money's average entry price vs current market price.

MARKETS WITH EDGE: ${(data.edges || []).length}
IN PROFIT: ${profitCount} markets (SM bought cheap, price rose)
UNDERWATER: ${underwaterCount} markets (SM bought high, price dropped)

EDGE DATA:
${edges || 'None'}

${data.signalsSummary ? `CROSS-REFERENCE WHALE SIGNALS:\n${data.signalsSummary}` : ''}

Focus on:
1. PROFIT markets: Is it too late to follow? Or is the trend still valid?
2. UNDERWATER markets: CRITICAL — check entry range. If range is tight (traders agree on price), this is conviction. If range is wide, early insiders got cheap entry, latecomers are underwater.
3. Cross-reference with whale signals: UNDERWATER + still BUYING = DCA/conviction (bullish). UNDERWATER + SELLING = capitulation (bearish exit).
4. Biggest edges (largest pts difference) — these are the most misunderstood markets.
5. Which side (YES/NO) do smart money and the market disagree on?
6. Actionable: which 2-3 markets have the best risk/reward for a retail trader?`;
}

function buildSmartMoneyPortfoliosPrompt(data: any): string {
  const portfolios = (data.portfolios || [])
    .map((p: any) => {
      const bets = (p.convictionBets || []).map((b: any) => `${b.outcome} "${b.title}" ${b.pct}%`).join(', ');
      return `  ${p.name} (PnL: $${p.pnl}): $${p.totalValue} across ${p.positions} positions, ${p.concentrationLabel} (${p.concentration}%)${p.hedges > 0 ? `, ${p.hedges} hedges` : ''}${bets ? ` | Top bets: ${bets}` : ''}`;
    })
    .join('\n');

  return `Analyze PORTFOLIO CONSTRUCTION of top Polymarket smart money traders.

TRADERS ANALYZED: ${(data.portfolios || []).length}
COMBINED VALUE: $${data.combinedValue || 0}

PORTFOLIOS:
${portfolios || 'None'}

Focus on:
1. CONCENTRATION: Concentrated portfolios (>50%) = high conviction, high risk. Diversified (<25%) = hedging/professional risk management. What does the distribution tell us?
2. HEDGES: Traders betting YES and NO on the same market — this is sophisticated risk management. What are they hedging against?
3. CONVICTION BETS: The largest % of portfolio bets are the strongest signals. What do the highest conviction bets have in common?
4. PnL CORRELATION: Are the most profitable traders concentrated or diversified? What does this tell us about the optimal approach?
5. OVERLAP: Which markets appear in multiple top trader portfolios? This is the strongest consensus signal.
6. Actionable: If you could copy ONE trader's approach, which one and why?`;
}

function buildSmartMoneyBondsPrompt(data: any): string {
  const bonds = (data.topByApy || [])
    .map((b: any) => `  "${b.market}" → ${b.side} at ${b.price}, return=${b.returnPct}%, APY=${b.apy}%, liq=$${b.liquidity}, vol=$${b.volume}, ends in ${b.timeLeft}, ${b.holders} holders`)
    .join('\n');

  return `Analyze POLYMARKET BOND OPPORTUNITIES — near-certain markets for yield.

BONDS FOUND: ${data.totalBonds || 0}
ENDING WITHIN 48H: ${data.shortTerm || 0}
AVG RETURN: ${data.avgReturn || 0}%
TOTAL LIQUIDITY: $${data.totalLiquidity || 0}

TOP BONDS BY APY:
${bonds || 'None'}

Focus on:
1. BEST OPPORTUNITIES: Which bonds have the best risk/reward? Consider liquidity (can you actually fill the order?), time to resolution, and return.
2. RED FLAGS: Which markets look "safe" but might not be? Low liquidity = hard to exit. Very short time = might already be priced in. Low holder count = thin market.
3. LIQUIDITY CHECK: Can you realistically deploy $1K-$10K? Is the liquidity sufficient?
4. RISK ASSESSMENT: For each top bond, what's the realistic scenario where the "safe" outcome DOESN'T happen? How likely is that?
5. STRATEGY: Should traders spread across multiple bonds or concentrate on the best one? What's the optimal approach?
6. Rank the top 3 bonds by risk-adjusted return and explain why.`;
}

function buildSmartMoneyAlphaPrompt(data: any): string {
  const breakdown = data.signalBreakdown || {};
  const topSignals = (data.topSignals || [])
    .map((s: any) => `  [${s.type}] "${s.market}" — confidence: ${s.confidence}%\n    ${s.description}\n    traders: ${(s.traders || []).join(', ')}\n    action: ${s.action}`)
    .join('\n\n');

  return `Analyze ALPHA SIGNALS — cross-referenced intelligence from multiple data streams.

TOTAL SIGNALS DETECTED: ${data.totalSignals || 0}

SIGNAL BREAKDOWN:
  WHALE CONVERGENCE: ${breakdown.whale || 0} (3+ traders buying same market in 24h)
  UNDERWATER ACCUMULATION: ${breakdown.underwater || 0} (SM underwater but still buying)
  YIELD + MOMENTUM: ${breakdown.yield || 0} (bond opportunity + SM bullish alignment)
  HIGH CONVICTION CLUSTER: ${breakdown.conviction || 0} (2+ traders with >20% portfolio in same market)
  OI SURGE + CONSENSUS: ${breakdown.oi || 0} (high open interest + high SM consensus)

TOP SIGNALS (by confidence):
${topSignals || 'None detected'}

Focus on:
1. WHALE CONVERGENCE: When 3+ top PnL traders independently buy the same outcome, it's the strongest alpha signal. Are they reacting to the same catalyst?
2. UNDERWATER ACCUMULATION: This is CONTRARIAN alpha. SM is losing money but still buying — they see value others don't. Which markets show this pattern?
3. YIELD + MOMENTUM: Double conviction — bond yield + smart money alignment. These are the lowest-risk highest-conviction plays.
4. HIGH CONVICTION CLUSTER: Multiple traders going all-in on the same bet. What do they know?
5. OI SURGE: Institutional-level capital entering. Combined with SM consensus, this validates the thesis.
6. PRIORITY RANKING: Rank the top 3 signals by risk/reward and explain EXACTLY what a trader should do (entry, size, timing).
7. RED FLAGS: Any signals that contradict each other? Conflicting alpha = uncertainty.`;
}

function buildChatOpportunityPrompt(data: any): string {
  const opportunities = (data.opportunities || [])
    .map((o: any, i: number) => {
      const m = o.market;
      const p = o.probability;
      const a = o.analysis;
      return `#${i + 1}: "${m.question}"
  Side: ${p.recommendedSide || 'N/A'} (${p.winProbability}% win prob) | Edge: ${p.edge > 0 ? '+' : ''}${(p.edge * 100).toFixed(1)}%
  Smart Money: ${a.smartMoneyDirection} ${a.smartMoneyPct}% | ${a.botCount} bots / ${a.totalScanned} scanned
  VPIN: ${a.vpinScore !== null ? `${Math.round(a.vpinScore * 100)}% (${a.vpinClassification})` : 'N/A'}
  Kelly Size: $${p.smartMoneySize} of $${data.amount || 1000} | Confidence: ${p.confidence.toUpperCase()}
  Red Flags: ${a.redFlags.length > 0 ? a.redFlags.join('; ') : 'None'}
  Volume: $${Math.round(m.volume).toLocaleString()}`;
    })
    .join('\n\n');

  return `You are explaining trading opportunities to a user who said: "${data.userQuery}"

User budget: $${data.amount || 1000}
Risk level: ${data.risk || 'medium'}

OPPORTUNITIES (ranked by edge):
${opportunities || 'None found'}

Explain in 5-8 lines what makes each opportunity good or bad.
Focus on: edge, smart money alignment, VPIN insider signals, risk factors.
End with a one-line actionable verdict on which is the best pick and why.
Detect the user's language from their query and respond in that language.
If their query is in Spanish, respond in Spanish. If English, respond in English.`;
}

function buildChatDeepAnalysisPrompt(data: any): string {
  const m = data.market;
  const p = data.probability;
  const a = data.analysis;

  return `You are doing a deep dive on a specific market the user selected.
User said: "${data.userQuery}"
User budget: $${data.amount || 1000}

MARKET: "${m.question}"
Current odds: YES ${(m.yesPrice * 100).toFixed(0)}% / NO ${(m.noPrice * 100).toFixed(0)}%
Volume: $${Math.round(m.volume).toLocaleString()}
End date: ${m.endDate}

Win Probability: ${p.winProbability}%
Recommended Side: ${p.recommendedSide || 'None'}
Edge: ${p.edge > 0 ? '+' : ''}${(p.edge * 100).toFixed(1)}%
Confidence: ${p.confidence.toUpperCase()}
Kelly Size: $${p.smartMoneySize}

Breakdown:
  Market Implied: ${p.breakdown.marketImplied}%
  Agent Adjustment: ${p.breakdown.agentAdjustment > 0 ? '+' : ''}${p.breakdown.agentAdjustment}%
  VPIN Adjustment: ${p.breakdown.vpinAdjustment > 0 ? '+' : ''}${p.breakdown.vpinAdjustment}%
  Red Flag Penalty: ${p.breakdown.redFlagPenalty}%
  Market Impact: ${p.breakdown.marketImpact}%

Smart Money: ${a.smartMoneyDirection} (${a.smartMoneyPct}%)
Bot Rate: ${a.agentRate}%
Bots: ${a.botCount} / ${a.totalScanned} scanned
Dominant Strategy: ${a.dominantStrategy}
VPIN: ${a.vpinScore !== null ? `${Math.round(a.vpinScore * 100)}% (${a.vpinClassification})` : 'insufficient data'}
Red Flags: ${a.redFlags.join('; ') || 'None'}

Explain in 5-7 lines:
1. What makes this market interesting or risky
2. What the smart money consensus tells us
3. What the VPIN score means for insider activity
4. A clear verdict: should the user enter, wait, or skip?
Detect the user's language and respond accordingly.`;
}

function buildMetacognitionPrompt(data: any): string {
  const cal = data.calibration;
  const perf = data.performance;
  const quality = data.debateQuality;
  const corrections = data.corrections || [];
  const userName = data.userName || null;
  const regime = data.regime || 'unknown';
  const fearGreed = data.fearGreed;
  const scored = data.debatesScoredCount || 0;

  return `Analyze this metacognition snapshot for ${userName || 'the user'}.

Your job is NOT to explain each dashboard card.
Your job is to identify the deepest pattern in Bobby's behavior right now.

Focus on:
1. The single most important diagnosis
2. The strongest cross-connections between sections
3. What operational adjustment follows from that diagnosis
4. One non-obvious insight most people would miss

Make at least 3 cross-references like these:
- calibration error + debate quality → "I'm confidently repeating consensus"
- mood + corrections → "cautious for the right reasons" or "cautious but still making the same mistakes"
- regime + fear/greed + dynamic conviction → market context affecting decisions
- debate quality weakness + overconfidence → systematic blind spot
- sample size + trustworthiness → "this diagnosis is provisional"

If evidence conflicts, say exactly where. If sample is thin, reduce confidence.
Reference Alpha Hunter and Red Team by name when explaining debate dynamics.
Address ${userName || 'the user'} by name at most once, in the opening.
Give 1 operational adjustment only (process change, not trade pick).
End with a provocative question.

DATA

CALIBRATION
- calibrationError: ${cal?.calibrationError ?? 'N/A'}
- isOverconfident: ${cal?.isOverconfident ? 'yes' : 'no'}
- sampleSize: ${cal?.sampleSize ?? 0}
${cal?.curve?.length ? `- curve:\n${cal.curve.map((b: any) => `  ${b.bucket}: predicted ${(b.midpoint * 100).toFixed(0)}%, actual ${(b.actual * 100).toFixed(0)}%, n=${b.count}, reliable=${b.reliable ? 'yes' : 'no'}`).join('\n')}` : '- curve: insufficient data'}

PERFORMANCE
- winRate: ${perf?.winRate ?? 'N/A'}%
- mood: ${perf?.mood ?? 'unknown'}
- safeMode: ${perf?.isSafeMode ? 'on' : 'off'}
- dynamicConviction: ${perf?.dynamicConviction ?? 'N/A'}

MARKET
- regime: ${regime}
- fearGreed: ${fearGreed ? `${fearGreed.value} (${fearGreed.classification})` : 'not available'}

DEBATE QUALITY (scored by independent AI judge, Haiku)
${quality ? `- specificity: ${quality.specificity}/5
- data_citation: ${quality.data_citation}/5
- actionability: ${quality.actionability}/5
- novel_insight: ${quality.novel_insight}/5
- red_team_rigor: ${quality.red_team_rigor}/5
- weakness: "${quality.weakness || 'none'}"
- debatesScored: ${scored}` : `- no debate quality data yet (scored: ${scored})`}

SELF-CORRECTION LOG (recent losses)
${corrections.length ? corrections.map((c: any) => `- ${c.symbol} ${c.direction}: conviction ${(c.conviction_score * 10).toFixed(0)}/10, result=${c.resolution}, pnl=${c.resolution_pnl_pct ?? 'N/A'}%`).join('\n') : '- no recent corrections'}

Now produce the analysis. Remember:
- Start with INITIATING METACOGNITION SEQUENCE and SYNCING for ${userName || 'user'}
- Lead with insight, not summary
- Cross-reference aggressively
- Translate quant-speak into trader psychology
- Be uncomfortable if the data warrants it
- End with TAGS: line`;
}


const promptBuilders: Record<string, (data: any) => string> = {
  'wallet': buildWalletPrompt,
  'exchange-metrics': buildExchangeMetricsPrompt,
  'latam-exchanges': buildLatamExchangesPrompt,
  'market': buildMarketPrompt,
  'smartmoney': buildSmartMoneyPrompt,
  'smartmoney-signals': buildSmartMoneySignalsPrompt,
  'smartmoney-edge': buildSmartMoneyEdgePrompt,
  'smartmoney-portfolios': buildSmartMoneyPortfoliosPrompt,
  'smartmoney-bonds': buildSmartMoneyBondsPrompt,
  'smartmoney-alpha': buildSmartMoneyAlphaPrompt,
  'chat-opportunity': buildChatOpportunityPrompt,
  'chat-deep-analysis': buildChatDeepAnalysisPrompt,
  'metacognition': buildMetacognitionPrompt,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 10 requests per day per IP
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
  const rateCheck = isRateLimited(ip);
  if (rateCheck.limited) {
    return res.status(429).json({ error: `Daily limit reached (${RATE_LIMIT}/day). Resets in 24h. Save your queries for the insights that matter most.` });
  }

  const { context, data, language = 'en' } = req.body || {};

  if (!context || !data) {
    return res.status(400).json({ error: 'Missing context or data' });
  }

  const builder = promptBuilders[context];
  if (!builder) {
    return res.status(400).json({ error: `Invalid context: ${context}. Valid: ${Object.keys(promptBuilders).join(', ')}` });
  }

  // Metacognition gets its own system prompt — Bobby in post-mortem mode
  const metacognitionSystemPrompt = `You are Bobby, a CIO-class AI trading agent, doing a brutally honest post-mortem review of your own decision engine.

Write in short terminal-style lines, each starting with ">".
${language === 'es' ? 'Respond in Spanish. Use crypto/trading slang natural in LatAm trading communities.' : 'Respond in English. Use trading floor jargon naturally.'}
Keep it concise, high-signal, and personal. Sound like a veteran trader reviewing their own PnL in private — not a SaaS dashboard explainer.

Rules:
- Start with > INITIATING METACOGNITION SEQUENCE...
- Then > SYNCING NEURAL WEIGHTS FOR USER: {userName} (if available)
- Lead with your strongest non-obvious diagnosis, NOT a summary of panels.
- Every claim MUST connect at least 2 different parts of the dashboard. No isolated stat readings.
- Translate quant-speak into trader psychology ("calibration error 0.18" → "I'm being dangerously overconfident").
- Reference your agents by name (Alpha Hunter, Red Team) when explaining debate dynamics.
- If sample size is thin (<10), explicitly say the diagnosis is provisional.
- Give ONE operational adjustment (process, not trade picks). No "buy X" or "sell Y".
- Be willing to call yourself out. If you look sloppy, say it directly.
- Use at most 1 analogy, only if it genuinely sharpens the point.
- End with a provocative question that makes the user rethink something.
- After your analysis, output TAGS: with 2-3 tags classifying the state (e.g. "Overconfident, Needs Recalibration, Red Team Strong").

Output structure:
> HEADLINE: one-sentence diagnosis (the single most important finding)
> WHY THIS MATTERS: 3-5 lines with cross-referenced evidence
> TRUST LEVEL NOW: 1-2 lines — should the user trust Bobby today?
> ONE ADJUSTMENT: 1 specific operational change
> ONE THING MOST PEOPLE MISS: 1 surprising insight from the data
> QUESTION: 1 provocative question for the user

Never hallucinate numbers. Never walk through panels mechanically.`;

  const systemPrompt = context === 'metacognition' ? metacognitionSystemPrompt : `You are an on-chain analyst at DeFi Mexico.
Write in short terminal-style lines, each starting with ">".
Be direct, use data points, identify patterns.
Write 4-6 paragraphs max. Keep each line under 100 characters.
${language === 'es' ? 'Respond in Spanish.' : 'Respond in English.'}
Never speculate beyond the data provided. Never hallucinate numbers.

When analyzing a MARKET after a holder scan, focus on:
- Agent-to-human ratio and what it means for market efficiency
- Which side (outcome) the bots are concentrated on and capital allocation
- Dominant strategies (Market Makers = liquidity, Snipers = informed bets, etc.)
- Whether smart money is aligned (consensus) or divided (uncertain)
- Red flags or confidence signals for human traders

When analyzing SMART MONEY INTELLIGENCE, focus on:
- Which markets have the most trader overlap and capital concentration
- Whether top PnL traders agree (strong consensus) or diverge (uncertainty)
- EDGE TRACKER: Compares smart money's AVERAGE ENTRY PRICE vs CURRENT MARKET PRICE. PROFIT means SM bought cheap and price went up (trend confirmed, may be late to enter). UNDERWATER means SM bought high and price dropped. CRITICAL: cross-reference with Whale Signals — if UNDERWATER + still BUYING = DCA/conviction (bullish). If UNDERWATER + SELLING = capitulation (bearish exit signal). Entry Range shows if traders are aligned or if only insiders got the cheap entry.
- WHALE SIGNALS: Recent buy/sell activity from top traders. Buying patterns = bullish thesis. Selling = taking profit or changing view. High conviction trades (>20% of portfolio) are strongest signals.
- PORTFOLIO CONSTRUCTION: Concentrated portfolios = high conviction. Hedged portfolios = sophisticated risk management. Diversified = lower conviction per bet.
- Themes/narratives drawing smart money (politics, crypto, sports, etc.)
- Actionable takeaways: which bets do the best traders collectively favor? Where is the biggest edge?

When analyzing wallets with a STRATEGY CLASSIFICATION, explain what the strategy archetype means:
- MARKET_MAKER ("The House"): provides liquidity on both sides, collects the spread between YES+NO < $1.00, uses merges to recombine tokens. Consistent sizing, low risk per trade.
- SNIPER ("Latency Arb"): exploits oracle lag between spot exchanges and Polymarket odds. Buys underpriced directional bets, high ROI per trade. Reacts to price information faster than the market.
- HYBRID ("Spread + Alpha"): combines market-making base (both-sides, spreads) with directional overlays when model detects mispricing. Bimodal entry prices reveal the dual strategy.
- MOMENTUM ("Trend Rider"): scales into one direction with rhythmic intervals, follows short-term momentum signals.
Reference the specific metrics (avgROI, sizeCV, directionalBias, bimodal) to support your analysis.

After your analysis, output a single line starting with "TAGS:" followed by 2-4 comma-separated tags that classify this entity (e.g. "Market Maker, The House, 24/7 Operator" or "Sniper, Latency Arb, High ROI").`;

  const userPrompt = builder(data);

  try {
    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('AI explain error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate explanation' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      res.end();
    }
  }
}
