// "How the agents are kept honest" in the Núcleo language: warm charcoal glass cards, Sora
// headings, the three agent hues, and one small living visual per rule instead of stock photos.
import { motion } from 'framer-motion';

const A = '#3FE0B5', R = '#FF5A5F', C = '#F6B94E', G = '#C9B8FF', B = '#4D7CFF', INK = '#F2EDE4';

export interface Capability { title: string; description: string; telemetry: string[] }

function DebateVisual() {
  const nodes = [{ x: 40, y: 70, c: A, l: 'Alpha' }, { x: 150, y: 30, c: R, l: 'Red Team' }, { x: 260, y: 70, c: C, l: 'CIO' }];
  return (
    <svg viewBox="0 0 300 110" className="h-full w-full">
      <path id="d1" d="M40,70 Q95,20 150,30" fill="none" stroke="rgba(242,237,228,.15)" />
      <path id="d2" d="M150,30 Q205,20 260,70" fill="none" stroke="rgba(242,237,228,.15)" />
      <path d="M40,70 Q150,120 260,70" fill="none" stroke="rgba(242,237,228,.08)" strokeDasharray="3 5" />
      {[['d1', A, 0], ['d2', R, 1.2]].map(([id, c, d]) => (
        <circle key={id as string} r="3.5" fill={c as string} style={{ filter: `drop-shadow(0 0 6px ${c})` }}>
          <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${d}s`}><mpath href={`#${id}`} /></animateMotion>
        </circle>
      ))}
      {nodes.map((n, i) => (
        <g key={n.l}>
          <motion.circle cx={n.x} cy={n.y} r="14" fill={`${n.c}1f`} stroke={n.c} strokeWidth="1.2" animate={{ r: [13, 16, 13] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8 }} />
          <circle cx={n.x} cy={n.y} r="4" fill={n.c} />
          <text x={n.x} y={n.y + 30} textAnchor="middle" fill="rgba(242,237,228,.55)" style={{ font: '500 9px ui-monospace, monospace', letterSpacing: '.12em', textTransform: 'uppercase' }}>{n.l.toUpperCase()}</text>
        </g>
      ))}
    </svg>
  );
}

function VetoVisual() {
  return (
    <svg viewBox="0 0 300 110" className="h-full w-full">
      <text x="10" y="30" fill="rgba(242,237,228,.5)" style={{ font: '500 9px ui-monospace, monospace', letterSpacing: '.12em' }}>ENGINE · LONG 67%</text>
      <line x1="10" y1="55" x2="290" y2="55" stroke="rgba(242,237,228,.1)" />
      <motion.line x1="10" y1="55" y2="55" stroke={A} strokeWidth="2" initial={{ x2: 10 }} animate={{ x2: [10, 180, 180, 10] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.35, 0.8, 1] }} style={{ filter: `drop-shadow(0 0 6px ${A})` }} />
      <motion.rect x="182" width="4" rx="2" fill={C} initial={{ attrY: 55, height: 0 }} animate={{ attrY: [55, 30, 30, 55], height: [0, 50, 50, 0] }} transition={{ duration: 4, repeat: Infinity, times: [0.3, 0.4, 0.8, 0.9] }} />
      <motion.text x="200" y="60" fill={C} style={{ font: '600 11px ui-monospace, monospace', letterSpacing: '.14em' }} animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.38, 0.45, 0.8, 0.9] }}>CIO: WAIT</motion.text>
      <text x="10" y="95" fill="rgba(242,237,228,.35)" style={{ font: '500 9px ui-monospace, monospace', letterSpacing: '.12em' }}>THE DEBATE CAN ONLY TAKE IT AWAY</text>
    </svg>
  );
}

