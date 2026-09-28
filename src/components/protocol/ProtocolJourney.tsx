// Inside the protocol: one question followed from the click to the orb. Left, the desk and the
// click; centre, the protocol's guts stage by stage; right, the Núcleo glass forming the verdict.
// Everything shown is real: live BTC 1H candles and the latest public debate's own agent text
// (passed in from /api/bobby-protocol-stats). It is a replay, and it says so.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NucleoSphere, { type SphereMode, type SphereVerdict } from '@/components/companion/NucleoSphere';

export interface JourneyDebate {
  id?: string;
  topic?: string;
  symbol?: string | null;
  agents?: Array<{ agent: string; content: string; verdict?: { action?: string; conviction?: number; direction?: string; symbol?: string } | null }>;
}

type Candle = { ts: number; open: number; high: number; low: number; close: number };

const STAGES = [
  { key: 'click', label: 'The click', ms: 2200, title: 'A question leaves the desk', body: 'One tap on the web desk or the iPhone app. The same three agents answer it on demand, and once a day in public; this replay follows the latest public debate.' },
  { key: 'gate', label: 'Gate', ms: 2200, title: 'The API gateway lets it in', body: 'Origin check, rate limit and a metered read: signed-in users get free weekly reads, Bobby Pro is unlimited.' },
  { key: 'evidence', label: 'Evidence', ms: 3000, title: 'Evidence: the market, measured', body: 'At least 59 real 1H candles, fresh within 3 hours. A deterministic engine turns them into trend, RSI, EMAs, support and resistance.' },
  { key: 'alpha', label: 'Alpha', ms: 3200, title: 'Alpha Hunter builds the case', body: 'An isolated model call argues the strongest conditional idea the evidence supports.' },
  { key: 'red', label: 'Red Team', ms: 3200, title: 'Red Team attacks it', body: 'A second, separate call receives Alpha’s argument and goes after its weakest assumptions.' },
  { key: 'cio', label: 'CIO', ms: 3200, title: 'The CIO rules', body: 'A third call weighs both arguments and the question: review the idea, or wait.' },
  { key: 'guard', label: 'Guard', ms: 2600, title: 'The output guard reads every word', body: 'Guaranteed returns, personal buy or sell instructions and leverage fail the answer. Nothing is substituted.' },
  { key: 'veto', label: 'Veto', ms: 2600, title: 'Veto, never upgrade', body: 'The engine proposes; the debate can only take it away. A call survives only if the CIO rules review in the same direction.' },
  { key: 'record', label: 'Record', ms: 2800, title: 'Written down before the outcome', body: 'Public calls are stored with entry, stop and target before the market moves, graded on the real price path and anchored to TrackRecordV2 on Base.' },
  { key: 'orb', label: 'The orb', ms: 3600, title: 'The verdict condenses on the glass', body: 'One word, the conviction behind it, and every agent’s argument one tap away.' },
] as const;

const TONE = { alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E', base: '#4D7CFF', ink: '#F2EDE4', guard: '#C9B8FF' };

function ema(values: number[], n: number) {
  const k = 2 / (n + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}
function rsi(values: number[], n = 14) {
  let gain = 0, loss = 0;
  for (let i = values.length - n; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
const money = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: v > 100 ? 0 : 2 })}`;
const clean = (s: string) => s.replace(/[*_`#]+/g, '').replace(/\s+/g, ' ').trim();

function useTypewriter(text: string, active: boolean, cps = 90) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= text.length ? v : v + Math.max(1, Math.round(cps / 30)))), 33);
    return () => window.clearInterval(id);
  }, [text, active, cps]);
  return text.slice(0, n);
}

