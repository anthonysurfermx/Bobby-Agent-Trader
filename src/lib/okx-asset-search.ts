import { appLanguage, type AppLanguage } from './app-language.js';

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
  OPENAI: ['OPEN AI'],
  // 'SPX' deliberately absent: it is also the SPX6900 memecoin's symbol and
  // tied the bare query "SPY" to the wrong instrument.
  SPY: ['S&P500', 'SP500'],
  QQQ: ['NASDAQ'],
  IWM: ['RUSSELL'],
  USO: ['US OIL FUND'],
  // ---- metals ----
  XAUT: ['XAU', 'TETHER GOLD'],
  PAXG: ['PAX GOLD'],
  XAG: ['SILVER', 'PLATA'],
};

/**
 * Financial-proxy words: the user names a THING (gold, oil) and the closest
 * tradable listing is a vehicle for it, not the thing itself. These resolve —
 * but flagged `needsConfirmation`, so the client asks "did you mean…?" before
 * analyzing. Sacred rule: better to ask once than to confidently analyze the
 * wrong instrument. (VIX→UVXY and CHATGPT→OPENAI were dropped entirely: a
 * levered ETF is not the index, and a product is not a company's stock.)
 */
// What the gold and oil proxies really are, in the six interface languages. The reader's language wins over
// the language of the word that matched ("oro" is Spanish and Italian, "gold" English and German).
const GOLD_NOTES: Record<AppLanguage, string> = {
  en: 'Tether Gold (XAUT), a tokenized gold product',
  es: 'Tether Gold (XAUT), oro tokenizado',
  pt: 'Tether Gold (XAUT), ouro tokenizado',
  fr: 'Tether Gold (XAUT), de l’or tokenisé',
  it: 'Tether Gold (XAUT), oro tokenizzato',
  de: 'Tether Gold (XAUT), tokenisiertes Gold',
};
const OIL_NOTES: Record<AppLanguage, string> = {
  en: 'United States Oil Fund (USO), an oil ETF — not spot oil',
  es: 'United States Oil Fund (USO), un ETF de petróleo — no petróleo spot',
  pt: 'United States Oil Fund (USO), um ETF de petróleo — não é petróleo à vista',
  fr: 'United States Oil Fund (USO), un ETF pétrolier — pas le pétrole au comptant',
  it: 'United States Oil Fund (USO), un ETF sul petrolio — non petrolio spot',
  de: 'United States Oil Fund (USO), ein Öl-ETF — kein Spot-Öl',
};
const PROXY_ALIASES: Record<string, { symbol: string; note: string; notes?: Record<AppLanguage, string> }> = {
  GOLD: { symbol: 'XAUT', note: GOLD_NOTES.en, notes: GOLD_NOTES },
  ORO: { symbol: 'XAUT', note: GOLD_NOTES.es, notes: GOLD_NOTES },
  OIL: { symbol: 'USO', note: OIL_NOTES.en, notes: OIL_NOTES },
  PETROLEO: { symbol: 'USO', note: OIL_NOTES.es, notes: OIL_NOTES },
  CRUDO: { symbol: 'USO', note: OIL_NOTES.es, notes: OIL_NOTES },
  'CRUDE OIL': { symbol: 'USO', note: OIL_NOTES.en, notes: OIL_NOTES },
  // Accent-free keys: the lookup strips accents ("pétrole", "petróleo", "Erdöl").
  OURO: { symbol: 'XAUT', note: GOLD_NOTES.pt, notes: GOLD_NOTES },
  PETROLE: { symbol: 'USO', note: OIL_NOTES.fr, notes: OIL_NOTES },
  PETROLIO: { symbol: 'USO', note: OIL_NOTES.it, notes: OIL_NOTES },
  ERDOL: { symbol: 'USO', note: OIL_NOTES.de, notes: OIL_NOTES },
  ROHOL: { symbol: 'USO', note: OIL_NOTES.de, notes: OIL_NOTES },
  // ETF tickers that are not listed on OKX. Without these, "GLD" substring-
  // matched AGLD (Adventure Gold) and analyzed a game token with no warning.
  GLD: { symbol: 'XAUT', note: 'Tether Gold (XAUT), a tokenized gold product — GLD itself is not listed on OKX' },
  SLV: { symbol: 'XAG', note: 'Silver (XAG) perpetual — SLV itself is not listed on OKX' },
};

/**
 * Commodity wording that cannot stand as a word of its own: French "l'or" (the bare "or" is a conjunction in
 * French and English, so only the article or "prix de" makes it gold), German "Öl" (two letters) and the German
 * compounds "Ölpreis", "Goldpreis", "Goldkurs". Each is read as the proxy word of the same commodity.
 */
const COMMODITY_PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/(?<![\p{L}\p{N}])(?:L['’]|(?:PRIX|COURS) D(?:E |['’]))OR(?![\p{L}\p{N}])/gu, ' GOLD '],
  [/(?<![\p{L}\p{N}])GOLD-?(?:PREIS(?:E|ES)?|KURS)(?![\p{L}\p{N}])/gu, ' GOLD '],
  [/(?<![\p{L}\p{N}])(?:ROH|ERD)?(?:ÖL|OEL)-?(?:PREIS(?:E|ES)?|KURS)?(?![\p{L}\p{N}])/gu, ' OIL '],
];

function normalizeQueryValue(value: string): string {
  return value.trim().toUpperCase();
}

