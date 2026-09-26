// The web desk, rebuilt in the iPhone's Núcleo grammar. The glass is the protagonist: you ask,
// the three agents argue around it, the verdict condenses on it, the chart is exhaled beneath it
// to scale with only the levels the desk argued about, and the plan lands as cards. The web keeps
// everything the iPhone cannot: the Base swap on a LONG, the wallet, and the rest of the desk
// (sign-in, XP, gear, Trader Land) now living behind the avatar, in the profile.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowRight, Mic, MicOff, X } from 'lucide-react';
import { COMPANIONS, companionName, getCompanion, getVibe, levelFor, nextLevelFor, petArt, petFor, petUnlocked, PET_UNLOCK_XP, toolArt, toolHasArt, toolSlot, wornGear, type CompanionLevel, type CompanionTool } from '@/lib/companions/data';
import { isSpanish, pick, t } from '@/lib/companions/i18n';
import { progressStore, useProgress, type ThesisSnapshot } from '@/lib/companions/progress';
import { sfxMuted, sfxShield, sfxSuccess, sfxTock, setSfxMuted } from '@/lib/companions/sfx';
import { voiceScreenState } from '@/lib/realtime-context';
import { useCompanionVoice } from '@/hooks/useCompanionVoice';
import { getSyncStatus } from '@/lib/companions/sync';
import NucleoSphere, { type SphereVerdict } from '@/components/companion/NucleoSphere';
import SignInPrompt, { recordAsk, shouldPromptAfterAsk, shouldPromptNow } from '@/components/companion/SignInPrompt';
import { EvolutionOverlay, GearCatalog, ToolDetail, ToolUnlockOverlay } from '@/components/companion/CompanionOverlays';
import LandSeedCard from '@/components/companion/LandSeedCard';
import { DeskSwapCard, SwapSheet } from '@/components/companion/DeskSwap';
import { WalletBalancePill } from '@/components/companion/DeskWallet';
import NucleoChart from './NucleoChart';
import NucleoProfile from './NucleoProfile';
import NucleoRisk from './NucleoRisk';
import {
  AGENT_TONE, assetSearch, candles, debateFor, isNoTrade, isUnavailable, localizedMomentum, localizedTrend, money, noTradeReason, prettyName, resolveAsset, runDebate, topMovers,
  type AgentKey, type Answer, type Candle, type Mover, type Resolution, type Snapshot,
} from './deskData';

interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
}

type Phase = 'idle' | 'resolving' | 'alpha' | 'redTeam' | 'cio' | 'reveal' | 'complete' | 'error' | 'confirm';
type Sheet = 'none' | 'profile' | 'board' | 'risk' | 'catalog' | 'pet' | 'swap';
interface Msg { from: 'bobby' | 'you'; text: string }

