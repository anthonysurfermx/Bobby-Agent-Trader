const OKX_BASE = 'https://www.okx.com';
const CATALOG_TTL_MS = 15 * 60 * 1000;

export const OKX_SEARCH_INST_TYPES = ['SPOT', 'SWAP', 'FUTURES'] as const;

export type OkxSearchInstType = (typeof OKX_SEARCH_INST_TYPES)[number];
export type OkxAssetClass = 'crypto' | 'equity' | 'commodity' | 'fx' | 'other';

interface RawOkxInstrument {
  baseCcy?: string;
  ctValCcy?: string;
  expTime?: string;
  instCategory?: string;
  instFamily?: string;
  instId: string;
  instType: OkxSearchInstType;
  lever?: string;
  listTime?: string;
  lotSz?: string;
  quoteCcy?: string;
  settleCcy?: string;
  state?: string;
  tickSz?: string;
  uly?: string;
}

export interface OkxAssetInstrument {
  instId: string;
  instType: OkxSearchInstType;
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string | null;
  settleSymbol: string | null;
  family: string | null;
  underlying: string | null;
  assetClass: OkxAssetClass;
  displaySymbol: string;
  displayName: string;
  aliases: string[];
  priority: number;
  state: string;
  instrumentMeta: {
    expTime: string | null;
    instCategory: string | null;
    lever: string | null;
    listTime: string | null;
    lotSz: string | null;
    tickSz: string | null;
  };
  searchText: string;
}

let catalogCache:
  | {
      expiresAt: number;
      fetchedAt: number;
      instruments: OkxAssetInstrument[];
    }
  | null = null;

const HUMAN_ALIASES: Record<string, string[]> = {
  BTC: ['BITCOIN'],
  ETH: ['ETHEREUM'],
  SOL: ['SOLANA'],
  DOGE: ['DOGECOIN'],
  XAUT: ['GOLD', 'XAU'],
  PAXG: ['GOLD'],
  XAG: ['SILVER'],
  NVDA: ['NVIDIA'],
  AAPL: ['APPLE'],
  TSLA: ['TESLA'],
  SPY: ['S&P500', 'SP500', 'SPX'],
};

function normalizeQueryValue(value: string): string {
  return value.trim().toUpperCase();
}

function compactQueryValue(value: string): string {
  return normalizeQueryValue(value).replace(/[^A-Z0-9]/g, '');
}

function familyParts(raw: RawOkxInstrument): string[] {
  const family = raw.instFamily || raw.uly || '';
  return family
    .toUpperCase()
    .split('-')
    .map((part) => part.replace(/_.*$/, ''))
    .filter(Boolean);
}

function deriveSymbol(raw: RawOkxInstrument): string {
  return normalizeQueryValue(
    raw.baseCcy
      || raw.ctValCcy
      || familyParts(raw)[0]
      || raw.instId.split('-')[0]
      || raw.instId,
  );
}

function deriveQuoteSymbol(raw: RawOkxInstrument): string | null {
  const direct = normalizeQueryValue(raw.quoteCcy || '');
  if (direct) return direct;
  const parts = familyParts(raw);
  if (parts[1]) return parts[1];
  const instParts = raw.instId.toUpperCase().split('-');
  if (instParts[1]) return instParts[1].replace(/_.*$/, '');
  const settle = normalizeQueryValue(raw.settleCcy || '');
  return settle || null;
}

function deriveAssetClass(raw: RawOkxInstrument, symbol: string): OkxAssetClass {
  if (raw.instCategory === '3') return 'equity';
  if (['XAUT', 'PAXG', 'XAG'].includes(symbol)) return 'commodity';
  if (['EUR', 'GBP', 'JPY', 'AUD', 'SGD', 'CHF', 'CAD', 'MXN'].includes(symbol)) return 'fx';
  return 'crypto';
}

function buildAliases(symbol: string): string[] {
  const direct = HUMAN_ALIASES[symbol] || [];
  const aliases = new Set<string>([symbol, ...direct].map(normalizeQueryValue).filter(Boolean));
  return Array.from(aliases);
}

function buildDisplayName(
  raw: RawOkxInstrument,
  symbol: string,
  quoteSymbol: string | null,
): string {
  if (raw.instType === 'SPOT') {
    return `${symbol}/${quoteSymbol || raw.settleCcy || 'QUOTE'}`;
  }
  if (raw.instType === 'SWAP') {
    return `${symbol}/${quoteSymbol || raw.settleCcy || 'QUOTE'} PERP`;
  }
  const expiry = raw.instId.split('-').at(-1) || 'FUT';
  return `${symbol}/${quoteSymbol || raw.settleCcy || 'QUOTE'} ${expiry}`;
}

function buildPriority(raw: RawOkxInstrument, quoteSymbol: string | null): number {
  let score = 0;
  if (quoteSymbol === 'USDT') score += 50;
  else if (quoteSymbol === 'USD') score += 35;
  else if ((raw.settleCcy || '').toUpperCase() === 'USDT') score += 24;
  if (raw.instType === 'SPOT') score += 18;
  if (raw.instType === 'SWAP') score += 14;
  if (raw.instType === 'FUTURES') score += 8;
  if (raw.instId.includes('_UM')) score -= 12;
  return score;
}

