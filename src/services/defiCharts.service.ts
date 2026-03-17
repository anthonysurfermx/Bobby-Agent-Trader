// Service for fetching DeFi chart data.
// Priority: 1) Supabase cache table, 2) Edge function, 3) Direct DeFi Llama free API fallback.
// In-memory cache avoids redundant calls during navigation.

import { supabase } from '@/lib/supabase';

export interface ChartDataPoint {
  date: number;  // unix timestamp (seconds)
  value: number;
}

export type ChartType = 'protocol_tvl' | 'chain_tvl' | 'protocol_fees' | 'protocol_volume';

interface CacheEntry {
  data: ChartDataPoint[];
  timestamp: number;
}

const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DB_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const memoryCache = new Map<string, CacheEntry>();

function getCacheKey(type: ChartType, identifier: string): string {
  return `${type}:${identifier}`;
}

// Try reading from Supabase cache table first
async function readFromCache(type: ChartType, identifier: string): Promise<ChartDataPoint[] | null> {
  try {
    const { data, error } = await supabase
      .from('defi_chart_cache')
      .select('data, fetched_at')
      .eq('chart_type', type)
      .eq('identifier', identifier)
      .single();

    if (error || !data) return null;

    const age = Date.now() - new Date(data.fetched_at).getTime();
    if (age > DB_CACHE_TTL) return null;

    return data.data as ChartDataPoint[];
  } catch {
    return null;
  }
}

// Fetch from DeFi Llama free public API (no API key needed for these endpoints)
async function fetchFromDefiLlamaFree(type: ChartType, identifier: string): Promise<ChartDataPoint[]> {
  let url: string;
  let transform: (data: unknown) => ChartDataPoint[];

  switch (type) {
    case 'protocol_tvl':
      url = `https://api.llama.fi/protocol/${identifier}`;
      transform = (data: any) => {
        const tvl = data.tvl || [];
        return tvl.map((p: any) => ({
          date: p.date,
          value: p.totalLiquidityUSD ?? p.tvl ?? 0,
        }));
      };
      break;

    case 'chain_tvl':
      url = `https://api.llama.fi/v2/historicalChainTvl/${identifier}`;
      transform = (data: any) => {
        if (!Array.isArray(data)) return [];
        return data.map((p: any) => ({
          date: p.date,
          value: p.tvl ?? 0,
        }));
      };
      break;

    case 'protocol_fees':
      url = `https://api.llama.fi/summary/fees/${identifier}?dataType=dailyFees`;
      transform = (data: any) => {
        const chart = data.totalDataChart || [];
        return chart.map((p: any) => ({
          date: typeof p[0] === 'number' ? p[0] : new Date(p[0]).getTime() / 1000,
          value: p[1] ?? 0,
        }));
      };
      break;

    case 'protocol_volume':
      url = `https://api.llama.fi/summary/dexs/${identifier}?dataType=dailyVolume`;
      transform = (data: any) => {
        const chart = data.totalDataChart || [];
        return chart.map((p: any) => ({
          date: typeof p[0] === 'number' ? p[0] : new Date(p[0]).getTime() / 1000,
          value: p[1] ?? 0,
        }));
      };
      break;

    default:
      throw new Error(`Unknown chart type: ${type}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DeFi Llama API error: ${response.status}`);
  }

  const data = await response.json();
  return transform(data);
}

export async function fetchChartData(
  type: ChartType,
  identifier: string
): Promise<ChartDataPoint[]> {
  const key = getCacheKey(type, identifier);

  // 1. Check in-memory cache
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    return cached.data;
  }

  // 2. Check Supabase cache table
  const dbCached = await readFromCache(type, identifier);
  if (dbCached) {
    memoryCache.set(key, { data: dbCached, timestamp: Date.now() });
    return dbCached;
  }

  // 3. Fetch from DeFi Llama free API
  const freshData = await fetchFromDefiLlamaFree(type, identifier);

  // Store in memory cache
  memoryCache.set(key, { data: freshData, timestamp: Date.now() });

  return freshData;
}
