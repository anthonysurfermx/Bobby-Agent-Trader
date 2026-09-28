// ============================================================
// Path resolution for public calls: grade a call against the 1H candle path
// between its commitment and its expiry, never against today's price.
// ============================================================

export type Bar = { t: number; o: number; h: number; l: number; c: number };

const HOUR_MS = 60 * 60 * 1000;

// 1H candles that OPEN inside [fromMs, toMs] — the bar in progress when the
// call was made is excluded, so no price action before the call is graded. OKX first (crypto spot, then swap —
// stocks list as SWAP), Yahoo for listed equities. Oldest → newest.
export async function getHourlyBars(symbol: string, fromMs: number, toMs: number): Promise<Bar[] | null> {
  const bars = Math.min(100, Math.ceil((toMs - fromMs) / HOUR_MS) + 2);
  for (const instId of [`${symbol}-USDT`, `${symbol}-USDT-SWAP`]) {
    try {
      const url = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1H&after=${toMs + HOUR_MS}&limit=${bars}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const json = await r.json() as { code: string; data?: string[][] };
      if (json.code !== '0' || !json.data?.length) continue;
      return json.data
        .map((k) => ({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]) }))
        .filter((b) => b.t >= fromMs && b.t <= toMs)
        .sort((a, b) => a.t - b.t);
    } catch { continue; }
  }
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&period1=${Math.floor(fromMs / 1000)}&period2=${Math.ceil(toMs / 1000)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      const ts: number[] = result?.timestamp || [];
      const q = result?.indicators?.quote?.[0] || {};
      const out: Bar[] = [];
      ts.forEach((sec, i) => {
        const b = { t: sec * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i] };
        if (b.t >= fromMs && [b.o, b.h, b.l, b.c].every((v) => typeof v === 'number' && v > 0)) out.push(b as Bar);
      });
      if (out.length) return out;
    }
  } catch { /* silent */ }
  return null;
}

export type Outcome = { resolution: 'win' | 'loss' | 'break_even'; exitPrice: number; exitAt: number; pnlPct: number };

/**
 * Resolve a call against the PATH of the market between commitment and expiry,
 * never against today's price. First touch wins; a bar that touches both stop
 * and target counts as the stop (conservative — intrabar order is unknown).
 * No touch by expiry → marked at the close of the last bar inside the window.
 */
export function resolveByPath(
  t: { direction: string | null; entry_price: number; stop_price: number | null; target_price: number | null },
  bars: Bar[],
  expiresMs: number,
  nowMs: number,
): Outcome | null {
  const isLong = t.direction !== 'short';
  const entry = t.entry_price;
  const pnl = (exit: number) => ((isLong ? exit - entry : entry - exit) / entry) * 100;
  for (const b of bars) {
    if (b.t + HOUR_MS > expiresMs) break; // only bars fully inside the window
    const hitStop = t.stop_price ? (isLong ? b.l <= t.stop_price : b.h >= t.stop_price) : false;
    const hitTarget = t.target_price ? (isLong ? b.h >= t.target_price : b.l <= t.target_price) : false;
    if (hitStop) return { resolution: 'loss', exitPrice: t.stop_price, exitAt: b.t + HOUR_MS, pnlPct: pnl(t.stop_price) };
    if (hitTarget) return { resolution: 'win', exitPrice: t.target_price, exitAt: b.t + HOUR_MS, pnlPct: pnl(t.target_price) };
  }
  if (expiresMs > nowMs) return null;
  const inside = bars.filter((b) => b.t + HOUR_MS <= expiresMs + 1);
  const last = inside[inside.length - 1];
  // Not enough history to mark the expiry honestly: leave it pending.
  if (!last || expiresMs - (last.t + HOUR_MS) > 2 * HOUR_MS) return null;
  const p = pnl(last.c);
  return { resolution: Math.abs(p) < 1 ? 'break_even' : p > 0 ? 'win' : 'loss', exitPrice: last.c, exitAt: last.t + HOUR_MS, pnlPct: p };
}
