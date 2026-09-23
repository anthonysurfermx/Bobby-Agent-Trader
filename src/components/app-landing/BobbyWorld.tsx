// Bobby's world — the voyage that closes /app.
//
// A tall section with a pinned sky. Scrolling down sails the camera sideways
// through Trader Land, stopping at one island per habit — the observatory (read
// the whole thing), the garden (take a no), the reflecting pool (come back
// tomorrow) — and ends at the islands still in the fog, which clear as you
// arrive. Each stop has its own small, soft animation and says what the habit
// does for you. Four parallax layers give the sky depth; Byte's pet runs along
// the route at the bottom so you always know where you are.
//
// The sky is drawn in fixed design units (1440×900 desktop, 390×844 phones) and
// scaled to cover the viewport, so the art direction holds at every size.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { t } from '@/lib/companions/i18n';
import { APP_STORE_URL } from '@/lib/app-store';
import './app-landing-a3.css';

const W = '/app/world';
const MONO = "[font-family:'Geist_Mono',ui-monospace,monospace]";

type Chapter = 'intro' | 'read' | 'no' | 'return' | 'unlock';
const CHAPTERS: Chapter[] = ['intro', 'read', 'no', 'return', 'unlock'];
// where each chapter rests on the scroll track, and the camera keyframes that hold on it
const REST = [0, 0.24, 0.47, 0.7, 0.95];
const CAM_IN = [0, 0.07, 0.2, 0.28, 0.43, 0.51, 0.66, 0.74, 0.9, 1];
const EDGES = [0.13, 0.355, 0.585, 0.82];

interface Decor { src: string; x: number; y: number; w: number; opacity?: number; flip?: boolean }
interface Stage {
  w: number;
  h: number;
  cam: [number, number, number, number, number];
  obs: { x: number; y: number; w: number };
  garden: { x: number; y: number; w: number };
  pool: { x: number; y: number; w: number };
  fog: { x: number; y: number; w: number; src: string; flip?: boolean }[];
  far: Decor[];
  mid: Decor[];
  clouds: { x: number; y: number; w: number; flip?: boolean }[];
  compact: boolean;
}

const DESKTOP: Stage = {
  w: 1440, h: 900, compact: false,
  cam: [230, -60, -1360, -2580, -3840],
  obs: { x: 700, y: 170, w: 540 },
  garden: { x: 1900, y: 130, w: 780 },
  pool: { x: 3220, y: 110, w: 580 },
  fog: [
    { x: 4390, y: 190, w: 420, src: `${W}/mini-1.webp` },
    { x: 4860, y: 430, w: 300, src: `${W}/mini-4.webp`, flip: true },
  ],
  far: [
    { src: `${W}/mini-2.webp`, x: 420, y: 120, w: 70, opacity: 0.5 },
    { src: `${W}/mini-1.webp`, x: 980, y: 70, w: 120, opacity: 0.45 },
    { src: `${W}/mini-3.webp`, x: 1500, y: 520, w: 90, opacity: 0.4 },
    { src: `${W}/mini-4.webp`, x: 2050, y: 90, w: 110, opacity: 0.45, flip: true },
    { src: `${W}/mini-2.webp`, x: 2600, y: 560, w: 60, opacity: 0.4 },
    { src: `${W}/mini-1.webp`, x: 3100, y: 140, w: 100, opacity: 0.4, flip: true },
  ],
  mid: [
    { src: `${W}/mini-4.webp`, x: 1350, y: 60, w: 160 },
    { src: `${W}/mini-3.webp`, x: 2700, y: 40, w: 120 },
    { src: `${W}/mini-2.webp`, x: 3700, y: 90, w: 110 },
    { src: `${W}/mini-3.webp`, x: 360, y: 610, w: 110, flip: true },
  ],
  clouds: [
    { x: -420, y: 660, w: 1120 }, { x: 560, y: 710, w: 1200, flip: true }, { x: 1640, y: 680, w: 1060 },
    { x: 2620, y: 720, w: 1180, flip: true }, { x: 3700, y: 670, w: 1100 }, { x: 4700, y: 710, w: 1200, flip: true },
    { x: 5700, y: 690, w: 1100 },
  ],
};

