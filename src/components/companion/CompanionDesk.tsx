// The Live Desk on the web — the iPhone experience, same rules:
// hyped greeting with today's real movers in the companion's voice, ask any
// asset (600+), the three-agent desk runs, verdict or NO TRADE, discipline XP
// (capped, never for volume), evolution and gear drops, tool belt, squad,
// explore board, risk notice. Bobby never executes anything.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeftRight, Globe, Grid2x2, Lock, Map as MapIcon, Mic, MicOff, MoreHorizontal, RotateCcw, Share2, ShieldAlert, Users, Volume2, VolumeX, X } from 'lucide-react';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { COMPANIONS, LEVEL_TONE, companionName, getCompanion, getVibe, levelFor, tintFor, toolArt, toolHasArt, type Companion, type CompanionLevel, type CompanionTool } from '@/lib/companions/data';
import { isSpanish, pick, t } from '@/lib/companions/i18n';
import { progressStore, useProgress, type ThesisSnapshot } from '@/lib/companions/progress';
import { sfxMuted, sfxShield, sfxSuccess, sfxTock, setSfxMuted } from '@/lib/companions/sfx';
import { voiceScreenState } from '@/lib/realtime-context';
import { useCompanionVoice } from '@/hooks/useCompanionVoice';
import RiskNotice from './RiskNotice';
import ProgressSync from './ProgressSync';
import LangSelect from './LangSelect';
import SignInPrompt, { recordAsk, shouldPromptAfterAsk, shouldPromptNow } from './SignInPrompt';
import { getSyncStatus } from '@/lib/companions/sync';
import { MarketCanvas, type ChartLevel, type Timeframe } from '@/components/adams/MarketCanvas';
import { EvolutionOverlay, GearCatalog, NoTradeCard, ToolBelt, ToolDetail, ToolUnlockOverlay, WorldMapTeaser } from './CompanionOverlays';
import { DeskSwapCard, SwapSheet } from './DeskSwap';
import { WalletBalancePill } from './DeskWallet';
import { PET_UNLOCK_XP, petArt, petFor, petUnlocked, toolSlot, wornGear } from '@/lib/companions/data';

import { deskJson } from '@/lib/desk-request';
import { deskPrice as money } from '@/lib/desk-price';

// ---- API (mirrors BobbyAPI.swift) ----

interface Snapshot { symbol: string; name?: string; isEquity: boolean }
interface Resolution { snapshot: Snapshot; needsConfirmation: boolean; confirmName: string; proxyNote: string | null }