/** Accent-free form for word lists: "PÉTROLE" → "PETROLE", "HÄLTST" → "HALTST". */
function bareQueryValue(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function proxyAlias(term: string): (typeof PROXY_ALIASES)[string] | undefined {
  return PROXY_ALIASES[term] ?? PROXY_ALIASES[bareQueryValue(term)];
}

function compactQueryValue(value: string): string {
  // Accented letters fold to their base letter, like every word list here. Dropping them read French "été" as
  // T (AT&T), Portuguese "até" as AT and Spanish "costó" as COST: whole tickers, analysed without asking.
  return bareQueryValue(normalizeQueryValue(value)).replace(/[^A-Z0-9]/g, '');
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
  | { expiresAt: number; bySymbol: Map<string, { volUsd: number; last: number | null; change24h: number | null }> }
  | null = null;

async function fetchTickerVolumes(instType: 'SPOT' | 'SWAP'): Promise<Array<{ instId: string; last: number | null; open24h: number | null; volCcy24h: number }>> {
  const res = await fetch(`${OKX_BASE}/api/v5/market/tickers?instType=${instType}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  const payload = await res.json() as { code: string; data?: Array<{ instId: string; last?: string; open24h?: string; volCcy24h?: string }> };
  if (payload.code !== '0') return [];
  return (payload.data || []).map((t) => ({
    instId: t.instId,
    last: Number(t.last) || null,
    open24h: Number(t.open24h) || null,
    volCcy24h: Number(t.volCcy24h) || 0,
  }));
}

/**
 * 24h traded volume in USD terms per base symbol, from live OKX tickers.
 * SPOT USDT pairs report quote volume directly; USDT swaps report base
 * volume, converted via last price. Cached alongside the catalog TTL.
 */
export async function getVolumeBySymbol(): Promise<Map<string, { volUsd: number; last: number | null; change24h: number | null }>> {
  if (volumeCache && volumeCache.expiresAt > Date.now()) return volumeCache.bySymbol;

  const [spot, swap] = await Promise.all([fetchTickerVolumes('SPOT'), fetchTickerVolumes('SWAP')]);
  const bySymbol = new Map<string, { volUsd: number; last: number | null; change24h: number | null }>();
  const pctChange = (t: { last: number | null; open24h: number | null }) =>
    t.last && t.open24h ? Number((((t.last - t.open24h) / t.open24h) * 100).toFixed(2)) : null;

  for (const t of spot) {
    const [base, quote] = t.instId.split('-');
    if (quote !== 'USDT' && quote !== 'USDC' && quote !== 'USD') continue;
    const entry = bySymbol.get(base) || { volUsd: 0, last: null, change24h: null };
    entry.volUsd += t.volCcy24h;                      // quote volume ≈ USD
    if (entry.last === null) entry.last = t.last;
    if (entry.change24h === null) entry.change24h = pctChange(t);
    bySymbol.set(base, entry);
  }
  for (const t of swap) {
    const base = t.instId.split('-')[0];
    if (!t.instId.includes('-USDT-') && !t.instId.includes('-USD-')) continue;
    const entry = bySymbol.get(base) || { volUsd: 0, last: null, change24h: null };
    entry.volUsd += t.last ? t.volCcy24h * t.last : 0; // base volume × price
    if (entry.last === null) entry.last = t.last;
    if (entry.change24h === null) entry.change24h = pctChange(t);
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
  /** 24h move in percent from the primary listing, null when OKX has no open. */
  change24h: number | null;
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
export async function browseOkxAssets(limitPerClass = 80): Promise<{
  classes: Record<OkxAssetClass, OkxBrowseAsset[]>;
  /** How many distinct bases the search can actually reach — the honest number. */
  totalBases: number;
  /** Biggest liquid 24h moves across classes, for the desk greeting. */
  movers: OkxBrowseAsset[];
}> {
  const [catalog, volumes] = await Promise.all([getOkxInstrumentCatalog(), getVolumeBySymbol()]);

  const bestBySymbol = new Map<string, OkxAssetInstrument>();
  for (const instrument of catalog) {
    if (!bestBySymbol.has(instrument.symbol)) bestBySymbol.set(instrument.symbol, instrument);
  }
  const totalBases = bestBySymbol.size;

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
      change24h: vol?.change24h ?? null,
    });
  }

  for (const assetClass of Object.keys(grouped) as OkxAssetClass[]) {
    grouped[assetClass].sort((a, b) => b.vol24hUsd - a.vol24hUsd);
    grouped[assetClass] = grouped[assetClass].slice(0, limitPerClass);
  }
  // The day's movers: biggest 24h moves among liquid, non-stable assets across
  // every class — what the desk greets the human with. Liquidity floor keeps
  // a 3-trade micro-cap from headlining.
  const movers = (Object.values(grouped) as OkxBrowseAsset[][])
    .flat()
    .filter((row) => row.change24h !== null && row.vol24hUsd >= 5_000_000)
    .sort((a, b) => Math.abs(b.change24h!) - Math.abs(a.change24h!))
    .slice(0, 6);
  return { classes: grouped, totalBases, movers };
}

/**
 * Query terms split by trust: `direct` terms are the user's words plus their
 * spoken-name expansions; `proxy` terms come from the financial-proxy map and
 * always downgrade the match to needs-confirmation territory.
 */
function queryTerms(query: string): { direct: string[]; proxy: string[] } {
  const normalized = normalizeQueryValue(query);
  if (!normalized) return { direct: [], proxy: [] };
  const compact = compactQueryValue(query);
  const direct = new Set<string>([normalized, compact]);
  for (const [symbol, aliases] of Object.entries(HUMAN_ALIASES)) {
    if (symbol === normalized || aliases.some((alias) => normalizeQueryValue(alias) === normalized)) {
      direct.add(symbol);
      aliases.forEach((alias) => direct.add(normalizeQueryValue(alias)));
    }
  }
  const proxy = new Set<string>();
  const proxyHit = proxyAlias(normalized);
  if (proxyHit) proxy.add(proxyHit.symbol);
  return { direct: Array.from(direct).filter(Boolean), proxy: Array.from(proxy) };
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
function fuzzyTermsFor(normalized: string, everyday?: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  for (const word of normalized.split(/\s+/)) {
    // Filler is never a typo of an asset: Italian "come" is not COMP, Spanish "como" neither.
    const bare = word.replace(/[¿?¡!.,;:'’"]/g, '');
    if (isFillerWord(bare) || everyday?.has(bareQueryValue(bare))) continue;
    const clean = word.replace(/[^A-Z0-9]/g, '');
    if (clean.length >= 4 && !/^\d+$/.test(clean)) seen.add(clean);
  }
  return Array.from(seen);
}

export type OkxMatchKind = 'exact' | 'partial' | 'proxy' | 'fuzzy';

/**
 * Score one instrument against a query and say HOW it matched. The kind is
 * the safety signal: `exact` (ticker/spoken name) analyzes straight away,
 * `proxy` (gold→XAUT, oil→USO) and `fuzzy` (typos, dictation mangles) must
 * be confirmed by the user before any analysis runs. `everyday` holds the
 * tickers that are ordinary words in the reader's language: a typo guess is
 * never made from one of them, nor towards one ("dati" is not DAI).
 */
function scoreInstrument(instrument: OkxAssetInstrument, query: string, everyday?: ReadonlySet<string>): { score: number; kind: OkxMatchKind; strong: boolean } {
  const normalized = normalizeQueryValue(query);
  const compact = compactQueryValue(query);
  if (!normalized) return { score: 0, kind: 'partial', strong: false };

  const searchText = instrument.searchText;
  const compactSearchText = compactQueryValue(searchText);
  const { direct, proxy } = queryTerms(query);

  let score = 0;
  let kind: OkxMatchKind = 'partial';
  // An exact kind can come from equality (the whole ticker, id or spoken
  // name) or only from a prefix ("SON" starts SONIC). Free text needs to
  // tell them apart: a prefix of a short word is a guess, not an answer.
  let strong = false;

  const applyTerm = (term: string, asKind: OkxMatchKind) => {
    let termScore = 0;
    if (instrument.instId === term) termScore = 1000;
    else if (instrument.symbol === term) termScore = 960;
    else if (instrument.baseSymbol === term) termScore = 940;
    else if (instrument.aliases.includes(term)) termScore = 910;
    else if (instrument.instId.startsWith(term)) termScore = 860;
    else if (instrument.symbol.startsWith(term)) termScore = 840;
    else if (searchText.includes(term)) termScore = 760;
    if (termScore > score) {
      score = termScore;
      kind = termScore >= 840 ? asKind : 'partial';
      strong = termScore >= 910 && asKind === 'exact';
    }
  };

  for (const term of direct) applyTerm(term, 'exact');
  // Proxy terms score just under direct hits: an exact user word always wins
  // over a proxy interpretation of the same query.
  for (const term of proxy) {
    const before = score;
    applyTerm(term, 'proxy');
    if (score > before) score -= 5;
  }

  if (compact && compactSearchText.includes(compact) && score < 700) {
    score = 700;
    kind = 'partial';
    strong = false;
  }

  // Fuzzy net: dictation and typos never match exactly ("SOLNA", "ETHERUM",
  // "PALANTR"). A bounded edit distance against the symbol and its spoken
  // aliases catches them, scored well below any exact/substring hit so real
  // matches always win. Priority still breaks ties toward the liquid market.
  if (!score) {
    for (const term of fuzzyTermsFor(normalized, everyday)) {
      const budget = fuzzyBudget(term);
      if (!budget) continue;
      for (const alias of instrument.aliases) {
        if (everyday?.has(alias)) continue;
        const d = editDistanceAtMost(term, alias, budget);
        if (d <= budget && 620 - d * 40 > score) {
          score = 620 - d * 40;
          kind = 'fuzzy';
          strong = false;
        }
      }
    }
  }

  if (!score) return { score: 0, kind: 'partial', strong: false };
  return { score: score + instrument.priority, kind, strong };
}

function rankInstrument(instrument: OkxAssetInstrument, query: string, everyday?: ReadonlySet<string>): number {
  return scoreInstrument(instrument, query, everyday).score;
}

export async function searchOkxInstruments(
  query: string,
  options?: {
    instTypes?: OkxSearchInstType[];
    limit?: number;
    /** The reader's language, when known: its everyday words are not typo-matched to tickers. */
    language?: unknown;
  },
): Promise<OkxAssetInstrument[]> {
  const normalized = normalizeQueryValue(query);
  if (!normalized) return [];

  const limit = Math.min(Math.max(options?.limit || 8, 1), 25);
  const allowedTypes = new Set(options?.instTypes || OKX_SEARCH_INST_TYPES);
  const catalog = await getOkxInstrumentCatalog();
  const everyday = options?.language == null ? undefined : HOMONYM_TICKERS[appLanguage(options.language)];

  return catalog
    .filter((instrument) => allowedTypes.has(instrument.instType))
    .map((instrument) => ({ instrument, score: rankInstrument(instrument, normalized, everyday) }))
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

// ---- Canonical free-text resolution (the ONE brain for phrases) ----

// Conversational filler in the six product languages — never an asset name.
// Only function words and question vocabulary: real tickers that are also
// words (ONE, NEAR, SUN, GAS, HOT…) must stay searchable. Words are matched as
// written and accent-free ("HÄLTST" → "HALTST"); an accented entry ("ÜBER",
// "MÊME") keeps its plain twin (UBER, MEME) reachable as an asset.
const QUERY_STOPWORDS = new Set([
  'QUE', 'QUÉ', 'PASA', 'PASARA', 'PASARÁ', 'CON', 'EL', 'LA', 'LO', 'LOS', 'LAS', 'DE', 'DEL',
  'UN', 'UNA', 'PARA', 'POR', 'COMO', 'CÓMO', 'VES', 'VA', 'VAN', 'HOY', 'MANANA', 'MAÑANA',
  'AHORA', 'ANALIZA', 'ANALISIS', 'ANÁLISIS', 'PRECIO', 'DAME', 'DIME', 'SOBRE', 'Y', 'O',
  'A', 'EN', 'ME', 'TE', 'SE', 'ES', 'ESTA', 'ESTÁ', 'BOBBY', 'SENAL', 'SEÑAL', 'HABLA',
  'CUENTA', 'ACTUAL', 'VER', 'VEO', 'DEBO', 'HACER', 'COMPRAR', 'VENDER', 'BUENO', 'MALO',
  'WHAT', 'ABOUT', 'WITH', 'THE', 'IS', 'PRICE', 'OF', 'HOW', 'NOW', 'TODAY', 'TOMORROW',
  // Question vocabulary (build-34 review: "¿Cuáles son…" resolved SONIC via SON).
  'SON', 'SOY', 'SUS', 'CUAL', 'CUÁL', 'CUALES', 'CUÁLES', 'RIESGO', 'RIESGOS', 'GRAFICO', 'GRÁFICO',
  'GRAFICA', 'GRÁFICA', 'TENDENCIA', 'PRINCIPALES', 'PRINCIPAL', 'ESTE', 'ESTOS', 'ESTAS', 'ESE',
  'ESO', 'PIENSAS', 'OPINAS', 'CREES', 'DEBERIA', 'DEBERÍA', 'SEMANA', 'MES', 'HAY', 'TIENE', 'PERO', 'MAS', 'MÁS',
  'ARE', 'MAIN', 'RISK', 'RISKS', 'CHART', 'CHARTS', 'CURRENT', 'TREND', 'THINK', 'SHOULD', 'DOES',
  'THIS', 'THAT', 'THESE', 'FOR', 'AND', 'WHY', 'WHEN', 'WILL', 'CAN', 'WEEK', 'MONTH', 'LOOK', 'LOOKS',
  // Market shorthand written in capitals in every language: quote currencies, "ATH", "APR", "NFT", "GMT".
  // Each is also a listed ticker, reachable by typing it alone.
  'USD', 'USDT', 'USDC', 'ATH', 'APR', 'NFT', 'NFTS', 'GMT',
  // ---- French ----
  'QUEL', 'QUELLE', 'QUELS', 'QUELLES', 'QUOI', 'QUI', 'DONT', 'COMMENT', 'POURQUOI', 'QUAND', 'EST', 'SONT', 'SUIS',
  'ETES', 'ETRE', 'ETAIT', 'SERA', 'SERAIT', 'AVOIR', 'AVEZ', 'AVONS', 'LES', 'DES', 'UNE', 'DANS', 'SUR', 'SOUS', 'AVEC',
  'SANS', 'POUR', 'PAR', 'PAS', 'PLUS', 'MOINS', 'TRES', 'BIEN', 'MAIS', 'DONC', 'CAR', 'COMME', 'CET', 'CETTE', 'CES',
  'CELA', 'CECI', 'TES', 'SES', 'NOS', 'VOS', 'LEUR', 'LEURS', 'NOTRE', 'VOTRE', 'MOI', 'TOI', 'LUI', 'ELLE', 'ELLES',
  'ILS', 'NOUS', 'VOUS', 'AUX', 'AVIS', 'PENSES', 'PENSEZ', 'PENSER', 'CROIS', 'DOIS', 'PUIS', 'PEUX', 'PEUT', 'FAUT',
  'FAIRE', 'FAIT', 'VAIS', 'VAS', 'ALLER', 'ACHETER', 'VENDRE', 'GARDER', 'INVESTIR', 'PRIX', 'COURS', 'RISQUE', 'RISQUES',
  'ANALYSE', 'ANALYSER', 'TENDANCE', 'GRAPHIQUE', 'MARCHE', 'MARCHES', 'AUJOURDHUI', 'MAINTENANT', 'DEMAIN', 'SEMAINE',
  'MOIS', 'ANNEE', 'MOMENT', 'BON', 'BONNE', 'MAUVAIS', 'ACTION', 'ACTIONS', 'ENCORE', 'DEJA', 'AUSSI', 'TOUT', 'TOUS',
  'TOUTE', 'PEU', 'BEAUCOUP', 'NON', 'OUI', 'MERCI', 'BONJOUR', 'SALUT', 'DONNE', 'PARLE', 'VRAIMENT', 'ACTUEL',
  'ACTUELLE', 'ACTUELLEMENT', 'MÊME',
  // ---- Italian ----
  'CHE', 'COSA', 'COME', 'QUALE', 'QUALI', 'QUANTO', 'PERCHE', 'DOVE', 'CHI', 'SONO', 'SIAMO', 'SIETE', 'ESSERE', 'AVERE',
  'HAI', 'HANNO', 'ABBIAMO', 'STA', 'STO', 'STAI', 'STANNO', 'FARE', 'FACCIO', 'POSSO', 'PUOI', 'PUO', 'DEVO', 'DEVI', 'DEVE',
  'DOVREI', 'VOGLIO', 'PENSI', 'PENSA', 'PENSATE', 'CREDI', 'DICI', 'DIMMI', 'PARLAMI', 'ANALIZZA', 'ANALISI', 'COMPRARE',
  'VENDERE', 'TENERE', 'INVESTIRE', 'PREZZO', 'RISCHIO', 'RISCHI', 'TENDENZA', 'MERCATO', 'MERCATI', 'OGGI', 'ADESSO',
  'ORA', 'DOMANI', 'SETTIMANA', 'MESE', 'ANNO', 'QUESTO', 'QUESTA', 'QUESTI', 'QUESTE', 'QUELLO', 'QUELLA', 'DELLA',
  'DELLO', 'DEI', 'DEGLI', 'DELLE', 'NEL', 'NELLA', 'NEI', 'NELLE', 'SUL', 'SULLA', 'SULLE', 'DAL', 'DALLA', 'DALLE',
  'ALLA', 'ALLO', 'AGLI', 'ALLE', 'PER', 'TRA', 'FRA', 'PIU', 'MENO', 'MOLTO', 'POCO', 'BENE', 'MALE', 'ANCHE', 'ANCORA',
  'GIA', 'MAI', 'SEMPRE', 'TUTTO', 'TUTTI', 'MIO', 'MIA', 'TUO', 'TUA', 'SUO', 'SUA', 'NOI', 'VOI', 'LORO', 'LEI', 'UNO',
  'GLI', 'ECCO', 'CIAO', 'GRAZIE', 'BUON', 'BUONO', 'BUONA', 'SICURO', 'OTTIMISTA', 'MOMENTO', 'AZIONE', 'AZIONI', 'CONVIENE',
  'DATI', 'DATO', 'VEDI', 'VEDO', 'DIRE',
  // ---- German ----
  'WAS', 'WIE', 'WER', 'WANN', 'WARUM', 'WIESO', 'WELCHE', 'WELCHER', 'WELCHES', 'WELCHEN', 'IST', 'SIND', 'BIN', 'BIST',
  'SEID', 'WAR', 'WAREN', 'SEIN', 'HABE', 'HAST', 'HAT', 'HABEN', 'WIRD', 'WERDEN', 'WIRST', 'WERDE', 'KANN', 'KANNST',
  'KONNEN', 'SOLL', 'SOLLTE', 'SOLLTEN', 'MUSS', 'MUSST', 'DARF', 'WILLST', 'MOCHTE', 'MACHT', 'MACHEN', 'MACHE', 'GEHT',
  'GEHEN', 'STEHT', 'SIEHT', 'AUS', 'HALTST', 'HAELTST', 'HALTEN', 'DENKST', 'MEINST', 'GLAUBST', 'FINDEST', 'SAG', 'SAGE',
  'ZEIG', 'ZEIGE', 'BITTE', 'DANKE', 'HALLO', 'DER', 'DIE', 'DAS', 'DEN', 'DEM', 'EIN', 'EINE', 'EINEN', 'EINEM', 'EINER',
  'EINES', 'UND', 'ODER', 'ABER', 'DENN', 'WEIL', 'WENN', 'DASS', 'ALS', 'AUCH', 'NOCH', 'SCHON', 'NUR', 'SEHR', 'MEHR',
  'WENIGER', 'VIEL', 'GUT', 'SCHLECHT', 'NICHT', 'KEIN', 'KEINE', 'MIT', 'OHNE', 'VON', 'VOM', 'FÜR', 'FUER', 'BEI', 'BEIM',
  'AUF', 'NACH', 'VOR', 'ÜBER', 'UEBER', 'UNTER', 'ZUM', 'ZUR', 'DURCH', 'GEGEN', 'ICH', 'SIE', 'WIR', 'IHR', 'MICH', 'DICH',
  'MIR', 'DIR', 'UNS', 'EUCH', 'MEIN', 'MEINE', 'DEIN', 'DEINE', 'DIESE', 'DIESER', 'DIESES', 'DIESEM', 'DIESEN', 'JETZT',
  'HEUTE', 'MORGEN', 'GERADE', 'AKTUELL', 'AKTUELLE', 'WOCHE', 'MONAT', 'JAHR', 'KURS', 'PREIS', 'AKTIE', 'AKTIEN', 'RISIKO',
  'RISIKEN', 'MARKT', 'ANALYSIERE', 'ANALYSIEREN', 'KAUFEN', 'VERKAUFEN', 'INVESTIEREN', 'MEINUNG', 'LOHNT', 'SICH',
  'GIBT', 'DOCH', 'MAL', 'DANN', 'HIER', 'DORT', 'GANZ', 'IMMER', 'WIEDER', 'ZEIT', 'MAN',
  // ---- Portuguese ----
  'QUAL', 'QUAIS', 'QUANDO', 'ONDE', 'QUEM', 'PORQUE', 'SAO', 'ESTAO', 'ESTOU', 'SER', 'ESTAR', 'TEM', 'TENHO', 'TEMOS',
  'TER', 'VAI', 'VOU', 'VAMOS', 'PODE', 'PODEMOS', 'DEVIA', 'DEVERIA', 'QUERO', 'ACHA', 'ACHAS', 'ACHO', 'PENSAS', 'DIZ',
  'DIGA', 'FALA', 'FALE', 'ANALISA', 'ANALISE', 'ANALISAR', 'MANTER', 'PRECO', 'RISCO', 'RISCOS', 'MERCADO', 'MERCADOS',
  'HOJE', 'AGORA', 'AMANHA', 'ANO', 'ALTURA', 'BOA', 'BOM', 'MAU', 'UNS', 'UMAS', 'DOS', 'DAS', 'NAS', 'NUM', 'NUMA',
  'PELO', 'PELA', 'COM', 'SEM', 'PRA', 'MAIS', 'MENOS', 'MUITO', 'POUCO', 'BEM', 'MAL', 'TAMBEM', 'AINDA', 'NAO', 'SIM',
  'ISTO', 'ISSO', 'ESSE', 'ESSA', 'AQUELE', 'MEU', 'MINHA', 'TEU', 'SEU', 'ELE', 'ELA', 'ELES', 'ELAS', 'VOCE', 'VOCES',
  'PENA', 'FAVOR', 'OBRIGADO', 'OLA', 'ACAO', 'ACOES', 'OPINIAO',
]);

/**
 * Tickers and spoken names that are also everyday words in one interface
 * language (French "ton avis", Italian "sei sicuro", "dai dati"; Spanish
 * "el meme del día", "el sol"; Portuguese "uma boa altura"; English "is it
 * safe", "the graph of"). Inside a sentence such a word is the asset only
 * when written in capitals ("TON"); typed alone it always is. Checked against
 * the live catalogue (672 bases, 2026-10-03); words are accent-free.
 */
// The same everyday word in all six languages (loanwords and market slang).
const EVERYDAY_ANYWHERE = [
  'ANIME', 'APP', 'BIO', 'BOT', 'CAP', 'CHIP', 'COIN', 'CORE', 'DATA', 'DEGEN', 'ETC', 'GALA', 'HYPE', 'LAYER', 'MEGA', 'MEME',
  'PROMPT', 'PUMP', 'SATS', 'SUPER', 'SUSHI', 'TEAM', 'THETA', 'TRUMP', 'TURBO', 'ZEN', 'ZOOM',
];
const HOMONYM_TICKERS: Record<AppLanguage, ReadonlySet<string>> = {
  en: new Set([...EVERYDAY_ANYWHERE,
    'ACE', 'ACT', 'ALGO', 'APE', 'ARM', 'AUCTION', 'BABY', 'BANANA', 'BAND', 'BASED', 'BAT', 'BEAT', 'BILL', 'BLEND', 'BLUR',
    'CARDS', 'CAT', 'CITY', 'COST', 'DOGS', 'DOT', 'EDGE', 'FLOW', 'FLUID', 'FLY', 'GAS', 'GIGGLE', 'GOAT', 'GRAM',
    'GRASS', 'HOME', 'HOOD', 'HOT', 'HUT', 'KITE', 'LAB', 'LIGHT', 'LINK', 'LIT', 'LITE', 'MAGIC', 'MASK', 'MET', 'MOONSHOT',
    'MOVE', 'NEAR', 'NET', 'NIGHT', 'NOT', 'OFC', 'ONE', 'ORDER', 'PEOPLE', 'PIXEL', 'PROS', 'PROVE', 'QUANT', 'RAM', 'RAVE',
    'RAY', 'RECALL', 'RENDER', 'RIOT', 'RIVER', 'SAFE', 'SAND', 'SENT', 'SHELL', 'SHOP', 'SIGN', 'SKY', 'SMH', 'SNOW', 'SOON',
    'SPACE', 'STABLE', 'SUN', 'SYRUP', 'TRUST', 'TRUTH', 'USELESS', 'VINE', 'VIRTUAL', 'WEN', 'WET', 'WIN',
    // Spoken names that are ordinary English words: "the graph of Bitcoin" is not The Graph.
    'COMPOUND', 'CURVE', 'FETCH', 'GRAPH', 'IMMUTABLE', 'OPTIMISM', 'SANDBOX', 'STACKS', 'STELLAR', 'STRATEGY']),
  es: new Set([...EVERYDAY_ANYWHERE,
    'ALGO', 'BANANA', 'CIEN', 'DIA', 'ERA', 'GAS', 'LEO', 'LINEA', 'LINK', 'LUNA', 'META', 'MINA', 'MODERNA', 'PARTI', 'PROS', 'ROBO',
    'SOL', 'SOLO', 'TIA', 'USAR', 'USO', 'VALE', 'VELO', 'VINE', 'VIRTUAL']),
  fr: new Set([...EVERYDAY_ANYWHERE,
    'ALLO', 'BAT', 'DIS', 'FIL', 'LIT', 'MET', 'META', 'MON', 'NET', 'ONT', 'ORDI', 'PARTI', 'PEOPLE', 'PLUME', 'PROS', 'QUANT',
    'SENT', 'STABLE', 'TON', 'VELO']),
  it: new Set([...EVERYDAY_ANYWHERE,
    'BANANA', 'DAI', 'DIA', 'ERA', 'GAS', 'LIDO', 'LINEA', 'LINK', 'LUNA', 'META', 'MINA', 'MODERNA', 'PARTI', 'PROVE', 'SEI',
    'SOLO', 'SUI', 'USO', 'VALE', 'VELO']),
  pt: new Set([...EVERYDAY_ANYWHERE,
    'ALGO', 'BANANA', 'DAI', 'DIA', 'ERA', 'FOGO', 'GAS', 'LIDO', 'LINK', 'META', 'MINA', 'MODERNA', 'MOVE', 'PARTI', 'PROS',
    'PROVE', 'ROBO', 'SEI', 'SOL', 'SOLO', 'TAO', 'TIA', 'UMA', 'USAR', 'USO', 'VALE', 'VIRTUAL']),
  de: new Set([...EVERYDAY_ANYWHERE,
    'ACH', 'ALT', 'ARM', 'BAND', 'BAT', 'BRETT', 'EIGEN', 'GAS', 'GRAPH', 'HUT', 'LINK', 'NOT', 'ORDER', 'SAFE', 'SAND', 'SEI', 'SHOP',
    'SOLO', 'TON', 'UNI', 'WAL', 'WEN']),
};

// A caller that does not say its language is not assumed to speak English: only the shared words apply.
const EVERYDAY_UNKNOWN: ReadonlySet<string> = new Set(EVERYDAY_ANYWHERE);

// Spoken names of more than one word ("BITCOIN CASH"): read as a unit, so "Bitcoin Cash" is never read as Bitcoin.
const MULTIWORD_NAMES = new Set(Object.values(HUMAN_ALIASES).flat().filter((alias) => alias.includes(' ')));

/** A word, or every part of a hyphenated one ("penses-tu", "est-ce"), is filler or too short to name an asset. */
function isFillerWord(word: string): boolean {
  return word.split('-').every((part) => part.length < 3 || QUERY_STOPWORDS.has(part) || QUERY_STOPWORDS.has(bareQueryValue(part)));
}

export interface OkxResolvedAsset {
  instrument: OkxAssetInstrument;
  matchKind: OkxMatchKind;
  matchedTerm: string;
  /** Anything but one asset named outright must be confirmed by the user before analysis. */
  needsConfirmation: boolean;
  /** For proxy matches: what the instrument actually is, in plain words. */
  proxyNote: string | null;
  /** Only when the text names more than one asset: all of them in the order named, `instrument` first. */
  candidates?: OkxAssetInstrument[];
}

type ScoredMatch = { instrument: OkxAssetInstrument; score: number; kind: OkxMatchKind; strong: boolean };

async function bestScoredMatch(
  query: string,
  allowedTypes: Set<OkxSearchInstType>,
  everyday?: ReadonlySet<string>,
): Promise<ScoredMatch | null> {
  const catalog = await getOkxInstrumentCatalog();
  let best: ScoredMatch | null = null;
  for (const instrument of catalog) {
    if (!allowedTypes.has(instrument.instType)) continue;
    const { score, kind, strong } = scoreInstrument(instrument, query, everyday);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && instrument.priority > best.instrument.priority)) {
      best = { instrument, score, kind, strong };
    }
  }
  return best;
}

/**
 * Resolve free text ("que pasa con eterium", "taiwan semiconductor hoy") to
 * one instrument with an honest match kind. Only an unambiguous request is
 * answered without confirmation: the whole text is a name or ticker, or the
 * sentence names exactly one asset outright (a whole ticker, id or spoken
 * name). Every asset the sentence names is collected, not just the first: two
 * of them ("Bitcoin and Ethereum") come back as candidates to confirm. A
 * commodity word (gold, oil) stands for its proxy and is always confirmed.
 * Anything weaker (a prefix, a substring, a typo) is a guess: confirmed in a
 * sentence, and never made from filler or from an everyday word.
 */
export async function resolveOkxAssetFromText(
  text: string,
  options?: {
    instTypes?: OkxSearchInstType[];
    language?: unknown;
    /** The text is what is left of a longer sentence (another asset's name was taken out): no word of it stands alone. */
    sentence?: boolean;
  },
): Promise<OkxResolvedAsset | null> {
  const allowedTypes = new Set(options?.instTypes || OKX_SEARCH_INST_TYPES);
  text = text.normalize('NFC');
  // The interface language decides which tickers are also ordinary words; unknown, only those shared by all six.
  const language = appLanguage(options?.language);
  const homonyms = options?.language == null ? EVERYDAY_UNKNOWN : HOMONYM_TICKERS[language];
  // Words the user wrote in capitals. A sentence typed entirely in capitals says nothing.
  const capitals = new Set(text !== text.toUpperCase() ? text.match(/(?<![\p{L}\p{N}])[\p{Lu}\p{N}]{2,}(?![\p{L}\p{N}])/gu) ?? [] : []);
  // Possessives and Romance elisions are word boundaries, not ticker prefixes:
  // NVIDIA's → NVIDIA; l'Ethereum / dell'Ethereum → Ethereum. Keep the original
  // provider ids such as BTC-USDT intact. Only unambiguous names/tickers with
  // explicit German financial suffixes are split; gas-free, near-term and one-week
  // are ordinary prose and must not turn into GAS, NEAR or ONE token requests.
  // A pair written as traders do ("BTC/USDT", "BTCUSDT") names its base.
  const upper = COMMODITY_PHRASES.reduce((value, [phrase, word]) => value.replace(phrase, word), normalizeQueryValue(text))
    .replace(/([A-Z0-9])['’]S\b/g, '$1')
    .replace(/\b(?:L|D|QU|J|N|C|S|M|T|UN|DELL|ALL|NELL|SULL|DALL|COS|COM|DOV)['’](?=[A-ZÀ-Ý])/g, '')
    .replace(/[¿?¡!.,;:'’"«»“”()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!upper) return null;

  const tokens = upper.split(' ')
    .map(word => /^(BITCOIN|BTC|ETHEREUM|ETH|SOLANA|SOL|NVIDIA|NVDA)-(?:PREIS|KURS|CHART|AKTIE|RISIKO|RISIKEN)$/.exec(word)?.[1]
      ?? /^([A-Z0-9]{2,10})\/?(?:USDT|USDC)$/.exec(word)?.[1] ?? word);
  const sentence = tokens.length > 1 || options?.sentence === true;
  // A lone word left over from a longer sentence is weighed below as a word of it, not as the whole text.
  const leftover = sentence && tokens.length === 1;
  // An everyday word of the reader's language is the asset only in capitals (or alone, as the whole text).
  const everyday = (word: string) => homonyms.has(bareQueryValue(word)) && !capitals.has(word);
  const describe = (hit: ScoredMatch, term: string, needsConfirmation: boolean): OkxResolvedAsset => {
    const proxy = hit.kind === 'proxy' ? proxyAlias(term) : undefined;
    return {
      instrument: hit.instrument,
      matchKind: hit.kind,
      matchedTerm: term,
      needsConfirmation,
      proxyNote: proxy ? ((options?.language != null && proxy.notes?.[language]) || proxy.note) : null,
    };
  };

  // The whole text is one name or ticker ("ton", "Bitcoin Cash", "BTC-USDT"): nothing to weigh.
  const whole = leftover ? null : await bestScoredMatch(upper, allowedTypes, homonyms);
  if (whole?.kind === 'exact' && whole.strong) return describe(whole, upper, false);

  // `named`: every asset the text names outright. `guess`: the best of what merely looks like one.
  const named: Array<{ hit: ScoredMatch; term: string; at: number }> = [];
  let guess = null as { resolved: OkxResolvedAsset; rank: number } | null;
  const weigh = (hit: ScoredMatch | null, term: string, at: number) => {
    if (!hit) return;
    if (hit.kind === 'proxy' || (hit.kind === 'exact' && hit.strong)) {
      const same = named.find((entry) => entry.hit.instrument.symbol === hit.instrument.symbol);
      if (!same) named.push({ hit, term, at });
      else if (same.hit.kind === 'proxy' && hit.kind === 'exact') Object.assign(same, { hit, term });
      return;
    }
    // In a sentence a short word, or an everyday word even in capitals, is an asset only as a whole ticker or
    // name: "sell" is not Russell, "CAC" is not Coca-Cola, and an unlisted "TON" is not ONDO.
    if (sentence && (term.length <= 4 || homonyms.has(bareQueryValue(term)))) return;
    // A prefix-only "exact" hit from a short word is as much a guess as a short substring ("GLD" inside AGLD).
    const shortPrefix = hit.kind === 'exact' && term.length <= 4;
    const needsConfirmation = sentence || hit.kind === 'fuzzy' || shortPrefix || (hit.kind === 'partial' && term.length <= 4);
    // Prefix exact (long word) > short prefix guess > partial > fuzzy.
    const rank = hit.kind === 'exact' ? (shortPrefix ? 1.5 : 3) : hit.kind === 'partial' ? 1 : 0;
    if (!guess || rank > guess.rank) guess = { resolved: describe(hit, term, needsConfirmation), rank };
  };
  // Short of a whole name the text is still a search ("son", "pop m"): its best look-alike is offered. A typo
  // guess over a whole sentence is only its words again, weighed one by one below.
  if (!sentence || whole?.kind !== 'fuzzy') weigh(whole, upper, 0);

  // Names of several words first, so "Bitcoin Cash" is one asset and not Bitcoin plus a stray word.
  const taken = new Set<number>();
  for (let size = 3; size >= 2; size--) {
    for (let i = 0; size < tokens.length && i + size <= tokens.length; i++) {
      const span = tokens.slice(i, i + size);
      const name = span.join(' ');
      if (!MULTIWORD_NAMES.has(name) || span.some((word, k) => taken.has(i + k) || QUERY_STOPWORDS.has(word))) continue;
      const hit = await bestScoredMatch(name, allowedTypes, homonyms);
      if (!(hit?.kind === 'exact' && hit.strong)) continue;
      weigh(hit, name, i);
      span.forEach((_, k) => taken.add(i + k));
    }
  }
  // Three characters minimum per word: "in video" must not resolve INJ via "IN".
  const weighed = new Set(leftover ? [] : [upper]);
  for (const [i, word] of tokens.entries()) {
    if (taken.has(i) || weighed.has(word) || isFillerWord(word) || everyday(word)) continue;
    weighed.add(word);
    weigh(await bestScoredMatch(word, allowedTypes, homonyms), word, i);
  }

  // Two assets in one question: never pick silently. The first one named leads the confirmation, a full name
  // or plain ticker ahead of an everyday word in capitals ("do NOT buy Bitcoin").
  const ordinary = (term: string) => Number(homonyms.has(bareQueryValue(term)));
  named.sort((a, b) => ordinary(a.term) - ordinary(b.term) || a.at - b.at);
  if (named.length > 1) {
    return { ...describe(named[0].hit, named[0].term, true), candidates: named.map((entry) => entry.hit.instrument) };
  }
  if (named.length === 1) return describe(named[0].hit, named[0].term, named[0].hit.kind === 'proxy');
  return guess?.resolved ?? null;
}

/** SPOT + SWAP venues for one base symbol, from the cached catalog. */
export async function getBaseVenues(symbol: string): Promise<{ spotId: string | null; swapId: string | null }> {
  const upper = normalizeQueryValue(symbol);
  const catalog = await getOkxInstrumentCatalog();
  let spotId: string | null = null;
  let swapId: string | null = null;
  for (const instrument of catalog) {
    if (instrument.symbol !== upper) continue;
    if (!spotId && instrument.instType === 'SPOT' && instrument.quoteSymbol === 'USDT') spotId = instrument.instId;
    if (!swapId && instrument.instType === 'SWAP' && instrument.instId.includes('-USDT-')) swapId = instrument.instId;
    if (spotId && swapId) break;
  }
  return { spotId, swapId };
}

// ---- Deterministic test hooks (fixtures instead of the network) ----

/** Install a synthetic catalog; instruments go through the real normalizer. */
export function __setTestCatalog(raw: RawOkxInstrument[]): void {
  const instruments = raw
    .map(normalizeInstrument)
    .filter((item): item is OkxAssetInstrument => Boolean(item))
    .sort((a, b) => b.priority - a.priority);
  catalogCache = { fetchedAt: Date.now(), expiresAt: Date.now() + 1e12, instruments };
}

export function __setTestVolumes(
  entries: Array<[string, { volUsd: number; last: number | null; change24h?: number | null }]>,
): void {
  const normalized = entries.map(([symbol, value]) => [
    symbol,
    { ...value, change24h: value.change24h ?? null },
  ] as const);
  volumeCache = { expiresAt: Date.now() + 1e12, bySymbol: new Map(normalized) };
}

export function getCatalogAgeMs(): number | null {
  if (!catalogCache) return null;
  return Date.now() - catalogCache.fetchedAt;
}
