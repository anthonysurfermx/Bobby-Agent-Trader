// ============================================================
// Related assets for "what else is in this sector?" — a small peer set from the configured exposures
// (src/lib/asset-exposures.ts) with CURRENT market data for each, loaded only when the question asks for it.
// The same daily statistics are computed for the asked asset, so the CIO compares like with like. Peers are
// context for comparison, never a ranking of what to buy; a peer whose data is missing or stale is dropped, and
// the desk says so when none is left.
// ============================================================
import { EXPOSURE_LABEL, exposuresOf, peersOf, sharedExposures } from '../../src/lib/asset-exposures.js';
import { assetsInText, getVoiceAsset, isEquitySymbol } from '../../src/lib/voice-assets.js';
import type { Candle } from '../../src/lib/market-indicators.js';
import { fetchCandles } from './desk-debate.js';

type Lang = 'en' | 'es' | 'pt';

/**
 * The question asks about the sector, alternatives, competitors or a comparison, as a phrase (word-bounded; a
 * bare "compare" inside another word or "instead of" alone does not count).
 */
const RELATED_INTENT = new RegExp([
  String.raw`\b(?:sector|setor|industry|industria|ind[uú]stria)\b`,
  String.raw`\b(?:alternativ(?:e|es|a|as|o|os))\b`,
  String.raw`\b(?:similar(?:es)?|parecid[oa]s?|semelhantes?)\s+(?:a|to|com|companies|stocks|coins|empresas|acciones|a[cç][oõ]es)\b`,
  String.raw`\b(?:competitors?|competidor(?:es)?|competidora?s?|concorrentes?|rivals?|rivales|peers?)\b`,
  String.raw`\b(?:compite|compete|competem)\s+con\b|\bcompetes?\s+with\b`,
  String.raw`\b(?:compar(?:e|es|ed|ing|ison|a|ar|ado|ación|ação|ando))\b`,
  String.raw`\bqu[eé]\s+m[aá]s\s+(?:hay|empresas|acciones|monedas|opciones|criptos?|activos)\b`,
  String.raw`\bwhat\s+else\s+(?:is\s+)?(?:in|like|similar|compares)\b`,
  String.raw`\bo\s+que\s+mais\s+(?:tem|h[aá]|existe)\b`,
  String.raw`\b(?:other|another)\s+(?:companies|company|stocks?|coins?|assets?|names)\b`,
  String.raw`\botr[oa]s?\s+(?:empresas?|acci[oó]n(?:es)?|monedas?|criptos?|activos?)\b`,
  String.raw`\boutr[oa]s?\s+(?:empresas?|a[cç][aã]o|a[cç][oõ]es|moedas?|ativos?)\b`,
].join('|'), 'iu');
/** "AMZN vs META", "Amazon o Microsoft", "NVDA or AMD": two assets and a comparison word between them. */
const PAIR = /\b(?:vs\.?|versus|or|o|ou|contra|against)\b/iu;

/** Assets named in the question other than the asked one, in order (at most 3). */
export const namedPeers = (question: string, symbol: string): string[] => assetsInText(question).filter((s) => s !== symbol).slice(0, 3);

/** Whether this question asks for related assets: a sector/alternatives phrase, or another asset named with vs/or. */
export function asksForRelated(question: string, symbol: string): boolean {
  if (RELATED_INTENT.test(question)) return true;
  return namedPeers(question, symbol).length > 0 && PAIR.test(question);
}

export interface DailyStats {
  symbol: string; name: string;
  price: number; change5dPct: number | null; change1mPct: number | null;
  /** Where the last close sits against its 20-day EMA. */
  vsEma20: 'above' | 'below' | 'at';
  asOf: string;
}
export interface RelatedPeer extends DailyStats {
  /** The exposure it shares with the asked asset, in the reader's language; null for an asset the question named that shares none. */
  sharedExposure: string | null;
  /** The question named it (it is compared first). */
  named: boolean;
}
export interface RelatedEvidence {
  /** The asked asset's own exposures, in the answer's language. */
  exposures: string[];
  self: DailyStats | null;
  peers: RelatedPeer[];
  /** Peers configured but left out because their data was missing or stale. */
  unavailable: string[];
  /** True when Bobby has no comparable assets for this one (none configured, none named). */
  noPeers: boolean;
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

/**
 * The peer set with current data: first the assets the question named, then one configured peer per exposure,
 * three in all. Never throws. Assets outside the classified universe with nothing named get `noPeers`.
 */
export async function loadRelated(symbol: string, language: Lang, question = '', timeoutMs = 6000): Promise<RelatedEvidence> {
  const own = exposuresOf(symbol);
  const label = (e: keyof typeof EXPOSURE_LABEL) => EXPOSURE_LABEL[e][language];
  const named = namedPeers(question, symbol).map((s) => ({ symbol: s, exposure: sharedExposures(symbol, s)[0] ?? null, named: true }));
  const configured = peersOf(symbol, 3).filter((p) => !named.some((n) => n.symbol === p.symbol)).map((p) => ({ ...p, named: false }));
  const peers = [...named, ...configured].slice(0, 3);
  if (!peers.length) return { exposures: own.map(label), self: null, peers: [], unavailable: [], noPeers: true };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const [self, ...rows] = await Promise.all([symbol, ...peers.map((p) => p.symbol)].map((s) => Promise.race([loadDaily(s), timeout])))
    .finally(() => clearTimeout(timer));
  const loaded: RelatedPeer[] = [];
  const unavailable: string[] = [];
  peers.forEach((p, i) => {
    const row = rows[i];
    if (row) loaded.push({ ...row, sharedExposure: p.exposure ? label(p.exposure) : null, named: p.named });
    else unavailable.push(p.symbol);
  });
  return { exposures: own.map(label), self, peers: loaded, unavailable, noPeers: false };
}

/** The rule for `related` (Red Team and the CIO), sent only when it is present. */
export const RELATED_RULE = "related is sent because the question asks about the sector, alternatives or a comparison. related.exposures are the asked asset's business exposures (an asset can have several; do not assume which one the reader means). related.self and related.peers hold the same daily market data (price, change over 5 days and about a month, where the last close sits against its 20-day average, asOf) for the asked asset and each peer; each peer's numbers belong only to that peer's symbol at its asOf. A peer with named true is one the reader named; sharedExposure says what it has in common with the asked asset (null: nothing configured in common, say so). Compare only with those numbers: for each peer, what it shares, one difference in its recent move or its trend, and what makes it a different bet. Never rank them as what to buy, never call one better, never suggest switching, rotating or moving money between them. When related.noPeers is true, say Bobby has no comparable assets set up for this one yet; when related.unavailable lists peers, say current data for them is not available now. The verdict and direction are about the asked asset only.";
