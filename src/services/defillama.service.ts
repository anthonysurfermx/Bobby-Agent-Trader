// src/services/defillama.service.ts

export interface AIAgentProtocol {
  name: string;
  slug: string;
  tvl: number;
  mcap: number;
  change_1d: number | null;
  change_7d: number | null;
  chains: string[];
  url: string;
  twitter: string;
  symbol: string;
  fees24h: number;
  fees7d: number;
  fees30d: number;
  feesAllTime: number;
  description: string;
  logo: string;
  category: string;
  audits: number;
}

export interface TVLHistoryPoint {
  date: string; // YYYY-MM-DD
  timestamp: number;
  [protocol: string]: string | number; // dynamic keys for each protocol's TVL
}

// AI-related protocols that DefiLlama categorizes differently (not under 'AI Agents')
const EXTRA_SLUGS = new Set([
  'bankr',                // Interface - AI agent trading infra (OpenClaw)
  'gaib',                 // RWA - Financial layer for AI infrastructure (GPU-backed)
  'near-intents',         // Cross Chain Bridge - AI intents system
  'maxshot',              // Onchain Capital Allocator - AI Agent Factory
  'jpow-ai',             // CDP - AI Agent that manages lending protocol
  'rank-trading',         // Yield - Marketplace for human & AI agent traders
  'singularity-finance',  // Yield - DeFi platform of AI Superintelligence Alliance
  'powerpool',            // Indexes - DePIN layer powering AI Agents
  'bakerfi',              // Liquid Staking - AI agents for DeFi automation
  '3jane-lending',        // Uncollateralized Lending - AI agent credit market
]);

const CACHE_KEY = 'defillama_ai_agents';
const CACHE_KEY_HISTORY = 'defillama_tvl_history';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedData {
  data: AIAgentProtocol[];
  timestamp: number;
}

interface CachedHistory {
  data: TVLHistoryPoint[];
  timestamp: number;
}

function getCached(): AIAgentProtocol[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedData = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCache(data: AIAgentProtocol[]): void {
  try {
    const cached: CachedData = { data, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // sessionStorage full or unavailable
  }
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Validate that response is actually JSON (DefiLlama sometimes returns CloudFlare errors as 200)
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

export const defillamaService = {
  async getAIAgentProtocols(): Promise<AIAgentProtocol[]> {
    const cached = getCached();
    if (cached) return cached;

    const [protocolsRes, feesRes] = await Promise.allSettled([
      fetchWithRetry('https://api.llama.fi/protocols'),
      fetchWithRetry('https://api.llama.fi/overview/fees'),
    ]);

    // Protocols is required, fees is optional
    if (protocolsRes.status !== 'fulfilled') {
      console.warn('[DefiLlama] Failed to fetch protocols:', protocolsRes.reason);
      throw new Error('Failed to fetch DefiLlama protocols data');
    }

    const protocols = await protocolsRes.value.json();
    const feesData = feesRes.status === 'fulfilled' ? await feesRes.value.json() : { protocols: [] };

    // Filter AI Agents category + extra known slugs
    const aiProtocols = protocols.filter(
      (p: any) => p.category === 'AI Agents' || EXTRA_SLUGS.has(p.slug)
    );

    // Build fees lookup by name (lowercase)
    const feesLookup = new Map<string, any>();
    for (const fp of feesData.protocols || []) {
      feesLookup.set(fp.name.toLowerCase(), fp);
    }

    // Merge protocols with fees data
    const merged: AIAgentProtocol[] = aiProtocols.map((p: any) => {
      const fees = feesLookup.get(p.name.toLowerCase());
      return {
        name: p.name || '',
        slug: p.slug || '',
        tvl: p.tvl || 0,
        mcap: p.mcap || 0,
        change_1d: p.change_1d ?? null,
        change_7d: p.change_7d ?? null,
        chains: p.chains || [],
        url: p.url || '',
        twitter: p.twitter || '',
        symbol: p.symbol || '',
        fees24h: fees?.total24h || 0,
        fees7d: fees?.total7d || 0,
        fees30d: fees?.total30d || 0,
        feesAllTime: fees?.totalAllTime || 0,
        description: p.description || '',
        logo: p.logo || '',
        category: p.category || '',
        audits: parseInt(p.audits) || 0,
      };
    });

    // Sort by TVL descending
    merged.sort((a, b) => b.tvl - a.tvl);

    setCache(merged);
    return merged;
  },

  async getTVLHistory(protocols: AIAgentProtocol[], days = 90): Promise<TVLHistoryPoint[]> {
    // Check cache
    try {
      const raw = sessionStorage.getItem(CACHE_KEY_HISTORY);
      if (raw) {
        const cached: CachedHistory = JSON.parse(raw);
        if (Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
        sessionStorage.removeItem(CACHE_KEY_HISTORY);
      }
    } catch { /* ignore */ }

    // Fetch top protocols with TVL > 0 (max 8 to limit API calls)
    const withTVL = protocols.filter(p => p.tvl > 0).slice(0, 8);

    const responses = await Promise.allSettled(
      withTVL.map(p =>
        fetchWithRetry(`https://api.llama.fi/protocol/${p.slug}`, 1)
          .then(r => r.json())
          .then(data => ({ slug: p.slug, name: p.name, tvl: data?.tvl || [] }))
          .catch(() => ({ slug: p.slug, name: p.name, tvl: [] }))
      )
    );

    // Build date-indexed map
    const dateMap = new Map<string, TVLHistoryPoint>();
    const cutoff = Date.now() / 1000 - days * 86400;

    for (const result of responses) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { name, tvl } = result.value;
      for (const entry of tvl) {
        if (entry.date < cutoff) continue;
        const d = new Date(entry.date * 1000);
        const dateStr = d.toISOString().split('T')[0];
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { date: dateStr, timestamp: entry.date });
        }
        const point = dateMap.get(dateStr)!;
        point[name] = Math.round(entry.totalLiquidityUSD || 0);
      }
    }

    const history = Array.from(dateMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    // Cache
    try {
      sessionStorage.setItem(CACHE_KEY_HISTORY, JSON.stringify({ data: history, timestamp: Date.now() }));
    } catch { /* ignore */ }

    return history;
  },
};