const WORKING: Phase[] = ['resolving', 'alpha', 'redTeam', 'cio'];
const REVEAL_MS = 2600;
const AGENT_NAME: Record<AgentKey, string> = { alpha: 'Alpha Hunter', red: 'Red Team', cio: 'CIO' };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 19) return t('Good evening.', 'Buenas noches.');
  if (h < 12) return t('Good morning.', 'Buenos días.');
  return t('Good afternoon.', 'Buenas tardes.');
}
const signedPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(v >= 10 || v <= -10 ? 1 : 2)}%`;

/** The spoken read as karaoke: one sentence at a time, the current word lit, on the reading clock. */
function Caption({ text, run }: { text: string; run: string | number }) {
  const sentences = useMemo(() => text.split(/(?<=[.!?])\s+(?=[A-Z¿¡$0-9])/).filter(Boolean), [text]);
  const [pos, setPos] = useState({ s: 0, w: 0 });
  useEffect(() => {
    setPos({ s: 0, w: 0 });
    let s = 0, w = 0;
    const id = window.setInterval(() => {
      const words = (sentences[s] ?? '').split(/\s+/).length;
      if (w < words) { w += 1; setPos({ s, w }); return; }
      if (s < sentences.length - 1) { s += 1; w = 0; setPos({ s, w }); return; }
      window.clearInterval(id);
    }, 385); // ≈2.6 words a second, the iPhone's reading clock
    return () => window.clearInterval(id);
  }, [sentences, run]);
  const words = (sentences[pos.s] ?? '').split(/\s+/);
  return (
    <p className="n-caption" aria-live="polite">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => <span key={`${pos.s}-${i}`} style={{ color: i < pos.w ? '#FFF8EC' : 'rgba(242,237,228,.28)', transition: 'color .25s ease' }}>{word}{i < words.length - 1 ? ' ' : ''}</span>)}
      </span>
    </p>
  );
}

/** A small fact card beside the glass, keyed by the agent who would cite it. */
function Satellite({ k, v, q, dot, delay }: { k: string; v: string; q?: string | null; dot: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }} className="n-sat">
      <div className="flex items-center gap-1.5"><i style={{ background: dot }} /><span className="n-sat-k">{k}</span>{q && <span className="n-sat-q">{q}</span>}</div>
      <div className="n-sat-v">{v}</div>
    </motion.div>
  );
}

/** One of the three voices while they argue: its name, then its line once the desk has read. */
function Voice({ k, line, active, align }: { k: AgentKey; line: string | null; active: boolean; align: 'left' | 'right' | 'center' }) {
  return (
    <div className={`n-voice ${align}`} style={{ opacity: active || line ? 1 : 0.38 }}>
      <span className="n-voice-name" style={{ color: AGENT_TONE[k] }}>{align === 'right' ? <>{AGENT_NAME[k]}<i /></> : <><i />{AGENT_NAME[k]}</>}</span>
      <AnimatePresence mode="wait">
        {line
          ? <motion.span key="line" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="n-voice-line">{line}</motion.span>
          : active ? <motion.span key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="n-dots"><i /><i /><i /></motion.span> : null}
      </AnimatePresence>
    </div>
  );
}

export default function NucleoDesk() {
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
  const displayName = companionName(companion, level.number);

  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<Msg[]>(() => (returned?.transcript ?? []).map(line => ({ from: line.role === 'user' ? 'you' : 'bobby', text: line.text })));
  const [input, setInput] = useState(() => returned?.transcript?.at(-1)?.role === 'user' ? returned.transcript.at(-1)!.text : '');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [series, setSeries] = useState<Candle[]>([]);
  const [pending, setPending] = useState<Resolution | null>(null);
  const [award, setAward] = useState<{ xp: number; noTrade: boolean } | null>(null);
  const [landEvent, setLandEvent] = useState<string | null>(null);
  const [evolution, setEvolution] = useState<CompanionLevel | null>(null);
  const [drops, setDrops] = useState<CompanionTool[]>([]);
  const [inspected, setInspected] = useState<CompanionTool | null>(null);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [signInPrompt, setSignInPrompt] = useState(false);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [readSeq, setReadSeq] = useState(0);
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
  const revealRef = useRef<number | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  useEffect(() => () => { requestRef.current?.abort(); recognitionRef.current?.stop(); if (revealRef.current) clearTimeout(revealRef.current); }, []);

  const say = useCallback((text: string, essential = true) => {
    if (!speakEnabledRef.current) return;
    void voice.speak(text, { voice: companion.voicePersona, vibe: vibe.server, essential, mode: 'free' });
  }, [voice, companion.voicePersona, vibe.server]);

  // Today's real movers under the greeting, once.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void topMovers(3).then((m) => setMovers(m));
  }, []);

  const analyze = useCallback(async (snap: Snapshot, controller?: AbortController) => {
    if (!controller) { requestRef.current?.abort(); controller = new AbortController(); requestRef.current = controller; }
    const { signal } = controller;
    if (signal.aborted) return;
    if (revealRef.current) clearTimeout(revealRef.current);
    setDeskError(null);
    setSnapshot(snap);
    setAnswer(null);
    setAward(null);
    setLandEvent(null);
    setSeries([]);
    setPhase('alpha');
    void candles(snap.symbol, snap.isEquity).then((rows) => { if (!signal.aborted) setSeries(rows); });
    const stage = setTimeout(() => { if (!signal.aborted) setPhase('redTeam'); }, 900);
    const stage2 = setTimeout(() => { if (!signal.aborted) setPhase('cio'); }, 1800);
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
    setReadSeq((n) => n + 1);
    // The three voices say their piece around the glass, then the verdict condenses on it.
    setPhase('reveal');
    revealRef.current = window.setTimeout(() => { if (!signal.aborted) setPhase('complete'); }, REVEAL_MS);
    const text = debateFor(a).spoken;
    setMessages((m) => [...m, { from: 'bobby', text }]);
    say(text);
    const noTradeNow = isNoTrade(a);
    if (noTradeNow) sfxShield(); else sfxSuccess();
    // A full review earns discipline; respecting NO TRADE earns more. The number shown is what the
    // daily cap ACTUALLY granted. The verdict rides along as the thesis Trader Land reviews.
    const lvl = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
    const thesis: ThesisSnapshot = { symbol: snap.symbol, isEquity: snap.isEquity, direction: a.direction === 'long' ? 'long' : a.direction === 'short' ? 'short' : 'none', price: lvl(a.price), entry: lvl(a.entry), stop: lvl(a.stop), target: lvl(a.target) };
    const result = progressStore.awardDiscipline(noTradeNow ? 'no_trade_respected' : 'read_complete', new Date(), thesis);
    setAward({ xp: result.awarded, noTrade: noTradeNow });
    setLandEvent(result.eventId);
    if (result.evolvedTo) setEvolution(result.evolvedTo);
    if (result.drops.length) setDrops((d) => [...d, ...result.drops]);
    const qa = [snap.symbol, ...progress.quickAccess.filter((s) => s !== snap.symbol)].slice(0, 3);
    progressStore.setQuickAccess(qa);
  }, [say, progress.quickAccess]);

  const ask = useCallback(async (query: string, spoken?: string) => {
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
    setAward(null);
    setLandEvent(null);
    setSeries([]);
    // The soft "keep your points" ask: once, after real value, never as a gate.
    if (shouldPromptAfterAsk(recordAsk(), getSyncStatus() === 'synced')) setSignInPrompt(true);
    sfxTock();
    setInput('');
    setMessages((m) => [...m, { from: 'you', text: spoken ?? q }]);
    setPhase('resolving');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const reset = () => {
    requestRef.current?.abort();
    if (revealRef.current) clearTimeout(revealRef.current);
    voice.stop();
    sfxTock();
    setPhase('idle'); setSnapshot(null); setAnswer(null); setPending(null); setDeskError(null); setAward(null); setLandEvent(null); setSeries([]);
  };

  const chartSymbol = snapshot?.symbol ?? initialScreen.symbol;
  const toggleDictation = () => {
    voice.stop();
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!freeVoice) {
      navigate(`/agentic-world/bobby/voice-room?start=1&symbol=${encodeURIComponent(chartSymbol)}&timeframe=${encodeURIComponent(initialScreen.timeframe)}`);
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
  const closeRecognition = () => { const recognition = recognitionRef.current as BrowserRecognition | null; if (recognition) { recognition.onend = null; recognition.abort(); recognitionRef.current = null; setListening(false); } };

  /** Share my avatar: the live WebGL frame plus worn gear and pet on a 1080×1350 card. */
  const shareSkin = async () => {
    try {
      const canvas = stageRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      const card = document.createElement('canvas');
      card.width = 1080; card.height = 1350;
      const ctx = card.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#0B0A09'; ctx.fillRect(0, 0, 1080, 1350);
      const grad = ctx.createRadialGradient(540, 560, 0, 540, 560, 620);
      grad.addColorStop(0, 'rgba(92,72,140,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = 'rgba(242,237,228,0.7)'; ctx.font = '500 28px ui-monospace, monospace'; ctx.fillText(`BOBBY · ${t('MY AVATAR', 'MI AVATAR')}`, 72, 100);
      if (canvas) ctx.drawImage(canvas, 160, 150, 760, 760);
      const worn = wornGear(companion.id, progress.xp);
      const pet = petUnlocked(progress.xp) ? petFor(companion.id) : null;
      const spots: Record<number, [number, number]> = { 1: [760, 560], 2: [230, 380], 3: [540, 150] };
      await Promise.all(worn.map((tool) => new Promise<void>((resolve) => {
        if (!toolHasArt(tool)) { resolve(); return; }
        const img = new Image(); img.onload = () => { const [x, y] = spots[tool.tier]; ctx.drawImage(img, x - 90, y - 90, 180, 180); resolve(); }; img.onerror = () => resolve(); img.src = toolArt(tool);
      })));
      if (pet) { ctx.font = '150px serif'; ctx.fillText(pet.emoji, 180, 900); }
      ctx.fillStyle = '#F2EDE4'; ctx.font = '300 76px Sora, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(displayName, 540, 1000);
      ctx.fillStyle = '#A39C91'; ctx.font = '500 26px ui-monospace, monospace'; ctx.fillText(`${t('LEVEL', 'NIVEL')} ${level.number} · ${level.name} · ${progress.xp} XP`, 540, 1050);
      ctx.fillStyle = 'rgba(242,237,228,0.8)'; ctx.font = '28px system-ui, sans-serif';
      const line = [...worn.map((w) => pick(w.name)), ...(pet ? [pick(pet.name)] : [])].join(' · ') || t('No gear yet — first read drops the first tool.', 'Sin equipo aún — la primera lectura suelta la primera herramienta.');
      ctx.fillText(line.slice(0, 70), 540, 1120);
      ctx.fillStyle = 'rgba(242,237,228,0.4)'; ctx.font = '22px ui-monospace, monospace'; ctx.fillText(`bobbyprotocol.xyz · ${t('earned with discipline, never volume', 'ganado con disciplina, nunca volumen')}`, 540, 1280);
      const blob = await new Promise<Blob | null>((r) => card.toBlob(r, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'bobby-avatar.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: 'Bobby', text: t('My Bobby avatar — earned with discipline, never volume.', 'Mi avatar de Bobby — ganado con disciplina, nunca volumen.') }); return; }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bobby-avatar.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* user cancelled or canvas tainted */ }
  };

  const openTraderLand = useCallback(() => { sfxTock(); navigate('/trader-land'); }, [navigate]);

  const desktop = useMediaQuery('(min-width: 1024px)');
  const debate = useMemo(() => (answer ? debateFor(answer) : null), [answer]);
  const attachments = useMemo(() => {
    const queued = new Set(drops.map((d) => `${d.companionId}-${d.tier}`));
    const items: Array<{ url: string; slot: string; spin?: boolean; glow?: string }> = wornGear(companion.id, progress.xp)
      .filter((tool) => !queued.has(`${tool.companionId}-${tool.tier}`) && toolHasArt(tool))
      .map((tool) => ({ url: toolArt(tool), slot: toolSlot(tool) as string, glow: tool.tier === 3 ? '#F5C542' : undefined }));
    const pet = petUnlocked(progress.xp) ? petFor(companion.id) : null;
    const art = pet ? petArt(companion.id) : null;
    if (pet && art) items.push({ url: art, slot: 'pet', spin: pet.spins, glow: undefined });
    return items;
  }, [companion.id, progress.xp, drops]);

  // ---- derived view state ----
  const working = WORKING.includes(phase);
  const reading = working || phase === 'reveal';
  const done = phase === 'complete' && !!debate && !!answer && !!snapshot;
  const verdictKind: SphereVerdict = !debate ? 'wait' : debate.direction === 'long' ? 'ready' : debate.direction === 'short' ? 'pass' : 'wait';
  const verdictWord = !debate ? null : debate.direction === 'long' ? 'Long' : debate.direction === 'short' ? 'Short' : t('No trade', 'No trade');
  const verdictSub = !debate ? null : debate.direction !== 'none' && answer?.convictionPct != null
    ? t(`${Math.round(answer.convictionPct)}% conviction`, `${Math.round(answer.convictionPct)}% convicción`)
    : t('Capital protected', 'Capital protegido');
  const lastYou = [...messages].reverse().find((m) => m.from === 'you')?.text ?? '';
  const lastBobby = [...messages].reverse().find((m) => m.from === 'bobby')?.text ?? '';
  const change = useMemo(() => {
    const pts = series.slice(-24);
    if (pts.length < 2) return null;
    const first = pts[0].close, last = pts[pts.length - 1].close;
    return first > 0 ? ((last - first) / first) * 100 : null;
  }, [series]);
  const assetLine = snapshot ? [snapshot.symbol, answer?.price != null ? money(answer.price) : null, change !== null ? signedPct(change) : null].filter(Boolean).join(' · ') : '';
  const activeAgent: AgentKey | null = phase === 'alpha' || phase === 'resolving' ? 'alpha' : phase === 'redTeam' ? 'red' : phase === 'cio' ? 'cio' : null;
  const nextLevel = nextLevelFor(progress.xp);
  const xpArc = nextLevel ? Math.max(0.04, Math.min(1, (progress.xp - level.minXP) / (nextLevel.minXP - level.minXP))) : 1;

  // ---- pieces ----
  const header = (
    <header className="n-topbar n-topbar-desk">
      <div className="flex min-w-[44px] items-center sm:min-w-[88px]">
        {snapshot || phase === 'confirm' || phase === 'error'
          ? <button type="button" onClick={reset} className="n-iconbtn" aria-label={t('Close this read', 'Cerrar esta lectura')}><X size={16} /></button>
          : <a href="/" className="n-wordmark" aria-label={t('Bobby, home', 'Bobby, inicio')}>Bobby</a>}
      </div>
      <div className="min-w-0 flex-1 text-center">
        {lastYou && (reading || done || phase === 'confirm') && (
          <>
            <div className="truncate text-[14px]" style={{ color: '#F2EDE4' }}>{lastYou}</div>
            {assetLine && <div className="n-dock-asset truncate">{assetLine}</div>}
          </>
        )}
      </div>
      <div className="flex min-w-[44px] items-center justify-end gap-2 sm:min-w-[88px]">
        {desktop && <WalletBalancePill onClick={() => { sfxTock(); setSheet('swap'); }} />}
        <button type="button" className="n-face-btn" onClick={() => { sfxTock(); setSheet('profile'); }} aria-label={t(`Your profile · ${displayName}, level ${level.number}`, `Tu perfil · ${displayName}, nivel ${level.number}`)} title={displayName}>
          <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="none" stroke="rgba(242,237,228,.12)" strokeWidth="2" /><circle cx="22" cy="22" r="20" fill="none" stroke="#FFF8EC" strokeWidth="2" strokeLinecap="round" strokeDasharray={2 * Math.PI * 20} strokeDashoffset={2 * Math.PI * 20 * (1 - xpArc)} transform="rotate(-90 22 22)" /></svg>
          <img src={`/mascots/${companion.id}.webp`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        </button>
      </div>
    </header>
  );

  const sphereBig = desktop ? 320 : 232;
  const idleStage = (
    <div className="flex flex-col items-center">
      <NucleoSphere size={sphereBig} mode={listening ? 'listen' : 'idle'} />
      <h1 className="n-display mt-14 text-center text-[40px] leading-[1.05] sm:text-[52px]">{greeting()}</h1>
      <p className="mt-3 text-center text-[15px]" style={{ color: '#A39C91' }}>
        {movers.length
          ? movers.map((m, i) => <span key={m.symbol}>{i > 0 && <span style={{ color: '#5c564e' }}> · </span>}{m.symbol} <span style={{ color: m.changePct >= 0 ? '#3FE0B5' : '#FF5A5F' }}>{signedPct(m.changePct)}</span></span>)
          : t('Ask me about any stock or crypto.', 'Pregúntame por cualquier acción o cripto.')}
        {movers.length > 0 && <span style={{ color: '#8A8378' }}> {t('in 24h', 'en 24h')}</span>}
      </p>
      {voiceNotice && <p className="mt-2 text-[13px]" style={{ color: '#8A8378' }}>{voiceNotice}</p>}
    </div>
  );

  const alphaLine = phase === 'reveal' && debate ? debate.stances[0].line : null;
  const redLine = phase === 'reveal' && debate ? debate.stances[1].line : null;
  const cioLine = phase === 'reveal' && debate ? debate.stances[2].line : null;
  const thinkStage = (
    <div className="n-think">
      <div className="n-think-a"><Voice k="alpha" line={alphaLine} active={activeAgent === 'alpha'} align={desktop ? 'right' : 'left'} /></div>
      <div className="n-think-s"><NucleoSphere size={desktop ? 280 : 196} mode="debate" /></div>
      <div className="n-think-r"><Voice k="red" line={redLine} active={activeAgent === 'red'} align={desktop ? 'left' : 'right'} /></div>
      <div className="n-think-c"><Voice k="cio" line={cioLine} active={activeAgent === 'cio'} align="center" /></div>
      <div className="n-think-st n-label">{phase === 'resolving' ? t('Finding the asset', 'Buscando el activo') : phase === 'reveal' ? t('Verdict forming', 'Se forma el veredicto') : t('Three agents debating', 'Tres agentes debatiendo')}</div>
    </div>
  );

  const sats = useMemo(() => {
    if (!answer || !snapshot) return [] as Array<{ k: string; v: string; q?: string | null; dot: string }>;
    const out: Array<{ k: string; v: string; q?: string | null; dot: string }> = [];
    if (answer.price != null) out.push({ k: snapshot.symbol, v: money(answer.price), q: change !== null ? signedPct(change) : null, dot: change !== null && change < 0 ? AGENT_TONE.red : AGENT_TONE.alpha });
    if (answer.rsi != null) { const mom = answer.momentum ? localizedMomentum(answer.momentum) : null; out.push({ k: 'RSI 14', v: String(Math.round(answer.rsi)), q: mom, dot: answer.rsi >= 70 ? AGENT_TONE.red : answer.rsi <= 30 ? AGENT_TONE.alpha : '#A39C91' }); }
    if (answer.support != null && answer.resistance != null) out.push({ k: t('Range', 'Rango'), v: `${money(answer.support)}–${money(answer.resistance)}`, dot: '#A39C91' });
    if (answer.trend) { const trend = localizedTrend(answer.trend); out.push({ k: t('Trend', 'Tendencia'), v: trend.charAt(0).toUpperCase() + trend.slice(1), q: answer.atrPct != null ? `ATR ${answer.atrPct.toFixed(1)}%` : null, dot: '#A39C91' }); }
    return out;
  }, [answer, snapshot, change]);

  const resultStage = done && debate && answer && snapshot ? (
    <div className="flex w-full flex-col items-center">
      <div className="n-verdict-row">
        <div className="n-sats left">{sats.filter((_, i) => i % 2 === 0).map((s, i) => <Satellite key={s.k} {...s} delay={0.15 + i * 0.14} />)}</div>
        <div className="grid place-items-center" style={{ padding: desktop ? 36 : 22 }}>
          <NucleoSphere size={desktop ? 200 : 128} mode="verdict" verdict={verdictKind} word={verdictWord} sub={verdictSub} />
        </div>
        <div className="n-sats right">{sats.filter((_, i) => i % 2 === 1).map((s, i) => <Satellite key={s.k} {...s} delay={0.22 + i * 0.14} />)}</div>
      </div>
      <div className="mt-8 w-full">
        <NucleoChart series={series} answer={answer} debate={debate} symbol={snapshot.symbol} isEquity={snapshot.isEquity} drawKey={readSeq} height={desktop ? 280 : 220} />
      </div>
      <div className="mt-8 flex min-h-[64px] w-full justify-center px-2"><Caption text={debate.spoken} run={readSeq} /></div>
    </div>
  ) : null;

  const thesisCard = done && debate && answer && snapshot ? (() => {
    const trade = debate.direction !== 'none';
    const title = debate.direction === 'long' ? t(`Long on ${snapshot.symbol}.`, `Long en ${snapshot.symbol}.`) : debate.direction === 'short' ? t(`Short on ${snapshot.symbol}.`, `Short en ${snapshot.symbol}.`) : t(`No trade on ${snapshot.symbol}.`, `No trade en ${snapshot.symbol}.`);
    const rows: Array<{ k: string; v: string; dot?: string }> = [];
    if (answer.price != null) rows.push({ k: t('Price at read', 'Precio al leer'), v: money(answer.price) });
    if (trade) {
      if (answer.entry != null) rows.push({ k: t('Entry', 'Entrada'), v: money(answer.entry), dot: AGENT_TONE.alpha });
      if (answer.target != null) rows.push({ k: t('Target', 'Objetivo'), v: money(answer.target), dot: AGENT_TONE.cio });
      if (answer.stop != null) rows.push({ k: t('Stop · invalidation', 'Stop · invalidación'), v: money(answer.stop), dot: AGENT_TONE.red });
      if (answer.rewardRisk != null) rows.push({ k: t('Reward : risk', 'Beneficio : riesgo'), v: `${answer.rewardRisk.toFixed(1)} : 1` });
    } else {
      if (answer.support != null) rows.push({ k: t('Support', 'Soporte'), v: money(answer.support) });
      if (answer.resistance != null) rows.push({ k: t('Resistance', 'Resistencia'), v: money(answer.resistance) });
    }
    const trendRsi = [answer.trend ? localizedTrend(answer.trend) : null, answer.rsi != null ? `RSI ${Math.round(answer.rsi)}` : null].filter(Boolean).join(' · ');
    if (trendRsi) rows.push({ k: t('Trend · RSI', 'Tendencia · RSI'), v: trendRsi.charAt(0).toUpperCase() + trendRsi.slice(1) });
    const tone = debate.direction === 'long' ? AGENT_TONE.alpha : debate.direction === 'short' ? AGENT_TONE.red : AGENT_TONE.cio;
    return (
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="n-card n-plan">
        <div className="flex items-baseline justify-between"><span className="n-label">{t('Thesis', 'Tesis')} · {snapshot.symbol}</span><span className="n-label" style={{ color: tone }}>{verdictSub}</span></div>
        <div className="n-display mt-3 text-[28px] leading-tight">{title}</div>
        {!trade && <p className="mt-2 text-[14px]" style={{ color: '#A39C91' }}>{noTradeReason(answer)}</p>}
        <div className="mt-4">
          {rows.map((r) => (
            <div key={r.k} className="n-kv"><span className="n-kv-k">{r.dot && <i style={{ background: r.dot }} />}{r.k}</span><span className="n-kv-v">{r.v}</span></div>
          ))}
        </div>
        {award && award.xp > 0 && <div className="n-xp mt-4">+{award.xp} {award.noTrade ? t('discipline XP for waiting', 'XP de disciplina por esperar') : t('discipline XP', 'XP de disciplina')}</div>}
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: '#8A8378' }}>
          {t('Based on 1H market indicators. Reference only, not financial advice. ', 'Basado en indicadores de 1H. Solo referencia, no es asesoría financiera. ')}
          <a href="/protocol" className="underline" style={{ color: '#A39C91' }}>{t('Public agent activity', 'Actividad pública de los agentes')}</a>
        </p>
      </motion.div>
    );
  })() : null;

  const debateCard = done && debate ? (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="n-card n-plan">
      <div className="flex items-baseline justify-between"><span className="n-label">{t('The debate', 'El debate')}</span><span className="n-label">{t('3 agents', '3 agentes')}</span></div>
      <div className="mt-2">
        {debate.stances.map((s, i) => (
          <div key={s.key} className="py-3.5" style={{ borderTop: i ? '1px solid rgba(242,237,228,.07)' : 'none' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="n-voice-name" style={{ color: AGENT_TONE[s.key] }}><i />{AGENT_NAME[s.key]}</span>
              {s.score !== null && <span className="n-label">{s.key === 'red' ? t(`risk ${s.score}%`, `riesgo ${s.score}%`) : `${s.score}%`}</span>}
            </div>
            <div className="mt-1.5 text-[15px] leading-snug" style={{ color: '#F2EDE4' }}>{s.line}</div>
          </div>
        ))}
      </div>
    </motion.div>
  ) : null;

  const swapCard = done && debate?.direction === 'long' && snapshot ? (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="n-swapwrap">
      <DeskSwapCard symbol={snapshot.symbol} conviction={answer?.convictionPct ?? null} />
    </motion.div>
  ) : null;

  const cards = done ? (
    <div className={`n-cards ${swapCard ? 'three' : ''}`}>
      {thesisCard}
      {debateCard}
      {swapCard}
      {landEvent && <div className="n-land"><LandSeedCard key={landEvent} compact eventId={landEvent} onClose={() => setLandEvent(null)} /></div>}
    </div>
  ) : null;

  const confirmCard = phase === 'confirm' && pending ? (
    <div className="flex flex-col items-center">
      <NucleoSphere size={desktop ? 220 : 170} mode="idle" />
      <div className="n-label mt-12" style={{ color: '#F6B94E' }}>{t('Did you mean', '¿Quisiste decir')}</div>
      <div className="n-display mt-2 text-center text-[34px] leading-tight">{pending.confirmName} <span style={{ color: '#8A8378' }}>{pending.snapshot.symbol}</span></div>
      {pending.proxyNote && <div className="mt-2 max-w-[40ch] text-center text-[13px]" style={{ color: '#A39C91' }}>{pending.proxyNote}</div>}
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => { const r = pending; setPending(null); void analyze(r.snapshot); }} className="n-send">{t('Yes, read it', 'Sí, léelo')}</button>
        <button type="button" onClick={reset} className="n-chip ghost">{t('No', 'No')}</button>
      </div>
    </div>
  ) : null;

  const errorStage = phase === 'error' ? (
    <div className="flex flex-col items-center">
      <NucleoSphere size={desktop ? 220 : 170} mode="idle" />
      <p className="n-caption mt-12" role="alert">{deskError ?? lastBobby}</p>
    </div>
  ) : null;

  const suggestions = done && snapshot
    ? [t(`Another question about ${snapshot.symbol}`, `Otra pregunta sobre ${snapshot.symbol}`), ...progress.quickAccess.filter((s) => s !== snapshot.symbol).slice(0, 2).map((s) => t(`How does ${s} look?`, `¿Cómo se ve ${s}?`))]
    : progress.quickAccess.slice(0, 3).map((s) => t(`How does ${s} look?`, `¿Cómo se ve ${s}?`));
  const chips = !reading && phase !== 'confirm' ? (
    <div className="w-full">
      <div className="n-label mb-3 text-center">{t('You might want to ask', 'Quizá quieras preguntar')}</div>
      <div className="n-chips">
        {suggestions.map((s, i) => (
          <button key={s} type="button" className={`n-chip ${i === 0 ? '' : 'dim'}`} onClick={() => {
            if (done && snapshot && i === 0) { setInput(`${snapshot.symbol} `); inputRef.current?.focus(); return; }
            const sym = done && snapshot ? progress.quickAccess.filter((q) => q !== snapshot.symbol)[i - 1] : progress.quickAccess[i];
            if (sym) void ask(sym, s);
          }}>{s}</button>
        ))}
        <button type="button" className="n-chip ghost" onClick={() => { sfxTock(); setSheet('board'); }}>{t('Explore markets', 'Explorar mercados')}</button>
      </div>
    </div>
  ) : null;

  const dock = (
    <div className="n-dock">
      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="n-ask mx-auto w-full max-w-[620px]">
        <input ref={inputRef} data-desk-input value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('Ask about an asset', 'Pregunta por un activo')} placeholder={listening ? t('Listening…', 'Escuchando…') : t('Ask about any stock or crypto…', 'Pregunta por cualquier acción o cripto…')} />
        {input.trim() && !working && <button type="submit" className="n-send" aria-label={t('Ask', 'Preguntar')}><ArrowRight size={16} /></button>}
        <button type="button" onClick={toggleDictation} aria-label={listening ? t('Stop listening', 'Dejar de escuchar') : t('Talk to Bobby', 'Hablar con Bobby')} className={`n-mic ${listening ? 'on' : ''}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
      </form>
    </div>
  );

  return (
    <div className="n-desk">
      {header}
      <main className="n-stage">
        <AnimatePresence mode="wait">
          <motion.section key={reading ? 'think' : done ? 'result' : phase === 'confirm' ? 'confirm' : phase === 'error' ? 'error' : 'idle'}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="w-full">
            {reading ? thinkStage : done ? resultStage : phase === 'confirm' ? confirmCard : phase === 'error' ? errorStage : idleStage}
          </motion.section>
        </AnimatePresence>
        {cards}
        <div className="mt-12 w-full">{chips}</div>
      </main>
      {dock}

      <AnimatePresence>
        {sheet === 'profile' && (
          <NucleoProfile
            companion={companion} displayName={displayName} level={level} xp={progress.xp}
            mascotState={listening ? 'listening' : voice.speaking ? 'speaking' : reading ? 'thinking' : 'idle'}
            voiceLevel={voice.speaking ? voice.level : null} attachments={attachments} equip={equip} stageRef={stageRef}
            freeVoice={freeVoice} muted={muted} speakEnabled={speakEnabled}
            onClose={() => setSheet('none')}
            onPickCompanion={(c) => { progressStore.setCompanion(c.id); void voice.speak(pick(c.selectLine), { voice: c.voicePersona, essential: false }); }}
            onTool={(tool) => setInspected(tool)} onPet={() => setSheet('pet')} onCatalog={() => setSheet('catalog')}
            onSwap={() => setSheet('swap')} onTraderLand={openTraderLand} onExplore={() => setSheet('board')}
            onShare={() => void shareSkin()} onSignIn={() => { setSheet('none'); setSignInPrompt(true); }} onRisk={() => setSheet('risk')}
            onToggleVoiceMode={() => { voice.stop(); closeRecognition(); setFreeVoice((v) => !v); setVoiceNotice(''); }}
            onToggleSpeak={() => setSpeakEnabled((v) => { if (v) voice.stop(); return !v; })}
            onToggleSounds={() => { setSfxMuted(!muted); setMuted(!muted); }}
            onReset={() => { if (window.confirm(t('Reset XP, gear and avatar on this browser?', '¿Reiniciar XP, equipo y avatar en este navegador?'))) progressStore.reset(); }}
          />
        )}
        {sheet === 'board' && <BoardSheet key="board" onPick={(s) => { setSheet('none'); void ask(s); }} onClose={() => setSheet('none')} />}
        {signInPrompt && !evolution && !drops[0] && sheet === 'none' && <SignInPrompt key="signin-prompt" xp={progress.xp} onClose={() => setSignInPrompt(false)} />}
        {sheet === 'catalog' && <GearCatalog key="catalog" current={companion} xp={progress.xp} level={level.number} onClose={() => setSheet('profile')} />}
        {sheet === 'swap' && <SwapSheet key="swap" initialSymbol={snapshot?.symbol ?? null} onClose={() => setSheet('none')} />}
        {sheet === 'pet' && (() => { const pet = petFor(companion.id); const has = petUnlocked(progress.xp); return pet ? (
          <motion.div key="pet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onClick={() => setSheet('profile')}>
            <div className="n-card w-full max-w-md space-y-3 rounded-b-none p-6 text-center md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
              <div className="text-7xl" style={{ filter: has ? 'none' : 'grayscale(1)' }}>{pet.emoji}</div>
              <div className="n-display text-2xl">{pick(pet.name)}</div>
              <div className="text-sm" style={{ color: '#A39C91' }}>{has ? (pet.spins ? t('Spins next to your avatar.', 'Gira junto a tu avatar.') : t("Lives at your avatar's feet.", 'Vive a los pies de tu avatar.')) : t(`Unlocks at ${PET_UNLOCK_XP} XP · you have ${progress.xp}. Discipline only.`, `Se desbloquea a ${PET_UNLOCK_XP} XP · llevas ${progress.xp}. Solo disciplina.`)}</div>
            </div>
          </motion.div>) : null; })()}
        {sheet === 'risk' && (
          <motion.div key="risk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0B0A09' }}><NucleoRisk readOnly onClose={() => setSheet('profile')} /></motion.div>
        )}
        {inspected && <ToolDetail key="tool" companion={companion} tool={inspected} xp={progress.xp} onClose={() => setInspected(null)} />}
        {evolution && <EvolutionOverlay key="evo" companion={companion} level={evolution} onDone={() => { const name = companionName(companion, evolution.number); say(t(`I evolved. Call me ${name} now.`, `Evolucioné. Ahora dime ${name}.`), false); setEvolution(null); }} />}
        {/* A new tool: open the profile so the avatar is seen putting it on. */}
        {!evolution && drops[0] && <ToolUnlockOverlay key="drop" companion={companion} tool={drops[0]} onDone={() => { const tool = drops[0]; setDrops((d) => d.slice(1)); if (toolHasArt(tool)) { setSheet('profile'); setTimeout(() => setEquip((e) => ({ url: toolArt(tool), token: e.token + 1 })), 520); } }} />}
      </AnimatePresence>
    </div>
  );
}

