// The desk's data layer, shared by the Núcleo desk: asset resolution, the one desk read
// (/api/voice-tool run_debate), the three stances cut from it, candles and today's movers.
// Moved out of the previous desk component unchanged; only the exports are new.
import { deskJson } from '@/lib/desk-request';
import { deskPrice as money } from '@/lib/desk-price';
import { t } from '@/lib/companions/i18n';
import type { ChartLevel } from '@/components/adams/MarketCanvas';

export interface Snapshot { symbol: string; name?: string; isEquity: boolean }
export interface Resolution { snapshot: Snapshot; needsConfirmation: boolean; confirmName: string; proxyNote: string | null }

export async function assetSearch(q: string, limit?: number, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const { ok, data } = await deskJson<Record<string, unknown>>('/api/bobby-asset-search', { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, ...(limit ? { limit } : {}) }) });
    if (ok) return data;
  } catch { /* Fall back only while this search is still current. */ }
  if (signal?.aborted) return null;
  try {
    const { ok, data } = await deskJson<Record<string, unknown>>(`/api/bobby-asset-search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`, { signal });
    if (ok) return data;
  } catch { /* Surface an unavailable result to the caller. */ }
  return null;
}

export function prettyName(raw: string, symbol: string): string {
  if (!raw || raw === symbol) return symbol;
  if (/[&0-9]/.test(raw)) return raw;
  return raw.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function resolveAsset(query: string, signal?: AbortSignal): Promise<Resolution | null> {
  const obj = await assetSearch(query, undefined, signal);
  if (!obj) return null;
  const resolution = obj.resolution as Record<string, unknown> | undefined;
  const resolved = (obj.resolved ?? (obj.results as Record<string, unknown>[] | undefined)?.[0]) as Record<string, unknown> | undefined;
  if (!resolved) return null;
  const symbol = String(resolved.baseSymbol ?? resolved.symbol ?? '').toUpperCase();
  if (!symbol) return null;
  const aliases = (resolved.aliases as string[] | undefined) ?? [];
  return {
    snapshot: { symbol, name: (resolved.displayName as string | undefined) ?? undefined, isEquity: resolved.assetClass === 'equity' },
    needsConfirmation: Boolean(resolution?.needsConfirmation),
    confirmName: prettyName(aliases.find((a) => a !== symbol) ?? symbol, symbol),
    proxyNote: (resolution?.proxyNote as string | null | undefined) ?? null,
  };
}

export interface Answer {
  symbol: string; price: number | null; trend: string | null; momentum: string | null; rsi: number | null; support: number | null; resistance: number | null; atrPct: number | null;
  regime: string | null; signal: string | null; direction: string | null; convictionPct: number | null; entry: number | null; stop: number | null; target: number | null; rewardRisk: number | null; overview: string | null; error: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export async function runDebate(symbol: string, signal: AbortSignal): Promise<Answer> {
  const a: Answer = { symbol, price: null, trend: null, momentum: null, rsi: null, support: null, resistance: null, atrPct: null, regime: null, signal: null, direction: null, convictionPct: null, entry: null, stop: null, target: null, rewardRisk: null, overview: null, error: false };
  try {
    const { ok, data: obj } = await deskJson<Record<string, unknown>>('/api/voice-tool', { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'run_debate', args: { symbol } }) }, 45_000);
    if (!ok || obj.error) { a.error = true; return a; }
    a.regime = str(obj.regime);
    const m = obj.market as Record<string, unknown> | undefined;
    a.price = num(m?.price);
    const tech = obj.technicals as Record<string, unknown> | null | undefined;
    if (tech) { a.price = a.price ?? num(tech.price); a.trend = str(tech.trend); a.momentum = str(tech.momentum); a.rsi = num(tech.rsi14); a.support = num(tech.support); a.resistance = num(tech.resistance); a.atrPct = num(tech.atrPct); }
    const p = obj.technical_pulse as Record<string, unknown> | null | undefined;
    if (p) {
      a.signal = str(p.signal); a.direction = str(p.direction); a.convictionPct = num(p.conviction_pct); a.overview = str(p.overview);
      const plan = p.trade_plan as Record<string, unknown> | null | undefined;
      if (plan) { a.entry = num(plan.entry); a.stop = num(plan.stop); a.target = num(plan.target); a.rewardRisk = num(plan.rewardRisk); }
    }
  } catch { a.error = true; }
  return a;
}

