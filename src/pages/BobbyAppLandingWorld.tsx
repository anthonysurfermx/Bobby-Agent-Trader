// /app — "Fun to ask. Hard to fool." (direction A3, sticker poster stack).
//
// The App Store campaign turned into a scroll: every section is one poster —
// one colour, one headline, one object — and on desktop each poster slides over
// the one before it. The fun lives in the motion, not in the copy: Byte hangs on
// to the next poster rather than be covered, the two chatbot answers drop in
// like marbles, the receipt crumples into a ball as you move on, the squad
// breathes, and the page ends by sailing through Trader Land. The argument
// stays serious — chatbots forget, Bobby keeps receipts, and the record on the
// receipt is live.
//
// Routed at /app (since 2026-09-24) and /app-world. The previous lifestyle landing stays at /app-a for rollback.
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, useInView, useReducedMotion, useScroll, useTransform, type Easing, type MotionValue } from 'framer-motion';
import { isSpanish, t } from '@/lib/companions/i18n';
import { APP_STORE_URL } from '@/lib/app-store';
import BobbyWorld from '@/components/app-landing/BobbyWorld';
import LedgeByte from '@/components/app-landing/LedgeByte';
import SquadLineup from '@/components/app-landing/SquadLineup';
import '@/components/app-landing/app-landing-a3.css';

const DESK_URL = '/desk';
const P = '/app/poster';
const PET = '/app/world';
const MONO = "[font-family:'Geist_Mono',ui-monospace,monospace]";

interface DebateActivity { commitmentsCreated?: number; losses?: number }
interface ProtocolStats { debateActivity?: DebateActivity }
type StatsState = { status: 'loading' } | { status: 'ok'; written: number; wrong: number | null } | { status: 'error' };

function useRecord(): StatsState {
  const [state, setState] = useState<StatsState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/bobby-protocol-stats', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<ProtocolStats>) : null))
      .then((payload) => {
        if (!active) return;
        const written = Number(payload?.debateActivity?.commitmentsCreated);
        const wrong = Number(payload?.debateActivity?.losses);
        if (!Number.isFinite(written) || written <= 0) { setState({ status: 'error' }); return; }
        setState({ status: 'ok', written, wrong: Number.isFinite(wrong) ? wrong : null });
      })
      .catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; controller.abort(); };
  }, []);
  return state;
}

function setLang(next: 'en' | 'es') {
  try { localStorage.setItem('bobby_lang', next); } catch { /* private mode */ }
  window.location.reload();
}

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

const num = (n: number) => n.toLocaleString(isSpanish() ? 'es-MX' : 'en-US');

function AppleGlyph() {
  return (
    <svg viewBox="0 0 384 512" className="h-5 w-[17px]" fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function StoreButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
      className={`inline-flex min-h-[58px] items-center justify-center gap-3 whitespace-nowrap rounded-full bg-[#050706] px-8 text-lg font-bold text-[#FBFAF1] transition hover:bg-black ${className}`}
    >
      <AppleGlyph />
      {t('Download on the App Store', 'Descárgala en el App Store')}
    </a>
  );
}

/** One poster in the stack. The first one sits flat; every later one overlaps the previous with a rounded top. */
function Poster({ id, z, className, children, first = false, sectionRef }: { id?: string; z: number; className: string; children: React.ReactNode; first?: boolean; sectionRef?: React.Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} id={id} className={`a3-poster relative overflow-hidden ${first ? '' : 'a3-poster-card'} ${className}`} style={{ zIndex: z }}>
      {children}
    </section>
  );
}

