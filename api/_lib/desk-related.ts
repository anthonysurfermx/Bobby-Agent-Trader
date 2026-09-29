// ============================================================
// Related assets for "what else is in this sector?" — a small peer set from the configured exposures
// (src/lib/asset-exposures.ts) with CURRENT market data for each, loaded only when the question asks for it.
// The same daily statistics are computed for the asked asset, so the CIO compares like with like. Peers are
// context for comparison, never a ranking of what to buy; a peer whose data is missing or stale is dropped, and
// the desk says so when none is left.
// ============================================================
import { EXPOSURE_LABEL, exposuresOf, peersOf } from '../../src/lib/asset-exposures.js';
import { getVoiceAsset, isEquitySymbol } from '../../src/lib/voice-assets.js';
import type { Candle } from '../../src/lib/market-indicators.js';
import { fetchCandles } from './desk-debate.js';

type Lang = 'en' | 'es' | 'pt';

/** The question asks about the sector, alternatives, similar assets or a comparison. */
const RELATED_INTENT = /(\bsector\b|\bsetor\b|industr|alternativ|similar|parecid|semelhant|competi|\bpeers?\b|\brivals?\b|\brivales\b|compar|\bvs\.?\b|versus|qu[eé] m[aá]s|what else|o que mais|other (companies|stocks|coins|assets)|otr[oa]s? (empresas|acciones|monedas|criptos?|activos)|outr[oa]s? (empresas|a[cç][oõ]es|moedas|ativos)|en vez de|instead of|em vez de)/i;
export const asksForRelated = (question: string): boolean => RELATED_INTENT.test(question);

export interface DailyStats {
  symbol: string; name: string;
  price: number; change5dPct: number | null; change1mPct: number | null;
  /** Where the last close sits against its 20-day EMA. */
  vsEma20: 'above' | 'below' | 'at';
  asOf: string;
}
export interface RelatedPeer extends DailyStats { sharedExposure: string }
export interface RelatedEvidence {
  /** The asked asset's own exposures, in the answer's language. */
  exposures: string[];
  self: DailyStats | null;
  peers: RelatedPeer[];
  /** Peers configured but left out because their data was missing or stale. */
  unavailable: string[];
}

const pct = (a: number, b: number) => Math.round((a / b - 1) * 1000) / 10;

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  return values.reduce((prev, v, i) => (i === 0 ? v : v * k + prev * (1 - k)), values[0]);
}

/** Daily statistics from daily candles; null when there are too few bars or they are stale. */
export function dailyStats(symbol: string, candles: Candle[], equity: boolean, now = Date.now()): DailyStats | null {
  if (candles.length < 21) return null;
  const last = candles.at(-1)!;
  if (now / 1000 - last.time > (equity ? 5 : 2) * 86_400 || last.time > now / 1000 + 60) return null;
  const closes = candles.map((c) => c.close);
  const price = last.close;
  // A month is ~21 sessions for a stock and 30 days for a coin.
  const monthBack = equity ? 21 : 30;
  const e20 = ema(closes.slice(-60), 20);
  const gap = (price - e20) / e20;
  return {
    symbol, name: getVoiceAsset(symbol)?.name ?? symbol, price,
    change5dPct: closes.length > 5 ? pct(price, closes[closes.length - 6]) : null,
    change1mPct: closes.length > monthBack ? pct(price, closes[closes.length - 1 - monthBack]) : null,
    vsEma20: Math.abs(gap) < 0.002 ? 'at' : gap > 0 ? 'above' : 'below',
    asOf: new Date(last.time * 1000).toISOString(),
  };
}

async function loadDaily(symbol: string): Promise<DailyStats | null> {
  const equity = isEquitySymbol(symbol);
  const path = equity
    ? `/api/stock-candles?symbol=${encodeURIComponent(symbol)}&range=90d&interval=1d`
    : `/api/okx-candles?instId=${encodeURIComponent(symbol)}-USDT&bar=1D&limit=60`;
  try { return dailyStats(symbol, await fetchCandles(path), equity); } catch { return null; }
}

/** The peer set with current data, or null when the asset has no configured exposures. Never throws. */
export async function loadRelated(symbol: string, language: Lang, timeoutMs = 6000): Promise<RelatedEvidence | null> {
  const own = exposuresOf(symbol);
  if (!own.length) return null;
  const peers = peersOf(symbol, 3);
  const label = (e: keyof typeof EXPOSURE_LABEL) => EXPOSURE_LABEL[e][language];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const [self, ...rows] = await Promise.all([symbol, ...peers.map((p) => p.symbol)].map((s) => Promise.race([loadDaily(s), timeout])))
    .finally(() => clearTimeout(timer));
  const loaded: RelatedPeer[] = [];
  const unavailable: string[] = [];
  peers.forEach((p, i) => {
    const row = rows[i];
    if (row) loaded.push({ ...row, sharedExposure: label(p.exposure) });
    else unavailable.push(p.symbol);
  });
  return { exposures: own.map(label), self, peers: loaded, unavailable };
}

/** The CIO's rule for evidence.related, sent only when it is present. */
export const RELATED_RULE = "related is sent because the question asks about the sector, alternatives or a comparison: related.exposures are the asked asset's business exposures (an asset can have several; do not assume which one the reader means), related.self and related.peers hold the same daily market data for the asked asset and for peers that share one exposure each (sharedExposure). Compare them only with those numbers: name each peer's shared exposure, one difference in its recent move or trend against its 20-day average, and what makes it a different bet. Never rank them as what to buy, never call one better, never recommend switching. When related.peers is empty or some are in related.unavailable, say that current data for those peers is not available. The verdict and direction are about the asked asset only.";
