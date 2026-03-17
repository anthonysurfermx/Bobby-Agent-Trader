export interface PolymarketAgent {
  address: string;
  name: string;
  description?: string;
  isVerified?: boolean;
  tags?: string[];
}

export interface RecentTrade {
  title: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  usdcSize: number;
  timestamp: number;
  transactionHash: string;
  slug: string;
}

export interface AgentMetrics {
  address: string;
  positionsValue: number;
  portfolioValue: number;
  profitPnL: number | null;
  volumeTraded: number;
  openPositions: number;
  lastActive: string | null;
  lastTradeTitle: string | null;
  pseudonym: string | null;
  recentTrades: RecentTrade[];
}

export interface PolymarketPosition {
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  slug: string;
  eventSlug: string;
}

export interface LeaderboardEntry {
  rank: number;
  proxyWallet: string;
  userName: string;
  profileImage: string;
  volume: number;
  pnl: number;
  xUsername: string;
}

export interface SmartMoneyTrader {
  address: string;
  name: string;
  profileImage: string;
  rank: number;
  pnl: number;
  volume: number;
  outcome: string;
  positionValue: number;
  entryPrice: number;
  currentPnl: number;
  xUsername: string;
}

export interface OutcomeBias {
  outcome: string;
  capital: number;
  headcount: number;
}

export interface SmartMoneyMarket {
  conditionId: string;
  title: string;
  slug: string;
  traderCount: number;
  totalCapital: number;
  topOutcome: string;
  topOutcomeCapitalPct: number;
  topOutcomeHeadPct: number;
  capitalConsensus: number;
  headConsensus: number;
  outcomeBias: OutcomeBias[];
  avgPnl: number;
  currentPrice: number;
  traders: SmartMoneyTrader[];
  // Edge tracker: smart money entry vs market price
  avgEntryPrice: number;  // capital-weighted avg entry price of smart money
  entryPriceMin: number;  // lowest entry price among traders
  entryPriceMax: number;  // highest entry price among traders
  marketPrice: number;    // current market price from gamma API
  edgePercent: number;    // market price - avg entry: positive = SM in profit, negative = underwater
  edgeDirection: 'PROFIT' | 'UNDERWATER' | 'NEUTRAL';
}

// Bond opportunity: high-probability market for yield farming
export interface BondOpportunity {
  conditionId: string;
  question: string;
  slug: string;
  eventSlug: string;
  image: string;
  safeSide: 'YES' | 'NO';        // which side is the "safe" bet
  safePrice: number;              // price of safe side (e.g. 0.96 = 96¢)
  otherPrice: number;             // price of the other side
  returnPct: number;              // return if correct (e.g. 4.17% for 96¢)
  apy: number;                    // annualized return based on time to resolution
  spread: number;                 // market spread in cents
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  hoursToEnd: number;
  daysToEnd: number;
  holdersCount: number;
}

// Entry/Exit signal for whale movements
export interface WhaleSignal {
  traderName: string;
  traderRank: number;
  traderPnl: number;
  address: string;
  marketTitle: string;
  marketSlug: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  usdcSize: number;
  timestamp: number;
  hoursAgo: number;
  conviction: number; // % of portfolio in this trade
}

// Portfolio analysis for a trader
export interface TraderPortfolio {
  address: string;
  name: string;
  rank: number;
  pnl: number;
  totalValue: number;
  positionCount: number;
  topPosition: { title: string; value: number; pctOfPortfolio: number } | null;
  concentration: number; // HHI-based: 0=diversified, 100=one market
  categories: { category: string; capital: number; count: number }[];
  hedges: { market: string; yesCapital: number; noCapital: number }[];
  convictionBets: { title: string; value: number; pctOfPortfolio: number; outcome: string }[];
}

// Order book level
export interface OrderBookLevel {
  price: number;
  size: number;
}

// Full order book for a market
export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midpoint: number;
  bidDepth: number;  // total USDC on bid side
  askDepth: number;  // total USDC on ask side
}

// Market spread info
export interface MarketSpread {
  tokenId: string;
  spread: number;    // in cents
  midpoint: number;  // fair value
  bestBid: number;
  bestAsk: number;
}

// Open interest for a market
export interface OpenInterest {
  conditionId: string;
  openInterest: number; // total USDC at risk
}

// Closed/resolved position
export interface ClosedPosition {
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  settlePrice: number;  // 0 or 1 (lost or won)
  pnl: number;
  isWin: boolean;
  resolvedAt: string;
}

