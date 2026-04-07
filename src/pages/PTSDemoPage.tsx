// ============================================================
// GLOBAL INVESTOR — Student-facing landing page
// Route: /demopts (standalone, no KineticShell/MainLayout)
// Target: Hispanic man, 25-35, LATAM, wants to live from trading
// ============================================================

import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  Brain, BarChart3, Shield, ChevronDown,
  ArrowRight, Check, Terminal, Sparkles, Cpu,
  Users, Youtube, TrendingUp,
} from 'lucide-react';

// ============================================================
// BRAND TOKENS — PTS
// ============================================================
const PTS = {
  gold: '#F8CF2C',
  goldLight: '#ffeebe',
  bg: '#11121e',
  surface: '#1e1f2b',
  surfaceAlt: '#282936',
  text: '#e2e1f2',
  textMuted: '#999079',
  outline: '#999079',
  btnText: '#3b2f00',
};

// ============================================================
// DATA
// ============================================================
const SOCIAL_PROOF = [
  { icon: Users, value: '+3,000', label: 'Alumnos activos' },
  { icon: Youtube, value: '45K', label: 'Suscriptores YouTube' },
  { icon: TrendingUp, value: '99%', label: 'Rentables en 3 meses' },
];

const DIFFERENTIATORS = [
  {
    icon: Brain,
    title: '3 Agentes que Debaten',
    desc: 'No es un bot que dispara señales a lo loco. Son 3 agentes de IA que analizan, cuestionan y confirman cada trade entre ellos. Solo cuando los tres están de acuerdo, te llega la notificación.',
  },
  {
    icon: BarChart3,
    title: '70+ Indicadores en Tiempo Real',
    desc: 'SPY, QQQ, NVDA, Bitcoin, Ethereum, EUR/USD, oro. Dany monitorea todo simultáneamente — algo que ningún trader humano puede hacer solo.',
  },
  {
    icon: Shield,
    title: 'Transparencia Verificable',
    desc: 'Cada predicción queda grabada de forma permanente. No se puede borrar ni editar. Por primera vez, puedes verificar el historial completo de señales.',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Inscríbete en Global Investor',
    desc: 'Accedes al programa completo de formación + Dany Agent Trader desde el día uno.',
  },
  {
    step: '02',
    title: 'Aprende con PTS',
    desc: '9 módulos, lives con Javier y Daniel, comunidad de traders reales que comparten setups y estructura de mercado.',
  },
  {
    step: '03',
    title: 'Activa a Dany en Telegram',
    desc: 'Señales de IA 24/7 directo a tu Telegram. Entrada, stop loss, take profit — todo analizado por 3 agentes.',
  },
  {
    step: '04',
    title: 'Opera con ventaja',
    desc: 'Tú decides, Dany analiza. Tú pones la disciplina, la IA pone los datos. Juntos ganan.',
  },
];

const CHECKLIST = [
  'Programa completo de formación PTS (9 módulos + 40 lecciones)',
  'Sesiones en vivo con Javier y Daniel (lunes, miércoles, viernes)',
  'Acceso a Dany Agent Trader — señales de IA 24/7',
  '3 agentes que debaten cada trade antes de notificarte',
  '70+ indicadores técnicos en tiempo real',
  'Historial verificable de cada predicción',
  'Canal exclusivo de Global Investor en Telegram',
  'Soporte directo con el equipo PTS',
];

const DEMO_CHIPS = ['SPY', 'QQQ', 'NVDA', 'BTC', 'ETH', 'GOLD'];

const FAQ_ITEMS = [
  {
    q: '¿La IA me va a reemplazar como trader?',
    a: 'Para nada. Dany no toma trades por ti. Tú sigues siendo el que decide cuándo entrar, dónde poner el stop loss, y cuándo cerrar la operación. Dany te da el análisis — la acción del precio, la estructura de mercado, los indicadores — y tú tomas la decisión final. Piensa en Dany como tu analista personal que trabaja 24/7.',
  },
  {
    q: '¿Y si las señales son malas?',
    a: 'Buena pregunta. Cada predicción queda grabada de forma permanente y pública. No se puede borrar ni editar después del hecho. Si Dany se equivoca, queda registrado igual que cuando acierta. Esa transparencia es lo que nos diferencia de cualquier otro servicio de señales. Además, los 3 agentes debaten entre ellos antes de emitir una señal — no es un indicador básico tirando flechas.',
  },
  {
    q: '¿No será otro bot de señales?',
    a: 'No tiene nada que ver. Los bots típicos son un indicador básico que cruza una media móvil y te manda "COMPRA BTC". Dany tiene 3 agentes: el Alpha Hunter busca la oportunidad y analiza la estructura de mercado, el Red Team intenta destruir la tesis con riesgos y contraargumentos, y el CIO toma la decisión final con entry, stop loss y take profit. Es como tener un equipo de analistas institucionales debatiendo cada setup.',
  },
  {
    q: '¿Necesito saber de tecnología?',
    a: 'Cero. Si sabes usar Telegram, sabes usar Dany. Te llega una notificación con el análisis completo: qué activo, en qué dirección, dónde entrar, dónde salir si pierdes, y dónde tomar ganancias. Todo en español, todo explicado para que aprendas mientras operas.',
  },
];

