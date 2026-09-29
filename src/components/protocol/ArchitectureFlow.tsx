// The whole Bobby architecture as one living diagram: every box is a real component, every
// flow is a real path through the code (desk read, daily public cycle, an external agent over
// MCP, a swap signed on Base). A light travels each flow edge by edge and the active box explains
// itself. Base-only naming on purpose: market data is "market intel", never a vendor.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Tone = 'ink' | 'alpha' | 'red' | 'cio' | 'base' | 'guard';
interface Node { id: string; col: number; title: string; sub: string; tone: Tone; detail: string }
interface Flow { id: string; label: string; caption: string; path: string[] }

const COLUMNS = ['Who asks', 'Gate', 'Evidence', 'Agents', 'Guards', 'Record', 'Base · 8453'];

const NODES: Node[] = [
  { id: 'web', col: 0, title: 'Web desk', sub: '/desk', tone: 'ink', detail: 'A question typed or dictated on the web desk.' },
  { id: 'ios', col: 0, title: 'iPhone app', sub: 'same desk', tone: 'ink', detail: 'The iPhone app calls the same desk endpoint as the web.' },
  { id: 'mcp', col: 0, title: 'Other agents', sub: 'MCP · HTTP', tone: 'ink', detail: 'Another AI agent calls Bobby over MCP: 6 JSON-RPC tools, 15 on streamable HTTP.' },
  { id: 'cron', col: 0, title: 'Daily cycle', sub: '12:00 UTC', tone: 'ink', detail: 'A scheduled job starts the public debate once a day.' },

  { id: 'api', col: 1, title: 'API gateway', sub: 'access · limits', tone: 'ink', detail: 'Serverless API: origin check, rate limits, metered reads and levels (Quick, Deep, Max), and a spend guard that reads the LLM cost ledger before any model call.' },
  { id: 'x402', col: 1, title: 'x402 payment', sub: 'paid on Base', tone: 'base', detail: 'Premium MCP tools are paid per call in ETH on Base; the payment is checked against AgentEconomy.' },

  { id: 'market', col: 2, title: 'Market intel', sub: 'public market data', tone: 'ink', detail: 'Public market data: prices and candles (1H on Quick; more timeframes, crypto derivatives and Bobby\u2019s record on Deep and Max), plus funding, positioning and sentiment for the cycle.' },
  { id: 'engine', col: 2, title: 'Indicator engine', sub: 'deterministic', tone: 'ink', detail: 'Trend, RSI, ATR, EMAs, support and resistance, and where the price sits against each as a % of price. No model: the agents quote these numbers, never compute them.' },

  { id: 'alpha', col: 3, title: 'Alpha Hunter', sub: 'builds the case', tone: 'alpha', detail: 'Isolated model call: the strongest conditional case the evidence supports.' },
  { id: 'red', col: 3, title: 'Red Team', sub: 'attacks it', tone: 'red', detail: 'Receives Alpha’s argument and attacks its assumptions, invalidation and missing evidence. On Max, Alpha answers back in a second round.' },
  { id: 'cio', col: 3, title: 'CIO', sub: 'rules', tone: 'cio', detail: 'Receives the arguments and the question. Desk: review or wait, led by a plain-words synthesis (headline, why, risk, what to watch, a follow-up). Cycle: a structured verdict.' },
  { id: 'judge', col: 3, title: 'Judge', sub: 'scores the debate', tone: 'cio', detail: 'For external agents: scores the debate on six dimensions into a hardness score 0–100.' },

  { id: 'guard', col: 4, title: 'Output guard', sub: 'no advice · no promises', tone: 'guard', detail: 'Rejects guarantees, personal buy/sell instructions and leverage. Desk: each argument is checked before it streams; a failure ends the read. Cycle: one rewrite, then withheld.' },
  { id: 'veto', col: 4, title: 'CIO veto', sub: 'veto, never upgrade', tone: 'guard', detail: 'The debate can only remove the engine’s idea: a call shows only if the CIO rules review in the same direction.' },
  { id: 'policy', col: 4, title: 'Commit gate', sub: 'conviction ≥ 0.35', tone: 'guard', detail: 'Conviction = 70% backend model + 30% CIO. A call needs complete levels to be committed; the policy disposes for agents.' },
  { id: 'calldata', col: 4, title: 'Bounded calldata', sub: 'allow-listed route', tone: 'guard', detail: 'Bobby quotes an allow-listed route and prepares bounded calldata. It never signs and never holds funds.' },

  { id: 'answer', col: 5, title: 'Your answer', sub: 'private', tone: 'ink', detail: 'The synthesis first, with the level to watch drawn on the chart; the full debate folded underneath. Desk reads are not published.' },
  { id: 'ledger', col: 5, title: 'Public ledger', sub: 'debate + call', tone: 'ink', detail: 'Every public debate and call is stored with entry, stop, target and a 48 h expiry before the outcome.' },
  { id: 'resolver', col: 5, title: 'Resolver', sub: '12:30 UTC · 1H path', tone: 'ink', detail: 'Grades each call on the real 1H price path: first touch wins, a same-bar tie goes to the stop.' },
  { id: 'wallet', col: 5, title: 'Your wallet', sub: 'you sign', tone: 'ink', detail: 'The swap is reviewed and signed in your own wallet. Only confirmed receipts are recorded.' },

  { id: 'track', col: 6, title: 'TrackRecordV2', sub: 'Pyth-anchored', tone: 'base', detail: 'Commitments fixed before the outcome and graded with Pyth prices at the entry and a declared exit — a graded call, not proof of a swap. Verified and attested ledgers never mix.' },
  { id: 'econ', col: 6, title: 'AgentEconomy', sub: 'MCP fees', tone: 'base', detail: 'Settles the per-call fees agents pay for premium tools.' },
  { id: 'hard', col: 6, title: 'HardnessRegistry', sub: 'decision scores', tone: 'base', detail: 'Difficulty-weighted scores for external agents’ decisions (operator-gated commits).' },
  { id: 'uni', col: 6, title: 'Uniswap V3', sub: 'swap settles', tone: 'base', detail: 'The signed swap settles on Base; the receipt enters a chain-ordered ledger with FIFO PnL.' },
  { id: 'safe', col: 6, title: 'Safe 2-of-3', sub: 'owns 7 contracts', tone: 'base', detail: 'All seven Bobby contracts on Base are owned by a 2-of-3 Safe.' },
];