// Market reward info
export interface MarketReward {
  conditionId: string;
  rewardRate: number;  // daily reward rate
  rewardApy: number;   // annualized
}

const BASE_URL = '/api/polymarket-data';
const GAMMA_URL = '/api/polymarket-gamma';
const CLOB_URL = '/api/polymarket-clob';

export interface MarketInfo {
  conditionId: string;
  question: string;
  slug: string;
  volume: number;
  outcomePrices: string[];
  outcomes: string[];
  image: string;
  endDate: string;
}

export interface SubMarket {
  conditionId: string;
  question: string;
  slug: string;
  groupItemTitle: string;
  volume: number;
  yesPrice: number;
  active: boolean;
  closed: boolean;
  clobTokenId: string;
}

export interface PricePoint {
  t: number;
  p: number;
}

export interface OutcomePriceHistory {
  label: string;
  history: PricePoint[];
}

export interface EventInfo {
  title: string;
  slug: string;
  image: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  markets: SubMarket[];
}

export interface MarketHolder {
  address: string;
  pseudonym: string;
  amount: number;
  outcome: string;
}

const DEFAULT_AGENTS: PolymarketAgent[] = [];

const STORAGE_KEY = 'polymarket_agent_registry';

export const polymarketService = {
  getAgents(): PolymarketAgent[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const customAgents = stored ? JSON.parse(stored) : [];
      const allAgents = [...DEFAULT_AGENTS];

      customAgents.forEach((ca: PolymarketAgent) => {
        if (!allAgents.find(a => a.address.toLowerCase() === ca.address.toLowerCase())) {
          allAgents.push(ca);
        }
      });

      return allAgents;
    } catch {
      return DEFAULT_AGENTS;
    }
  },

  addAgent(agent: PolymarketAgent): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    const customAgents = stored ? JSON.parse(stored) : [];

    if (!customAgents.find((a: PolymarketAgent) => a.address.toLowerCase() === agent.address.toLowerCase())) {
      customAgents.push(agent);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customAgents));
    }
  },

  removeAgent(address: string): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const customAgents = JSON.parse(stored);
    const filtered = customAgents.filter(
      (a: PolymarketAgent) => a.address.toLowerCase() !== address.toLowerCase()
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  async getAgentMetrics(address: string): Promise<AgentMetrics> {
    try {
      const [positionsRes, tradesRes, valueRes] = await Promise.all([
        fetch(`${BASE_URL}/positions?user=${address}&limit=500&sortBy=CURRENT&sortDirection=DESC`),
        fetch(`${BASE_URL}/trades?user=${address}&limit=100`),
        fetch(`${BASE_URL}/value?user=${address}`),
      ]);

      const positionsData = await positionsRes.json();
      const tradesData = await tradesRes.json();
      const valueData = await valueRes.json();

      let positionsValue = 0;
      let totalPnl = 0;
      let openPositions = 0;

      if (Array.isArray(positionsData)) {
        openPositions = positionsData.length;
        positionsValue = positionsData.reduce((acc: number, p: any) => {
          return acc + (parseFloat(p.currentValue) || 0);
        }, 0);
        totalPnl = positionsData.reduce((acc: number, p: any) => {
          return acc + (parseFloat(p.cashPnl) || 0);
        }, 0);
      }

      let portfolioValue = 0;
      if (Array.isArray(valueData) && valueData.length > 0) {
        portfolioValue = valueData[0].value || 0;
      }

      let volume = 0;
      let lastActive: string | null = null;
      let lastTradeTitle: string | null = null;
      let pseudonym: string | null = null;

      let recentTrades: RecentTrade[] = [];

      if (Array.isArray(tradesData) && tradesData.length > 0) {
        const firstTrade = tradesData[0];
        lastActive = new Date(firstTrade.timestamp * 1000).toISOString();
        lastTradeTitle = firstTrade.title || null;
        pseudonym = firstTrade.pseudonym || firstTrade.name || null;

        volume = tradesData.reduce((acc: number, t: any) => {
          return acc + (parseFloat(t.size) * parseFloat(t.price));
        }, 0);

        recentTrades = tradesData.slice(0, 50).map((t: any) => ({
          title: t.title || '',
          outcome: t.outcome || '',
          side: t.side as 'BUY' | 'SELL',
          size: parseFloat(t.size) || 0,
          price: parseFloat(t.price) || 0,
          usdcSize: parseFloat(t.usdcSize) || 0,
          timestamp: t.timestamp || 0,
          transactionHash: t.transactionHash || '',
          slug: t.slug || t.eventSlug || '',
        }));
      }

      return {
        address,
        positionsValue,
        portfolioValue,
        profitPnL: totalPnl || null,
        volumeTraded: volume,
        openPositions,
        lastActive,
        lastTradeTitle,
        pseudonym,
        recentTrades,
      };
    } catch (error) {
      console.error(`Error fetching metrics for ${address}`, error);
      return {
        address,
        positionsValue: 0,
        portfolioValue: 0,
        profitPnL: null,
        volumeTraded: 0,
        openPositions: 0,
        lastActive: null,
        lastTradeTitle: null,
        pseudonym: null,
        recentTrades: [],
      };
    }
  },

  parseMarketUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('polymarket.com')) return null;
      // URL formats:
      // /event/slug-name OR /event/slug-name/sub-market-slug
      // /es/event/slug-name (with locale prefix)
      const parts = u.pathname.split('/').filter(Boolean);
      // Find the 'event' segment (could be at index 0 or after a locale like /es/)
      const eventIdx = parts.indexOf('event');
      if (eventIdx !== -1 && parts.length > eventIdx + 1) {
        return parts[parts.length - 1]; // last segment is the market slug
      }
      return null;
    } catch {
      return null;
    }
  },

  parseEventSlug(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('polymarket.com')) return null;
      const parts = u.pathname.split('/').filter(Boolean);
      const eventIdx = parts.indexOf('event');
      if (eventIdx !== -1 && parts.length > eventIdx + 1) {
        return parts[eventIdx + 1]; // event slug is always right after 'event'
      }
      return null;
    } catch {
      return null;
    }
  },

  async getMarketBySlug(slug: string): Promise<MarketInfo | null> {
    try {
      const res = await fetch(`${GAMMA_URL}/markets?slug=${slug}&limit=1`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        // Try as event slug
        const eventRes = await fetch(`${GAMMA_URL}/events?slug=${slug}&limit=1`);
        const eventData = await eventRes.json();
        if (Array.isArray(eventData) && eventData.length > 0) {
          const markets = eventData[0].markets || [];
          if (markets.length > 0) {
            const m = markets[0];
            return {
              conditionId: m.conditionId || '',
              question: m.question || eventData[0].title || '',
              slug: m.slug || slug,
              volume: parseFloat(m.volume) || 0,
              outcomePrices: JSON.parse(m.outcomePrices || '[]'),
              outcomes: JSON.parse(m.outcomes || '[]'),
              image: m.image || eventData[0].image || '',
              endDate: m.endDate || '',
            };
          }
        }
        return null;
      }
      const m = data[0];
      return {
        conditionId: m.conditionId || '',
        question: m.question || '',
        slug: m.slug || slug,
        volume: parseFloat(m.volume) || 0,
        outcomePrices: JSON.parse(m.outcomePrices || '[]'),
        outcomes: JSON.parse(m.outcomes || '[]'),
        image: m.image || '',
        endDate: m.endDate || '',
      };
    } catch {
      return null;
    }
  },

  async getEventBySlug(slug: string): Promise<EventInfo | null> {
    try {
      const res = await fetch(`${GAMMA_URL}/events?slug=${slug}&limit=1`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const event = data[0];
      const rawMarkets = event.markets || [];
      const markets: SubMarket[] = rawMarkets.map((m: any) => {
        const prices = JSON.parse(m.outcomePrices || '[]');
        const tokenIds = JSON.parse(m.clobTokenIds || '[]');
        return {
          conditionId: m.conditionId || '',
          question: m.question || '',
          slug: m.slug || '',
          groupItemTitle: m.groupItemTitle || m.question || '',
          volume: parseFloat(m.volume) || 0,
          yesPrice: parseFloat(prices[0]) || 0,
          active: m.acceptingOrders ?? m.active ?? false,
          closed: m.closed ?? false,
          clobTokenId: tokenIds[0] || '',
        };
      });
      return {
        title: event.title || '',
        slug: event.slug || slug,
        image: event.image || '',
        volume: event.volume || 0,
        volume24hr: event.volume24hr || 0,
        liquidity: event.liquidity || 0,
        endDate: event.endDate || '',
        markets,
      };
    } catch {
      return null;
    }
  },

  async getMarketHolders(conditionId: string): Promise<MarketHolder[]> {
    try {
      const res = await fetch(`${BASE_URL}/holders?market=${conditionId}&limit=100`);
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      const holders: MarketHolder[] = [];
      for (const group of data) {
        const outcomeIndex = group.holders?.[0]?.outcomeIndex ?? 0;
        const outcome = outcomeIndex === 0 ? 'Yes' : 'No';
        for (const h of group.holders || []) {
          holders.push({
            address: h.proxyWallet || '',
            pseudonym: h.pseudonym || h.name || '',
            amount: parseFloat(h.amount) || 0,
            outcome,
          });
        }
      }

      // Sort by amount descending
      holders.sort((a, b) => b.amount - a.amount);
      return holders;
    } catch {
      return [];
    }
  },

  async getAgentPositions(address: string, limit = 200): Promise<PolymarketPosition[]> {
    try {
      const res = await fetch(
        `${BASE_URL}/positions?user=${address}&limit=${limit}&sortBy=CURRENT&sortDirection=DESC`
      );
      const data = await res.json();

      if (!Array.isArray(data)) return [];

      return data.map((p: any) => ({
        conditionId: p.conditionId || '',
        title: p.title || '',
        outcome: p.outcome || '',
        size: parseFloat(p.size) || 0,
        avgPrice: parseFloat(p.avgPrice) || 0,
        curPrice: parseFloat(p.curPrice) || 0,
        currentValue: parseFloat(p.currentValue) || 0,
        cashPnl: parseFloat(p.cashPnl) || 0,
        percentPnl: parseFloat(p.percentPnl) || 0,
        slug: p.slug || '',
        eventSlug: p.eventSlug || '',
      }));
    } catch {
      return [];
    }
  },

  async getEventPriceHistory(markets: SubMarket[], maxOutcomes = 6): Promise<OutcomePriceHistory[]> {
    const CLOB_URL = '/api/polymarket-clob';
    // Pick top outcomes by current price, only active ones with tokens
    const topMarkets = markets
      .filter(m => m.clobTokenId)
      .sort((a, b) => b.yesPrice - a.yesPrice)
      .slice(0, maxOutcomes);

    const results = await Promise.all(
      topMarkets.map(async (m) => {
        try {
          const res = await fetch(
            `${CLOB_URL}/prices-history?market=${m.clobTokenId}&interval=all&fidelity=60`
          );
          const data = await res.json();
          const history: PricePoint[] = (data.history || []).map((h: any) => ({
            t: h.t,
            p: h.p,
          }));
          return { label: m.groupItemTitle, history };
        } catch {
          return { label: m.groupItemTitle, history: [] };
        }
      })
    );

    return results.filter(r => r.history.length > 0);
  },

  async getRecentTradesForWallet(address: string, limit = 50): Promise<RecentTrade[]> {
    try {
      const res = await fetch(`${BASE_URL}/trades?user=${address}&limit=${limit}`);
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((t: any) => ({
        title: t.title || '',
        outcome: t.outcome || '',
        side: t.side as 'BUY' | 'SELL',
        size: parseFloat(t.size) || 0,
        price: parseFloat(t.price) || 0,
        usdcSize: parseFloat(t.usdcSize) || 0,
        timestamp: t.timestamp || 0,
        transactionHash: t.transactionHash || '',
        slug: t.slug || t.eventSlug || '',
      }));
    } catch {
      return [];
    }
  },

  async getMarketPrices(conditionIds: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    // Batch fetch from gamma API
    try {
      const ids = conditionIds.slice(0, 20).join(',');
      const res = await fetch(`${GAMMA_URL}/markets?condition_ids=${ids}&limit=20`);
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const m of data) {
          const outcomePrices = JSON.parse(m.outcomePrices || '[]');
          if (outcomePrices.length > 0) {
            // First outcome price = YES price
            prices.set(m.conditionId, parseFloat(outcomePrices[0]) || 0);
          }
        }
      }
    } catch { /* fallback: use curPrice from positions */ }
    return prices;
  },

  async getBondMarkets(options: {
    minPrice?: number;     // min "safe side" price (e.g. 0.90 = 90¢)
    maxPrice?: number;     // max "safe side" price (e.g. 0.99 = 99¢)
    minLiquidity?: number; // min liquidity in USD
    minVolume?: number;    // min total volume
    limit?: number;        // how many markets to scan
  } = {}): Promise<BondOpportunity[]> {
    const {
      minPrice = 0.90,
      maxPrice = 0.99,
      minLiquidity = 500,
      minVolume = 1000,
      limit = 100,
    } = options;

    try {
      // Fetch active markets sorted by volume, filter for high-probability ones
      const res = await fetch(
        `${GAMMA_URL}/markets?active=true&closed=false&limit=${limit}&order=volume&ascending=false`
      );
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      const bonds: BondOpportunity[] = [];
      const now = Date.now();

      for (const m of data) {
        const outcomePrices = JSON.parse(m.outcomePrices || '[]');
        const outcomes = JSON.parse(m.outcomes || '[]');
        if (outcomePrices.length < 2 || outcomes.length < 2) continue;

        const volume = parseFloat(m.volume) || 0;
        const liquidity = parseFloat(m.liquidity) || 0;
        const endDate = m.endDate ? new Date(m.endDate).getTime() : 0;
        if (volume < minVolume || liquidity < minLiquidity) continue;
        if (!endDate || endDate <= now) continue;

        const yesPrice = parseFloat(outcomePrices[0]) || 0;
        const noPrice = parseFloat(outcomePrices[1]) || 0;

        // Find the "safe" side: the one with price >= minPrice
        // Could be YES (high price = likely yes) or NO (high price = likely no)
        let safeSide: 'YES' | 'NO' | null = null;
        let safePrice = 0;
        let returnPct = 0;

        if (yesPrice >= minPrice && yesPrice <= maxPrice) {
          safeSide = 'YES';
          safePrice = yesPrice;
          returnPct = ((1 - yesPrice) / yesPrice) * 100;
        } else if (noPrice >= minPrice && noPrice <= maxPrice) {
          safeSide = 'NO';
          safePrice = noPrice;
          returnPct = ((1 - noPrice) / noPrice) * 100;
        }

        if (!safeSide) continue;

        // Calculate time to resolution
        const hoursToEnd = (endDate - now) / (1000 * 60 * 60);
        const daysToEnd = hoursToEnd / 24;

        // APY: annualized return based on days to resolution
        const apy = daysToEnd > 0 ? (returnPct / daysToEnd) * 365 : 0;

        // Spread: difference between yes and no prices (indicates market efficiency)
        const spread = Math.abs(yesPrice + noPrice - 1);

        bonds.push({
          conditionId: m.conditionId || '',
          question: m.question || '',
          slug: m.slug || '',
          eventSlug: m.eventSlug || '',
          image: m.image || '',
          safeSide,
          safePrice,
          otherPrice: safeSide === 'YES' ? noPrice : yesPrice,
          returnPct: Math.round(returnPct * 100) / 100,
          apy: Math.round(apy * 100) / 100,
          spread: Math.round(spread * 10000) / 100,  // in cents
          volume,
          volume24hr: parseFloat(m.volume24hr) || 0,
          liquidity,
          endDate: m.endDate || '',
          hoursToEnd: Math.round(hoursToEnd),
          daysToEnd: Math.round(daysToEnd * 10) / 10,
          holdersCount: parseInt(m.holdersCount) || 0,
        });
      }

      // Sort by APY descending
      bonds.sort((a, b) => b.apy - a.apy);
      return bonds;
    } catch {
      return [];
    }
  },

  async getLeaderboard(
    category: string = 'OVERALL',
    timePeriod: string = 'MONTH',
    limit: number = 50
  ): Promise<LeaderboardEntry[]> {
    try {
      const res = await fetch(
        `${BASE_URL}/v1/leaderboard?category=${category}&timePeriod=${timePeriod}&orderBy=PNL&limit=${limit}&offset=0`
      );
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((entry: any, idx: number) => ({
        rank: entry.rank || idx + 1,
        proxyWallet: entry.proxyWallet || '',
        userName: entry.userName || '',
        profileImage: entry.profileImage || '',
        volume: parseFloat(entry.vol) || 0,
        pnl: parseFloat(entry.pnl) || 0,
        xUsername: entry.xUsername || '',
      }));
    } catch {
      return [];
    }
  },

  // ─── CLOB API: Order Book ───
  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    try {
      const res = await fetch(`${CLOB_URL}/book?token_id=${tokenId}`);
      const data = await res.json();
      if (!data) return null;

      const bids: OrderBookLevel[] = (data.bids || []).map((b: any) => ({
        price: parseFloat(b.price) || 0,
        size: parseFloat(b.size) || 0,
      }));
      const asks: OrderBookLevel[] = (data.asks || []).map((a: any) => ({
        price: parseFloat(a.price) || 0,
        size: parseFloat(a.size) || 0,
      }));

      const bestBid = bids.length > 0 ? bids[0].price : 0;
      const bestAsk = asks.length > 0 ? asks[0].price : 1;
      const spread = bestAsk - bestBid;
      const midpoint = (bestBid + bestAsk) / 2;
      const bidDepth = bids.reduce((a, b) => a + b.price * b.size, 0);
      const askDepth = asks.reduce((a, b) => a + b.price * b.size, 0);

      return { bids, asks, spread, midpoint, bidDepth, askDepth };
    } catch {
      return null;
    }
  },

  // ─── CLOB API: Batch Spreads ───
  async getSpreads(tokenIds: string[]): Promise<MarketSpread[]> {
    try {
      const ids = tokenIds.join(',');
      const res = await fetch(`${CLOB_URL}/spreads?token_ids=${ids}`);
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((s: any) => ({
        tokenId: s.token_id || '',
        spread: parseFloat(s.spread) || 0,
        midpoint: parseFloat(s.mid) || 0,
        bestBid: parseFloat(s.best_bid) || 0,
        bestAsk: parseFloat(s.best_ask) || 0,
      }));
    } catch {
      return [];
    }
  },

  // ─── CLOB API: Batch Midpoints ───
  async getMidpoints(tokenIds: string[]): Promise<Map<string, number>> {
    const midpoints = new Map<string, number>();
    try {
      const ids = tokenIds.join(',');
      const res = await fetch(`${CLOB_URL}/midpoints?token_ids=${ids}`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        for (const [tokenId, value] of Object.entries(data)) {
          midpoints.set(tokenId, parseFloat(value as string) || 0);
        }
      }
    } catch { /* silent */ }
    return midpoints;
  },

  // ─── Data API: Open Interest ───
  async getOpenInterest(conditionId: string): Promise<number> {
    try {
      const res = await fetch(`${BASE_URL}/open-interest?condition_id=${conditionId}`);
      const data = await res.json();
      return parseFloat(data?.openInterest) || parseFloat(data?.open_interest) || 0;
    } catch {
      return 0;
    }
  },

  // ─── Data API: Batch Open Interest ───
  async getBatchOpenInterest(conditionIds: string[]): Promise<Map<string, number>> {
    const oiMap = new Map<string, number>();
    // Fetch in parallel, batches of 5
    for (let i = 0; i < conditionIds.length; i += 5) {
      const batch = conditionIds.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          const oi = await polymarketService.getOpenInterest(id);
          return { id, oi };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.oi > 0) {
          oiMap.set(r.value.id, r.value.oi);
        }
      }
    }
    return oiMap;
  },

  // ─── Data API: Closed Positions (resolved bets) ───
  async getClosedPositions(address: string, limit = 100): Promise<ClosedPosition[]> {
    try {
      const res = await fetch(`${BASE_URL}/closed-positions?user=${address}&limit=${limit}`);
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((p: any) => {
        const settlePrice = parseFloat(p.settlePrice ?? p.settle_price) || 0;
        const avgPrice = parseFloat(p.avgPrice ?? p.avg_price) || 0;
        const size = parseFloat(p.size) || 0;
        const pnl = (settlePrice - avgPrice) * size;
        return {
          conditionId: p.conditionId || p.condition_id || '',
          title: p.title || p.question || '',
          outcome: p.outcome || '',
          size,
          avgPrice,
          settlePrice,
          pnl,
          isWin: settlePrice > avgPrice,
          resolvedAt: p.resolvedAt || p.resolved_at || p.endDate || '',
        };
      });
    } catch {
      return [];
    }
  },

  // ─── CLOB API: Reward Percentages ───
  async getRewardPercentages(): Promise<Map<string, number>> {
    const rewards = new Map<string, number>();
    try {
      const res = await fetch(`${CLOB_URL}/reward-percentages`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        for (const [conditionId, value] of Object.entries(data)) {
          const rate = parseFloat(value as string) || 0;
          if (rate > 0) rewards.set(conditionId, rate);
        }
      }
    } catch { /* silent */ }
    return rewards;
  },

  // ─── CLOB API: Current Active Rewards ───
  async getCurrentRewards(): Promise<{ conditionId: string; rewardsDaily: number; rewardsApy: number }[]> {
    try {
      const res = await fetch(`${CLOB_URL}/current-rewards`);
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((r: any) => ({
        conditionId: r.condition_id || r.conditionId || '',
        rewardsDaily: parseFloat(r.rewards_daily_rate) || parseFloat(r.daily_rate) || 0,
        rewardsApy: (parseFloat(r.rewards_daily_rate) || parseFloat(r.daily_rate) || 0) * 365,
      }));
    } catch {
      return [];
    }
  },
};
