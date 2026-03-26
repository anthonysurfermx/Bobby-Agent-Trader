// ============================================================
// Bobby Technical Pulse — Bloomberg-terminal style indicator matrix
// Universal asset search on top of OKX Agent Trade Kit
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import KineticShell from '@/components/kinetic/KineticShell';
import { AIInsightsTerminal } from '@/components/agentic/AIInsightsTerminal';
import {
  buildIndicatorCacheRecord,
  fetchOkxIndicatorBundle,
  fetchOkxLastPrice,
  flattenIndicatorBundle,
} from '@/lib/okx-asset-technical';
import type { OkxAssetInstrument } from '@/lib/okx-asset-search';

interface IndicatorEntry {
  symbol: string;
  timeframe: string;
  indicators: Record<string, any>;
  instId?: string;
  displaySymbol?: string;
  displayName?: string;
  assetClass?: string | null;
  instType?: string | null;
  compositeScore?: number | null;
  signal?: string | null;
  conviction?: number | null;
  agreement?: number | null;
  tradePlan?: {
    direction?: string | null;
    entry?: number | null;
    stop?: number | null;
    target?: number | null;
    rewardRisk?: number | null;
  } | null;
  currentPrice?: number | null;
  regime?: string | null;
  source?: string | null;
  ageMs?: number | null;
  fresh?: boolean;
}

interface ParsedIndicator {
  name: string;
  value: string;
  signal: string;
  color: 'green' | 'amber' | 'red';
}

type AssetSuggestion = OkxAssetInstrument;

function safeNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function dig(obj: any, ...keys: string[]): any {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k] ?? cur[k.toUpperCase()] ?? cur[k.toLowerCase()];
  }
  return cur;
}

