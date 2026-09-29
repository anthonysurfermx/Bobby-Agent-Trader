// The desk's data layer, shared by the Núcleo desk: asset resolution, the one desk read
// (/api/voice-tool run_debate), the three stances cut from it, candles and today's movers.
// Moved out of the previous desk component unchanged; only the exports are new.
import { deskJson } from '@/lib/desk-request';
import { deskPrice as money } from '@/lib/desk-price';
import { lang, t } from '@/lib/companions/i18n';
import type { ChartLevel } from '@/components/adams/MarketCanvas';
import { accessHeaders, type Access, type DeskLevel } from '@/lib/access-client';

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
  /** Metered access: set when the server stopped the read (sign in first, or Bobby Pro), and the meter after a read. */
  gate: 'signin_required' | 'subscription_required' | null; access: Access | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export async function runDebate(symbol: string, signal: AbortSignal): Promise<Answer> {
  const a: Answer = { symbol, price: null, trend: null, momentum: null, rsi: null, support: null, resistance: null, atrPct: null, regime: null, signal: null, direction: null, convictionPct: null, entry: null, stop: null, target: null, rewardRisk: null, overview: null, error: false, gate: null, access: null };
  try {
    const { ok, data: obj } = await deskJson<Record<string, unknown>>('/api/voice-tool', { signal, method: 'POST', headers: { 'Content-Type': 'application/json', ...(await accessHeaders()) }, body: JSON.stringify({ tool: 'run_debate', args: { symbol } }) }, 45_000);
    if (obj && typeof obj === 'object' && obj.access) a.access = obj.access as Access;
    if (!ok && (obj.code === 'signin_required' || obj.code === 'subscription_required')) { a.gate = obj.code; return a; }
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

/** The three-agent debate: /api/desk-debate, three isolated model calls (Alpha, Red Team, CIO; four on
 *  Máximo, with Alpha's second round) over the level's evidence. The same endpoint the iOS app uses.
 *  The web reads it live (NDJSON): each argument arrives as soon as its model answered and passed the guard.
 *  A premium level the reader has used up comes back as a refusal, never as a silent downgrade. */
export interface Synthesis { headline: string; why: string; risk: string; watch: string }
export interface Agents {
  alpha: string; red: string; cio: string; verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
  level: DeskLevel; rebuttal: string | null; scenarios: { confirm: string; invalidate: string } | null;
  /** The CIO's answer for a reader in a hurry: shown first, the debate stays one tap away. */
  synthesis: Synthesis | null;
  /** What the evidence covered against the horizon asked (the desk states it before any thesis). */
  sufficiency: { horizon: string; available: string[]; missing: string[]; sufficient: boolean } | null;
  evidenceUsed: { timeframes: string[]; derivatives: boolean; record: { resolvedCalls: number; wins: number; losses: number; breakEven: number } | null } | null;
}
export interface AgentsRefusal { code: 'signin_required' | 'upgrade_required' | 'level_exhausted'; level: DeskLevel; resetsAt: string | null }
/** failed: the agents did not finish (a premium use is given back by the server); budget_paused: the spend guard. */
export interface DebateRun { agents: Agents | null; refusal: AgentsRefusal | null; failure: 'failed' | 'budget_paused' | null }
export type DeskLiveEvent =
  | { type: 'accepted' }
  | { type: 'evidence'; timeframes: string[] }
  | { type: 'agent'; role: 'alpha' | 'red' | 'rebuttal'; text: string };
const LEVEL_TIMEOUT: Record<DeskLevel, number> = { rapido: 95_000, profundo: 130_000, maximo: 175_000 };
const text = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function debateFrom(ok: boolean, data: Record<string, any> | null, level: DeskLevel): DebateRun {
  const failed: DebateRun = { agents: null, refusal: null, failure: 'failed' };
  if (!ok && (data?.code === 'signin_required' || data?.code === 'upgrade_required' || data?.code === 'level_exhausted')) {
    return { agents: null, failure: null, refusal: { code: data.code, level, resetsAt: typeof data.meter?.resetsAt === 'string' ? data.meter.resetsAt : null } };
  }
  if (!ok && data?.code === 'budget_paused') return { agents: null, refusal: null, failure: 'budget_paused' };
  const g = data?.agents;
  if (!ok || !g || typeof g.alpha !== 'string' || typeof g.red !== 'string' || typeof g.cio !== 'string') return failed;
  if (g.verdict !== 'wait' && g.verdict !== 'review') return failed;
  const direction = g.direction === 'long' || g.direction === 'short' ? g.direction : 'none';
  const scenarios = g.scenarios && typeof g.scenarios.confirm === 'string' && typeof g.scenarios.invalidate === 'string' ? { confirm: g.scenarios.confirm, invalidate: g.scenarios.invalidate } : null;
  const sy = g.synthesis;
  const synthesis = sy && text(sy.headline) && text(sy.why) && text(sy.risk) && text(sy.watch) ? { headline: text(sy.headline)!, why: text(sy.why)!, risk: text(sy.risk)!, watch: text(sy.watch)! } : null;
  return { refusal: null, failure: null, agents: {
    alpha: g.alpha, red: g.red, cio: g.cio, verdict: g.verdict, direction,
    level: data!.level === 'profundo' || data!.level === 'maximo' ? data!.level : 'rapido',
    rebuttal: typeof g.rebuttal === 'string' ? g.rebuttal : null, scenarios, synthesis,
    sufficiency: data!.sufficiency && Array.isArray(data!.sufficiency.missing) ? data!.sufficiency : null,
    evidenceUsed: data!.evidenceUsed && Array.isArray(data!.evidenceUsed.timeframes) ? data!.evidenceUsed : null,
  } };
}

export async function runAgents(symbol: string, isEquity: boolean, question: string, signal: AbortSignal, level: DeskLevel = 'rapido', onEvent?: (event: DeskLiveEvent) => void): Promise<DebateRun> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) cancel();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, LEVEL_TIMEOUT[level]);
  try {
    const response = await fetch('/api/desk-debate', {
      signal: controller.signal, method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json', ...(await accessHeaders()) },
      body: JSON.stringify({ symbol, assetType: isEquity ? 'equity' : 'crypto', question: question.slice(0, 1200), language: lang(), level }),
    });
    // Refusals (and a server without the live desk) answer plain JSON.
    if (!(response.headers.get('content-type') ?? '').includes('ndjson') || !response.body) {
      return debateFrom(response.ok, await response.json().catch(() => null), level);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        let event: Record<string, any>;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === 'final') return debateFrom(true, event.data, level);
        if (event.type === 'error') return { agents: null, refusal: null, failure: 'failed' };
        if (event.type === 'accepted') onEvent?.({ type: 'accepted' });
        else if (event.type === 'evidence' && Array.isArray(event.timeframes)) onEvent?.({ type: 'evidence', timeframes: event.timeframes });
        else if (event.type === 'agent' && (event.role === 'alpha' || event.role === 'red' || event.role === 'rebuttal') && typeof event.text === 'string') onEvent?.({ type: 'agent', role: event.role, text: event.text });
      }
      if (done) break;
    }
    return { agents: null, refusal: null, failure: 'failed' };
  } catch {
    return { agents: null, refusal: null, failure: 'failed' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

export function isUnavailable(a: Answer) { return a.error || (a.price === null && a.trend === null && a.signal === null && a.direction === null && a.overview === null); }
export function isNoTrade(a: Answer, g?: Agents | null) {
  if (isUnavailable(a)) return false;
  // The debate can only veto the engine, never upgrade it: a trade needs the CIO to rule
  // "review" in the engine's own direction. No finished debate, no approved idea.
  if (g !== undefined && (!g || g.verdict !== 'review' || g.direction !== (a.direction ?? '').toLowerCase())) return true;
  const s = (a.signal ?? '').toLowerCase().replace(/-/g, '_');
  if (s.includes('no_trade') || s.includes('neutral') || s.includes('wait')) return true;
  if (!['long', 'short'].includes((a.direction ?? '').toLowerCase())) return true;
  if ((a.convictionPct ?? 0) < 55) return true;
  return a.entry === null || a.stop === null || a.target === null;
}
export function noTradeReason(a: Answer, g?: Agents | null) {
  if (g === null) return t('The debate did not finish, so no idea was approved.', 'El debate no terminó, así que ninguna idea fue aprobada.', 'O debate não terminou, então nenhuma ideia foi aprovada.');
  if (g && g.verdict === 'wait') return t('The CIO ruled wait: the evidence does not support a clear case.', 'El CIO dictó esperar: la evidencia no sostiene un caso claro.', 'O CIO decidiu esperar: a evidência não sustenta um caso claro.');
  if (g && g.direction !== (a.direction ?? '').toLowerCase()) return t('The CIO and the indicator engine disagree on direction.', 'El CIO y el motor de indicadores no coinciden en la dirección.', 'O CIO e o motor de indicadores discordam na direção.');
  const s = (a.signal ?? '').toLowerCase();
  if (s.includes('neutral') || s.includes('wait')) return t('No clean directional signal passed the desk.', 'Ninguna señal direccional limpia pasó el desk.', 'Nenhum sinal direcional limpo passou pelo desk.');
  if (!a.direction) return t('The agents did not reach directional consensus.', 'Los agentes no llegaron a consenso direccional.', 'Os agentes não chegaram a um consenso de direção.');
  if ((a.convictionPct ?? 0) < 55) return t("Conviction stayed below Bobby's 55% risk gate.", 'La convicción quedó debajo del filtro de riesgo de 55% de Bobby.', 'A convicção ficou abaixo do filtro de risco de 55% do Bobby.');
  return t('The setup did not include a complete entry, stop and target.', 'El setup no incluyó entrada, stop y objetivo completos.', 'O setup não trouxe entrada, stop e alvo completos.');
}
export function localizedTrend(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes('alcista') || s.includes('bull') || s.includes('up')) return t('bullish', 'alcista', 'de alta');
  if (s.includes('bajista') || s.includes('bear') || s.includes('down')) return t('bearish', 'bajista', 'de baixa');
  if (s.includes('lateral') || s.includes('range') || s.includes('side')) return t('sideways', 'lateral', 'lateral');
  return raw;
}
export function localizedMomentum(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes('sobrecompra') || s.includes('overbought')) return t('overbought', 'sobrecompra', 'sobrecomprado');
  if (s.includes('sobreventa') || s.includes('oversold')) return t('oversold', 'sobreventa', 'sobrevendido');
  return t('neutral', 'neutral', 'neutro');
}
// ---- The three agents ----
// Two sources, one rule. The indicator engine (/api/voice-tool run_debate) gives the
// levels, the conviction and the chart. The debate (/api/desk-debate) gives each role's
// words and the CIO's ruling, and it can only veto the engine: a trade shows only when
// the CIO rules "review" in the engine's direction (iOS ARCHITECTURE.md R5). Without a
// finished debate the lines fall back to the engine's own read and nothing is approved.
export type AgentKey = 'alpha' | 'red' | 'cio';
export interface Stance { key: AgentKey; name: string; line: string; score: number | null; level: { kind: ChartLevel['kind']; price: number; label: string; to?: number } | null }
export interface Debate { stances: [Stance, Stance, Stance]; headline: string; spoken: string; noTrade: boolean; direction: 'long' | 'short' | 'none' }
export const AGENT_TONE: Record<AgentKey, string> = { alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E' };

export function debateFor(a: Answer, g?: Agents | null): Debate {
  const noTrade = isNoTrade(a, g);
  const direction: Debate['direction'] = !noTrade && a.direction === 'long' ? 'long' : !noTrade && a.direction === 'short' ? 'short' : 'none';
  const withSide = direction !== 'none';
  const long = direction === 'long';
  const conv = a.convictionPct !== null ? Math.round(a.convictionPct) : null;
  const read = [a.trend ? t(`trend ${localizedTrend(a.trend)}`, `tendencia ${localizedTrend(a.trend)}`, `tendência ${localizedTrend(a.trend)}`) : null, a.rsi !== null ? `RSI ${Math.round(a.rsi)}` : null].filter(Boolean).join(', ');
  const heat = a.momentum && a.momentum !== 'neutral' ? localizedMomentum(a.momentum) : null;
  const heatNote = heat && heat !== t('neutral', 'neutral', 'neutro') ? t(` RSI ${heat}.`, ` RSI en ${heat}.`, ` RSI ${heat}.`) : '';
  // Zones about one ATR wide, the same rule the voice desk follows; no ATR, no band.
  const half = a.atrPct !== null && a.price !== null ? a.price * (a.atrPct / 100) * 0.5 : null;
  const zone = (price: number, towards: 1 | -1) => (half ? price + half * towards : undefined);
  const back: 1 | -1 = long ? -1 : 1;   // towards the side that breaks the thesis
  const ahead: 1 | -1 = long ? 1 : -1;  // towards the target

  let alpha: Stance;
  if (withSide && a.entry !== null) {
    alpha = { key: 'alpha', name: 'ALPHA HUNTER', score: conv, line: t(`${long ? 'Bullish' : 'Bearish'} setup: ${read}. Entry ${money(a.entry)}.`, `Setup ${long ? 'alcista' : 'bajista'}: ${read}. Entrada ${money(a.entry)}.`, `Setup ${long ? 'de alta' : 'de baixa'}: ${read}. Entrada ${money(a.entry)}.`), level: { kind: 'entry', price: a.entry, label: t('entry', 'entrada', 'entrada'), to: zone(a.entry, back) } };
  } else {
    const watch = a.support ?? a.resistance;
    alpha = { key: 'alpha', name: 'ALPHA HUNTER', score: conv, line: t(`No clean setup${read ? `: ${read}` : ''}.${watch !== null ? ` Watching ${money(watch)}.` : ''}`, `Sin setup limpio${read ? `: ${read}` : ''}.${watch !== null ? ` Vigila ${money(watch)}.` : ''}`, `Sem setup limpo${read ? `: ${read}` : ''}.${watch !== null ? ` De olho em ${money(watch)}.` : ''}`), level: watch !== null ? { kind: 'entry', price: watch, label: a.support !== null ? t('support', 'soporte', 'suporte') : t('resistance', 'resistencia', 'resistência') } : null };
  }

  const severity = conv !== null ? Math.max(0, Math.min(100, 100 - conv)) : null;
  let red: Stance;
  if (withSide && a.stop !== null) {
    red = { key: 'red', name: 'RED TEAM', score: severity, line: t(`Thesis breaks ${long ? 'below' : 'above'} ${money(a.stop)}.${heatNote}`, `La tesis se rompe si ${long ? 'pierde' : 'supera'} ${money(a.stop)}.${heatNote}`, `A tese quebra ${long ? 'abaixo de' : 'acima de'} ${money(a.stop)}.${heatNote}`), level: { kind: 'stop', price: a.stop, label: t('invalidation', 'invalidación', 'invalidação'), to: zone(a.stop, back) } };
  } else if (a.support !== null && a.resistance !== null) {
    red = { key: 'red', name: 'RED TEAM', score: severity, line: t(`No edge between ${money(a.support)} and ${money(a.resistance)}.${heatNote}`, `Sin ventaja entre ${money(a.support)} y ${money(a.resistance)}.${heatNote}`, `Sem vantagem entre ${money(a.support)} e ${money(a.resistance)}.${heatNote}`), level: { kind: 'stop', price: a.resistance, label: t('resistance', 'resistencia', 'resistência') } };
  } else {
    red = { key: 'red', name: 'RED TEAM', score: severity, line: t('Not enough structure to defend a thesis.', 'No hay estructura suficiente para defender una tesis.', 'Não há estrutura suficiente para defender uma tese.'), level: null };
  }

  const rr = a.rewardRisk !== null ? ` · R:R ${a.rewardRisk.toFixed(1)}` : '';
  const cio: Stance = withSide && a.target !== null
    ? { key: 'cio', name: 'CIO', score: conv, line: t(`${conv}% conviction · target ${money(a.target)}${rr}`, `${conv}% de convicción · objetivo ${money(a.target)}${rr}`, `${conv}% de convicção · alvo ${money(a.target)}${rr}`), level: { kind: 'target', price: a.target, label: t('target', 'objetivo', 'alvo'), to: zone(a.target, ahead) } }
    : { key: 'cio', name: 'CIO', score: conv, line: noTradeReason(a, g), level: null };

  const headline = direction === 'none' ? 'NO TRADE' : `${direction.toUpperCase()}${conv !== null ? ` ${conv}%` : ''}`;
  if (g) {
    // The real debate: each role's own words. Levels, scores and the chart stay the engine's.
    alpha = { ...alpha, line: g.alpha };
    red = { ...red, line: g.red };
    const cioReal: Stance = { ...cio, line: g.cio };
    const close = direction === 'none'
      ? t('My call: no trade.', 'Mi lectura: no operar.', 'Minha leitura: não operar.')
      : t(`My call: ${direction}, ${conv}% conviction. Reference only.`, `Mi lectura: ${direction}, ${conv}% de convicción. Solo referencia.`, `Minha leitura: ${direction}, ${conv}% de convicção. Apenas referência.`);
    const cioSpoken = g.cio.length > 600 ? `${g.cio.slice(0, 600).replace(/\s+\S*$/, '')}…` : g.cio;
    // With the CIO's synthesis, Bobby says the answer and its reason, not the whole ruling.
    const spoken = g.synthesis ? `${g.synthesis.headline} ${g.synthesis.why}` : `${cioSpoken} ${close}`;
    return { stances: [alpha, red, cioReal], headline, spoken, noTrade, direction };
  }
  const at = a.price !== null ? t(`${a.symbol} is at ${money(a.price)}. `, `${a.symbol} está en ${money(a.price)}. `, `${a.symbol} está em ${money(a.price)}. `) : '';
  const spoken = withSide && a.entry !== null && a.stop !== null && a.target !== null
    ? at + t(
      `Alpha Hunter sees a ${long ? 'bullish' : 'bearish'} setup${read ? `: ${read}` : ''}, entry at ${money(a.entry)}. Red Team: the thesis breaks ${long ? 'below' : 'above'} ${money(a.stop)}. CIO: ${long ? 'bullish' : 'bearish'} bias with ${conv}% conviction, target ${money(a.target)}. Reference only.`,
      `Alpha Hunter ve setup ${long ? 'alcista' : 'bajista'}${read ? `: ${read}` : ''}, entrada en ${money(a.entry)}. Red Team: la tesis se rompe si ${long ? 'pierde' : 'supera'} ${money(a.stop)}. CIO: sesgo ${long ? 'alcista' : 'bajista'} con ${conv}% de convicción, objetivo ${money(a.target)}. Solo referencia.`,
      `Alpha Hunter vê um setup ${long ? 'de alta' : 'de baixa'}${read ? `: ${read}` : ''}, entrada em ${money(a.entry)}. Red Team: a tese quebra ${long ? 'abaixo de' : 'acima de'} ${money(a.stop)}. CIO: viés ${long ? 'de alta' : 'de baixa'} com ${conv}% de convicção, alvo ${money(a.target)}. Apenas referência.`,
    )
    : at + t(
      `Alpha Hunter finds no clean setup${read ? `: ${read}` : ''}. Red Team: ${red.line} CIO: NO TRADE, capital protected. ${noTradeReason(a, g)}`,
      `Alpha Hunter no ve un setup limpio${read ? `: ${read}` : ''}. Red Team: ${red.line} CIO: NO TRADE, capital protegido. ${noTradeReason(a, g)}`,
      `Alpha Hunter não vê um setup limpo${read ? `: ${read}` : ''}. Red Team: ${red.line} CIO: NO TRADE, capital protegido. ${noTradeReason(a, g)}`,
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

export interface Candle { ts: number; close: number; high: number | null; low: number | null; volume: number | null }
export async function candles(symbol: string, isEquity: boolean): Promise<Candle[]> {
  try {
    const url = isEquity ? `/api/stock-candles?symbol=${symbol}&range=7d&interval=1h` : `/api/okx-candles?instId=${symbol}-USDT&bar=1H&limit=100`;
    const res = await fetch(url);
    const obj = (await res.json()) as { candles?: Array<Record<string, unknown>> };
    const opt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return (obj.candles ?? []).map((r) => ({ ts: Number(r.ts), close: Number(r.close), high: opt(r.high), low: opt(r.low), volume: opt(r.volume) })).filter((c) => Number.isFinite(c.close));
  } catch { return []; }
}

export { money };