function TextSticker({ children, tone = 'gold', className = '', rotate = 0 }: { children: React.ReactNode; tone?: 'gold' | 'ink' | 'mint' | 'white'; className?: string; rotate?: number }) {
  const tones = {
    gold: 'bg-[#FACC15] text-[#050706]',
    ink: 'bg-[#050706] text-[#7FFABD]',
    mint: 'bg-[#7FFABD] text-[#050706]',
    white: 'bg-white text-[#050706]',
  };
  return (
    <span
      className={`${MONO} absolute inline-block whitespace-nowrap rounded-xl border-[3px] border-white px-3 py-2 text-[11px] font-semibold tracking-[0.08em] shadow-[0_10px_20px_rgba(5,7,6,.18)] lg:border-4 lg:px-4 lg:py-2.5 lg:text-[15px] ${tones[tone]} ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  );
}

function PetSticker({ src, className, rotate = 0 }: { src: string; className: string; rotate?: number }) {
  return <img src={src} alt="" loading="lazy" draggable={false} className={`a3-diecut pointer-events-none absolute h-auto ${className}`} style={{ transform: `rotate(${rotate}deg)` }} />;
}

function Tape({ className, rotate }: { className: string; rotate: number }) {
  return <span aria-hidden="true" className={`absolute h-[26px] w-[96px] bg-white/70 lg:h-[32px] lg:w-[110px] ${className}`} style={{ transform: `rotate(${rotate}deg)` }} />;
}

/** Headline + one line, the same rhythm on every poster. */
function PosterCopy({ kicker, title, body, dark = false, size = 'lg', children }: { kicker?: string; title: React.ReactNode; body: string; dark?: boolean; size?: 'lg' | 'md'; children?: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 0.6 } };
  return (
    <motion.div {...reveal} className="relative z-10">
      {kicker && <div className={`${MONO} mb-3 text-[11px] font-semibold tracking-[0.12em] lg:mb-5 lg:text-[13px] ${dark ? 'text-[#7FFABD]' : 'text-[#3A413D]'}`}>{kicker}</div>}
      <h2 className={`text-[clamp(2.6rem,11vw,3.4rem)] font-black leading-[0.9] tracking-[-0.055em] ${size === 'md' ? 'lg:text-[clamp(3.5rem,5.3vw,5.25rem)]' : 'lg:text-[clamp(4.5rem,6.6vw,6.5rem)]'}`}>{title}</h2>
      <p className={`mt-4 max-w-[480px] text-[17px] font-medium leading-[1.4] lg:mt-7 lg:text-[22px] ${dark ? 'text-[#D8E3DC]' : ''}`}>{body}</p>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ hero */

/** Byte standing on the studio floor, pointing at his pet. `byteRef` wraps his image so LedgeByte can take his place. */
function HeroBobby({ className, byteRef }: { className: string; byteRef?: React.Ref<HTMLDivElement> }) {
  const reduceMotion = useReducedMotion();
  const rise = reduceMotion ? {} : { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: EASE } };
  const pop = reduceMotion ? {} : { initial: { opacity: 0, scale: 0.6, y: 20 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { delay: 0.55, type: 'spring' as const, stiffness: 260, damping: 16 } };
  return (
    <div className={`relative ${className}`}>
      <div className="absolute bottom-[1.5%] left-[8%] h-[8%] w-[84%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(5,7,6,.2),rgba(5,7,6,0))]" />
      <div ref={byteRef} className="absolute bottom-[3%] left-[4%] aspect-[571/960] h-[94%]">
        <motion.img
          {...rise}
          src={`${P}/byte-standing.webp`}
          alt={t('Byte, Bobby’s hoodie robot, standing and pointing at his pet', 'Byte, el robot con sudadera de Bobby, de pie señalando a su mascota')}
          draggable={false}
          className="block h-full w-full"
        />
      </div>
      <motion.img {...pop} src={`${PET}/pet-byte.webp`} alt="" draggable={false} className="absolute bottom-[2.5%] right-[1%] h-[35%] w-auto origin-bottom" />
    </div>
  );
}

/* --------------------------------------------------------------- receipts */

function Receipt({ record }: { record: StatsState }) {
  const rowNum = 'font-black tracking-[-0.04em] [font-family:Archivo,system-ui,sans-serif] text-[34px] lg:text-[44px]';
  return (
    <div className="relative w-[300px] rotate-2 drop-shadow-[0_24px_36px_rgba(5,7,6,.22)] lg:w-[400px] lg:rotate-3">
      <div className={`a3-receipt ${MONO} flex flex-col gap-2.5 bg-white px-6 pb-12 pt-6 text-[#050706] lg:gap-3.5 lg:px-8 lg:pb-14 lg:pt-8`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.1em] lg:text-lg">BOBBY · {t('RECORD', 'RÉCORD')}</span>
          <span className="rounded-full bg-[#7FFABD] px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] lg:text-[11px]">{t('LIVE', 'EN VIVO')}</span>
        </div>
        <div className="border-t-2 border-dashed border-[#050706]" />
        <div className="flex justify-between gap-4 text-[11px] lg:text-[15px]"><span>{t('CALL WRITTEN', 'LLAMADA ESCRITA')}</span><span className="text-right">{t('BEFORE THE MOVE', 'ANTES DEL MOVIMIENTO')}</span></div>
        <div className="flex justify-between gap-4 text-[11px] lg:text-[15px]"><span>{t('GRADED BY', 'LA CALIFICA')}</span><span className="text-right">{t('THE MARKET', 'EL MERCADO')}</span></div>
        {record.status !== 'error' && (
          <>
            <div className="border-t-2 border-dashed border-[#050706]" />
            <div className="flex items-baseline justify-between text-[11px] lg:text-[15px]">
              <span>{t('CALLS SO FAR', 'LLAMADAS HASTA HOY')}</span>
              {record.status === 'ok' ? <span className={rowNum}>{num(record.written)}</span> : <span className="h-8 w-20 animate-pulse rounded bg-[#ECEBE2] lg:h-10" />}
            </div>
            {!(record.status === 'ok' && record.wrong === null) && (
              <div className="flex items-baseline justify-between text-[11px] lg:text-[15px]">
                <span>{t('WRONG', 'FALLADAS')}</span>
                {record.status === 'ok' && record.wrong !== null ? <span className={rowNum}>{num(record.wrong)}</span> : <span className="h-8 w-16 animate-pulse rounded bg-[#ECEBE2] lg:h-10" />}
              </div>
            )}
          </>
        )}
        <div className="flex justify-between gap-4 text-[11px] lg:text-[15px]"><span>{t('MISSES', 'FALLOS')}</span><span className="text-right">{t('STAY ON THE PAGE', 'SE QUEDAN A LA VISTA')}</span></div>
        <div className="border-t-2 border-dashed border-[#050706]" />
        <a href="/protocol" className="text-[11px] font-semibold tracking-[0.06em] underline underline-offset-4 lg:text-[15px]">{t('READ THEM ALL', 'LÉELAS TODAS')}</a>
      </div>
      <Tape className="-top-3 left-1/2 -translate-x-1/2" rotate={-4} />
    </div>
  );
}

// a faceted paper ball, lit from the top left
const BALL: [string, string][] = [
  ['90.5,48.3 84.5,69.7 53.9,46.4', '#d7d7d9'],
  ['84.5,69.7 73.9,85.3 44.6,58.9', '#d7d7d9'],
  ['73.9,85.3 59.9,92.9 44.6,58.9', '#dfdfe1'],
  ['59.9,92.9 39.2,92.0 44.6,58.9', '#dcdcde'],
  ['39.2,92.0 23.0,79.4 44.6,58.9', '#dedee0'],
  ['23.0,79.4 4.3,62.1 41.1,52.3', '#e9e9eb'],
  ['4.3,62.1 9.2,43.8 41.1,52.3', '#ededef'],
  ['9.2,43.8 14.7,16.8 41.1,52.3', '#f3f3f5'],
  ['14.7,16.8 35.5,9.6 51.3,37.8', '#fefeff'],
  ['35.5,9.6 59.2,11.6 51.3,37.8', '#f5f5f7'],
  ['59.2,11.6 76.7,17.7 51.3,37.8', '#e6e6e8'],
  ['76.7,17.7 83.9,28.4 51.3,37.8', '#e7e7e9'],
  ['83.9,28.4 90.5,48.3 53.9,46.4', '#e2e2e4'],
  ['44.6,58.9 41.1,52.3 50.0,50.0', '#f3f3f5'],
  ['41.1,52.3 53.9,46.4 50.0,50.0', '#f1f1f3'],
  ['53.9,46.4 51.3,37.8 50.0,50.0', '#eaeaec'],
  ['51.3,37.8 44.6,58.9 50.0,50.0', '#f6f6f8'],
];
const BALL_OUTLINE = '90.5,48.3 84.5,69.7 73.9,85.3 59.9,92.9 39.2,92.0 23.0,79.4 4.3,62.1 9.2,43.8 14.7,16.8 35.5,9.6 59.2,11.6 76.7,17.7 83.9,28.4';

function PaperBall() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_18px_22px_rgba(5,7,6,.28)]" aria-hidden="true">
      <polygon points={BALL_OUTLINE} fill="#e4e4e6" />
      {BALL.map(([pts, fill]) => <polygon key={pts} points={pts} fill={fill} stroke="#c9c9cc" strokeWidth="0.6" strokeLinejoin="round" />)}
      <path d="M20 40 L38 48 L30 64 M60 22 L56 40 L72 50 M48 74 L58 62" stroke="#b9b9bd" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d="M26 30 L44 26" stroke="#050706" strokeOpacity=".25" strokeWidth="1.4" strokeDasharray="2 2" />
      <polygon points={BALL_OUTLINE} fill="none" stroke="#bfbfc3" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** As the next poster rises, the receipt is crushed into a ball and dropped. Scroll back up and it smooths out again. */
function CrumpleReceipt({ record, progress }: { record: StatsState; progress: MotionValue<number> }) {
  const reduceMotion = useReducedMotion();
  const sx = useTransform(progress, [0, 0.16, 0.34], [1, 0.84, 0.3]);
  const sy = useTransform(progress, [0, 0.16, 0.34], [1, 0.6, 0.3]);
  const rotate = useTransform(progress, [0, 0.34], [0, -24]);
  const skewX = useTransform(progress, [0, 0.16, 0.34], [0, 7, -5]);
  const crease = useTransform(progress, [0.03, 0.2], [0, 1]);
  const paperOpacity = useTransform(progress, [0.28, 0.36], [1, 0]);
  const ballOpacity = useTransform(progress, [0.28, 0.35], [0, 1]);
  const ballScale = useTransform(progress, [0.28, 0.38], [0.75, 1]);
  const ballY = useTransform(progress, [0.4, 0.8], [0, 380]);
  const ballX = useTransform(progress, [0.4, 0.8], [0, -80]);
  const ballRotate = useTransform(progress, [0.28, 0.8], [0, 320]);
  if (reduceMotion) return <Receipt record={record} />;
  return (
    <div className="relative">
      <motion.div className="relative origin-center" style={{ scaleX: sx, scaleY: sy, rotate, skewX, opacity: paperOpacity }}>
        <Receipt record={record} />
        <motion.div className="a3-crease pointer-events-none absolute inset-0" style={{ opacity: crease }} />
      </motion.div>
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 -ml-[60px] -mt-[60px] h-[120px] w-[120px] lg:-ml-[80px] lg:-mt-[80px] lg:h-[160px] lg:w-[160px]"
        style={{ opacity: ballOpacity, scale: ballScale, y: ballY, x: ballX, rotate: ballRotate }}
      >
        <PaperBall />
      </motion.div>
    </div>
  );
}

function ChatBubble({ day, text }: { day: string; text: string }) {
  return (
    <div className="flex w-[196px] flex-col gap-1 rounded-[20px_20px_20px_6px] border-2 border-[#050706] bg-white px-4 py-3 shadow-[0_14px_26px_rgba(5,7,6,.12)] lg:w-[330px] lg:rounded-[26px_26px_26px_8px] lg:border-[2.5px] lg:px-5 lg:py-4">
      <span className={`${MONO} text-[10px] font-semibold tracking-[0.1em] text-[#4A524D] lg:text-xs`}>{day}</span>
      <span className="text-[19px] font-extrabold tracking-[-0.02em] lg:text-[30px]">{text}</span>
    </div>
  );
}

/** The two answers drop in like marbles — one left, one right — bounce, squash and settle. Then the sticker slaps on. */
function MarbleBubbles() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduceMotion = useReducedMotion();
  const drop = (delay: number, rot: number) => {
    if (reduceMotion) return { style: { rotate: rot } };
    return {
      initial: { opacity: 0, y: -420, rotate: rot * 4, scaleX: 1, scaleY: 1 },
      animate: inView
        ? {
            opacity: 1,
            y: [-420, 0, -110, 0, -36, 0, -10, 0],
            rotate: [rot * 4, rot + 3, rot - 4, rot + 1.5, rot - 1, rot, rot, rot],
            scaleY: [1.08, 0.82, 1.05, 0.91, 1.02, 0.97, 1, 1],
            scaleX: [0.94, 1.14, 0.97, 1.07, 0.99, 1.02, 1, 1],
          }
        : { opacity: 0, y: -420 },
      transition: {
        delay,
        duration: 1.65,
        times: [0, 0.38, 0.55, 0.7, 0.8, 0.88, 0.94, 1],
        ease: ['easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn'] as Easing[],
        opacity: { delay, duration: 0.15 },
      },
    };
  };
  return (
    <div ref={ref} className="relative mt-8 h-[190px] w-full max-w-[640px] lg:mt-9 lg:h-[200px]">
      <motion.div {...drop(0, -4)} className="absolute left-0 top-[18px] origin-bottom lg:bottom-[16px] lg:top-auto">
        <ChatBubble day={t('MON · NEW CHAT', 'LUN · CHAT NUEVO')} text={t('NVDA? Buy it.', '¿NVDA? Cómprala.')} />
      </motion.div>
      <motion.div {...drop(0.28, 3)} className="absolute bottom-0 right-0 origin-bottom lg:left-[350px] lg:right-auto">
        <ChatBubble day={t('TUE · NEW CHAT', 'MAR · CHAT NUEVO')} text={t('NVDA? I’d sell.', '¿NVDA? Yo vendería.')} />
      </motion.div>
      <motion.div
        className="absolute left-[150px] top-[96px] lg:left-[262px] lg:top-[20px]"
        initial={reduceMotion ? false : { opacity: 0, scale: 1.9, rotate: -24 }}
        animate={inView || reduceMotion ? { opacity: 1, scale: 1, rotate: -8 } : { opacity: 0, scale: 1.9, rotate: -24 }}
        transition={{ delay: reduceMotion ? 0 : 1.95, type: 'spring', stiffness: 520, damping: 17 }}
      >
        <TextSticker tone="gold" className="!static">{t('SAME QUESTION.', 'MISMA PREGUNTA.')}</TextSticker>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------ argue back */

const QUESTIONS: [string, string][] = [
  ['What’s your exit if it drops?', '¿Cuál es tu salida si baja?'],
  ['Is the move already priced in?', '¿El movimiento ya está en el precio?'],
  ['How much can you afford to lose?', '¿Cuánto puedes permitirte perder?'],
];

/** Parallax depth + a soft idle float around each message, so the thread feels alive without shouting. */
function Drift({ progress, depth, visible, children, className = '', float = 5 }: { progress: MotionValue<number>; depth: number; visible: boolean; children: React.ReactNode; className?: string; float?: number }) {
  const reduceMotion = useReducedMotion();
  const y = useTransform(progress, [0, 1], [depth * 36, -depth * 36]);
  return (
    <motion.div className={className} style={reduceMotion ? undefined : { y }}>
      <motion.div
        initial={false}
        animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <motion.div animate={visible && !reduceMotion ? { y: [0, -4, 0] } : { y: 0 }} transition={{ duration: float, repeat: Infinity, ease: 'easeInOut' }}>
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** The conversation plays out when it scrolls into view: your idea, Bobby typing, the pushback, then you. */
function ArgueBack() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) { setStep(5); return; }
    const ids = [150, 950, 2100, 3000, 4300].map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [inView, reduceMotion]);
  return (
    <div ref={ref} className="a3-visual relative mx-auto flex min-h-[560px] w-full max-w-[400px] flex-col justify-center gap-3.5 lg:min-h-[660px] lg:max-w-[620px] lg:gap-6">
      <Drift progress={scrollYProgress} depth={1.2} visible={step >= 1} className="self-end" float={5.2}>
        <div className="rounded-[24px_24px_6px_24px] bg-[#FBFAF1] px-5 py-3.5 text-[19px] font-extrabold tracking-[-0.02em] text-[#050706] shadow-[0_16px_36px_rgba(6,26,77,.35)] lg:rounded-[32px_32px_8px_32px] lg:px-8 lg:py-5 lg:text-[31px]">
          {t('I think NVDA could go up.', 'Creo que NVDA puede subir.')}
        </div>
      </Drift>

      <Drift progress={scrollYProgress} depth={0.6} visible={step >= 2} float={6.4}>
        <div className="flex items-end gap-3">
          <motion.img
            src="/mascots/byte.webp" alt="" className="h-10 w-10 shrink-0 rounded-full border-2 border-white/80 object-cover lg:h-14 lg:w-14"
            animate={step === 2 && !reduceMotion ? { rotate: [0, -8, 8, 0], y: [0, -3, 0] } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.9, repeat: step === 2 ? Infinity : 0 }}
          />
          {step === 2 ? (
            <div className="flex items-center gap-1.5 rounded-[24px_24px_24px_6px] bg-[#050706] px-5 py-4" aria-hidden="true">
              <span className="a3-typing h-2.5 w-2.5 rounded-full bg-[#7FFABD]" />
              <span className="a3-typing h-2.5 w-2.5 rounded-full bg-[#7FFABD] [animation-delay:.15s]" />
              <span className="a3-typing h-2.5 w-2.5 rounded-full bg-[#7FFABD] [animation-delay:.3s]" />
            </div>
          ) : (
            <motion.div
              initial={false}
              animate={step >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex origin-bottom-left flex-col gap-2 rounded-[26px_26px_26px_6px] bg-[#050706] px-5 py-4 text-[#FBFAF1] shadow-[0_22px_50px_rgba(6,26,77,.45)] lg:rounded-[38px_38px_38px_8px] lg:px-8 lg:py-7"
            >
              <span className="text-[27px] font-black leading-[1.02] tracking-[-0.035em] lg:text-[52px]">{t('Maybe. What could prove you wrong?', 'Puede ser. ¿Qué te probaría equivocado?')}</span>
              <span className={`${MONO} text-[10px] font-semibold tracking-[0.12em] text-[#7FFABD] lg:text-xs`}>BOBBY</span>
            </motion.div>
          )}
        </div>
      </Drift>

      <Drift progress={scrollYProgress} depth={0.2} visible={step >= 4} className="ml-[52px] lg:ml-[68px]" float={7}>
        <div className="relative rounded-[22px] border border-white/15 bg-[#0B1330]/90 p-4 text-[#FBFAF1] lg:rounded-[30px] lg:p-7">
          <div className={`${MONO} mb-3 text-[10px] font-semibold tracking-[0.12em] text-[#7FFABD] lg:mb-4 lg:text-xs`}>{t('BEFORE YOU DECIDE', 'ANTES DE DECIDIR')}</div>
          <ol className="flex flex-col gap-2.5 lg:gap-3.5">
            {QUESTIONS.map(([en, es], i) => (
              <motion.li
                key={en}
                className="flex items-center gap-3 text-[15px] font-bold lg:text-[21px]"
                initial={false}
                animate={step >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
                transition={{ delay: step >= 4 ? 0.2 + i * 0.22 : 0, duration: 0.4, ease: EASE }}
              >
                <motion.span
                  className={`${MONO} grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#7FFABD] text-[11px] font-semibold text-[#050706] lg:h-8 lg:w-8 lg:text-xs`}
                  initial={false}
                  animate={step >= 4 ? { scale: [0.4, 1.25, 1] } : { scale: 0.4 }}
                  transition={{ delay: step >= 4 ? 0.2 + i * 0.22 : 0, duration: 0.45 }}
                >
                  {i + 1}
                </motion.span>
                {t(en, es)}
              </motion.li>
            ))}
          </ol>
          <TextSticker tone="gold" rotate={6} className="-right-2 -top-5 lg:-right-8 lg:-top-6">{t('SECOND OPINION', 'SEGUNDA OPINIÓN')}</TextSticker>
        </div>
      </Drift>

      <Drift progress={scrollYProgress} depth={1} visible={step >= 5} className="self-end" float={4.6}>
        <motion.div
          className="rounded-[24px_24px_6px_24px] bg-[#FBFAF1] px-5 py-3 text-[17px] font-extrabold text-[#050706] shadow-[0_16px_36px_rgba(6,26,77,.35)] lg:px-7 lg:py-4 lg:text-[25px]"
          initial={false}
          animate={step >= 5 && !reduceMotion ? { rotate: [0, -4, 3, 0] } : { rotate: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          {t('…ok, fair.', '…ok, tiene sentido.')}
        </motion.div>
      </Drift>
    </div>
  );
}

/* --------------------------------------------------------- floating phone */

/** A real Live Desk screen, lifted off the store plate so it floats on the poster's colour instead of sitting in a frame. */
function FloatingPhone({ src, alt, className, rotate, fadeBottom = false, glow }: { src: string; alt: string; className: string; rotate: number; fadeBottom?: boolean; glow: string }) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? { style: { rotate } }
    : { initial: { opacity: 0, y: 60, rotate: rotate - 5 }, whileInView: { opacity: 1, y: 0, rotate }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.9, ease: EASE } };
  const mask = fadeBottom ? 'linear-gradient(180deg, #000 82%, transparent 100%)' : undefined;
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }} />
      {/* the wrapper centres; the image itself is free for the entrance transform */}
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <motion.img
          {...motionProps}
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          className={`drop-shadow-[0_40px_60px_rgba(5,7,6,.35)] ${className}`}
          style={{ ...(reduceMotion ? { transform: `rotate(${rotate}deg)` } : {}), maskImage: mask, WebkitMaskImage: mask }}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ page */

export default function BobbyAppLandingWorld() {
  const record = useRecord();
  const reduceMotion = useReducedMotion();
  const byteRef = useRef<HTMLDivElement>(null);
  const receiptsRef = useRef<HTMLElement>(null);
  const argueRef = useRef<HTMLElement>(null);
  const { scrollYProgress: leaveReceipts } = useScroll({ target: argueRef, offset: ['start end', 'start start'] });

  const pageTitle = t('Bobby — Fun to ask. Hard to fool.', 'Bobby — Divertido de usar. Difícil de engañar.');
  const pageDescription = t(
    'Ask Bobby about Bitcoin, Nvidia, gold and 600 more. It argues back before your money is in, writes every call down before the market answers, and your discipline builds a world you can walk through.',
    'Pregúntale a Bobby por Bitcoin, Nvidia, oro y 600 activos más. Te discute antes de que entre tu dinero, escribe cada llamada antes de que el mercado responda, y tu disciplina construye un mundo que puedes recorrer.',
  );
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);
  const heroReveal = reduceMotion ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7 } };

  return (
    <div className="min-h-screen bg-[#08130E] text-[#050706] antialiased [font-family:Archivo,system-ui,sans-serif] selection:bg-[#7FFABD] selection:text-[#050706]">
      <Helmet>
        <title>{pageTitle}</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap" />
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href="https://bobbyprotocol.xyz/app" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://bobbyprotocol.xyz/app" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content="https://bobbyprotocol.xyz/favicon-bobby-v3.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content="https://bobbyprotocol.xyz/favicon-bobby-v3.png" />
      </Helmet>

      {/* ============ 01 · HERO ============ */}
      <Poster first z={10} className="bg-[#FBFAF1]">
        <header className="relative z-20 flex h-[64px] items-center justify-between px-5 lg:h-[96px] lg:px-16">
          <a href="/app" className="text-[26px] font-black tracking-[-0.06em] lg:text-[30px]">bobby</a>
          <nav className="hidden items-center gap-9 text-base font-semibold lg:flex">
            <a href="#receipts" className="transition hover:opacity-70">{t('Receipts', 'Recibos')}</a>
            <a href="#world" className="transition hover:opacity-70">{t('Bobby’s world', 'El mundo de Bobby')}</a>
            <a href="/protocol" className="transition hover:opacity-70">Bobby Protocol</a>
          </nav>
          <div className="flex items-center gap-3 lg:gap-5">
            <button type="button" onClick={() => setLang(isSpanish() ? 'en' : 'es')} className="min-h-11 px-1 text-[13px] font-bold opacity-60 transition hover:opacity-100 lg:text-[15px]">
              {isSpanish() ? 'EN' : 'ES'}
            </button>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full bg-[#050706] px-4 text-sm font-bold text-[#FBFAF1] transition hover:bg-black lg:h-12 lg:px-6 lg:text-base">
              {t('Get the app', 'Descárgala')}
            </a>
          </div>
        </header>

        <div className="relative mx-auto grid max-w-[1440px] gap-6 px-5 pb-14 pt-6 lg:h-[calc(100%-96px)] lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:gap-10 lg:px-16 lg:pb-16 lg:pt-0 xl:grid-cols-[minmax(0,1fr)_620px]">
          <motion.div {...heroReveal} className="relative z-10">
            <h1 className="text-[clamp(3.3rem,15vw,4rem)] font-black leading-[0.88] tracking-[-0.055em] lg:text-[4.25rem] xl:text-[clamp(5.5rem,7.1vw,7.5rem)]">
              {t('Fun to ask.', 'Divertido de usar.')}<br />{t('Hard to fool.', 'Difícil de engañar.')}
            </h1>
            <p className="mt-5 max-w-[540px] text-[17px] font-medium leading-[1.4] lg:mt-8 lg:text-[23px]">
              {t(
                'Bobby makes the market fun to follow — and argues back before your money is in.',
                'Bobby hace que seguir el mercado sea divertido — y te discute antes de que entre tu dinero.',
              )}
            </p>
            <div className="mt-7 hidden items-center gap-7 lg:mt-10 lg:flex">
              <StoreButton />
              <a href={DESK_URL} className="whitespace-nowrap text-lg font-bold underline underline-offset-[6px]">{t('Try it in your browser', 'Pruébala en tu navegador')}</a>
            </div>
            <div className="relative mt-12 hidden h-14 lg:block">
              <TextSticker tone="gold" rotate={-5} className="left-1">{t('ANALYSIS, NEVER ADVICE.', 'ANÁLISIS, NUNCA ASESORÍA.')}</TextSticker>
            </div>
          </motion.div>

          {/* Byte and his pet — phones */}
          <div className="lg:hidden">
            <HeroBobby className="mx-auto mt-2 h-[360px] w-[320px]" />
            <div className="relative mx-auto mt-2 h-11 w-[320px]">
              <TextSticker tone="gold" rotate={-4} className="left-10 top-0">{t('ANALYSIS, NEVER ADVICE.', 'ANÁLISIS, NUNCA ASESORÍA.')}</TextSticker>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:hidden">
            <StoreButton className="w-full" />
            <a href={DESK_URL} className="flex min-h-11 items-center justify-center text-[15px] font-bold underline underline-offset-4">{t('Try it in your browser', 'Pruébala en tu navegador')}</a>
          </div>

          {/* Byte and his pet — desktop */}
          <HeroBobby byteRef={byteRef} className="a3-visual hidden h-[575px] w-[460px] lg:block xl:h-[700px] xl:w-[560px]" />
        </div>
      </Poster>

      {/* Byte grabs the next poster instead of being covered by it */}
      <LedgeByte standingRef={byteRef} edgeRef={receiptsRef} />

      {/* ============ 02 · CHATBOTS FORGET ============ */}
      <Poster id="receipts" z={20} sectionRef={receiptsRef} className="bg-[#75F8C0]">
        <div className="mx-auto grid max-w-[1440px] gap-12 a3-poster-inner px-5 py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16 lg:px-16">
          <div>
            <PosterCopy
              size="md"
              title={<>{t('Chatbots forget.', 'Los chatbots olvidan.')}<br />{t('Bobby keeps receipts.', 'Bobby guarda recibos.')}</>}
              body={t(
                'It doesn’t remember what it told you. Bobby writes every call down before the market answers — misses included.',
                'No recuerda lo que te dijo. Bobby escribe cada llamada antes de que el mercado responda — fallos incluidos.',
              )}
            />
            <MarbleBubbles />
            <p className="mt-6 max-w-[620px] text-[15px] font-medium leading-[1.45] lg:mt-6 lg:text-lg">
              {t(
                'Bobby runs on the same models everyone else uses. The difference is not the model — it is the procedure around it.',
                'Bobby usa los mismos modelos que todos. La diferencia no es el modelo — es el procedimiento alrededor.',
              )}
            </p>
          </div>
          <div className="a3-visual flex justify-center pb-6 lg:pb-0">
            <CrumpleReceipt record={record} progress={leaveReceipts} />
          </div>
        </div>
      </Poster>

      {/* ============ 03 · IT WON'T JUST AGREE ============ */}
      <Poster z={30} sectionRef={argueRef} className="bg-[#2170FD] text-white">
        <div className="mx-auto grid max-w-[1440px] gap-10 a3-poster-inner px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:px-16">
          <PosterCopy
            title={<>{t('It won’t just', 'No nomás')}<br />{t('agree with you.', 'te da la razón.')}</>}
            body={t('Tell it your idea. Bobby answers — then asks what could prove you wrong.', 'Cuéntale tu idea. Bobby responde — y luego te pregunta qué te probaría equivocado.')}
          />
          <ArgueBack />
        </div>
      </Poster>

      {/* ============ 04 · NEVER ALONE ============ */}
      <Poster id="squad" z={40} className="bg-[#FBFAF1]">
        <div className="mx-auto grid max-w-[1440px] gap-10 a3-poster-inner px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:px-16">
          <PosterCopy
            title={<>{t('Never face', 'Nunca enfrentes')}<br />{t('the market alone.', 'el mercado solo.')}</>}
            body={t('Pick who talks to you. Calm, blunt or full trading desk — same numbers underneath.', 'Elige quién te habla. Tranquilo, directo o de mesa de trading — los mismos números abajo.')}
          />
          <div className="relative">
            <SquadLineup />
            <TextSticker tone="mint" rotate={-3} className="bottom-0 right-6 lg:bottom-2 lg:right-16">{t('PICK YOUR BOBBY', 'ELIGE A TU BOBBY')}</TextSticker>
          </div>
        </div>
      </Poster>

      {/* ============ 05 · MORE THAN A PRICE ============ */}
      <Poster z={50} className="bg-[#08130E] text-[#FBFAF1]">
        <div className="mx-auto grid max-w-[1440px] gap-10 a3-poster-inner px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:px-16">
          <PosterCopy
            dark
            title={<>{t('More than', 'Más que')}<br />{t('a price.', 'un precio.')}</>}
            body={t('See both sides before you decide.', 'Mira los dos lados antes de decidir.')}
          >
            <div className={`${MONO} mt-7 flex flex-wrap gap-2.5 text-[11px] font-semibold tracking-[0.1em] lg:mt-10 lg:text-[13px]`}>
              {[t('CONTEXT', 'CONTEXTO'), t('KEY LEVELS', 'NIVELES CLAVE'), t('BOTH SIDES', 'LOS DOS LADOS')].map((label) => (
                <span key={label} className="rounded-full border border-[#7FFABD]/40 px-3.5 py-2 text-[#7FFABD]">{label}</span>
              ))}
            </div>
          </PosterCopy>
          <div className="a3-visual relative mx-auto h-[500px] w-[330px] lg:h-[780px] lg:w-[520px]">
            <FloatingPhone
              src={`${P}/phone-chart.webp`}
              alt={t('Bobby Live Desk showing a BTC chart with context and key levels', 'El Live Desk de Bobby con una gráfica de BTC, contexto y niveles clave')}
              className="w-[300px] lg:w-[480px]"
              rotate={-3}
              fadeBottom
              glow="rgba(127,250,189,.22)"
            />
          </div>
        </div>
      </Poster>

      {/* ============ 06 · NO EDGE, NO TRADE ============ */}
      <Poster z={60} className="bg-[#7FFABD]">
        <div className="mx-auto grid max-w-[1440px] gap-10 a3-poster-inner px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:px-16">
          <PosterCopy
            title={<>{t('No edge?', '¿Sin ventaja?')}<br />{t('No trade.', 'No se opera.')}</>}
            body={t('Bobby can tell you to wait. Not today is a real answer.', 'Bobby te puede decir que esperes. «Hoy no» también es una respuesta.')}
          />
          <div className="a3-visual relative mx-auto h-[520px] w-[330px] lg:h-[780px] lg:w-[520px]">
            <FloatingPhone
              src={`${P}/phone-notrade.webp`}
              alt={t('Bobby Live Desk showing the Halo risk gate: NO TRADE, no clear setup', 'El Live Desk de Bobby con el filtro de riesgo de Halo: NO TRADE, sin setup claro')}
              className="mt-2.5 h-[500px] w-auto lg:h-[740px]"
              rotate={4}
              glow="rgba(255,255,255,.55)"
            />
            <PetSticker src={`${PET}/pet-sol.webp`} className="bottom-3 left-2 w-[82px] lg:bottom-8 lg:left-6 lg:w-[124px]" rotate={-7} />
            <TextSticker tone="ink" rotate={-5} className="right-0 top-[330px] lg:-right-6 lg:top-[470px]">{t('WAITING COUNTS TOO', 'ESPERAR TAMBIÉN CUENTA')}</TextSticker>
          </div>
        </div>
      </Poster>

      {/* ============ 07 · BOBBY'S WORLD ============ */}
      <BobbyWorld />

      {/* ============ 08 · GET IT ============ */}
      <section className="a3-poster-card relative overflow-hidden bg-[#FBFAF1]" style={{ zIndex: 80 }}>
        <div className="mx-auto grid max-w-[1440px] items-center gap-8 px-5 pb-14 pt-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10 lg:px-16 lg:py-24">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <h2 className="text-[clamp(2.8rem,12vw,3.6rem)] font-black leading-[0.9] tracking-[-0.055em] lg:text-[clamp(4.5rem,6.6vw,6.5rem)]">
              {t('Don’t guess.', 'No adivines.')}<br />{t('Ask Bobby.', 'Pregúntale a Bobby.')}
            </h2>
            <p className="mt-4 max-w-[460px] text-[17px] font-medium leading-[1.4] lg:mt-6 lg:text-[22px]">
              {t('Free on iPhone. The desk is open on the web too.', 'Gratis en iPhone. El desk también está abierto en la web.')}
            </p>
            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:mt-10 lg:gap-7">
              <StoreButton />
              <a href={DESK_URL} className="flex min-h-11 items-center justify-center whitespace-nowrap text-[15px] font-bold underline underline-offset-4 sm:justify-start lg:text-lg">
                {t('Try it in your browser', 'Pruébala en tu navegador')}
              </a>
            </div>
          </motion.div>
          <HeroBobby className="a3-visual mx-auto h-[320px] w-[290px] lg:h-[520px] lg:w-[440px]" />
        </div>
      </section>

      <footer className="relative bg-[#08130E] px-5 py-8 text-[#FBFAF1] lg:px-16" style={{ zIndex: 90 }}>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-7 gap-y-3 text-sm">
          <span className="text-xl font-black tracking-[-0.06em]">bobby</span>
          <a href={DESK_URL} className="font-semibold opacity-75 transition hover:opacity-100">{t('Open the desk on the web', 'Abre el desk en la web')}</a>
          <a href="/protocol" className="font-semibold opacity-75 transition hover:opacity-100">Bobby Protocol</a>
          <span className={`${MONO} ml-auto text-xs tracking-[0.08em] opacity-60`}>{t('ANALYSIS, NEVER ADVICE.', 'ANÁLISIS, NUNCA ASESORÍA.')}</span>
        </div>
      </footer>
    </div>
  );
}