function findValue(obj: any, key: string): any {
  if (obj == null || typeof obj !== 'object') return undefined;
  const lk = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lk) return obj[k];
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      const found = findValue(obj[k], key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function parseIndicators(entry: IndicatorEntry): ParsedIndicator[] {
  const ind = entry.indicators || {};
  const results: ParsedIndicator[] = [];

  const rsiRaw = findValue(ind, 'RSI') ?? dig(ind, 'RSI', 'value') ?? dig(ind, 'RSI');
  const rsiVal = safeNum(typeof rsiRaw === 'object' ? (rsiRaw?.value ?? rsiRaw?.rsi ?? rsiRaw?.RSI ?? rsiRaw?.['14']) : rsiRaw);
  if (rsiVal !== null) {
    results.push({
      name: 'RSI (14)',
      value: rsiVal.toFixed(1),
      signal: rsiVal < 30 ? 'OVERSOLD' : rsiVal > 70 ? 'OVERBOUGHT' : 'NEUTRAL',
      color: rsiVal < 30 ? 'green' : rsiVal > 70 ? 'red' : 'amber',
    });
  }

  const macdObj = dig(ind, 'MACD') || {};
  const histVal = safeNum(findValue(macdObj, 'histogram') ?? findValue(macdObj, 'hist') ?? findValue(macdObj, 'macd'));
  const macdLine = safeNum(findValue(macdObj, 'macd') ?? findValue(macdObj, 'DIF') ?? findValue(macdObj, 'dif'));
  if (histVal !== null) {
    results.push({
      name: 'MACD',
      value: `H: ${histVal.toFixed(2)}`,
      signal: histVal > 0 ? 'BULLISH' : 'BEARISH',
      color: histVal > 0 ? 'green' : 'red',
    });
  } else if (macdLine !== null) {
    results.push({
      name: 'MACD',
      value: macdLine.toFixed(2),
      signal: macdLine > 0 ? 'BULLISH' : 'BEARISH',
      color: macdLine > 0 ? 'green' : 'red',
    });
  }

  const bbObj = dig(ind, 'BB') || {};
  const bbUpper = safeNum(findValue(bbObj, 'upper'));
  const bbLower = safeNum(findValue(bbObj, 'lower'));
  const bbMid = safeNum(findValue(bbObj, 'middle'));
  const bbWidth = bbUpper !== null && bbLower !== null ? bbUpper - bbLower : null;
  if (bbUpper !== null && bbLower !== null) {
    const squeeze = bbWidth !== null && bbMid !== null && bbMid !== 0 && bbWidth / bbMid < 0.02;
    results.push({
      name: 'BOLLINGER',
      value: squeeze ? 'TIGHT' : `W: ${bbWidth?.toFixed(2)}`,
      signal: squeeze ? 'SQUEEZE' : 'NEUTRAL',
      color: 'amber',
    });
  }

  const maObj = dig(ind, 'MA') || {};
  const ma50 = safeNum(findValue(maObj, '50') ?? findValue(maObj, 'MA50'));
  const ma200 = safeNum(findValue(maObj, '200') ?? findValue(maObj, 'MA200'));
  if (ma50 !== null && ma200 !== null) {
    results.push({
      name: 'MA 50/200',
      value: `${ma50.toFixed(2)} / ${ma200.toFixed(2)}`,
      signal: ma50 > ma200 ? 'GOLDEN_CROSS' : 'DEATH_CROSS',
      color: ma50 > ma200 ? 'green' : 'red',
    });
  }

  const stObj = dig(ind, 'SUPERTREND') || {};
  const stDir = findValue(stObj, 'direction') ?? findValue(stObj, 'trend') ?? findValue(stObj, 'signal');
  const stVal = safeNum(findValue(stObj, 'value') ?? findValue(stObj, 'level') ?? findValue(stObj, 'supertrend'));
  if (stDir !== undefined || stVal !== null) {
    const dirStr = String(stDir ?? '').toLowerCase();
    const isBull = dirStr.includes('bull') || dirStr.includes('up') || dirStr.includes('long') || dirStr === '1';
    results.push({
      name: 'SUPERTREND',
      value: stVal !== null ? stVal.toFixed(2) : String(stDir ?? '--').toUpperCase(),
      signal: isBull ? 'BULLISH' : 'BEARISH',
      color: isBull ? 'green' : 'red',
    });
  }

  const ahrObj = dig(ind, 'AHR999') || {};
  const ahrVal = safeNum(findValue(ahrObj, 'ahr999') ?? findValue(ahrObj, 'value'));
  if (ahrVal !== null) {
    results.push({
      name: 'AHR999',
      value: ahrVal.toFixed(3),
      signal: ahrVal < 0.45 ? 'BUY_ZONE' : ahrVal > 1.2 ? 'OVERVALUED' : 'HOLD',
      color: ahrVal < 0.45 ? 'green' : ahrVal > 1.2 ? 'red' : 'amber',
    });
  }

  const emaObj = dig(ind, 'EMA') || {};
  const ema12 = safeNum(findValue(emaObj, '12') ?? findValue(emaObj, 'EMA12'));
  const ema26 = safeNum(findValue(emaObj, '26') ?? findValue(emaObj, 'EMA26'));
  if (ema12 !== null && ema26 !== null) {
    results.push({
      name: 'EMA 12/26',
      value: `${ema12.toFixed(2)} / ${ema26.toFixed(2)}`,
      signal: ema12 > ema26 ? 'BULLISH' : 'BEARISH',
      color: ema12 > ema26 ? 'green' : 'red',
    });
  }

  const kdjObj = dig(ind, 'KDJ') || {};
  const kdjK = safeNum(findValue(kdjObj, 'K') ?? findValue(kdjObj, 'k'));
  const kdjD = safeNum(findValue(kdjObj, 'D') ?? findValue(kdjObj, 'd'));
  if (kdjK !== null && kdjD !== null) {
    results.push({
      name: 'KDJ',
      value: `K:${kdjK.toFixed(0)} D:${kdjD.toFixed(0)}`,
      signal: kdjK > kdjD ? 'BULLISH' : 'BEARISH',
      color: kdjK > kdjD ? 'green' : 'red',
    });
  }

  const atrObj = dig(ind, 'ATR') || {};
  const atrVal = safeNum(findValue(atrObj, '14') ?? findValue(atrObj, 'ATR') ?? findValue(atrObj, 'atr'));
  if (atrVal !== null) {
    results.push({
      name: 'ATR (14)',
      value: atrVal.toFixed(2),
      signal: 'NEUTRAL',
      color: 'amber',
    });
  }

  const rainbowObj = dig(ind, 'BTCRAINBOW') || {};
  const bandName = findValue(rainbowObj, 'band') ?? findValue(rainbowObj, 'zone');
  if (bandName !== undefined && bandName !== null) {
    const bandStr = String(bandName).toUpperCase();
    const isCheap = bandStr.includes('BUY') || bandStr.includes('ACCUM') || bandStr.includes('CHEAP');
    const isExpensive = bandStr.includes('SELL') || bandStr.includes('BUBBLE') || bandStr.includes('FOMO');
    results.push({
      name: 'BTC RAINBOW',
      value: bandStr.length > 16 ? `${bandStr.slice(0, 16)}..` : bandStr,
      signal: isCheap ? 'BUY_ZONE' : isExpensive ? 'OVERVALUED' : 'HOLD',
      color: isCheap ? 'green' : isExpensive ? 'red' : 'amber',
    });
  }

  return results;
}

function computeScore(indicators: ParsedIndicator[]): number {
  if (indicators.length === 0) return 5;
  let score = 0;
  for (const ind of indicators) {
    if (ind.color === 'green') score += 1;
    else if (ind.color === 'amber') score += 0.5;
  }
  return Math.round((score / indicators.length) * 10 * 10) / 10;
}

function biasLabel(score: number): string {
  if (score >= 6) return 'BULLISH_BIAS';
  if (score >= 4) return 'NEUTRAL';
  return 'BEARISH_BIAS';
}

function scoreColor(score: number): string {
  if (score >= 6) return 'text-green-400';
  if (score >= 4) return 'text-amber-400';
  return 'text-red-400';
}

function baseSymbol(label: string | undefined): string {
  return (label || '').replace(/-USDT(?:-SWAP)?$/i, '').split('-')[0] || label || '';
}

function signalBadgeColor(color: 'green' | 'amber' | 'red'): string {
  if (color === 'green') return 'text-green-400 border-green-500/30 bg-green-500/10';
  if (color === 'red') return 'text-red-400 border-red-500/30 bg-red-500/10';
  return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Math.abs(value) >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatAge(ageMs: number | null | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'LIVE';
  if (ageMs < 60_000) return '<1m';
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h`;
  return `${Math.round(ageMs / 86_400_000)}d`;
}

function mapCompositeToTen(compositeScore: number | null | undefined, parsed: ParsedIndicator[]): number {
  if (typeof compositeScore === 'number' && Number.isFinite(compositeScore)) {
    return Math.round(((compositeScore + 1) * 5) * 10) / 10;
  }
  return computeScore(parsed);
}

function mapCacheRowToEntry(
  row: any,
  instrument?: AssetSuggestion | null,
  freshness?: { ageMs?: number | null; fresh?: boolean },
): IndicatorEntry {
  return {
    symbol: row?.base_symbol || row?.display_symbol || instrument?.symbol || baseSymbol(row?.inst_id || instrument?.instId || ''),
    instId: row?.inst_id || instrument?.instId,
    displaySymbol: row?.display_symbol || instrument?.displaySymbol || row?.base_symbol || baseSymbol(row?.inst_id || instrument?.instId || ''),
    displayName: instrument?.displayName || row?.instrument_meta?.displayName || row?.inst_id || null,
    assetClass: row?.asset_class || instrument?.assetClass || null,
    instType: row?.inst_type || instrument?.instType || null,
    timeframe: row?.timeframe || '1H',
    indicators: row?.indicators || {},
    compositeScore: row?.composite_score ?? row?.technical?.compositeScore ?? null,
    signal: row?.signal ?? row?.technical?.signal ?? null,
    conviction: row?.conviction ?? row?.technical?.conviction ?? null,
    agreement: row?.agreement ?? row?.technical?.agreement ?? null,
    tradePlan: row?.trade_plan ?? row?.technical?.tradePlan ?? null,
    currentPrice: row?.current_price ?? row?.technical?.currentPrice ?? null,
    regime: row?.regime || null,
    source: row?.source || 'OKX Agent Trade Kit',
    ageMs: freshness?.ageMs ?? null,
    fresh: freshness?.fresh ?? false,
  };
}

function TerminalLoader() {
  const steps = [
    '> CONNECTING TO OKX AGENT TRADE KIT...',
    '> LOADING 70+ TECHNICAL INDICATORS...',
    '> COMPUTING SIGNAL WEIGHTS...',
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= steps.length) return;
    const timer = setTimeout(() => setStep((s) => s + 1), 800);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="font-mono text-[11px] space-y-2 text-green-400/70">
        {steps.slice(0, step + 1).map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {s}
            {i === step && i < steps.length - 1 && <span className="animate-pulse ml-1">_</span>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function BobbySignalsPage() {
  const [data, setData] = useState<IndicatorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<IndicatorEntry | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<AssetSuggestion[]>([]);

  const handleSearch = async () => {
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const resolveRes = await fetch(`/api/bobby-asset-search?q=${encodeURIComponent(query)}&limit=1`);
      if (!resolveRes.ok) throw new Error(`HTTP ${resolveRes.status}`);
      const resolvePayload = await resolveRes.json();
      const instrument: AssetSuggestion | null = resolvePayload?.resolved || resolvePayload?.results?.[0] || null;

      if (!instrument) {
        setSearchResult(null);
        setSearchError(`${query} is not listed on OKX. Try PEPE, RENDER, NVDA, XAUT or an exact instId.`);
        return;
      }

      setSearchQuery(instrument.instId);
      setSearchSuggestions([]);

      const cacheRes = await fetch(`/api/bobby-asset-cache?instId=${encodeURIComponent(instrument.instId)}&timeframe=1H`);
      if (cacheRes.ok) {
        const cachePayload = await cacheRes.json();
        if (cachePayload?.row) {
          setSearchResult(mapCacheRowToEntry(cachePayload.row, instrument, {
            ageMs: cachePayload.ageMs,
            fresh: cachePayload.fresh,
          }));
          if (cachePayload.fresh) return;
        }
      }

      const [bundle, currentPrice] = await Promise.all([
        fetchOkxIndicatorBundle(instrument.instId, '1H'),
        fetchOkxLastPrice(instrument.instId),
      ]);

      if (!bundle) {
        throw new Error(`No indicator data for ${instrument.instId}.`);
      }

      const indicators = flattenIndicatorBundle(bundle);
      const localRecord = buildIndicatorCacheRecord({
        instId: instrument.instId,
        timeframe: '1H',
        indicators,
        currentPrice,
        instrument,
        source: 'OKX Agent Trade Kit (browser universal search)',
      });

      setSearchResult(mapCacheRowToEntry(localRecord, instrument, { ageMs: 0, fresh: true }));

      const writeRes = await fetch('/api/bobby-asset-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instId: instrument.instId,
          timeframe: '1H',
          indicators,
          currentPrice,
          instrument,
          source: 'OKX Agent Trade Kit (browser universal search)',
        }),
      });

      if (writeRes.ok) {
        const writePayload = await writeRes.json();
        if (writePayload?.row) {
          setSearchResult(mapCacheRowToEntry(writePayload.row, instrument, { ageMs: 0, fresh: true }));
        }
      }
    } catch (e: any) {
      setSearchError(e.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.includes('-')) {
      setSearchSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/bobby-asset-search?q=${encodeURIComponent(query)}&limit=8`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const payload = await res.json();
        setSearchSuggestions(Array.isArray(payload?.results) ? payload.results : []);
      } catch {
        setSearchSuggestions([]);
      }
    }, 140);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    fetch('/api/bobby-signals')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const ti = d?.indicators;
        if (!Array.isArray(ti) || ti.length === 0) {
          setError('No technical indicator data available. Waiting for next Bobby cycle.');
          return;
        }

        const adapted = ti.map((entry: any) => {
          const indicators: Record<string, any> = {};
          for (const [name, reading] of Object.entries(entry.indicators || {})) {
            const r = reading as any;
            indicators[name] = r.values || r.raw || { value: r.score, bias: r.bias };
          }
          return { ...entry, indicators };
        });

        setData(adapted);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const allParsed: Array<{ symbol: string; indicators: ParsedIndicator[]; entry: IndicatorEntry }> = data.map((entry) => ({
    symbol: entry.displaySymbol || baseSymbol(entry.instId || entry.symbol),
    indicators: parseIndicators(entry),
    entry,
  }));

  const primaryIndicators = allParsed[0]?.indicators || [];
  const score = mapCompositeToTen(allParsed[0]?.entry?.compositeScore, primaryIndicators);
  const bias = biasLabel(score);
  const color = scoreColor(score);
  const totalCount = primaryIndicators.length || 1;
  const greenPct = (primaryIndicators.filter((i) => i.color === 'green').length / totalCount) * 100;
  const amberPct = (primaryIndicators.filter((i) => i.color === 'amber').length / totalCount) * 100;
  const redPct = (primaryIndicators.filter((i) => i.color === 'red').length / totalCount) * 100;
  const parsedSearchIndicators = searchResult ? parseIndicators(searchResult) : [];

  return (
    <KineticShell activeTab="signals">
      <Helmet>
        <title>Technical Pulse | Bobby Agent Trader</title>
      </Helmet>

      <div className="min-h-screen bg-[#050505] pb-20 md:pb-8">
        {loading ? (
          <TerminalLoader />
        ) : error ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="font-mono text-[11px] text-red-400/70">
              <p>{'>'} ERROR: {error}</p>
              <p className="text-white/20 mt-2">{'>'} RETRY IN 30s OR REFRESH</p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto px-4 py-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-white/40 tracking-widest">TECHNICAL_PULSE</span>
              <span className="font-mono text-[8px] text-green-400/60 border border-green-500/20 px-2 py-0.5 rounded-sm">
                PWR: OKX_AGENT_TRADE_KIT
              </span>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[8px] text-white/30 tracking-widest shrink-0">SEARCH_ASSET:</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="BTC, ETH, SOL, PEPE, RENDER, NVDA, GOLD, XAUT-USDT..."
                  className="flex-1 bg-transparent font-mono text-sm text-green-400 placeholder:text-white/15 outline-none border-b border-white/10 focus:border-green-500/40 pb-1 transition-colors"
                />
                <button
                  onClick={handleSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="font-mono text-[9px] tracking-widest px-3 py-1.5 bg-green-500/15 text-green-400 border border-green-500/20 rounded-sm hover:bg-green-500/25 transition-all disabled:opacity-30"
                >
                  {searchLoading ? 'SCANNING...' : 'ANALYZE'}
                </button>
              </div>
              {searchError ? (
                <p className="font-mono text-[9px] text-red-400/70 mt-2">{'>'} {searchError}</p>
              ) : (
                <p className="font-mono text-[8px] text-white/25 mt-2">
                  {'>'} Spot first, then perps/futures. Search by symbol or exact OKX `instId`.
                </p>
              )}
              {searchSuggestions.length > 0 && (
                <div className="mt-3 border border-white/[0.04] rounded-lg overflow-hidden">
                  {searchSuggestions.slice(0, 6).map((item) => (
                    <button
                      key={item.instId}
                      onClick={() => {
                        setSearchQuery(item.instId);
                        setSearchSuggestions([]);
                        setSearchError(null);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/[0.03] border-b border-white/[0.04] last:border-0 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] text-green-400">{item.displayName}</span>
                        <span className="font-mono text-[8px] text-white/30">{item.instType}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-1">
                        <span className="font-mono text-[8px] text-white/30">{item.instId}</span>
                        <span className="font-mono text-[8px] text-white/20 uppercase">{item.assetClass}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {searchResult && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-green-400 tracking-widest">{searchResult.displaySymbol || searchResult.symbol}</span>
                  <span className="font-mono text-[8px] text-white/30">{searchResult.instType || 'CUSTOM_SCAN'}</span>
                  {searchResult.assetClass && (
                    <span className="font-mono text-[8px] text-white/20 uppercase">{searchResult.assetClass}</span>
                  )}
                  <span className={`font-mono text-[8px] px-2 py-0.5 rounded-sm border ${
                    searchResult.fresh ? 'text-green-400 border-green-500/20 bg-green-500/10' : 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                  }`}>
                    {searchResult.fresh ? `CACHE ${formatAge(searchResult.ageMs)}` : `REFRESH ${formatAge(searchResult.ageMs)}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                    <p className="font-mono text-[8px] text-white/30 tracking-widest">PRICE</p>
                    <p className="font-mono text-lg text-white/85 mt-1">{formatPrice(searchResult.currentPrice)}</p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                    <p className="font-mono text-[8px] text-white/30 tracking-widest">COMPOSITE</p>
                    <p className="font-mono text-lg text-green-400 mt-1">
                      {typeof searchResult.compositeScore === 'number' ? searchResult.compositeScore.toFixed(2) : '--'}
                    </p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                    <p className="font-mono text-[8px] text-white/30 tracking-widest">CONVICTION</p>
                    <p className="font-mono text-lg text-white/85 mt-1">
                      {typeof searchResult.conviction === 'number' ? `${Math.round(searchResult.conviction * 100)}%` : '--'}
                    </p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                    <p className="font-mono text-[8px] text-white/30 tracking-widest">REGIME</p>
                    <p className="font-mono text-lg text-white/85 mt-1 uppercase">{searchResult.regime || '--'}</p>
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {parsedSearchIndicators.map((ind) => (
                      <div key={ind.name} className="flex items-center justify-between p-2 bg-black/30 rounded border border-white/5">
                        <span className="font-mono text-[9px] text-white/50">{ind.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[9px] font-bold text-white/80">{ind.value}</span>
                          <span className={`font-mono text-[7px] px-1 py-0.5 rounded ${
                            ind.color === 'green' ? 'bg-green-500/15 text-green-400' :
                            ind.color === 'red' ? 'bg-red-500/15 text-red-400' :
                            'bg-amber-500/15 text-amber-400'
                          }`}>{ind.signal}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {searchResult.tradePlan && (
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[9px] text-white/30 tracking-widest">AUTO_TRADE_PLAN</span>
                      <span className="font-mono text-[8px] text-green-400/70 uppercase">{searchResult.tradePlan.direction || 'none'}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="p-2 bg-black/30 rounded border border-white/5">
                        <p className="font-mono text-[8px] text-white/30">ENTRY</p>
                        <p className="font-mono text-[11px] text-white/85 mt-1">{formatPrice(searchResult.tradePlan.entry)}</p>
                      </div>
                      <div className="p-2 bg-black/30 rounded border border-white/5">
                        <p className="font-mono text-[8px] text-white/30">STOP</p>
                        <p className="font-mono text-[11px] text-white/85 mt-1">{formatPrice(searchResult.tradePlan.stop)}</p>
                      </div>
                      <div className="p-2 bg-black/30 rounded border border-white/5">
                        <p className="font-mono text-[8px] text-white/30">TARGET</p>
                        <p className="font-mono text-[11px] text-white/85 mt-1">{formatPrice(searchResult.tradePlan.target)}</p>
                      </div>
                      <div className="p-2 bg-black/30 rounded border border-white/5">
                        <p className="font-mono text-[8px] text-white/30">R:R</p>
                        <p className="font-mono text-[11px] text-white/85 mt-1">
                          {typeof searchResult.tradePlan.rewardRisk === 'number' ? searchResult.tradePlan.rewardRisk.toFixed(2) : '--'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
              <div className="flex items-baseline gap-3">
                <span className={`font-mono text-3xl font-bold tabular-nums ${color}`}>
                  {score.toFixed(1)}
                </span>
                <span className={`font-mono text-xs font-bold tracking-widest ${color}`}>
                  [{bias}]
                </span>
                <span className="font-mono text-[8px] text-white/20 ml-auto tracking-widest">
                  COMPOSITE_SCORE / 10
                </span>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[8px] text-white/30 tracking-widest">NET_FLOW</span>
                <span className="font-mono text-[8px] text-white/20 tracking-widest">
                  {primaryIndicators.filter((i) => i.color === 'green').length}B / {primaryIndicators.filter((i) => i.color === 'amber').length}N / {primaryIndicators.filter((i) => i.color === 'red').length}R
                </span>
              </div>
              <div className="h-1 w-full rounded-full overflow-hidden flex bg-white/[0.03]">
                {greenPct > 0 && <div className="h-full bg-green-500" style={{ width: `${greenPct}%` }} />}
                {amberPct > 0 && <div className="h-full bg-amber-500" style={{ width: `${amberPct}%` }} />}
                {redPct > 0 && <div className="h-full bg-red-500" style={{ width: `${redPct}%` }} />}
              </div>
            </div>

            {allParsed.map(({ symbol, indicators }) => {
              if (indicators.length === 0) return null;
              const mobileVisible = indicators.slice(0, 5);
              const mobileHidden = indicators.slice(5);

              return (
                <div key={symbol} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] text-white/50 tracking-widest">{symbol}_INDICATORS</span>
                    <span className="font-mono text-[8px] text-white/20 tracking-widest">1H_TIMEFRAME</span>
                  </div>

                  <div className="hidden md:grid md:grid-cols-2 gap-x-4 gap-y-1">
                    {indicators.map((ind, i) => (
                      <IndicatorRow key={i} ind={ind} />
                    ))}
                  </div>

                  <div className="md:hidden space-y-1">
                    {mobileVisible.map((ind, i) => (
                      <IndicatorRow key={i} ind={ind} />
                    ))}

                    {mobileHidden.length > 0 && !showAll && (
                      <button
                        onClick={() => setShowAll(true)}
                        className="w-full mt-2 py-1.5 font-mono text-[10px] text-green-400/60 border border-white/[0.04] rounded-sm hover:bg-white/[0.02] transition-colors tracking-widest"
                      >
                        [+ {mobileHidden.length} MORE SIGNALS]
                      </button>
                    )}

                    {showAll && mobileHidden.map((ind, i) => (
                      <IndicatorRow key={`extra-${i}`} ind={ind} />
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="mt-6">
              <AIInsightsTerminal
                context="signals"
                data={{
                  indicators: data.map((entry: any) => ({
                    symbol: entry.symbol,
                    compositeScore: entry.compositeScore,
                    signal: entry.signal,
                    conviction: entry.conviction,
                    agreement: entry.agreement,
                    tradePlan: entry.tradePlan,
                    indicators: entry.indicators,
                  })),
                  regime: null,
                  leader: data[0] || null,
                  convictionModel: null,
                  userName: (() => { try { return localStorage.getItem('bobby_agent_name') || null; } catch { return null; } })(),
                }}
                commandLabel="bobby --explain signals"
                buttonLabel="EXPLAIN SIGNALS WITH AI"
              />
            </div>

            <div className="text-center font-mono text-[8px] text-white/15 tracking-widest pt-2">
              DATA_SOURCE: OKX_AGENT_TRADE_KIT &middot; REFRESH: EVERY_CYCLE
            </div>
          </motion.div>
        )}
      </div>
    </KineticShell>
  );
}

function IndicatorRow({ ind }: { ind: ParsedIndicator }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0">
      <span className="font-mono text-[10px] text-white/50 w-24 shrink-0">{ind.name}</span>
      <span className="font-mono text-[10px] font-bold text-white/80 tabular-nums flex-1 text-right mr-2">
        {ind.value}
      </span>
      <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border shrink-0 ${signalBadgeColor(ind.color)}`}>
        {ind.signal}
      </span>
    </div>
  );
}
