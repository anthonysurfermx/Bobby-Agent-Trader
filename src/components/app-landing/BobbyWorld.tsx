// Bobby's world — the closing section of /app-world.
//
// A drag-to-explore sky of floating islands built from the App Store plate 07
// cut-outs. Four layers move at different speeds (parallax), so the page feels
// like a place you walk into rather than a screenshot. Each island carries one
// habit from the real Trader Land loop — read the whole thing, take a no, come
// back tomorrow — and the fogged islands say new ground opens with discipline.
//
// The stage is drawn in fixed design units (1440×900 on desktop, 390×844 on
// phones) and scaled to cover the section, so positions stay art-directed at
// every size. Only horizontal drags are captured; vertical swipes still scroll
// the page on touch screens.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { t } from '@/lib/companions/i18n';
import { APP_STORE_URL } from '@/lib/app-store';
import './app-landing-a3.css';

type Layer = 'far' | 'mid' | 'near' | 'front';
type Habit = 'read' | 'no' | 'return' | 'locked';
type Side = 'left' | 'right' | 'below';

const DEPTH: Record<Layer, number> = { far: 0.4, mid: 0.8, near: 1, front: 1.3 };
const W = '/app/world';
const MONO = "[font-family:'Geist_Mono',ui-monospace,monospace]";

interface Pet { src: string; x: number; y: number; w: number }
interface Spot { habit: Habit; x: number; y: number; side: Side }
interface Island {
  key: string;
  src: string;
  alt?: string;
  layer: Layer;
  x: number;
  y: number;
  w: number;
  bob?: 'a' | 'b' | 'c';
  flip?: boolean;
  opacity?: number;
  fog?: boolean;
  /** Softens an edge that was cut straight by the source plate's frame. */
  fade?: 'left' | 'right';
  pets?: Pet[];
  spot?: Spot;
}
interface Stage {
  w: number;
  h: number;
  min: number;
  max: number;
  tiltY: boolean;
  islands: Island[];
  clouds: { x: number; y: number; w: number; flip?: boolean }[];
}

const DESKTOP: Stage = {
  w: 1440, h: 900, min: -800, max: 650, tiltY: true,
  islands: [
    { key: 'f1', src: `${W}/mini-2.webp`, layer: 'far', x: 700, y: 110, w: 70, opacity: 0.55 },
    { key: 'f2', src: `${W}/mini-1.webp`, layer: 'far', x: 1520, y: 60, w: 120, opacity: 0.5 },
    { key: 'f3', src: `${W}/mini-3.webp`, layer: 'far', x: 180, y: 560, w: 80, opacity: 0.45 },
    { key: 'f4', src: `${W}/mini-4.webp`, layer: 'far', x: 2000, y: 470, w: 110, opacity: 0.45, flip: true },
    { key: 'f5', src: `${W}/mini-2.webp`, layer: 'far', x: -260, y: 150, w: 56, opacity: 0.45 },
    { key: 'f6', src: `${W}/mini-1.webp`, layer: 'far', x: -620, y: 520, w: 100, opacity: 0.4, flip: true },
    { key: 'm1', src: `${W}/mini-4.webp`, layer: 'mid', x: 1090, y: 36, w: 150 },
    { key: 'm2', src: `${W}/mini-3.webp`, layer: 'mid', x: 1340, y: 120, w: 110 },
    {
      key: 'observatory', src: `${W}/isl-observatory.webp`, layer: 'mid', x: -40, y: 290, w: 400, bob: 'b', fade: 'left',
      alt: 'The observatory island, with Iris beside a telescope dome',
      spot: { habit: 'read', x: 175, y: 100, side: 'right' },
    },
    {
      key: 'pool', src: `${W}/isl-pool.webp`, layer: 'mid', x: 1260, y: 240, w: 480, bob: 'c', fade: 'right',
      alt: 'The reflecting pool island, with Sol by the water under a stone arch',
      pets: [{ src: `${W}/pet-glitch.webp`, x: 96, y: 372, w: 58 }],
      spot: { habit: 'return', x: 190, y: 310, side: 'left' },
    },
    {
      key: 'fog-r', src: `${W}/mini-1.webp`, layer: 'mid', x: 1720, y: 170, w: 280, bob: 'a', fog: true,
      spot: { habit: 'locked', x: 140, y: 130, side: 'below' },
    },
    {
      key: 'fog-l', src: `${W}/mini-4.webp`, layer: 'mid', x: -380, y: 330, w: 230, bob: 'c', fog: true, flip: true,
      spot: { habit: 'locked', x: 115, y: 95, side: 'below' },
    },
    {
      key: 'garden', src: `${W}/isl-garden.webp`, layer: 'near', x: 560, y: 176, w: 700, bob: 'a',
      alt: 'The garden island, with Byte beside a dome house, a tree and a vegetable bed',
      pets: [{ src: `${W}/pet-sol.webp`, x: 214, y: 398, w: 46 }],
      spot: { habit: 'no', x: 130, y: 352, side: 'left' },
    },
  ],
  clouds: [
    { x: -420, y: 650, w: 1120 },
    { x: 560, y: 700, w: 1200, flip: true },
    { x: 1640, y: 670, w: 1060 },
  ],
};

