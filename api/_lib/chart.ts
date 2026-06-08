// ============================================================
// api/_lib/chart.ts — Candlestick chart image for the DM
// ------------------------------------------------------------
// Free by default: renders a candlestick PNG with QuickChart
// from live OKX candles for the resolved instId (works for any
// asset: crypto SPOT or stock/metal/fx SWAP). If CHARTIMG_API_KEY
// is set, upgrades to a real TradingView Advanced Chart.
//
// Additive: returns null on any failure so the DM flow still
// delivers the verdict + voice without a chart.
// ============================================================

const OKX = 'https://www.okx.com';

export interface ChartImage {
  image: Buffer;
  mime: string;
}

// CHART_INTERVAL (e.g. "4h") → OKX bar ("4H").
function intervalToOkxBar(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D', '1w': '1W',
  };
  return map[interval.toLowerCase()] || '4H';
}

async function fetchCandles(instId: string, bar: string, limit = 60): Promise<number[][]> {
  try {
    const res = await fetch(`${OKX}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { code?: string; data?: string[][] };
    if (!json || json.code !== '0' || !json.data) return [];
    return json.data
      .map((c) => [Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4])])
      .reverse();
  } catch {
    return [];
  }
}

// ── Premium: real TradingView chart via chart-img.com (needs key) ──
async function chartImgImage(instId: string, label: string, interval: string): Promise<ChartImage | null> {
  const key = process.env.CHARTIMG_API_KEY;
  if (!key) return null;
  const base = instId.split('-')[0];
  const isSwap = instId.endsWith('-SWAP');
  // Crypto → BINANCE spot; stock tokens → OKX swap (best-effort TradingView symbol).
  const ex = (process.env.CHART_EXCHANGE || (isSwap ? 'OKX' : 'BINANCE')).toUpperCase();
  const tvSymbol = isSwap ? `${ex}:${base}USDT.P` : `${ex}:${base}USDT`;
  // Native TradingView studies so the chart reflects what the audio cites.
  const studies = [
    { name: 'Moving Average', input: { length: 20 }, override: { 'Plot.color': 'rgb(59,130,246)' } },
    { name: 'Moving Average', input: { length: 50 }, override: { 'Plot.color': 'rgb(249,115,22)' } },
    { name: 'Volume' },
    { name: 'Relative Strength Index', input: { length: 14 } },
    { name: 'MACD' },
  ];
  try {
    const res = await fetch('https://api.chart-img.com/v2/tradingview/advanced-chart', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: tvSymbol,
        interval,
        theme: 'dark',
        width: 800,
        height: 600,
        studies,
      }),
    });
    if (!res.ok) {
      console.error('[chart] chart-img', res.status, (await res.text()).slice(0, 160));
      return null;
    }
    const image = Buffer.from(await res.arrayBuffer());
    return image.length > 0 ? { image, mime: 'image/png' } : null;
  } catch (err) {
    console.error('[chart] chart-img error', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Free: candlestick PNG via QuickChart from OKX candles ──
async function quickChartImage(instId: string, label: string, bar: string): Promise<ChartImage | null> {
  const candles = await fetchCandles(instId, bar);
  if (candles.length === 0) return null;

  const points = candles.map((c) => ({ x: c[0], o: c[1], h: c[2], l: c[3], c: c[4] }));
  const up = '#22c55e';
  const down = '#ef4444';

  const chart = {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: `${label} · ${bar}`,
          data: points,
          color: { up, down, unchanged: '#9ca3af' },
          borderColor: { up, down, unchanged: '#9ca3af' },
        },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#e5e7eb' } } },
      scales: {
        x: { type: 'time', ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { position: 'right', ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  };

  try {
    const res = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart,
        width: 800,
        height: 500,
        format: 'png',
        backgroundColor: '#0b0e11',
        version: '4',
      }),
    });
    if (!res.ok) {
      console.error('[chart] quickchart', res.status, (await res.text()).slice(0, 160));
      return null;
    }
    const image = Buffer.from(await res.arrayBuffer());
    return image.length > 0 ? { image, mime: 'image/png' } : null;
  } catch (err) {
    console.error('[chart] quickchart error', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Chart PNG for an OKX instId. chart-img.com (TradingView) when
 * CHARTIMG_API_KEY is set, otherwise free QuickChart candlesticks.
 */
export async function getChartImage(instId: string, label: string): Promise<ChartImage | null> {
  const interval = process.env.CHART_INTERVAL || '4h';
  const bar = intervalToOkxBar(interval);

  if (process.env.CHARTIMG_API_KEY) {
    const premium = await chartImgImage(instId, label, interval);
    if (premium) return premium;
  }
  return quickChartImage(instId, label, bar);
}
