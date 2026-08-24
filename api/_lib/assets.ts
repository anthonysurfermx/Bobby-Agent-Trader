// ============================================================
// api/_lib/assets.ts — Multi-asset resolver (OKX catalog)
// ------------------------------------------------------------
// Maps a free-text query ("que pasa con NVIDIA", "oro", "SOL")
// to the right OKX instrument across the FULL universe OKX lists:
// all crypto (SPOT), 72 stock tokens (NVDA/AAPL/TSLA… as SWAP),
// metals, forex, commodities. No hardcoded instIds — resolved
// against the live OKX instrument catalog (cached 15 min).
// ============================================================

const OKX = 'https://www.okx.com';
const TTL_MS = 15 * 60 * 1000;

export type AssetKind = 'crypto' | 'stock' | 'metal' | 'forex' | 'commodity' | 'bond' | 'other';

export interface ResolvedAsset {
  base: string;          // BTC, NVDA, XAUT…
  instId: string;        // BTC-USDT, NVDA-USDT-SWAP…
  instType: 'SPOT' | 'SWAP';
  kind: AssetKind;
  display: string;       // human label
  perpInstId: string | null; // swap for funding/OI (crypto)
}

interface BaseEntry {
  base: string;
  spot: string | null;
  swap: string | null;
  cat: string | null; // OKX instCategory: 3 stock, 4 metal, 5 commodity, 6 forex, 7 bond
}

let cache: { at: number; byBase: Map<string, BaseEntry> } | null = null;

// Human names → OKX base ticker (Spanish + English).
const ALIASES: Record<string, string> = {
  // crypto
  BITCOIN: 'BTC', ETHEREUM: 'ETH', ETHER: 'ETH', SOLANA: 'SOL', RIPPLE: 'XRP',
  DOGECOIN: 'DOGE', CARDANO: 'ADA', POLKADOT: 'DOT', CHAINLINK: 'LINK',
  AVALANCHE: 'AVAX', LITECOIN: 'LTC', POLYGON: 'POL', SHIBA: 'SHIB', TONCOIN: 'TON',
  // stocks (company → ticker)
  NVIDIA: 'NVDA', APPLE: 'AAPL', TESLA: 'TSLA', AMAZON: 'AMZN', GOOGLE: 'GOOGL',
  ALPHABET: 'GOOGL', MICROSOFT: 'MSFT', FACEBOOK: 'META', INSTAGRAM: 'META',
  BROADCOM: 'AVGO', NETFLIX: 'NFLX', COINBASE: 'COIN', MICROSTRATEGY: 'MSTR',
  STRATEGY: 'MSTR', PALANTIR: 'PLTR', GAMESTOP: 'GME', INTEL: 'INTC', ORACLE: 'ORCL',
  ADOBE: 'ADBE', COSTCO: 'COST', CISCO: 'CSCO', CROWDSTRIKE: 'CRWD', ROBINHOOD: 'HOOD',
  // metals / commodities / forex
  ORO: 'XAUT', GOLD: 'XAUT', XAU: 'XAUT', PLATA: 'XAG', SILVER: 'XAG',
  PETROLEO: 'OIL', OIL: 'OIL', CRUDO: 'OIL', EURO: 'EUR',
  // Dictation mangles — what es-MX/en-US speech recognition actually outputs
  // when people SAY a ticker (observed in the iOS app: "Ethereum" spoken with
  // a Spanish accent came back as "Cherry"). Resolving a mangled major beats
  // failing or matching an exotic token. Aliases deliberately outrank bare
  // ticker matches here, so these words map to the major even if OKX ever
  // lists an identically-named token.
  ETHERIUM: 'ETH', ETERIUM: 'ETH', ITERIUM: 'ETH', ETERIO: 'ETH', ETEREO: 'ETH',
  CHERIUM: 'ETH', CHERRY: 'ETH',
  ENVIDIA: 'NVDA', INVIDIA: 'NVDA',
  VITCOIN: 'BTC', BITCOM: 'BTC', BITCON: 'BTC',
  DOGUECOIN: 'DOGE', DOGCOIN: 'DOGE',
};

