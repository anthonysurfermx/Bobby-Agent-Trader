// ============================================================
// VoiceRoom — "Bobby Live Desk".
// A private call with a trader: voice on the left, the market he's talking
// about on the right, and his current call pinned along the bottom.
// Nothing here can move capital — trades surface as proposals the human confirms.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mic, MicOff, X, ChevronDown } from 'lucide-react';
import { useRealtimeVoice, type VoiceState } from '@/hooks/useRealtimeVoice';
import { getVoiceAsset, isEquitySymbol } from '@/lib/voice-assets';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { lang as interfaceLanguage, speechLocale, t as ui, type Lang } from '@/lib/companions/i18n';
import { appLanguage, appLocale, isAppLanguage } from '@/lib/app-language';
import { useProgress } from '@/lib/companions/progress';
import { COMPANIONS, getCompanion, wornGear, toolHasArt, toolArt, toolSlot, petUnlocked, petFor, petArt } from '@/lib/companions/data';
import { voiceScreenState } from '@/lib/realtime-context';
import SignInPrompt from '@/components/companion/SignInPrompt';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { MarketCanvas, type Timeframe } from './MarketCanvas';

/** How the desk labels the asset on screen: "Nvidia · NVDA" for equities,
 *  "BTC/USDT" for crypto — never "NVDA/USDT" (equities aren't a USDT pair). */
function assetLabel(symbol: string): string {
  const asset = getVoiceAsset(symbol);
  // Unknown symbols are venue-neutral until MarketCanvas probes the feeds.
  // This avoids showing an uncurated equity such as TSM as "TSM/USDT".
  if (!asset) return symbol;
  if (isEquitySymbol(symbol)) return `${asset.name} · ${symbol}`;
  return `${symbol}/USDT`;
}

function voiceStateCopy(state: VoiceState): { label: string; hint: string } {
  const copy: Record<VoiceState, { label: string; hint: string }> = {
    idle: { label: ui('Idle', "En reposo"), hint: ui('Tap the microphone and talk to Bobby', "Toca el micrófono y habla con Bobby") },
    connecting: { label: ui('Connecting', "Conectando"), hint: ui('Opening a secure voice session…', "Abriendo una sesión de voz segura…") },
    listening: { label: ui('Listening', "Escuchando"), hint: ui('Speak naturally — interrupt whenever you want', "Habla con naturalidad; interrumpe cuando quieras") },
    thinking: { label: ui('Processing', "Procesando"), hint: ui('Cross-checking data while Bobby responds', "Contrastando datos mientras Bobby responde") },
    speaking: { label: ui('Bobby is speaking', "Bobby habla"), hint: ui('Interrupt whenever you want', "Interrumpe cuando quieras") },
    error: { label: ui('Voice paused', "Voz en pausa"), hint: ui('Try connecting again', "Intenta conectar de nuevo") },
  };
  return copy[state];
}

const VERDICT_STYLE: Record<string, string> = {
  buy: 'text-green-400 border-green-400/40 bg-green-400/10',
  sell: 'text-red-400 border-red-400/40 bg-red-400/10',
  avoid: 'text-red-400 border-red-400/40 bg-red-400/10',
  wait: 'text-[#fcc025] border-[#fcc025]/40 bg-[#fcc025]/10',
};


function playActivationChime() {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    gain.connect(ctx.destination);
    [523.25, 783.99].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      oscillator.connect(gain); oscillator.start(ctx.currentTime + index * 0.055); oscillator.stop(ctx.currentTime + 0.22);
    });
    window.setTimeout(() => void ctx.close(), 400);
  } catch { /* optional feedback */ }
}

function formatDeskNumber(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString(speechLocale(), { maximumFractionDigits: value < 10 ? 4 : 2 });
}

