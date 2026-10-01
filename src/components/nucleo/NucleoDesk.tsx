// The web desk, rebuilt in the iPhone's Núcleo grammar. The glass is the protagonist: you ask,
// the three agents argue around it, the verdict condenses on it, the chart is exhaled beneath it
// to scale with only the levels the desk argued about, and the plan lands as cards. The web keeps
// everything the iPhone cannot: the Base swap on a LONG, the wallet, and the rest of the desk
// (sign-in, XP, gear, Trader Land) now living behind the avatar, in the profile.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowRight, Mic, MicOff, X } from 'lucide-react';
import { COMPANIONS, companionName, getCompanion, getVibe, levelFor, nextLevelFor, petArt, petFor, petUnlocked, PET_UNLOCK_XP, toolArt, toolHasArt, toolSlot, wornGear, type CompanionLevel, type CompanionTool } from '@/lib/companions/data';
import { isPortuguese, pick, speechLocale, t } from '@/lib/companions/i18n';
import { progressStore, useProgress, type ThesisSnapshot } from '@/lib/companions/progress';
import { sfxMuted, sfxShield, sfxSuccess, sfxTock, setSfxMuted } from '@/lib/companions/sfx';
import { voiceScreenState } from '@/lib/realtime-context';
import { useCompanionVoice } from '@/hooks/useCompanionVoice';
import { getSyncStatus } from '@/lib/companions/sync';
import NucleoSphere, { type SphereVerdict } from '@/components/companion/NucleoSphere';
import { useBobbyAccount } from '@/hooks/useBobbyAccount';
import SignInPrompt, { recordAsk, shouldPromptAfterAsk, shouldPromptNow } from '@/components/companion/SignInPrompt';
import { EvolutionOverlay, GearCatalog, ToolDetail, ToolUnlockOverlay } from '@/components/companion/CompanionOverlays';
import LandSeedCard from '@/components/companion/LandSeedCard';
import { DeskSwapCard, SwapSheet } from '@/components/companion/DeskSwap';
import { WalletBalancePill } from '@/components/companion/DeskWallet';
import ProgressSync from '@/components/companion/ProgressSync';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { captureReferral, claimPendingReferral, fetchAccess, pendingReferral, startBilling, type Access, type AccessState, type DeskLevel } from '@/lib/access-client';
import NucleoChart from './NucleoChart';
import NucleoProfile from './NucleoProfile';
import NucleoRisk from './NucleoRisk';
import LangMenu from './LangMenu';
import LevelControl, { LEVEL_HUE, allowanceFor, levelName, storedLevel, storeLevel } from './LevelControl';
import LimitDialog, { type LimitState } from './LimitDialog';
import InvitePanel from './InvitePanel';
import {
  AGENT_TONE, assetSearch, candles, debateFor, isNoTrade, isUnavailable, localizedMomentum, localizedTrend, money, noTradeReason, prettyName, resolveAsset, runAgents, runDebate, topMovers, type Agents,
  type AgentKey, type Answer, type Candle, type Mover, type Resolution, type Snapshot,
} from './deskData';

interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
}

type Phase = 'idle' | 'resolving' | 'alpha' | 'redTeam' | 'rebuttal' | 'cio' | 'reveal' | 'complete' | 'error' | 'confirm' | 'gate';
type LiveArgs = { alpha?: string; red?: string; rebuttal?: string };
/** The first sentence, for the voices around the glass; the whole text stays in the debate card. */
const firstSentence = (text: string, max = 170) => { const m = text.match(/^.*?[.!?](?=\s|$)/); const one = (m ? m[0] : text).trim(); return one.length > max ? `${one.slice(0, max).replace(/\s+\S*$/, '')}…` : one; };
const PENDING_ASK = 'bobby:pending-ask';
type Sheet = 'none' | 'profile' | 'board' | 'risk' | 'catalog' | 'pet' | 'swap';
interface Msg { from: 'bobby' | 'you'; text: string }

const WORKING: Phase[] = ['resolving', 'alpha', 'redTeam', 'rebuttal', 'cio'];
const REVEAL_MS = 2600;
const AGENT_NAME: Record<AgentKey, string> = { alpha: 'Alpha Hunter', red: 'Red Team', cio: 'CIO' };

