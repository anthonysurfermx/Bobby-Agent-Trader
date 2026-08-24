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

// Spoken names → base ticker, EN + ES, for every base people actually SAY
// (verified against the live catalog: 621 bases as of 2026-08-24). This is
// what lets voice and free text reach the whole universe, not just BTC/ETH.
// A few entries are dictation mangles — what on-device speech recognition
// really outputs for a spoken ticker (observed: "Ethereum" → "Cherry").
const HUMAN_ALIASES: Record<string, string[]> = {
  // ---- crypto ----
  BTC: ['BITCOIN', 'VITCOIN', 'BITCON', 'BITCOM'],
  ETH: ['ETHEREUM', 'ETHER', 'ETHERIUM', 'ETERIUM', 'ITERIUM', 'ETERIO', 'ETEREO', 'CHERIUM', 'CHERRY'],
  SOL: ['SOLANA'],
  XRP: ['RIPPLE'],
  DOGE: ['DOGECOIN', 'DOGUECOIN', 'DOGCOIN'],
  ADA: ['CARDANO'],
  AVAX: ['AVALANCHE'],
  LINK: ['CHAINLINK'],
  DOT: ['POLKADOT'],
  TRX: ['TRON'],
  SHIB: ['SHIBA', 'SHIBA INU'],
  LTC: ['LITECOIN'],
  BCH: ['BITCOIN CASH'],
  UNI: ['UNISWAP'],
  NEAR: ['NEAR PROTOCOL'],
  APT: ['APTOS'],
  ICP: ['INTERNET COMPUTER'],
  POL: ['POLYGON', 'MATIC'],
  ETC: ['ETHEREUM CLASSIC'],
  XLM: ['STELLAR'],
  HBAR: ['HEDERA'],
  FIL: ['FILECOIN'],
  ATOM: ['COSMOS'],
  INJ: ['INJECTIVE'],
  TIA: ['CELESTIA'],
  ARB: ['ARBITRUM'],
  OP: ['OPTIMISM'],
  STRK: ['STARKNET'],
  IMX: ['IMMUTABLE'],
  FET: ['FETCH'],
  GRT: ['THE GRAPH', 'GRAPH'],
  CRV: ['CURVE'],
  COMP: ['COMPOUND'],
  LDO: ['LIDO'],
  SNX: ['SYNTHETIX'],
  WIF: ['DOGWIFHAT'],
  PENGU: ['PUDGY PENGUINS'],
  HYPE: ['HYPERLIQUID'],
  ENA: ['ETHENA'],
  WLD: ['WORLDCOIN'],
  JUP: ['JUPITER'],
  ALGO: ['ALGORAND'],
  XTZ: ['TEZOS'],
  EGLD: ['MULTIVERSX', 'ELROND'],
  SAND: ['SANDBOX', 'THE SANDBOX'],
  MANA: ['DECENTRALAND'],
  AXS: ['AXIE', 'AXIE INFINITY'],
  CHZ: ['CHILIZ'],
  APE: ['APECOIN'],
  STX: ['STACKS'],
  ZEC: ['ZCASH'],
  XCH: ['CHIA'],
  VIRTUAL: ['VIRTUALS'],
  CRO: ['CRONOS'],
  BNB: ['BINANCE COIN'],
  OKB: ['OKEX'],
  PEPE: ['PEPE COIN'],
  BONK: ['BONK COIN'],
  TRUMP: ['TRUMP COIN'],
  RENDER: ['RENDER NETWORK'],
  // ---- equities / xStocks ----
  AAPL: ['APPLE'],
  MSFT: ['MICROSOFT'],
  GOOGL: ['GOOGLE', 'ALPHABET'],
  AMZN: ['AMAZON'],
  META: ['FACEBOOK', 'INSTAGRAM'],
  NVDA: ['NVIDIA', 'ENVIDIA', 'INVIDIA'],
  TSLA: ['TESLA'],
  TSM: ['TSMC', 'TAIWAN SEMICONDUCTOR'],
  AVGO: ['BROADCOM'],
  QCOM: ['QUALCOMM'],
  MU: ['MICRON'],
  SMCI: ['SUPERMICRO', 'SUPER MICRO'],
  NFLX: ['NETFLIX'],
  CRM: ['SALESFORCE'],
  ORCL: ['ORACLE'],
  ADBE: ['ADOBE'],
  NOW: ['SERVICENOW'],
  SNOW: ['SNOWFLAKE'],
  PLTR: ['PALANTIR'],
  COIN: ['COINBASE'],
  HOOD: ['ROBINHOOD'],
  MSTR: ['MICROSTRATEGY', 'STRATEGY'],
  GME: ['GAMESTOP'],
  RDDT: ['REDDIT'],
  SHOP: ['SHOPIFY'],
  UNH: ['UNITEDHEALTH'],
  JNJ: ['JOHNSON'],
  LLY: ['ELI LILLY', 'LILLY'],
  KO: ['COCA COLA', 'COCA-COLA'],
  COST: ['COSTCO'],
  BRKB: ['BERKSHIRE', 'BERKSHIRE HATHAWAY'],
  CSCO: ['CISCO'],
  INTC: ['INTEL'],
  AMD: ['ADVANCED MICRO DEVICES'],
  NOK: ['NOKIA'],
  RIVN: ['RIVIAN'],
  MRNA: ['MODERNA'],
  CRWD: ['CROWDSTRIKE'],
  NET: ['CLOUDFLARE'],
  TWLO: ['TWILIO'],
  ZM: ['ZOOM'],
  ISRG: ['INTUITIVE SURGICAL'],
  ARM: ['ARM HOLDINGS'],
  POPMART: ['POP MART'],
  SPCX: ['SPACEX', 'SPACE X'],
  OPENAI: ['OPEN AI', 'CHATGPT'],
  SPY: ['S&P500', 'SP500', 'SPX'],
  QQQ: ['NASDAQ'],
  IWM: ['RUSSELL'],
  USO: ['OIL', 'PETROLEO', 'CRUDO', 'CRUDE OIL'],
  UVXY: ['VIX'],
  // ---- metals ----
  XAUT: ['GOLD', 'XAU', 'ORO'],
  PAXG: ['GOLD', 'PAX GOLD'],
  XAG: ['SILVER', 'PLATA'],
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

// ---- 24h volume: real popularity ranking for the browse board ----

let volumeCache:
  | { expiresAt: number; bySymbol: Map<string, { volUsd: number; last: number | null }> }
  | null = null;

async function fetchTickerVolumes(instType: 'SPOT' | 'SWAP'): Promise<Array<{ instId: string; last: number | null; volCcy24h: number }>> {
  const res = await fetch(`${OKX_BASE}/api/v5/market/tickers?instType=${instType}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  const payload = await res.json() as { code: string; data?: Array<{ instId: string; last?: string; volCcy24h?: string }> };
  if (payload.code !== '0') return [];
  return (payload.data || []).map((t) => ({
    instId: t.instId,
    last: Number(t.last) || null,
    volCcy24h: Number(t.volCcy24h) || 0,
  }));
}

/**
 * 24h traded volume in USD terms per base symbol, from live OKX tickers.
 * SPOT USDT pairs report quote volume directly; USDT swaps report base
 * volume, converted via last price. Cached alongside the catalog TTL.
 */
export async function getVolumeBySymbol(): Promise<Map<string, { volUsd: number; last: number | null }>> {
  if (volumeCache && volumeCache.expiresAt > Date.now()) return volumeCache.bySymbol;

  const [spot, swap] = await Promise.all([fetchTickerVolumes('SPOT'), fetchTickerVolumes('SWAP')]);
  const bySymbol = new Map<string, { volUsd: number; last: number | null }>();

  for (const t of spot) {
    const [base, quote] = t.instId.split('-');
    if (quote !== 'USDT' && quote !== 'USDC' && quote !== 'USD') continue;
    const entry = bySymbol.get(base) || { volUsd: 0, last: null };
    entry.volUsd += t.volCcy24h;                      // quote volume ≈ USD
    if (entry.last === null) entry.last = t.last;
    bySymbol.set(base, entry);
  }
  for (const t of swap) {
    const base = t.instId.split('-')[0];
    if (!t.instId.includes('-USDT-') && !t.instId.includes('-USD-')) continue;
    const entry = bySymbol.get(base) || { volUsd: 0, last: null };
    entry.volUsd += t.last ? t.volCcy24h * t.last : 0; // base volume × price
    if (entry.last === null) entry.last = t.last;
    bySymbol.set(base, entry);
  }

  volumeCache = { expiresAt: Date.now() + CATALOG_TTL_MS, bySymbol };
  return bySymbol;
}

// ---- Browse: the explorable universe, grouped and ranked ----

export interface OkxBrowseAsset {
  symbol: string;
  name: string;
  assetClass: OkxAssetClass;
  instId: string;
  last: number | null;
  vol24hUsd: number;
}

/** Stable-value bases nobody "analyzes"; they would top volume and add noise. */
const BROWSE_EXCLUDED = new Set([
  'USDT', 'USDC', 'USD', 'USD1', 'USDS', 'USDG', 'PYUSD', 'RLUSD', 'EURC',
  'STABLE', 'BRL1', 'USAT', 'AUDF', 'AUDM', 'GALFT', 'BETH', 'OKSOL', 'JITOSOL',
]);

function browseName(symbol: string): string {
  const alias = (HUMAN_ALIASES[symbol] || [])[0];
  if (!alias) return symbol;
  if (/[^A-Z ]/.test(alias)) return alias;           // "S&P500" stays as-is
  return alias.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

/**
 * The whole speakable universe, deduped to one row per asset and ranked by
 * real 24h volume — powers the in-app board and the dictation vocabulary.
 * Equities hide the X-prefixed duplicate listings (XNVDA vs NVDA) and test
 * assets; crypto hides stablecoins.
 */
export async function browseOkxAssets(limitPerClass = 80): Promise<Record<OkxAssetClass, OkxBrowseAsset[]>> {
  const [catalog, volumes] = await Promise.all([getOkxInstrumentCatalog(), getVolumeBySymbol()]);

  const bestBySymbol = new Map<string, OkxAssetInstrument>();
  for (const instrument of catalog) {
    if (!bestBySymbol.has(instrument.symbol)) bestBySymbol.set(instrument.symbol, instrument);
  }

  const grouped: Record<OkxAssetClass, OkxBrowseAsset[]> = { crypto: [], equity: [], commodity: [], fx: [], other: [] };
  for (const [symbol, instrument] of bestBySymbol) {
    if (BROWSE_EXCLUDED.has(symbol)) continue;
    if (symbol.startsWith('TEST')) continue;
    if (
      instrument.assetClass === 'equity'
      && symbol.startsWith('X')
      && bestBySymbol.get(symbol.slice(1))?.assetClass === 'equity'
    ) continue;
    const vol = volumes.get(symbol);
    grouped[instrument.assetClass].push({
      symbol,
      name: browseName(symbol),
      assetClass: instrument.assetClass,
      instId: instrument.instId,
      last: vol?.last ?? null,
      vol24hUsd: Math.round(vol?.volUsd ?? 0),
    });
  }

  for (const assetClass of Object.keys(grouped) as OkxAssetClass[]) {
    grouped[assetClass].sort((a, b) => b.vol24hUsd - a.vol24hUsd);
    grouped[assetClass] = grouped[assetClass].slice(0, limitPerClass);
  }
  return grouped;
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

/**
 * Bounded Levenshtein distance: returns the edit distance if it is ≤ max,
 * or max + 1 otherwise (with early exit). Strings here are short tickers
 * and names, so the DP stays tiny.
 */
function editDistanceAtMost(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[lb] <= max ? prev[lb] : max + 1;
}

/** Edit tolerance by term length: short words must be near-exact. */
function fuzzyBudget(term: string): number {
  if (term.length < 4) return 0;
  if (term.length <= 6) return 1;
  return 2;
}

/** Query words worth fuzzing: long enough, alphabetic, not pure numbers. */
function fuzzyTermsFor(normalized: string): string[] {
  const seen = new Set<string>();
  for (const word of normalized.split(/\s+/)) {
    const clean = word.replace(/[^A-Z0-9]/g, '');
    if (clean.length >= 4 && !/^\d+$/.test(clean)) seen.add(clean);
  }
  return Array.from(seen);
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

  // Fuzzy net: dictation and typos never match exactly ("SOLNA", "ETHERUM",
  // "PALANTR"). A bounded edit distance against the symbol and its spoken
  // aliases catches them, scored well below any exact/substring hit so real
  // matches always win. Priority still breaks ties toward the liquid market.
  if (!score) {
    for (const term of fuzzyTermsFor(normalized)) {
      const budget = fuzzyBudget(term);
      if (!budget) continue;
      for (const alias of instrument.aliases) {
        const d = editDistanceAtMost(term, alias, budget);
        if (d <= budget) {
          score = Math.max(score, 620 - d * 40);
        }
      }
    }
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