const MOBILE: Stage = {
  w: 390, h: 844, compact: true,
  cam: [120, 0, -630, -1265, -1880],
  obs: { x: 70, y: 300, w: 250 },
  garden: { x: 660, y: 300, w: 330 },
  pool: { x: 1330, y: 272, w: 260 },
  fog: [
    { x: 1930, y: 300, w: 200, src: `${W}/mini-1.webp` },
    { x: 2135, y: 430, w: 140, src: `${W}/mini-4.webp`, flip: true },
  ],
  far: [
    { src: `${W}/mini-2.webp`, x: 330, y: 280, w: 40, opacity: 0.5 },
    { src: `${W}/mini-1.webp`, x: 620, y: 260, w: 60, opacity: 0.45 },
    { src: `${W}/mini-3.webp`, x: 900, y: 600, w: 50, opacity: 0.4 },
  ],
  mid: [
    { src: `${W}/mini-4.webp`, x: 470, y: 250, w: 80 },
    { src: `${W}/mini-3.webp`, x: 1050, y: 240, w: 70 },
  ],
  clouds: [
    { x: -260, y: 600, w: 620 }, { x: 240, y: 620, w: 640, flip: true }, { x: 780, y: 610, w: 620 },
    { x: 1320, y: 630, w: 640, flip: true }, { x: 1860, y: 610, w: 620 }, { x: 2380, y: 630, w: 640, flip: true },
  ],
};

function chapterCopy(c: Chapter) {
  switch (c) {
    case 'read':
      return {
        n: '01', place: t('THE OBSERVATORY', 'EL OBSERVATORIO'),
        title: t('Read the whole thing.', 'Lee el análisis completo.'),
        body: t('Both sides, not just the verdict. You see what everyone else skips.', 'Los dos lados, no solo el veredicto. Ves lo que todos se saltan.'),
        chip: t('FULL READS LIGHT IT UP', 'CADA LECTURA COMPLETA LO ILUMINA'),
      };
    case 'no':
      return {
        n: '02', place: t('THE GARDEN', 'EL JARDÍN'),
        title: t('Take a no for an answer.', 'Acepta un no.'),
        body: t('When Bobby says wait and you actually wait, the garden grows. Patience you can see.', 'Cuando Bobby dice espera y de verdad esperas, el jardín crece. Paciencia que se ve.'),
        chip: t('EVERY WAIT PLANTS SOMETHING', 'CADA ESPERA SIEMBRA ALGO'),
      };
    case 'return':
      return {
        n: '03', place: t('THE REFLECTING POOL', 'EL ESTANQUE'),
        title: t('Come back tomorrow.', 'Vuelve mañana.'),
        body: t('Your reads age in the open. Come back, see how they held up, and look back at your trades without the noise.', 'Tus lecturas envejecen a la vista. Vuelve, mira cómo aguantaron y repasa tus trades sin ruido.'),
        chip: t('REFLECT, DON’T REACT', 'REFLEXIONA, NO REACCIONES'),
      };
    case 'unlock':
      return {
        n: '04', place: t('STILL IN THE FOG', 'TODAVÍA EN LA NIEBLA'),
        title: t('New ground opens as your habits hold.', 'Se abre terreno nuevo cuando tus hábitos se sostienen.'),
        body: t('It grows with discipline — never with how much you trade.', 'Crece con disciplina — nunca con cuánto operas.'),
        chip: t('UNLOCKED BY DISCIPLINE', 'SE ABRE CON DISCIPLINA'),
      };
    default:
      return null;
  }
}

function Star({ x, y, size, delay, on }: { x: number; y: number; size: number; delay: number; on: boolean }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 24 24" className="pointer-events-none absolute" style={{ left: x, top: y }}
      initial={false}
      animate={on ? { opacity: [0, 1, 0.35, 1], scale: [0.4, 1.1, 0.8, 1], rotate: [0, 20, 0] } : { opacity: 0, scale: 0.4 }}
      transition={on ? { duration: 2.4, delay, repeat: Infinity, repeatType: 'mirror' } : { duration: 0.3 }}
      aria-hidden="true"
    >
      <path d="M12 1 C13 8 16 11 23 12 C16 13 13 16 12 23 C11 16 8 13 1 12 C8 11 11 8 12 1 Z" fill="#FFFFFF" stroke="#7FFABD" strokeWidth="1.2" />
    </motion.svg>
  );
}

