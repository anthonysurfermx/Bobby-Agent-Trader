// /app — the landing for the Bobby app.
//
// ONE line of communication, from `docs/messaging/core-message.md` v5:
// asking an AI about your asset is no longer an edge; verifying is. Every
// section is a beat of that single argument — why (the two eras), how (the
// procedure), the proof (the record), the reward for respecting it
// (discipline/aura, with Trader Land inside it) and who delivers it (squad).
// Aura, Trader Land and the companions are supports, never co-headlines.
// Every number and name comes from the companion data pack or the live
// protocol stats — nothing is invented for the pitch.
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'framer-motion';
import { Apple, ArrowRight, ChevronRight, Flame, Lock, Map as MapIcon, Menu, Mic, PawPrint, ShieldCheck, Sparkles, X } from 'lucide-react';
import { COMPANIONS, tintFor } from '@/lib/companions/data';
import { isSpanish, pick, t } from '@/lib/companions/i18n';
import TraderLandPreview, { TRADER_LAND_URL } from '@/components/companion/TraderLandPreview';
import { APP_STORE_URL } from '@/lib/app-store';

interface DebateActivity { commitmentsCreated?: number; decisionsResolved?: number; wins?: number; losses?: number; breakEven?: number; pending?: number; winRate?: number }
interface ProtocolStats { debateActivity?: DebateActivity }

const TRY_IT_URL = '/desk';
// Public App Store listing (live since 2026-09-15). Locale-less so Apple geo-routes it.
const WIN_RATE_MIN_SAMPLE = 20;
const GOLD = '#F5C542';
const GREEN = '#5cff91';

const formatNumber = (value: unknown, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : fallback;
};

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/bobby-protocol-stats', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as ProtocolStats;
        if (active) setStats(payload);
      } catch { /* the page stays complete without live stats */ }
    };
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => { active = false; controller.abort(); window.clearInterval(interval); };
  }, []);
  return stats;
}

function setLang(next: 'en' | 'es') {
  try { localStorage.setItem('bobby_lang', next); } catch { /* private mode */ }
  window.location.reload();
}

function BrandMark() {
  return (
    <a href="/app" className="flex items-center gap-2.5 text-white" aria-label="Bobby home">
      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-[13px] border border-[#F5C542]/40 bg-[#0b0a06] shadow-[0_0_28px_rgba(245,197,66,.22)]">
        <img src="/favicon-bobby-v3.png" alt="" className="h-10 w-10 object-cover" />
      </span>
      <span className="text-[15px] font-black tracking-[-0.04em]">BOBBY</span>
    </a>
  );
}

function LangToggle() {
  const es = isSpanish();
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-white/12 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
      <button type="button" onClick={() => setLang('es')} className={`min-h-11 px-3 py-2 transition ${es ? 'bg-white text-black' : 'text-white/55 hover:text-white'}`}>ES</button>
      <button type="button" onClick={() => setLang('en')} className={`min-h-11 px-3 py-2 transition ${!es ? 'bg-white text-black' : 'text-white/55 hover:text-white'}`}>EN</button>
    </div>
  );
}