const MOBILE: Stage = {
  w: 390, h: 844, min: -600, max: 600, tiltY: false,
  islands: [
    { key: 'f1', src: `${W}/mini-2.webp`, layer: 'far', x: 300, y: 250, w: 40, opacity: 0.55 },
    { key: 'f2', src: `${W}/mini-1.webp`, layer: 'far', x: 520, y: 230, w: 70, opacity: 0.5 },
    { key: 'f3', src: `${W}/mini-3.webp`, layer: 'far', x: -200, y: 280, w: 50, opacity: 0.45 },
    { key: 'm1', src: `${W}/mini-4.webp`, layer: 'mid', x: 250, y: 236, w: 80 },
    {
      key: 'observatory', src: `${W}/isl-observatory.webp`, layer: 'mid', x: -215, y: 340, w: 190, bob: 'b', fade: 'left',
      alt: 'The observatory island, with Iris beside a telescope dome',
      spot: { habit: 'read', x: 83, y: 48, side: 'right' },
    },
    {
      key: 'pool', src: `${W}/isl-pool.webp`, layer: 'mid', x: 330, y: 350, w: 230, bob: 'c', fade: 'right',
      alt: 'The reflecting pool island, with Sol by the water under a stone arch',
      pets: [{ src: `${W}/pet-glitch.webp`, x: 46, y: 178, w: 28 }],
      spot: { habit: 'return', x: 96, y: 144, side: 'left' },
    },
    {
      key: 'fog-r', src: `${W}/mini-1.webp`, layer: 'mid', x: 640, y: 250, w: 170, bob: 'a', fog: true,
      spot: { habit: 'locked', x: 85, y: 85, side: 'below' },
    },
    {
      key: 'fog-l', src: `${W}/mini-4.webp`, layer: 'mid', x: -440, y: 300, w: 150, bob: 'c', fog: true, flip: true,
      spot: { habit: 'locked', x: 75, y: 67, side: 'below' },
    },
    {
      key: 'garden', src: `${W}/isl-garden.webp`, layer: 'near', x: 36, y: 290, w: 330, bob: 'a',
      alt: 'The garden island, with Byte beside a dome house, a tree and a vegetable bed',
      pets: [{ src: `${W}/pet-sol.webp`, x: 101, y: 188, w: 22 }],
      spot: { habit: 'no', x: 62, y: 168, side: 'below' },
    },
  ],
  clouds: [
    { x: -260, y: 590, w: 620 },
    { x: 240, y: 610, w: 640, flip: true },
  ],
};

