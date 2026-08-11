// ============================================================
// MarketCanvas — the live surface Bobby talks over.
// Real candles from OKX, redrawn on a poll, with the levels Bobby names
// appearing as price lines the moment he says them.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
} from 'lightweight-charts';

export interface ChartLevel {
  price: number;
  label: string;
  kind: 'entry' | 'stop' | 'target' | 'level';
}

const LEVEL_COLOR: Record<ChartLevel['kind'], string> = {
  entry: '#7da6ff',
  stop: '#ff716a',
  target: '#4ade80',
  level: '#8b8b93',
};

const TIMEFRAMES = ['5m', '15m', '1H', '4H', '1D'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

export function MarketCanvas({
  symbol,
  timeframe,
  levels,
  onTimeframeChange,
}: {
  symbol: string;
  timeframe: Timeframe;
  levels: ChartLevel[];
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lineRefs = useRef<IPriceLine[]>([]);
  const [last, setLast] = useState<{ price: number; change: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);

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
    };
  }, []);

  // --- load + poll candles ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/okx-candles?instId=${symbol}-USDT&bar=${timeframe}&limit=100`,
          { cache: 'no-store' },
        );
        const payload = await response.json();
        // /api/okx-candles returns { candles: [{ ts, open, high, low, close, volume }] },
        // oldest first; raw OKX arrays are tolerated as a fallback.
        const rows: Candle[] = (payload.candles ?? payload.data ?? [])
          .map((row: Record<string, number | string> | Array<number | string>) => {
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

        if (cancelled || !rows.length || !candleRef.current) return;

        candleRef.current.setData(rows as never);
        volumeRef.current?.setData(
          rows.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(0,82,255,0.35)' : 'rgba(120,120,135,0.25)',
          })) as never,
        );

        const first = rows[0];
        const latest = rows[rows.length - 1];
        setLast({
          price: latest.close,
          change: first.open ? ((latest.close - first.open) / first.open) * 100 : 0,
        });
        setUpdatedAt(new Date());
        setError(false);
      } catch {
        if (!cancelled) setError(true);
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
    lineRefs.current = levels.map((level) =>
      series.createPriceLine({
        price: level.price,
        color: LEVEL_COLOR[level.kind],
        lineWidth: 1,
        lineStyle: level.kind === 'level' ? LineStyle.Dotted : LineStyle.Dashed,
        axisLabelVisible: true,
        title: level.label,
      }),
    );
  }, [levels]);

  const positive = (last?.change ?? 0) >= 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#0b0b12]/70 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-bold tracking-[0.08em] text-white">{symbol}/USDT</span>
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

      <div ref={containerRef} className="min-h-0 flex-1" />

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
        <span>OKX · velas en vivo</span>
        <span className={error ? 'text-red-400' : undefined}>
          {error ? 'sin datos' : updatedAt ? `actualizado ${updatedAt.toLocaleTimeString('es-MX')}` : 'cargando…'}
        </span>
      </div>
    </div>
  );
}
