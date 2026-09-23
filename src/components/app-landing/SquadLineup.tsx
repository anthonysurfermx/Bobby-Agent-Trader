// The squad, standing free on the poster — no photo frame. They rise onto the
// floor one after another when the poster arrives, breathe while idle, and hop
// with their name tag when hovered or tapped.
import { useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { t } from '@/lib/companions/i18n';

const P = '/app/poster';
const MONO = "[font-family:'Geist_Mono',ui-monospace,monospace]";

const SQUAD = [
  { id: 'iris', src: `${P}/squad-iris.webp`, name: 'IRIS', tone: 'ICE', accent: '#38BDF8', ratio: 362 / 1000, breathe: 4.6 },
  { id: 'sol', src: `${P}/squad-sol.webp`, name: 'SOL', tone: 'GOLD', accent: '#FACC15', ratio: 346 / 1000, breathe: 5.2 },
  { id: 'glitch', src: `${P}/squad-glitch.webp`, name: 'GLITCH', tone: 'PLASMA', accent: '#A855F7', ratio: 351 / 1000, breathe: 4.2 },
];

export default function SquadLineup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);

  return (
    <div ref={ref} className="a3-visual relative mx-auto w-full max-w-[360px] lg:max-w-[640px]">
      <div className="relative flex items-end justify-center gap-0 pb-10 [--squad-h:290px] lg:pb-14 lg:[--squad-h:540px]">
        {/* the floor they stand on */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 h-10 w-[92%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(5,7,6,.16),rgba(5,7,6,0))] lg:bottom-8 lg:h-14" />
        {SQUAD.map((c, i) => {
          const on = active === c.id;
          return (
            <motion.button
              key={c.id}
              type="button"
              aria-label={`${c.name} · ${c.tone}`}
              aria-pressed={on}
              onMouseEnter={() => setActive(c.id)}
              onMouseLeave={() => setActive((v) => (v === c.id ? null : v))}
              onFocus={() => setActive(c.id)}
              onBlur={() => setActive((v) => (v === c.id ? null : v))}
              onClick={() => setActive((v) => (v === c.id ? null : c.id))}
              initial={reduceMotion ? false : { opacity: 0, y: 90 }}
              animate={inView || reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 90 }}
              transition={{ delay: reduceMotion ? 0 : 0.12 + i * 0.16, type: 'spring', stiffness: 170, damping: 17 }}
              className={`relative -mx-2 flex shrink-0 flex-col items-center outline-none lg:-mx-3 ${i === 1 ? 'z-10' : ''}`}
              style={{ width: `calc(${c.ratio} * var(--squad-h))` }}
            >
              <motion.span
                className={`${MONO} pointer-events-none absolute -top-9 z-20 whitespace-nowrap rounded-full border-[3px] border-white px-3 py-1.5 text-[10px] font-semibold tracking-[0.1em] text-[#050706] shadow-[0_8px_18px_rgba(5,7,6,.18)] lg:-top-12 lg:text-xs`}
                style={{ background: c.accent }}
                initial={false}
                animate={on ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              >
                {c.name} · {c.tone}
              </motion.span>
              <motion.div
                className="w-full origin-bottom"
                animate={on ? { y: -18, scaleY: 1, scaleX: 1 } : reduceMotion ? { y: 0 } : { y: 0, scaleY: [1, 1.014, 1], scaleX: [1, 0.994, 1] }}
                transition={on ? { type: 'spring', stiffness: 420, damping: 14 } : { duration: c.breathe, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
              >
                <img src={c.src} alt={t(`${c.name[0]}${c.name.slice(1).toLowerCase()}, one of the Bobby squad`, `${c.name[0]}${c.name.slice(1).toLowerCase()}, del squad de Bobby`)} draggable={false} className="block h-auto w-full select-none" />
              </motion.div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