/** Markets to explore: search 600+ assets or browse today's lists. */
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
        const obj = (await res.json()) as { browse?: Record<string, Array<{ symbol: string; name: string; last: number | null }>> };
        const b = obj.browse ?? {};
        setSections([[t('Crypto', 'Cripto'), b.crypto], [t('Stocks & ETFs', 'Acciones y ETFs'), b.equity], [t('Metals', 'Metales'), b.commodity]].filter(([, rows]) => rows?.length).map(([title, rows]) => ({ title: title as string, rows: (rows as Array<{ symbol: string; name: string; last: number | null }>).slice(0, 24) })));
      } catch { /* the search still works */ }
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
  const row = (symbol: string, name: string, right: string) => (
    <button key={symbol} type="button" onClick={() => onPick(symbol)} className="n-row">
      <span className="min-w-0 flex-1 text-left"><span className="block text-[15px]" style={{ color: '#F2EDE4' }}>{symbol}</span>{name !== symbol && <span className="block truncate text-[12px]" style={{ color: '#8A8378' }}>{name}</span>}</span>
      <span className="n-label" style={{ color: '#A39C91' }}>{right}</span>
    </button>
  );
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/80" />
        <Dialog.Content aria-describedby={undefined}
          onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener?.focus({ preventScroll: true }); }}
          className="n-card fixed left-1/2 top-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px]">
          <div className="shrink-0 space-y-4 p-5 pb-3">
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="n-display text-[24px]">{t('Explore markets', 'Explorar mercados')}</Dialog.Title>
              <Dialog.Close aria-label={t('Close', 'Cerrar')} className="n-iconbtn"><X size={16} /></Dialog.Close>
            </div>
            <div className="n-ask"><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search assets', 'Buscar activos')} placeholder={t('Name or ticker…', 'Nombre o ticker…')} /></div>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5">
            {q.trim().length >= 2
              ? (hits.length === 0 ? <div className="text-[14px]" style={{ color: '#8A8378' }}>{t('Nothing yet — keep typing; Bobby resolves typos.', 'Nada aún — sigue escribiendo; Bobby resuelve typos.')}</div> : <div>{hits.map((h) => row(h.symbol, h.name, h.assetClass))}</div>)
              : sections.map((s) => (
                <div key={s.title}>
                  <div className="n-label mb-1 flex justify-between"><span>{s.title}</span><span>{s.rows.length}</span></div>
                  <div>{s.rows.map((r) => row(r.symbol, r.name, r.last !== null ? money(r.last) : ''))}</div>
                </div>
              ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** True when the viewport matches; the desk opens up from lg. */
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
