// ============================================================
// VoiceRoom — "Bobby Live Desk".
// A private call with a trader: voice on the left, the market he's talking
// about on the right, and his current call pinned along the bottom.
// Nothing here can move capital — trades surface as proposals the human confirms.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, ShieldCheck, X, ChevronDown } from 'lucide-react';
import { useRealtimeVoice, type VoiceState } from '@/hooks/useRealtimeVoice';
import { getVoiceAsset, isEquitySymbol } from '@/lib/voice-assets';
import { LiveOrb } from './LiveOrb';
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

const STATE_COPY: Record<VoiceState, { label: string; hint: string }> = {
  idle: { label: 'En reposo', hint: 'Toca el micrófono y háblale a Bobby' },
  connecting: { label: 'Conectando', hint: 'Abriendo sesión de voz segura…' },
  listening: { label: 'Escuchando', hint: 'Habla normal — puedes interrumpirlo cuando quieras' },
  thinking: { label: 'Procesando', hint: 'Cruzando datos mientras te responde' },
  speaking: { label: 'Bobby habla', hint: 'Interrúmpelo si quieres' },
  error: { label: 'Enlace caído', hint: 'Reintenta la conexión' },
};

const VERDICT_STYLE: Record<string, string> = {
  buy: 'text-green-400 border-green-400/40 bg-green-400/10',
  sell: 'text-red-400 border-red-400/40 bg-red-400/10',
  avoid: 'text-red-400 border-red-400/40 bg-red-400/10',
  wait: 'text-[#fcc025] border-[#fcc025]/40 bg-[#fcc025]/10',
};

const VERDICT_LABEL: Record<string, string> = {
  buy: 'Comprar', sell: 'Vender', avoid: 'Evitar', wait: 'Esperar',
};

const AGENTS = [
  { key: 'alpha' as const, name: 'Alpha Hunter', roleEs: 'busca el setup', roleEn: 'finds the setup' },
  { key: 'red' as const, name: 'Red Team', roleEs: 'ataca la tesis', roleEn: 'attacks the thesis' },
  { key: 'cio' as const, name: 'CIO', roleEs: 'decide', roleEn: 'decides' },
];

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

