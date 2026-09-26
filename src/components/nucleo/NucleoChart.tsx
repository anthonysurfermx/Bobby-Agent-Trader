// The read's chart, drawn the way the iPhone app draws it: one ivory line to scale, a single NOW
// point, the future zone to the right, and only the levels the desk actually argued about —
// the entry Alpha found (mint), the level where Red Team says the thesis breaks (coral), the
// CIO's target (amber), plus support and resistance as hairlines. A bracket measures the
// distance from the price to the level that matters. Everything comes from the read and the
// candles; nothing is drawn that the desk did not say.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/lib/companions/i18n';
import { AGENT_TONE, money, type Answer, type Candle, type Debate } from './deskData';

interface Props {
  series: Candle[];
  answer: Answer | null;
  debate: Debate | null;
  symbol: string;
  isEquity: boolean;
  /** Changes on every new read so the line is exhaled again. */
  drawKey: string | number;
  height?: number;
}

interface Level { key: string; price: number; to?: number; label: string; color: string; dashed?: boolean; hair?: boolean }

const POINTS = 48; // two days of 1H closes: enough shape, never noise

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [];
  const raw = span / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out.slice(0, 3);
}

function axis(v: number): string {
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 1) return v.toFixed(2);
  return v.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

export default function NucleoChart({ series, answer, debate, symbol, isEquity, drawKey, height = 230 }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  const uid = useId().replace(/:/g, '');
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { setDrawn(false); const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true))); return () => cancelAnimationFrame(id); }, [drawKey, series.length]);

  const g = useMemo(() => {
    const pts = series.slice(-POINTS);
    if (pts.length < 2 || w < 120) return null;
    const trade = debate && debate.direction !== 'none';
    const levels: Level[] = [];
    if (answer?.resistance != null) levels.push({ key: 'res', price: answer.resistance, label: t('Resistance', 'Resistencia'), color: '#A39C91', hair: true });
    if (answer?.support != null) levels.push({ key: 'sup', price: answer.support, label: t('Support', 'Soporte'), color: '#A39C91', hair: true });
    if (trade && debate) {
      const [alpha, red, cio] = debate.stances;
      if (alpha.level) levels.push({ key: 'entry', price: alpha.level.price, to: alpha.level.to, label: t('Entry', 'Entrada'), color: AGENT_TONE.alpha });
      if (red.level) levels.push({ key: 'stop', price: red.level.price, label: t('Stop', 'Stop'), color: AGENT_TONE.red, dashed: true });
      if (cio.level) levels.push({ key: 'target', price: cio.level.price, label: t('Target', 'Objetivo'), color: AGENT_TONE.cio });
    }
    const closes = pts.map((p) => p.close);
    const values = [...closes, ...levels.map((l) => l.price), ...levels.flatMap((l) => (l.to !== undefined ? [l.to] : []))];
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const pad = (hi - lo) * 0.1 || hi * 0.01;
    lo -= pad; hi += pad;
    const top = 22, bottom = height - 30;
    const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const nowX = Math.round(w * (w < 520 ? 0.7 : 0.76));
    const x = (i: number) => (i / (pts.length - 1)) * nowX;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
    const area = `${line} L${nowX},${bottom} L0,${bottom} Z`;
    const tailFrom = Math.floor(pts.length * 0.8);
    const tail = pts.slice(tailFrom).map((p, i) => `${i ? 'L' : 'M'}${x(tailFrom + i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
    const last = closes[closes.length - 1];
    const price = answer?.price ?? last;
    const nowY = y(last);
    // Labels in the future zone, pushed apart so two close levels never overprint.
    const labeled = levels.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < labeled.length; i++) if (labeled[i].ly - labeled[i - 1].ly < 13) labeled[i].ly = labeled[i - 1].ly + 13;
    // The distance that matters: to the CIO's target when there is a trade, else to the nearest wall.
    const target = levels.find((l) => l.key === 'target');
    const walls = levels.filter((l) => l.hair).sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
    const ref = target ?? walls[0] ?? null;
    let bracket: { y1: number; y2: number; text: string; sub: string; color: string } | null = null;
    if (ref) {
      const diff = ref.price - price;
      const abs = Math.abs(diff);
      const amount = abs >= 1000 ? Math.round(abs).toLocaleString('en-US') : abs >= 1 ? abs.toFixed(2) : abs.toLocaleString('en-US', { maximumSignificantDigits: 3 });
      const pct = `${((abs / price) * 100).toFixed(1)}%`;
      const where = ref.key === 'target' ? t('to target', 'al objetivo') : diff > 0 ? t(`to ${ref.label.toLowerCase()}`, `a ${ref.label.toLowerCase()}`) : t(`to ${ref.label.toLowerCase()}`, `a ${ref.label.toLowerCase()}`);
      bracket = { y1: nowY, y2: y(ref.price), text: `${diff >= 0 ? '+' : '−'}${amount}`, sub: `${pct} ${where}`, color: ref.key === 'target' ? AGENT_TONE.cio : '#F2EDE4' };
    }
    // Never let the bracket print over a level label: on a narrow chart the two share the future zone.
    if (bracket) {
      const mid = (bracket.y1 + bracket.y2) / 2;
      const bx = nowX + 20 + 96;
      const clash = labeled.some((l) => Math.abs(l.ly - 4 - mid) < 22 && w - (l.label.length + 10) * 6.4 < bx);
      if (clash) bracket = null;
    }
    const ticks = walls.length ? [] : niceTicks(lo, hi).map((v) => ({ v, y: y(v) }));
    const lastTs = pts[pts.length - 1].ts;
    const asOf = Number.isFinite(lastTs) ? new Date(lastTs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    return { levels, labeled, line, area, tail, nowX, nowY, top, bottom, y, price, bracket, ticks, asOf, len: pts.length };
  }, [series, answer, debate, w, height]);

  const source = isEquity ? `1H · ${symbol}` : `1H · OKX · ${symbol}-USDT`;
  const draw = drawn ? 1 : 0;

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {!g ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="n-label">{series.length ? '' : t('Loading the chart', 'Cargando la gráfica')}</span>
        </div>
      ) : (
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={t(`${symbol} price, last ${g.len} hours, with the desk's levels`, `Precio de ${symbol}, últimas ${g.len} horas, con los niveles del desk`)} style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            <linearGradient id={`l${uid}`} x1="0" x2={g.nowX} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F2EDE4" stopOpacity=".3" /><stop offset=".72" stopColor="#F2EDE4" stopOpacity=".82" /><stop offset="1" stopColor="#FFF8EC" />
            </linearGradient>
            <linearGradient id={`a${uid}`} x1="0" x2="0" y1={g.top} y2={g.bottom} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F2EDE4" stopOpacity=".07" /><stop offset="1" stopColor="#F2EDE4" stopOpacity="0" />
            </linearGradient>
            <filter id={`b${uid}`} x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="2" /></filter>
          </defs>

          {/* the future zone */}
          <rect x={g.nowX} y={g.top - 10} width={w - g.nowX} height={g.bottom - g.top + 10} fill="rgba(242,237,228,.02)" />
          {g.ticks.map((tk) => (
            <g key={tk.v} style={{ opacity: draw, transition: 'opacity .4s ease .9s' }}>
              <line x1="0" x2={w} y1={tk.y} y2={tk.y} stroke="rgba(242,237,228,.06)" />
              <text x="0" y={tk.y - 4} className="n-tick">{axis(tk.v)}</text>
            </g>
          ))}

          {/* levels: the entry zone as a band, the rest as lines */}
          {g.levels.map((l, i) => {
            const ly = g.y(l.price);
            const delay = 1.1 + i * 0.12;
            return (
              <g key={l.key} style={{ opacity: draw, transition: `opacity .45s ease ${delay}s` }}>
                {l.to !== undefined && (
                  <rect x="0" width={w} y={Math.min(ly, g.y(l.to))} height={Math.abs(g.y(l.to) - ly)} fill={l.color} opacity=".08" />
                )}
                <line x1="0" x2={w} y1={ly} y2={ly} stroke={l.hair ? 'rgba(242,237,228,.34)' : l.color} strokeOpacity={l.hair ? 1 : 0.7} strokeWidth={l.hair ? 0.75 : 1} strokeDasharray={l.dashed ? '3 4' : l.hair ? '2 4' : undefined} />
              </g>
            );
          })}
          {g.labeled.map((l, i) => (
            <text key={l.key} x={w} y={l.ly - 4} textAnchor="end" className="n-tick" fill={l.hair ? '#A39C91' : l.color} style={{ opacity: draw, transition: `opacity .45s ease ${1.1 + i * 0.12}s`, letterSpacing: '.08em' }}>
              {l.label.toUpperCase()} {money(l.price)}
            </text>
          ))}

          {/* the line, exhaled left to right */}
          <path d={g.area} fill={`url(#a${uid})`} style={{ opacity: draw, transition: 'opacity .6s ease .8s' }} />
          <path d={g.tail} fill="none" stroke="#FFF8EC" strokeWidth="3" strokeLinecap="round" opacity={0.22 * draw} filter={`url(#b${uid})`} style={{ transition: 'opacity .4s ease 1.2s' }} />
          <path d={g.line} fill="none" stroke={`url(#l${uid})`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - draw, transition: drawn ? 'stroke-dashoffset 1.2s cubic-bezier(.3,.7,.2,1)' : 'none' }} />

          {/* NOW */}
          <g style={{ opacity: draw, transition: 'opacity .3s ease 1.15s' }}>
            <circle cx={g.nowX} cy={g.nowY} r="10" fill="#FFF8EC" opacity=".12" />
            <circle className="n-now-pulse" cx={g.nowX} cy={g.nowY} r="3.6" fill="none" stroke="#FFF8EC" />
            <circle cx={g.nowX} cy={g.nowY} r="3.4" fill="#FFF8EC" />
            <text x={g.nowX - 10} y={g.nowY - 10} textAnchor="end" className="n-chart-price">{money(g.price)}</text>
          </g>
          {g.bracket && Math.abs(g.bracket.y2 - g.bracket.y1) > 6 && (
            <g style={{ opacity: draw, transition: 'opacity .4s ease 1.6s' }}>
              <line x1={g.nowX + 12} x2={g.nowX + 12} y1={g.bracket.y1} y2={g.bracket.y2} stroke={g.bracket.color} strokeOpacity=".7" />
              <line x1={g.nowX + 9} x2={g.nowX + 15} y1={g.bracket.y1} y2={g.bracket.y1} stroke={g.bracket.color} strokeOpacity=".7" />
              <line x1={g.nowX + 9} x2={g.nowX + 15} y1={g.bracket.y2} y2={g.bracket.y2} stroke={g.bracket.color} strokeOpacity=".7" />
              <text x={g.nowX + 20} y={(g.bracket.y1 + g.bracket.y2) / 2 - 2} className="n-chart-bracket" fill={g.bracket.color}>{g.bracket.text}</text>
              <text x={g.nowX + 20} y={(g.bracket.y1 + g.bracket.y2) / 2 + 12} className="n-chart-bracket-sub">{g.bracket.sub}</text>
            </g>
          )}
          <text x="0" y={height - 6} className="n-tick" style={{ letterSpacing: '.12em' }}>{source.toUpperCase()}{g.asOf ? ` · ${t('AS OF', 'A LAS')} ${g.asOf}` : ''}</text>
        </svg>
      )}
    </div>
  );
}