function habitCopy(habit: Habit) {
  switch (habit) {
    case 'read':
      return {
        pin: t('Read the whole thing', 'Lee todo'),
        place: t('THE OBSERVATORY', 'EL OBSERVATORIO'),
        title: t('Read the whole thing.', 'Lee el análisis completo.'),
        body: t(
          'Every full analysis you read — both sides, not just the verdict — lights up a new corner of your world.',
          'Cada análisis que lees completo — los dos lados, no solo el veredicto — ilumina un rincón nuevo de tu mundo.',
        ),
      };
    case 'no':
      return {
        pin: t('Take a no for an answer', 'Acepta un no'),
        place: t('THE GARDEN', 'EL JARDÍN'),
        title: t('Take a no for an answer.', 'Acepta un no.'),
        body: t(
          'When Bobby says wait and you actually wait, the garden grows.',
          'Cuando Bobby dice espera y de verdad esperas, el jardín crece.',
        ),
      };
    case 'return':
      return {
        pin: t('Come back tomorrow', 'Vuelve mañana'),
        place: t('THE REFLECTING POOL', 'EL ESTANQUE'),
        title: t('Come back tomorrow.', 'Vuelve mañana.'),
        body: t(
          'Your reads age. Come back, see how yesterday’s calls held up, and look back at your trades without the noise.',
          'Tus lecturas envejecen. Vuelve, mira cómo aguantaron las llamadas de ayer y repasa tus trades sin ruido.',
        ),
      };
    default:
      return {
        pin: t('Locked', 'Bloqueada'),
        place: t('STILL IN THE FOG', 'TODAVÍA EN LA NIEBLA'),
        title: t('New ground opens as your habits hold.', 'Se abre terreno nuevo cuando tus hábitos se sostienen.'),
        body: t(
          'It grows with discipline — never with how much you trade.',
          'Crece con disciplina — nunca con cuánto operas.',
        ),
      };
  }
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function SpotButton({ spot, onOpen, compact }: { spot: Spot; onOpen: (h: Habit) => void; compact: boolean }) {
  const copy = habitCopy(spot.habit);
  if (spot.habit === 'locked') {
    return (
      <button
        type="button"
        onClick={() => onOpen('locked')}
        aria-label={copy.title}
        className="pointer-events-auto absolute flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#050706]/80 px-4 font-extrabold text-[#FBFAF1] transition hover:bg-[#050706]"
        style={{ left: spot.x, top: spot.y, fontSize: compact ? 13 : 15 }}
      >
        <LockIcon />
        {copy.pin}
      </button>
    );
  }
  const layout =
    spot.side === 'below'
      ? 'flex-col -translate-x-1/2 -translate-y-[22px]'
      : spot.side === 'left'
        ? 'flex-row-reverse -translate-y-[22px] translate-x-[calc(-100%+22px)]'
        : 'flex-row -translate-x-[22px] -translate-y-[22px]';
  return (
    <button
      type="button"
      onClick={() => onOpen(spot.habit)}
      aria-label={copy.title}
      className={`group pointer-events-auto absolute flex items-center gap-2 ${layout}`}
      style={{ left: spot.x, top: spot.y }}
    >
      <span className="a3-pulse grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#7FFABD]/45">
        <span className="h-4 w-4 rounded-full border-[3px] border-white bg-[#1FA463]" />
      </span>
      <span
        className="whitespace-nowrap rounded-full bg-[#050706] px-3.5 py-2 font-extrabold text-[#FBFAF1] shadow-[0_8px_20px_rgba(5,7,6,.18)] transition group-hover:bg-[#13784A]"
        style={{ fontSize: compact ? 13 : 16 }}
      >
        {copy.pin}
      </span>
    </button>
  );
}

export default function BobbyWorld() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ w: 1440, h: 900 });
  const [x, setX] = useState(reduceMotion ? 0 : 160);
  const [y, setY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);
  const [open, setOpen] = useState<Habit | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; id: number; captured: boolean } | null>(null);

  const stage = box.w < 768 ? MOBILE : DESKTOP;
  const scale = Math.max(box.w / stage.w, box.h / stage.h);
  const offsetX = (box.w - stage.w * scale) / 2;
  const offsetY = (box.h - stage.h * scale) / 2;
  const compact = stage === MOBILE;

  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A short glide into place the first time the world scrolls into view: it tells
  // people the islands move before anyone has to read "drag to explore".
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || reduceMotion) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setX((current) => (current === 160 ? 0 : current));
          io.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const clampX = useCallback((v: number) => Math.max(stage.min, Math.min(stage.max, v)), [stage]);

  const nudge = (dir: 1 | -1) => {
    setMoved(true);
    setX((current) => clampX(current + dir * (compact ? 260 : 420)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: x, oy: y, id: e.pointerId, captured: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.captured) {
      // Only a mostly-horizontal gesture belongs to the world; anything else is a page scroll.
      if (Math.abs(dx) < 6 || Math.abs(dy) > Math.abs(dx)) return;
      d.captured = true;
      try { e.currentTarget.setPointerCapture(d.id); } catch { /* pointer already gone */ }
      setDragging(true);
      setMoved(true);
    }
    setX(clampX(d.ox + dx / scale));
    if (stage.tiltY) setY(Math.max(-50, Math.min(50, d.oy + (dy / scale) * 0.4)));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(-1); }
  };

  const layerStyle = (layer: Layer): React.CSSProperties => ({
    transform: `translate3d(${(x * DEPTH[layer]).toFixed(1)}px, ${(y * DEPTH[layer]).toFixed(1)}px, 0)`,
    transition: dragging || reduceMotion ? 'none' : 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)',
  });

  const card = open ? habitCopy(open) : null;
  const layers: Layer[] = ['far', 'mid', 'near'];

  return (
    <section
      ref={sectionRef}
      id="world"
      aria-label={t('Bobby’s world', 'El mundo de Bobby')}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`a3-poster a3-poster-card relative h-[100svh] min-h-[700px] select-none overflow-clip bg-[linear-gradient(180deg,#F3FDD6_0%,#EAF9E2_55%,#F8FCF4_100%)] text-[#050706] outline-none [touch-action:pan-y] lg:min-h-[640px] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ zIndex: 70 }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: stage.w, height: stage.h, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}
      >
        <div className="pointer-events-none absolute left-[-100px] top-[380px] h-[560px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgba(127,250,189,.38),rgba(127,250,189,0))]" />
        <div className="pointer-events-none absolute left-[900px] top-[260px] h-[600px] w-[800px] rounded-full bg-[radial-gradient(closest-side,rgba(127,250,189,.28),rgba(127,250,189,0))]" />

        {layers.map((layer) => (
          <div key={layer} className="pointer-events-none absolute inset-0" style={layerStyle(layer)}>
            {stage.islands.filter((i) => i.layer === layer).map((island) => (
              <div
                key={island.key}
                className={`absolute ${island.bob ? `a3-bob-${island.bob}` : ''}`}
                style={{ left: island.x, top: island.y, width: island.w }}
              >
                <img
                  src={island.src}
                  alt={island.alt ?? ''}
                  draggable={false}
                  loading="lazy"
                  className="pointer-events-none block w-full"
                  style={{
                    opacity: island.opacity ?? 1,
                    transform: island.flip ? 'scaleX(-1)' : undefined,
                    filter: island.fog ? 'saturate(0.4) brightness(1.08)' : undefined,
                    maskImage: island.fade ? `linear-gradient(${island.fade === 'right' ? '90deg' : '270deg'}, #000 80%, transparent 100%)` : undefined,
                    WebkitMaskImage: island.fade ? `linear-gradient(${island.fade === 'right' ? '90deg' : '270deg'}, #000 80%, transparent 100%)` : undefined,
                  }}
                />
                {island.fog && (
                  <div className="pointer-events-none absolute -inset-[22%] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.9),rgba(255,255,255,0))]" />
                )}
                {island.pets?.map((pet) => (
                  <img key={pet.src} src={pet.src} alt="" draggable={false} loading="lazy" className="pointer-events-none absolute" style={{ left: pet.x, top: pet.y, width: pet.w }} />
                ))}
                {island.spot && <SpotButton spot={island.spot} onOpen={setOpen} compact={compact} />}
              </div>
            ))}
          </div>
        ))}

        <div className="pointer-events-none absolute inset-0" style={layerStyle('front')}>
          {stage.clouds.map((c, i) => (
            <img key={i} src={`${W}/clouds.webp`} alt="" draggable={false} loading="lazy" className="absolute" style={{ left: c.x, top: c.y, width: c.w, transform: c.flip ? 'scaleX(-1)' : undefined }} />
          ))}
        </div>
      </div>

      {/* keeps the headline readable when an island drifts under it */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[linear-gradient(180deg,rgba(243,253,214,.96)_0%,rgba(243,253,214,.85)_60%,rgba(243,253,214,0)_100%)] lg:h-[520px] lg:w-[900px] lg:bg-[radial-gradient(ellipse_at_0%_0%,rgba(243,253,214,.95)_0%,rgba(243,253,214,.7)_40%,rgba(243,253,214,0)_72%)]" />

      <div className="pointer-events-none absolute left-5 right-5 top-10 lg:left-14 lg:right-auto lg:top-12">
        <div className={`${MONO} text-[11px] font-semibold tracking-[0.12em] text-[#13784A] lg:text-[13px]`}>{t('BOBBY’S WORLD', 'EL MUNDO DE BOBBY')}</div>
        <h2 className="mt-2.5 text-[44px] font-black leading-[0.9] tracking-[-0.055em] lg:mt-3.5 lg:text-[76px]">
          {t('Your progress', 'Tu progreso')}<br />{t('has a place.', 'tiene un lugar.')}
        </h2>
        <p className="mt-3 max-w-[470px] text-base font-medium leading-[1.4] lg:mt-[18px] lg:text-xl">
          {t(
            'Every read, every no, every comeback builds a world — and a quiet place to look back at your trades.',
            'Cada lectura, cada no, cada regreso construye un mundo — y un lugar tranquilo para repasar tus trades.',
          )}
        </p>
      </div>

      <div className={`${MONO} pointer-events-none absolute inset-x-5 bottom-[108px] text-center text-[10px] font-semibold tracking-[0.08em] lg:inset-x-auto lg:bottom-12 lg:left-14 lg:text-left lg:text-[13px]`}>
        {t('IT GROWS WITH DISCIPLINE — NEVER WITH HOW MUCH YOU TRADE.', 'CRECE CON DISCIPLINA — NUNCA CON CUÁNTO OPERAS.')}
      </div>

      <div className="absolute inset-x-5 bottom-8 flex flex-col items-stretch gap-3 lg:inset-x-auto lg:bottom-9 lg:right-12 lg:flex-row lg:items-center">
        {!moved && (
          <div className="pointer-events-none absolute -top-[92px] left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#FBFAF1]/90 px-4 py-2.5 text-sm font-bold lg:static lg:translate-x-0 lg:text-[15px]">
            <svg width="22" height="14" viewBox="0 0 30 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3L2 8l5 5" /><path d="M23 3l5 5-5 5" /><path d="M2 8h26" />
            </svg>
            {compact ? t('Swipe to explore', 'Desliza para explorar') : t('Drag to explore', 'Arrastra para explorar')}
          </div>
        )}
        <button type="button" onClick={() => nudge(1)} aria-label={t('Explore left', 'Explorar a la izquierda')} className="hidden h-[52px] w-[52px] place-items-center rounded-full border-2 border-[#050706] bg-[#FBFAF1] transition hover:bg-white lg:grid">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" onClick={() => nudge(-1)} aria-label={t('Explore right', 'Explorar a la derecha')} className="hidden h-[52px] w-[52px] place-items-center rounded-full border-2 border-[#050706] bg-[#FBFAF1] transition hover:bg-white lg:grid">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[#050706] px-8 text-lg font-extrabold text-[#FBFAF1] transition hover:bg-black lg:text-[19px]"
        >
          {t('Enter Bobby’s world', 'Entra al mundo de Bobby')}
        </a>
      </div>

      {card && (
        <div
          role="dialog"
          aria-label={card.title}
          className="absolute inset-x-3 bottom-[112px] z-10 flex flex-col gap-2.5 rounded-3xl bg-[#FBFAF1] p-5 shadow-[0_24px_60px_rgba(5,7,6,.25)] lg:inset-x-auto lg:bottom-auto lg:right-12 lg:top-11 lg:w-[380px] lg:gap-3 lg:p-[26px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <span className={`${MONO} text-[11px] font-semibold tracking-[0.12em] text-[#13784A] lg:text-xs`}>{card.place}</span>
            <button type="button" onClick={() => setOpen(null)} aria-label={t('Close', 'Cerrar')} className="grid h-11 w-11 place-items-center rounded-full bg-[#ECEBE2] transition hover:bg-[#E0DFD5]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="text-[26px] font-black leading-none tracking-[-0.04em] lg:text-[32px]">{card.title}</div>
          <p className="text-[15px] font-medium leading-[1.45] lg:text-[17px]">{card.body}</p>
        </div>
      )}
    </section>
  );
}
