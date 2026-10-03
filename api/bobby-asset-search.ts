import { REGIONAL_STOCKS, isListedStockSymbol, isRegionalHomonym, regionalDefaults, regionalMentions, resolveRegionalStock, searchRegionalStocks, type RegionalStock } from '../src/lib/regional-stocks.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  browseOkxAssets,
  getCatalogAgeMs,
  OKX_SEARCH_INST_TYPES,
  resolveOkxAssetFromText,
  searchOkxInstruments,
  type OkxAssetInstrument,
  type OkxSearchInstType,
} from '../src/lib/okx-asset-search.js';

export const config = { maxDuration: 15 };

function stockResult(stock: RegionalStock) {
  return { instId: stock.symbol, instType: 'EQUITY', symbol: stock.symbol, baseSymbol: stock.symbol,
    quoteSymbol: stock.currency, settleSymbol: null, family: null, underlying: null, assetClass: 'equity' as const,
    displaySymbol: stock.symbol, displayName: stock.name, name: stock.name, aliases: stock.aliases,
    currency: stock.currency, exchange: stock.exchange, provider: 'yahoo', state: 'listed', priority: 100,
    // Discovery lists an instrument; it never supplies a cached or invented price.
    last: null, change24h: null, vol24hUsd: 0, searchText: [stock.symbol, stock.name, ...stock.aliases].join(' ') };
}

const equitySearchCache = new Map<string, { until: number; stocks: RegionalStock[] }>();
/** Public discovery only: provider-confirmed identifiers; prices still come from the quote endpoint. */
async function providerStocks(q: string): Promise<RegionalStock[]> {
  if (q.length > 80) return [];
  const cached = equitySearchCache.get(q);
  if (cached && cached.until > Date.now()) return cached.stocks;
  const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bobby/1.7)' }, signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return [];
  const payload = await response.json() as { quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }> };
  const suffixes: Record<string, RegionalStock['region']> = { PA: 'FR', LS: 'PT', SA: 'BR', MI: 'IT', DE: 'DE' };
  const exchanges = { FR: 'Euronext Paris', PT: 'Euronext Lisbon', BR: 'B3 São Paulo', IT: 'Euronext Milan', DE: 'Xetra' };
  const stocks: RegionalStock[] = [];
  for (const quote of payload.quotes ?? []) {
    if (!quote.symbol || !isListedStockSymbol(quote.symbol) || !['EQUITY','ETF'].includes(quote.quoteType ?? '')) continue;
    const symbol = quote.symbol.toUpperCase();
    if (stocks.some(s => s.symbol === symbol)) continue;
    const region = suffixes[symbol.split('.').at(-1)!];
    stocks.push({ symbol, name: quote.shortname || quote.longname || symbol, aliases: quote.longname ? [quote.longname] : [], region,
      currency: region === 'BR' ? 'BRL' : 'EUR', exchange: exchanges[region] });
  }
  if (equitySearchCache.size >= 100) equitySearchCache.delete(equitySearchCache.keys().next().value!);
  equitySearchCache.set(q, { until: Date.now() + 300_000, stocks });
  return stocks;
}


/** The promise's value, or null once `ms` have passed: a slow crypto catalogue never holds back a cash listing. */
function within<T>(ms: number, promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); })])
    .finally(() => clearTimeout(timer));
}