export function VoiceRoom({ onSwitchToChat }: { onSwitchToChat?: () => void } = {}) {
  const [voiceLang, setVoiceLang] = useState<'es' | 'en'>(() => {
    try { return localStorage.getItem('bobby_lang') === 'en' ? 'en' : 'es'; } catch { return 'es'; }
  });
  const {
    state, error, level, transcript, tools, proposal,
    symbol, timeframe, levels, thesis, debate,
    connect, disconnect, setSymbol, setTimeframe, dismissProposal,
  } = useRealtimeVoice(voiceLang);

  const live = state !== 'idle' && state !== 'error';
  const debating = tools.some((t) => t.tool === 'run_debate' && t.status === 'running');
  const running = tools.filter((t) => t.status === 'running');
  const railRef = useRef<HTMLDivElement>(null);
  const [chartOpenMobile, setChartOpenMobile] = useState(false);

  const activateVoice = useCallback(() => {
    if (live) { disconnect(); return; }
    playActivationChime();
    if (navigator.vibrate) navigator.vibrate(18);
    connect();
  }, [connect, disconnect, live]);

  const changeLanguage = (next: 'es' | 'en') => {
    setVoiceLang(next);
    localStorage.setItem('bobby_lang', next);
    if (live) disconnect();
  };

  useEffect(() => {
    railRef.current?.scrollTo({ top: railRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript]);

  const copy = STATE_COPY[state];
  const lastBobby = [...transcript].reverse().find((l) => l.role === 'bobby');

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:64px_64px]" />

      {/* ---- top bar ---- */}
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-[#0052ff]' : 'bg-white/25'}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
            Bobby · Live desk
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">
            <span>LANG</span>
            <select value={voiceLang} onChange={(event) => changeLanguage(event.target.value as 'es' | 'en')} className="bg-transparent text-[#7da6ff] outline-none">
              <option value="es">ES · MX</option>
              <option value="en">EN · US</option>
            </select>
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 backdrop-blur">
            <ShieldCheck className="h-3 w-3 text-[#7da6ff]" />
            <span className="hidden sm:inline">Bobby no ejecuta · tú confirmas</span>
            <span className="sm:hidden">Tú confirmas</span>
          </div>
          {onSwitchToChat && (
            <button
              onClick={onSwitchToChat}
              title={voiceLang === 'es' ? 'Usa texto si hay ruido alrededor' : 'Use text when the room is noisy'}
              className="min-h-11 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 transition hover:border-[#0052ff]/40 hover:text-white sm:min-h-0 sm:px-3"
            >
              <span className="sm:hidden">{voiceLang === 'es' ? 'Texto' : 'Text'}</span>
              <span className="hidden sm:inline">{voiceLang === 'es' ? 'Texto · ruido' : 'Text · noisy room'}</span>
            </button>
          )}
        </div>
      </header>

      {/* ---- desk ---- */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* voice side */}
        <section className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,82,255,.10),transparent_65%)]" />

          {/* agents */}
          <div className="absolute left-4 top-4 z-20 flex flex-col gap-2">
            {AGENTS.map((agent, index) => (
              <motion.div
                key={agent.key}
                animate={debating ? { opacity: [0.4, 1, 0.4] } : { opacity: 0.4 }}
                transition={debating ? { duration: 1.6, repeat: Infinity, delay: index * 0.25 } : undefined}
                className="rounded-lg border border-white/10 bg-[#0b0b12]/70 px-3 py-2 backdrop-blur"
              >
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#7da6ff]">{agent.name}</div>
                <div className="font-mono text-[9px] text-white/30">{voiceLang === 'es' ? agent.roleEs : agent.roleEn}</div>
                <div className="mt-1 font-mono text-[8px] text-white/20">{voiceLang === 'es' ? 'Bobby · voz única MX' : 'Bobby · single voice'}</div>
              </motion.div>
            ))}
          </div>

          <div className="relative h-[min(46vh,340px)] w-[min(46vh,340px)] shrink-0">
            <LiveOrb state={state} level={level} />
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
              onClick={activateVoice}
              aria-label={live ? 'Cerrar sesión de voz' : 'Abrir sesión de voz'}
              className={`group relative grid h-14 w-14 place-items-center rounded-full transition ${
                live ? 'scale-105 bg-[#42e6a4] text-[#04130c] shadow-[0_0_36px_rgba(66,230,164,.55)] hover:bg-[#ff716a] hover:text-white' : 'bg-[#0052ff] text-white shadow-[0_0_28px_rgba(0,82,255,.45)] hover:bg-[#1c6cff] active:scale-95'
              }`}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full border border-[#0052ff]/60"
                style={{ transform: `scale(${1 + level * 0.8})`, opacity: live ? 0.9 - level * 0.5 : 0 }} />
              {live ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
              {live ? (voiceLang === 'es' ? 'ACTIVO · toca para desconectar' : 'ACTIVE · tap to disconnect') : (voiceLang === 'es' ? 'TOCA PARA ACTIVAR · análisis, no asesoría' : 'TAP TO ACTIVATE · analysis, not advice')}
            </p>
          </div>
        </section>

        {/* market side */}
        <section className="relative flex min-h-0 flex-col border-t border-white/10 p-4 lg:border-l lg:border-t-0">
          <button
            onClick={() => setChartOpenMobile((open) => !open)}
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 lg:hidden"
          >
            {assetLabel(symbol)} · gráfica en vivo
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
                    {voiceLang === 'es' ? 'Debate en 3 lecturas' : 'Debate in 3 reads'}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">
                    {voiceLang === 'es' ? 'Resumen por Bobby · niveles en gráfica' : 'Bobby summary · levels on chart'}
                  </span>
                </div>
                {([
                  {
                    key: 'alpha' as const,
                    name: 'Alpha Hunter',
                    stance: voiceLang === 'es' ? 'el caso a favor' : 'the bullish case',
                    text: debate.alpha,
                    score: debate.alphaConviction,
                    scoreLabel: voiceLang === 'es' ? 'convicción' : 'conviction',
                    accent: 'border-green-400/40 bg-green-400/[0.08]', dot: 'bg-green-400', tone: 'text-green-300',
                  },
                  {
                    key: 'red' as const,
                    name: 'Red Team',
                    stance: voiceLang === 'es' ? 'el ataque' : 'the attack',
                    text: debate.redTeam,
                    score: debate.redTeamSeverity,
                    scoreLabel: voiceLang === 'es' ? 'severidad' : 'severity',
                    accent: 'border-[#ff716a]/40 bg-[#ff716a]/[0.08]', dot: 'bg-[#ff716a]', tone: 'text-[#ff9d97]',
                  },
                  {
                    key: 'cio' as const,
                    name: 'Bobby CIO',
                    stance: voiceLang === 'es' ? 'la decisión final' : 'the final decision',
                    text: debate.cio,
                    score: debate.cioConviction,
                    scoreLabel: voiceLang === 'es' ? 'convicción' : 'conviction',
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
                    <p className="max-h-24 min-h-[3.75rem] overflow-y-auto text-[13px] leading-5 text-white/75">{side.text || (voiceLang === 'es' ? 'Esperando análisis…' : 'Waiting for analysis…')}</p>
                    {/* Ties the card to the line of the same colour on the chart. */}
                    {(() => {
                      const line = debate.levels.find((level) => level.agent === side.key);
                      return line ? (
                        <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/10 pt-2 font-mono text-[10px]">
                          <span className="uppercase tracking-[0.1em] text-white/30">{line.label}</span>
                          <span className={side.tone}>
                            {line.price.toLocaleString('en-US', { maximumFractionDigits: line.price < 10 ? 4 : 2 })}
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
                  {line.role === 'bobby' ? 'Bobby' : 'Tú'}
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
              {VERDICT_LABEL[thesis.verdict] ?? thesis.verdict}
            </span>
            {thesis.conviction !== null && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Convicción</span>
                <span className="font-mono text-sm font-bold text-white">{thesis.conviction}%</span>
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-sm text-white/70">{thesis.reason}</p>
            {thesis.invalidation && (
              <span className="hidden font-mono text-[10px] text-white/35 xl:inline">
                Invalida: {thesis.invalidation}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            Sin veredicto todavía — pregúntale a Bobby por un activo
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
                Propuesta · requiere tu confirmación
              </div>
              <button onClick={dismissProposal} aria-label="Descartar propuesta" className="text-white/35 transition hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold tracking-[-0.05em]">{proposal.symbol}</span>
              <span className={`font-mono text-sm uppercase ${proposal.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {proposal.direction}
              </span>
            </div>
            {proposal.rationale && <p className="mb-5 text-sm leading-6 text-white/60">{proposal.rationale}</p>}
            <div className="mb-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 font-mono text-xs">
              {([['Tamaño', proposal.size_usd ? `$${proposal.size_usd}` : '—'],
                 ['Entrada', proposal.entry ?? '—'],
                 ['Stop', proposal.stop ?? '—']] as const).map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 uppercase tracking-[0.12em] text-white/35">{label}</div>
                  <div className="text-white/85">{value}</div>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] leading-5 text-white/40">
              Bobby no puede ejecutar esta orden. Si la quieres tomar, colócala tú en tu exchange.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
