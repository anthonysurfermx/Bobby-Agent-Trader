// Charts in the dashboard's language: tall rounded grey bars with one orange highlight (no grid, no y-axis,
// mono caps dates), thick rounded status bars on a dark track, and mono growth chips. Plain divs, so the
// gradients, glow and radii match the reference exactly; every chart keeps a "Ver datos" table.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Card, DeltaLine, DeltaValue, TableScroll, td, th } from './ui';
import { GRAD, type Fill } from './tokens';
import type { Delta } from './deltas';
import { fmtDayLong, fmtDayShort, fmtInt, fmtTick, fmtValue, type ValueFormat } from './format';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Bucket { start: string; end: string; value: number }

/** Daily values, or weekly/biweekly sums when the bars would get thinner than ~22px. Buckets end today. */
function bucketize(days: string[], values: number[], width: number): { buckets: Bucket[]; size: number } {
  const n = days.length;
  const fit = Math.max(1, Math.floor((width || 600) / 22));
  const size = [1, 7, 14, 30].find((s) => Math.ceil(n / s) <= fit) ?? 30;
  const buckets: Bucket[] = [];
  for (let end = n; end > 0; end -= size) {
    const start = Math.max(0, end - size);
    buckets.unshift({ start: days[start], end: days[end - 1], value: values.slice(start, end).reduce((a, b) => a + (b || 0), 0) });
  }
  return { buckets, size };
}

/**
 * The hero bar chart. One bar per day (or per week on narrow screens and long windows); the tallest bar,
 * or the hovered one, is the orange one.
 */
