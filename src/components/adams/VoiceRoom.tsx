// ============================================================
// VoiceRoom — "Bobby Live Desk".
// A private call with a trader: voice on the left, the market he's talking
// about on the right, and his current call pinned along the bottom.
// Nothing here can move capital — trades surface as proposals the human confirms.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, ShieldCheck, X, ChevronDown } from 'lucide-react';
import { useRealtimeVoice, type VoiceState } from '@/hooks/useRealtimeVoice';
import { LiveOrb } from './LiveOrb';
import { MarketCanvas, type Timeframe } from './MarketCanvas';

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
  { key: 'alpha', name: 'Alpha Hunter', role: 'busca el setup' },
  { key: 'red', name: 'Red Team', role: 'ataca la tesis' },
  { key: 'cio', name: 'CIO', role: 'decide' },
];

export function VoiceRoom({ onSwitchToChat }: { onSwitchToChat?: () => void } = {}) {
  const {
    state, error, level, transcript, tools, proposal,
    symbol, timeframe, levels, thesis, debate,
    connect, disconnect, setTimeframe, dismissProposal,
  } = useRealtimeVoice('es');

  const live = state !== 'idle' && state !== 'error';
  const debating = tools.some((t) => t.tool === 'run_debate' && t.status === 'running');
  const running = tools.filter((t) => t.status === 'running');
  const railRef = useRef<HTMLDivElement>(null);
  const [chartOpenMobile, setChartOpenMobile] = useState(false);

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
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 backdrop-blur">
            <ShieldCheck className="h-3 w-3 text-[#7da6ff]" />
            <span className="hidden sm:inline">Bobby no ejecuta · tú confirmas</span>
            <span className="sm:hidden">Tú confirmas</span>
          </div>
          {onSwitchToChat && (
            <button
              onClick={onSwitchToChat}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 transition hover:text-white"
            >
              Chat
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
                <div className="font-mono text-[9px] text-white/30">{agent.role}</div>
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
              onClick={live ? disconnect : connect}
              aria-label={live ? 'Cerrar sesión de voz' : 'Abrir sesión de voz'}
              className={`group relative grid h-14 w-14 place-items-center rounded-full transition ${
                live ? 'bg-white text-black hover:bg-[#0052ff] hover:text-white' : 'bg-[#0052ff] text-white hover:bg-[#0045d8]'
              }`}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full border border-[#0052ff]/60"
                style={{ transform: `scale(${1 + level * 0.8})`, opacity: live ? 0.9 - level * 0.5 : 0 }} />
              {live ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
              Análisis, no asesoría · récord simulado
            </p>
          </div>
        </section>

        {/* market side */}
        <section className="relative flex min-h-0 flex-col border-t border-white/10 p-4 lg:border-l lg:border-t-0">
          <button
            onClick={() => setChartOpenMobile((open) => !open)}
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 lg:hidden"
          >
            {symbol}/USDT · gráfica en vivo
            <ChevronDown className={`h-4 w-4 transition ${chartOpenMobile ? 'rotate-180' : ''}`} />
          </button>
          <div className={`${chartOpenMobile ? 'block h-[52vh]' : 'hidden'} min-h-0 lg:block lg:flex-1`}>
            <MarketCanvas
              symbol={symbol}
              timeframe={timeframe as Timeframe}
              levels={levels}
              onTimeframeChange={(tf) => setTimeframe(tf)}
            />
          </div>

          {/* the debate, made readable next to the price it is about */}
          <AnimatePresence>
            {debate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                {([
                  {
                    name: 'Alpha Hunter',
                    stance: 'el caso a favor',
                    text: debate.alpha,
                    score: debate.alphaConviction,
                    scoreLabel: 'convicción',
                    accent: 'border-[#0052ff]/40 bg-[#0052ff]/[0.10]',
                    dot: 'bg-[#0052ff]',
                    tone: 'text-[#7da6ff]',
                  },
                  {
                    name: 'Red Team',
                    stance: 'el ataque',
                    text: debate.redTeam,
                    score: debate.redTeamSeverity,
                    scoreLabel: 'severidad',
                    accent: 'border-[#ff716a]/40 bg-[#ff716a]/[0.08]',
                    dot: 'bg-[#ff716a]',
                    tone: 'text-[#ff9d97]',
                  },
                ] as const).map((side) => (
                  <div key={side.name} className={`rounded-xl border p-4 backdrop-blur ${side.accent}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
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
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
                      {side.stance}
                    </div>
                    <p className="text-sm leading-6 text-white/75">{side.text}</p>
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