async function assetSearch(q: string, limit?: number, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
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

function prettyName(raw: string, symbol: string): string {
  if (!raw || raw === symbol) return symbol;
  if (/[&0-9]/.test(raw)) return raw;
  return raw.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function resolveAsset(query: string, signal?: AbortSignal): Promise<Resolution | null> {
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

interface Answer {
  symbol: string; price: number | null; trend: string | null; momentum: string | null; rsi: number | null; support: number | null; resistance: number | null; atrPct: number | null;
  regime: string | null; signal: string | null; direction: string | null; convictionPct: number | null; entry: number | null; stop: number | null; target: number | null; rewardRisk: number | null; overview: string | null; error: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

async function runDebate(symbol: string, signal: AbortSignal): Promise<Answer> {
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

function isUnavailable(a: Answer) { return a.error || (a.price === null && a.trend === null && a.signal === null && a.direction === null && a.overview === null); }
function isNoTrade(a: Answer) {
  if (isUnavailable(a)) return false;
  const s = (a.signal ?? '').toLowerCase().replace(/-/g, '_');
  if (s.includes('no_trade') || s.includes('neutral') || s.includes('wait')) return true;
  if (!['long', 'short'].includes((a.direction ?? '').toLowerCase())) return true;
  if ((a.convictionPct ?? 0) < 55) return true;
  return a.entry === null || a.stop === null || a.target === null;
}
function noTradeReason(a: Answer) {
  const s = (a.signal ?? '').toLowerCase();
  if (s.includes('neutral') || s.includes('wait')) return t('No clean directional signal passed the desk.', 'Ninguna señal direccional limpia pasó el desk.');
  if (!a.direction) return t('The agents did not reach directional consensus.', 'Los agentes no llegaron a consenso direccional.');
  if ((a.convictionPct ?? 0) < 55) return t("Conviction stayed below Bobby's 55% risk gate.", 'La convicción quedó debajo del filtro de riesgo de 55% de Bobby.');
  return t('The setup did not include a complete entry, stop and target.', 'El setup no incluyó entrada, stop y objetivo completos.');
}
function localizedTrend(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes('alcista') || s.includes('bull') || s.includes('up')) return t('bullish', 'alcista');
  if (s.includes('bajista') || s.includes('bear') || s.includes('down')) return t('bearish', 'bajista');
  if (s.includes('lateral') || s.includes('range') || s.includes('side')) return t('sideways', 'lateral');
  return raw;
}
function localizedMomentum(raw: string) {
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
type AgentKey = 'alpha' | 'red' | 'cio';
interface Stance { key: AgentKey; name: string; line: string; score: number | null; level: { kind: ChartLevel['kind']; price: number; label: string; to?: number } | null }
interface Debate { stances: [Stance, Stance, Stance]; headline: string; spoken: string; noTrade: boolean; direction: 'long' | 'short' | 'none' }
const AGENT_TONE: Record<AgentKey, string> = { alpha: '#4ade80', red: '#ff716a', cio: '#facc15' };

function debateFor(a: Answer): Debate {
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

function DeskReadSource() {
  return <p className="mt-2 text-[11px] text-white/50">{t('Based on 1H market indicators. ', 'Basado en indicadores de mercado de 1H. ')}<a href="/protocol" className="text-sky-300 underline">{t('View public agent activity', 'Ver actividad pública de los agentes')}</a></p>;
}

/** The three stances as three rows — the simplest honest picture of the desk. */
function StanceRows({ debate }: { debate: Debate }) {
  const verdictTone = debate.direction === 'none' ? '#7dd3fc' : debate.direction === 'short' ? '#ff716a' : '#4ade80';
  return (
    <div className="space-y-2">
      {debate.stances.map((s) => (
        <div key={s.key} className="flex items-start gap-3 rounded-lg border px-3 py-2" style={{ borderColor: `${AGENT_TONE[s.key]}40`, background: `${AGENT_TONE[s.key]}0a` }}>
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: AGENT_TONE[s.key], boxShadow: `0 0 8px ${AGENT_TONE[s.key]}` }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: AGENT_TONE[s.key] }}>{s.name}</span>
              {s.key === 'cio' ? <span className="font-mono text-xs font-bold tracking-[0.12em]" style={{ color: verdictTone }}>{debate.headline}</span> : s.score !== null && <span className="font-mono text-[10px] text-white/40">{s.score}%</span>}
            </div>
            <div className="mt-0.5 text-sm leading-snug text-white/85">{s.line}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Mover { symbol: string; changePct: number }
async function topMovers(): Promise<Mover[]> {
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
  return out.slice(0, 2);
}

interface Candle { ts: number; close: number }
async function candles(symbol: string, isEquity: boolean): Promise<Candle[]> {
  try {
    const url = isEquity ? `/api/stock-candles?symbol=${symbol}&range=7d&interval=1h` : `/api/okx-candles?instId=${symbol}-USDT&bar=1H&limit=100`;
    const res = await fetch(url);
    const obj = (await res.json()) as { candles?: Array<Record<string, unknown>> };
    return (obj.candles ?? []).map((r) => ({ ts: Number(r.ts), close: Number(r.close) })).filter((c) => Number.isFinite(c.close));
  } catch { return []; }
}

// ---- Component ----

interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
}

type Phase = 'idle' | 'resolving' | 'alpha' | 'redTeam' | 'cio' | 'complete' | 'error' | 'confirm';
interface Msg { from: 'bobby' | 'you'; text: string }

export default function CompanionDesk() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [freeVoice, setFreeVoice] = useState(params.get('voice') === 'free');
  const initialScreen = voiceScreenState(params.get('symbol'), params.get('timeframe'));
  const returned = location.state as { voiceFallback?: boolean; transcript?: Array<{ role: string; text: string }> } | null;
  const [voiceNotice, setVoiceNotice] = useState(returned?.voiceFallback ? t('Live paused · free voice ready', 'Live en pausa · voz gratis lista') : '');
  const progress = useProgress();
  const voice = useCompanionVoice();
  const companion = getCompanion(progress.companionId) ?? COMPANIONS[1];
  const vibe = getVibe(progress.vibeId);
  const level = levelFor(progress.xp);
  const tint = tintFor(companion);
  const displayName = companionName(companion, level.number);

  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<Msg[]>(() => (returned?.transcript ?? []).map(line => ({ from: line.role === 'user' ? 'you' : 'bobby', text: line.text })));
  const [input, setInput] = useState(() => returned?.transcript?.at(-1)?.role === 'user' ? returned.transcript.at(-1)!.text : '');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [series, setSeries] = useState<Candle[]>([]);
  const [pending, setPending] = useState<Resolution | null>(null);
  const [noTrade, setNoTrade] = useState<{ symbol: string; reason: string; xp: number } | null>(null);
  const [evolution, setEvolution] = useState<CompanionLevel | null>(null);
  const [drops, setDrops] = useState<CompanionTool[]>([]);
  const [inspected, setInspected] = useState<CompanionTool | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'board' | 'squad' | 'risk' | 'catalog' | 'pet' | 'world' | 'swap'>('none');
  const [signInPrompt, setSignInPrompt] = useState(false);
  // A prompt owed from a previous visit (reached the threshold behind an
  // evolution or a drop, then reloaded) is raised here; the render guard
  // still waits for the overlays to clear.
  useEffect(() => { if (shouldPromptNow(getSyncStatus() === 'synced')) setSignInPrompt(true); }, []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [equip, setEquip] = useState<{ url: string; token: number }>({ url: '', token: 0 });
  const [muted, setMuted] = useState(sfxMuted());
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const speakEnabledRef = useRef(speakEnabled);
  speakEnabledRef.current = speakEnabled;
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const booted = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  useEffect(() => () => { requestRef.current?.abort(); recognitionRef.current?.stop(); }, []);

  const say = useCallback((text: string, essential = true) => {
    if (!speakEnabledRef.current) return;
    void voice.speak(text, { voice: companion.voicePersona, vibe: vibe.server, essential, mode: 'free' });
  }, [voice, companion.voicePersona, vibe.server, speakEnabled]);

  // Hyped greeting with today's real movers, once.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (returned?.voiceFallback) return;
    void (async () => {
      const movers = await topMovers();
      const pct = (m: Mover) => `${m.changePct >= 0 ? '+' : '-'}${Math.abs(m.changePct).toFixed(1)}%`;
      const name = displayName;
      let text: string;
      if (!movers.length) text = t(`${name}: I'm in. Welcome to the desk — name an asset and we go.`, `${name}: Ya estoy dentro. Bienvenido al desk: nombra un activo y le entramos.`);
      else {
        const [f, s] = movers;
        const tail = s ? ` ${s.symbol} ${pct(s)}.` : '';
        if (vibe.id === 'chill') text = f.changePct >= 0 ? t(`${name}: Yo, we're live. ${f.symbol} is up ${pct(f)} in 24h.${tail} Wanna take a look?`, `${name}: Ey, ya estamos en vivo. ${f.symbol} subió ${pct(f)} en 24 horas.${tail} ¿Le echamos un ojo?`) : t(`${name}: Yo, we're live. ${f.symbol} dropped ${pct(f)} in 24h.${tail} Wanna see if it's a chance?`, `${name}: Ey, ya estamos en vivo. ${f.symbol} cayó ${pct(f)} en 24 horas.${tail} ¿Vemos si es oportunidad?`);
        else if (vibe.id === 'directo') text = t(`${name}: Desk open. Biggest move: ${f.symbol} ${pct(f)} in 24h.${tail} Say the word.`, `${name}: Desk abierto. Mayor movimiento: ${f.symbol} ${pct(f)} en 24 horas.${tail} Tú dices.`);
        else text = t(`${name}: Session open. Lead mover ${f.symbol} ${pct(f)} over 24h.${tail} Pick one and I run the desk.`, `${name}: Sesión abierta. Líder del día: ${f.symbol} ${pct(f)} en 24 horas.${tail} Elige uno y corro el desk.`);
      }
      text += pick(LEVEL_TONE[level.number] ?? { en: '', es: '' });
      if (!requestRef.current) {
        setMessages((m) => [...m, { from: 'bobby', text }]);
        say(text, false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useCallback(async (snap: Snapshot, controller?: AbortController) => {
    if (!controller) { requestRef.current?.abort(); controller = new AbortController(); requestRef.current = controller; }
    const { signal } = controller;
    if (signal.aborted) return;
    setDeskError(null);
    setSnapshot(snap);
    setAnswer(null);
    setNoTrade(null);
    setSeries([]);
    setPhase('alpha');
    void candles(snap.symbol, snap.isEquity).then((rows) => { if (!signal.aborted) setSeries(rows); });
    const stage = setTimeout(() => { if (!signal.aborted) setPhase('redTeam'); }, 700);
    const stage2 = setTimeout(() => { if (!signal.aborted) setPhase('cio'); }, 1400);
    const a = await runDebate(snap.symbol, signal);
    clearTimeout(stage); clearTimeout(stage2);
    if (signal.aborted) return;
    if (isUnavailable(a)) {
      setPhase('error');
      const msg = t(`The desk did not answer for ${snap.symbol}. Try again in a moment.`, `El desk no respondió por ${snap.symbol}. Inténtalo de nuevo en un momento.`);
      setDeskError(msg);
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      say(msg);
      return;
    }
    setAnswer(a);
    setPhase('complete');
    const text = debateFor(a).spoken;
    setMessages((m) => [...m, { from: 'bobby', text }]);
    say(text);
    const noTradeNow = isNoTrade(a);
    if (noTradeNow) sfxShield(); else sfxSuccess();
    // A full review earns discipline; respecting NO TRADE earns more. The
    // number shown is what the daily cap ACTUALLY granted. The verdict rides
    // along as the thesis the seed will be reviewed against in Trader Land.
    const level = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
    const thesis: ThesisSnapshot = { symbol: snap.symbol, isEquity: snap.isEquity, direction: a.direction === 'long' ? 'long' : a.direction === 'short' ? 'short' : 'none', price: level(a.price), entry: level(a.entry), stop: level(a.stop), target: level(a.target) };
    const result = progressStore.awardDiscipline(noTradeNow ? 'no_trade_respected' : 'read_complete', new Date(), thesis);
    if (noTradeNow) setNoTrade({ symbol: snap.symbol, reason: noTradeReason(a), xp: result.awarded });
    if (result.evolvedTo) setEvolution(result.evolvedTo);
    if (result.drops.length) setDrops((d) => [...d, ...result.drops]);
    // Quick access remembers what you actually read.
    const qa = [snap.symbol, ...progress.quickAccess.filter((s) => s !== snap.symbol)].slice(0, 3);
    progressStore.setQuickAccess(qa);
  }, [say, progress.quickAccess]);

  const ask = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    voice.stop();
    setDeskError(null);
    setAnswer(null);
    setSnapshot(null);
    setPending(null);
    setNoTrade(null);
    setSeries([]);
    // The soft "keep your points" ask: raised once, after the visitor has
    // actually got value out of the desk, never as a gate in front of it.
    if (shouldPromptAfterAsk(recordAsk(), getSyncStatus() === 'synced')) setSignInPrompt(true);
    sfxTock();
    setInput('');
    setMessages((m) => [...m, { from: 'you', text: q }]);
    setPhase('resolving');
    const r = await resolveAsset(q, controller.signal);
    if (controller.signal.aborted) return;
    if (!r) {
      setPhase('error');
      const msg = t('I could not resolve that asset. Try a name or ticker: bitcoin, NVDA, gold.', 'No pude resolver ese activo. Prueba con el nombre o ticker: bitcoin, NVDA, oro.');
      setDeskError(msg);
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      return;
    }
    if (r.needsConfirmation) { setPending(r); setPhase('confirm'); return; }
    await analyze(r.snapshot, controller);
  }, [analyze, voice]);

  const toggleDictation = () => {
    voice.stop();
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!freeVoice) {
      navigate(`/agentic-world/bobby/voice-room?start=1&symbol=${encodeURIComponent(chartSymbol)}&timeframe=${encodeURIComponent(chartTimeframe)}`);
      return;
    }
    // Browser dictation + the existing market engine + free TTS. No Realtime call.
    const Speech = (window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition });
    const Recognition = Speech.SpeechRecognition ?? Speech.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice(t('Use keyboard dictation · Bobby replies aloud', 'Dicta con el teclado · Bobby responde con voz'));
      inputRef.current?.focus(); return;
    }
    const recognition = new Recognition();
    recognition.lang = isSpanish() ? 'es-MX' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    let finalText = '';
    recognition.onresult = event => {
      let draft = '';
      finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        draft += event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      setInput(draft);
    };
    recognition.onerror = () => { setListening(false); setVoiceNotice(t('Check microphone access or type below', 'Revisa el micrófono o escribe abajo')); };
    recognition.onend = () => {
      setListening(false); recognitionRef.current = null;
      if (finalText.trim()) void ask(finalText.trim());
    };
    recognitionRef.current = recognition;
    setSpeakEnabled(true);
    try { recognition.start(); setListening(true); setVoiceNotice(''); }
    catch { setListening(false); recognitionRef.current = null; inputRef.current?.focus(); }
  };
  useEffect(() => () => {
    const recognition = recognitionRef.current as BrowserRecognition | null;
    if (recognition) { recognition.onend = null; recognition.onresult = null; recognition.onerror = null; recognition.abort(); }
  }, []);

  /** Share my skin: the live WebGL frame plus worn gear and pet composed on a
   *  1080×1350 card; Web Share on phones, a download elsewhere. */
  const shareSkin = async () => {
    try {
      const canvas = stageRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      const card = document.createElement('canvas');
      card.width = 1080; card.height = 1350;
      const ctx = card.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#030305'; ctx.fillRect(0, 0, 1080, 1350);
      const grad = ctx.createRadialGradient(540, 560, 0, 540, 560, 620);
      grad.addColorStop(0, tintFor(companion, 0.35)); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 30px ui-monospace, monospace'; ctx.fillText(`BOBBY // ${t('MY SKIN', 'MI SKIN')}`, 72, 100);
      if (canvas) ctx.drawImage(canvas, 160, 150, 760, 760);
      const worn = wornGear(companion.id, progress.xp);
      const pet = petUnlocked(progress.xp) ? petFor(companion.id) : null;
      const spots: Record<number, [number, number]> = { 1: [760, 560], 2: [230, 380], 3: [540, 150] };
      await Promise.all(worn.map((tool) => new Promise<void>((resolve) => {
        if (!toolHasArt(tool)) { resolve(); return; }
        const img = new Image(); img.onload = () => { const [x, y] = spots[tool.tier]; ctx.drawImage(img, x - 90, y - 90, 180, 180); resolve(); }; img.onerror = () => resolve(); img.src = toolArt(tool);
      })));
      if (pet) { ctx.font = '150px serif'; ctx.fillText(pet.emoji, 180, 900); }
      ctx.fillStyle = 'white'; ctx.font = 'bold 76px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(displayName, 540, 1000);
      ctx.fillStyle = tintFor(companion); ctx.font = 'bold 26px ui-monospace, monospace'; ctx.fillText(`${t('LEVEL', 'NIVEL')} ${level.number} · ${level.name} · ${progress.xp} XP`, 540, 1050);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '28px system-ui, sans-serif';
      const line = [...worn.map((w) => pick(w.name)), ...(pet ? [pick(pet.name)] : [])].join(' · ') || t('No gear yet — first read drops the first tool.', 'Sin equipo aún — la primera lectura suelta la primera herramienta.');
      ctx.fillText(line.slice(0, 70), 540, 1120);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '22px ui-monospace, monospace'; ctx.fillText(`bobbyprotocol.xyz · ${t('earned with discipline, never volume', 'ganado con disciplina, nunca volumen')}`, 540, 1280);
      const blob = await new Promise<Blob | null>((r) => card.toBlob(r, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'bobby-skin.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: 'Bobby', text: t('My Bobby skin — earned with discipline, never volume.', 'Mi skin de Bobby — ganada con disciplina, nunca volumen.') }); return; }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bobby-skin.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* user cancelled or canvas tainted */ }
  };

  const statusLabel = listening ? t('LISTENING', 'ESCUCHANDO') : voice.speaking ? t('SPEAKING', 'BOBBY HABLA') : ({ idle: t('DESK ONLINE', 'DESK ONLINE'), resolving: t('LINKING ASSET', 'ENLAZANDO ACTIVO'), alpha: 'ALPHA HUNTER', redTeam: 'RED TEAM', cio: 'CIO', complete: t('VERDICT READY', 'VEREDICTO LISTO'), error: t('INCOMPLETE LINK', 'ENLACE INCOMPLETO'), confirm: t('CONFIRM ASSET', 'CONFIRMA EL ACTIVO') } as Record<Phase, string>)[phase];
  const statusHint = voiceNotice || (phase === 'error' ? t('Try the name or ticker', 'Prueba con el nombre o ticker') : '');
  const mascotState = listening ? 'listening' : voice.speaking ? 'speaking' : ['alpha', 'redTeam', 'cio', 'resolving'].includes(phase) ? 'thinking' : 'idle';
  const canDictate = true;
  const isWorking = ['resolving', 'alpha', 'redTeam', 'cio'].includes(phase);
  const openTraderLand = useCallback(() => {
    sfxTock();
    navigate('/trader-land');
  }, [navigate]);

  const chart = useMemo(() => buildChart(series, answer), [series, answer]);

  // Worn gear (pieces still in the loot queue are not worn yet — they fly on
  // when the human taps EQUIP IT) plus the pet at the feet.
  const desktop = useMediaQuery('(min-width: 1024px)');
  const mascotSize = desktop ? 340 : 260;
  const [chartSymbol, setChartSymbol] = useState(initialScreen.symbol);
  // 1H: the verdict is computed on 1H candles, so the chart's indicator strip
  // must open on the same bars or the two contradict each other at first paint.
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>(initialScreen.timeframe as Timeframe);
  useEffect(() => { if (snapshot?.symbol) setChartSymbol(snapshot.symbol); }, [snapshot?.symbol]);
  // The three stances, derived once from the answer that also feeds the voice:
  // the rows under the chart and the lines on it can never disagree.
  const debate = useMemo(() => (answer ? debateFor(answer) : null), [answer]);
  const chartLevels = useMemo<ChartLevel[]>(() => !debate ? [] : debate.stances.flatMap((s) => (s.level ? [{ kind: s.level.kind, price: s.level.price, label: s.level.label, agent: s.key, ...(s.level.to !== undefined ? { priceTo: s.level.to } : {}) }] : [])), [debate]);
  const chartDebate = useMemo(() => !debate ? null : { alpha: debate.stances[0].line, redTeam: debate.stances[1].line, cio: debate.stances[2].line, alphaConviction: debate.stances[0].score, redTeamSeverity: debate.stances[1].score, cioConviction: debate.stances[2].score, indicators: [] as string[], levels: [] as ChartLevel[] }, [debate]);

  const attachments = useMemo(() => {
    const pending = new Set(drops.map((d) => `${d.companionId}-${d.tier}`));
    const items: Array<{ url: string; slot: string; spin?: boolean; glow?: string }> = wornGear(companion.id, progress.xp)
      .filter((tool) => !pending.has(`${tool.companionId}-${tool.tier}`) && toolHasArt(tool))
      .map((tool) => ({ url: toolArt(tool), slot: toolSlot(tool) as string, glow: tool.tier === 3 ? '#F5C542' : undefined }));
    const pet = petUnlocked(progress.xp) ? petFor(companion.id) : null;
    const art = pet ? petArt(companion.id) : null;
    if (pet && art) items.push({ url: art, slot: 'pet', spin: pet.spins, glow: undefined });
    return items;
  }, [companion.id, progress.xp, drops]);

  // The pieces of the desk, composed twice: the phone layout (one column,
  // composer pinned to the bottom) and the production desktop layout (companion
  // centered, mic below, the live chart on the right).
  const headerNode = (
    <>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden items-center gap-3 lg:flex">
          <div className="relative">
            <img src={`/mascots/${companion.id}.webp`} alt="" className="h-11 w-11 rounded-full object-cover border" style={{ borderColor: tintFor(companion, 0.6) }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-400 text-black text-[10px] font-bold flex items-center justify-center">{level.number}</span>
          </div>
          <div>
            <div className="text-white font-mono tracking-[0.2em] text-sm">LIVE DESK</div>
            <div className="text-[10px] font-mono tracking-[0.15em]" style={{ color: tint }}>{displayName}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" aria-label={t('Voice mode', 'Modo de voz')} onClick={() => { voice.stop(); const recognition = recognitionRef.current as BrowserRecognition | null; if (recognition) { recognition.onend = null; recognition.abort(); recognitionRef.current = null; setListening(false); } setFreeVoice(v => !v); setVoiceNotice(''); }} className="h-10 rounded-full border border-white/[0.06] px-3 font-mono text-[10px] text-sky-300">{freeVoice ? t('Free', 'Gratis') : 'Live'}</button>
          <div className="hidden lg:block"><LangSelect /></div>
          {/* Trader Land lives here as a compact control: the chart stays the co-star of the desk. */}
          <button type="button" onClick={openTraderLand} aria-label="Trader Land" title="Trader Land" className="hidden h-10 shrink-0 items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-200/[0.06] pl-1 pr-1 text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-200/[0.12] lg:flex">
            <img src="/land/v1/gate-A/aura_core/ne/stage1_thumb_256.png" alt="" width="32" height="32" className="h-8 w-8 object-contain" />
          </button>
          <WalletBalancePill onClick={() => { sfxTock(); setSheet('swap'); }} />
          <div className="hidden lg:block"><ProgressSync onChoose={() => { sfxTock(); setSignInPrompt(true); }} /></div>
          <button aria-label={speakEnabled ? t('Mute voice', 'Silenciar voz') : t('Enable voice', 'Activar voz')} onClick={() => setSpeakEnabled((v) => { if (v) voice.stop(); return !v; })} className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04] text-sky-300 lg:flex">{speakEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
          <div className="relative">
            <button aria-label={t('More options', 'Más opciones')} onClick={() => setMenu((m) => !m)} className="h-10 w-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/70"><MoreHorizontal size={16} /></button>
            <AnimatePresence>
              {menu && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 mt-2 w-60 rounded-xl bg-[#0b0b0e] border border-white/[0.08] p-1 z-30 text-sm">
                  {[
                    { icon: <Grid2x2 size={14} />, label: t('Explore markets', 'Explorar mercados'), act: () => setSheet('board') },
                    { icon: <Grid2x2 size={14} />, label: t('Tools', 'Herramientas'), act: () => setSheet('catalog') },
                    { icon: <ArrowLeftRight size={14} />, label: t('Swap on Base', 'Swap en Base'), act: () => setSheet('swap') },
                    { icon: <Users size={14} />, label: t('My squad', 'Mi squad'), act: () => setSheet('squad') },
                    { icon: <MapIcon size={14} />, label: 'Trader Land', act: openTraderLand },
                    { icon: <Share2 size={14} />, label: t('Share my skin', 'Compartir mi skin'), act: () => void shareSkin() },
                    { icon: <ShieldAlert size={14} />, label: t('Risk notice', 'Aviso de riesgo'), act: () => setSheet('risk') },
                    { icon: <Globe size={14} />, label: isSpanish() ? 'English' : 'Español', act: () => { try { localStorage.setItem('bobby_lang', isSpanish() ? 'en' : 'es'); } catch { /* private mode */ } window.location.reload(); } },
                    { icon: muted ? <VolumeX size={14} /> : <Volume2 size={14} />, label: muted ? t('Sounds off', 'Sonidos apagados') : t('Sounds on', 'Sonidos encendidos'), act: () => { setSfxMuted(!muted); setMuted(!muted); } },
                    { icon: <RotateCcw size={14} />, label: t('Reset companion', 'Reiniciar companion'), act: () => { if (window.confirm(t('Reset XP, gear and companion on this browser?', '¿Reiniciar XP, equipo y companion en este navegador?'))) progressStore.reset(); } },
                  ].map((item) => (
                    <button key={item.label} onClick={() => { setMenu(false); item.act(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/80 hover:bg-white/[0.05] text-left">{item.icon}{item.label}</button>
                  ))}
                  <div className="px-3 py-2 text-[10px] font-mono text-white/35">{t('Your wallet signs every swap', 'Tu wallet firma cada swap')}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

    </>
  );
  const stageNode = (
    <>
      {/* stage */}
      <div className="flex flex-col items-center py-2" style={{ background: `radial-gradient(circle at 50% 40%, ${tintFor(companion, 0.16)}, transparent 60%)` }}>
        <div ref={stageRef} className="relative" style={{ width: mascotSize, height: mascotSize }}>
          <BobbyMascot3D
            look={{ ...DEFAULT_MASCOT, body: companion.palette, avatar: companion.id }}
            state={mascotState}
            level={voice.speaking ? voice.level : null}
            size={mascotSize}
            attachments={attachments}
            equipUrl={equip.url}
            equipToken={equip.token}
          />
        </div>
      </div>
    </>
  );
  const confirmNode = (
    <>
      {deskError && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4 text-sm text-red-200">{deskError}</div>}
      {/* confirm */}
      {phase === 'confirm' && pending && (
        <div className="rounded-xl p-4 bg-white/[0.02] border border-amber-400/30 text-sm text-white/80">
          <div className="text-[10px] font-mono tracking-[0.2em] text-amber-300">{t('DID YOU MEAN', '¿QUISISTE DECIR')}</div>
          <div className="mt-1 text-white text-lg">{pending.confirmName} ({pending.snapshot.symbol})</div>
          {pending.proxyNote && <div className="text-xs text-white/50 mt-1">{pending.proxyNote}</div>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => { const r = pending; setPending(null); void analyze(r.snapshot); }} className="px-4 py-2 rounded-lg bg-green-400 text-black text-xs font-mono tracking-[0.15em]">{t('YES, ANALYZE', 'SÍ, ANALIZA')}</button>
            <button onClick={() => { setPending(null); setPhase('idle'); }} className="px-4 py-2 rounded-lg border border-white/10 text-white/70 text-xs font-mono tracking-[0.15em]">{t('NO', 'NO')}</button>
          </div>
        </div>
      )}

    </>
  );
  const noTradeNode = (compact = false) => (
    <>
      {/* NO TRADE halo */}
      {noTrade && <NoTradeCard compact={compact} symbol={noTrade.symbol} reason={noTrade.reason} xp={noTrade.xp} onClose={() => setNoTrade(null)} />}

    </>
  );
  const marketNode = (
    <>
      {/* market card */}
      {snapshot && answer && (
        <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-white">{snapshot.symbol}</span>
            <span className="text-[10px] font-mono tracking-[0.15em] text-white/40">{snapshot.isEquity ? 'EQUITY' : 'CRYPTO'}</span>
          </div>
          {answer.price !== null && <div className="text-4xl font-mono text-white">{money(answer.price)}</div>}
          {debate && <><StanceRows debate={debate} /><DeskReadSource /></>}
        </div>
      )}
      {snapshot && answer && debate && debate.direction === 'long' && <DeskSwapCard symbol={snapshot.symbol} conviction={answer.convictionPct} />}

    </>
  );
  const quickNode = (
    <>
      {/* quick access */}
      {!snapshot && phase !== 'confirm' && (
        <div className="flex items-center justify-center gap-2">
            <button onClick={() => setSheet('board')} className="rounded-xl border border-sky-400/40 bg-sky-400/[0.06] px-4 py-2 text-sm font-medium text-sky-300">{t('Explore', 'Explorar')}</button>
            {progress.quickAccess.slice(0, 2).map((s) => (
              <button key={s} onClick={() => void ask(s)} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm font-medium text-white">{s}</button>
            ))}
        </div>
      )}

    </>
  );
  const logNode = (
    <>
      {/* desk log */}
      <details className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
        <summary className="cursor-pointer text-[10px] font-mono tracking-[0.15em] text-white/50">{t('Conversation', 'Conversación')}</summary>
        <div className="mt-2 space-y-3">
          {messages.slice(-6).map((m, i) => (
            <div key={i} className="flex gap-3 text-sm border-b border-white/[0.04] pb-2"><span className="w-12 shrink-0 text-[10px] font-mono tracking-[0.15em] pt-1" style={{ color: m.from === 'bobby' ? '#7ea6ff' : 'rgba(255,255,255,0.4)' }}>{m.from === 'bobby' ? 'BOBBY' : t('YOU', 'TÚ')}</span><span className="text-white/85">{m.text}</span></div>
          ))}
        </div>
      </details>
    </>
  );
  const composerNode = (
    <>
      {/* composer */}
      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/95 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl flex gap-2">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('Asset to analyze', 'Activo a analizar')} placeholder={listening ? t('Listening…', 'Escuchando…') : t('Ask about BTC, NVDA, gold…', 'Pregunta por BTC, NVDA, oro…')} className="min-w-0 flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-white outline-none focus:border-sky-400/50" />
          {canDictate && <button type="button" onClick={toggleDictation} aria-label={t('Talk to Bobby', 'Hablar con Bobby')} className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${listening ? 'bg-red-400 text-black' : 'bg-sky-500 text-white'}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
          <button type="submit" disabled={!input.trim() || isWorking} className="h-12 px-4 rounded-xl bg-green-400 text-black font-mono text-xs tracking-[0.15em] disabled:cursor-not-allowed disabled:opacity-40">{isWorking ? t('ANALYZING', 'ANALIZANDO') : t('ASK', 'PREGUNTA')}</button>
        </div>
      </form>
    </>
  );

  if (desktop) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] flex-col text-white">
        <div className="border-b border-white/10 px-6 py-3">{headerNode}</div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,0.78fr)_minmax(0,1.22fr)]">
          {/* companion side */}
          <section className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden px-5 py-6" style={{ background: `radial-gradient(circle at 50% 45%, ${tintFor(companion, 0.12)}, transparent 62%)` }}>
            <div className="relative flex flex-col items-center">
        <div ref={stageRef} className="relative" style={{ width: mascotSize, height: mascotSize }}>
          <BobbyMascot3D
            look={{ ...DEFAULT_MASCOT, body: companion.palette, avatar: companion.id }}
            state={mascotState}
            level={voice.speaking ? voice.level : null}
            size={mascotSize}
            attachments={attachments}
            equipUrl={equip.url}
            equipToken={equip.token}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] font-mono tracking-[0.25em]" style={{ color: listening ? '#34D399' : voice.speaking ? '#7ea6ff' : phase === 'error' ? '#f87171' : phase === 'complete' ? '#34D399' : '#7ea6ff' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />{statusLabel}
        </div>
        {statusHint && <div className="text-[10px] font-mono text-white/45 mt-1">{statusHint}</div>}
            </div>
            <div className="relative mt-5 flex shrink-0 flex-col items-center gap-2">
              <button type="button" onClick={canDictate ? toggleDictation : () => inputRef.current?.focus()} aria-label={listening ? t('Stop listening', 'Dejar de escuchar') : t('Tap to talk', 'Toca para hablar')} className={`relative grid h-14 w-14 place-items-center rounded-full transition ${listening ? 'scale-105 bg-[#42e6a4] text-[#04130c] shadow-[0_0_36px_rgba(66,230,164,.55)]' : 'bg-[#0052ff] text-white shadow-[0_0_28px_rgba(0,82,255,.45)] hover:bg-[#1c6cff]'}`}>
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">{listening ? t('Listening…', 'Escuchando…') : t('Tap to talk', 'Toca para hablar')}</p>
            </div>
            <div className="relative mt-5">
        <div className="mt-3"><ToolBelt companion={companion} xp={progress.xp} onTap={(tool) => { sfxTock(); setInspected(tool); }} onPet={() => { sfxTock(); setSheet('pet'); }} onPlus={() => { sfxTock(); setSheet('catalog'); }} onWorld={openTraderLand} /></div>
            </div>
          </section>

          {/* market side */}
          <section className="flex min-h-0 flex-col gap-3 border-l border-white/10 p-4">
            <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="rounded-2xl border border-green-400/25 bg-green-400/[0.045] p-3 shadow-[0_0_36px_rgba(74,222,128,.05)]">
              <div className="flex gap-2">
                <input ref={inputRef} data-desk-input autoFocus value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('Asset to analyze', 'Activo a analizar')} placeholder={listening ? t('Listening…', 'Escuchando…') : t('Ask about an asset…', 'Pregunta por un activo…')} className="min-w-0 flex-1 rounded-xl border border-white/[0.10] bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-green-400/60" />
                {canDictate && <button type="button" onClick={toggleDictation} aria-label={listening ? t('Stop listening', 'Dejar de escuchar') : t('Name an asset by voice', 'Di un activo por voz')} className={`h-12 w-12 shrink-0 rounded-xl grid place-items-center ${listening ? 'bg-red-400 text-black' : 'border border-sky-400/30 bg-sky-500/15 text-sky-300'}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
                <button type="submit" disabled={!input.trim() || isWorking} className="h-12 shrink-0 rounded-xl bg-green-400 px-5 font-mono text-xs font-bold tracking-[0.13em] text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40">{isWorking ? t('ANALYZING', 'ANALIZANDO') : t('ANALYZE', 'ANALIZAR')}</button>
              </div>
            </form>
            {!snapshot && phase !== 'confirm' && (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setSheet('board')} className="rounded-lg border border-sky-400/40 bg-sky-400/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-300">{t('Explore', 'Explorar')}</button>
                {progress.quickAccess.slice(0, 2).map((sym) => (
                  <button key={sym} onClick={() => void ask(sym)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">{sym}</button>
                ))}
              </div>
            )}
            <div className="min-h-[360px] flex-1">
              <MarketCanvas compact showAgents showSymbolSelector={false} symbol={chartSymbol} timeframe={chartTimeframe} levels={chartLevels} debate={chartDebate} language={isSpanish() ? 'es' : 'en'} onSymbolChange={(sym) => setChartSymbol(sym)} onTimeframeChange={(tf) => setChartTimeframe(tf)} />
            </div>
            <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
              {confirmNode}
              {noTradeNode()}
              {snapshot && answer && debate && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
                  <div className="flex justify-between text-[10px] font-mono tracking-[0.2em]"><span className="text-amber-300">{t('TECHNICAL DESK', 'DESK TÉCNICO')} · {snapshot.symbol}</span><span className="text-white/40">{t('REFERENCE ONLY', 'SOLO REFERENCIA')}</span></div>
                  <div className="mt-3"><StanceRows debate={debate} /></div>
                  <DeskReadSource />
                </div>
              )}
              {snapshot && answer && debate && debate.direction === 'long' && <DeskSwapCard symbol={snapshot.symbol} conviction={answer.convictionPct} />}
              {logNode}
            </div>
          </section>
        </div>
      {/* sheets & overlays */}
      <AnimatePresence>
        {sheet === 'board' && <BoardSheet onPick={(s) => { setSheet('none'); void ask(s); }} onClose={() => setSheet('none')} />}
        {sheet === 'squad' && <SquadSheet current={companion} level={level.number} onPick={(c) => { progressStore.setCompanion(c.id); setSheet('none'); void voice.speak(pick(c.selectLine), { voice: c.voicePersona, essential: false }); }} onClose={() => setSheet('none')} />}
        {signInPrompt && !evolution && !drops[0] && sheet === 'none' && <SignInPrompt key="signin-prompt" xp={progress.xp} onClose={() => setSignInPrompt(false)} />}
        {sheet === 'catalog' && <GearCatalog current={companion} xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
        {sheet === 'world' && <WorldMapTeaser xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
        {sheet === 'swap' && <SwapSheet initialSymbol={snapshot?.symbol ?? null} onClose={() => setSheet('none')} />}
        {sheet === 'pet' && (() => { const pet = petFor(companion.id); const has = petUnlocked(progress.xp); return pet ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/70" onClick={() => setSheet('none')}>
            <div className="w-full max-w-md bg-[#0a0a0c] border border-white/[0.06] rounded-t-2xl md:rounded-2xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="text-7xl" style={{ filter: has ? 'none' : 'grayscale(1)' }}>{pet.emoji}</div>
              <div className="text-2xl font-semibold text-white">{pick(pet.name)}</div>
              <div className="text-sm text-white/75">{has ? (pet.spins ? t('Spins next to you on the desk.', 'Gira a tu lado en el desk.') : t("Lives at your companion's feet.", 'Vive a los pies de tu companion.')) : t(`Unlocks at ${PET_UNLOCK_XP} XP · you have ${progress.xp}. Discipline only.`, `Se desbloquea a ${PET_UNLOCK_XP} XP · llevas ${progress.xp}. Solo disciplina.`)}</div>
            </div>
          </motion.div>) : null; })()}
        {sheet === 'risk' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/90 overflow-y-auto"><RiskNotice readOnly onClose={() => setSheet('none')} /></motion.div>
        )}
        {inspected && <ToolDetail companion={companion} tool={inspected} xp={progress.xp} onClose={() => setInspected(null)} />}
        {evolution && <EvolutionOverlay companion={companion} level={evolution} onDone={() => { const name = companionName(companion, evolution.number); say(t(`I evolved. Call me ${name} now.`, `Evolucioné. Ahora dime ${name}.`), false); setEvolution(null); }} />}
        {!evolution && drops[0] && <ToolUnlockOverlay companion={companion} tool={drops[0]} onDone={() => { const tool = drops[0]; setDrops((d) => d.slice(1)); if (toolHasArt(tool)) setTimeout(() => setEquip((e) => ({ url: toolArt(tool), token: e.token + 1 })), 80); }} />}
      </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-2 pb-28 space-y-4">
      {headerNode}
      {stageNode}
      {confirmNode}
      {noTradeNode(true)}
      {marketNode}
      {quickNode}
      {logNode}
      {composerNode}
      {/* sheets & overlays */}
      <AnimatePresence>
        {sheet === 'board' && <BoardSheet onPick={(s) => { setSheet('none'); void ask(s); }} onClose={() => setSheet('none')} />}
        {sheet === 'squad' && <SquadSheet current={companion} level={level.number} onPick={(c) => { progressStore.setCompanion(c.id); setSheet('none'); void voice.speak(pick(c.selectLine), { voice: c.voicePersona, essential: false }); }} onClose={() => setSheet('none')} />}
        {signInPrompt && !evolution && !drops[0] && sheet === 'none' && <SignInPrompt key="signin-prompt" xp={progress.xp} onClose={() => setSignInPrompt(false)} />}
        {sheet === 'catalog' && <GearCatalog current={companion} xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
        {sheet === 'world' && <WorldMapTeaser xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
        {sheet === 'swap' && <SwapSheet initialSymbol={snapshot?.symbol ?? null} onClose={() => setSheet('none')} />}
        {sheet === 'pet' && (() => { const pet = petFor(companion.id); const has = petUnlocked(progress.xp); return pet ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/70" onClick={() => setSheet('none')}>
            <div className="w-full max-w-md bg-[#0a0a0c] border border-white/[0.06] rounded-t-2xl md:rounded-2xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="text-7xl" style={{ filter: has ? 'none' : 'grayscale(1)' }}>{pet.emoji}</div>
              <div className="text-2xl font-semibold text-white">{pick(pet.name)}</div>
              <div className="text-sm text-white/75">{has ? (pet.spins ? t('Spins next to you on the desk.', 'Gira a tu lado en el desk.') : t("Lives at your companion's feet.", 'Vive a los pies de tu companion.')) : t(`Unlocks at ${PET_UNLOCK_XP} XP · you have ${progress.xp}. Discipline only.`, `Se desbloquea a ${PET_UNLOCK_XP} XP · llevas ${progress.xp}. Solo disciplina.`)}</div>
            </div>
          </motion.div>) : null; })()}
        {sheet === 'risk' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/90 overflow-y-auto"><RiskNotice readOnly onClose={() => setSheet('none')} /></motion.div>
        )}
        {inspected && <ToolDetail companion={companion} tool={inspected} xp={progress.xp} onClose={() => setInspected(null)} />}
        {evolution && <EvolutionOverlay companion={companion} level={evolution} onDone={() => { const name = companionName(companion, evolution.number); say(t(`I evolved. Call me ${name} now.`, `Evolucioné. Ahora dime ${name}.`), false); setEvolution(null); }} />}
        {!evolution && drops[0] && <ToolUnlockOverlay companion={companion} tool={drops[0]} onDone={() => { const tool = drops[0]; setDrops((d) => d.slice(1)); if (toolHasArt(tool)) setTimeout(() => setEquip((e) => ({ url: toolArt(tool), token: e.token + 1 })), 80); }} />}
      </AnimatePresence>
    </div>
  );
}

interface SpeechRecognitionLike { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }

function buildChart(series: Candle[], answer: Answer | null) {
  if (series.length < 2) return null;
  const w = 600; const h = 160; const pad = 8;
  const closes = series.map((c) => c.close);
  const levels = [answer?.entry, answer?.stop, answer?.target, answer?.support, answer?.resistance].filter((v): v is number => typeof v === 'number');
  const lo = Math.min(...closes, ...levels); const hi = Math.max(...closes, ...levels);
  const y = (v: number) => h - pad - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - pad * 2);
  const points = series.map((c, i) => `${(i / (series.length - 1)) * w},${y(c.close).toFixed(1)}`).join(' ');
  const lines = [
    answer?.entry !== null && answer?.entry !== undefined ? { label: `ENTRY ${Math.round(answer.entry)}`, y: y(answer.entry), color: '#7ea6ff' } : null,
    answer?.stop !== null && answer?.stop !== undefined ? { label: `STOP ${Math.round(answer.stop)}`, y: y(answer.stop), color: '#f87171' } : null,
    answer?.target !== null && answer?.target !== undefined ? { label: `TARGET ${Math.round(answer.target)}`, y: y(answer.target), color: '#34D399' } : null,
    answer?.support !== null && answer?.support !== undefined ? { label: `S ${Math.round(answer.support)}`, y: y(answer.support), color: 'rgba(255,255,255,0.35)' } : null,
    answer?.resistance !== null && answer?.resistance !== undefined ? { label: `R ${Math.round(answer.resistance)}`, y: y(answer.resistance), color: 'rgba(255,255,255,0.35)' } : null,
  ].filter((l): l is { label: string; y: number; color: string } => l !== null);
  return { w, h, points, lines };
}

function BoardSheet({ onPick, onClose }: { onPick: (symbol: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [hits, setHits] = useState<Array<{ symbol: string; name: string; assetClass: string }>>([]);
  const [sections, setSections] = useState<Array<{ title: string; rows: Array<{ symbol: string; name: string; last: number | null }> }>>([]);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bobby-asset-search?browse=1');
        const obj = (await res.json()) as { browse?: Record<string, Array<{ symbol: string; name: string; last: number | null }>>; totalBases?: number };
        const b = obj.browse ?? {};
        setSections([[t('CRYPTO', 'CRIPTO'), b.crypto], [t('STOCKS & ETFs', 'ACCIONES Y ETFs'), b.equity], [t('METALS', 'METALES'), b.commodity]].filter(([, rows]) => rows?.length).map(([title, rows]) => ({ title: title as string, rows: (rows as Array<{ symbol: string; name: string; last: number | null }>).slice(0, 24) })));
      } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const controller = new AbortController();
    setHits([]);
    const id = setTimeout(async () => {
      const obj = await assetSearch(q.trim(), 12, controller.signal);
      if (controller.signal.aborted) return;
      const results = (obj?.results as Array<Record<string, unknown>> | undefined) ?? [];
      const seen = new Set<string>();
      const out: Array<{ symbol: string; name: string; assetClass: string }> = [];
      for (const r of results) { const sym = String(r.symbol ?? ''); if (!sym || seen.has(sym)) continue; seen.add(sym); const aliases = (r.aliases as string[] | undefined) ?? []; out.push({ symbol: sym, name: prettyName(aliases.find((a) => a !== sym) ?? sym, sym), assetClass: String(r.assetClass ?? 'crypto') }); }
      setHits(out);
    }, 200);
    return () => { controller.abort(); clearTimeout(id); };
  }, [q]);
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/85" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener?.focus({ preventScroll: true }); }}
          className="fixed left-1/2 top-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0c] text-white shadow-2xl"
        >
          <div className="shrink-0 space-y-3 border-b border-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="font-mono text-sm tracking-[0.15em]">{t('Assets', 'Activos')}</Dialog.Title>
              <Dialog.Close aria-label={t('Close assets and return to desk', 'Cerrar activos y volver al desk')} title={t('Back to desk', 'Volver al desk')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
                <X size={20} />
              </Dialog.Close>
            </div>
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search assets', 'Buscar activos')} placeholder={t('Name or ticker…', 'Nombre o ticker…')} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-white outline-none focus:border-sky-400/50" />
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        {q.trim().length >= 2 ? (
          <div className="space-y-2">{hits.length === 0 ? <div className="text-white/40 text-sm">{t('Nothing yet — keep typing or say it your way; Bobby resolves typos.', 'Nada aún — sigue escribiendo o dilo a tu manera; Bobby resuelve typos.')}</div> : hits.map((h) => (<button key={h.symbol} onClick={() => onPick(h.symbol)} className="w-full flex justify-between rounded-xl px-4 py-3 bg-white/[0.02] border border-white/[0.05] text-left"><span><span className="text-white font-semibold">{h.symbol}</span><span className="block text-white/50 text-xs">{h.name}</span></span><span className="text-[10px] font-mono text-white/40 tracking-[0.15em] self-center">{h.assetClass.toUpperCase()}</span></button>))}</div>
        ) : sections.map((s) => (
          <div key={s.title}><div className="flex justify-between text-[10px] font-mono tracking-[0.2em] text-sky-300 mb-2"><span>{s.title}</span><span className="text-white/40">{s.rows.length}</span></div><div className="space-y-2">{s.rows.map((r) => (<button key={r.symbol} onClick={() => onPick(r.symbol)} className="w-full flex justify-between rounded-xl px-4 py-3 bg-white/[0.02] border border-white/[0.05] text-left"><span><span className="text-white font-semibold">{r.symbol}</span>{r.name !== r.symbol && <span className="block text-white/50 text-xs">{r.name}</span>}</span><span className="font-mono text-white/80 self-center">{r.last !== null ? money(r.last) : ''} ↗</span></button>))}</div></div>
        ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SquadSheet({ current, level, onPick, onClose }: { current: Companion; level: number; onPick: (c: Companion) => void; onClose: () => void }) {
  // Locked companions stay visible — grey, behind a lock — and can be
  // previewed in 3D. Looking is free; choosing takes the level.
  const [preview, setPreview] = useState<Companion | null>(null);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/95 overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <div className="flex items-center justify-between"><div className="text-white font-mono tracking-[0.2em]">BOBBY // {t('MY SQUAD', 'MI SQUAD')}</div><button onClick={onClose} className="h-9 w-9 rounded-full bg-white/[0.05] text-white/70">✕</button></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {COMPANIONS.map((c) => { const unlocked = level >= c.requiredLevel; const active = c.id === current.id; return (
            <button key={c.id} onClick={() => { if (unlocked) onPick(c); else { sfxTock(); setPreview(c); } }} className="rounded-xl p-3 border text-left transition" style={{ borderColor: active ? tintFor(c, 0.7) : 'rgba(255,255,255,0.06)', background: active ? tintFor(c, 0.08) : 'rgba(255,255,255,0.02)' }}>
              <div className="relative">
                <img src={`/mascots/${c.id}.webp`} alt="" className="h-24 w-full object-cover rounded-lg" style={{ filter: unlocked ? 'none' : 'grayscale(1) brightness(0.75)' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                {!unlocked && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/35"><span className="h-9 w-9 rounded-full bg-black/80 border border-white/15 flex items-center justify-center text-white/90"><Lock size={14} /></span></div>}
              </div>
              <div className="mt-2 font-mono text-xs tracking-[0.15em]" style={{ color: unlocked ? tintFor(c) : 'rgba(255,255,255,0.5)' }}>{c.label}</div>
              <div className="text-[10px] text-white/50">{unlocked ? pick(c.role) : t(`LEVEL ${c.requiredLevel}`, `NIVEL ${c.requiredLevel}`)}</div>
            </button>
          ); })}
        </div>
      </div>
      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)}>
            <motion.div initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl bg-[#0a0a0c] border border-white/[0.08] p-5 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="text-[10px] font-mono tracking-[0.3em] text-white/50">{preview.label} · {t('LOCKED', 'BLOQUEADO')}</div>
              <div className="relative mx-auto mt-2" style={{ width: 240, height: 240, filter: 'grayscale(1) brightness(0.65)' }}>
                <BobbyMascot3D look={{ ...DEFAULT_MASCOT, body: preview.palette, avatar: preview.id }} state="idle" size={240} />
              </div>
              <div className="-mt-24 relative mx-auto inline-flex flex-col items-center gap-1 rounded-2xl bg-black/70 border border-white/10 px-5 py-3">
                <Lock size={26} className="text-white/90" />
                <div className="text-[10px] font-mono tracking-[0.2em] text-white/85">{t(`UNLOCKS AT LEVEL ${preview.requiredLevel}`, `SE DESBLOQUEA EN NIVEL ${preview.requiredLevel}`)}</div>
                <div className="text-[11px] text-white/55">{t('Discipline gets you there, never volume.', 'La disciplina te lleva, nunca el volumen.')}</div>
              </div>
              <div className="mt-6 text-sm text-white/75">{pick(preview.role)}</div>
              <button onClick={() => setPreview(null)} className="mt-4 w-full py-3 rounded-full font-mono text-xs tracking-[0.2em] text-black" style={{ background: tintFor(preview) }}>{t(`YOU ARE LEVEL ${level} · KEEP GOING`, `VAS EN NIVEL ${level} · SIGUE`)}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** True when the viewport matches; the desk goes two-column from lg up. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
