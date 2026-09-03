// ============================================================
// MarketCanvas — the live surface Bobby talks over.
// Real candles from OKX, redrawn on a poll, with the levels Bobby names
// appearing as price lines the moment he says them.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  BaselineSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
} from 'lightweight-charts';
import { ASSET_GROUPS, getVoiceAsset, isEquitySymbol, type AssetVenue } from '@/lib/voice-assets';
import { analyzeCandles, type Candle, type MarketAnalysis } from '@/lib/market-indicators';

export interface ChartLevel {
  price: number;
  label: string;
  kind: 'entry' | 'stop' | 'target' | 'level';
  agent?: 'alpha' | 'red' | 'cio';
  /** When present the level is a zone spanning price…priceTo, not a single line. */
  priceTo?: number;
}

const LEVEL_COLOR: Record<ChartLevel['kind'], string> = {
  entry: '#7da6ff',
  stop: '#ff716a',
  target: '#4ade80',
  level: '#8b8b93',
};
const AGENT_COLOR = { alpha: '#4ade80', red: '#ff716a', cio: '#facc15' } as const;
const AGENT_LABEL = { alpha: 'ALPHA', red: 'RED TEAM', cio: 'CIO' } as const;

const TIMEFRAMES = ['5m', '15m', '1H', '4H', '1D'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const STOCK_TIMEFRAME: Record<Timeframe, { range: string; interval: string }> = {
  '5m': { range: '7d', interval: '15m' },
  '15m': { range: '7d', interval: '15m' },
  '1H': { range: '7d', interval: '1h' },
  '4H': { range: '30d', interval: '1d' },
  '1D': { range: '90d', interval: '1d' },
};

/** Fill/stroke for an agent zone — same hue as its line and its card. */
const ZONE_FILL = { alpha: 'rgba(74,222,128,0.13)', red: 'rgba(255,113,106,0.13)', cio: 'rgba(250,204,21,0.13)' } as const;

// Names people ask about that trade on NO public market (private companies),
// mapped to their closest listed exposure. Config, not data: keeps the no-data
// overlay honest ("SpaceX es privada") instead of a bare empty chart.
const PRIVATE_COMPANIES: Record<string, string[]> = {
  SPACEX: ['RKLB', 'TSLA'],
  STARLINK: ['RKLB', 'TSLA'],
  OPENAI: ['MSFT'],
  ANTHROPIC: ['GOOGL', 'AMZN'],
  XAI: ['TSLA'],
  STRIPE: ['ADYEN', 'PYPL'],
  BYTEDANCE: ['META'],
  TIKTOK: ['META'],
  DISCORD: ['RBLX'],
  EPIC: ['RBLX', 'U'],
  CANVA: ['ADBE'],
};

export function MarketCanvas({
  symbol,
  timeframe,
  levels,
  debate,
  language,
  onSymbolChange,
  onTimeframeChange,
}: {
  symbol: string;
  timeframe: Timeframe;
  levels: ChartLevel[];
  debate?: {
    alpha: string; redTeam: string; cio: string;
    alphaConviction: number | null; redTeamSeverity: number | null; cioConviction: number | null;
    indicators: string[];
    levels: ChartLevel[];
  } | null;
  language: 'es' | 'en';
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const zoneRefs = useRef<ISeriesApi<'Baseline'>[]>([]);
  const lineRefs = useRef<IPriceLine[]>([]);
  const previousSymbolRef = useRef(symbol);
  /** Time range the zones span. State, not a ref — the zone effect must re-run
   *  once candles arrive, otherwise a debate that lands first never gets drawn. */
  const [span, setSpan] = useState<{ from: number; to: number } | null>(null);
  const [last, setLast] = useState<{ price: number; change: number } | null>(null);
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  // The feed returned no candles for this symbol (e.g. an asset that isn't on
  // the venue we routed to). Distinct from a network error — and we CLEAR the
  // chart rather than leave the previous symbol's candles on screen mislabeled.
  const [noData, setNoData] = useState(false);

  // The venue the candles ACTUALLY came from, resolved at fetch time. For a
  // symbol in the registry this equals its declared venue; for one the human
  // named that isn't curated, we probe OKX then Yahoo and remember whichever
  // answered — so uncurated equities (and altcoins) chart with the right label.
  const [resolvedVenue, setResolvedVenue] = useState<AssetVenue>(
    isEquitySymbol(symbol) ? 'equity' : 'okx',
  );
  const isStock = resolvedVenue === 'equity';

  // Every line on this chart is a price an agent actually named. The three
  // debate levels come straight from the model's show_debate call; a level
  // Bobby drew explicitly with draw_levels overrides its agent's debate line.
  // If an agent gave no price, nothing is drawn for it — never a synthetic one.
  const drawnLines = useMemo(() => {
    const debateLevels = (debate?.levels ?? []).filter(
      (line) => !levels.some((level) => level.agent === line.agent),
    );
    return [...levels, ...debateLevels];
  }, [levels, debate]);

  const thesisPrices = useMemo(
    () =>
      Object.fromEntries(
        drawnLines.filter((line) => line.agent).map((line) => [line.agent, line]),
      ) as Partial<Record<'alpha' | 'red' | 'cio', ChartLevel>>,
    [drawnLines],
  );

  const formatPrice = (price: number) =>
    price.toLocaleString('en-US', { maximumFractionDigits: price < 10 ? 4 : 2 });

  // --- create chart once ---
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.4)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
      crosshair: {
        vertLine: { color: 'rgba(0,82,255,0.5)', labelBackgroundColor: '#0052ff' },
        horzLine: { color: 'rgba(0,82,255,0.5)', labelBackgroundColor: '#0052ff' },
      },
    });
    chartRef.current = chart;

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#0052ff',
      downColor: '#2a2a35',
      borderUpColor: '#4C8FFF',
      borderDownColor: '#3a3a45',
      wickUpColor: '#4C8FFF',
      wickDownColor: '#3a3a45',
    });

    volumeRef.current = chart.addSeries(HistogramSeries, {
      color: 'rgba(0,82,255,0.28)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // The two moving averages the desk reads out loud. Drawn over the candles
    // so the analysis is visible, not just claimed.
    ema20Ref.current = chart.addSeries(LineSeries, {
      color: 'rgba(125,166,255,0.9)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: 'rgba(196,181,253,0.75)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const resize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      zoneRefs.current = [];
      lineRefs.current = [];
    };
  }, []);

  // --- load + poll candles ---
  useEffect(() => {
    let cancelled = false;
    let hasRenderedRows = false;
    const symbolChanged = previousSymbolRef.current !== symbol;
    previousSymbolRef.current = symbol;

    // Price lines belong to the symbol that produced them. Clear them on an
    // asset switch so a BTC thesis can never remain visible on an equity chart.
    // A timeframe switch keeps the levels because the underlying asset is the
    // same; new levels will be restored by the dedicated effect below.
    if (symbolChanged && candleRef.current) {
      lineRefs.current.forEach((line) => {
        try {
          candleRef.current?.removePriceLine(line);
        } catch {
          // The chart may be tearing down during a fast route/symbol change.
        }
      });
      lineRefs.current = [];
    }

    const clearMarketState = () => {
      candleRef.current?.setData([] as never);
      volumeRef.current?.setData([] as never);
      ema20Ref.current?.setData([] as never);
      ema50Ref.current?.setData([] as never);
      setAnalysis(null);
      setLast(null);
      setSpan(null);
      setUpdatedAt(null);
    };
    // Registry symbols know their venue up front. For an uncurated ticker we
    // discover it on the first successful fetch and reuse it, so the 15s poll
    // stops re-probing both venues once one has answered.
    let cachedVenue: AssetVenue | null = getVoiceAsset(symbol)?.venue ?? null;
    // Best-guess label the instant the symbol changes, corrected once the fetch
    // resolves the real venue (matters for uncurated tickers probed on OKX).
    setResolvedVenue(cachedVenue ?? 'okx');
    // Clear synchronously on every symbol/timeframe change. Otherwise the old
    // candles are briefly displayed under the new ticker while fetch is pending.
    clearMarketState();
    setNoData(false);
    setError(false);

    const load = async () => {
      try {
        const stockConfig = STOCK_TIMEFRAME[timeframe];
        let hadFetchError = false;
        // Both OKX and Yahoo return the same normalized candle shape here, so
        // the chart behaves identically for crypto and equities. Oldest first;
        // raw OKX arrays are tolerated as a fallback.
        const parseRows = (payload: { candles?: unknown; data?: unknown }): Candle[] =>
          ((payload.candles ?? payload.data ?? []) as Array<Record<string, number | string> | Array<number | string>>)
            .map((row) => {
              if (Array.isArray(row)) {
                return {
                  time: Math.floor(Number(row[0]) / 1000),
                  open: Number(row[1]), high: Number(row[2]),
                  low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0),
                };
              }
              return {
                time: Math.floor(Number(row.ts) / 1000),
                open: Number(row.open), high: Number(row.high),
                low: Number(row.low), close: Number(row.close), volume: Number(row.volume ?? 0),
              };
            })
            .filter((c: Candle) => Number.isFinite(c.close) && Number.isFinite(c.time))
            .sort((a: Candle, b: Candle) => a.time - b.time);

        const fetchFrom = async (venue: AssetVenue): Promise<Candle[]> => {
          try {
            const url = venue === 'equity'
              ? `/api/stock-candles?symbol=${encodeURIComponent(symbol)}&range=${stockConfig.range}&interval=${stockConfig.interval}`
              : `/api/okx-candles?instId=${encodeURIComponent(symbol)}-USDT&bar=${timeframe}&limit=100`;
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
              hadFetchError = true;
              return [];
            }
            return parseRows(await response.json());
          } catch {
            hadFetchError = true;
            return [];
          }
        };

        let venue: AssetVenue;
        let rows: Candle[];
        if (cachedVenue) {
          venue = cachedVenue;
          rows = await fetchFrom(venue);
        } else {
          // Uncurated ticker the human named: try crypto (OKX), then fall back
          // to equities (Yahoo) so assets outside the registry still chart.
          rows = await fetchFrom('okx');
          venue = 'okx';
          if (!rows.length && !cancelled) {
            const equityRows = await fetchFrom('equity');
            if (equityRows.length) { rows = equityRows; venue = 'equity'; }
          }
        }

        if (cancelled || !candleRef.current) return;
        if (rows.length) cachedVenue = venue; // lock in the venue that answered
        setResolvedVenue(venue);

        // No candles for this symbol: clear the chart so a failed/unsupported
        // asset never shows the PREVIOUS symbol's candles under a new label
        // (the "TSM/USDT with BTC's price" bug). Show an explicit empty state.
        if (!rows.length) {
          if (hasRenderedRows) {
            // A polling blip must not erase a valid chart. Keep the last candles
            // for this SAME symbol and mark them stale in the footer.
            setNoData(false);
            setError(true);
          } else {
            clearMarketState();
            setNoData(!hadFetchError);
            setError(hadFetchError);
          }
          return;
        }
        setNoData(false);
        hasRenderedRows = true;

        candleRef.current.setData(rows as never);
        volumeRef.current?.setData(
          rows.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(0,82,255,0.35)' : 'rgba(120,120,135,0.25)',
          })) as never,
        );

        // Same function /api/voice-tool runs server-side, so the support the
        // CIO names out loud is the exact level drawn here.
        const computed = analyzeCandles(rows);
        ema20Ref.current?.setData(computed.ema20Series as never);
        ema50Ref.current?.setData(computed.ema50Series as never);
        // A wide desktop can otherwise leave the series pinned to the right
        // with a large empty area on the left. Fit the complete dataset after
        // every successful refresh so price action uses the available canvas.
        requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
        setAnalysis(computed);

        const first = rows[0];
        const latest = rows[rows.length - 1];
        // Keep the same object while the range is unchanged so the 15s poll
        // does not tear down and repaint the zones on every tick.
        setSpan((prev) =>
          prev && prev.from === first.time && prev.to === latest.time
            ? prev
            : { from: first.time, to: latest.time },
        );
        setLast({
          price: latest.close,
          change: first.open ? ((latest.close - first.open) / first.open) * 100 : 0,
        });
        setUpdatedAt(new Date());
        setError(false);
      } catch {
        if (!cancelled) {
          if (!hasRenderedRows) clearMarketState();
          setNoData(false);
          setError(true);
        }
      }
    };

    load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [symbol, timeframe]);

  // --- levels Bobby drew ---
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    lineRefs.current.forEach((line) => series.removePriceLine(line));
    lineRefs.current = drawnLines.map((level) =>
      series.createPriceLine({
        price: level.price,
        color: level.agent ? AGENT_COLOR[level.agent] : LEVEL_COLOR[level.kind],
        // Agent theses are the headline of this chart — draw them heavier than
        // an ordinary support line so they read on a recorded screen.
        lineWidth: level.agent ? 2 : 1,
        lineStyle: level.kind === 'level' ? LineStyle.Dotted : LineStyle.Dashed,
        axisLabelVisible: true,
        title: level.agent ? `${AGENT_LABEL[level.agent]} · ${level.label}` : level.label,
      }),
    );
  }, [drawnLines]);

  // --- agent zones: a shaded band where each agent says the level lives ---
  const zones = useMemo(
    () => drawnLines.filter((line) => line.agent && typeof line.priceTo === 'number'),
    [drawnLines],
  );

  useEffect(() => {
    const chart = chartRef.current;
    zoneRefs.current.forEach((zone) => { try { chart?.removeSeries(zone); } catch { /* chart torn down */ } });
    zoneRefs.current = [];
    if (!chart || !span || !zones.length) return;

    zoneRefs.current = zones.map((zone) => {
      const agent = zone.agent as 'alpha' | 'red' | 'cio';
      const top = Math.max(zone.price, zone.priceTo as number);
      const bottom = Math.min(zone.price, zone.priceTo as number);
      // A baseline series filled down to `bottom` paints the band between the
      // two prices — lightweight-charts has no native rectangle.
      const band = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: bottom },
        topFillColor1: ZONE_FILL[agent],
        topFillColor2: ZONE_FILL[agent],
        topLineColor: 'rgba(0,0,0,0)',
        bottomFillColor1: 'rgba(0,0,0,0)',
        bottomFillColor2: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        // The band is context, not price action — never let it stretch the scale.
        autoscaleInfoProvider: () => null,
      });
      band.setData([
        { time: span.from, value: top },
        { time: span.to, value: top },
      ] as never);
      return band;
    });
  }, [zones, span]);

  const positive = (last?.change ?? 0) >= 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/70 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-mono text-sm font-bold tracking-[0.08em] text-white">
            {isStock ? symbol : `${symbol}/USDT`}
          </span>
          {/* Name the asset the human just spoke, so the chart always says what
              it's showing ("Nvidia", "Bitcoin") — not just a bare ticker. */}
          {getVoiceAsset(symbol)?.name && (
            <span className="hidden truncate text-[11px] text-white/40 sm:inline">
              {getVoiceAsset(symbol)!.name}
            </span>
          )}
          {last && (
            <>
              <span className="font-mono text-lg font-bold text-white">
                ${last.price.toLocaleString('en-US', { maximumFractionDigits: last.price < 10 ? 4 : 2 })}
              </span>
              <span className={`font-mono text-xs ${positive ? 'text-green-400' : 'text-red-400'}`}>
                {positive ? '+' : ''}{last.change.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Seleccionar activo"
            value={symbol}
            onChange={(event) => onSymbolChange(event.target.value)}
            className="max-w-[118px] rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] uppercase text-white/70 outline-none transition hover:border-white/25"
          >
            {/* If Bobby is on an asset outside the curated list (he can chart
                anything the human names), keep it selectable rather than
                silently snapping the picker back to BTC. */}
            {!getVoiceAsset(symbol) && <option value={symbol}>{symbol}</option>}
            {ASSET_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.assets.map((asset) => (
                  <option key={asset.symbol} value={asset.symbol}>
                    {asset.symbol} · {asset.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase transition ${
                tf === timeframe ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* The reading behind the call: computed from the same candles on screen,
          and from the same function the voice tool runs server-side. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 bg-black/25 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em]">
        {([
          { label: 'Tendencia', value: analysis?.trend, tone: analysis?.trend === 'alcista' ? 'text-green-400' : analysis?.trend === 'bajista' ? 'text-[#ff716a]' : 'text-white/50' },
          { label: 'RSI 14', value: analysis?.rsi14, tone: analysis?.momentum === 'sobrecompra' ? 'text-[#ff716a]' : analysis?.momentum === 'sobreventa' ? 'text-green-400' : 'text-white/55' },
          { label: 'EMA 20', value: analysis?.ema20 && formatPrice(analysis.ema20), tone: 'text-[#7da6ff]' },
          { label: 'EMA 50', value: analysis?.ema50 && formatPrice(analysis.ema50), tone: 'text-[#c4b5fd]' },
          { label: 'Soporte', value: analysis?.support && formatPrice(analysis.support), tone: 'text-white/55' },
          { label: 'Resist.', value: analysis?.resistance && formatPrice(analysis.resistance), tone: 'text-white/55' },
          { label: 'ATR', value: analysis?.atrPct !== null && analysis?.atrPct !== undefined ? `${analysis.atrPct}%` : null, tone: 'text-white/55' },
        ] as const).map((item) => (
          <span key={item.label} className="flex items-baseline gap-1">
            <span className="text-white/25">{item.label}</span>
            <span className={item.value === null || item.value === undefined ? 'text-white/20' : item.tone}>
              {item.value ?? '—'}
            </span>
          </span>
        ))}
      </div>

      {/* Legend for the three lines on the chart. Each row names the agent, the
          level it drew and its score — the readable thesis text lives beside
          the chart in VoiceRoom, so it is not repeated here. */}
      <div className="grid grid-cols-3 gap-1 border-b border-white/10 bg-black/20 px-2 py-2">
        {([
          { key: 'alpha', label: 'ALPHA', score: debate?.alphaConviction, waiting: 'busca el setup' },
          { key: 'red', label: 'RED TEAM', score: debate?.redTeamSeverity, waiting: 'ataca la tesis' },
          { key: 'cio', label: 'CIO', score: debate?.cioConviction, waiting: 'decide' },
        ] as const).map((agent) => {
          const line = thesisPrices[agent.key];
          return (
            <div key={agent.key} className="flex min-w-0 items-center gap-1.5 rounded border border-white/10 px-2 py-1.5">
              <span
                className="h-1.5 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: AGENT_COLOR[agent.key], opacity: line ? 1 : 0.25 }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="truncate font-mono text-[8px] font-bold tracking-[.12em]" style={{ color: AGENT_COLOR[agent.key] }}>
                    {agent.label}
                  </span>
                  {agent.score !== null && agent.score !== undefined && (
                    <span className="shrink-0 font-mono text-[8px] text-white/40">{agent.score}%</span>
                  )}
                </div>
                <div className="truncate font-mono text-[8px] text-white/35">
                  {!line
                    ? agent.waiting
                    : typeof line.priceTo === 'number'
                      ? `${line.label} ${formatPrice(Math.min(line.price, line.priceTo))}–${formatPrice(Math.max(line.price, line.priceTo))}`
                      : `${line.label} ${formatPrice(line.price)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {noData && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#050505]/80 px-6 text-center">
            {PRIVATE_COMPANIES[symbol] ? (
              <>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60">
                  {language === 'es'
                    ? `${symbol} es una empresa privada — no cotiza en ningún mercado público`
                    : `${symbol} is a private company — it does not trade on any public market`}
                </span>
                <span className="font-mono text-[9px] text-[#7da6ff]">
                  {language === 'es'
                    ? `exposición listada más cercana: ${PRIVATE_COMPANIES[symbol].join(' · ')}`
                    : `closest listed exposure: ${PRIVATE_COMPANIES[symbol].join(' · ')}`}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                  {language === 'es' ? `sin datos para ${symbol}` : `no data for ${symbol}`}
                </span>
                <span className="font-mono text-[9px] text-white/25">
                  {language === 'es'
                    ? (!getVoiceAsset(symbol)
                        ? 'no hay velas en OKX ni Yahoo Finance para este activo'
                        : `no hay velas en ${isStock ? 'Yahoo Finance' : 'OKX'} para este activo`)
                    : (!getVoiceAsset(symbol)
                        ? 'no candles on OKX or Yahoo Finance for this asset'
                        : `no candles on ${isStock ? 'Yahoo Finance' : 'OKX'} for this asset`)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
        <span>{isStock
          ? (language === 'es' ? 'Yahoo Finance · mercado accionario' : 'Yahoo Finance · equities')
          : (language === 'es' ? 'OKX · mercado cripto' : 'OKX · crypto market')}
        </span>
        <span className={error ? 'text-red-400' : undefined}>
          {error
            ? (language === 'es' ? 'sin datos' : 'no data')
            : updatedAt
              ? `${language === 'es' ? 'actualizado' : 'updated'} ${updatedAt.toLocaleTimeString(language === 'es' ? 'es-MX' : 'en-US')}`
              : (language === 'es' ? 'cargando…' : 'loading…')}
        </span>
      </div>
    </div>
  );
}