function GuardVisual() {
  const lines = [{ w: 250, bad: false }, { w: 200, bad: true, t: 'use 3x leverage' }, { w: 230, bad: false }, { w: 170, bad: true, t: 'guaranteed gains' }];
  return (
    <svg viewBox="0 0 300 110" className="h-full w-full">
      {lines.map((l, i) => (
        <g key={i}>
          {l.bad ? (
            <>
              <text x="12" y={20 + i * 24} fill="rgba(242,237,228,.6)" style={{ font: '400 11px ui-sans-serif, system-ui' }}>{l.t}</text>
              <motion.line x1="10" y1={16 + i * 24} y2={16 + i * 24} stroke={R} strokeWidth="1.5" initial={{ x2: 10 }} animate={{ x2: [10, 10, 115, 115] }} transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.2 + i * 0.1, 0.35 + i * 0.1, 1] }} />
            </>
          ) : (
            <rect x="12" y={12 + i * 24} width={l.w} height="6" rx="3" fill="rgba(242,237,228,.1)" />
          )}
        </g>
      ))}
      <motion.rect x="0" width="300" height="18" fill="url(#scan)" animate={{ attrY: [-18, 110] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }} />
      <defs><linearGradient id="scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={G} stopOpacity="0" /><stop offset=".5" stopColor={G} stopOpacity=".35" /><stop offset="1" stopColor={G} stopOpacity="0" /></linearGradient></defs>
    </svg>
  );
}

function ProofVisual() {
  const blocks = ['debate', 'levels', 'graded', 'Base'];
  return (
    <svg viewBox="0 0 300 110" className="h-full w-full">
      {blocks.map((b, i) => {
        const x = 12 + i * 72, base = i === 3;
        return (
          <g key={b}>
            {i > 0 && <motion.line x1={x - 14} y1="52" x2={x - 2} y2="52" stroke="rgba(242,237,228,.25)" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.5 }} />}
            <motion.g animate={{ opacity: [0.45, 1, 1] }} transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.5, times: [0, 0.2, 1] }}><rect x={x} y="30" width="58" height="44" rx="10" fill={base ? `${B}26` : 'rgba(242,237,228,.04)'} stroke={base ? B : 'rgba(242,237,228,.18)'}  style={base ? { filter: `drop-shadow(0 0 10px ${B}88)` } : undefined} /></motion.g>
            <text x={x + 29} y="56" textAnchor="middle" fill={base ? '#9AB4FF' : 'rgba(242,237,228,.6)'} style={{ font: '500 9px ui-monospace, monospace', letterSpacing: '.1em' }}>{b.toUpperCase()}</text>
          </g>
        );
      })}
      <text x="12" y="98" fill="rgba(242,237,228,.35)" style={{ font: '500 9px ui-monospace, monospace', letterSpacing: '.12em' }}>WRITTEN BEFORE THE OUTCOME · 8453</text>
    </svg>
  );
}

const VISUALS = [DebateVisual, VetoVisual, GuardVisual, ProofVisual];
const TONES = [A, C, G, B];

export default function CapabilityCards({ items }: { items: Capability[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((cap, i) => {
        const Visual = VISUALS[i] ?? DebateVisual;
        const tone = TONES[i] ?? INK;
        return (
          <motion.article
            key={cap.title}
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: i * 0.06, duration: 0.5 }}
            className="group relative flex flex-col overflow-hidden rounded-[28px] border border-[rgba(242,237,228,.08)] p-7 md:p-9"
            style={{ background: 'linear-gradient(180deg, rgba(34,31,28,.9), rgba(18,16,15,.95))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 30px 60px -30px rgba(0,0,0,.9)' }}
          >
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-40" style={{ background: tone }} />
            <div className="relative flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#A39C91]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} />
              Rule {String(i + 1).padStart(2, '0')}
            </div>
            <h3 className="relative mt-4 text-[30px] font-light leading-[1.05] tracking-[-0.04em] text-[#F2EDE4] md:text-[36px]">{cap.title}</h3>
            <div className="relative mt-6 h-[120px] rounded-2xl border border-[rgba(242,237,228,.06)] bg-black/30 p-2">
              <Visual />
            </div>
            <p className="relative mt-6 max-w-xl text-[15px] leading-7 text-[#A39C91]">{cap.description}</p>
            <div className="relative mt-6 flex flex-wrap gap-2 border-t border-[rgba(242,237,228,.06)] pt-5">
              {cap.telemetry.map((t) => (
                <span key={t} className="rounded-full border border-[rgba(242,237,228,.08)] bg-[rgba(242,237,228,.03)] px-3 py-1.5 font-mono text-[10.5px] text-[#C9C2B6]">{t.replace(/\s{2,}/g, ' · ')}</span>
              ))}
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