const STOPWORDS = new Set([
  'QUE', 'QUÉ', 'PASA', 'PASARA', 'PASARÁ', 'CON', 'EL', 'LA', 'LO', 'LOS', 'LAS', 'DE', 'DEL',
  'UN', 'UNA', 'PARA', 'POR', 'COMO', 'CÓMO', 'VES', 'VA', 'VAN', 'HOY', 'MANANA', 'MAÑANA',
  'AHORA', 'ANALIZA', 'ANALISIS', 'ANÁLISIS', 'PRECIO', 'DAME', 'DIME', 'SOBRE', 'Y', 'O',
  'A', 'EN', 'ME', 'TE', 'SE', 'ES', 'ESTA', 'ESTÁ', 'BOBBY', 'SENAL', 'SEÑAL', 'HABLA',
  'CUENTA', 'ACTUAL', 'VER', 'VEO', 'DEBO', 'HACER', 'COMPRAR', 'VENDER', 'BUENO', 'MALO',
  'WHAT', 'ABOUT', 'WITH', 'THE', 'IS', 'PRICE', 'OF', 'HOW', 'NOW', 'TODAY', 'TOMORROW',
]);

function norm(v: string): string {
  return v.trim().toUpperCase().replace(/[¿?¡!.,;:]/g, '');
}

async function okxInstruments(instType: 'SPOT' | 'SWAP'): Promise<any[]> {
  try {
    const res = await fetch(`${OKX}/api/v5/public/instruments?instType=${instType}`);
    if (!res.ok) return [];
    const j = (await res.json()) as { code?: string; data?: any[] };
    return j?.code === '0' ? j.data || [] : [];
  } catch {
    return [];
  }
}

async function getCatalog(): Promise<Map<string, BaseEntry>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.byBase;

  const [spot, swap] = await Promise.all([okxInstruments('SPOT'), okxInstruments('SWAP')]);
  const byBase = new Map<string, BaseEntry>();

  // Crypto SPOT: prefer USDT pairs (clean bases like BTC, SOL, XAUT).
  for (const i of spot) {
    if ((i.state || '') !== 'live' || i.quoteCcy !== 'USDT') continue;
    const base = String(i.baseCcy || '').toUpperCase();
    if (!base) continue;
    const e = byBase.get(base) || { base, spot: null, swap: null, cat: null };
    e.spot = i.instId;
    byBase.set(base, e);
  }
  // SWAP: stocks/metals/forex/commodities (USDT-margined). Base from instId.
  for (const i of swap) {
    if ((i.state || '') !== 'live' || i.settleCcy !== 'USDT') continue;
    const base = String(i.instId).toUpperCase().split('-')[0];
    if (!base) continue;
    const e = byBase.get(base) || { base, spot: null, swap: null, cat: null };
    e.swap = i.instId;
    if (i.instCategory && i.instCategory !== '1') e.cat = i.instCategory;
    byBase.set(base, e);
  }

  cache = { at: Date.now(), byBase };
  return byBase;
}

function kindFromCat(cat: string | null, hasSpot: boolean): AssetKind {
  switch (cat) {
    case '3': return 'stock';
    case '4': return 'metal';
    case '5': return 'commodity';
    case '6': return 'forex';
    case '7': return 'bond';
    default: return hasSpot ? 'crypto' : 'crypto';
  }
}

function toResolved(e: BaseEntry): ResolvedAsset {
  const kind = kindFromCat(e.cat, !!e.spot);
  // Crypto trades on SPOT; everything else (stock/metal/fx) is SWAP-only.
  const useSpot = kind === 'crypto' && e.spot;
  const instId = useSpot ? (e.spot as string) : (e.swap || e.spot) as string;
  const instType: 'SPOT' | 'SWAP' = instId.endsWith('-SWAP') ? 'SWAP' : 'SPOT';
  return {
    base: e.base,
    instId,
    instType,
    kind,
    display: e.base,
    perpInstId: e.swap,
  };
}

/** Resolve a free-text query to an OKX asset, or null (→ general market). */
export async function resolveAssetFromText(text: string): Promise<ResolvedAsset | null> {
  const byBase = await getCatalog();
  if (byBase.size === 0) return null;

  // Candidate tokens: aliases first (multi-word names), then bare words.
  const upper = norm(text);
  const words = upper.split(/\s+/).filter((w) => w && !STOPWORDS.has(w));

  const candidates: string[] = [];
  // whole-phrase alias (e.g. "META PLATFORMS")
  if (ALIASES[upper]) candidates.push(ALIASES[upper]);
  for (const w of words) {
    if (ALIASES[w]) candidates.push(ALIASES[w]);
    candidates.push(w);
  }

  for (const c of candidates) {
    const e = byBase.get(c);
    if (e && (e.spot || e.swap)) return toResolved(e);
  }
  return null;
}

/** True if the user is asking about the market in general (no specific asset). */
export function isMarketQuery(text: string): boolean {
  const t = text.toLowerCase();
  return /\bmercado\b|\bmarket\b|\bma(ñ|n)ana\b|\bhoy\b|\bgeneral\b|qu[eé] va a pasar|c[oó]mo (est|va|viene)/.test(t);
}