function normalizeInstrument(raw: RawOkxInstrument): OkxAssetInstrument | null {
  if ((raw.state || '').toLowerCase() !== 'live') return null;

  const symbol = deriveSymbol(raw);
  if (!symbol) return null;

  const quoteSymbol = deriveQuoteSymbol(raw);
  const family = normalizeQueryValue(raw.instFamily || '') || null;
  const underlying = normalizeQueryValue(raw.uly || '') || null;
  const aliases = buildAliases(symbol);
  const displayName = buildDisplayName(raw, symbol, quoteSymbol);
  const displaySymbol = symbol;
  const searchText = [
    raw.instId,
    symbol,
    quoteSymbol,
    raw.settleCcy,
    family,
    underlying,
    displayName,
    ...aliases,
  ]
    .filter(Boolean)
    .map((item) => normalizeQueryValue(String(item)))
    .join(' ');

  return {
    instId: normalizeQueryValue(raw.instId),
    instType: raw.instType,
    symbol,
    baseSymbol: symbol,
    quoteSymbol,
    settleSymbol: normalizeQueryValue(raw.settleCcy || '') || null,
    family,
    underlying,
    assetClass: deriveAssetClass(raw, symbol),
    displaySymbol,
    displayName,
    aliases,
    priority: buildPriority(raw, quoteSymbol),
    state: normalizeQueryValue(raw.state || ''),
    instrumentMeta: {
      expTime: raw.expTime || null,
      instCategory: raw.instCategory || null,
      lever: raw.lever || null,
      listTime: raw.listTime || null,
      lotSz: raw.lotSz || null,
      tickSz: raw.tickSz || null,
    },
    searchText,
  };
}

async function fetchInstrumentType(instType: OkxSearchInstType): Promise<OkxAssetInstrument[]> {
  const res = await fetch(`${OKX_BASE}/api/v5/public/instruments?instType=${instType}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OKX instruments ${instType} ${res.status}`);
  }

  const payload = await res.json() as { code: string; msg?: string; data?: RawOkxInstrument[] };
  if (payload.code !== '0') {
    throw new Error(`OKX instruments ${instType} code ${payload.code}: ${payload.msg || 'request failed'}`);
  }

  return (payload.data || [])
    .map(normalizeInstrument)
    .filter((item): item is OkxAssetInstrument => Boolean(item));
}

export async function getOkxInstrumentCatalog(forceRefresh = false): Promise<OkxAssetInstrument[]> {
  if (!forceRefresh && catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.instruments;
  }

  const results = await Promise.all(OKX_SEARCH_INST_TYPES.map((instType) => fetchInstrumentType(instType)));
  const deduped = new Map<string, OkxAssetInstrument>();
  for (const bucket of results) {
    for (const instrument of bucket) {
      deduped.set(instrument.instId, instrument);
    }
  }

  const instruments = Array.from(deduped.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return a.instId.localeCompare(b.instId);
  });

  catalogCache = {
    fetchedAt: Date.now(),
    expiresAt: Date.now() + CATALOG_TTL_MS,
    instruments,
  };

  return instruments;
}

function expandTerms(query: string): string[] {
  const normalized = normalizeQueryValue(query);
  if (!normalized) return [];
  const compact = compactQueryValue(query);
  const expanded = new Set<string>([normalized, compact]);
  for (const [symbol, aliases] of Object.entries(HUMAN_ALIASES)) {
    if (symbol === normalized || aliases.some((alias) => normalizeQueryValue(alias) === normalized)) {
      expanded.add(symbol);
      aliases.forEach((alias) => expanded.add(normalizeQueryValue(alias)));
    }
  }
  return Array.from(expanded).filter(Boolean);
}

function rankInstrument(instrument: OkxAssetInstrument, query: string): number {
  const normalized = normalizeQueryValue(query);
  const compact = compactQueryValue(query);
  if (!normalized) return 0;

  const searchText = instrument.searchText;
  const compactSearchText = compactQueryValue(searchText);
  const expansions = expandTerms(query);

  let score = 0;

  for (const term of expansions) {
    if (!term) continue;
    if (instrument.instId === term) score = Math.max(score, 1000);
    if (instrument.symbol === term) score = Math.max(score, 960);
    if (instrument.baseSymbol === term) score = Math.max(score, 940);
    if (instrument.aliases.includes(term)) score = Math.max(score, 910);
    if (instrument.instId.startsWith(term)) score = Math.max(score, 860);
    if (instrument.symbol.startsWith(term)) score = Math.max(score, 840);
    if (searchText.includes(term)) score = Math.max(score, 760);
  }

  if (compact && compactSearchText.includes(compact)) {
    score = Math.max(score, 700);
  }

  if (!score) return 0;

  return score + instrument.priority;
}

export async function searchOkxInstruments(
  query: string,
  options?: {
    instTypes?: OkxSearchInstType[];
    limit?: number;
  },
): Promise<OkxAssetInstrument[]> {
  const normalized = normalizeQueryValue(query);
  if (!normalized) return [];

  const limit = Math.min(Math.max(options?.limit || 8, 1), 25);
  const allowedTypes = new Set(options?.instTypes || OKX_SEARCH_INST_TYPES);
  const catalog = await getOkxInstrumentCatalog();

  return catalog
    .filter((instrument) => allowedTypes.has(instrument.instType))
    .map((instrument) => ({ instrument, score: rankInstrument(instrument, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.instrument.priority !== a.instrument.priority) return b.instrument.priority - a.instrument.priority;
      return a.instrument.instId.localeCompare(b.instrument.instId);
    })
    .slice(0, limit)
    .map((entry) => entry.instrument);
}

export async function resolveOkxInstrument(
  query: string,
  options?: {
    instTypes?: OkxSearchInstType[];
  },
): Promise<OkxAssetInstrument | null> {
  const normalized = normalizeQueryValue(query);
  if (!normalized) return null;

  const catalog = await getOkxInstrumentCatalog();
  const exact = catalog.find((instrument) => instrument.instId === normalized);
  if (exact) return exact;

  const results = await searchOkxInstruments(normalized, { ...options, limit: 1 });
  return results[0] || null;
}

export function getCatalogAgeMs(): number | null {
  if (!catalogCache) return null;
  return Date.now() - catalogCache.fetchedAt;
}
