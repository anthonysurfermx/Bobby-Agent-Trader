// The read's chart, drawn the way the iPhone app draws it — one ivory line to scale, a single NOW
// point, the future zone to the right — with the desk's argument written on it: what Alpha Hunter
// claims (the entry, mint), where Red Team says the thesis breaks (the stop, coral), what the CIO
// decides (the target, amber), the reward and risk zones those three levels make, support and
// resistance, EMA 20/50 over the price, volume under it and an RSI 14 strip beneath. The levels
// come from the read; the indicators are computed from the same 1H candles. Nothing is invented.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/lib/companions/i18n';
import { AGENT_TONE, money, type AgentKey, type Answer, type Candle, type Debate } from './deskData';

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

interface Level { key: string; agent: AgentKey | null; price: number; to?: number; label: string; color: string; dashed?: boolean; hair?: boolean }

const POINTS = 48; // two days of 1H closes: enough shape, never noise
const AGENT_SHORT: Record<AgentKey, string> = { alpha: 'Alpha', red: 'Red Team', cio: 'CIO' };

function ema(values: number[], n: number): Array<number | null> {
  const k = 2 / (n + 1);
  let prev: number | null = null;
  return values.map((v, i) => {
    if (i < n - 1) return null;
    if (prev === null) prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else prev = v * k + prev * (1 - k);
    return prev;
  });
}