export function isUnavailable(a: Answer) { return a.error || (a.price === null && a.trend === null && a.signal === null && a.direction === null && a.overview === null); }
export function isNoTrade(a: Answer) {
  if (isUnavailable(a)) return false;
  const s = (a.signal ?? '').toLowerCase().replace(/-/g, '_');
  if (s.includes('no_trade') || s.includes('neutral') || s.includes('wait')) return true;
  if (!['long', 'short'].includes((a.direction ?? '').toLowerCase())) return true;
  if ((a.convictionPct ?? 0) < 55) return true;
  return a.entry === null || a.stop === null || a.target === null;
}
export function noTradeReason(a: Answer) {
  const s = (a.signal ?? '').toLowerCase();
  if (s.includes('neutral') || s.includes('wait')) return t('No clean directional signal passed the desk.', 'Ninguna señal direccional limpia pasó el desk.');
  if (!a.direction) return t('The agents did not reach directional consensus.', 'Los agentes no llegaron a consenso direccional.');
  if ((a.convictionPct ?? 0) < 55) return t("Conviction stayed below Bobby's 55% risk gate.", 'La convicción quedó debajo del filtro de riesgo de 55% de Bobby.');
  return t('The setup did not include a complete entry, stop and target.', 'El setup no incluyó entrada, stop y objetivo completos.');
}
export function localizedTrend(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes('alcista') || s.includes('bull') || s.includes('up')) return t('bullish', 'alcista');
  if (s.includes('bajista') || s.includes('bear') || s.includes('down')) return t('bearish', 'bajista');
  if (s.includes('lateral') || s.includes('range') || s.includes('side')) return t('sideways', 'lateral');
  return raw;
}
export function localizedMomentum(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes('sobrecompra') || s.includes('overbought')) return t('overbought', 'sobrecompra');
  if (s.includes('sobreventa') || s.includes('oversold')) return t('oversold', 'sobreventa');
  return t('neutral', 'neutral');
}
// ---- The three agents, from one answer ----
// The desk endpoint returns one technical read (price, trend, RSI, levels, a
// plan with conviction). The three roles are cut from that same evidence the
// way the voice desk's own instructions cut them: Alpha on the setup and its
// trigger, Red Team on the level that breaks it, the CIO on the decision and
// the target. One source for the spoken verdict, the rows and the chart.
export type AgentKey = 'alpha' | 'red' | 'cio';
export interface Stance { key: AgentKey; name: string; line: string; score: number | null; level: { kind: ChartLevel['kind']; price: number; label: string; to?: number } | null }
export interface Debate { stances: [Stance, Stance, Stance]; headline: string; spoken: string; noTrade: boolean; direction: 'long' | 'short' | 'none' }
export const AGENT_TONE: Record<AgentKey, string> = { alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E' };

export function debateFor(a: Answer): Debate {
  const noTrade = isNoTrade(a);
  const direction: Debate['direction'] = !noTrade && a.direction === 'long' ? 'long' : !noTrade && a.direction === 'short' ? 'short' : 'none';
  const withSide = direction !== 'none';
  const long = direction === 'long';
  const conv = a.convictionPct !== null ? Math.round(a.convictionPct) : null;
  const read = [a.trend ? t(`trend ${localizedTrend(a.trend)}`, `tendencia ${localizedTrend(a.trend)}`) : null, a.rsi !== null ? `RSI ${Math.round(a.rsi)}` : null].filter(Boolean).join(', ');
  const heat = a.momentum && a.momentum !== 'neutral' ? localizedMomentum(a.momentum) : null;
  const heatNote = heat && heat !== t('neutral', 'neutral') ? t(` RSI ${heat}.`, ` RSI en ${heat}.`) : '';
  // Zones about one ATR wide, the same rule the voice desk follows; no ATR, no band.
  const half = a.atrPct !== null && a.price !== null ? a.price * (a.atrPct / 100) * 0.5 : null;
  const zone = (price: number, towards: 1 | -1) => (half ? price + half * towards : undefined);
  const back: 1 | -1 = long ? -1 : 1;   // towards the side that breaks the thesis
  const ahead: 1 | -1 = long ? 1 : -1;  // towards the target

  let alpha: Stance;
  if (withSide && a.entry !== null) {
    alpha = { key: 'alpha', name: 'ALPHA HUNTER', score: conv, line: t(`${long ? 'Bullish' : 'Bearish'} setup: ${read}. Entry ${money(a.entry)}.`, `Setup ${long ? 'alcista' : 'bajista'}: ${read}. Entrada ${money(a.entry)}.`), level: { kind: 'entry', price: a.entry, label: t('entry', 'entrada'), to: zone(a.entry, back) } };
  } else {
    const watch = a.support ?? a.resistance;
    alpha = { key: 'alpha', name: 'ALPHA HUNTER', score: conv, line: t(`No clean setup${read ? `: ${read}` : ''}.${watch !== null ? ` Watching ${money(watch)}.` : ''}`, `Sin setup limpio${read ? `: ${read}` : ''}.${watch !== null ? ` Vigila ${money(watch)}.` : ''}`), level: watch !== null ? { kind: 'entry', price: watch, label: a.support !== null ? t('support', 'soporte') : t('resistance', 'resistencia') } : null };
  }

  const severity = conv !== null ? Math.max(0, Math.min(100, 100 - conv)) : null;
  let red: Stance;
  if (withSide && a.stop !== null) {
    red = { key: 'red', name: 'RED TEAM', score: severity, line: t(`Thesis breaks ${long ? 'below' : 'above'} ${money(a.stop)}.${heatNote}`, `La tesis se rompe si ${long ? 'pierde' : 'supera'} ${money(a.stop)}.${heatNote}`), level: { kind: 'stop', price: a.stop, label: t('invalidation', 'invalidación'), to: zone(a.stop, back) } };
  } else if (a.support !== null && a.resistance !== null) {
    red = { key: 'red', name: 'RED TEAM', score: severity, line: t(`No edge between ${money(a.support)} and ${money(a.resistance)}.${heatNote}`, `Sin ventaja entre ${money(a.support)} y ${money(a.resistance)}.${heatNote}`), level: { kind: 'stop', price: a.resistance, label: t('resistance', 'resistencia') } };
  } else {
    red = { key: 'red', name: 'RED TEAM', score: severity, line: t('Not enough structure to defend a thesis.', 'No hay estructura suficiente para defender una tesis.'), level: null };
  }

  const rr = a.rewardRisk !== null ? ` · R:R ${a.rewardRisk.toFixed(1)}` : '';
  const cio: Stance = withSide && a.target !== null
    ? { key: 'cio', name: 'CIO', score: conv, line: t(`${conv}% conviction · target ${money(a.target)}${rr}`, `${conv}% de convicción · objetivo ${money(a.target)}${rr}`), level: { kind: 'target', price: a.target, label: t('target', 'objetivo'), to: zone(a.target, ahead) } }
    : { key: 'cio', name: 'CIO', score: conv, line: noTradeReason(a), level: null };

  const headline = direction === 'none' ? 'NO TRADE' : `${direction.toUpperCase()}${conv !== null ? ` ${conv}%` : ''}`;
  const at = a.price !== null ? t(`${a.symbol} is at ${money(a.price)}. `, `${a.symbol} está en ${money(a.price)}. `) : '';
  const spoken = withSide && a.entry !== null && a.stop !== null && a.target !== null
    ? at + t(
      `Alpha Hunter sees a ${long ? 'bullish' : 'bearish'} setup${read ? `: ${read}` : ''}, entry at ${money(a.entry)}. Red Team: the thesis breaks ${long ? 'below' : 'above'} ${money(a.stop)}. CIO: ${long ? 'bullish' : 'bearish'} bias with ${conv}% conviction, target ${money(a.target)}. Reference only.`,
      `Alpha Hunter ve setup ${long ? 'alcista' : 'bajista'}${read ? `: ${read}` : ''}, entrada en ${money(a.entry)}. Red Team: la tesis se rompe si ${long ? 'pierde' : 'supera'} ${money(a.stop)}. CIO: sesgo ${long ? 'alcista' : 'bajista'} con ${conv}% de convicción, objetivo ${money(a.target)}. Solo referencia.`,
    )
    : at + t(
      `Alpha Hunter finds no clean setup${read ? `: ${read}` : ''}. Red Team: ${red.line} CIO: NO TRADE, capital protected. ${noTradeReason(a)}`,
      `Alpha Hunter no ve un setup limpio${read ? `: ${read}` : ''}. Red Team: ${red.line} CIO: NO TRADE, capital protegido. ${noTradeReason(a)}`,
    );
  return { stances: [alpha, red, cio], headline, spoken, noTrade, direction };
}

export interface Mover { symbol: string; changePct: number }
export async function topMovers(limit = 2): Promise<Mover[]> {
  const out: Mover[] = [];
  try {
    const res = await fetch('/api/bobby-asset-search?browse=1');
    const obj = (await res.json()) as { movers?: Array<{ symbol: string; change24h: number | null }> };
    for (const r of obj.movers ?? []) if (typeof r.change24h === 'number') out.push({ symbol: r.symbol, changePct: r.change24h });
  } catch { /* ignore */ }
  if (!out.length) {
    try {
      const res = await fetch('/api/okx-tickers');
      const obj = (await res.json()) as { tickers?: Array<{ symbol: string; change24h: number }> };
      for (const r of obj.tickers ?? []) if (typeof r.change24h === 'number') out.push({ symbol: r.symbol, changePct: r.change24h });
      out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    } catch { /* ignore */ }
  }
  return out.slice(0, limit);
}

export interface Candle { ts: number; close: number }
export async function candles(symbol: string, isEquity: boolean): Promise<Candle[]> {
  try {
    const url = isEquity ? `/api/stock-candles?symbol=${symbol}&range=7d&interval=1h` : `/api/okx-candles?instId=${symbol}-USDT&bar=1H&limit=100`;
    const res = await fetch(url);
    const obj = (await res.json()) as { candles?: Array<Record<string, unknown>> };
    return (obj.candles ?? []).map((r) => ({ ts: Number(r.ts), close: Number(r.close) })).filter((c) => Number.isFinite(c.close));
  } catch { return []; }
}

export { money };