/** Keep the resolved interface locale and explicit market when leaving the voice room. */
function deskPath(symbol: string, timeframe: string, freeVoice = false): string {
  const query = new URLSearchParams({ symbol, timeframe, lang: interfaceLanguage(), locale: speechLocale() });
  if (freeVoice) query.set('voice', 'free');
  const country = new URLSearchParams(window.location.search).get('country');
  if (country !== null) query.set('country', country);
  return `/desk?${query.toString()}`;
}

export function VoiceRoom({ onSwitchToChat, autoStart = false }: { onSwitchToChat?: () => void; autoStart?: boolean } = {}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const progress = useProgress();
  const companion = getCompanion(progress.companionId) ?? COMPANIONS[1];
  const [languageMode, setLanguageMode] = useState<'auto' | Lang>(() => {
    try {
      const stored = localStorage.getItem('bobby_voice_language');
      return isAppLanguage(stored) ? stored : 'auto';
    } catch { return 'auto'; }
  });
  const voiceLang: Lang = languageMode === 'auto' ? interfaceLanguage() : languageMode;
  const voiceLocale = appLocale(voiceLang, speechLocale());
  const initialScreen = voiceScreenState(params.get('symbol'), params.get('timeframe'));
  const mascotLook = { ...DEFAULT_MASCOT, body: companion.palette, avatar: companion.id };
  const attachments = useMemo(() => {
    const items: Array<{ url: string; slot: string; spin?: boolean; glow?: string }> = wornGear(companion.id, progress.xp)
      .filter(toolHasArt)
      .map((tool) => ({ url: toolArt(tool), slot: toolSlot(tool), glow: tool.tier === 3 ? '#F5C542' : undefined }));
    const pet = petUnlocked(progress.xp) ? petFor(companion.id) : null;
    const art = pet ? petArt(companion.id) : null;
    if (pet && art) items.push({ url: art, slot: 'pet', spin: pet.spins });
    return items;
  }, [companion.id, progress.xp]);
  const [inputMode, setInputMode] = useState<'tap-to-talk' | 'hands-free'>('tap-to-talk');
  const {
    state, error, level, transcript, tools, proposal, fallback, needsSignIn, dismissSignIn, remainingSeconds,
    symbol, timeframe, levels, thesis, debate, deskBrief, briefState,
    connect, disconnect, startTalking, stopTalking, micMuted, setSymbol, setTimeframe,
    dismissProposal, resetConversation,
  } = useRealtimeVoice(voiceLang, inputMode, {
    voice: companion.voicePersona, locale: voiceLocale, autoLanguage: languageMode === 'auto',
    initialSymbol: initialScreen.symbol, initialTimeframe: initialScreen.timeframe,
  });
  useEffect(() => {
    if (!fallback) return;
    navigate(deskPath(symbol, timeframe, true), {
      replace: true, state: { voiceFallback: true, transcript },
    });
  }, [fallback, navigate, symbol, timeframe, transcript]);


  const live = state !== 'idle' && state !== 'error';
  const shouldAutoStart = useRef(autoStart);
  const running = tools.filter((t) => t.status === 'running');
  const railRef = useRef<HTMLDivElement>(null);
  const [chartOpenMobile, setChartOpenMobile] = useState(false);

  const activateVoice = useCallback(() => {
    if (live) { disconnect(); return; }
    playActivationChime();
    if (navigator.vibrate) navigator.vibrate(18);
    connect();
  }, [connect, disconnect, live]);

  useEffect(() => {
    if (!shouldAutoStart.current || state !== 'idle') return;
    const timer = window.setTimeout(() => {
      shouldAutoStart.current = false;
      activateVoice();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activateVoice, state]);

  const changeLanguage = (next: 'auto' | Lang) => {
    if (live) disconnect();
    resetConversation();
    setLanguageMode(next);
    localStorage.setItem('bobby_voice_language', next);
  };

  useEffect(() => {
    railRef.current?.scrollTo({ top: railRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript]);

  const copy = voiceStateCopy(state);
  const lastBobby = [...transcript].reverse().find((l) => l.role === 'bobby');

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:64px_64px]" />

      {needsSignIn && <SignInPrompt xp={progress.xp} voiceAccess onClose={() => { dismissSignIn(); navigate(deskPath(symbol, timeframe, true)); }} />}
      {/* ---- top bar ---- */}
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { disconnect(); navigate(deskPath(symbol, timeframe)); }}
            aria-label={ui('Back to desk', 'Volver al desk')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-[#0052ff]' : 'bg-white/25'}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
            {ui("Bobby · Live desk", "Bobby · Mesa en vivo")}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">
            <span>{ui("LANG", "IDIOMA")}</span>
            <select aria-label={ui('Voice language', 'Idioma de voz')} value={languageMode} onChange={(event) => changeLanguage(event.target.value as 'auto' | Lang)} className="bg-transparent text-[#7da6ff] outline-none">
              <option value="auto">{ui("AUTO", "AUTO")}</option>
              <option value="es">ES · MX</option>
              <option value="en">EN · US</option>
              <option value="fr">FR · FR</option>
              <option value="pt">PT · {appLocale('pt', speechLocale()) === 'pt-BR' ? 'BR' : 'PT'}</option>
              <option value="it">IT · IT</option>
              <option value="de">DE · DE</option>
            </select>
          </label>
          <label className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/45 sm:flex">
            <span>{ui("MIC", "MIC")}</span>
            <select value={inputMode} onChange={(event) => setInputMode(event.target.value as 'tap-to-talk' | 'hands-free')} className="bg-transparent text-[#7da6ff] outline-none">
              <option value="tap-to-talk">{ui('TAP TO TALK', 'TOCA PARA HABLAR')}</option>
              <option value="hands-free">{ui('HEADSET', 'AUDÍFONOS')}</option>
            </select>
          </label>
          {onSwitchToChat && (
            <button
              onClick={onSwitchToChat}
              title={ui('Use text when the room is noisy', 'Usa texto si hay ruido alrededor')}
              className="min-h-11 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 transition hover:border-[#0052ff]/40 hover:text-white sm:min-h-0 sm:px-3"
            >
              <span className="sm:hidden">{ui('Text', 'Texto')}</span>
              <span className="hidden sm:inline">{ui('Text · noisy room', 'Texto · ruido')}</span>
            </button>
          )}
        </div>
      </header>

      {/* ---- desk ---- */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* voice side */}
        <section className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,82,255,.10),transparent_65%)]" />

          <div className="relative flex h-[min(46vh,340px)] w-[min(46vh,340px)] shrink-0 items-center justify-center" data-companion={companion.id}>
            <BobbyMascot3D
              look={mascotLook}
              state={state === 'connecting' ? 'thinking' : state === 'error' ? 'idle' : state}
              level={state === 'speaking' ? level : null}
              size={260}
              attachments={attachments}
            />
          </div>

          {/* live caption */}
          <div className="relative mt-2 flex w-full max-w-md flex-col items-center gap-2 text-center">
            <motion.div key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#7da6ff]">
              {copy.label}
            </motion.div>
            <p className="min-h-[3.5rem] text-[15px] leading-6 text-white/80">
              {error ?? (lastBobby?.text || copy.hint)}
            </p>
          </div>

          {/* tool chips */}
          <div className="relative mt-2 flex min-h-[28px] flex-wrap justify-center gap-2">
            <AnimatePresence>
              {running.map((tool) => (
                <motion.div key={tool.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-lg border border-[#0052ff]/40 bg-[#0052ff]/15 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#7da6ff] backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />
                  {tool.label}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* mic */}
          <div className="relative mt-4 flex shrink-0 flex-col items-center gap-2">
            <button
              onClick={!live
                ? activateVoice
                : inputMode === 'tap-to-talk'
                  ? (micMuted ? startTalking : stopTalking)
                  : undefined}
              aria-label={!live
                ? (ui('Start voice session', 'Abrir sesión de voz'))
                : inputMode === 'tap-to-talk'
                  ? (micMuted ? (ui('Tap to talk', 'Toca para hablar')) : (ui('Mute microphone', 'Silenciar micrófono')))
                  : (ui('Voice session active', 'Sesión de voz activa'))}
              className={`group relative grid h-14 w-14 place-items-center rounded-full transition ${
                live ? 'scale-105 bg-[#42e6a4] text-[#04130c] shadow-[0_0_36px_rgba(66,230,164,.55)] active:scale-95' : 'bg-[#0052ff] text-white shadow-[0_0_28px_rgba(0,82,255,.45)] hover:bg-[#1c6cff] active:scale-95'
              }`}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full border border-[#0052ff]/60"
                style={{ transform: `scale(${1 + level * 0.8})`, opacity: live ? 0.9 - level * 0.5 : 0 }} />
              {live && inputMode === 'tap-to-talk' && !micMuted ? <Mic className="h-5 w-5" /> : live ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
              {live ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
                : (ui('3 voice minutes a day', '3 min de voz al día'))}
            </p>
            {live && (
              <button onClick={disconnect} className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/30 transition hover:text-white">
                {ui('End voice', 'Cerrar voz')}
              </button>
            )}
          </div>
        </section>

        {/* market side */}
        <section className="relative flex min-h-0 flex-col border-t border-white/10 p-4 lg:border-l lg:border-t-0">
          <button
            onClick={() => setChartOpenMobile((open) => !open)}
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 lg:hidden"
          >
            {assetLabel(symbol)} · {ui('Live chart', 'Gráfica en vivo')}
            <ChevronDown className={`h-4 w-4 transition ${chartOpenMobile ? 'rotate-180' : ''}`} />
          </button>
          {/* The candles are the evidence — the debate cards below never get to
              squeeze them below a height that still reads on a recording. */}
          <div className={`${chartOpenMobile ? 'block h-[52vh]' : 'hidden'} min-h-0 lg:block lg:min-h-[340px] lg:flex-1`}>
            <MarketCanvas
              symbol={symbol}
              timeframe={timeframe as Timeframe}
              levels={levels}
              debate={debate}
              language={voiceLang}
              onSymbolChange={(nextSymbol) => {
                setSymbol(nextSymbol);
              }}
              onTimeframeChange={(tf) => setTimeframe(tf)}
            />
          </div>

          <AnimatePresence mode="wait">
            {!debate && briefState.status !== 'idle' && (
              <motion.div
                key={`${briefState.symbol}-${briefState.status}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                role="status"
                aria-live="polite"
                className="mt-3 shrink-0 rounded-xl border border-[#0052ff]/30 bg-[#0052ff]/[0.07] p-3 backdrop-blur"
              >
                <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.14em]">
                  <span className="flex items-center gap-2 text-[#7da6ff]">
                    <span className={`h-1.5 w-1.5 rounded-full ${briefState.status === 'loading' ? 'animate-pulse bg-[#0052ff]' : briefState.status === 'error' ? 'bg-red-400' : 'bg-green-400'}`} />
                    {ui('Live technical read', 'Lectura técnica en vivo')}
                  </span>
                  <span className="text-white/35">
                    {briefState.status === 'ready' && briefState.elapsedMs !== null
                      ? `${((briefState.elapsedMs / 1000)).toLocaleString(speechLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s · ${ui('target <60s', 'objetivo <60s')}`
                      : briefState.status === 'loading'
                        ? (ui('chart ready · reading candles', 'gráfica lista · leyendo velas'))
                        : (ui('data unavailable', 'datos no disponibles'))}
                  </span>
                </div>

                {briefState.status === 'loading' && (
                  <p className="mt-2 text-sm leading-5 text-white/60">
                    {ui(`${briefState.symbol} is already on screen. Cross-checking price, structure and momentum…`, `${briefState.symbol} ya está en pantalla. Cruzando precio, estructura y momentum…`)}
                  </p>
                )}

                {briefState.status === 'error' && (
                  <p className="mt-2 text-sm leading-5 text-white/60">
                    {ui('The chart is still live, but the technical read did not respond. Switch assets or retry.', 'La gráfica sigue viva, pero la lectura técnica no respondió. Cambia de activo o reintenta.')}
                  </p>
                )}

                {briefState.status === 'ready' && deskBrief && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-[13px] leading-5 text-white/80">{deskBrief.summary}</p>
                      <p className="mt-1 text-[12px] leading-5 text-white/45">{deskBrief.risk}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
                      {[
                        ['RSI', formatDeskNumber(deskBrief.rsi14)],
                        [ui('SUPPORT', 'SOPORTE'), formatDeskNumber(deskBrief.support)],
                        [ui('RESIST.', 'RESIST.'), formatDeskNumber(deskBrief.resistance)],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-24 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-mono">
                          <div className="text-[8px] uppercase tracking-[0.12em] text-white/30">{label}</div>
                          <div className="mt-0.5 text-[10px] text-white/75">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* The full debate stays readable beside the price; the spoken answer
              is deliberately only the executive summary. */}
          <AnimatePresence>
            {debate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 grid shrink-0 gap-2 sm:grid-cols-3"
              >
                <div className="sm:col-span-3 flex items-center justify-between px-1">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
                    {ui('Debate in 3 reads', 'Debate en 3 lecturas')}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">
                    {ui('Bobby summary · levels on chart', 'Resumen por Bobby · niveles en gráfica')}
                  </span>
                </div>
                {([
                  {
                    key: 'alpha' as const,
                    name: 'Alpha Hunter',
                    stance: ui('the bullish case', 'el caso a favor'),
                    text: debate.alpha,
                    score: debate.alphaConviction,
                    scoreLabel: ui('conviction', 'convicción'),
                    accent: 'border-green-400/40 bg-green-400/[0.08]', dot: 'bg-green-400', tone: 'text-green-300',
                  },
                  {
                    key: 'red' as const,
                    name: 'Red Team',
                    stance: ui('the attack', 'el ataque'),
                    text: debate.redTeam,
                    score: debate.redTeamSeverity,
                    scoreLabel: ui('severity', 'severidad'),
                    accent: 'border-[#ff716a]/40 bg-[#ff716a]/[0.08]', dot: 'bg-[#ff716a]', tone: 'text-[#ff9d97]',
                  },
                  {
                    key: 'cio' as const,
                    name: 'Bobby CIO',
                    stance: ui('the final decision', 'la decisión final'),
                    text: debate.cio,
                    score: debate.cioConviction,
                    scoreLabel: ui('conviction', 'convicción'),
                    accent: 'border-yellow-300/40 bg-yellow-300/[0.08]', dot: 'bg-yellow-300', tone: 'text-yellow-200',
                  },
                ] as const).map((side) => (
                  <div key={side.name} className={`rounded-xl border p-3 backdrop-blur ${side.accent}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${side.dot}`} />
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${side.tone}`}>
                          {side.name}
                        </span>
                      </div>
                      {side.score !== null && (
                        <span className="font-mono text-[10px] text-white/40">
                          {side.scoreLabel} {side.score}%
                        </span>
                      )}
                    </div>
                    <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
                      {side.stance}
                    </div>
                    <p className="max-h-24 min-h-[3.75rem] overflow-y-auto text-[13px] leading-5 text-white/75">{side.text || (ui('Waiting for analysis…', 'Esperando análisis…'))}</p>
                    {/* Ties the card to the line of the same colour on the chart. */}
                    {(() => {
                      const line = debate.levels.find((level) => level.agent === side.key);
                      return line ? (
                        <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/10 pt-2 font-mono text-[10px]">
                          <span className="uppercase tracking-[0.1em] text-white/30">{line.label}</span>
                          <span className={side.tone}>
                            {line.price.toLocaleString(speechLocale(), { maximumFractionDigits: line.price < 10 ? 4 : 2 })}
                          </span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* transcript rail */}
          <div ref={railRef} className={`mt-3 hidden max-h-[16vh] flex-col gap-2 overflow-y-auto pr-1 ${debate ? '' : 'xl:flex'}`}>
            {transcript.slice(-4).map((line, index) => (
              <div key={`${line.id}-${index}`}
                className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
                  line.role === 'bobby' ? 'border-[#0052ff]/30 bg-[#0052ff]/[0.08] text-white/75' : 'border-white/10 bg-white/[0.03] text-white/50'
                }`}>
                <span className="mr-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
                  {line.role === 'bobby' ? 'Bobby' : ui('You', 'Tú')}
                </span>
                {line.text}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- verdict bar ---- */}
      <footer className="relative z-20 shrink-0 border-t border-white/10 bg-[#08080c]/90 px-5 py-3 backdrop-blur lg:px-6">
        {thesis ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] ${VERDICT_STYLE[thesis.verdict] ?? VERDICT_STYLE.wait}`}>
              {({ buy: ui('Buy', 'Comprar'), sell: ui('Sell', 'Vender'), avoid: ui('Avoid', 'Evitar'), wait: ui('Wait', 'Esperar') })[thesis.verdict] ?? thesis.verdict}
            </span>
            {thesis.conviction !== null && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{ui('Conviction', 'Convicción')}</span>
                <span className="font-mono text-sm font-bold text-white">{thesis.conviction}%</span>
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-sm text-white/70">{thesis.reason}</p>
            {thesis.invalidation && (
              <span className="hidden font-mono text-[10px] text-white/35 xl:inline">
                {ui('Invalidates', 'Invalida')}: {thesis.invalidation}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            {ui('No verdict yet — ask Bobby about an asset', 'Sin veredicto todavía — pregúntale a Bobby por un activo')}
          </div>
        )}
      </footer>

      {/* ---- trade proposal: the confirmation gate ---- */}
      <AnimatePresence>
        {proposal && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            className="absolute bottom-20 left-1/2 z-40 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border border-[#0052ff]/50 bg-[#0b0b12]/95 p-6 shadow-[0_30px_90px_rgba(0,82,255,0.28)] backdrop-blur-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7da6ff]">
                {ui('Proposal · requires your confirmation', 'Propuesta · requiere tu confirmación')}
              </div>
              <button onClick={dismissProposal} aria-label={ui('Dismiss proposal', 'Descartar propuesta')} className="text-white/35 transition hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold tracking-[-0.05em]">{proposal.symbol}</span>
              <span className={`font-mono text-sm uppercase ${proposal.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {proposal.direction === 'long' ? ui('Long', 'Largo') : ui('Short', 'Corto')}
              </span>
            </div>
            {proposal.rationale && <p className="mb-5 text-sm leading-6 text-white/60">{proposal.rationale}</p>}
            <div className="mb-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 font-mono text-xs">
              {([[ui('Size', 'Tamaño'), proposal.size_usd ? `$${formatDeskNumber(proposal.size_usd)}` : '—'],
                 [ui('Entry', 'Entrada'), proposal.entry === null ? '—' : formatDeskNumber(proposal.entry)],
                 [ui('Stop', 'Stop'), proposal.stop === null ? '—' : formatDeskNumber(proposal.stop)]] as const).map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 uppercase tracking-[0.12em] text-white/35">{label}</div>
                  <div className="text-white/85">{value}</div>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] leading-5 text-white/40">
              {ui('Bobby cannot execute this order. If you choose to act, place it yourself on your exchange.', 'Bobby no puede ejecutar esta orden. Si decides tomarla, colócala tú en tu exchange.')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