function rsi(values: number[], n = 14): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  if (values.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = values[i] - values[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n;
    loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

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

const path = (pts: Array<[number, number] | null>) => {
  let d = '', pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `; pen = true; }
  return d.trim();
};

/** What each voice says, in chart terms: the level it owns and its claim about it. */
function agentClaims(debate: Debate | null, answer: Answer | null): Array<{ key: AgentKey; claim: string }> {
  if (!debate || !answer) return [];
  const [alpha, red, cio] = debate.stances;
  const trade = debate.direction !== 'none';
  const long = debate.direction === 'long';
  const conv = answer.convictionPct != null ? `${Math.round(answer.convictionPct)}%` : null;
  const rr = answer.rewardRisk != null ? ` · R:R ${answer.rewardRisk.toFixed(1)}` : '';
  if (trade) {
    return [
      { key: 'alpha', claim: alpha.level ? t(`${long ? 'Buy' : 'Sell'} zone at ${money(alpha.level.price)}`, `Zona de ${long ? 'compra' : 'venta'} en ${money(alpha.level.price)}`, `Zona de ${long ? 'compra' : 'venda'} em ${money(alpha.level.price)}`) : alpha.line },
      { key: 'red', claim: red.level ? t(`Thesis breaks ${long ? 'below' : 'above'} ${money(red.level.price)}`, `La tesis se rompe ${long ? 'bajo' : 'sobre'} ${money(red.level.price)}`, `A tese quebra ${long ? 'abaixo de' : 'acima de'} ${money(red.level.price)}`) : red.line },
      { key: 'cio', claim: cio.level ? t(`Target ${money(cio.level.price)}${conv ? ` · ${conv}` : ''}${rr}`, `Objetivo ${money(cio.level.price)}${conv ? ` · ${conv}` : ''}${rr}`, `Alvo ${money(cio.level.price)}${conv ? ` · ${conv}` : ''}${rr}`) : cio.line },
    ];
  }
  const range = answer.support != null && answer.resistance != null ? `${money(answer.support)}–${money(answer.resistance)}` : null;
  return [
    { key: 'alpha', claim: alpha.level ? t(`Watching ${money(alpha.level.price)}`, `Vigila ${money(alpha.level.price)}`, `De olho em ${money(alpha.level.price)}`) : t('No clean setup', 'Sin setup limpio', 'Sem setup limpo') },
    { key: 'red', claim: range ? t(`No edge inside ${range}`, `Sin ventaja dentro de ${range}`, `Sem vantagem dentro de ${range}`) : t('Not enough structure', 'Sin estructura suficiente', 'Sem estrutura suficiente') },
    { key: 'cio', claim: t(`No trade${conv ? ` · ${conv} < 55%` : ''}`, `No trade${conv ? ` · ${conv} < 55%` : ''}`, `No trade${conv ? ` · ${conv} < 55%` : ''}`) },
  ];
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

  const RSI_H = 54;
  const total = height + RSI_H + 22;

  const g = useMemo(() => {
    if (series.length < 2 || w < 120) return null;
    const allCloses = series.map((c) => c.close);
    const e20All = ema(allCloses, 20);
    const e50All = ema(allCloses, 50);
    const rsiAll = rsi(allCloses, 14);
    const from = Math.max(0, series.length - POINTS);
    const pts = series.slice(from);
    const e20 = e20All.slice(from);
    const e50 = e50All.slice(from);
    const rs = rsiAll.slice(from);
    const trade = !!debate && debate.direction !== 'none';
    const levels: Level[] = [];
    if (answer?.resistance != null) levels.push({ key: 'res', agent: null, price: answer.resistance, label: t('Resistance', 'Resistencia', 'Resistência'), color: '#A39C91', hair: true });
    if (answer?.support != null) levels.push({ key: 'sup', agent: null, price: answer.support, label: t('Support', 'Soporte', 'Suporte'), color: '#A39C91', hair: true });
    if (trade && debate) {
      const [alpha, red, cio] = debate.stances;
      if (alpha.level) levels.push({ key: 'entry', agent: 'alpha', price: alpha.level.price, to: alpha.level.to, label: t('Entry', 'Entrada', 'Entrada'), color: AGENT_TONE.alpha });
      if (red.level) levels.push({ key: 'stop', agent: 'red', price: red.level.price, label: t('Stop', 'Stop', 'Stop'), color: AGENT_TONE.red, dashed: true });
      if (cio.level) levels.push({ key: 'target', agent: 'cio', price: cio.level.price, label: t('Target', 'Objetivo', 'Alvo'), color: AGENT_TONE.cio });
    }
    const closes = pts.map((p) => p.close);
    const emaVals = [...e20, ...e50].filter((v): v is number => v !== null);
    const values = [...closes, ...emaVals, ...levels.map((l) => l.price), ...levels.flatMap((l) => (l.to !== undefined ? [l.to] : []))];
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const pad = (hi - lo) * 0.1 || hi * 0.01;
    lo -= pad; hi += pad;
    const top = 22, volH = 26, bottom = height - 8;
    const plotBottom = bottom - volH - 4;
    const y = (v: number) => plotBottom - ((v - lo) / (hi - lo)) * (plotBottom - top);
    const nowX = Math.round(w * (w < 520 ? 0.64 : 0.72));
    const x = (i: number) => (i / (pts.length - 1)) * nowX;
    const line = path(pts.map((p, i) => [x(i), y(p.close)]));
    const area = `${line} L${nowX},${plotBottom} L0,${plotBottom} Z`;
    const tailFrom = Math.floor(pts.length * 0.8);
    const tail = path(pts.slice(tailFrom).map((p, i) => [x(tailFrom + i), y(p.close)]));
    const ema20 = path(e20.map((v, i) => (v === null ? null : [x(i), y(v)])));
    const ema50 = path(e50.map((v, i) => (v === null ? null : [x(i), y(v)])));
    // volume, scaled to its own band at the foot of the plot
    const vols = pts.map((p) => p.volume ?? 0);
    const vmax = Math.max(...vols);
    const barW = Math.max(1.5, (nowX / pts.length) * 0.55);
    const volume = vmax > 0 ? pts.map((p, i) => {
      const h = ((p.volume ?? 0) / vmax) * volH;
      const up = i === 0 || p.close >= pts[i - 1].close;
      return { x: x(i) - barW / 2, y: bottom - h, h, up };
    }) : [];
    // RSI strip
    const rTop = height + 10, rBot = height + RSI_H;
    const ry = (v: number) => rBot - (v / 100) * (rBot - rTop);
    const rsiLine = path(rs.map((v, i) => (v === null ? null : [x(i), ry(v)])));
    const rsiLast = [...rs].reverse().find((v) => v !== null) ?? null;
    const last = closes[closes.length - 1];
    const price = answer?.price ?? last;
    const nowY = y(last);
    // the plan's zones in the future: reward (entry → target) and risk (entry → stop)
    const entry = levels.find((l) => l.key === 'entry');
    const stop = levels.find((l) => l.key === 'stop');
    const target = levels.find((l) => l.key === 'target');
    const zones = entry && stop && target ? [
      { y1: y(entry.price), y2: y(target.price), color: AGENT_TONE.cio },
      { y1: y(entry.price), y2: y(stop.price), color: AGENT_TONE.red },
    ] : [];
    // labels in the future zone, pushed apart so two close levels never overprint
    const labeled = levels.map((l) => ({ ...l, ly: y(l.price) })).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < labeled.length; i++) if (labeled[i].ly - labeled[i - 1].ly < 13) labeled[i].ly = labeled[i - 1].ly + 13;
    const ticks = levels.some((l) => l.hair) ? [] : niceTicks(lo, hi).map((v) => ({ v, y: y(v) }));
    const lastTs = pts[pts.length - 1].ts;
    const asOf = Number.isFinite(lastTs) ? new Date(lastTs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    const e20Last = [...e20].reverse().find((v) => v !== null) ?? null;
    const e50Last = [...e50].reverse().find((v) => v !== null) ?? null;
    return { levels, labeled, line, area, tail, ema20, ema50, volume, barW, rsiLine, rsiLast, rTop, rBot, ry, nowX, nowY, top, plotBottom, bottom, y, price, zones, ticks, asOf, len: pts.length, e20Last, e50Last };
  }, [series, answer, debate, w, height]);

  const claims = useMemo(() => agentClaims(debate, answer), [debate, answer]);
  const source = isEquity ? `1H · ${symbol}` : `1H · OKX · ${symbol}-USDT`;
  const draw = drawn ? 1 : 0;
  const fade = (delay: number) => ({ opacity: draw, transition: `opacity .45s ease ${delay}s` });

  return (
    <div className="w-full">
      {claims.length > 0 && (
        <div className="n-claims">
          {claims.map((c, i) => (
            <div key={c.key} className="n-claim" style={fade(1.2 + i * 0.15)}>
              <span className="n-voice-name" style={{ color: AGENT_TONE[c.key] }}><i />{AGENT_SHORT[c.key]}</span>
              <span className="n-claim-t">{c.claim}</span>
            </div>
          ))}
        </div>
      )}
      <div ref={wrap} className="relative w-full" style={{ height: total }}>
        {!g ? (
          <div className="absolute inset-0 grid place-items-center"><span className="n-label">{series.length ? '' : t('Loading the chart', 'Cargando la gráfica', 'Carregando o gráfico')}</span></div>
        ) : (
          <svg width={w} height={total} viewBox={`0 0 ${w} ${total}`} role="img" aria-label={t(`${symbol} price, last ${g.len} hours, with the desk's levels, EMA 20 and 50, volume and RSI 14`, `Precio de ${symbol}, últimas ${g.len} horas, con los niveles del desk, EMA 20 y 50, volumen y RSI 14`, `Preço de ${symbol}, últimas ${g.len} horas, com os níveis do desk, EMA 20 e 50, volume e RSI 14`)} style={{ overflow: 'visible', display: 'block' }}>
            <defs>
              <linearGradient id={`l${uid}`} x1="0" x2={g.nowX} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#F2EDE4" stopOpacity=".3" /><stop offset=".72" stopColor="#F2EDE4" stopOpacity=".82" /><stop offset="1" stopColor="#FFF8EC" />
              </linearGradient>
              <linearGradient id={`a${uid}`} x1="0" x2="0" y1={g.top} y2={g.plotBottom} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#F2EDE4" stopOpacity=".07" /><stop offset="1" stopColor="#F2EDE4" stopOpacity="0" />
              </linearGradient>
              <filter id={`b${uid}`} x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="2" /></filter>
            </defs>

            {/* indicator legend */}
            <text x="0" y="9" className="n-tick" style={{ ...fade(0.9), letterSpacing: '.08em' }}>
              <tspan fill="#5CE1FF">— EMA 20{g.e20Last !== null ? ` ${axis(g.e20Last)}` : ''}</tspan>
              <tspan dx="12" fill="#A39C91">··· EMA 50{g.e50Last !== null ? ` ${axis(g.e50Last)}` : ''}</tspan>
            </text>

            {/* the future zone, and the plan's reward / risk inside it */}
            <rect x={g.nowX} y={g.top - 6} width={w - g.nowX} height={g.bottom - g.top + 6} fill="rgba(242,237,228,.02)" />
            {g.zones.map((z, i) => (
              <rect key={i} x={g.nowX + 1} width={w - g.nowX - 1} y={Math.min(z.y1, z.y2)} height={Math.abs(z.y2 - z.y1)} fill={z.color} fillOpacity=".1" style={fade(1.3)} />
            ))}
            {g.ticks.map((tk) => (
              <g key={tk.v} style={fade(0.9)}>
                <line x1="0" x2={w} y1={tk.y} y2={tk.y} stroke="rgba(242,237,228,.06)" />
                <text x="0" y={tk.y - 4} className="n-tick">{axis(tk.v)}</text>
              </g>
            ))}

            {/* volume */}
            <g style={fade(0.7)}>
              {g.volume.map((b, i) => <rect key={i} x={b.x} y={b.y} width={g.barW} height={b.h} rx="1" fill={b.up ? 'rgba(242,237,228,.16)' : 'rgba(242,237,228,.08)'} />)}
            </g>

            {/* levels: the entry zone as a band, the rest as lines */}
            {g.levels.map((l, i) => {
              const ly = g.y(l.price);
              return (
                <g key={l.key} style={fade(1.1 + i * 0.1)}>
                  {l.to !== undefined && <rect x="0" width={w} y={Math.min(ly, g.y(l.to))} height={Math.abs(g.y(l.to) - ly)} fill={l.color} opacity=".07" />}
                  <line x1="0" x2={w} y1={ly} y2={ly} stroke={l.hair ? 'rgba(242,237,228,.34)' : l.color} strokeOpacity={l.hair ? 1 : 0.75} strokeWidth={l.hair ? 0.75 : 1} strokeDasharray={l.dashed ? '3 4' : l.hair ? '2 4' : undefined} />
                </g>
              );
            })}
            {g.labeled.map((l, i) => (
              <g key={l.key} style={fade(1.1 + i * 0.1)}>
                {l.agent && <circle cx={w - 3} cy={l.ly - 7.5} r="2.5" fill={l.color} />}
                <text x={l.agent ? w - 10 : w} y={l.ly - 4} textAnchor="end" className="n-tick" fill={l.hair ? '#A39C91' : l.color} style={{ letterSpacing: '.06em' }}>
                  {l.agent && w >= 520 ? `${AGENT_SHORT[l.agent].toUpperCase()} · ` : ''}{l.label.toUpperCase()} {money(l.price)}
                </text>
              </g>
            ))}

            {/* EMA 20 / 50 under the price */}
            <path d={g.ema50} fill="none" stroke="#A39C91" strokeOpacity=".45" strokeWidth="1" strokeDasharray="1 3" style={fade(0.9)} />
            <path d={g.ema20} fill="none" stroke="#5CE1FF" strokeOpacity=".5" strokeWidth="1" style={fade(0.9)} />

            {/* the line, exhaled left to right */}
            <path d={g.area} fill={`url(#a${uid})`} style={fade(0.8)} />
            <path d={g.tail} fill="none" stroke="#FFF8EC" strokeWidth="3" strokeLinecap="round" opacity={0.22 * draw} filter={`url(#b${uid})`} style={{ transition: 'opacity .4s ease 1.2s' }} />
            <path d={g.line} fill="none" stroke={`url(#l${uid})`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" pathLength={1}
              style={{ strokeDasharray: 1, strokeDashoffset: 1 - draw, transition: drawn ? 'stroke-dashoffset 1.2s cubic-bezier(.3,.7,.2,1)' : 'none' }} />

            {/* NOW */}
            <g style={fade(1.15)}>
              <circle cx={g.nowX} cy={g.nowY} r="10" fill="#FFF8EC" opacity=".12" />
              <circle className="n-now-pulse" cx={g.nowX} cy={g.nowY} r="3.6" fill="none" stroke="#FFF8EC" />
              <circle cx={g.nowX} cy={g.nowY} r="3.4" fill="#FFF8EC" />
              <text x={g.nowX - 10} y={g.nowY - 10} textAnchor="end" className="n-chart-price">{money(g.price)}</text>
            </g>

            {/* RSI 14 */}
            <g style={fade(1.0)}>
              <rect x="0" y={g.ry(70)} width={g.nowX} height={g.ry(30) - g.ry(70)} fill="rgba(242,237,228,.03)" />
              <line x1="0" x2={g.nowX} y1={g.ry(70)} y2={g.ry(70)} stroke="rgba(255,90,95,.35)" strokeDasharray="2 4" />
              <line x1="0" x2={g.nowX} y1={g.ry(30)} y2={g.ry(30)} stroke="rgba(63,224,181,.35)" strokeDasharray="2 4" />
              <path d={g.rsiLine} fill="none" stroke="#F2EDE4" strokeOpacity=".7" strokeWidth="1.25" />
              {g.rsiLast !== null && <circle cx={g.nowX} cy={g.ry(g.rsiLast)} r="2.5" fill="#FFF8EC" />}
              <text x={g.nowX + 12} y={g.rTop + 10} className="n-tick" style={{ letterSpacing: '.1em' }}>RSI 14</text>
              <text x={g.nowX + 12} y={g.rBot} className="n-tick">{g.rsiLast !== null && g.rsiLast >= 70 ? t('overbought', 'sobrecompra', 'sobrecomprado') : g.rsiLast !== null && g.rsiLast <= 30 ? t('oversold', 'sobreventa', 'sobrevendido') : '70 / 30'}</text>
            </g>

            <text x="0" y={total - 4} className="n-tick" style={{ letterSpacing: '.1em' }}>
              {source.toUpperCase()}{g.asOf ? ` · ${t('AS OF', 'A LAS', 'ÀS')} ${g.asOf}` : ''}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}