function Sprout({ x, y, size, delay, grown }: { x: number; y: number; size: number; delay: number; grown: boolean }) {
  return (
    <motion.svg
      width={size} height={size * 1.2} viewBox="0 0 40 48" className="pointer-events-none absolute origin-bottom" style={{ left: x, top: y }}
      initial={false}
      animate={grown ? { scale: 1, opacity: 1, rotate: [0, -6, 4, 0] } : { scale: 0, opacity: 0 }}
      transition={grown ? { delay, type: 'spring', stiffness: 260, damping: 12, rotate: { delay: delay + 0.4, duration: 1.2 } } : { duration: 0.2 }}
      aria-hidden="true"
    >
      <path d="M20 46 C20 36 20 28 21 20" stroke="#2E9E4F" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M21 24 C10 24 5 16 6 8 C15 8 21 14 21 24 Z" fill="#5FD37B" stroke="#2E9E4F" strokeWidth="2" />
      <path d="M21 20 C29 20 35 13 35 5 C26 5 21 11 21 20 Z" fill="#7FFABD" stroke="#2E9E4F" strokeWidth="2" />
    </motion.svg>
  );
}

function Ripples({ x, y, w, on }: { x: number; y: number; w: number; on: boolean }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: x - w / 2, top: y - w * 0.16, width: w, height: w * 0.32 }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-[50%] border-2 border-white/80"
          initial={false}
          animate={on ? { scale: [0.25, 1.15], opacity: [0.9, 0] } : { scale: 0.25, opacity: 0 }}
          transition={on ? { duration: 2.6, delay: i * 0.85, repeat: Infinity, ease: 'easeOut' } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

function FloatChip({ children, x, y, on, tone = 'ink' }: { children: React.ReactNode; x: number; y: number; on: boolean; tone?: 'ink' | 'mint' }) {
  return (
    <motion.span
      className={`${MONO} pointer-events-none absolute whitespace-nowrap rounded-full border-[3px] border-white px-3.5 py-2 text-[12px] font-semibold tracking-[0.1em] shadow-[0_10px_24px_rgba(5,7,6,.18)] ${tone === 'ink' ? 'bg-[#050706] text-[#7FFABD]' : 'bg-[#7FFABD] text-[#050706]'}`}
      style={{ left: x, top: y }}
      initial={false}
      animate={on ? { opacity: 1, y: [8, -6, 0], scale: 1 } : { opacity: 0, y: 12, scale: 0.85 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.span>
  );
}

function Layer({ x, y, depth, children, className = '' }: { x: MotionValue<number>; y: MotionValue<number>; depth: number; children: React.ReactNode; className?: string }) {
  const lx = useTransform(x, (v) => v * depth);
  const ly = useTransform(y, (v) => v * depth);
  return <motion.div className={`pointer-events-none absolute inset-0 ${className}`} style={{ x: lx, y: ly }}>{children}</motion.div>;
}

function Track({ progress, chapter, compact }: { progress: MotionValue<number>; chapter: Chapter; compact: boolean }) {
  const width = compact ? 280 : 520;
  const dogX = useTransform(progress, [0, 1], [0, width]);
  const dogY = useTransform(progress, (v) => -Math.abs(Math.sin(v * Math.PI * 26)) * (compact ? 5 : 7));
  const nodes: { c: Chapter; at: number; label: string }[] = [
    { c: 'read', at: REST[1], label: t('READ', 'LEE') },
    { c: 'no', at: REST[2], label: t('WAIT', 'ESPERA') },
    { c: 'return', at: REST[3], label: t('RETURN', 'VUELVE') },
    { c: 'unlock', at: REST[4], label: t('UNLOCK', 'ABRE') },
  ];
  const reached = CHAPTERS.indexOf(chapter);
  return (
    <div className="relative" style={{ width, height: compact ? 44 : 56 }} aria-hidden="true">
      <div className="absolute left-0 right-0 top-[26px] border-t-[3px] border-dotted border-[#050706]/35 lg:top-[34px]" />
      {nodes.map((n) => {
        const on = CHAPTERS.indexOf(n.c) <= reached && reached > 0;
        return (
          <div key={n.c} className="absolute top-[20px] flex -translate-x-1/2 flex-col items-center gap-1.5 lg:top-[27px]" style={{ left: n.at * width }}>
            <motion.span
              className="h-3.5 w-3.5 rounded-full border-[3px] border-[#050706] lg:h-4 lg:w-4"
              initial={false}
              animate={{ backgroundColor: on ? '#7FFABD' : '#FBFAF1', scale: CHAPTERS[reached] === n.c ? 1.35 : 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            />
            <span className={`${MONO} text-[9px] font-semibold tracking-[0.1em] lg:text-[11px] ${on ? 'text-[#050706]' : 'text-[#050706]/45'}`}>{n.label}</span>
          </div>
        );
      })}
      <motion.img
        src={`${W}/pet-byte.webp`} alt="" draggable={false}
        className="absolute top-0 w-7 -translate-x-1/2 lg:w-9"
        style={{ x: dogX, y: dogY }}
      />
    </div>
  );
}

export default function BobbyWorld() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1440, h: 900 });
  const [chapter, setChapter] = useState<Chapter>('intro');
  const [grown, setGrown] = useState(false);

  const stage = box.w < 768 ? MOBILE : DESKTOP;
  const scale = Math.max(box.w / stage.w, box.h / stage.h);
  const offsetX = (box.w - stage.w * scale) / 2;
  const offsetY = (box.h - stage.h * scale) / 2;

  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.35, restDelta: 0.0005 });
  const c = stage.cam;
  const camX = useTransform(progress, CAM_IN, [c[0], c[0], c[1], c[1], c[2], c[2], c[3], c[3], c[4], c[4]]);
  const camY = useTransform(progress, (v) => (reduceMotion ? 0 : Math.sin(v * Math.PI * 9) * 10));
  const fogOpacity = useTransform(progress, [0.8, 0.9], [1, 0]);
  const fogFilter = useTransform(progress, [0.8, 0.9], ['saturate(0.35) brightness(1.1)', 'saturate(1) brightness(1)']);

  useMotionValueEvent(progress, 'change', (v) => {
    const idx = EDGES.filter((e) => v >= e).length;
    const next = CHAPTERS[idx];
    setChapter((cur) => (cur === next ? cur : next));
    if (next === 'no' || next === 'return' || next === 'unlock') setGrown(true);
  });

  const goTo = (idx: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(CHAPTERS.length - 1, idx));
    const top = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + REST[clamped] * travel + 2, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const current = CHAPTERS.indexOf(chapter);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > 0 || r.bottom < window.innerHeight) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const copy = chapterCopy(chapter);
  const s = stage;
  const obsH = s.obs.w * (795 / 560);
  const gardenH = s.garden.w * (960 / 970);
  const poolH = s.pool.w * (980 / 694);
  const k = s.compact ? 0.46 : 1;

  return (
    <section
      ref={sectionRef}
      id="world"
      aria-label={t('Bobby’s world', 'El mundo de Bobby')}
      className="a3-poster-card relative h-[520vh] overflow-clip bg-[#F3FDD6] text-[#050706] lg:h-[600vh]"
      style={{ zIndex: 70 }}
    >
      <div ref={viewRef} className="sticky top-0 h-[100svh] min-h-[600px] overflow-hidden bg-[linear-gradient(180deg,#F3FDD6_0%,#EAF9E2_55%,#F8FCF4_100%)]">
        {/* the sky, in design units */}
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: s.w, height: s.h, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}>
          <div className="pointer-events-none absolute left-[-100px] top-[380px] h-[560px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgba(127,250,189,.38),rgba(127,250,189,0))]" />
          <div className="pointer-events-none absolute left-[800px] top-[200px] h-[600px] w-[800px] rounded-full bg-[radial-gradient(closest-side,rgba(127,250,189,.26),rgba(127,250,189,0))]" />

          <Layer x={camX} y={camY} depth={0.4}>
            {s.far.map((d, i) => (
              <img key={i} src={d.src} alt="" draggable={false} className="absolute" style={{ left: d.x, top: d.y, width: d.w, opacity: d.opacity ?? 1, transform: d.flip ? 'scaleX(-1)' : undefined }} />
            ))}
          </Layer>

          <Layer x={camX} y={camY} depth={0.7}>
            {s.mid.map((d, i) => (
              <img key={i} src={d.src} alt="" draggable={false} className={`absolute ${i % 2 ? 'a3-bob-b' : 'a3-bob-c'}`} style={{ left: d.x, top: d.y, width: d.w, transform: d.flip ? 'scaleX(-1)' : undefined }} />
            ))}
          </Layer>

          <Layer x={camX} y={camY} depth={1}>
            {/* 01 · the observatory */}
            <div className="a3-bob-b absolute" style={{ left: s.obs.x, top: s.obs.y, width: s.obs.w, height: obsH }}>
              <motion.div
                className="absolute origin-left"
                style={{ left: s.obs.w * 0.69, top: obsH * 0.1, width: 560 * k, height: 190 * k, clipPath: 'polygon(0 46%, 100% 0, 100% 100%, 0 54%)', background: 'linear-gradient(90deg, rgba(127,250,189,.55), rgba(127,250,189,0))' }}
                initial={false}
                animate={chapter === 'read' ? { opacity: 1, rotate: [-34, -24, -34] } : { opacity: 0, rotate: -34 }}
                transition={chapter === 'read' ? { opacity: { duration: 0.5 }, rotate: { duration: 5, repeat: Infinity, ease: 'easeInOut' } } : { duration: 0.4 }}
              />
              <img src={`${W}/isl-observatory.webp`} alt={t('The observatory island, with Iris beside a telescope dome', 'La isla del observatorio, con Iris junto a un domo con telescopio')} draggable={false} className="relative block w-full" style={{ WebkitMaskImage: 'linear-gradient(270deg,#000 82%,transparent 100%)', maskImage: 'linear-gradient(270deg,#000 82%,transparent 100%)' }} />
              <Star x={s.obs.w * 0.9} y={-20 * k} size={30 * k + 8} delay={0} on={chapter === 'read'} />
              <Star x={s.obs.w * 1.12} y={60 * k} size={20 * k + 6} delay={0.5} on={chapter === 'read'} />
              <Star x={s.obs.w * 0.55} y={-60 * k} size={24 * k + 6} delay={0.9} on={chapter === 'read'} />
              <Star x={s.obs.w * 1.3} y={-40 * k} size={16 * k + 6} delay={1.3} on={chapter === 'read'} />
            </div>

            {/* 02 · the garden */}
            <div className="a3-bob-a absolute" style={{ left: s.garden.x, top: s.garden.y, width: s.garden.w, height: gardenH }}>
              <img src={`${W}/isl-garden.webp`} alt={t('The garden island, with Byte beside a dome house, a tree and a vegetable bed', 'La isla del jardín, con Byte junto a una casita, un árbol y un huerto')} draggable={false} className="relative block w-full" />
              <img src={`${W}/pet-sol.webp`} alt="" draggable={false} className="absolute" style={{ left: s.garden.w * 0.3, top: gardenH * 0.51, width: s.garden.w * 0.065 }} />
              {[0.16, 0.2, 0.245, 0.29, 0.335].map((fx, i) => (
                <Sprout key={fx} x={s.garden.w * fx} y={gardenH * (0.44 + (i % 2) * 0.03)} size={s.garden.w * 0.045} delay={0.15 + i * 0.12} grown={grown} />
              ))}
              <FloatChip x={s.garden.w * 0.08} y={gardenH * 0.3} on={chapter === 'no'} tone="mint">+1 BLOOM</FloatChip>
            </div>

            {/* 03 · the reflecting pool */}
            <div className="a3-bob-c absolute" style={{ left: s.pool.x, top: s.pool.y, width: s.pool.w, height: poolH }}>
              <img src={`${W}/isl-pool.webp`} alt={t('The reflecting pool island, with Sol by the water under a stone arch', 'La isla del estanque, con Sol junto al agua bajo un arco de piedra')} draggable={false} className="relative block w-full" style={{ WebkitMaskImage: 'linear-gradient(90deg,#000 82%,transparent 100%)', maskImage: 'linear-gradient(90deg,#000 82%,transparent 100%)' }} />
              <img src={`${W}/pet-glitch.webp`} alt="" draggable={false} className="absolute" style={{ left: s.pool.w * 0.2, top: poolH * 0.46, width: s.pool.w * 0.1 }} />
              <Ripples x={s.pool.w * 0.44} y={poolH * 0.47} w={s.pool.w * 0.36} on={chapter === 'return'} />
              <FloatChip x={s.pool.w * 0.02} y={poolH * 0.28} on={chapter === 'return'}>{t('YESTERDAY’S READ · GRADED', 'LECTURA DE AYER · CALIFICADA')}</FloatChip>
            </div>

            {/* 04 · still in the fog */}
            {s.fog.map((f, i) => (
              <div key={i} className={`absolute ${i ? 'a3-bob-c' : 'a3-bob-a'}`} style={{ left: f.x, top: f.y, width: f.w }}>
                <motion.img src={f.src} alt={i ? '' : t('An island that opens with discipline', 'Una isla que se abre con disciplina')} draggable={false} className="block w-full" style={{ filter: fogFilter, scaleX: f.flip ? -1 : 1 }} />
                <motion.div className="absolute -inset-[24%] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.92),rgba(255,255,255,0))]" style={{ opacity: fogOpacity }} />
              </div>
            ))}
            <motion.div
              className="absolute flex items-center gap-2 rounded-full bg-[#050706] px-4 py-2.5 text-[#FBFAF1] shadow-[0_12px_28px_rgba(5,7,6,.25)]"
              style={{ left: s.fog[0].x + s.fog[0].w * 0.32, top: s.fog[0].y - (s.compact ? 30 : 46) }}
              initial={false}
              animate={chapter === 'unlock' ? { scale: [1, 1.12, 1], backgroundColor: '#13784A' } : { scale: 1, backgroundColor: '#050706' }}
              transition={{ duration: 0.6 }}
            >
              <svg width={s.compact ? 14 : 18} height={s.compact ? 14 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <motion.path d="M8 11V8a4 4 0 0 1 8 0v3" style={{ originX: '16px', originY: '11px' }} initial={false} animate={chapter === 'unlock' ? { rotate: -35, y: -2 } : { rotate: 0, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }} />
              </svg>
              <span className={`${MONO} font-semibold tracking-[0.1em] ${s.compact ? 'text-[10px]' : 'text-[13px]'}`}>{chapter === 'unlock' ? t('UNLOCKED', 'ABIERTA') : t('LOCKED', 'BLOQUEADA')}</span>
            </motion.div>
            {[0, 1, 2, 3].map((i) => (
              <Star key={i} x={s.fog[0].x + s.fog[0].w * (0.1 + i * 0.28)} y={s.fog[0].y + (i % 2 ? 40 : -10) * (s.compact ? 0.5 : 1)} size={s.compact ? 14 : 24} delay={i * 0.3} on={chapter === 'unlock'} />
            ))}
          </Layer>

          <Layer x={camX} y={camY} depth={1.25}>
            {s.clouds.map((cl, i) => (
              <img key={i} src={`${W}/clouds.webp`} alt="" draggable={false} className="absolute" style={{ left: cl.x, top: cl.y, width: cl.w, transform: cl.flip ? 'scaleX(-1)' : undefined }} />
            ))}
          </Layer>
        </div>

        {/* keeps the copy readable over the sky */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[linear-gradient(180deg,rgba(243,253,214,.97)_0%,rgba(243,253,214,.88)_62%,rgba(243,253,214,0)_100%)] lg:inset-y-0 lg:h-auto lg:w-[720px] lg:bg-[linear-gradient(90deg,rgba(243,253,214,.95)_0%,rgba(243,253,214,.78)_55%,rgba(243,253,214,0)_100%)]" />

        {/* the chapter copy */}
        <div className="absolute inset-x-4 top-8 lg:inset-x-auto lg:left-14 lg:top-1/2 lg:w-[560px] lg:-translate-y-1/2">
          <AnimatePresence mode="wait" initial={false}>
            {chapter === 'intro' ? (
              <motion.div key="intro" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
                <div className={`${MONO} text-[11px] font-semibold tracking-[0.12em] text-[#13784A] lg:text-[13px]`}>{t('BOBBY’S WORLD · TRADER LAND', 'EL MUNDO DE BOBBY · TRADER LAND')}</div>
                <h2 className="mt-2.5 text-[44px] font-black leading-[0.9] tracking-[-0.055em] lg:mt-4 lg:text-[84px]">
                  {t('Your progress', 'Tu progreso')}<br />{t('has a place.', 'tiene un lugar.')}
                </h2>
                <p className="mt-3 max-w-[440px] text-base font-medium leading-[1.4] lg:mt-6 lg:text-xl">
                  {t('Discipline builds a world you can walk through. Scroll to sail it.', 'La disciplina construye un mundo que puedes recorrer. Haz scroll para navegarlo.')}
                </p>
                <div className="mt-5 flex items-center gap-3 lg:mt-8" aria-hidden="true">
                  <span className="relative block h-9 w-6 rounded-full border-[2.5px] border-[#050706]">
                    <motion.span className="absolute left-1/2 top-1.5 h-2 w-1 -translate-x-1/2 rounded-full bg-[#050706]" animate={reduceMotion ? {} : { y: [0, 9, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
                  </span>
                  <span className={`${MONO} text-[11px] font-semibold tracking-[0.12em] lg:text-xs`}>{t('SCROLL TO EXPLORE', 'HAZ SCROLL PARA EXPLORAR')}</span>
                </div>
              </motion.div>
            ) : copy ? (
              <motion.div
                key={chapter}
                initial={{ opacity: 0, y: 26, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -22, scale: 0.98 }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                className="rounded-[26px] border border-white bg-[#FBFAF1]/85 p-5 shadow-[0_24px_60px_rgba(5,7,6,.12)] backdrop-blur-md lg:rounded-[32px] lg:p-8"
              >
                <div className={`${MONO} flex items-center gap-3 text-[11px] font-semibold tracking-[0.12em] text-[#13784A] lg:text-[13px]`}>
                  <span className="rounded-full bg-[#050706] px-2.5 py-1 text-[#7FFABD]">{copy.n} / 04</span>
                  {copy.place}
                </div>
                <h3 className="mt-3 text-[30px] font-black leading-[0.95] tracking-[-0.045em] lg:mt-4 lg:text-[54px]">{copy.title}</h3>
                <p className="mt-2.5 text-[15px] font-medium leading-[1.42] lg:mt-4 lg:text-[19px]">{copy.body}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3 lg:mt-6">
                  <span className={`${MONO} rounded-full bg-[#7FFABD] px-3 py-1.5 text-[10px] font-semibold tracking-[0.1em] lg:text-xs`}>{copy.chip}</span>
                  {chapter === 'unlock' && (
                    <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-[#050706] px-5 text-sm font-extrabold text-[#FBFAF1] transition hover:bg-black lg:text-base">
                      {t('Enter Bobby’s world', 'Entra al mundo de Bobby')}
                    </a>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* the route, with Byte's pet running along it */}
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-end gap-5 lg:bottom-9">
          <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label={t('Previous island', 'Isla anterior')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#050706] bg-[#FBFAF1] transition hover:bg-white disabled:opacity-30 lg:h-12 lg:w-12">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
          </button>
          <Track progress={progress} chapter={chapter} compact={s.compact} />
          <button type="button" onClick={() => goTo(current + 1)} disabled={current === CHAPTERS.length - 1} aria-label={t('Next island', 'Siguiente isla')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#050706] bg-[#FBFAF1] transition hover:bg-white disabled:opacity-30 lg:h-12 lg:w-12">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    </section>
  );
}
