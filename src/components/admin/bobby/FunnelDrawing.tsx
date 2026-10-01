// The drawn funnel: stacked trapezoid bands whose width follows the count (with a floor so small stages stay
// visible). The top band is the brightest orange and each later one fades toward grey; the hovered or tapped
// band lights up and shows its detail. Aggregate bands (Google, App Store) are outlined: same funnel, not the
// same cohort. Mono numbers on the sides: count, share of the top, step conversion and who left.
import { useState, type KeyboardEvent } from 'react';
import { fmtInt, fmtPct } from './format';

export interface FunnelStage {
  key: string;
  label: string;
  value: number | null;
  /** Aggregate source (Google, App Store): drawn outlined, not compared step-by-step with the cohort. */
  aggregate?: boolean;
  /** Shown inside a dashed band when the source is not connected (value null). */
  missing?: string;
  hint: string;
}

const ORANGE_TOP = [247, 160, 75];
const ORANGE_BOTTOM = [232, 105, 43];
const GREY = [52, 52, 54];
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

const FLOOR_TOP = 22;
const FLOOR_BOTTOM = 8;
const BAND_H = 40;

export default function FunnelDrawing({ stages, idPrefix }: { stages: FunnelStage[]; idPrefix: string }) {
  const [active, setActive] = useState<number | null>(null);
  const firstCohort = stages.findIndex((s) => !s.aggregate);
  const contextCount = Math.max(0, firstCohort);
  const cohort = stages.filter((s) => !s.aggregate);
  const cohortMax = Math.max(0, ...cohort.map((s) => s.value ?? 0));
  const cohortTop = firstCohort >= 0 ? stages[firstCohort].value ?? 0 : 0;
  const maxW = 100 - contextCount * 7;

  // Context bands sit wide on top; cohort bands are proportional to the largest cohort stage, over a floor
  // that shrinks down the funnel (22% → 8%) so small stages stay visible and the silhouette keeps narrowing.
  const cohortCount = cohort.length;
  const widths = stages.map((s, i) => {
    if (s.aggregate) return 100 - i * 7;
    const k = i - contextCount;
    const floor = cohortCount > 1 ? FLOOR_TOP - ((FLOOR_TOP - FLOOR_BOTTOM) * k) / (cohortCount - 1) : FLOOR_TOP;
    if (!cohortMax || s.value == null) return floor;
    return Math.max(floor, (maxW * s.value) / cohortMax);
  });
  const fadeSteps = Math.max(1, stages.length - 1);

  const step = (i: number): { conv: string | null; left: number | null; note?: string } => {
    if (i === 0) return { conv: null, left: null };
    const s = stages[i], p = stages[i - 1];
    if (!!p.aggregate !== !!s.aggregate) return { conv: null, left: null, note: 'otra cohorte' };
    if (s.value == null || p.value == null) return { conv: null, left: null };
    return { conv: fmtPct(s.value, p.value), left: p.value - s.value };
  };
  const shareOfTop = (s: FunnelStage, i: number) => {
    if (s.value == null) return '—';
    if (s.aggregate) return i === 0 ? '100%' : stages[0].value ? fmtPct(s.value, stages[0].value) : '—';
    return cohortTop ? fmtPct(s.value, cohortTop) : '—';
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(active === i ? null : i); }
    if (e.key === 'Escape') setActive(null);
  };

  return (
    <div className="flex flex-col" onMouseLeave={() => setActive(null)}>
      {stages.map((s, i) => {
        const top = widths[i];
        const bottom = i < stages.length - 1 ? Math.min(widths[i + 1], top) : top * 0.82;
        const on = active === i;
        const { conv, left, note } = step(i);
        const t = i / fadeSteps;
        const gid = `${idPrefix}-g${i}`;
        const missing = s.value == null;
        const points = `${(100 - top) / 2},0 ${(100 + top) / 2},0 ${(100 + bottom) / 2},${BAND_H} ${(100 - bottom) / 2},${BAND_H}`;
        // The first band is the brightest orange; later ones fade to grey. The active one is full orange.
        const fade = on ? 0 : Math.min(1, t * 1.05);
        const fillTop = mix(ORANGE_TOP, GREY, fade);
        const fillBottom = mix(ORANGE_BOTTOM, GREY, on ? 0 : Math.min(1, fade + 0.08));
        const summary = `${s.label}: ${missing ? 'sin conectar' : fmtInt(s.value!)}${conv ? `, ${conv} del paso anterior` : ''}`;

        return (
          <div key={s.key}>
            {i > 0 && (
              <div className="grid h-[22px] grid-cols-[minmax(0,1fr)_88px] items-center gap-x-4 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,150px)]" aria-hidden>
                <span className="hidden sm:block" />
                <span className="text-center font-mono text-[10.5px] text-[#F06A6A]/70">{left != null && left > 0 ? `−${fmtInt(left)} se fueron` : ''}</span>
                <span />
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-4 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,150px)]">
              {/* Label + count (desktop) */}
              <div className="hidden min-w-0 text-right sm:block">
                <div className={`truncate text-[13px] ${on ? 'text-[#EDEDED]' : 'text-[#BDBDBD]'}`}>{s.label}</div>
                <div className="flex items-baseline justify-end gap-1.5 font-mono">
                  {s.aggregate && <span className="text-[9.5px] uppercase tracking-[0.06em] text-[#F7A04B]/80">agregado</span>}
                  <span className="text-[15px] font-medium tabular-nums text-[#EDEDED]">{missing ? '—' : fmtInt(s.value!)}</span>
                </div>
              </div>

              {/* The band */}
              <div
                role="button" tabIndex={0} aria-label={summary} aria-pressed={on}
                className="relative cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F28C38]"
                style={{ height: BAND_H }}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive((a) => (a === i ? null : a))}
                onClick={() => setActive(on ? null : i)} onKeyDown={(e) => onKey(e, i)}
              >
                <svg
                  viewBox={`0 0 100 ${BAND_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible"
                  style={{ filter: on && !s.aggregate ? 'drop-shadow(0 0 16px rgba(242,140,56,0.45))' : undefined }} aria-hidden
                >
                  <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={fillTop} />
                      <stop offset="100%" stopColor={fillBottom} />
                    </linearGradient>
                  </defs>
                  {missing ? (
                    <polygon points={points} fill="none" stroke="#5C5C5C" strokeWidth={1.25} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                  ) : s.aggregate ? (
                    <polygon
                      points={points} fill={on ? 'rgba(242,140,56,0.22)' : 'rgba(242,140,56,0.08)'}
                      stroke={on ? '#F7A04B' : 'rgba(242,140,56,0.55)'} strokeWidth={1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    />
                  ) : (
                    <polygon points={points} fill={`url(#${gid})`} stroke={`url(#${gid})`} strokeWidth={6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
                {missing && (
                  <span className="absolute inset-0 flex items-center justify-center px-2 text-center font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#8B8B8B]">{s.missing}</span>
                )}
                {on && (
                  <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 right-0 z-20 mx-auto w-max max-w-[min(280px,100%)] rounded-xl border border-white/[0.08] bg-[#0F0F10]/95 px-3 py-2 shadow-2xl" role="tooltip">
                    <div className="text-[12.5px] text-[#EDEDED]">{s.label}{s.aggregate && <span className="ml-1.5 font-mono text-[10px] uppercase text-[#F7A04B]">agregado</span>}</div>
                    <div className="mt-1 font-mono text-[11.5px] leading-relaxed text-[#8B8B8B]">
                      <div><span className="text-[#EDEDED]">{missing ? '—' : fmtInt(s.value!)}</span> · {shareOfTop(s, i)} del inicio</div>
                      {conv && <div>{conv} del paso anterior{left != null && left > 0 ? ` · −${fmtInt(left)}` : ''}</div>}
                    </div>
                    <div className="mt-1 text-[11.5px] leading-snug text-[#8B8B8B]">{s.hint}</div>
                  </div>
                )}
              </div>

              {/* Share of the top + step conversion */}
              <div className="flex min-w-0 flex-col items-start font-mono tabular-nums">
                <span className={conv ? 'text-[13px] text-[#EDEDED]' : 'text-[11px] text-[#5C5C5C] sm:text-[13px]'}>{conv ? `↓ ${conv}` : i === 0 ? 'inicio' : note ?? '—'}</span>
                <span className="hidden text-[10.5px] text-[#5C5C5C] sm:inline">{shareOfTop(s, i)} del inicio</span>
              </div>

              {/* Label below the band on phones */}
              <div className="col-span-2 mt-1 flex min-w-0 items-baseline justify-between gap-2 sm:hidden">
                <span className={`truncate text-[12.5px] ${on ? 'text-[#EDEDED]' : 'text-[#BDBDBD]'}`}>
                  {s.label}{s.aggregate && <span className="ml-1.5 font-mono text-[9.5px] uppercase text-[#F7A04B]/80">agregado</span>}
                </span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums text-[#EDEDED]">
                  {missing ? '—' : fmtInt(s.value!)} <span className="text-[10.5px] text-[#5C5C5C]">{shareOfTop(s, i)}</span>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