function parseInstTypes(raw: unknown): OkxSearchInstType[] {
  const value = String(raw || '')
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  if (!value.length) return [...OKX_SEARCH_INST_TYPES];

  return value.filter((part): part is OkxSearchInstType => OKX_SEARCH_INST_TYPES.includes(part as OkxSearchInstType));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // POST carries the phrase in the body so a user's raw question never rides in
  // a URL. Query strings land in platform runtime logs, and data readable there
  // after the request is served is exactly what Apple counts as "collected".
  // GET stays for the web app and the browse board, which send no user prose.
  const src: Record<string, unknown> =
    req.method === 'POST'
      ? ((req.body ?? {}) as Record<string, unknown>)
      : (req.query as unknown as Record<string, unknown>);

  const q = String(src.q || '').trim();
  const limit = Math.min(Math.max(Number(src.limit || 8) || 8, 1), 20);
  const instTypes = parseInstTypes(src.instTypes);
  // A caller that sends only its locale ("it-IT") still gets its own everyday words kept out of the tickers.
  const language = src.language ?? src.lang ?? src.locale;
  const localStocks = regionalDefaults(language, src.locale, src.country);
  const rankedStocks = [...localStocks, ...REGIONAL_STOCKS.filter(s => !localStocks.includes(s))];

  // Only the shared GET responses are cacheable; a POST body is per-caller.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }

  // Browse mode: the whole explorable universe grouped by class and ranked
  // by real 24h volume — powers the in-app board and dictation vocabulary.
  if (String(src.browse || '') === '1') {
    try {
      const { classes, totalBases, movers } = await browseOkxAssets();
      classes.equity = [...rankedStocks.map(stockResult), ...classes.equity];
      return res.status(200).json({
        ok: true,
        browse: classes,
        totalBases: totalBases + REGIONAL_STOCKS.length,
        movers,
        source: 'Cash-market listings + public crypto instruments and tickers',
        catalogAgeMs: getCatalogAgeMs(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browse unavailable';
      return res.status(200).json({ ok: true, browse: { equity: rankedStocks.map(stockResult), crypto: [], commodity: [], fx: [], other: [] }, totalBases: REGIONAL_STOCKS.length, movers: [], degraded: true, source: 'Cash-market listings; crypto catalogue unavailable', catalogAgeMs: null });
    }
  }

  if (!q) {
    return res.status(200).json({
      ok: true,
      query: '',
      results: [],
      resolved: null,
      source: 'OKX public instruments',
      catalogAgeMs: getCatalogAgeMs(),
    });
  }

  // A cash listing answers alone only when the text names it. Rows that merely look alike are suggestions
  // beside the crypto catalogue: a ticker typed alone ("TON", "ENS", "SAP") is never swallowed by them.
  const listed = searchRegionalStocks(q, language, src.locale, src.country);
  const listedResolved = resolveRegionalStock(q, language, src.locale, src.country);
  const listedRows = listed.map(stockResult);

  // A sentence that names a cash listing can name a second asset beside it ("Bitcoin et LVMH", "LVMH et
  // Siemens"). Two named assets are never answered for one of them: both come back, to be confirmed.
  const mentions = regionalMentions(q, language, src.locale, src.country);
  if (mentions.stocks.length) {
    const beside = /[\p{L}\p{N}]/u.test(mentions.rest)
      ? await within(2500, resolveOkxAssetFromText(mentions.rest, { instTypes, language, sentence: true }).catch(() => null))
      : null;
    // Only an asset named outright counts as a second one; a guess from a leftover word does not.
    const other = beside && (beside.matchKind === 'proxy' || beside.candidates || (beside.matchKind === 'exact' && !beside.needsConfirmation)) ? beside : null;
    if (mentions.stocks.length + (other ? 1 : 0) > 1) {
      // In the order the question names them; the first one leads the confirmation.
      const found = other ? mentions.rest.toUpperCase().indexOf(other.matchedTerm.normalize('NFD')) : -1;
      const rows: Array<ReturnType<typeof stockResult> | OkxAssetInstrument> = [
        ...mentions.stocks.map(({ stock, at }) => ({ at, row: stockResult(stock) })),
        ...(other?.candidates ?? (other ? [other.instrument] : [])).map(row => ({ at: found < 0 ? Infinity : found, row })),
      ].sort((a, b) => a.at - b.at).map(entry => entry.row);
      const leadsWithOther = other !== null && rows[0] === other.instrument;
      return res.status(200).json({ ok: true, query: q,
        results: [...rows, ...listedRows.filter(row => !rows.some(named => named.instId === row.instId))].slice(0, limit),
        resolved: rows[0],
        resolution: { matchKind: leadsWithOther ? other.matchKind : 'exact', matchedTerm: q, needsConfirmation: true,
          proxyNote: leadsWithOther ? other.proxyNote : null, candidates: rows.map(row => row.symbol) },
        source: other ? 'Cash-market listings + OKX public instruments' : 'Cash-market listings (Yahoo Finance identifiers)',
        catalogAgeMs: other ? getCatalogAgeMs() : null });
    }
  }
  if (listedResolved) {
    // A name that is an everyday word at home ("intesa") is offered, never assumed.
    const homonym = isRegionalHomonym(q);
    return res.status(200).json({ ok: true, query: q, results: listed.slice(0, limit).map(stockResult),
      resolved: stockResult(listedResolved),
      resolution: { matchKind: homonym ? 'partial' : 'exact', matchedTerm: q, needsConfirmation: homonym, proxyNote: null },
      source: 'Cash-market listings (Yahoo Finance identifiers)', catalogAgeMs: null });
  }

  // An exchange-qualified cash ticker never falls through to fuzzy crypto resolution.
  // Only a literal exchange-qualified ticker is sent to external discovery;
  // free-form questions are resolved locally and never become a provider search URL.
  if (isListedStockSymbol(q)) {
    const stocks = await providerStocks(q).catch(() => []);
    if (stocks.length || isListedStockSymbol(q)) {
      const normalized = q.trim().toLocaleUpperCase();
      const exact = stocks.filter(s => [s.symbol, s.name, ...s.aliases].some(v => v.toLocaleUpperCase() === normalized));
      const selected = exact.length === 1 ? exact[0] : null;
      return res.status(200).json({ ok: true, query: q, results: stocks.slice(0,limit).map(stockResult),
        resolved: selected ? stockResult(selected) : null,
        resolution: selected ? { matchKind: 'exact', matchedTerm: q, needsConfirmation: false, proxyNote: null } : null,
        source: 'Yahoo Finance cash-market search', catalogAgeMs: null });
    }
  }

  try {
    const [results, resolution] = await Promise.all([
      searchOkxInstruments(q, { instTypes, limit, language }),
      resolveOkxAssetFromText(q, { instTypes, language }),
    ]);
    // What the question names leads the rows: every candidate in the order named, or the one resolved.
    const namedRows = resolution?.candidates ?? (resolution ? [resolution.instrument] : []);
    const otherRows = results.filter(row => !namedRows.some(lead => lead.instId === row.instId));

    return res.status(200).json({
      ok: true,
      query: q,
      instTypes,
      // A resolved instrument leads; otherwise the cash listings that look like the query do.
      // A sentence that names nothing offers nothing: look-alikes of its ordinary words are not suggestions.
      results: (resolution ? [...namedRows, ...otherRows, ...listedRows] : [...listedRows, ...(/\s/.test(q) ? [] : otherRows)]).slice(0, limit),
      resolved: resolution?.instrument ?? null,
      // Safety metadata: fuzzy/proxy matches must be user-confirmed before
      // any analysis runs — better to ask once than to confidently analyze
      // the wrong instrument.
      resolution: resolution
        ? {
          matchKind: resolution.matchKind,
          matchedTerm: resolution.matchedTerm,
          needsConfirmation: resolution.needsConfirmation,
          proxyNote: resolution.proxyNote,
          ...(resolution.candidates ? { candidates: resolution.candidates.map(row => row.symbol) } : {}),
        }
        : null,
      source: listedRows.length ? 'Cash-market listings + OKX public instruments' : 'OKX public instruments',
      catalogAgeMs: getCatalogAgeMs(),
    });
  } catch (error) {
    // The crypto catalogue is down: the cash listings that matched are still a true answer.
    if (listedRows.length) {
      return res.status(200).json({ ok: true, query: q, results: listedRows.slice(0, limit), resolved: null, resolution: null,
        degraded: true, source: 'Cash-market listings (Yahoo Finance identifiers)', catalogAgeMs: null });
    }
    const message = error instanceof Error ? error.message : 'Search unavailable';
    return res.status(503).json({ error: message });
  }
}
