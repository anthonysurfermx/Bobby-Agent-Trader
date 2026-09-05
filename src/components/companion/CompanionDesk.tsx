// The Live Desk on the web — the iPhone experience, same rules:
// hyped greeting with today's real movers in the companion's voice, ask any
// asset (600+), the three-agent desk runs, verdict or NO TRADE, discipline XP
// (capped, never for volume), evolution and gear drops, tool belt, squad,
// explore board, risk notice. Bobby never executes anything.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Globe, Grid2x2, Lock, Map as MapIcon, Mic, MicOff, MoreHorizontal, RotateCcw, Share2, ShieldAlert, ShieldCheck, Users, Volume2, VolumeX } from 'lucide-react';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { COMPANIONS, LEVEL_TONE, companionName, getCompanion, getVibe, levelFor, nextLevelFor, tintFor, toolArt, toolHasArt, type Companion, type CompanionLevel, type CompanionTool } from '@/lib/companions/data';
import { isSpanish, pick, t } from '@/lib/companions/i18n';
import { levelProgress, progressStore, useProgress, type ThesisSnapshot } from '@/lib/companions/progress';
import { progressAuthHeaders } from '@/lib/companions/sync';
import { sfxMuted, sfxShield, sfxSuccess, sfxTock, setSfxMuted } from '@/lib/companions/sfx';
import { useCompanionVoice } from '@/hooks/useCompanionVoice';
import RiskNotice from './RiskNotice';
import ProgressSync from './ProgressSync';
import { MarketCanvas, type ChartLevel, type Timeframe } from '@/components/adams/MarketCanvas';
import { EvolutionOverlay, GearCatalog, NoTradeCard, ToolBelt, ToolDetail, ToolUnlockOverlay, WorldMapTeaser } from './CompanionOverlays';
import { PET_UNLOCK_XP, petArt, petFor, petUnlocked, toolSlot, wornGear } from '@/lib/companions/data';

// ---- API (mirrors BobbyAPI.swift) ----

interface Snapshot { symbol: string; name?: string; isEquity: boolean }
interface Resolution { snapshot: Snapshot; needsConfirmation: boolean; confirmName: string; proxyNote: string | null }

async function assetSearch(q: string, limit?: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/bobby-asset-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, ...(limit ? { limit } : {}) }) });
    if (res.ok) return (await res.json()) as Record<string, unknown>;
  } catch { /* fall through */ }
  try {
    const res = await fetch(`/api/bobby-asset-search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`);
    if (res.ok) return (await res.json()) as Record<string, unknown>;
  } catch { /* ignore */ }
  return null;
}