const FLOWS: Flow[] = [
  { id: 'desk', label: 'A desk read', caption: 'Web or iPhone: the debate streams live, the answer leads with the synthesis and stays private.', path: ['web', 'api', 'market', 'engine', 'alpha', 'red', 'cio', 'guard', 'veto', 'answer'] },
  { id: 'cycle', label: 'The daily public debate', caption: 'Once a day the agents debate in public; a call is committed before the outcome and graded after it.', path: ['cron', 'api', 'market', 'alpha', 'red', 'cio', 'guard', 'policy', 'ledger', 'resolver', 'track'] },
  { id: 'agent', label: 'Another agent over MCP', caption: 'An external agent pays per call on Base and gets a debate, a judge score and a policy decision.', path: ['mcp', 'x402', 'market', 'alpha', 'red', 'cio', 'judge', 'policy', 'hard'] },
  { id: 'swap', label: 'A swap on Base', caption: 'Bobby prepares the route; you sign in your wallet; the swap settles on Base.', path: ['web', 'api', 'calldata', 'wallet', 'uni'] },
];

const TONE: Record<Tone, string> = { ink: '#F2EDE4', alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E', base: '#4D7CFF', guard: '#C9B8FF' };
const STEP_MS = 1100;

type Box = { x: number; y: number; w: number; h: number };

function layout(vertical: boolean): { width: number; height: number; boxes: Record<string, Box>; headers: Array<{ x: number; y: number; text: string; anchor: 'middle' | 'start' }> } {
  const boxes: Record<string, Box> = {};
  const headers: Array<{ x: number; y: number; text: string; anchor: 'middle' | 'start' }> = [];
  if (!vertical) {
    const width = 1240, colW = width / COLUMNS.length, w = 146, h = 52, gap = 16, top = 58;
    let maxBottom = 0;
    COLUMNS.forEach((name, c) => {
      const cx = colW * c + colW / 2;
      headers.push({ x: cx, y: 24, text: name, anchor: 'middle' });
      const list = NODES.filter((n) => n.col === c);
      list.forEach((n, i) => {
        const y = top + i * (h + gap) + (5 - list.length) * (h + gap) / 2;
        boxes[n.id] = { x: cx - w / 2, y, w, h };
        maxBottom = Math.max(maxBottom, y + h);
      });
    });
    return { width, height: maxBottom + 16, boxes, headers };
  }
  const width = 360, w = 166, h = 50, gapX = 12, gapY = 12;
  let y = 8;
  COLUMNS.forEach((name, c) => {
    headers.push({ x: 8, y: y + 12, text: name, anchor: 'start' });
    y += 24;
    const list = NODES.filter((n) => n.col === c);
    list.forEach((n, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = list.length === 1 ? (width - w) / 2 : 8 + col * (w + gapX);
      boxes[n.id] = { x, y: y + row * (h + gapY), w, h };
    });
    y += Math.ceil(list.length / 2) * (h + gapY) + 14;
  });
  return { width, height: y, boxes, headers };
}

function edgePath(a: Box, b: Box, vertical: boolean) {
  if (!vertical) {
    const forward = b.x > a.x + 1;
    const same = Math.abs(b.x - a.x) < 1;
    if (same) {
      const x = a.x + a.w, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
      return `M${x},${y1} C${x + 34},${y1} ${x + 34},${y2} ${x},${y2}`;
    }
    const x1 = forward ? a.x + a.w : a.x, x2 = forward ? b.x : b.x + b.w;
    const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, dx = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + (forward ? dx : -dx)},${y1} ${x2 - (forward ? dx : -dx)},${y2} ${x2},${y2}`;
  }
  const down = b.y > a.y + 1;
  const x1 = a.x + a.w / 2, x2 = b.x + b.w / 2;
  const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
  if (Math.abs(b.y - a.y) < 1) {
    const yy = a.y + a.h / 2;
    const xa = x1 < x2 ? a.x + a.w : a.x, xb = x1 < x2 ? b.x : b.x + b.w;
    return `M${xa},${yy} L${xb},${yy}`;
  }
  const dy = Math.max(24, Math.abs(y2 - y1) / 2);
  return `M${x1},${y1} C${x1},${y1 + (down ? dy : -dy)} ${x2},${y2 - (down ? dy : -dy)} ${x2},${y2}`;
}

export default function ArchitectureFlow() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [vertical, setVertical] = useState(false);
  const [flowIdx, setFlowIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [reduced, setReduced] = useState(false);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const dotRef = useRef<SVGCircleElement | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setVertical(entry.contentRect.width < 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    try { setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { /* old browser */ }
  }, []);

  const L = useMemo(() => layout(vertical), [vertical]);
  const flow = FLOWS[flowIdx];
  const edges = useMemo(() => {
    const seen = new Map<string, { a: string; b: string }>();
    for (const f of FLOWS) for (let i = 0; i < f.path.length - 1; i++) seen.set(`${f.path[i]}>${f.path[i + 1]}`, { a: f.path[i], b: f.path[i + 1] });
    seen.set('ios>api', { a: 'ios', b: 'api' });
    seen.set('safe>track', { a: 'safe', b: 'track' });
    seen.set('x402>econ', { a: 'x402', b: 'econ' });
    return [...seen.entries()].map(([key, v]) => ({ key, ...v }));
  }, []);
  const activeEdges = useMemo(() => new Set(flow.path.slice(0, -1).map((id, i) => `${id}>${flow.path[i + 1]}`)), [flow]);

  // Step clock: one edge per STEP_MS, a short rest at the end, then the next flow (unless pinned).
  useEffect(() => {
    if (reduced) { setStep(flow.path.length - 1); return; }
    setStep(0);
    let s = 0;
    const id = window.setInterval(() => {
      s += 1;
      if (s < flow.path.length) setStep(s);
      else if (s >= flow.path.length + 2) {
        if (pinned) { s = 0; setStep(0); } else setFlowIdx((i) => (i + 1) % FLOWS.length);
      }
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [flowIdx, pinned, reduced, flow.path.length]);

  // The light: glides along the current edge with requestAnimationFrame.
  useEffect(() => {
    if (reduced) return;
    const dot = dotRef.current;
    if (!dot) return;
    if (step >= flow.path.length - 1) { dot.style.opacity = '0'; return; }
    const path = pathRefs.current[`${flow.path[step]}>${flow.path[step + 1]}`];
    if (!path) return;
    const total = path.getTotalLength();
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (STEP_MS * 0.9));
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const p = path.getPointAtLength(total * eased);
      dot.setAttribute('cx', String(p.x));
      dot.setAttribute('cy', String(p.y));
      dot.style.opacity = '1';
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, flow, reduced, L]);

  const litIndex = (id: string) => flow.path.indexOf(id);
  const currentNode = NODES.find((n) => n.id === flow.path[Math.min(step, flow.path.length - 1)]);

  return (
    <div ref={wrapRef} className="w-full">
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Flows">
        {FLOWS.map((f, i) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={i === flowIdx}
            onClick={() => { setFlowIdx(i); setPinned(true); }}
            className={`rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition ${i === flowIdx ? 'bg-[#F2EDE4] text-black' : 'border border-white/10 bg-white/[0.04] text-white/55 hover:text-white'}`}
          >
            {f.label}
          </button>
        ))}
        {pinned && (
          <button type="button" onClick={() => setPinned(false)} className="rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40 hover:text-white">
            Auto-play
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0A09] p-3 md:p-5">
        <svg viewBox={`0 0 ${L.width} ${L.height}`} className="block h-auto w-full" role="img" aria-label={`Bobby architecture: ${flow.label}. ${flow.caption}`}>
          <defs>
            <radialGradient id="arch-dot" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="45%" stopColor="#9AB4FF" />
              <stop offset="100%" stopColor="#4D7CFF" stopOpacity="0" />
            </radialGradient>
          </defs>
          {L.headers.map((h) => (
            <text key={h.text} x={h.x} y={h.y} textAnchor={h.anchor} fill="rgba(242,237,228,.38)" style={{ font: '500 10px ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.14em', textTransform: 'uppercase' }}>{h.text.toUpperCase()}</text>
          ))}
          {edges.map((e) => {
            const a = L.boxes[e.a], b = L.boxes[e.b];
            if (!a || !b) return null;
            const on = activeEdges.has(e.key);
            const passed = on && flow.path.indexOf(e.a) < step;
            return (
              <path
                key={e.key}
                ref={(el) => { pathRefs.current[e.key] = el; }}
                d={edgePath(a, b, vertical)}
                fill="none"
                stroke={passed ? 'rgba(154,180,255,.85)' : on ? 'rgba(154,180,255,.35)' : 'rgba(242,237,228,.07)'}
                strokeWidth={passed ? 1.6 : 1}
                strokeDasharray={on ? undefined : '3 5'}
                style={{ transition: 'stroke .4s ease' }}
              />
            );
          })}
          {NODES.map((n) => {
            const b = L.boxes[n.id];
            if (!b) return null;
            const idx = litIndex(n.id);
            const inFlow = idx >= 0;
            const lit = inFlow && idx <= step;
            const current = inFlow && idx === Math.min(step, flow.path.length - 1);
            const tone = TONE[n.tone];
            return (
              <g key={n.id} style={{ transition: 'opacity .4s ease', opacity: inFlow ? 1 : 0.32 }}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12}
                  fill={lit ? 'rgba(242,237,228,.06)' : 'rgba(242,237,228,.02)'}
                  stroke={current ? tone : lit ? `${tone}99` : 'rgba(242,237,228,.1)'}
                  strokeWidth={current ? 1.6 : 1}
                  style={{ transition: 'stroke .35s ease, fill .35s ease', filter: current ? `drop-shadow(0 0 10px ${tone}66)` : undefined }} />
                <circle cx={b.x + 13} cy={b.y + 17} r={3} fill={tone} opacity={lit ? 1 : 0.4} />
                <text x={b.x + 23} y={b.y + 21} fill="#F2EDE4" style={{ font: `500 ${vertical ? 12 : 13}px Sora, ui-sans-serif, system-ui`, letterSpacing: '-.01em' }}>{n.title}</text>
                <text x={b.x + 13} y={b.y + 39} fill="rgba(242,237,228,.45)" style={{ font: '400 10px ui-monospace, SFMono-Regular, Menlo, monospace' }}>{n.sub}</text>
              </g>
            );
          })}
          {!reduced && <circle ref={dotRef} r={7} fill="url(#arch-dot)" style={{ opacity: 0, transition: 'opacity .2s' }} />}
        </svg>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{flow.label}</div>
          <p className="mt-2 text-sm leading-6 text-white/65">{flow.caption}</p>
        </div>
        <div className="min-h-[72px] rounded-xl border border-white/10 bg-white/[0.02] p-4" aria-live="polite">
          {currentNode && (
            <>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: TONE[currentNode.tone] }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[currentNode.tone] }} />
                {Math.min(step, flow.path.length - 1) + 1} / {flow.path.length} · {currentNode.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/70">{currentNode.detail}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
