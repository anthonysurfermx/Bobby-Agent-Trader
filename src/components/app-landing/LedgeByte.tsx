// Byte refuses to be covered. When the next poster slides up over the hero,
// he grabs its top edge to keep watching, gets carried up, strains, slips —
// and finally lets go and drops behind it. Everything is derived from the
// scroll position, so scrolling back up plays it in reverse.
//
// The standing Byte in the hero is swapped for a head + two fists at the exact
// moment the edge reaches his chin, so the handover is invisible. The head sits
// between the two posters (hidden below the edge), the fists sit on top of the
// incoming poster so they read as gripping it. Desktop only: the stack pins on
// desktop, and on phones the hero scrolls away with the poster.
import { useEffect, useRef, type RefObject } from 'react';

const P = '/app/poster';
// byte-standing.webp is 571×960; the head crop is its top 432px, 470px wide.
const SRC_W = 571;
const SWAP = 432 / 960;
const HEAD_W = 470;
const HEAD_CX = 245;
const FIST_W = 113;

function backOut(t: number) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export default function LedgeByte({ standingRef, edgeRef }: { standingRef: RefObject<HTMLElement>; edgeRef: RefObject<HTMLElement> }) {
  const headRef = useRef<HTMLImageElement>(null);
  const handsRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLImageElement>(null);
  const rightRef = useRef<HTMLImageElement>(null);
  const effortRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (min-height: 720px) and (prefers-reduced-motion: no-preference)');
    let raf = 0;

    const setVisible = (standing: HTMLElement | null, show: boolean) => {
      if (standing) standing.style.visibility = show ? 'visible' : 'hidden';
    };

    const update = () => {
      raf = 0;
      const standing = standingRef.current;
      const edgeEl = edgeRef.current;
      const head = headRef.current;
      const hands = handsRef.current;
      const left = leftRef.current;
      const right = rightRef.current;
      const effort = effortRef.current;
      if (!standing || !edgeEl || !head || !hands || !left || !right || !effort) return;

      const hideOverlay = () => {
        head.style.opacity = '0';
        hands.style.opacity = '0';
        effort.style.opacity = '0';
      };

      if (!mq.matches) { hideOverlay(); setVisible(standing, true); return; }
      const r = standing.getBoundingClientRect();
      if (r.height < 10) { hideOverlay(); setVisible(standing, true); return; }

      const edge = edgeEl.getBoundingClientRect().top;
      const swapY = r.top + r.height * SWAP;
      const d = swapY - edge;
      if (d <= 0) { hideOverlay(); setVisible(standing, true); return; }

      const hold = Math.max(280, window.innerHeight * 0.46);
      const t = d / hold;
      setVisible(standing, false);
      if (t >= 1) { hideOverlay(); return; }

      const k = r.width / SRC_W;
      const headW = HEAD_W * k;
      const headH = 432 * k;
      const holding = Math.min(t / 0.74, 1);
      const release = t > 0.74 ? (t - 0.74) / 0.26 : 0;
      const grab = Math.min(t / 0.09, 1);

      // he slips a little as he tires, then falls away
      const slip = holding * holding * 0.15 * r.height;
      const fall = release * release * r.height * 0.95;
      const wobble = Math.sin(d / 15) * (1 + 5 * holding) + release * 18;
      const shake = Math.sin(d / 4.2) * holding * 2.4;

      head.style.opacity = '1';
      head.style.width = `${headW}px`;
      head.style.transform = `translate3d(${r.left + shake}px, ${edge - headH + slip + fall}px, 0) rotate(${wobble}deg)`;

      const fistW = FIST_W * k * 1.3;
      const cx = r.left + HEAD_CX * k;
      const spread = r.width * 0.29;
      const fy = edge - fistW * 0.6 + release * 30;
      const s = backOut(grab) * (1 - release * 0.4);
      hands.style.opacity = String(1 - release);
      left.style.width = `${fistW}px`;
      right.style.width = `${fistW}px`;
      left.style.transform = `translate3d(${cx - spread - fistW / 2 + shake * 0.5}px, ${fy}px, 0) rotate(-10deg) scale(${s})`;
      right.style.transform = `translate3d(${cx + spread - fistW / 2 - shake * 0.5}px, ${fy}px, 0) rotate(10deg) scale(${-s}, ${s})`;

      const strain = holding > 0.35 ? Math.min((holding - 0.35) * 1.8, 1) * (1 - release) : 0;
      effort.style.opacity = String(strain);
      effort.style.transform = `translate3d(${r.left + headW * 0.86}px, ${edge - headH * 0.95 + slip}px, 0) rotate(${Math.sin(d / 7) * 6}deg)`;
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    mq.addEventListener('change', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mq.removeEventListener('change', onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (standingRef.current) standingRef.current.style.visibility = 'visible';
    };
  }, [standingRef, edgeRef]);

  return (
    <>
      {/* between the hero and the incoming poster: whatever is below the edge is hidden */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ zIndex: 15 }}>
        <img ref={headRef} src={`${P}/byte-head.webp`} alt="" className="absolute left-0 top-0 h-auto" style={{ opacity: 0, transformOrigin: '50% 100%', willChange: 'transform' }} />
        <svg ref={effortRef} width="54" height="54" viewBox="0 0 54 54" className="absolute left-0 top-0" style={{ opacity: 0 }}>
          <path d="M8 30 L22 24" stroke="#050706" strokeWidth="4" strokeLinecap="round" />
          <path d="M14 14 L25 18" stroke="#050706" strokeWidth="4" strokeLinecap="round" />
          <path d="M28 6 L30 16" stroke="#050706" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      {/* above the incoming poster: the fists gripping its edge */}
      <div ref={handsRef} aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ zIndex: 25, opacity: 0 }}>
        <img ref={leftRef} src={`${P}/byte-fist.webp`} alt="" className="absolute left-0 top-0 h-auto drop-shadow-[0_6px_8px_rgba(5,7,6,.25)]" style={{ transformOrigin: '50% 80%' }} />
        <img ref={rightRef} src={`${P}/byte-fist.webp`} alt="" className="absolute left-0 top-0 h-auto drop-shadow-[0_6px_8px_rgba(5,7,6,.25)]" style={{ transformOrigin: '50% 80%' }} />
      </div>
    </>
  );
}