function AppStoreBadge({ compact = false }: { compact?: boolean }) {
  return (
    <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] text-left shadow-[inset_0_1px_rgba(255,255,255,.08)] ${compact ? 'px-4 py-2.5' : 'px-5 py-3.5'}`} aria-label={t('Download Bobby on the App Store', 'Descarga Bobby en el App Store')}>
      <Apple className={compact ? 'h-6 w-6' : 'h-8 w-8'} strokeWidth={1.7} aria-hidden="true" />
      <span className="leading-none">
        <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/45">{t('Download on the', 'Descárgala en el')}</span>
        <span className={`${compact ? 'text-sm' : 'text-lg'} mt-1 block font-semibold tracking-[-0.03em]`}>App Store</span>
      </span>
    </a>
  );
}

function PhoneFrame({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-[#080a0d] p-[6px] shadow-[0_32px_90px_rgba(0,0,0,.65)]">
      <div className="pointer-events-none absolute left-1/2 top-[12px] z-10 h-[17px] w-[82px] -translate-x-1/2 rounded-full bg-black" />
      <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className="h-auto w-full rounded-[1.95rem]" />
    </div>
  );
}

/** 01 — the two eras, drawn instead of tabled. Left: one model, one opinion,
 *  nothing written down. Right: the squad argues, a verdict gets sealed, and
 *  the ledger keeps every bar — the red ones too. Real renders, no copy. */
function TwoErasArt() {
  const reduceMotion = useReducedMotion();
  const debate = ['byte', 'glitch', 'orb'];
  const ledger = [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1];
  return (
    <div className="grid gap-4 sm:grid-cols-[.85fr_1.15fr]" aria-hidden="true">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 sm:p-7">
        <div className="flex items-center justify-between font-mono text-[9px] font-black uppercase tracking-[0.22em] text-white/35"><span>01</span><span className="h-1.5 w-1.5 rounded-full bg-white/25" /></div>
        <div className="mt-10 space-y-3">
          <div className="ml-auto w-[68%] rounded-2xl rounded-br-md border border-white/10 bg-white/[0.07] p-4"><div className="h-2 w-2/3 rounded-full bg-white/30" /></div>
          <div className="w-[86%] space-y-2.5 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] p-4"><div className="h-2 w-full rounded-full bg-white/15" /><div className="h-2 w-11/12 rounded-full bg-white/15" /><div className="h-2 w-3/5 rounded-full bg-white/15" /></div>
          <div className="ml-auto w-[58%] rounded-2xl rounded-br-md border border-white/[0.08] bg-white/[0.05] p-4 opacity-70"><div className="h-2 w-1/2 rounded-full bg-white/25" /></div>
          <div className="w-[80%] space-y-2.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.03] p-4 opacity-50"><div className="h-2 w-full rounded-full bg-white/15" /><div className="h-2 w-2/3 rounded-full bg-white/15" /></div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#080a09] via-[#080a09]/80 to-transparent" />
        <div className="absolute inset-x-7 bottom-7 flex items-center gap-3"><span className="h-px flex-1 border-t border-dashed border-white/20" /><X className="h-3.5 w-3.5 text-white/30" /><span className="h-px flex-1 border-t border-dashed border-white/20" /></div>
      </div>
      <div className="relative overflow-hidden rounded-[2rem] border border-[#5cff91]/25 bg-[#0a120d] p-6 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(92,255,145,.18),transparent_55%)]" />
        <div className="relative flex items-center justify-between font-mono text-[9px] font-black uppercase tracking-[0.22em] text-[#5cff91]"><span>02</span><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5cff91]" /></div>
        <div className="relative mt-6 flex items-end justify-center gap-3 sm:gap-4">
          {debate.map((id, index) => (
            <motion.div key={id} animate={reduceMotion ? undefined : { y: [0, -6, 0] }} transition={{ duration: 3.2 + index * 0.5, repeat: Infinity, ease: 'easeInOut' }} className={`overflow-hidden rounded-3xl border border-white/15 bg-black/40 shadow-2xl ${index === 1 ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-20 w-20 sm:h-24 sm:w-24'}`}>
              <img src={`/mascots/${id}.webp`} alt="" loading="lazy" className="h-full w-full object-cover" />
            </motion.div>
          ))}
        </div>
        <svg viewBox="0 0 200 40" className="relative mx-auto mt-1 h-10 w-48" fill="none" stroke="rgba(92,255,145,.45)" strokeWidth="1.2"><path d="M30 2 C 40 22, 80 28, 100 38" /><path d="M100 2 V 38" /><path d="M170 2 C 160 22, 120 28, 100 38" /></svg>
        <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full border-[6px] border-white/85 bg-black/70 shadow-[0_0_60px_rgba(92,255,145,.35)]"><ShieldCheck className="h-10 w-10 text-[#5cff91]" /></div>
        <div className="relative mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/50 px-4 py-3">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#5cff91]" />
          <div className="flex h-7 flex-1 items-end gap-1">
            {ledger.map((hit, index) => <span key={index} className="flex-1 rounded-full" style={{ height: 10 + ((index * 7) % 16), background: hit ? '#5cff91' : '#ff8f83', opacity: 0.45 + ((index % 4) * 0.15) }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BobbyAppLandingExperience() {
  const stats = useProtocolStats();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCompanion, setActiveCompanion] = useState(1);

  const pageTitle = t('Bobby — Asking an AI is no longer an edge.', 'Bobby — Preguntarle a una IA ya no es ventaja.');
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);

  const record = stats?.debateActivity;
  const resolved = Number(record?.decisionsResolved);
  const winRate = Number(record?.winRate);
  const hitRate = useMemo(() => {
    if (!Number.isFinite(resolved) || resolved <= 0) return '—';
    if (resolved < WIN_RATE_MIN_SAMPLE) {
      const wins = Number(record?.wins);
      const losses = Number(record?.losses);
      return Number.isFinite(wins) && Number.isFinite(losses) ? `${wins}W / ${losses}L` : `n=${resolved}`;
    }
    return Number.isFinite(winRate) ? `${winRate.toFixed(1)}%` : '—';
  }, [record?.losses, record?.wins, resolved, winRate]);

  const companion = COMPANIONS[activeCompanion] ?? COMPANIONS[0];
  const starters = COMPANIONS.filter((c) => c.requiredLevel === 1);

  // One line of communication: every entry is a beat of the same argument —
  // asking is free, verifying is the edge, and this is what verifying looks like.
  const navItems: Array<[string, string]> = [
    [t('Why', 'Por qué'), '#verify'],
    [t('How a call is made', 'Cómo se decide'), '#how'],
    [t('The record', 'El historial'), '#record'],
    [t('Discipline', 'Disciplina'), '#aura'],
    ['Squad', '#squad'],
  ];

  const moments = [
    { step: '01', eyebrow: t('Ask out loud', 'Pregunta en voz alta'), title: t('Say the ticker. The desk wakes up.', 'Di el ticker. El desk despierta.'), image: '/app/shot-desk.webp', alt: t('The Live Desk with Byte ready for a spoken or typed market question', 'El Live Desk con Byte listo para una pregunta hablada o escrita'), accent: GREEN },
    { step: '02', eyebrow: t('The answer gets challenged', 'La respuesta se refuta'), title: t('Three agents argue. Risk can close the gate.', 'Tres agentes discuten. El riesgo puede cerrar la puerta.'), image: '/app/shot-notrade.webp', alt: t('A real NO TRADE verdict on BTC with the live chart', 'Un NO TRADE real en BTC con la gráfica en vivo'), accent: '#7ea6ff' },
    { step: '03', eyebrow: t('Your tone, same data', 'Tu tono, los mismos datos'), title: t('The tone changes. The data never does.', 'El tono cambia. Los datos nunca.'), image: '/app/shot-vibe.webp', alt: t('Choosing how Byte speaks: the tone changes, the data never does', 'Eligiendo cómo habla Byte: el tono cambia, los datos nunca'), accent: GOLD },
  ];


  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.18 } };

  return (
    <div className="min-h-screen overflow-x-clip [&_section[id]]:scroll-mt-24 [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-[#b7e89c] [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-[#b7e89c] bg-[#050706] font-sans text-white antialiased selection:bg-[#5cff91] selection:text-[#041009]">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={t('Everyone asks an AI about their assets now. Bobby is what comes after: three agents challenge the answer, a risk gate can veto it, and the verdict goes on the record before the market settles it.', 'Todo el mundo le pregunta a una IA por sus activos. Bobby es lo que viene después: tres agentes refutan la respuesta, una puerta de riesgo puede vetarla, y el veredicto queda registrado antes de que el mercado lo resuelva.')} />
        <link rel="canonical" href="https://bobbyprotocol.xyz/app" />
        <meta property="og:url" content="https://bobbyprotocol.xyz/app" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={t('Everyone can ask an AI now. Bobby is what happens to the answer next.', 'Cualquiera le puede preguntar a una IA. Bobby es lo que le pasa después a esa respuesta.')} />
        <meta property="og:image" content="https://bobbyprotocol.xyz/favicon-bobby-v3.png" />
      </Helmet>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050706]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-6 lg:flex" aria-label={t('Main navigation', 'Navegación principal')}>
            {navItems.map(([label, href]) => (
              <a key={href} href={href} className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/48 transition hover:text-white">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a href="/protocol" className="hidden min-h-11 items-center rounded-full border border-[#F5C542]/35 bg-[#F5C542]/[0.08] px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F5C542] transition hover:border-[#F5C542]/70 hover:bg-[#F5C542]/[0.16] sm:inline-flex">{t('Protocol', 'Protocolo')}</a>
            <LangToggle />
            <a href={TRY_IT_URL} className="hidden rounded-full bg-[#5cff91] px-5 py-2.5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white lg:inline-flex">{t('Open the desk', 'Abrir el desk')}</a>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] lg:hidden" aria-label={t('Toggle navigation', 'Abrir o cerrar navegación')} aria-expanded={menuOpen}>
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-white/10 bg-[#080a09] px-5 py-4 lg:hidden" aria-label={t('Mobile navigation', 'Navegación móvil')}>
            {navItems.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block border-b border-white/[0.06] py-4 font-mono text-xs uppercase tracking-[0.14em] text-white/70">{label}</a>
            ))}
            <a href="/protocol" onClick={() => setMenuOpen(false)} className="block border-b border-white/[0.06] py-4 font-mono text-xs uppercase tracking-[0.14em] text-[#F5C542]">Bobby Protocol</a>
            <a href={TRY_IT_URL} className="block py-4 font-mono text-xs uppercase tracking-[0.14em] text-[#5cff91]">{t('Open the desk', 'Abrir el desk')}</a>
          </nav>
        )}
      </header>

      <main>
        {/* HERO — the core message */}
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_38%,rgba(245,197,66,.14),transparent_34%),radial-gradient(circle_at_87%_25%,rgba(92,255,145,.18),transparent_40%),radial-gradient(circle_at_18%_70%,rgba(52,121,255,.14),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative mx-auto grid min-h-[calc(100svh-69px)] max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-20">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.55 }} className="relative z-10">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#5cff91]">{t('The verification layer', 'La capa de comprobación')}</div>
              <h1 className="max-w-3xl text-[clamp(2.5rem,6.2vw,5.6rem)] font-black leading-[0.92] tracking-[-0.07em]">
                {t('Asking an AI about your asset', 'Preguntarle a una IA por tu activo')}<br />
                <span className="bg-[linear-gradient(100deg,#F5C542_0%,#5cff91_55%,#76d6ff_100%)] bg-clip-text text-transparent">{t('is no longer an edge.', 'ya no es una ventaja.')}</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/58 sm:text-lg sm:leading-8">
                {t('Everyone has that answer now, from the same models, in the same confident voice. Bobby gives you what comes after it: three agents challenge the answer, and the verdict goes on the record before the market settles it.', 'Lo hace todo el mundo, con los mismos modelos y con la misma seguridad en la voz. Bobby te da lo que viene después: tres agentes refutan la respuesta y el veredicto queda registrado antes de que el mercado lo resuelva.')}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href={TRY_IT_URL} className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#5cff91] px-7 font-mono text-xs font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white">{t('Try the live desk', 'Prueba el live desk')} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-7 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.12]"><Apple className="h-4 w-4" aria-hidden="true" /> {t('Download the iOS app', 'Descarga la app iOS')}</a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] uppercase tracking-[0.12em] text-white/38">
                <span className="inline-flex items-center gap-2"><Mic className="h-3.5 w-3.5 text-[#5cff91]" /> {t('Talk to it about BTC, NVDA or gold', 'Háblale de BTC, NVDA u oro')}</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#8dc9ff]" /> {t('Three agents · one verdict', 'Tres agentes · un veredicto')}</span>
                <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#F5C542]" /> {t('On the record before the outcome', 'Registrado antes del resultado')}</span>
              </div>
            </motion.div>

            <div className="relative mx-auto flex w-full max-w-[440px] items-center justify-center lg:max-w-[500px]">
              <div className="absolute h-[72%] w-[72%] rounded-full bg-[#F5C542]/15 blur-[85px]" />
              <motion.div initial={reduceMotion ? false : { opacity: 0, y: 28, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 2 }} transition={{ duration: reduceMotion ? 0 : 0.7, delay: 0.1 }} className="relative z-10 w-[72%] max-w-[310px]">
                <PhoneFrame src="/app/shot-desk.webp" alt={t('Bobby Live Desk on iPhone: Byte wearing his gear with Bit the dog', 'Bobby Live Desk en iPhone: Byte con su equipo y Bit el perro')} priority />
              </motion.div>
              <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -8, 0] }} transition={{ opacity: { delay: 0.3 }, scale: { delay: 0.3 }, y: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }} className="absolute -left-1 top-[12%] z-20 h-24 w-24 -rotate-6 overflow-hidden rounded-3xl border border-[#F5C542]/40 shadow-2xl sm:h-28 sm:w-28" style={{ boxShadow: `0 18px 50px rgba(0,0,0,.5), 0 0 40px ${GOLD}33` }}>
                <img src="/favicon-bobby-v3.png" alt={t('Golden Byte — the max level', 'Byte dorado — el nivel máximo')} className="h-full w-full object-cover" />
              </motion.div>
              {starters.filter((c) => c.id !== 'byte').slice(0, 3).map((item, index) => (
                <motion.div key={item.id} initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -7, 0] }} transition={{ opacity: { delay: 0.4 + index * 0.1 }, scale: { delay: 0.4 + index * 0.1 }, y: { duration: 3.6 + index, repeat: Infinity, ease: 'easeInOut' } }} className={`absolute z-20 grid h-20 w-20 place-items-center rounded-3xl border border-white/15 bg-[#0a0d0b]/90 p-1 shadow-2xl backdrop-blur-xl sm:h-24 sm:w-24 ${index === 0 ? '-right-1 top-[30%] rotate-6' : index === 1 ? 'bottom-[10%] left-[2%] rotate-3' : '-right-2 bottom-[4%] -rotate-3'}`} style={{ boxShadow: `0 18px 50px rgba(0,0,0,.5), 0 0 30px ${tintFor(item, 0.12)}` }}>
                  <img src={`/mascots/${item.id}.webp`} alt={`${item.label}, ${pick(item.role)}`} className="h-full w-full rounded-[1.2rem] object-cover" />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <div className="overflow-hidden border-b border-white/10 bg-[#090c0a] py-3.5">
          <div className="flex min-w-max animate-marquee items-center gap-9 font-mono text-[10px] font-bold uppercase tracking-[0.17em] text-white/55 motion-reduce:animate-none">
            {[0, 1].map((duplicate) => (
              <div key={duplicate} className="flex shrink-0 items-center gap-9">
                {[t('Refuted before execution', 'Refutado antes de ejecutar'), t('Published before the outcome', 'Publicado antes del resultado'), t('Three agents, one verdict', 'Tres agentes, un veredicto'), t('Allowed to say there is no trade', 'Puede decir que no hay operación'), t('Same models, different procedure', 'Mismos modelos, distinto procedimiento'), t('Analysis, never advice', 'Análisis, nunca asesoría')].map((label) => (
                  <span key={`${duplicate}-${label}`} className="flex items-center gap-9"><span>{label}</span><span className="text-[#F5C542]">✦</span></span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 01 — THE TWO ERAS: the core message, drawn instead of tabled. */}
        <section id="verify" className="scroll-mt-20 border-b border-white/10 bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#F5C542]">01 / {t('The two eras', 'Las dos eras')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-5xl lg:text-6xl">{t('The first era was asking.', 'La primera era fue preguntar.')}<br /><span className="text-white/38">{t('The second is verifying.', 'La segunda es comprobar.')}</span></h2>
              <p className="mt-6 max-w-md text-lg leading-8 text-white/60">{t('Analysis stopped being scarce. Knowing whether the answer was any good did not.', 'El análisis dejó de ser escaso. Saber si la respuesta era buena, no.')}</p>
            </motion.div>
            <motion.div {...reveal}><TwoErasArt /></motion.div>
          </div>
        </section>

        {/* 02 — HOW A CALL IS MADE: the procedure, made visible. Three screens, one line each. */}
        <section id="how" className="scroll-mt-20 bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal} className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">02 / {t('How a call is made', 'Cómo se decide')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-5xl lg:text-7xl">{t('Ask the same question.', 'Haz la misma pregunta.')}<br /><span className="text-white/38">{t('Get an answer that was tested.', 'Recibe una respuesta que ya fue probada.')}</span></h2>
            </motion.div>
            <div className="grid gap-5 lg:grid-cols-3">
              {moments.map((moment, index) => (
                <motion.article key={moment.step} {...reveal} transition={{ delay: reduceMotion ? 0 : index * 0.07 }} className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d100e]">
                  <div className="relative h-[420px] overflow-hidden border-b border-white/10 sm:h-[480px] lg:h-[430px]">
                    <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 50% 50%, ${moment.accent}45, transparent 55%)` }} />
                    <img src={moment.image} alt={moment.alt} loading="lazy" className="relative mx-auto w-[64%] rounded-[1.4rem] border border-white/10 transition duration-500 group-hover:scale-[1.025]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0d100e] to-transparent" />
                  </div>
                  <div className="p-6 sm:p-7">
                    <div className="mb-4 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-[0.18em]"><span style={{ color: moment.accent }}>{moment.step} / {moment.eyebrow}</span><span className="h-px w-12 bg-white/15" /></div>
                    <h3 className="text-2xl font-bold leading-[1.02] tracking-[-0.045em]">{moment.title}</h3>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* 03 — MEMORY: why the answer you already get cannot be trusted twice, and the live numbers that show what remembering looks like. */}
        <section id="record" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_22%,rgba(92,255,145,.11),transparent_42%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">03 / {t('Memory', 'Memoria')}</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('You asked ChatGPT about NVIDIA.', 'Le preguntaste a ChatGPT por NVIDIA.')}<br /><span className="text-white/38">{t('It said buy. In another chat, sell.', 'Te dijo compra. En otro chat, vende.')}</span></h2>
                <p className="mt-7 max-w-lg text-xl leading-8 text-white sm:text-2xl">{t('That is not a reasoning problem. It is a memory problem.', 'No es un problema de razonamiento. Es de memoria.')}</p>
                <p className="mt-4 max-w-lg text-base leading-7 text-white/50">{t('Bobby writes every verdict down before the outcome and forgets none of them. Not even the misses.', 'Bobby registra cada veredicto antes del resultado y no olvida ninguno. Ni los fallos.')}</p>
                <a href="/protocol" className="group mt-8 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/55 transition hover:text-white">{t('Inspect the full track record', 'Revisa el historial completo')} <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></a>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/40"><span>{t('Public record', 'Registro público')}</span><span className="inline-flex items-center gap-2 text-[#5cff91]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5cff91]" />{t('Live', 'En vivo')}</span></div>
                <div className="grid grid-cols-2 gap-3">
                  {[[t('Recorded', 'Registradas'), formatNumber(record?.commitmentsCreated), 'rgba(255,255,255,0.35)'], [t('Resolved', 'Resueltas'), formatNumber(record?.decisionsResolved), 'rgba(255,255,255,0.35)'], [t('Wrong', 'Fallidas'), formatNumber(record?.losses), '#ff8f83'], [t('Record', 'Récord'), hitRate, GREEN]].map(([label, value, tone]) => (
                    <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.17em]" style={{ color: tone }}>{label}</div>
                      <div className="mt-4 font-mono text-4xl font-black tracking-[-0.05em] sm:text-5xl">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 04 — DISCIPLINE: one idea, the one the island already shows — you build your world with discipline, one step at a time. */}
        <section id="aura" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(245,197,66,.12),transparent_40%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#F5C542]">04 / {t('Discipline', 'Disciplina')}</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Build your world with discipline.', 'Construye tu mundo con disciplina.')}<br /><span className="text-white/38">{t('One step at a time.', 'Un paso a la vez.')}</span></h2>
                <p className="mt-7 max-w-lg text-lg leading-8 text-white/70">{t('Every full read and every NO TRADE you accept raises a piece of your island. Trading more raises nothing.', 'Cada lectura completa y cada NO TRADE que aceptas levanta una pieza de tu isla. Operar más no levanta nada.')}</p>
                <a href={TRADER_LAND_URL} className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#F5C542]/35 bg-[#F5C542]/10 px-5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#F5C542] transition hover:bg-[#F5C542]/20"><MapIcon size={15} />{t('Try the island', 'Prueba la isla')}<ArrowRight size={15} /></a>
              </div>
              <TraderLandPreview />
            </motion.div>
          </div>
        </section>

        {/* 05 — SQUAD: the friend. Big characters, one line, no tone matrix. */}
        <section id="squad" className="relative overflow-hidden border-y border-white/10 bg-[#050706]">
          <img src="/app/lifestyle-squad.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center opacity-20" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#050706_0%,rgba(5,7,6,.86)_40%,rgba(5,7,6,.94)_100%)]" />
          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <motion.div {...reveal} className="max-w-3xl">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#b488ff]">05 / {t('Your squad', 'Tu squad')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl lg:text-7xl">{t('You are not alone', 'No estás solo')}<br /><span className="text-white/38">{t('in the market.', 'en el mercado.')}</span></h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/60">{t('A fun friend who actually knows markets. Pick yours.', 'Un amigo divertido que sí sabe de mercados. Elige el tuyo.')}</p>
            </motion.div>
            <div className="mt-12 grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-center">
              <motion.div {...reveal} className="relative mx-auto w-full max-w-[420px]">
                <div className="pointer-events-none absolute inset-6 rounded-full blur-[90px]" style={{ background: tintFor(companion, 0.35) }} />
                <div className="relative aspect-square overflow-hidden rounded-[2.5rem] border border-white/15 bg-black/40 shadow-[0_40px_120px_rgba(0,0,0,.6)]">
                  <img key={companion.id} src={`/mascots/${companion.id}.webp`} alt={`${companion.label}, ${pick(companion.role)}`} className="h-full w-full object-cover" style={{ filter: companion.requiredLevel > 1 ? 'grayscale(1) brightness(0.8)' : 'none' }} />
                  <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"><span style={{ color: tintFor(companion) }}>{companion.label} · {pick(companion.role)}</span>{companion.requiredLevel > 1 && <span className="inline-flex shrink-0 items-center gap-1 text-white/45"><Lock className="h-3 w-3" />{t(`Level ${companion.requiredLevel}`, `Nivel ${companion.requiredLevel}`)}</span>}</div>
                    <p className="mt-1.5 text-base font-medium text-white">“{pick(companion.selectLine)}”</p>
                  </div>
                </div>
              </motion.div>
              <motion.div {...reveal} className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {COMPANIONS.map((item, index) => {
                  const active = index === activeCompanion;
                  const locked = item.requiredLevel > 1;
                  return (
                    <button key={item.id} type="button" onClick={() => setActiveCompanion(index)} aria-pressed={active} aria-label={`${item.label}, ${pick(item.role)}`} className={`group relative overflow-hidden rounded-3xl border text-left transition ${active ? 'border-white/40 bg-white/[0.1]' : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.06]'}`} style={active ? { boxShadow: `0 0 0 1px ${tintFor(item, 0.6)}, 0 0 36px ${tintFor(item, 0.35)}` } : undefined}>
                      <div className="relative aspect-square">
                        <img src={`/mascots/${item.id}.webp`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" style={{ filter: locked ? 'grayscale(1) brightness(0.7)' : 'none' }} />
                        {locked && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/80 text-white/90"><Lock className="h-3 w-3" /></span>}
                      </div>
                      <div className="px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.04em]">{item.label}</div>
                    </button>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </section>

        {/* CLOSING — one CTA, on the same message as the hero */}
        <section id="download" className="relative overflow-hidden border-t border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(245,197,66,.16),transparent_50%),radial-gradient(circle_at_82%_24%,rgba(92,255,145,.12),transparent_38%)]" />
          <motion.div {...reveal} className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.045] p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-10 lg:p-14">
            <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Stop asking.', 'Deja de preguntar.')}<br /><span className="text-[#F5C542]">{t('Start checking.', 'Empieza a comprobar.')}</span></h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-white/52 sm:text-base sm:leading-7">{t('Bobby is on the App Store for iPhone. The Live Desk is also open on the web.', 'Bobby ya está en el App Store para iPhone. El Live Desk también está abierto en la web.')}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <AppStoreBadge />
              <a href={TRY_IT_URL} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-7 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.12]">{t('Open the desk on the web', 'Abre el desk en la web')} <ArrowRight className="h-4 w-4" /></a>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#050706]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <BrandMark />
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-white/55">
            <a href="/privacy" className="transition hover:text-white">{t('Privacy', 'Privacidad')}</a>
            <a href="/protocol" className="transition hover:text-white">Bobby Protocol</a>
            <a href="/record" className="transition hover:text-white">{t('Track record', 'Historial')}</a>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-white/55"><Flame className="h-3 w-3 text-[#F5C542]" /><PawPrint className="h-3 w-3 text-[#5cff91]" /> © 2026 Bobby · {t('Refuted before execution', 'Refutado antes de ejecutar')}</span>
        </div>
      </footer>
    </div>
  );
}