/** "Good afternoon, Anthony." once an Apple/Google account shared a first name; the plain greeting otherwise. */
function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const [en, es, pt] = h < 5 || h >= 19 ? ['Good evening', 'Buenas noches', 'Boa noite'] : h < 12 ? ['Good morning', 'Buenos días', 'Bom dia'] : ['Good afternoon', 'Buenas tardes', 'Boa tarde'];
  const tail = name ? `, ${name}.` : '.';
  return t(en + tail, es + tail, pt + tail);
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
  // The mic dictates inside the desk, like the iOS pill. The realtime voice room is opt-in
  // (profile toggle or ?voice=live), never where the mic button sends you by default.
  const [freeVoice, setFreeVoice] = useState(params.get('voice') !== 'live');
  const initialScreen = voiceScreenState(params.get('symbol'), params.get('timeframe'));
  const returned = location.state as { voiceFallback?: boolean; transcript?: Array<{ role: string; text: string }> } | null;
  const [voiceNotice, setVoiceNotice] = useState(returned?.voiceFallback ? t('Live paused · free voice ready', 'Live en pausa · voz gratis lista', 'Live pausado · voz grátis pronta') : '');
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
  const { account } = useBobbyAccount();
  // Metered access (api/_lib/access.ts): 3 reads without an account, 10 a week with one, Bobby Pro unlimited.
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  // The analysis level (Rápido / Profundo / Máximo) and the pop-up when an allowance runs out.
  const [deskLevel, setDeskLevelState] = useState<DeskLevel>(() => storedLevel());
  const setDeskLevel = useCallback((l: DeskLevel) => { setDeskLevelState(l); storeLevel(l); }, []);
  const deskLevelRef = useRef(deskLevel);
  deskLevelRef.current = deskLevel;
  const accessRef = useRef<AccessState | null>(null);
  const [limit, setLimit] = useState<LimitState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [signinNote, setSigninNote] = useState<{ title: string; body: string } | null>(null);
  const [billing, setBilling] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [proNotice, setProNotice] = useState<'welcome' | 'cancelled' | null>(() => (params.get('pro') === 'welcome' ? 'welcome' : params.get('pro') === 'cancelled' ? 'cancelled' : null));
  const meter: Access | null = accessState?.access ?? null;
  accessRef.current = accessState;
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
  const [agents, setAgents] = useState<Agents | null>(null);
  // The live desk: each argument as it arrives; a debate that did not finish; what "Retry" re-runs.
  const [live, setLive] = useState<LiveArgs>({});
  const [agentsFailed, setAgentsFailed] = useState<{ level: DeskLevel; symbol: string; refunded: boolean } | null>(null);
  const [deskRetry, setDeskRetry] = useState<{ symbol: string; level: DeskLevel } | null>(null);
  const [showDebate, setShowDebate] = useState(false);
  const questionRef = useRef<string>('');
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
    setDeskRetry(null);
    setSnapshot(snap);
    setAnswer(null);
    setAgents(null);
    setAgentsFailed(null);
    setLive({});
    setShowDebate(false);
    setAward(null);
    setLandEvent(null);
    setSeries([]);
    setPhase('alpha');
    void candles(snap.symbol, snap.isEquity).then((rows) => { if (!signal.aborted) setSeries(rows); });
    const runLevel = deskLevelRef.current;
    const question = questionRef.current || t(`How does ${snap.symbol} look?`, `¿Cómo se ve ${snap.symbol}?`, `Como está ${snap.symbol}?`);
    const holdQuestion = () => { try { sessionStorage.setItem(PENDING_ASK, questionRef.current || snap.symbol); } catch { /* private mode */ } };
    // The debate starts first and the stages follow its real events (no timers). The metered read starts
    // once the server accepted the level, so a refused Profundo/Máximo never spends a read; Rápido has no
    // level gate, so both start together.
    const agentsCtl = new AbortController();
    signal.addEventListener('abort', () => agentsCtl.abort(), { once: true });
    let readRun: Promise<Answer> | null = runLevel === 'rapido' ? runDebate(snap.symbol, signal) : null;
    const startRead = () => { readRun = readRun ?? runDebate(snap.symbol, signal); return readRun; };
    const heard: LiveArgs = {};
    const agentsRun = runAgents(snap.symbol, snap.isEquity, question, agentsCtl.signal, runLevel, (event) => {
      if (signal.aborted) return;
      if (event.type === 'accepted') { void startRead(); return; }
      if (event.type !== 'agent') return;
      heard[event.role] = event.text;
      setLive({ ...heard });
      setPhase(event.role === 'alpha' ? 'redTeam' : event.role === 'red' && runLevel === 'maximo' ? 'rebuttal' : 'cio');
    });
    const gateRead = (a: Answer) => {
      // The server stopped this read: sign in first, or Bobby Pro. The question waits and runs after.
      agentsCtl.abort();
      holdQuestion();
      setInput(questionRef.current);
      setSnapshot(null);
      setPhase('idle');
      setLimit({ kind: a.gate === 'signin_required' ? 'signin' : 'upgrade', level: 'rapido', resetsAt: a.access?.resetsAt ?? null });
      void fetchAccess().then((st) => { if (st) setAccessState(st); });
    };
    const keepMeter = (a: Answer) => {
      if (a.access) setAccessState((prev) => (prev ? { ...prev, access: a.access! } : { access: a.access!, signedIn: a.access!.tier !== 'anon', subscription: null, payments: { stripe: false, apple: true } }));
    };
    if (readRun) {
      const early = await readRun;
      if (signal.aborted) return;
      keepMeter(early);
      if (early.gate) { gateRead(early); return; }
    }
    const run = await agentsRun;
    if (signal.aborted) return;
    if (runLevel !== 'rapido') void fetchAccess().then((st) => { if (st) setAccessState(st); });
    if (run.refusal) {
      // The premium level's allowance ran out on the server: the pop-up, never a silent downgrade.
      if (run.refusal.code === 'signin_required') holdQuestion();
      setInput(questionRef.current);
      setSnapshot(null);
      setPhase('idle');
      setLimit({ kind: run.refusal.code === 'signin_required' ? 'signin' : run.refusal.code === 'upgrade_required' ? 'upgrade' : 'exhausted', level: run.refusal.level, resetsAt: run.refusal.resetsAt });
      return;
    }
    if (run.failure && !readRun) {
      // Refused before the level was accepted (spend guard, outage): nothing was spent, say so plainly.
      const msg = run.failure === 'budget_paused'
        ? t('Deep and Max are paused for today. Quick still works.', 'Profundo y Máximo están en pausa por hoy. Rápido sigue disponible.', 'Profundo e Máximo estão em pausa hoje. Rápido continua disponível.')
        : t(`The agents did not finish for ${snap.symbol}. Try again.`, `Los agentes no terminaron con ${snap.symbol}. Inténtalo de nuevo.`, `Os agentes não terminaram com ${snap.symbol}. Tente de novo.`);
      setPhase('error');
      setDeskError(msg);
      setDeskRetry(run.failure === 'budget_paused' ? { symbol: snap.symbol, level: 'rapido' } : { symbol: snap.symbol, level: runLevel });
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      say(msg);
      return;
    }
    const a = await startRead();
    if (signal.aborted) return;
    keepMeter(a);
    if (a.gate) { gateRead(a); return; }
    if (isUnavailable(a)) {
      setPhase('error');
      const msg = t(`The desk did not answer for ${snap.symbol}. Try again in a moment.`, `El desk no respondió por ${snap.symbol}. Inténtalo de nuevo en un momento.`, `O desk não respondeu sobre ${snap.symbol}. Tente de novo em instantes.`);
      setDeskError(msg);
      setDeskRetry({ symbol: snap.symbol, level: runLevel });
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      say(msg);
      return;
    }
    const g = run.agents;
    setAgents(g);
    setAnswer(a);
    setReadSeq((n) => n + 1);
    if (!g) {
      // The agents did not finish: the market read stays, clearly marked; no verdict, no XP. A premium
      // use was given back by the server.
      setAgentsFailed({ level: runLevel, symbol: snap.symbol, refunded: run.refunded === true });
      setPhase('complete');
      const msg = t('The agents did not finish this time, so there is no verdict. Here is the market read.', 'Los agentes no terminaron esta vez, así que no hay veredicto. Aquí está la lectura del mercado.', 'Os agentes não terminaram desta vez, então não há veredito. Aqui está a leitura do mercado.');
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      say(msg);
      return;
    }
    // The three voices say their piece around the glass, then the verdict condenses on it.
    setPhase('reveal');
    revealRef.current = window.setTimeout(() => { if (!signal.aborted) setPhase('complete'); }, REVEAL_MS);
    const text = debateFor(a, g).spoken;
    setMessages((m) => [...m, { from: 'bobby', text }]);
    say(text);
    const noTradeNow = isNoTrade(a, g);
    if (noTradeNow) sfxShield(); else sfxSuccess();
    // A full review earns discipline; respecting NO TRADE earns more. The number shown is what the
    // daily cap ACTUALLY granted. The verdict rides along as the thesis Trader Land reviews.
    const lvl = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
    const thesis: ThesisSnapshot = { symbol: snap.symbol, isEquity: snap.isEquity, direction: noTradeNow ? 'none' : a.direction === 'long' ? 'long' : a.direction === 'short' ? 'short' : 'none', price: lvl(a.price), entry: lvl(a.entry), stop: lvl(a.stop), target: lvl(a.target) };
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
    const lv = deskLevelRef.current;
    const allowance = lv === 'rapido' ? null : allowanceFor(lv, accessRef.current);
    if (allowance && allowance.state !== 'open') {
      const tier = accessRef.current?.levels?.tier ?? accessRef.current?.access.tier ?? 'anon';
      // Without an account the question waits and runs by itself once the reader is signed in.
      if (tier === 'anon') { try { sessionStorage.setItem(PENDING_ASK, q); } catch { /* private mode */ } }
      setLimit({ kind: tier === 'anon' ? 'signin' : tier === 'free' ? 'upgrade' : 'exhausted', level: lv, resetsAt: allowance.resetsAt });
      return;
    }
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
    questionRef.current = q;
    setPhase('resolving');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const r = await resolveAsset(q, controller.signal);
    if (controller.signal.aborted) return;
    if (!r) {
      setPhase('error');
      const msg = t('I could not resolve that asset. Try a name or ticker: bitcoin, NVDA, gold.', 'No pude resolver ese activo. Prueba con el nombre o ticker: bitcoin, NVDA, oro.', 'Não consegui identificar esse ativo. Tente um nome ou ticker: bitcoin, NVDA, ouro.');
      setDeskError(msg);
      setMessages((m) => [...m, { from: 'bobby', text: msg }]);
      return;
    }
    if (r.needsConfirmation) { setPending(r); setPhase('confirm'); return; }
    await analyze(r.snapshot, controller);
  }, [analyze, voice]);

  // The meter: on load, whenever the account changes, and after a Stripe checkout (the webhook can
  // lag a few seconds, so a welcome polls until the subscription shows up). A question the gate held
  // runs by itself once the reader is signed in.
  const retried = useRef(false);
  useEffect(() => {
    let alive = true;
    captureReferral();
    const load = async (attempt = 0) => {
      let st = await fetchAccess();
      if (!alive || !st) return;
      setAccessState(st);
      // An invitation from a friend waits for this reader's account, then counts once.
      if (pendingReferral()) {
        if (!st.signedIn) setInviteNotice(t('A friend invited you. Create your free account to accept.', 'Un amigo te invitó. Crea tu cuenta gratis para aceptar.', 'Um amigo te convidou. Crie sua conta grátis para aceitar.'));
        else {
          const result = await claimPendingReferral();
          if (result === 'claimed') setInviteNotice(t('Invitation accepted. Your friend just got Bobby Pro thanks to you.', 'Invitación aceptada. Tu amigo acaba de recibir Bobby Pro gracias a ti.', 'Convite aceito. Seu amigo acabou de ganhar Bobby Pro graças a você.'));
          else if (result) setInviteNotice(null);
          const fresh = await fetchAccess();
          if (!alive) return;
          if (fresh) { st = fresh; setAccessState(fresh); }
        }
      }
      if (proNotice === 'welcome' && st.access.tier !== 'pro' && attempt < 6) { window.setTimeout(() => void load(attempt + 1), 2500); return; }
      let pending: string | null = null;
      try { pending = sessionStorage.getItem(PENDING_ASK); } catch { pending = null; }
      const canRead = st.access.tier === 'pro' || (st.signedIn && !(st.access.paywall && (st.access.remaining ?? 1) + (st.access.bonus ?? 0) <= 0));
      if (pending && canRead && !retried.current) {
        retried.current = true;
        try { sessionStorage.removeItem(PENDING_ASK); } catch { /* private mode */ }
        setLimit(null); setSignInPrompt(false);
        void ask(pending);
      }
    };
    void load();
    let unsub: (() => void) | null = null;
    try {
      const { data } = bobbySupabase().auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { retried.current = false; void load(); } });
      unsub = () => data.subscription.unsubscribe();
    } catch { unsub = null; }
    return () => { alive = false; unsub?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    requestRef.current?.abort();
    if (revealRef.current) clearTimeout(revealRef.current);
    voice.stop();
    sfxTock();
    setPhase('idle'); setSnapshot(null); setAnswer(null); setPending(null); setDeskError(null); setAward(null); setLandEvent(null); setSeries([]); setLimit(null);
    setLive({}); setAgentsFailed(null); setDeskRetry(null); setShowDebate(false);
  };
  // "Retry" re-asks the same question, on the level that failed (or Rápido when the premium pause said so).
  const retry = (r: { symbol: string; level: DeskLevel }) => {
    sfxTock();
    if (r.level !== deskLevelRef.current) { setDeskLevel(r.level); deskLevelRef.current = r.level; }
    void ask(questionRef.current || r.symbol);
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
      setVoiceNotice(t('Use keyboard dictation · Bobby replies aloud', 'Dicta con el teclado · Bobby responde con voz', 'Use o ditado do teclado · o Bobby responde em voz alta'));
      inputRef.current?.focus(); return;
    }
    const recognition = new Recognition();
    recognition.lang = speechLocale();
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
    recognition.onerror = () => { setListening(false); setVoiceNotice(t('Check microphone access or type below', 'Revisa el micrófono o escribe abajo', 'Confira o acesso ao microfone ou digite abaixo')); };
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
      ctx.fillStyle = 'rgba(242,237,228,0.7)'; ctx.font = '500 28px ui-monospace, monospace'; ctx.fillText(`BOBBY · ${t('MY AVATAR', 'MI AVATAR', 'MEU AVATAR')}`, 72, 100);
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
      ctx.fillStyle = '#A39C91'; ctx.font = '500 26px ui-monospace, monospace'; ctx.fillText(`${t('LEVEL', 'NIVEL', 'NÍVEL')} ${level.number} · ${level.name} · ${progress.xp} XP`, 540, 1050);
      ctx.fillStyle = 'rgba(242,237,228,0.8)'; ctx.font = '28px system-ui, sans-serif';
      const line = [...worn.map((w) => pick(w.name)), ...(pet ? [pick(pet.name)] : [])].join(' · ') || t('No gear yet — first read drops the first tool.', 'Sin equipo aún — la primera lectura suelta la primera herramienta.', 'Sem equipamento ainda — a primeira leitura libera a primeira ferramenta.');
      ctx.fillText(line.slice(0, 70), 540, 1120);
      ctx.fillStyle = 'rgba(242,237,228,0.4)'; ctx.font = '22px ui-monospace, monospace'; ctx.fillText(`bobbyprotocol.xyz · ${t('earned with discipline, never volume', 'ganado con disciplina, nunca volumen', 'conquistado com disciplina, nunca com volume')}`, 540, 1280);
      const blob = await new Promise<Blob | null>((r) => card.toBlob(r, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'bobby-avatar.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: 'Bobby', text: t('My Bobby avatar — earned with discipline, never volume.', 'Mi avatar de Bobby — ganado con disciplina, nunca volumen.', 'Meu avatar do Bobby — conquistado com disciplina, nunca com volume.') }); return; }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bobby-avatar.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* user cancelled or canvas tainted */ }
  };

  const openTraderLand = useCallback(() => { sfxTock(); navigate('/trader-land'); }, [navigate]);

  const desktop = useMediaQuery('(min-width: 1024px)');
  const debate = useMemo(() => (answer ? debateFor(answer, agents) : null), [answer, agents]);
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
  const verdictWord = !debate ? null : agentsFailed ? t('No verdict', 'Sin veredicto', 'Sem veredito') : debate.direction === 'long' ? 'Long' : debate.direction === 'short' ? 'Short' : t('No trade', 'No trade', 'No trade');
  const verdictSub = !debate ? null : agentsFailed ? t('The agents did not finish', 'Los agentes no terminaron', 'Os agentes não terminaram') : debate.direction !== 'none' && answer?.convictionPct != null
    ? t(`${Math.round(answer.convictionPct)}% conviction`, `${Math.round(answer.convictionPct)}% convicción`, `${Math.round(answer.convictionPct)}% convicção`)
    : t('Capital protected', 'Capital protegido', 'Capital protegido');
  const lastYou = [...messages].reverse().find((m) => m.from === 'you')?.text ?? '';
  const lastBobby = [...messages].reverse().find((m) => m.from === 'bobby')?.text ?? '';
  const change = useMemo(() => {
    const pts = series.slice(-24);
    if (pts.length < 2) return null;
    const first = pts[0].close, last = pts[pts.length - 1].close;
    return first > 0 ? ((last - first) / first) * 100 : null;
  }, [series]);
  const assetLine = snapshot ? [snapshot.symbol, answer?.price != null ? money(answer.price) : null, change !== null ? signedPct(change) : null].filter(Boolean).join(' · ') : '';
  const activeAgent: AgentKey | null = phase === 'alpha' || phase === 'resolving' || phase === 'rebuttal' ? 'alpha' : phase === 'redTeam' ? 'red' : phase === 'cio' ? 'cio' : null;
  const nextLevel = nextLevelFor(progress.xp);
  const xpArc = nextLevel ? Math.max(0.04, Math.min(1, (progress.xp - level.minXP) / (nextLevel.minXP - level.minXP))) : 1;

  // ---- pieces ----
  const header = (
    <header className="n-topbar n-topbar-desk">
      <div className="flex min-w-[44px] items-center sm:min-w-[92px]">
        {snapshot || phase === 'confirm' || phase === 'error'
          ? <button type="button" onClick={reset} className="n-iconbtn" aria-label={t('Close this read', 'Cerrar esta lectura', 'Fechar esta leitura')}><X size={16} /></button>
          : <a href="/" className="n-wordmark" aria-label={t('Bobby, home', 'Bobby, inicio', 'Bobby, início')}>Bobby</a>}
      </div>
      <div className="min-w-0 flex-1 text-center">
        {lastYou && (reading || done || phase === 'confirm') && (
          <>
            <div className="truncate text-[14px]" style={{ color: '#F2EDE4' }}>{lastYou}</div>
            {assetLine && <div className="n-dock-asset truncate">{assetLine}</div>}
          </>
        )}
      </div>
      <div className="flex min-w-[44px] items-center justify-end gap-2 sm:min-w-[92px]">
        {desktop && <WalletBalancePill onClick={() => { sfxTock(); setSheet('swap'); }} />}
        <LangMenu />
        <button type="button" className="n-face-btn" onClick={() => { sfxTock(); setSheet('profile'); }} aria-label={t(`Your profile · ${displayName}, level ${level.number}`, `Tu perfil · ${displayName}, nivel ${level.number}`, `Seu perfil · ${displayName}, nível ${level.number}`)} title={displayName}>
          <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="none" stroke="rgba(242,237,228,.12)" strokeWidth="2" /><circle cx="22" cy="22" r="20" fill="none" stroke="#FFF8EC" strokeWidth="2" strokeLinecap="round" strokeDasharray={2 * Math.PI * 20} strokeDashoffset={2 * Math.PI * 20 * (1 - xpArc)} transform="rotate(-90 22 22)" /></svg>
          <img src={`/mascots/${companion.id}.webp`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        </button>
      </div>
    </header>
  );

  const sphereBig = desktop ? 320 : 232;
  const levelTint = deskLevel === 'rapido' ? null : LEVEL_HUE[deskLevel];
  const planTier = accessState?.levels?.tier ?? accessState?.access.tier ?? null;
  const planTag = planTier === 'free' || planTier === 'pro'
    ? <span className={`n-plantag ${planTier}`} aria-label={planTier === 'pro' ? 'Bobby Pro' : t('Free account', 'Cuenta gratis', 'Conta grátis')}><i />{planTier === 'pro' ? 'Pro' : 'Free'}</span>
    : null;
  const idleStage = (
    <div className="flex flex-col items-center">
      <div className="n-sphere-wrap" data-level={deskLevel} style={{ '--lv': LEVEL_HUE[deskLevel], '--sz': `${sphereBig}px` } as CSSProperties}>
        <NucleoSphere size={sphereBig} mode={listening ? 'listen' : 'idle'} tint={levelTint} tintAmount={0.35} />
        {planTag}
      </div>
      <h1 className="n-display mt-14 text-center text-[40px] leading-[1.05] sm:text-[52px]">{greeting(account?.firstName)}</h1>
      <p className="mt-3 text-center text-[15px]" style={{ color: '#A39C91' }}>
        {movers.length
          ? movers.map((m, i) => <span key={m.symbol}>{i > 0 && <span style={{ color: '#5c564e' }}> · </span>}{m.symbol} <span style={{ color: m.changePct >= 0 ? '#3FE0B5' : '#FF5A5F' }}>{signedPct(m.changePct)}</span></span>)
          : t('Ask me about any stock or crypto.', 'Pregúntame por cualquier acción o cripto.', 'Me pergunte sobre qualquer ação ou cripto.')}
        {movers.length > 0 && <span style={{ color: '#8A8378' }}> {t('in 24h', 'en 24h', 'em 24h')}</span>}
      </p>
      {voiceNotice && <p className="mt-2 text-[13px]" style={{ color: '#8A8378' }}>{voiceNotice}</p>}
    </div>
  );

  // Around the glass, each voice's first sentence as soon as the server sent it; the CIO speaks at the reveal.
  const alphaSaid = phase === 'reveal' && debate ? debate.stances[0].line : live.rebuttal ?? live.alpha ?? null;
  const redSaid = phase === 'reveal' && debate ? debate.stances[1].line : live.red ?? null;
  const alphaLine = alphaSaid ? firstSentence(alphaSaid) : null;
  const redLine = redSaid ? firstSentence(redSaid) : null;
  const cioLine = phase === 'reveal' && debate ? firstSentence(agents?.synthesis?.headline ?? debate.stances[2].line) : null;
  const thinkStatus = phase === 'resolving' ? t('Finding the asset', 'Buscando el activo', 'Buscando o ativo')
    : phase === 'alpha' ? t('Alpha Hunter looks for the case', 'Alpha Hunter busca el caso', 'Alpha Hunter busca o caso')
    : phase === 'redTeam' ? t('Red Team attacks it', 'Red Team lo ataca', 'Red Team ataca')
    : phase === 'rebuttal' ? t('Alpha answers · second round', 'Alpha responde · segunda ronda', 'Alpha responde · segunda rodada')
    : phase === 'cio' ? t('The CIO decides', 'El CIO decide', 'O CIO decide')
    : t('Verdict forming', 'Se forma el veredicto', 'Formando o veredicto');
  const thinkStage = (
    <div className="n-think">
      <div className="n-think-a"><Voice k="alpha" line={alphaLine} active={activeAgent === 'alpha'} align={desktop ? 'right' : 'left'} /></div>
      <div className="n-think-s"><NucleoSphere size={desktop ? 280 : 196} mode="debate" tint={levelTint} tintAmount={0.35} /></div>
      <div className="n-think-r"><Voice k="red" line={redLine} active={activeAgent === 'red'} align={desktop ? 'left' : 'right'} /></div>
      <div className="n-think-c"><Voice k="cio" line={cioLine} active={activeAgent === 'cio'} align="center" /></div>
      <div className="n-think-st n-label" aria-live="polite">{thinkStatus}{deskLevel !== 'rapido' ? ` · ${levelName(deskLevel)}` : ''}</div>
    </div>
  );

  const sats = useMemo(() => {
    if (!answer || !snapshot) return [] as Array<{ k: string; v: string; q?: string | null; dot: string }>;
    const out: Array<{ k: string; v: string; q?: string | null; dot: string }> = [];
    if (answer.price != null) out.push({ k: snapshot.symbol, v: money(answer.price), q: change !== null ? signedPct(change) : null, dot: change !== null && change < 0 ? AGENT_TONE.red : AGENT_TONE.alpha });
    if (answer.rsi != null) { const mom = answer.momentum ? localizedMomentum(answer.momentum) : null; out.push({ k: 'RSI 14', v: String(Math.round(answer.rsi)), q: mom, dot: answer.rsi >= 70 ? AGENT_TONE.red : answer.rsi <= 30 ? AGENT_TONE.alpha : '#A39C91' }); }
    if (answer.support != null && answer.resistance != null) out.push({ k: t('Range', 'Rango', 'Faixa'), v: `${money(answer.support)}–${money(answer.resistance)}`, dot: '#A39C91' });
    if (answer.trend) { const trend = localizedTrend(answer.trend); out.push({ k: t('Trend', 'Tendencia', 'Tendência'), v: trend.charAt(0).toUpperCase() + trend.slice(1), q: answer.atrPct != null ? `ATR ${answer.atrPct.toFixed(1)}%` : null, dot: '#A39C91' }); }
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
      {agentsFailed ? (
        <div className="n-card n-synth n-failed mt-8" role="status">
          <div className="n-label">{t('No verdict this time', 'Sin veredicto esta vez', 'Sem veredito desta vez')}</div>
          <p className="n-synth-head">{t('The agents did not finish, so nothing was decided. The market read below is data, not a thesis.', 'Los agentes no terminaron, así que no se decidió nada. La lectura de abajo son datos, no una tesis.', 'Os agentes não terminaram, então nada foi decidido. A leitura abaixo são dados, não uma tese.')}</p>
          {agentsFailed.level !== 'rapido' && agentsFailed.refunded && <p className="n-synth-note">{t(`Your ${levelName(agentsFailed.level)} was not used.`, `No se descontó tu ${levelName(agentsFailed.level)}.`, `Seu ${levelName(agentsFailed.level)} não foi descontado.`)}</p>}
          <button type="button" className="n-send mt-4" onClick={() => retry({ symbol: agentsFailed.symbol, level: agentsFailed.level })}>{t('Try again', 'Reintentar', 'Tentar de novo')}</button>
        </div>
      ) : agents?.synthesis ? (
        <div className="n-synth mt-8 w-full">
          <div className="flex min-h-[56px] w-full justify-center px-2"><Caption text={agents.synthesis.headline} run={readSeq} /></div>
          <div className="n-synth-rows">
            <div className="n-synth-row"><i style={{ background: AGENT_TONE.alpha }} /><span><b>{t('Why', 'Por qué', 'Por quê')}</b>{agents.synthesis.why}</span></div>
            <div className="n-synth-row"><i style={{ background: AGENT_TONE.red }} /><span><b>{t('The risk', 'El riesgo', 'O risco')}</b>{agents.synthesis.risk}</span></div>
            <div className="n-synth-row"><i style={{ background: AGENT_TONE.cio }} /><span><b>{t('Watch', 'Qué vigilar', 'O que vigiar')}</b>{agents.synthesis.watch}</span></div>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex min-h-[64px] w-full justify-center px-2"><Caption text={debate.spoken} run={readSeq} /></div>
      )}
      <div className="mt-8 w-full">
        <NucleoChart series={series} answer={answer} debate={agentsFailed ? null : debate} watch={agentsFailed ? null : agents?.synthesis?.watchLevel ?? null} symbol={snapshot.symbol} isEquity={snapshot.isEquity} drawKey={readSeq} height={desktop ? 280 : 220} />
      </div>
    </div>
  ) : null;

  const thesisCard = done && debate && answer && snapshot ? (() => {
    const trade = debate.direction !== 'none';
    const title = agentsFailed ? t(`${snapshot.symbol}: market read`, `${snapshot.symbol}: lectura del mercado`, `${snapshot.symbol}: leitura do mercado`) : debate.direction === 'long' ? t(`Long on ${snapshot.symbol}.`, `Long en ${snapshot.symbol}.`, `Long em ${snapshot.symbol}.`) : debate.direction === 'short' ? t(`Short on ${snapshot.symbol}.`, `Short en ${snapshot.symbol}.`, `Short em ${snapshot.symbol}.`) : t(`No trade on ${snapshot.symbol}.`, `No trade en ${snapshot.symbol}.`, `No trade em ${snapshot.symbol}.`);
    const rows: Array<{ k: string; v: string; dot?: string }> = [];
    if (answer.price != null) rows.push({ k: t('Price at read', 'Precio al leer', 'Preço na leitura'), v: money(answer.price) });
    if (trade) {
      if (answer.entry != null) rows.push({ k: t('Entry', 'Entrada', 'Entrada'), v: money(answer.entry), dot: AGENT_TONE.alpha });
      if (answer.target != null) rows.push({ k: t('Target', 'Objetivo', 'Alvo'), v: money(answer.target), dot: AGENT_TONE.cio });
      if (answer.stop != null) rows.push({ k: t('Stop · invalidation', 'Stop · invalidación', 'Stop · invalidação'), v: money(answer.stop), dot: AGENT_TONE.red });
      if (answer.rewardRisk != null) rows.push({ k: t('Reward : risk', 'Beneficio : riesgo', 'Retorno : risco'), v: `${answer.rewardRisk.toFixed(1)} : 1` });
    } else {
      if (answer.support != null) rows.push({ k: t('Support', 'Soporte', 'Suporte'), v: money(answer.support) });
      if (answer.resistance != null) rows.push({ k: t('Resistance', 'Resistencia', 'Resistência'), v: money(answer.resistance) });
    }
    const trendRsi = [answer.trend ? localizedTrend(answer.trend) : null, answer.rsi != null ? `RSI ${Math.round(answer.rsi)}` : null].filter(Boolean).join(' · ');
    if (trendRsi) rows.push({ k: t('Trend · RSI', 'Tendencia · RSI', 'Tendência · RSI'), v: trendRsi.charAt(0).toUpperCase() + trendRsi.slice(1) });
    const tone = debate.direction === 'long' ? AGENT_TONE.alpha : debate.direction === 'short' ? AGENT_TONE.red : AGENT_TONE.cio;
    return (
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="n-card n-plan">
        <div className="flex items-baseline justify-between"><span className="n-label">{t('Thesis', 'Tesis', 'Tese')} · {snapshot.symbol}</span><span className="n-label" style={{ color: tone }}>{verdictSub}</span></div>
        <div className="n-display mt-3 text-[28px] leading-tight">{title}</div>
        {!trade && !agentsFailed && <p className="mt-2 text-[14px]" style={{ color: '#A39C91' }}>{noTradeReason(answer, agents)}</p>}
        <div className="mt-4">
          {rows.map((r) => (
            <div key={r.k} className="n-kv"><span className="n-kv-k">{r.dot && <i style={{ background: r.dot }} />}{r.k}</span><span className="n-kv-v">{r.v}</span></div>
          ))}
        </div>
        {award && award.xp > 0 && <div className="n-xp mt-4">+{award.xp} {award.noTrade ? t('discipline XP for waiting', 'XP de disciplina por esperar', 'XP de disciplina por esperar') : t('discipline XP', 'XP de disciplina', 'XP de disciplina')}</div>}
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: '#8A8378' }}>
          {(() => {
            const tfs = (agents?.evidenceUsed?.timeframes ?? ['1H']).join(' · ');
            const lv = agents && agents.level !== 'rapido' ? ` · ${levelName(agents.level)}` : '';
            return t(`${tfs} indicators, argued by three agents${lv}. Reference only, not financial advice. `, `Indicadores de ${tfs}, debatidos por tres agentes${lv}. Solo referencia, no es asesoría financiera. `, `Indicadores de ${tfs}, debatidos por três agentes${lv}. Apenas referência, não é recomendação financeira. `);
          })()}
          <a href="/protocol" className="underline" style={{ color: '#A39C91' }}>{t('Public agent activity', 'Actividad pública de los agentes', 'Atividade pública dos agentes')}</a>
        </p>
      </motion.div>
    );
  })() : null;

  const debateCard = done && debate && agents && !agentsFailed ? (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="n-card n-plan">
      <div className="flex items-baseline justify-between"><span className="n-label">{t('The debate', 'El debate', 'O debate')}</span><span className="n-label">{agents?.rebuttal ? t('3 agents · 2 rounds', '3 agentes · 2 rondas', '3 agentes · 2 rodadas') : t('3 agents', '3 agentes', '3 agentes')}</span></div>
      {!showDebate && (
        <div className="mt-2">
          {debate.stances.map((s, i) => (
            <div key={s.key} className="n-debate-peek" style={{ borderTop: i ? '1px solid rgba(242,237,228,.07)' : 'none' }}>
              <span className="n-voice-name" style={{ color: AGENT_TONE[s.key] }}><i />{AGENT_NAME[s.key]}</span>
              <span className="n-debate-peek-line">{firstSentence(s.line, 120)}</span>
            </div>
          ))}
          <button type="button" className="n-debate-more" aria-expanded={false} onClick={() => { sfxTock(); setShowDebate(true); }}>
            {t('Read the full debate', 'Ver el debate completo', 'Ver o debate completo')}
          </button>
        </div>
      )}
      {showDebate && <div className="mt-2">
        {debate.stances.map((s, i) => (
          <div key={s.key} className="py-3.5" style={{ borderTop: i ? '1px solid rgba(242,237,228,.07)' : 'none' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="n-voice-name" style={{ color: AGENT_TONE[s.key] }}><i />{AGENT_NAME[s.key]}</span>
              {s.score !== null && <span className="n-label">{s.key === 'red' ? t(`risk ${s.score}%`, `riesgo ${s.score}%`, `risco ${s.score}%`) : `${s.score}%`}</span>}
            </div>
            <div className="mt-1.5 text-[15px] leading-snug" style={{ color: '#F2EDE4' }}>{s.line}</div>
          </div>
        ))}
        {agents?.rebuttal && (
          <div className="py-3.5" style={{ borderTop: '1px solid rgba(242,237,228,.07)' }}>
            <span className="n-voice-name" style={{ color: AGENT_TONE.alpha }}><i />{t('Alpha Hunter · second round', 'Alpha Hunter · segunda ronda', 'Alpha Hunter · segunda rodada')}</span>
            <div className="mt-1.5 text-[15px] leading-snug" style={{ color: '#F2EDE4' }}>{agents.rebuttal}</div>
          </div>
        )}
        {agents?.scenarios && (
          <div className="n-scen">
            <div className="n-label">{t('Scenarios', 'Escenarios', 'Cenários')}</div>
            <div className="n-scen-row"><i style={{ background: AGENT_TONE.alpha }} /><span><b>{t('Confirms it', 'Lo confirma', 'Confirma')}</b>{agents.scenarios.confirm}</span></div>
            <div className="n-scen-row"><i style={{ background: AGENT_TONE.red }} /><span><b>{t('Invalidates it', 'Lo invalida', 'Invalida')}</b>{agents.scenarios.invalidate}</span></div>
          </div>
        )}
        {agents?.sufficiency && !agents.sufficiency.sufficient && agents.sufficiency.missing.length > 0 && (
          <p className="mt-3 text-[13px]" style={{ color: '#A39C91' }}>{t(`For your horizon the desk is missing ${agents.sufficiency.missing.join(' · ')} data.`, `Para tu plazo faltan datos de ${agents.sufficiency.missing.join(' · ')}.`, `Para o seu prazo faltam dados de ${agents.sufficiency.missing.join(' · ')}.`)}</p>
        )}
        <button type="button" className="n-debate-more" aria-expanded onClick={() => { sfxTock(); setShowDebate(false); }}>
          {t('Show less', 'Ver menos', 'Ver menos')}
        </button>
      </div>}
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
      <div className="n-label mt-12" style={{ color: '#F6B94E' }}>{t('Did you mean', '¿Quisiste decir', 'Você quis dizer')}</div>
      <div className="n-display mt-2 text-center text-[34px] leading-tight">{pending.confirmName} <span style={{ color: '#8A8378' }}>{pending.snapshot.symbol}</span></div>
      {pending.proxyNote && <div className="mt-2 max-w-[40ch] text-center text-[13px]" style={{ color: '#A39C91' }}>{pending.proxyNote}</div>}
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => { const r = pending; setPending(null); void analyze(r.snapshot); }} className="n-send">{t('Yes, read it', 'Sí, léelo', 'Sim, pode ler')}</button>
        <button type="button" onClick={reset} className="n-chip ghost">{t('No', 'No', 'Não')}</button>
      </div>
    </div>
  ) : null;

  const subscribe = async () => {
    setBilling({ busy: true, error: null });
    const err = await startBilling('checkout');
    if (err) setBilling({ busy: false, error: err });
  };
  const meterLine = meter && meter.paywall && meter.tier !== 'pro' && meter.remaining !== null && meter.limit !== null
    ? meter.tier === 'anon'
      ? t(`${meter.remaining} of ${meter.limit} reads left without an account`, `Te quedan ${meter.remaining} de ${meter.limit} lecturas sin cuenta`, `${meter.remaining === 1 ? 'Resta' : 'Restam'} ${meter.remaining} de ${meter.limit} leituras sem conta`)
      : t(`${meter.remaining} of ${meter.limit} free reads left this week`, `Te quedan ${meter.remaining} de ${meter.limit} lecturas gratis esta semana`, `${meter.remaining === 1 ? 'Resta' : 'Restam'} ${meter.remaining} de ${meter.limit} leituras grátis nesta semana`)
    : null;

  const errorStage = phase === 'error' ? (
    <div className="flex flex-col items-center">
      <NucleoSphere size={desktop ? 220 : 170} mode="idle" />
      <p className="n-caption mt-12" role="alert">{deskError ?? lastBobby}</p>
      {deskRetry && (
        <button type="button" className="n-send mt-6" onClick={() => retry(deskRetry)}>
          {deskRetry.level === deskLevel ? t('Try again', 'Reintentar', 'Tentar de novo') : t(`Continue with ${levelName(deskRetry.level)}`, `Seguir con ${levelName(deskRetry.level)}`, `Continuar com ${levelName(deskRetry.level)}`)}
        </button>
      )}
    </div>
  ) : null;

  // After a read: the CIO's own follow-up question first (it runs as a new question on the same asset),
  // then another question of the reader's, then their other assets.
  const followUp = done && snapshot && !agentsFailed ? agents?.synthesis?.followUp ?? null : null;
  const howLooks = (sym: string) => t(`How does ${sym} look?`, `¿Cómo se ve ${sym}?`, `Como está ${sym}?`);
  const suggestions: Array<{ label: string; go: () => void }> = done && snapshot
    ? [
      ...(followUp ? [{ label: followUp, go: () => { void ask(followUp.toUpperCase().includes(snapshot.symbol) ? followUp : `${snapshot.symbol} · ${followUp}`, followUp); } }] : []),
      { label: t(`Another question about ${snapshot.symbol}`, `Otra pregunta sobre ${snapshot.symbol}`, `Outra pergunta sobre ${snapshot.symbol}`), go: () => { setInput(`${snapshot.symbol} `); inputRef.current?.focus(); } },
      ...progress.quickAccess.filter((q) => q !== snapshot.symbol).slice(0, followUp ? 1 : 2).map((sym) => ({ label: howLooks(sym), go: () => { void ask(sym, howLooks(sym)); } })),
    ]
    : progress.quickAccess.slice(0, 3).map((sym) => ({ label: howLooks(sym), go: () => { void ask(sym, howLooks(sym)); } }));
  const chips = !reading && phase !== 'confirm' ? (
    <div className="w-full">
      {meterLine && <div className="mb-4 text-center text-[13px]" style={{ color: '#8A8378' }}>{meterLine}</div>}
      <div className="n-label mb-3 text-center">{t('You might want to ask', 'Quizá quieras preguntar', 'Talvez você queira perguntar')}</div>
      <div className="n-chips">
        {suggestions.map((c, i) => (
          <button key={c.label} type="button" className={`n-chip ${i === 0 ? '' : 'dim'}`} onClick={() => { sfxTock(); c.go(); }}>{c.label}</button>
        ))}
        <button type="button" className="n-chip ghost" onClick={() => { sfxTock(); setSheet('board'); }}>{t('Explore markets', 'Explorar mercados', 'Explorar mercados')}</button>
      </div>
    </div>
  ) : null;

  const dock = (
    <div className="n-dock">
      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="n-ask mx-auto w-full max-w-[620px]">
        <input ref={inputRef} data-desk-input value={input} onChange={(e) => setInput(e.target.value)} aria-label={t('Ask about an asset', 'Pregunta por un activo', 'Pergunte sobre um ativo')} placeholder={listening ? t('Listening…', 'Escuchando…', 'Ouvindo…') : t('Ask about any stock or crypto…', 'Pregunta por una acción o cripto…', 'Pergunte sobre ação ou cripto…')} />
        <LevelControl level={deskLevel} onChange={setDeskLevel} state={accessState} disabled={working}
          onSignIn={() => { setSigninNote(null); setSignInPrompt(true); }} onInvite={() => { setInviteOpen(true); void fetchAccess().then((st) => { if (st) setAccessState(st); }); }} />
        {input.trim() && !working && <button type="submit" className="n-send" aria-label={t('Ask', 'Preguntar', 'Perguntar')}><ArrowRight size={16} /></button>}
        <span className={`n-mic-wrap ${listening ? 'on' : ''}`}><span className="n-mic-glow" aria-hidden="true"><i /></span><button type="button" onClick={toggleDictation} aria-label={listening ? t('Stop listening', 'Dejar de escuchar', 'Parar de ouvir') : t('Talk to Bobby', 'Hablar con Bobby', 'Falar com o Bobby')} className={`n-mic ${listening ? 'on' : ''}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button></span>
      </form>
    </div>
  );

  return (
    <div className="n-desk">
      {header}
      {/* keeps progress sync (and the wallet credential) configured even while the profile is closed */}
      <div hidden><ProgressSync /></div>
      <main className="n-stage">
        {proNotice && (
          <div className="n-notice" role="status">
            <span>{proNotice === 'welcome'
              ? (meter?.tier === 'pro' ? t('Welcome to Bobby Pro. Unlimited reads.', 'Bienvenido a Bobby Pro. Lecturas sin límite.', 'Boas-vindas ao Bobby Pro. Leituras ilimitadas.') : t('Payment received. Activating Bobby Pro…', 'Pago recibido. Activando Bobby Pro…', 'Pagamento recebido. Ativando o Bobby Pro…'))
              : t('Checkout cancelled. Nothing was charged.', 'Pago cancelado. No se cobró nada.', 'Pagamento cancelado. Nada foi cobrado.')}</span>
            <button type="button" aria-label={t('Close', 'Cerrar', 'Fechar')} onClick={() => setProNotice(null)}><X size={14} /></button>
          </div>
        )}
        {inviteNotice && (
          <div className="n-notice" role="status">
            <span>{inviteNotice}</span>
            <button type="button" aria-label={t('Close', 'Cerrar', 'Fechar')} onClick={() => setInviteNotice(null)}><X size={14} /></button>
          </div>
        )}
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
            onSignedOut={() => { setSheet('none'); void fetchAccess().then((st) => { if (st) setAccessState(st); }); }}
            onToggleVoiceMode={() => { voice.stop(); closeRecognition(); setFreeVoice((v) => !v); setVoiceNotice(''); }}
            onToggleSpeak={() => setSpeakEnabled((v) => { if (v) voice.stop(); return !v; })}
            onToggleSounds={() => { setSfxMuted(!muted); setMuted(!muted); }}
            pro={{
              label: meter?.tier === 'pro' ? t('Bobby Pro · active', 'Bobby Pro · activo', 'Bobby Pro · ativo') : 'Bobby Pro',
              detail: meter?.tier === 'pro'
                ? (accessState?.subscription?.provider === 'apple' ? t('Managed in the App Store on your iPhone', 'Se administra en la App Store de tu iPhone', 'Gerenciado na App Store do seu iPhone') : t('Manage or cancel', 'Administrar o cancelar', 'Gerenciar ou cancelar'))
                : meterLine ?? (accessState && !accessState.payments.stripe
                  ? t('Coming to the web · earn it by inviting friends', 'Muy pronto en la web · gánalo invitando amigos', 'Em breve na web · ganhe convidando amigos')
                  : t('Unlimited reads · $5/month', 'Lecturas sin límite · $5/mes', 'Leituras ilimitadas · $5/mês')),
              action: () => {
                if (meter?.tier === 'pro') { if (accessState?.subscription?.provider === 'stripe') void startBilling('portal'); return; }
                if (!accessState?.signedIn) { setSheet('none'); setSignInPrompt(true); return; }
                // Web checkout is off until Stripe is live: a tap must still lead somewhere, and the invite is how Pro is earned today.
                if (!accessState.payments.stripe) { setSheet('none'); setInviteOpen(true); void fetchAccess().then((st) => { if (st) setAccessState(st); }); return; }
                void subscribe();
              },
            }}
            invite={{
              label: t('Invite friends', 'Invita amigos', 'Convide amigos'),
              detail: accessState?.referral
                ? t(`${accessState.referral.accepted}/${accessState.referral.max} · Bobby Pro for each friend`, `${accessState.referral.accepted}/${accessState.referral.max} · Bobby Pro por cada amigo`, `${accessState.referral.accepted}/${accessState.referral.max} · Bobby Pro por cada amigo`)
                : t('Bobby Pro for each friend who joins', 'Bobby Pro por cada amigo que se une', 'Bobby Pro por cada amigo que entra'),
              action: () => { setSheet('none'); setInviteOpen(true); void fetchAccess().then((st) => { if (st) setAccessState(st); }); },
            }}
            onReset={() => { if (window.confirm(t('Reset XP, gear and avatar on this browser?', '¿Reiniciar XP, equipo y avatar en este navegador?', 'Zerar XP, equipamento e avatar neste navegador?'))) progressStore.reset(); }}
          />
        )}
        {sheet === 'board' && <BoardSheet key="board" onPick={(s) => { setSheet('none'); void ask(s); }} onClose={() => setSheet('none')} />}
        {signInPrompt && !evolution && !drops[0] && sheet === 'none' && <SignInPrompt key="signin-prompt" xp={progress.xp} note={signinNote ?? undefined} onClose={() => { setSignInPrompt(false); setSigninNote(null); }} />}
        {sheet === 'catalog' && <GearCatalog key="catalog" current={companion} xp={progress.xp} level={level.number} onClose={() => setSheet('profile')} />}
        {sheet === 'swap' && <SwapSheet key="swap" initialSymbol={snapshot?.symbol ?? null} onClose={() => setSheet('none')} />}
        {sheet === 'pet' && (() => { const pet = petFor(companion.id); const has = petUnlocked(progress.xp); return pet ? (
          <motion.div key="pet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onClick={() => setSheet('profile')}>
            <div className="n-card w-full max-w-md space-y-3 rounded-b-none p-6 text-center md:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
              <div className="text-7xl" style={{ filter: has ? 'none' : 'grayscale(1)' }}>{pet.emoji}</div>
              <div className="n-display text-2xl">{pick(pet.name)}</div>
              <div className="text-sm" style={{ color: '#A39C91' }}>{has ? (pet.spins ? t('Spins next to your avatar.', 'Gira junto a tu avatar.', 'Gira ao lado do seu avatar.') : t("Lives at your avatar's feet.", 'Vive a los pies de tu avatar.', 'Vive aos pés do seu avatar.')) : t(`Unlocks at ${PET_UNLOCK_XP} XP · you have ${progress.xp}. Discipline only.`, `Se desbloquea a ${PET_UNLOCK_XP} XP · llevas ${progress.xp}. Solo disciplina.`, `Desbloqueia com ${PET_UNLOCK_XP} XP · você tem ${progress.xp}. Só com disciplina.`)}</div>
            </div>
          </motion.div>) : null; })()}
        {sheet === 'risk' && (
          <motion.div key="risk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0B0A09' }}><NucleoRisk readOnly onClose={() => setSheet('profile')} /></motion.div>
        )}
        {inspected && <ToolDetail key="tool" companion={companion} tool={inspected} xp={progress.xp} onClose={() => setInspected(null)} />}
        {evolution && <EvolutionOverlay key="evo" companion={companion} level={evolution} onDone={() => { const name = companionName(companion, evolution.number); say(t(`I evolved. Call me ${name} now.`, `Evolucioné. Ahora dime ${name}.`, `Evoluí. Agora me chame de ${name}.`), false); setEvolution(null); }} />}
        {/* A new tool: open the profile so the avatar is seen putting it on. */}
        {!evolution && drops[0] && <ToolUnlockOverlay key="drop" companion={companion} tool={drops[0]} onDone={() => { const tool = drops[0]; setDrops((d) => d.slice(1)); if (toolHasArt(tool)) { setSheet('profile'); setTimeout(() => setEquip((e) => ({ url: toolArt(tool), token: e.token + 1 })), 520); } }} />}
      </AnimatePresence>

      <LimitDialog limit={limit} state={accessState} billing={billing} onClose={() => setLimit(null)}
        onSignIn={() => {
          const lv = limit?.level ?? 'rapido';
          setSigninNote({
            title: t('Create your free account to keep going.', 'Crea tu cuenta gratis para seguir.', 'Crie sua conta grátis para continuar.'),
            body: lv === 'rapido'
              ? t('Your question runs as soon as you are in.', 'Tu pregunta corre en cuanto entres.', 'Sua pergunta roda assim que você entrar.')
              : t(`${levelName(lv)} is part of your free account.`, `${levelName(lv)} viene con tu cuenta gratis.`, `${levelName(lv)} vem com sua conta grátis.`),
          });
          setLimit(null); setSheet('none'); setSignInPrompt(true);
        }}
        onSubscribe={() => void subscribe()} onLevel={setDeskLevel} />
      <Dialog.Root open={inviteOpen} onOpenChange={setInviteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="n-dlg-overlay" />
          <Dialog.Content className="n-dlg" aria-describedby={undefined}>
            <Dialog.Close className="n-dlg-x" aria-label={t('Close', 'Cerrar', 'Fechar')}><X size={15} /></Dialog.Close>
            <div className="n-label">Bobby Pro</div>
            <Dialog.Title className="n-dlg-title">{t('Invite friends, get Bobby Pro.', 'Invita amigos, gana Bobby Pro.', 'Convide amigos, ganhe Bobby Pro.')}</Dialog.Title>
            <InvitePanel state={accessState} onSignIn={() => { setInviteOpen(false); setSigninNote(null); setSignInPrompt(true); }} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
        setSections([[t('Crypto', 'Cripto', 'Cripto'), b.crypto], [t('Stocks & ETFs', 'Acciones y ETFs', 'Ações e ETFs'), b.equity], [t('Metals', 'Metales', 'Metais'), b.commodity]].filter(([, rows]) => rows?.length).map(([title, rows]) => ({ title: title as string, rows: (rows as Array<{ symbol: string; name: string; last: number | null }>).slice(0, 24) })));
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
              <Dialog.Title className="n-display text-[24px]">{t('Explore markets', 'Explorar mercados', 'Explorar mercados')}</Dialog.Title>
              <Dialog.Close aria-label={t('Close', 'Cerrar', 'Fechar')} className="n-iconbtn"><X size={16} /></Dialog.Close>
            </div>
            <div className="n-ask"><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search assets', 'Buscar activos', 'Buscar ativos')} placeholder={t('Name or ticker…', 'Nombre o ticker…', 'Nome ou ticker…')} /></div>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5">
            {q.trim().length >= 2
              ? (hits.length === 0 ? <div className="text-[14px]" style={{ color: '#8A8378' }}>{t('Nothing yet — keep typing; Bobby resolves typos.', 'Nada aún — sigue escribiendo; Bobby resuelve typos.', 'Nada ainda — continue digitando; o Bobby entende erros de digitação.')}</div> : <div>{hits.map((h) => row(h.symbol, h.name, h.assetClass))}</div>)
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