// ============================================================
// ANIMATED TERMINAL COMPONENT
// ============================================================
const TERMINAL_LINES = [
  { text: '> dany.analizar("SPY")', color: PTS.gold, delay: 0 },
  { text: '[Alpha Hunter] SPY en $582.34 — estructura alcista intacta', color: '#6ee7b7', delay: 800 },
  { text: '[Alpha Hunter] RSI(14): 58.2 | MACD: cruce alcista | Bollinger: banda media', color: '#6ee7b7', delay: 1600 },
  { text: '[Red Team] Alerta: VIX subiendo +8% hoy. Resistencia en $585', color: '#fca5a5', delay: 2800 },
  { text: '[Red Team] Volumen cayendo en rally — ¿distribución?', color: '#fca5a5', delay: 3600 },
  { text: '[CIO] VEREDICTO: LONG CAUTELOSO — 60% del tamaño máximo', color: PTS.gold, delay: 5000 },
  { text: '[CIO] Entrada: $581.50 | Stop Loss: $576.20 | Take Profit: $592.00', color: PTS.gold, delay: 5800 },
  { text: '[Sistema] Señal registrada permanentemente: 0x3f7a...c21d', color: '#a5b4fc', delay: 7000 },
  { text: '> _', color: PTS.gold, delay: 8000 },
];