export default function ProtocolJourney({ debate }: { debate?: JourneyDebate }) {
  const [stage, setStage] = useState(0);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [digest, setDigest] = useState<string>('');
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const symbol = (debate?.symbol || debate?.agents?.find((a) => a.agent === 'cio')?.verdict?.symbol || 'BTC').toUpperCase().replace('NONE', 'BTC');

  // Only run while on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    fetch(`/api/okx-candles?instId=${encodeURIComponent(symbol)}-USDT&bar=1H&limit=72`)
      .then((r) => r.json())
      .then((d: { candles?: Candle[] }) => setCandles((d.candles ?? []).filter((c) => c.close > 0).sort((a, b) => a.ts - b.ts)))
      .catch(() => setCandles([]));
  }, [symbol]);

  useEffect(() => {
    const id = debate?.id;
    if (!id || !window.crypto?.subtle) return;
    window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)).then((buf) => {
      setDigest(`0x${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
    }).catch(() => setDigest(''));
  }, [debate?.id]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setStage((s) => (s + 1) % STAGES.length), STAGES[stage].ms);
    return () => window.clearTimeout(t);
  }, [stage, visible]);

  const agent = (k: string) => clean(debate?.agents?.find((a) => a.agent === k)?.content ?? '');
  const verdict = debate?.agents?.find((a) => a.agent === 'cio')?.verdict;
  const isCall = !!verdict && verdict.action !== 'none' && verdict.direction !== 'none' && !!verdict.direction;
  const sphereVerdict: SphereVerdict = !isCall ? 'wait' : verdict?.direction === 'short' ? 'pass' : 'ready';
  const word = isCall ? String(verdict?.direction).toUpperCase() : 'No call';
  const sub = typeof verdict?.conviction === 'number' ? `conviction ${verdict.conviction}/10` : 'capital protected';

  const key = STAGES[stage].key;
  const mode: SphereMode = key === 'orb' ? 'verdict' : key === 'click' ? 'idle' : key === 'gate' || key === 'evidence' ? 'listen' : 'debate';
  const focus = key === 'alpha' ? 'alpha' : key === 'red' ? 'red' : key === 'cio' ? 'cio' : null;

  const series = useMemo(() => {
    const closes = candles.map((c) => c.close);
    if (closes.length < 30) return null;
    const e20 = ema(closes, 20), e50 = ema(closes, 50);
    const lows = candles.slice(-30).map((c) => c.low), highs = candles.slice(-30).map((c) => c.high);
    return { e20, e50, rsi: rsi(closes), support: Math.min(...lows), resistance: Math.max(...highs), last: closes[closes.length - 1] };
  }, [candles]);

  return (
    <div ref={rootRef} className="relative">
      <div className="grid items-stretch gap-4 lg:grid-cols-[250px_1fr_280px]">
        {/* LEFT — the click */}
        <DeskMock stage={key} symbol={symbol} />

        {/* CENTRE — the guts */}
        <div className="relative min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B0A09]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:28px_28px]" />
          <Beam stage={stage} />
          <div className="relative z-10 flex h-full flex-col p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{String(stage + 1).padStart(2, '0')} / {STAGES.length} · inside the protocol</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">replay · real data</div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={key} initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }} transition={{ duration: 0.45 }} className="mt-4 flex flex-1 flex-col">
                <h3 className="text-2xl font-light tracking-[-0.03em] text-[#F2EDE4] md:text-3xl">{STAGES[stage].title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">{STAGES[stage].body}</p>
                <div className="mt-5 flex-1">
                  {key === 'click' && <SceneClick symbol={symbol} />}
                  {key === 'gate' && <SceneGate />}
                  {key === 'evidence' && <SceneEvidence candles={candles} series={series} symbol={symbol} />}
                  {(key === 'alpha' || key === 'red' || key === 'cio') && <SceneAgent who={key} text={agent(key === 'red' ? 'redteam' : key)} active />}
                  {key === 'guard' && <SceneGuard texts={[agent('alpha'), agent('redteam'), agent('cio')]} />}
                  {key === 'veto' && <SceneVeto isCall={isCall} verdictDirection={verdict?.direction} />}
                  {key === 'record' && <SceneRecord digest={digest} topic={debate?.topic} />}
                  {key === 'orb' && <SceneOrb word={word} sub={sub} />}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT — the orb */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0B0A09] py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(154,92,255,.18),transparent_60%)]" />
          <div className="relative">
            <NucleoSphere size={200} mode={mode} verdict={mode === 'verdict' ? sphereVerdict : undefined} word={mode === 'verdict' ? word : null} sub={mode === 'verdict' ? sub : null} agents={focus} />
          </div>
          <div className="relative mt-4 flex gap-3 font-mono text-[10px] uppercase tracking-[0.14em]">
            {(['alpha', 'red', 'cio'] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5 transition-opacity duration-300" style={{ color: TONE[k], opacity: focus === k || key === 'orb' ? 1 : 0.35 }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[k], boxShadow: focus === k ? `0 0 10px ${TONE[k]}` : 'none' }} />
                {k === 'red' ? 'Red' : k === 'cio' ? 'CIO' : 'Alpha'}
              </span>
            ))}
          </div>
          <div className="relative mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            {mode === 'idle' ? 'waiting' : mode === 'listen' ? 'reading the market' : mode === 'debate' ? 'three agents debating' : 'verdict'}
          </div>
        </div>
      </div>

      {/* Stage rail */}
      <div className="mt-5 grid grid-cols-5 gap-2 md:grid-cols-10">
        {STAGES.map((s, i) => (
          <button key={s.key} type="button" onClick={() => setStage(i)} className="group text-left" aria-label={`Show stage ${i + 1}: ${s.label}`}>
            <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-[#F2EDE4]" initial={false} animate={{ width: i < stage ? '100%' : i === stage ? ['0%', '100%'] : '0%' }} transition={i === stage ? { duration: s.ms / 1000, ease: 'linear' } : { duration: 0.2 }} />
            </div>
            <div className={`mt-2 font-mono text-[9px] uppercase tracking-[0.14em] ${i === stage ? 'text-white' : 'text-white/35 group-hover:text-white/60'}`}>{s.label}</div>
          </button>
        ))}
      </div>
      <p className="mt-4 font-mono text-[10px] leading-5 text-white/35">
        Replay of the latest public debate{debate?.topic ? ` (${debate.topic})` : ''} with live {symbol} 1H candles. The agent text is the agents’ own, unedited.
      </p>
    </div>
  );
}

// ---------- Left: the desk and the click ----------
function DeskMock({ stage, symbol }: { stage: string; symbol: string }) {
  const clicking = stage === 'click';
  const status = stage === 'click' ? 'Tap to ask' : stage === 'orb' ? 'Verdict ready' : stage === 'gate' || stage === 'evidence' ? 'Reading the market…' : 'Three agents debating…';
  return (
    <div className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0A09] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">The desk</div>
      <div className="mt-4 flex-1 rounded-[22px] border border-white/10 bg-black/60 p-3">
        <div className="text-center text-[15px] font-light text-[#F2EDE4]">Good evening.</div>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {[`How does ${symbol} look?`, 'NVDA?', 'ETH?'].map((chip, i) => (
            <span key={chip} className="relative rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: i === 0 && clicking ? 'rgba(242,237,228,.6)' : 'rgba(242,237,228,.12)', color: i === 0 ? '#F2EDE4' : 'rgba(242,237,228,.5)', background: i === 0 && clicking ? 'rgba(242,237,228,.1)' : 'transparent' }}>
              {chip}
              {i === 0 && clicking && (
                <motion.span className="absolute inset-0 rounded-full border border-white/70" initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.9, repeat: 1, delay: 0.7 }} />
              )}
            </span>
          ))}
        </div>
        <div className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{status}</div>
      </div>
      {clicking && (
        <motion.svg viewBox="0 0 24 24" className="pointer-events-none absolute h-6 w-6" initial={{ left: '80%', top: '85%', opacity: 0 }} animate={{ left: '30%', top: '44%', opacity: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
          <path d="M4 3l14 7-6 2-2 6z" fill="#F2EDE4" stroke="#000" strokeWidth="1" />
        </motion.svg>
      )}
    </div>
  );
}

// A soft light that travels left → right across the centre panel as the stages advance.
function Beam({ stage }: { stage: number }) {
  const pct = (stage / (STAGES.length - 1)) * 100;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04]">
      <motion.div className="absolute top-1/2 h-[10px] w-[120px] -translate-y-1/2 rounded-full blur-md" style={{ background: 'linear-gradient(90deg, transparent, #9A5CFF, #5CE1FF, transparent)' }} animate={{ left: `calc(${pct}% - 60px)` }} transition={{ duration: 0.8, ease: 'easeInOut' }} />
      <motion.div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#4D6BFF] to-[#5CE1FF]" animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
    </div>
  );
}

// ---------- Centre scenes ----------
function SceneClick({ symbol }: { symbol: string }) {
  return (
    <div className="flex h-full items-center">
      <motion.div className="rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-[12px] leading-6 text-white/70" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 }}>
        <div><span className="text-[#5CE1FF]">POST</span> /api/voice-tool <span className="text-white/35">· run_debate</span></div>
        <div><span className="text-[#5CE1FF]">POST</span> /api/desk-debate</div>
        <div className="text-white/45">{`{ "symbol": "${symbol}", "question": "How does ${symbol} look?" }`}</div>
      </motion.div>
    </div>
  );
}

function SceneGate() {
  const checks = ['Origin allowed', 'Rate limit · per caller and network', 'Metered read · sign-in / weekly / Pro', 'Quota · no model call if storage fails'];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {checks.map((c, i) => (
        <motion.div key={c} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.3 }} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45 + i * 0.3, type: 'spring' }} className="grid h-5 w-5 place-items-center rounded-full bg-[#3FE0B5]/15 text-[11px] text-[#3FE0B5]">✓</motion.span>
          {c}
        </motion.div>
      ))}
    </div>
  );
}

function SceneEvidence({ candles, series, symbol }: { candles: Candle[]; series: { e20: number[]; e50: number[]; rsi: number; support: number; resistance: number; last: number } | null; symbol: string }) {
  const W = 560, H = 170;
  const view = candles.slice(-48);
  if (view.length < 10 || !series) return <div className="h-[170px] animate-pulse rounded-xl bg-white/[0.03]" />;
  const lo = Math.min(...view.map((c) => c.low)), hi = Math.max(...view.map((c) => c.high));
  const y = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
  const step = W / view.length;
  const off = series.e20.length - view.length;
  const line = (arr: number[]) => view.map((_, i) => `${i ? 'L' : 'M'}${i * step + step / 2},${y(arr[off + i])}`).join(' ');
  const rsiV = Math.round(series.rsi);
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_150px]">
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          <line x1="0" x2={W} y1={y(series.resistance)} y2={y(series.resistance)} stroke="#FF5A5F" strokeOpacity=".4" strokeDasharray="4 4" />
          <line x1="0" x2={W} y1={y(series.support)} y2={y(series.support)} stroke="#3FE0B5" strokeOpacity=".4" strokeDasharray="4 4" />
          {view.map((c, i) => {
            const up = c.close >= c.open;
            return (
              <motion.g key={c.ts} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}>
                <line x1={i * step + step / 2} x2={i * step + step / 2} y1={y(c.high)} y2={y(c.low)} stroke={up ? '#3FE0B5' : '#FF5A5F'} strokeOpacity=".7" />
                <rect x={i * step + step * 0.2} width={step * 0.6} y={y(Math.max(c.open, c.close))} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={up ? '#3FE0B5' : '#FF5A5F'} opacity=".85" />
              </motion.g>
            );
          })}
          <motion.path d={line(series.e20)} fill="none" stroke="#F6B94E" strokeWidth="1.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1, duration: 1.2 }} />
          <motion.path d={line(series.e50)} fill="none" stroke="#9A5CFF" strokeWidth="1.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.3, duration: 1.2 }} />
        </svg>
        <div className="mt-1 flex gap-4 font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
          <span>{symbol} · 1H · {view.length} bars</span><span className="text-[#F6B94E]">EMA 20</span><span className="text-[#9A5CFF]">EMA 50</span>
        </div>
      </div>
      <div className="grid gap-2">
        <Gauge label="RSI 14" value={rsiV} />
        <Stat label="Resistance" value={money(series.resistance)} tone="#FF5A5F" />
        <Stat label="Support" value={money(series.support)} tone="#3FE0B5" />
      </div>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const r = 28, c = Math.PI * r;
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center">
      <svg viewBox="0 0 80 46" className="mx-auto h-12 w-auto">
        <path d={`M12,40 A${r},${r} 0 0 1 68,40`} fill="none" stroke="rgba(242,237,228,.1)" strokeWidth="6" strokeLinecap="round" />
        <motion.path d={`M12,40 A${r},${r} 0 0 1 68,40`} fill="none" stroke={value >= 70 ? '#FF5A5F' : value <= 30 ? '#3FE0B5' : '#F6B94E'} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1.2, delay: 0.6 }} />
      </svg>
      <div className="font-mono text-lg text-white">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{label}</div>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: tone }}>{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  );
}

function SceneAgent({ who, text, active }: { who: 'alpha' | 'red' | 'cio'; text: string; active: boolean }) {
  const shown = useTypewriter(text.slice(0, 360), active, 140);
  const name = who === 'alpha' ? 'Alpha Hunter' : who === 'red' ? 'Red Team' : 'CIO';
  const sees = who === 'alpha' ? ['question', 'evidence'] : who === 'red' ? ['question', 'evidence', 'alpha'] : ['question', 'evidence', 'alpha', 'red team'];
  const tone = TONE[who];
  return (
    <div className="grid gap-3 md:grid-cols-[170px_1fr]">
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">Isolated call · receives</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sees.map((s, i) => (
            <motion.span key={s} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 * i }} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-white/65">{s}</motion.span>
          ))}
        </div>
      </div>
      <div className="relative rounded-xl border bg-black/40 p-4" style={{ borderColor: `${tone}55`, boxShadow: `0 0 40px -18px ${tone}` }}>
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tone }}>
          <motion.span className="h-2 w-2 rounded-full" style={{ background: tone }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />{name}
        </div>
        <p className="min-h-[96px] text-[13px] leading-6 text-white/80">{text ? shown : 'Loading the latest public debate…'}<span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-white/60" /></p>
      </div>
    </div>
  );
}

function SceneGuard({ texts }: { texts: string[] }) {
  const rules = ['Guaranteed returns', 'Personal buy / sell instructions', 'Leverage', 'CIO text vs its own verdict'];
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_210px]">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
        {texts.map((t, i) => (
          <p key={i} className="mb-2 line-clamp-2 text-[12px] leading-5 text-white/45">{t || '…'}</p>
        ))}
        <motion.div className="absolute inset-x-0 h-10" style={{ background: 'linear-gradient(180deg, transparent, rgba(201,184,255,.25), transparent)' }} initial={{ top: '-15%' }} animate={{ top: '105%' }} transition={{ duration: 1.8, ease: 'easeInOut' }} />
      </div>
      <div className="grid gap-2">
        {rules.map((r, i) => (
          <motion.div key={r} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.35 }} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/70">
            {r}<span className="font-mono text-[10px] text-[#3FE0B5]">clear</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SceneVeto({ isCall, verdictDirection }: { isCall: boolean; verdictDirection?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 md:flex-row md:gap-8">
      <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-[200px] rounded-xl border border-white/10 bg-black/40 p-4 text-center">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">Indicator engine</div>
        <div className="mt-2 text-lg text-white">proposes</div>
        <div className="font-mono text-[11px] text-white/50">direction · conviction · levels</div>
      </motion.div>
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6, type: 'spring' }} className="grid h-16 w-16 place-items-center rounded-full border border-[#C9B8FF]/60 bg-[#C9B8FF]/10 font-mono text-[10px] uppercase tracking-[0.12em] text-[#C9B8FF]">veto</motion.div>
      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="w-full max-w-[200px] rounded-xl border p-4 text-center" style={{ borderColor: `${TONE.cio}66` }}>
        <div className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: TONE.cio }}>CIO ruled</div>
        <div className="mt-2 text-lg text-white">{isCall ? `review · ${verdictDirection}` : 'wait'}</div>
        <div className="font-mono text-[11px] text-white/50">{isCall ? 'same direction → call survives' : 'no call · capital protected'}</div>
      </motion.div>
    </div>
  );
}

function SceneRecord({ digest, topic }: { digest: string; topic?: string }) {
  const blocks = ['Debate stored', 'Entry · stop · target', 'Graded on the 1H path', 'TrackRecordV2 · Base 8453'];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {blocks.map((b, i) => (
          <div key={b} className="flex items-center gap-2">
            <motion.div initial={{ opacity: 0, y: 12, rotateX: 60 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.25 + i * 0.35 }} className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: i === 3 ? 'rgba(77,124,255,.7)' : 'rgba(242,237,228,.12)', background: i === 3 ? 'rgba(0,82,255,.14)' : 'rgba(242,237,228,.03)', color: i === 3 ? '#9AB4FF' : 'rgba(242,237,228,.75)' }}>{b}</motion.div>
            {i < blocks.length - 1 && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.35 }} className="text-white/30">→</motion.span>}
          </div>
        ))}
      </div>
      {digest && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="mt-5 rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-[11px] leading-5 text-white/55">
          <div className="text-white/35">{topic ?? 'debate'} · sha-256 of the debate id</div>
          <div className="break-all text-[#9AB4FF]">{digest}</div>
        </motion.div>
      )}
    </div>
  );
}

function SceneOrb({ word, sub }: { word: string; sub: string }) {
  return (
    <div className="flex h-full flex-col items-start justify-center">
      <motion.div initial={{ opacity: 0, letterSpacing: '0.4em' }} animate={{ opacity: 1, letterSpacing: '-0.03em' }} transition={{ duration: 1 }} className="text-5xl font-light text-[#F2EDE4]">{word}</motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{sub}</motion.div>
    </div>
  );
}