function prettyName(raw: string, symbol: string): string {
  if (!raw || raw === symbol) return symbol;
  if (/[&0-9]/.test(raw)) return raw;
  return raw.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function resolveAsset(query: string): Promise<Resolution | null> {
  const obj = await assetSearch(query);
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
  thesisReadId?: string;
  symbol: string; price: number | null; trend: string | null; momentum: string | null; rsi: number | null; support: number | null; resistance: number | null;
  regime: string | null; signal: string | null; direction: string | null; convictionPct: number | null; entry: number | null; stop: number | null; target: number | null; rewardRisk: number | null; overview: string | null; error: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

async function runDebate(symbol: string): Promise<Answer> {
  const a: Answer = { symbol, price: null, trend: null, momentum: null, rsi: null, support: null, resistance: null, regime: null, signal: null, direction: null, convictionPct: null, entry: null, stop: null, target: null, rewardRisk: null, overview: null, error: false };
  try {
    const auth = progressAuthHeaders();
    const res = await fetch('/api/voice-tool', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'run_debate', args: { symbol, ...(auth ? { recordThesisRead:true } : {}) } }) });
    const obj = (await res.json()) as Record<string, unknown>;
    if (!res.ok || obj.error) { a.error = true; return a; }
    const proof = obj.thesis_read as { id?: unknown } | null | undefined;
    if (typeof proof?.id === 'string') a.thesisReadId = proof.id;
    a.regime = str(obj.regime);
    const m = obj.market as Record<string, unknown> | undefined;
    a.price = num(m?.price);
    const tech = obj.technicals as Record<string, unknown> | null | undefined;
    if (tech) { a.price = a.price ?? num(tech.price); a.trend = str(tech.trend); a.momentum = str(tech.momentum); a.rsi = num(tech.rsi14); a.support = num(tech.support); a.resistance = num(tech.resistance); }
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
const money = (v: number) => (v >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`);
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
function summary(a: Answer): string {
  const lines: string[] = [];
  if (a.price !== null) lines.push(t(`${a.symbol} is at ${money(a.price)}.`, `${a.symbol} está en ${money(a.price)}.`));
  if (a.trend) { let s = t(`Trend ${localizedTrend(a.trend)}`, `Tendencia ${localizedTrend(a.trend)}`); if (a.momentum && a.momentum !== 'neutral') s += t(`, momentum ${localizedMomentum(a.momentum)}`, `, momentum ${localizedMomentum(a.momentum)}`); if (a.rsi !== null) s += `, RSI ${Math.round(a.rsi)}`; lines.push(s + '.'); }
  if (a.support !== null && a.resistance !== null) lines.push(t(`Support ${money(a.support)}, resistance ${money(a.resistance)}.`, `Soporte ${money(a.support)}, resistencia ${money(a.resistance)}.`));
  if ((a.direction === 'long' || a.direction === 'short') && a.convictionPct !== null) { const d = a.direction === 'long' ? t('bullish', 'alcista') : t('bearish', 'bajista'); lines.push(t(`My read: ${d} bias with ${Math.round(a.convictionPct)}% conviction.`, `Mi lectura: sesgo ${d} con ${Math.round(a.convictionPct)}% de convicción.`)); }
  else if (a.direction === 'none' && a.convictionPct !== null) lines.push(t(`No directional edge right now (${Math.round(a.convictionPct)}% conviction).`, `Sin sesgo direccional por ahora (${Math.round(a.convictionPct)}% de convicción).`));
  if (a.entry !== null && a.stop !== null && a.target !== null) { let p = t(`Reference plan: entry ${money(a.entry)}, stop ${money(a.stop)}, target ${money(a.target)}`, `Plan de referencia: entrada ${money(a.entry)}, stop ${money(a.stop)}, objetivo ${money(a.target)}`); if (a.rewardRisk !== null) p += ` (R:R ${a.rewardRisk.toFixed(1)})`; lines.push(p + '.'); }
  if (isNoTrade(a)) lines.push(t('No setup yet. Capital protected.', 'Sin setup todavía. Capital protegido.'));
  if (!lines.length) lines.push(t(`I do not have enough data on ${a.symbol} right now.`, `No tengo datos suficientes de ${a.symbol} ahora mismo.`));
  return lines.join(' ');
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

type Phase = 'idle' | 'resolving' | 'alpha' | 'redTeam' | 'cio' | 'complete' | 'error' | 'confirm';
interface Msg { from: 'bobby' | 'you'; text: string }

export default function CompanionDesk() {
  const navigate = useNavigate();
  const progress = useProgress();
  const voice = useCompanionVoice();
  const companion = getCompanion(progress.companionId) ?? COMPANIONS[1];
  const vibe = getVibe(progress.vibeId);
  const level = levelFor(progress.xp);
  const next = nextLevelFor(progress.xp);
  const tint = tintFor(companion);
  const displayName = companionName(companion, level.number);

  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [series, setSeries] = useState<Candle[]>([]);
  const [pending, setPending] = useState<Resolution | null>(null);
  const [noTrade, setNoTrade] = useState<{ symbol: string; reason: string; xp: number } | null>(null);
  const [evolution, setEvolution] = useState<CompanionLevel | null>(null);
  const [drops, setDrops] = useState<CompanionTool[]>([]);
  const [inspected, setInspected] = useState<CompanionTool | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'board' | 'squad' | 'risk' | 'catalog' | 'pet' | 'world'>('none');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [equip, setEquip] = useState<{ url: string; token: number }>({ url: '', token: 0 });
  const [muted, setMuted] = useState(sfxMuted());
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const booted = useRef(false);

  const say = useCallback((text: string, essential = true) => {
    if (!speakEnabled) return;
    void voice.speak(text, { voice: companion.voicePersona, vibe: vibe.server, essential });
  }, [voice, companion.voicePersona, vibe.server, speakEnabled]);

  // Hyped greeting with today's real movers, once.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
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
      setMessages([{ from: 'bobby', text }]);
      say(text, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useCallback(async (snap: Snapshot) => {
    setSnapshot(snap);
    setAnswer(null);
    setNoTrade(null);
    setSeries([]);
    setPhase('alpha');
    void candles(snap.symbol, snap.isEquity).then(setSeries);
    const stage = setTimeout(() => setPhase('redTeam'), 700);
    const stage2 = setTimeout(() => setPhase('cio'), 1400);
    const a = await runDebate(snap.symbol);
    clearTimeout(stage); clearTimeout(stage2);
    if (isUnavailable(a)) {
      setPhase('error');
      const msg = t(`The desk did not answer for ${snap.symbol}. Try again in a moment.`, `El desk no respondió por ${snap.symbol}. Inténtalo de nuevo en un momento.`);
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      say(msg);
      return;
    }
    setAnswer(a);
    setPhase('complete');
    const text = summary(a);
    setMessages((m) => [...m, { from: 'bobby', text }]);
    say(text);
    const noTradeNow = isNoTrade(a);
    if (noTradeNow) sfxShield(); else sfxSuccess();
    // A full review earns discipline; respecting NO TRADE earns more. The
    // number shown is what the daily cap ACTUALLY granted. The verdict rides
    // along as the thesis the seed will be reviewed against in Trader Land.
    const level = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
    const thesis: ThesisSnapshot = { symbol: snap.symbol, isEquity: snap.isEquity, direction: a.direction === 'long' ? 'long' : a.direction === 'short' ? 'short' : 'none', price: level(a.price), entry: level(a.entry), stop: level(a.stop), target: level(a.target) };
    const result = progressStore.awardDiscipline(noTradeNow ? 'no_trade_respected' : 'read_complete', new Date(), thesis, a.thesisReadId);
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
    sfxTock();
    setInput('');
    setMessages((m) => [...m, { from: 'you', text: q }]);
    setPhase('resolving');
    const r = await resolveAsset(q);
    if (!r) {
      setPhase('error');
      const msg = t('I could not resolve that asset. Try a name or ticker: bitcoin, NVDA, gold.', 'No pude resolver ese activo. Prueba con el nombre o ticker: bitcoin, NVDA, oro.');
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      return;
    }
    if (r.needsConfirmation) { setPending(r); setPhase('confirm'); return; }
    await analyze(r.snapshot);
  }, [analyze]);

  const toggleDictation = () => {
    const W = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    voice.stop();
    const rec = new Ctor();
    rec.lang = isSpanish() ? 'es-MX' : 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) { setListening(false); void ask(text); }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

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
  const statusHint = voice.speaking ? t('Your companion reacts to the voice in real time', 'Tu companion reacciona a la voz en tiempo real') : phase === 'idle' ? t('Type or name an asset to begin', 'Escribe o di un activo para empezar') : phase === 'complete' ? t('Market, levels and thesis in sync', 'Mercado, niveles y tesis en sincronía') : phase === 'error' ? t('Try the name or the ticker', 'Prueba con el nombre o ticker') : '';
  const mascotState = listening ? 'listening' : voice.speaking ? 'speaking' : ['alpha', 'redTeam', 'cio', 'resolving'].includes(phase) ? 'thinking' : 'idle';
  const canDictate = typeof window !== 'undefined' && (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));
  const isWorking = ['resolving', 'alpha', 'redTeam', 'cio'].includes(phase);
  const openTraderLand = useCallback(() => {
    sfxTock();
    navigate('/agentic-world/bobby/trader-land');
  }, [navigate]);

  const chart = useMemo(() => buildChart(series, answer), [series, answer]);

  // Worn gear (pieces still in the loot queue are not worn yet — they fly on
  // when the human taps EQUIP IT) plus the pet at the feet.
  const desktop = useMediaQuery('(min-width: 1024px)');
  const mascotSize = desktop ? 340 : 260;
  const [chartSymbol, setChartSymbol] = useState('BTC');
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>('15m');
  useEffect(() => { if (snapshot?.symbol) setChartSymbol(snapshot.symbol); }, [snapshot?.symbol]);
  const chartLevels = useMemo<ChartLevel[]>(() => !answer ? [] : ([['entry', answer.entry, t('entry', 'entrada')], ['stop', answer.stop, 'stop'], ['target', answer.target, t('target', 'objetivo')]] as Array<[ChartLevel['kind'], number | null, string]>).filter(([, v]) => v !== null).map(([kind, v, label]) => ({ kind, price: v as number, label })), [answer]);

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
  // composer pinned to the bottom) and the production desktop layout (agents
  // top-left, companion centered, mic below, the live chart on the right,
  // status bar at the bottom).
  const headerNode = (
    <>
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={`/mascots/${companion.id}.webp`} alt="" className="h-11 w-11 rounded-full object-cover border" style={{ borderColor: tintFor(companion, 0.6) }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-400 text-black text-[10px] font-bold flex items-center justify-center">{level.number}</span>
          </div>
          <div>
            <div className="text-white font-mono tracking-[0.2em] text-sm">BOBBY // LIVE DESK</div>
            <div className="text-[10px] font-mono tracking-[0.15em]" style={{ color: tint }}>{displayName} · {level.name}</div>
            <div className="mt-1 h-0.5 w-40 bg-white/[0.06] rounded-full"><div className="h-full rounded-full" style={{ width: `${levelProgress(progress.xp) * 100}%`, background: tint }} /></div>
            <div className="text-[9px] font-mono text-white/40 mt-0.5">{progress.xp} XP{next ? ` · ${t('next', 'siguiente')} ${next.name} ${next.minXP}` : ''} · 🔥 {progress.streak}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden lg:flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/50">
            <span>LANG</span>
            <select value={isSpanish() ? 'es' : 'en'} onChange={(e) => { try { localStorage.setItem('bobby_lang', e.target.value); } catch { /* private mode */ } window.location.reload(); }} className="bg-transparent text-[#7da6ff] outline-none">
              <option value="es">ES · MX</option>
              <option value="en">EN · US</option>
            </select>
          </label>
          <div className="hidden lg:flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">
            <ShieldCheck className="h-3 w-3 text-[#7da6ff]" />
            <span>{t('Bobby never executes · you confirm', 'Bobby no ejecuta · tú confirmas')}</span>
          </div>
          {/* Trader Land lives here as a compact control: the chart stays the co-star of the desk. */}
          <button type="button" onClick={openTraderLand} aria-label="Trader Land" title="Trader Land" className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-200/[0.06] pl-1 pr-1 text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-200/[0.12] sm:pr-3">
            <img src="/land/v1/gate-A/aura_core/ne/stage1_thumb_256.png" alt="" width="32" height="32" className="h-8 w-8 object-contain" />
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] sm:inline">Trader Land</span>
          </button>
          <ProgressSync />
          <button onClick={() => setSpeakEnabled((v) => { if (v) voice.stop(); return !v; })} className="h-10 w-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-sky-300">{speakEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="h-10 w-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/70"><MoreHorizontal size={16} /></button>
            <AnimatePresence>
              {menu && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 mt-2 w-60 rounded-xl bg-[#0b0b0e] border border-white/[0.08] p-1 z-30 text-sm">
                  {[
                    { icon: <Grid2x2 size={14} />, label: t('Explore markets', 'Explorar mercados'), act: () => setSheet('board') },
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
                  <div className="px-3 py-2 text-[10px] font-mono text-white/35">{t('READ ONLY — Bobby never executes', 'SOLO LECTURA — Bobby nunca ejecuta')}</div>
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
        <div className="mt-2 flex items-center gap-2 text-[11px] font-mono tracking-[0.25em]" style={{ color: listening ? '#34D399' : voice.speaking ? '#7ea6ff' : phase === 'error' ? '#f87171' : phase === 'complete' ? '#34D399' : '#7ea6ff' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />{statusLabel}
        </div>
        <div className="text-[10px] font-mono text-white/45 mt-1 min-h-[16px]">{statusHint}</div>
        <div className="mt-3"><ToolBelt companion={companion} xp={progress.xp} onTap={(tool) => { sfxTock(); setInspected(tool); }} onPet={() => { sfxTock(); setSheet('pet'); }} onPlus={() => { sfxTock(); setSheet('catalog'); }} onWorld={openTraderLand} /></div>
      </div>
    </>
  );
  const confirmNode = (
    <>
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
  const noTradeNode = (
    <>
      {/* NO TRADE halo */}
      {noTrade && <NoTradeCard symbol={noTrade.symbol} reason={noTrade.reason} xp={noTrade.xp} onClose={() => setNoTrade(null)} />}

    </>
  );
  const marketNode = (
    <>
      {/* market card */}
      {snapshot && answer && (
        <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] space-y-3">
          <div className="flex items-baseline justify-between">
            <div><span className="text-white text-2xl font-semibold">{snapshot.symbol}</span> <span className="text-[10px] font-mono text-white/40 tracking-[0.2em] ml-2">{snapshot.isEquity ? 'EQUITY' : 'CRYPTO'}</span></div>
            <div className="text-[10px] font-mono text-white/40 tracking-[0.15em]">1H // LIVE</div>
          </div>
          {answer.price !== null && <div className="text-4xl font-mono text-white">{money(answer.price)}</div>}
          {chart && (
            <svg viewBox={`0 0 ${chart.w} ${chart.h}`} className="w-full h-40 rounded-lg bg-black/40 border border-white/[0.05]">
              <polyline fill="none" stroke="#7ea6ff" strokeWidth="1.5" points={chart.points} />
              {chart.lines.map((l) => (<g key={l.label}><line x1="0" x2={chart.w} y1={l.y} y2={l.y} stroke={l.color} strokeDasharray="4 4" strokeWidth="1" /><text x={chart.w - 4} y={l.y - 3} fill={l.color} fontSize="9" fontFamily="monospace" textAnchor="end">{l.label}</text></g>))}
            </svg>
          )}
          <div className="text-[10px] font-mono text-white/40 flex justify-between"><span>{snapshot.isEquity ? 'PUBLIC EQUITY MARKET' : 'PUBLIC CRYPTO MARKET'}</span><span>{series.length} OHLCV · LIVE</span></div>
          <div className="flex flex-wrap gap-2 text-[10px] font-mono">
            {answer.trend && <span className="px-2 py-1 rounded-full border" style={{ color: answer.trend.includes('alcista') ? '#34D399' : answer.trend.includes('bajista') ? '#f87171' : 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.1)' }}>{localizedTrend(answer.trend).toUpperCase()}</span>}
            {answer.rsi !== null && <span className="px-2 py-1 rounded-full border border-white/10 text-sky-300">RSI {Math.round(answer.rsi)}</span>}
            {answer.convictionPct !== null && <span className="px-2 py-1 rounded-full border border-amber-400/40 text-amber-300">CONV {Math.round(answer.convictionPct)}%</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center rounded-lg bg-black/40 p-3">
            {[[t('ENTRY', 'ENTRADA'), answer.entry, '#7ea6ff'], [t('STOP', 'STOP'), answer.stop, '#f87171'], [t('TARGET', 'OBJETIVO'), answer.target, '#34D399']].map(([label, v, color]) => (
              <div key={String(label)}><div className="text-[9px] font-mono tracking-[0.2em] text-white/40">{label as string}</div><div className="font-mono text-sm" style={{ color: v === null ? 'rgba(255,255,255,0.4)' : (color as string) }}>{v === null ? '—' : money(v as number)}</div></div>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.05] p-3">
            <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.2em] text-white/50"><span>{t('ADVERSARIAL DESK', 'DESK ADVERSARIAL')}</span><span className="text-green-400">{t('COMPLETE', 'COMPLETO')}</span></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-mono">
              {[['ALPHA', '#34D399', answer.trend ? t(`trend ${localizedTrend(answer.trend)}`, `tendencia ${localizedTrend(answer.trend)}`) : '…'], ['RED TEAM', '#f87171', answer.stop !== null ? t(`invalidates ${money(answer.stop)}`, `invalida ${money(answer.stop)}`) : answer.support !== null ? t(`support ${money(answer.support)}`, `soporte ${money(answer.support)}`) : '…'], ['CIO', '#F5C542', (answer.direction === 'long' || answer.direction === 'short') && answer.convictionPct !== null ? `${answer.direction} ${Math.round(answer.convictionPct)}%` : answer.direction === 'none' ? t('no edge', 'sin sesgo') : t('decides', 'decide')]].map(([name, color, line]) => (
                <div key={name} className="rounded-lg p-2 border" style={{ borderColor: `${color}55`, background: `${color}0d` }}><div style={{ color }}>{name}</div><div className="text-white/60 mt-1">{line}</div></div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
            <div className="flex justify-between text-[10px] font-mono tracking-[0.2em]"><span className="text-amber-300">CIO // {t('VERDICT', 'VEREDICTO')}</span><span className="text-white/40">{t('REFERENCE ONLY', 'SOLO REFERENCIA')}</span></div>
            <div className="mt-2 text-white text-lg leading-snug">{summary(answer)}</div>
            <div className="mt-2 text-[10px] font-mono text-white/40">{t('General technical context · Bobby never executes trades', 'Contexto técnico general · Bobby nunca ejecuta operaciones')}</div>
          </div>
        </div>
      )}

    </>
  );
  const quickNode = (
    <>
      {/* quick access */}
      {!snapshot && phase !== 'confirm' && (
        <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
          <div className="flex justify-between text-[10px] font-mono tracking-[0.2em] text-white/50"><span>QUICK ACCESS</span><span className="text-sky-300">{t('VOICE OR TEXT', 'VOZ O TEXTO')}</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={() => setSheet('board')} className="rounded-xl p-3 border border-sky-400/40 bg-sky-400/[0.06] text-left"><div className="text-sky-300 font-semibold">{t('EXPLORE', 'EXPLORA')}</div><div className="text-[10px] font-mono text-white/50 tracking-[0.15em]">{t('TOP MARKETS →', 'TOP MERCADOS →')}</div></button>
            {progress.quickAccess.slice(0, 2).map((s) => (
              <button key={s} onClick={() => void ask(s)} className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.02] text-left"><div className="text-white font-semibold">{s}</div><div className="text-[10px] font-mono text-sky-300 tracking-[0.15em]">{t('ANALYZE →', 'ANALIZAR →')}</div></button>
            ))}
          </div>
        </div>
      )}

    </>
  );
  const logNode = (
    <>
      {/* desk log */}
      <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
        <div className="text-[10px] font-mono tracking-[0.2em] text-white/50">DESK LOG</div>
        <div className="mt-2 space-y-3">
          {messages.slice(-6).map((m, i) => (
            <div key={i} className="flex gap-3 text-sm border-b border-white/[0.04] pb-2"><span className="w-12 shrink-0 text-[10px] font-mono tracking-[0.15em] pt-1" style={{ color: m.from === 'bobby' ? '#7ea6ff' : 'rgba(255,255,255,0.4)' }}>{m.from === 'bobby' ? 'BOBBY' : t('YOU', 'TÚ')}</span><span className="text-white/85">{m.text}</span></div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-sky-400/[0.04] border border-sky-400/20 text-[11px] font-mono text-white/55">
        <div className="text-sky-300 tracking-[0.2em]">BOBBY LEARNS IN PUBLIC</div>
        {t('His calls are recorded on-chain and anyone can challenge them · this query does not mint an individual receipt yet', 'Sus calls se graban on-chain y cualquiera puede retarlas · esta consulta aún no genera receipt individual')}
      </div>

    </>
  );
  const composerNode = (
    <>
      {/* composer */}
      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/95 to-transparent p-4">
        <div className="mx-auto max-w-2xl flex gap-2">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('Asset to analyze', 'Activo a analizar')} placeholder={listening ? t('Listening…', 'Escuchando…') : t('Ask about BTC, NVDA, gold…', 'Pregunta por BTC, NVDA, oro…')} className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-white outline-none focus:border-sky-400/50" />
          {canDictate && <button type="button" onClick={toggleDictation} className={`h-12 w-12 rounded-xl flex items-center justify-center ${listening ? 'bg-red-400 text-black' : 'bg-sky-500 text-white'}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
          <button type="submit" disabled={!input.trim() || isWorking} className="h-12 px-4 rounded-xl bg-green-400 text-black font-mono text-xs tracking-[0.15em] disabled:cursor-not-allowed disabled:opacity-40">{isWorking ? t('ANALYZING', 'ANALIZANDO') : t('ASK', 'PREGUNTA')}</button>
        </div>
      </form>
    </>
  );

  if (desktop) {
    const agents: Array<[string, string, Phase]> = [['ALPHA HUNTER', t('finds the setup', 'busca el setup'), 'alpha'], ['RED TEAM', t('attacks the thesis', 'ataca la tesis'), 'redTeam'], ['CIO', t('decides', 'decide'), 'cio']];
    const statusBar = snapshot && answer ? `${snapshot.symbol}: ${summary(answer)}` : noTrade ? `NO TRADE · ${noTrade.symbol} · ${noTrade.reason}` : t('NO VERDICT YET — ASK BOBBY ABOUT AN ASSET', 'SIN VEREDICTO TODAVÍA — PREGÚNTALE A BOBBY POR UN ACTIVO');
    return (
      <div className="flex min-h-[calc(100vh-80px)] flex-col text-white">
        <div className="border-b border-white/10 px-6 py-3">{headerNode}</div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,0.78fr)_minmax(0,1.22fr)]">
          {/* companion side */}
          <section className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden px-5 py-6" style={{ background: `radial-gradient(circle at 50% 45%, ${tintFor(companion, 0.12)}, transparent 62%)` }}>
            <div className="absolute left-4 top-4 z-20 flex flex-col gap-2">
              {agents.map(([name, role, key]) => (
                <motion.div key={name} animate={phase === key ? { opacity: [0.4, 1, 0.4] } : { opacity: phase === 'complete' ? 0.7 : 0.4 }} transition={phase === key ? { duration: 1.2, repeat: Infinity } : undefined} className="rounded-lg border border-white/10 bg-[#0b0b12]/70 px-3 py-2 backdrop-blur">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#7da6ff]">{name}</div>
                  <div className="font-mono text-[9px] text-white/30">{role}</div>
                  <div className="mt-1 font-mono text-[8px] text-white/20">{displayName} · {t('own voice', 'voz propia')}</div>
                </motion.div>
              ))}
            </div>
            <div className="relative mt-6 flex flex-col items-center">
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
        <div className="text-[10px] font-mono text-white/45 mt-1 min-h-[16px]">{statusHint}</div>
            </div>
            <div className="relative mt-5 flex shrink-0 flex-col items-center gap-2">
              <button type="button" onClick={canDictate ? toggleDictation : () => inputRef.current?.focus()} aria-label={listening ? t('Stop listening', 'Dejar de escuchar') : t('Tap to talk', 'Toca para hablar')} className={`relative grid h-14 w-14 place-items-center rounded-full transition ${listening ? 'scale-105 bg-[#42e6a4] text-[#04130c] shadow-[0_0_36px_rgba(66,230,164,.55)]' : 'bg-[#0052ff] text-white shadow-[0_0_28px_rgba(0,82,255,.45)] hover:bg-[#1c6cff]'}`}>
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">{listening ? t('LISTENING · SPEAK NORMALLY', 'ESCUCHANDO · HABLA NORMAL') : t('TAP TO ACTIVATE · analysis, not advice', 'TOCA PARA ACTIVAR · análisis, no asesoría')}</p>
            </div>
            <div className="relative mt-5">
        <div className="mt-3"><ToolBelt companion={companion} xp={progress.xp} onTap={(tool) => { sfxTock(); setInspected(tool); }} onPet={() => { sfxTock(); setSheet('pet'); }} onPlus={() => { sfxTock(); setSheet('catalog'); }} onWorld={openTraderLand} /></div>
            </div>
          </section>

          {/* market side */}
          <section className="flex min-h-0 flex-col gap-3 border-l border-white/10 p-4">
            <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="rounded-2xl border border-green-400/25 bg-green-400/[0.045] p-3 shadow-[0_0_36px_rgba(74,222,128,.05)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-green-300">{t('START HERE', 'EMPIEZA AQUÍ')}</div>
                  <div className="mt-0.5 text-sm font-medium text-white">{t('What stock or asset do you want to understand?', '¿Qué acción o activo quieres entender?')}</div>
                </div>
                <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-white/35 xl:block">{t('You choose · Bobby analyzes · nothing executes', 'Tú eliges · Bobby analiza · nada se ejecuta')}</span>
              </div>
              <div className="flex gap-2">
                <input ref={inputRef} data-desk-input autoFocus value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('Asset to analyze', 'Activo a analizar')} placeholder={listening ? t('Listening…', 'Escuchando…') : t('Try Tesla, NVDA, bitcoin…', 'Prueba Tesla, NVDA, bitcoin…')} className="min-w-0 flex-1 rounded-xl border border-white/[0.10] bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-green-400/60" />
                {canDictate && <button type="button" onClick={toggleDictation} aria-label={listening ? t('Stop listening', 'Dejar de escuchar') : t('Name an asset by voice', 'Di un activo por voz')} className={`h-12 w-12 shrink-0 rounded-xl grid place-items-center ${listening ? 'bg-red-400 text-black' : 'border border-sky-400/30 bg-sky-500/15 text-sky-300'}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
                <button type="submit" disabled={!input.trim() || isWorking} className="h-12 shrink-0 rounded-xl bg-green-400 px-5 font-mono text-xs font-bold tracking-[0.13em] text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40">{isWorking ? t('ANALYZING', 'ANALIZANDO') : t('ANALYZE', 'ANALIZAR')}</button>
              </div>
            </form>
            {!snapshot && phase !== 'confirm' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">QUICK ACCESS</span>
                <button onClick={() => setSheet('board')} className="rounded-lg border border-sky-400/40 bg-sky-400/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-300">{t('Explore · top markets', 'Explora · top mercados')}</button>
                {progress.quickAccess.slice(0, 2).map((sym) => (
                  <button key={sym} onClick={() => void ask(sym)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">{sym} · {t('analyze', 'analizar')}</button>
                ))}
              </div>
            )}
            <div className="min-h-[360px] flex-1">
              <MarketCanvas symbol={chartSymbol} timeframe={chartTimeframe} levels={chartLevels} language={isSpanish() ? 'es' : 'en'} onSymbolChange={(sym) => setChartSymbol(sym)} onTimeframeChange={(tf) => setChartTimeframe(tf)} />
            </div>
            <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
              {confirmNode}
              {noTradeNode}
              {snapshot && answer && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
                  <div className="flex justify-between text-[10px] font-mono tracking-[0.2em]"><span className="text-amber-300">CIO // {t('VERDICT', 'VEREDICTO')} · {snapshot.symbol}</span><span className="text-white/40">{t('REFERENCE ONLY', 'SOLO REFERENCIA')}</span></div>
                  <div className="mt-2 text-white text-base leading-snug">{summary(answer)}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center rounded-lg bg-black/40 p-3">
                    {[[t('ENTRY', 'ENTRADA'), answer.entry, '#7ea6ff'], [t('STOP', 'STOP'), answer.stop, '#f87171'], [t('TARGET', 'OBJETIVO'), answer.target, '#34D399']].map(([label, v, color]) => (
                      <div key={String(label)}><div className="text-[9px] font-mono tracking-[0.2em] text-white/40">{label as string}</div><div className="font-mono text-sm" style={{ color: v === null ? 'rgba(255,255,255,0.4)' : (color as string) }}>{v === null ? '—' : money(v as number)}</div></div>
                    ))}
                  </div>
                </div>
              )}
              {logNode}
            </div>
          </section>
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-6 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/40"><span className="h-1.5 w-1.5 rounded-full bg-white/30" />{statusBar}</div>
      {/* sheets & overlays */}
      <AnimatePresence>
        {sheet === 'board' && <BoardSheet onPick={(s) => { setSheet('none'); void ask(s); }} onClose={() => setSheet('none')} />}
        {sheet === 'squad' && <SquadSheet current={companion} level={level.number} onPick={(c) => { progressStore.setCompanion(c.id); setSheet('none'); void voice.speak(pick(c.selectLine), { voice: c.voicePersona, essential: false }); }} onClose={() => setSheet('none')} />}
        {sheet === 'catalog' && <GearCatalog current={companion} xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
        {sheet === 'world' && <WorldMapTeaser xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
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
    <div className="mx-auto max-w-2xl px-4 py-4 pb-28 space-y-4">
      {headerNode}
      {stageNode}
      {confirmNode}
      {noTradeNode}
      {marketNode}
      {quickNode}
      {logNode}
      {composerNode}
      {/* sheets & overlays */}
      <AnimatePresence>
        {sheet === 'board' && <BoardSheet onPick={(s) => { setSheet('none'); void ask(s); }} onClose={() => setSheet('none')} />}
        {sheet === 'squad' && <SquadSheet current={companion} level={level.number} onPick={(c) => { progressStore.setCompanion(c.id); setSheet('none'); void voice.speak(pick(c.selectLine), { voice: c.voicePersona, essential: false }); }} onClose={() => setSheet('none')} />}
        {sheet === 'catalog' && <GearCatalog current={companion} xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
        {sheet === 'world' && <WorldMapTeaser xp={progress.xp} level={level.number} onClose={() => setSheet('none')} />}
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
  const [hits, setHits] = useState<Array<{ symbol: string; name: string; assetClass: string }>>([]);
  const [sections, setSections] = useState<Array<{ title: string; rows: Array<{ symbol: string; name: string; last: number | null }> }>>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bobby-asset-search?browse=1');
        const obj = (await res.json()) as { browse?: Record<string, Array<{ symbol: string; name: string; last: number | null }>>; totalBases?: number };
        setTotal(obj.totalBases ?? 0);
        const b = obj.browse ?? {};
        setSections([[t('CRYPTO', 'CRIPTO'), b.crypto], [t('STOCKS & ETFs', 'ACCIONES Y ETFs'), b.equity], [t('METALS', 'METALES'), b.commodity]].filter(([, rows]) => rows?.length).map(([title, rows]) => ({ title: title as string, rows: (rows as Array<{ symbol: string; name: string; last: number | null }>).slice(0, 24) })));
      } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(async () => {
      const obj = await assetSearch(q.trim(), 12);
      const results = (obj?.results as Array<Record<string, unknown>> | undefined) ?? [];
      const seen = new Set<string>();
      const out: Array<{ symbol: string; name: string; assetClass: string }> = [];
      for (const r of results) { const sym = String(r.symbol ?? ''); if (!sym || seen.has(sym)) continue; seen.add(sym); const aliases = (r.aliases as string[] | undefined) ?? []; out.push({ symbol: sym, name: prettyName(aliases.find((a) => a !== sym) ?? sym, sym), assetClass: String(r.assetClass ?? 'crypto') }); }
      setHits(out);
    }, 200);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/95 overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <div className="flex items-center justify-between"><div><div className="text-white font-mono tracking-[0.2em]">BOBBY // THE BOARD</div><div className="text-[10px] font-mono text-white/40 tracking-[0.15em]">{t(`TOP BY 24H VOLUME · SEARCH REACHES ALL ${total}`, `TOP POR VOLUMEN 24H · LA BÚSQUEDA LLEGA A ${total}`)}</div></div><button onClick={onClose} className="h-9 w-9 rounded-full bg-white/[0.05] text-white/70">✕</button></div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search 600+ assets — name or ticker', 'Busca 600+ activos — nombre o ticker')} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-white outline-none" />
        {q.trim().length >= 2 ? (
          <div className="space-y-2">{hits.length === 0 ? <div className="text-white/40 text-sm">{t('Nothing yet — keep typing or say it your way; Bobby resolves typos.', 'Nada aún — sigue escribiendo o dilo a tu manera; Bobby resuelve typos.')}</div> : hits.map((h) => (<button key={h.symbol} onClick={() => onPick(h.symbol)} className="w-full flex justify-between rounded-xl px-4 py-3 bg-white/[0.02] border border-white/[0.05] text-left"><span><span className="text-white font-semibold">{h.symbol}</span><span className="block text-white/50 text-xs">{h.name}</span></span><span className="text-[10px] font-mono text-white/40 tracking-[0.15em] self-center">{h.assetClass.toUpperCase()}</span></button>))}</div>
        ) : sections.map((s) => (
          <div key={s.title}><div className="flex justify-between text-[10px] font-mono tracking-[0.2em] text-sky-300 mb-2"><span>{s.title}</span><span className="text-white/40">{s.rows.length}</span></div><div className="space-y-2">{s.rows.map((r) => (<button key={r.symbol} onClick={() => onPick(r.symbol)} className="w-full flex justify-between rounded-xl px-4 py-3 bg-white/[0.02] border border-white/[0.05] text-left"><span><span className="text-white font-semibold">{r.symbol}</span>{r.name !== r.symbol && <span className="block text-white/50 text-xs">{r.name}</span>}</span><span className="font-mono text-white/80 self-center">{r.last !== null ? `$${r.last >= 1000 ? Math.round(r.last).toLocaleString('en-US') : r.last.toFixed(r.last >= 1 ? 2 : 4)}` : ''} ↗</span></button>))}</div></div>
        ))}
      </div>
    </motion.div>
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