function AnimatedTerminal() {
  const [visibleLines, setVisibleLines] = useState<number>(0);

  // Use useRef to track timers for cleanup
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Start animation on mount
  useState(() => {
    const startAnimation = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setVisibleLines(0);
      TERMINAL_LINES.forEach((line, i) => {
        timersRef.current.push(setTimeout(() => setVisibleLines(i + 1), line.delay));
      });
      timersRef.current.push(setTimeout(startAnimation, 10000));
    };
    startAnimation();
  });

  return (
    <div
      className="rounded-xl border overflow-hidden font-mono text-xs"
      style={{
        background: 'rgba(30,31,43,0.8)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(153,144,121,0.3)',
      }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(153,144,121,0.15)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="text-[10px] ml-2" style={{ color: PTS.textMuted }}>DANY AGENT TRADER — Terminal</span>
      </div>
      {/* Content */}
      <div className="p-4 space-y-1.5 min-h-[220px]">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="leading-relaxed"
            style={{ color: line.color }}
          >
            {line.text}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SECTION WRAPPER WITH INVIEW ANIMATION
// ============================================================
function AnimatedSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// FAQ ACCORDION ITEM
// ============================================================
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'rgba(30,31,43,0.6)',
        borderColor: open ? 'rgba(248,207,44,0.3)' : 'rgba(153,144,121,0.1)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left"
      >
        <span className="text-sm font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          {q}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: PTS.gold }} />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <p
          className="px-5 pb-5 text-sm leading-relaxed"
          style={{ color: 'rgba(226,225,242,0.5)', fontFamily: 'Inter, sans-serif' }}
        >
          {a}
        </p>
      </motion.div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function PTSDemoPage() {
  return (
    <div className="min-h-screen" style={{ background: PTS.bg, color: PTS.text }}>
      <Helmet>
        <title>Global Investor — Aprende a Operar con IA | Pro Trading Skills</title>
        <meta name="description" content="Global Investor es el primer programa de trading en español con inteligencia artificial. 3 agentes de IA debaten cada trade. Formación + IA 24/7." />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Helmet>

      {/* ========== NAV BAR ========== */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          background: 'rgba(17,18,30,0.85)',
          backdropFilter: 'blur(16px)',
          borderColor: 'rgba(153,144,121,0.15)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${PTS.gold}, ${PTS.goldLight})` }}
            >
              <Cpu className="w-4 h-4" style={{ color: PTS.btnText }} />
            </div>
            <span
              className="text-sm font-bold tracking-wider"
              style={{ fontFamily: 'Manrope, sans-serif', color: PTS.gold }}
            >
              GLOBAL INVESTOR
            </span>
          </div>
          <a
            href="/demopts/onboarding"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${PTS.gold}, ${PTS.goldLight})`,
              color: PTS.btnText,
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            PROBAR DANY GRATIS
          </a>
        </div>
      </nav>

      {/* Spacer for fixed nav */}
      <div className="h-16" />

      {/* ========== 1. HERO ========== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 20%, rgba(248,207,44,0.08) 0%, transparent 60%)` }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left */}
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide mb-6"
                style={{
                  background: 'rgba(248,207,44,0.08)',
                  borderColor: 'rgba(248,207,44,0.25)',
                  color: PTS.gold,
                  fontFamily: 'Space Grotesk, monospace',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                SOLO 50 CUPOS CON ACCESO A DANY AGENT TRADER
              </div>

              <h1
                className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.1] tracking-tight mb-5"
                style={{ fontFamily: 'Manrope, sans-serif' }}
              >
                Aprende a Operar.{' '}
                <span style={{ color: PTS.gold }}>Deja que la IA Analice por Ti.</span>
              </h1>

              <p
                className="text-sm sm:text-base leading-relaxed mb-4 max-w-lg"
                style={{ color: 'rgba(226,225,242,0.55)', fontFamily: 'Inter, sans-serif' }}
              >
                Global Investor es el primer programa de trading en español que combina formación profesional con un sistema de inteligencia artificial que analiza 70+ indicadores, debate cada señal entre 3 agentes, y opera 24/7 en tu Telegram.
              </p>

              <p
                className="text-base font-semibold mb-8"
                style={{ color: PTS.gold, fontFamily: 'Manrope, sans-serif' }}
              >
                Tú aprendes. Dany analiza. Juntos, operan mejor.
              </p>

              <a
                href="/demopts/onboarding"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-lg text-sm font-bold tracking-wide transition-all hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${PTS.gold}, ${PTS.goldLight})`,
                  color: PTS.btnText,
                  fontFamily: 'Manrope, sans-serif',
                  boxShadow: '0 0 40px rgba(248,207,44,0.15)',
                }}
              >
                PROBAR GLOBAL INVESTOR AI <ArrowRight className="w-4 h-4" />
              </a>

              <div className="mt-4 flex flex-col gap-1.5">
                <p className="text-xs" style={{ color: 'rgba(226,225,242,0.35)', fontFamily: 'Inter, sans-serif' }}>
                  Solo 50 cupos con acceso gratuito a Dany Agent Trader
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 max-w-[180px] h-2 rounded-full overflow-hidden" style={{ background: 'rgba(248,207,44,0.1)' }}>
                    <div className="h-full rounded-full" style={{ width: '94%', background: `linear-gradient(90deg, ${PTS.gold}, ${PTS.goldLight})` }} />
                  </div>
                  <span
                    className="text-xs font-bold"
                    style={{ color: PTS.gold, fontFamily: 'Space Grotesk, monospace' }}
                  >
                    47/50 cupos disponibles
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Right — Animated Terminal */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="hidden lg:block"
            >
              <AnimatedTerminal />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== 2. SOCIAL PROOF BAR ========== */}
      <section className="border-t border-b" style={{ borderColor: 'rgba(153,144,121,0.1)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <AnimatedSection>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {SOCIAL_PROOF.map((item) => (
                <div key={item.label} className="flex items-center gap-4 justify-center">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(248,207,44,0.1)' }}
                  >
                    <item.icon className="w-6 h-6" style={{ color: PTS.gold }} />
                  </div>
                  <div>
                    <div
                      className="text-2xl font-extrabold"
                      style={{ color: PTS.gold, fontFamily: 'Manrope, sans-serif' }}
                    >
                      {item.value}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(226,225,242,0.4)', fontFamily: 'Inter, sans-serif' }}>
                      {item.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ========== 3. THREE DIFFERENTIATORS ========== */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-12">
              <div
                className="text-[10px] tracking-[0.2em] mb-2 font-semibold"
                style={{ color: PTS.textMuted, fontFamily: 'Space Grotesk, monospace' }}
              >
                POR QUÉ GLOBAL INVESTOR ES DIFERENTE
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                No es un curso más.{' '}
                <span style={{ color: PTS.gold }}>Es formación + IA.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {DIFFERENTIATORS.map((d, i) => (
              <AnimatedSection key={d.title} delay={i * 0.12}>
                <div
                  className="p-7 rounded-xl border h-full group hover:border-[rgba(248,207,44,0.3)] transition-colors"
                  style={{
                    background: 'rgba(30,31,43,0.8)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(153,144,121,0.1)',
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: 'rgba(248,207,44,0.1)' }}
                  >
                    <d.icon className="w-6 h-6" style={{ color: PTS.gold }} />
                  </div>
                  <h3
                    className="text-base font-bold tracking-wide mb-3"
                    style={{ fontFamily: 'Manrope, sans-serif' }}
                  >
                    {d.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(226,225,242,0.45)', fontFamily: 'Inter, sans-serif' }}>
                    {d.desc}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 4. HOW IT WORKS FOR THE STUDENT ========== */}
      <section className="py-16 md:py-20 border-t" style={{ borderColor: 'rgba(153,144,121,0.1)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-12">
              <div
                className="text-[10px] tracking-[0.2em] mb-2 font-semibold"
                style={{ color: PTS.textMuted, fontFamily: 'Space Grotesk, monospace' }}
              >
                CÓMO FUNCIONA
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                De cero a operar con IA{' '}
                <span style={{ color: PTS.gold }}>en 4 pasos</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <AnimatedSection key={s.step} delay={i * 0.1}>
                <div
                  className="relative p-6 rounded-xl border h-full group hover:border-[rgba(248,207,44,0.3)] transition-colors"
                  style={{
                    background: 'rgba(30,31,43,0.8)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(153,144,121,0.1)',
                  }}
                >
                  <div
                    className="text-4xl font-extrabold mb-4"
                    style={{ color: 'rgba(248,207,44,0.15)', fontFamily: 'Manrope, sans-serif' }}
                  >
                    {s.step}
                  </div>
                  <h3
                    className="text-sm font-bold tracking-wide mb-2"
                    style={{ color: PTS.gold, fontFamily: 'Manrope, sans-serif' }}
                  >
                    {s.title}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(226,225,242,0.4)', fontFamily: 'Inter, sans-serif' }}>
                    {s.desc}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 5. WHAT YOU GET ========== */}
      <section className="py-16 md:py-20 border-t" style={{ borderColor: 'rgba(153,144,121,0.1)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div>
                <div
                  className="text-[10px] tracking-[0.2em] mb-2 font-semibold"
                  style={{ color: PTS.textMuted, fontFamily: 'Space Grotesk, monospace' }}
                >
                  QUÉ INCLUYE
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Todo lo que recibes con{' '}
                  <span style={{ color: PTS.gold }}>Global Investor</span>
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(226,225,242,0.4)', fontFamily: 'Inter, sans-serif' }}>
                  Formación profesional de trading + un sistema de inteligencia artificial que analiza los mercados por ti. No existe otro programa así en español.
                </p>
              </div>
              <div className="space-y-3">
                {CHECKLIST.map((item, i) => (
                  <AnimatedSection key={item} delay={i * 0.05}>
                    <div
                      className="flex items-center gap-3 p-3.5 rounded-lg border"
                      style={{
                        background: 'rgba(30,31,43,0.6)',
                        borderColor: 'rgba(153,144,121,0.1)',
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(248,207,44,0.15)' }}
                      >
                        <Check className="w-3.5 h-3.5" style={{ color: PTS.gold }} />
                      </div>
                      <span className="text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{item}</span>
                    </div>
                  </AnimatedSection>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ========== 6. LIVE DEMO ========== */}
      <section className="py-16 md:py-20 border-t" style={{ borderColor: 'rgba(153,144,121,0.1)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <div className="text-center max-w-2xl mx-auto">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide mb-6"
                style={{
                  background: 'rgba(248,207,44,0.08)',
                  borderColor: 'rgba(248,207,44,0.25)',
                  color: PTS.gold,
                  fontFamily: 'Space Grotesk, monospace',
                }}
              >
                <Terminal className="w-3.5 h-3.5" />
                DEMO EN VIVO
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Prueba a Dany{' '}
                <span style={{ color: PTS.gold }}>ahora mismo</span>
              </h2>
              <p className="text-sm mb-8" style={{ color: 'rgba(226,225,242,0.45)', fontFamily: 'Inter, sans-serif' }}>
                Escribe cualquier activo y Dany te dará un análisis completo con debate de 3 agentes, entrada, stop loss y take profit
              </p>

              {/* Quick action chips */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {DEMO_CHIPS.map(chip => (
                  <a
                    key={chip}
                    href="/demopts/onboarding"
                    className="px-5 py-2.5 rounded-lg border text-xs font-bold tracking-wide transition-all hover:scale-105 hover:border-[rgba(248,207,44,0.5)]"
                    style={{
                      background: 'rgba(30,31,43,0.8)',
                      borderColor: 'rgba(248,207,44,0.2)',
                      color: PTS.gold,
                      fontFamily: 'Space Grotesk, monospace',
                    }}
                  >
                    {chip}
                  </a>
                ))}
              </div>

              <a
                href="/demopts/onboarding"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-bold tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${PTS.gold}, ${PTS.goldLight})`,
                  color: PTS.btnText,
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                ABRIR TERMINAL DE DANY <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ========== 7. OBJECTION HANDLING — FAQ ========== */}
      <section className="py-16 md:py-20 border-t" style={{ borderColor: 'rgba(153,144,121,0.1)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-10">
              <div
                className="text-[10px] tracking-[0.2em] mb-2 font-semibold"
                style={{ color: PTS.textMuted, fontFamily: 'Space Grotesk, monospace' }}
              >
                PREGUNTAS FRECUENTES
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                ¿Dudas?{' '}
                <span style={{ color: PTS.gold }}>Te las resolvemos.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <AnimatedSection key={item.q} delay={i * 0.08}>
                <FAQItem q={item.q} a={item.a} />
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 8. FINAL CTA ========== */}
      <section className="py-20 md:py-28 border-t" style={{ borderColor: 'rgba(248,207,44,0.15)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-4 leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Tu Equipo de IA{' '}
                <span style={{ color: PTS.gold }}>ya Está Operando</span>
              </h2>
              <p className="text-sm mb-8 leading-relaxed" style={{ color: 'rgba(226,225,242,0.4)', fontFamily: 'Inter, sans-serif' }}>
                Los primeros 50 alumnos acceden a Dany sin costo adicional. Después se convierte en add-on de pago. No te quedes fuera.
              </p>

              <a
                href="/demopts/onboarding"
                className="inline-flex items-center gap-2 px-10 py-4 rounded-lg text-base font-bold tracking-wide transition-all hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${PTS.gold}, ${PTS.goldLight})`,
                  color: PTS.btnText,
                  fontFamily: 'Manrope, sans-serif',
                  boxShadow: '0 0 40px rgba(248,207,44,0.15)',
                }}
              >
                PROBAR GLOBAL INVESTOR AI <ArrowRight className="w-5 h-5" />
              </a>

              <div className="mt-5 flex items-center justify-center gap-2">
                <div className="flex-1 max-w-[180px] h-2 rounded-full overflow-hidden" style={{ background: 'rgba(248,207,44,0.1)' }}>
                  <div className="h-full rounded-full" style={{ width: '94%', background: `linear-gradient(90deg, ${PTS.gold}, ${PTS.goldLight})` }} />
                </div>
                <span
                  className="text-xs font-bold"
                  style={{ color: PTS.gold, fontFamily: 'Space Grotesk, monospace' }}
                >
                  47/50 cupos disponibles
                </span>
              </div>

              <p className="text-[10px] mt-8" style={{ color: 'rgba(226,225,242,0.2)', fontFamily: 'Space Grotesk, monospace' }}>
                Powered by Pro Trading Skills x DeFi Mexico
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ========== 9. FOOTER ========== */}
      <footer className="border-t py-6" style={{ borderColor: 'rgba(153,144,121,0.1)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[10px]" style={{ color: 'rgba(226,225,242,0.2)', fontFamily: 'Space Grotesk, monospace' }}>
              Pro Trading Skills &copy; 2026
            </span>
            <div className="flex items-center gap-4">
              <a href="#" className="text-[10px] transition-colors hover:underline" style={{ color: 'rgba(226,225,242,0.3)', fontFamily: 'Space Grotesk, monospace' }}>
                Términos
              </a>
              <a href="#" className="text-[10px] transition-colors hover:underline" style={{ color: 'rgba(226,225,242,0.3)', fontFamily: 'Space Grotesk, monospace' }}>
                Privacidad
              </a>
              <a href="#" className="text-[10px] transition-colors hover:underline" style={{ color: 'rgba(226,225,242,0.3)', fontFamily: 'Space Grotesk, monospace' }}>
                Contacto
              </a>
            </div>
            <span className="text-[10px]" style={{ color: 'rgba(226,225,242,0.15)', fontFamily: 'Space Grotesk, monospace' }}>
              Dany Agent Trader — Powered by Pro Trading Skills
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