export function BarsChart({ days, values, format = 'int', height = 220, emptyLabel = 'Sin datos en el periodo' }: {
  days: string[]; values: number[]; format?: ValueFormat; height?: number; emptyLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, size } = useMemo(() => bucketize(days, values, width), [days, values, width]);
  const max = Math.max(0, ...buckets.map((b) => b.value));
  const peak = max > 0 ? buckets.findIndex((b) => b.value === max) : -1;
  const active = hover ?? peak;
  const gap = buckets.length > 20 ? 4 : buckets.length > 12 ? 6 : 8;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor((width || 600) / 52))));
  const radius = Math.min(10, Math.max(3, ((width || 600) / buckets.length - gap) / 2.6));
  const plot = height - 26;
  const empty = max === 0;
  const tip = active >= 0 ? buckets[active] : null;

  return (
    <div className="min-w-0">
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/[0.06] font-mono text-[11px] uppercase tracking-[0.08em] text-[#5C5C5C]">{emptyLabel}</div>
        ) : (
          <>
            <div className="flex items-end" style={{ height: plot, gap }} role="img" aria-label={`Gráfica de barras: ${buckets.length} ${size === 1 ? 'días' : 'periodos'}, máximo ${fmtValue(max, format)}`}>
              {buckets.map((b, i) => {
                const on = i === active;
                const h = b.value > 0 ? Math.max(8, (b.value / max) * plot) : 6;
                return (
                  <div key={b.start} className="relative flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)}>
                    <div
                      className="w-full transition-[background,box-shadow] duration-150"
                      style={{
                        height: h,
                        borderRadius: radius,
                        background: on ? GRAD.orange : b.value > 0 ? GRAD.grey : '#1C1C1D',
                        border: on ? '1px solid rgba(255,190,130,0.35)' : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: on ? '0 0 28px rgba(242,140,56,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex" style={{ gap }} aria-hidden>
              {buckets.map((b, i) => (
                <div key={b.start} className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center font-mono text-[10.5px] uppercase tracking-[0.04em] ${i === active ? 'text-[#EDEDED]' : 'text-[#5C5C5C]'}`}>
                  {(buckets.length - 1 - i) % labelEvery === 0 ? fmtTick(b.start) : ''}
                </div>
              ))}
            </div>
            {tip && hover != null && (
              <div
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[#0F0F10]/95 px-2.5 py-1.5 font-mono text-[11px] shadow-xl"
                style={{ left: `${((hover + 0.5) / buckets.length) * 100}%` }}
              >
                <div className="whitespace-nowrap text-[#8B8B8B]">{size === 1 ? fmtDayLong(tip.start) : `${fmtDayShort(tip.start)} – ${fmtDayShort(tip.end)}`}</div>
                <div className="text-[13px] text-[#EDEDED]">{fmtValue(tip.value, format)}</div>
              </div>
            )}
          </>
        )}
      </div>
      {!empty && (
        <details className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-[#5C5C5C]">
          <summary className="cursor-pointer select-none hover:text-[#8B8B8B]">Ver datos</summary>
          <div className="mt-2 max-h-[240px] overflow-y-auto normal-case tracking-normal">
            <TableScroll minWidth={220}>
              <thead><tr><th className={th}>Día</th><th className={`${th} text-right`}>Valor</th></tr></thead>
              <tbody>
                {days.map((d, i) => ({ d, v: values[i] ?? 0 })).reverse().map(({ d, v }) => (
                  <tr key={d}>
                    <td className={`${td} font-mono text-[#8B8B8B]`}>{fmtTick(d)}</td>
                    <td className={`${td} text-right font-mono`}>{fmtValue(v, format)}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          </div>
        </details>
      )}
    </div>
  );
}

/** "7D +25% ↑" chips for the hero card. */
export function GrowthChips({ chips, invert }: { chips: Array<{ w: number; delta: Delta }>; invert?: boolean }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(({ w, delta }) => (
        <div key={w} className="min-w-[84px] rounded-xl border border-white/[0.06] bg-[#1A1A1B] px-3 py-2 font-mono">
          <div className="text-[10.5px] text-[#8B8B8B]">{w}d crecimiento</div>
          <div className="mt-0.5 text-[12px]"><DeltaValue d={delta} invert={invert} /></div>
        </div>
      ))}
    </div>
  );
}

export interface StatusRow { label: string; value: number; display?: ReactNode; fill?: Fill; sub?: ReactNode; missing?: ReactNode }

/** Thick rounded horizontal bars on a dark track: mono label, bar, mono value (+ optional mono sub). */
export function StatusBars({ rows, max, uppercase = true, labelWidth = 104, wrapLabels = false, stackMobile = false }: {
  rows: StatusRow[]; max?: number; uppercase?: boolean; labelWidth?: number; wrapLabels?: boolean;
  /** On phones, put label and value on one line and the bar under them (for long values). */
  stackMobile?: boolean;
}) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value));
  const cols = `minmax(0, ${labelWidth}px) minmax(0, 1fr) auto`;
  // One grid for all rows, so every track starts and ends at the same x whatever the value width.
  // With stackMobile, below `sm` each row is its own two-line grid instead.
  const ulClass = stackMobile
    ? 'm-0 grid list-none grid-cols-1 gap-y-3.5 p-0 sm:items-center sm:gap-x-3 sm:[grid-template-columns:var(--sb-cols)]'
    : 'm-0 grid list-none items-center gap-x-3 gap-y-3.5 p-0';
  const liClass = stackMobile ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:contents' : 'contents';
  return (
    <ul className={ulClass} style={stackMobile ? ({ '--sb-cols': cols } as CSSProperties) : { gridTemplateColumns: cols }}>
      {rows.map((r) => {
        const pct = top > 0 && r.value > 0 ? Math.max(4, Math.min(100, (r.value / top) * 100)) : 0;
        return (
          <li key={r.label} className={liClass}>
            <span className={`${stackMobile ? 'order-1 sm:order-none' : ''} font-mono text-[11.5px] text-[#BDBDBD] ${wrapLabels ? 'leading-snug' : 'truncate'} ${uppercase ? 'uppercase tracking-[0.04em]' : ''}`} title={r.label}>{r.label}</span>
            {r.missing ? (
              <div className={`flex h-[18px] min-w-0 items-center rounded-full border border-dashed border-white/[0.14] px-2.5 ${stackMobile ? 'order-3 col-span-2 sm:order-none sm:col-span-1' : ''}`}>
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#5C5C5C]">{r.missing}</span>
              </div>
            ) : (
              <div className={`h-[18px] overflow-hidden rounded-full bg-[#1F1F20] ${stackMobile ? 'order-3 col-span-2 sm:order-none sm:col-span-1' : ''}`}>
                {pct > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`, background: GRAD[r.fill ?? 'blue'],
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15)',
                    }}
                  />
                )}
              </div>
            )}
            <span className={`flex items-baseline justify-end gap-2 whitespace-nowrap font-mono text-[12.5px] tabular-nums text-[#EDEDED] ${stackMobile ? 'order-2 sm:order-none' : ''}`}>
              {r.display ?? fmtInt(r.value)}
              {r.sub != null && <span className="text-[11px] text-[#5C5C5C]">{r.sub}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Card header for a status card: label, big mono number and a muted mono caption ("213 en el periodo"). */
export function BigNumber({ label, value, caption, right }: { label: ReactNode; value: ReactNode; caption?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] text-[#EDEDED]/90">{label}</div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 font-mono">
          <span className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[#EDEDED]">{value}</span>
          {caption && <span className="text-[12px] text-[#8B8B8B]">{caption}</span>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** The hero card: label (+ toggle), big mono value, delta, growth chips on the right, then the bars. */
export function HeroCard({ title, toggle, value, delta, invert, chips, children, note }: {
  title: ReactNode; toggle?: ReactNode; value: ReactNode; delta?: Delta | null; invert?: boolean;
  chips?: Array<{ w: number; delta: Delta }>; children: ReactNode; note?: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-[#EDEDED]/90">{title}</span>
            {toggle}
          </div>
          <div className="mt-2 font-mono text-[30px] font-medium leading-none tracking-[-0.02em] text-[#EDEDED]">{value}</div>
          <div className="mt-2"><DeltaLine d={delta} invert={invert} fallback="sin comparación" /></div>
        </div>
        {chips && <GrowthChips chips={chips} invert={invert} />}
      </div>
      {children}
      {note && <p className="m-0 mt-3 font-mono text-[11px] text-[#5C5C5C]">{note}</p>}
    </Card>
  );
}
