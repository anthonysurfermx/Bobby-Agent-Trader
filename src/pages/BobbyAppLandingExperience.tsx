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
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'framer-motion';
import { Apple, ArrowRight, Check, ChevronRight, Flame, Loader2, Lock, Map as MapIcon, Menu, Mic, PawPrint, ShieldCheck, Sparkles, Trophy, Volume2, X, Zap, UserRound, Smartphone, ArrowLeftRight } from 'lucide-react';
import { COMPANIONS, LEVELS, PET_UNLOCK_XP, VIBES, petArt, petFor, tintFor, toolArt, toolHasArt, toolUnlockXP, toolsFor } from '@/lib/companions/data';
import { isSpanish, pick, t } from '@/lib/companions/i18n';
import TraderLandPreview, { TRADER_LAND_URL } from '@/components/companion/TraderLandPreview';

interface DebateActivity { commitmentsCreated?: number; decisionsResolved?: number; wins?: number; losses?: number; breakEven?: number; pending?: number; winRate?: number }
interface ProtocolStats { debateActivity?: DebateActivity }
type SignupState = 'idle' | 'loading' | 'success' | 'error';

const TRY_IT_URL = '/desk';
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

function ComingSoonBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] text-left shadow-[inset_0_1px_rgba(255,255,255,.08)] ${compact ? 'px-4 py-2.5' : 'px-5 py-3.5'}`} role="img" aria-label={t('Coming soon on the App Store', 'Próximamente en el App Store')}>
      <Apple className={compact ? 'h-6 w-6' : 'h-8 w-8'} strokeWidth={1.7} aria-hidden="true" />
      <span className="leading-none">
        <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/45">{t('Coming soon on the', 'Muy pronto en el')}</span>
        <span className={`${compact ? 'text-sm' : 'text-lg'} mt-1 block font-semibold tracking-[-0.03em]`}>App Store</span>
      </span>
    </div>
  );
}

function PhoneFrame({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/20 bg-[#090b10] p-1.5 shadow-[0_32px_90px_rgba(0,0,0,.72),0_0_55px_rgba(85,122,255,.12)]">
      {/* The screenshot is the shipped iOS screen, including its status bar and Dynamic Island. */}
      <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className="block h-auto w-full rounded-[1.6rem]" />
    </div>
  );
}

export default function BobbyAppLandingExperience() {
  const stats = useProtocolStats();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCompanion, setActiveCompanion] = useState(1);
  const [email, setEmail] = useState('');
  const [signupState, setSignupState] = useState<SignupState>('idle');
  const [signupMessage, setSignupMessage] = useState('');

  const pageTitle = t('Bobby — The market has a take. Bobby has three.', 'Bobby — El mercado tiene su versión. Bobby tiene tres.');
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
  const maxLevel = LEVELS[LEVELS.length - 1];
  const showcaseTools = toolsFor('byte');
  const showcasePet = petFor('byte');

  // One line of communication: every entry is a beat of the same argument —
  // asking is free, verifying is the edge, and this is what verifying looks like.
  const navItems: Array<[string, string]> = [
    [t('The Bobby difference', 'Lo que hace distinto a Bobby'), '#verify'],
    [t('How it works', 'Cómo funciona'), '#how'],
    [t('The record', 'El historial'), '#record'],
    [t('Trader Land', 'Trader Land'), '#aura'],
    [t('Meet the squad', 'Conoce al squad'), '#squad'],
  ];

  const moments = [
    { step: '01', eyebrow: t('Ask out loud', 'Pregunta en voz alta'), title: t('Say the ticker. The desk wakes up.', 'Di el ticker. El desk despierta.'), text: t('BTC, NVDA, gold and 600+ more, by voice or text. The question is the same one you already ask an AI. What happens to the answer is what changes.', 'BTC, NVDA, oro y más de 600 activos, por voz o texto. La pregunta es la misma que ya le haces a una IA. Lo que cambia es lo que pasa con la respuesta.'), image: '/app/shot-desk.webp', alt: t('The Live Desk with Byte ready for a spoken or typed market question', 'El Live Desk con Byte listo para una pregunta hablada o escrita'), accent: GREEN },
    { step: '02', eyebrow: t('The answer gets challenged', 'La respuesta se refuta'), title: t('Three agents argue. Risk can close the gate.', 'Tres agentes discuten. El riesgo puede cerrar la puerta.'), text: t('Alpha Hunter makes the case, Red Team tries to break it, the CIO decides. When nothing survives, the verdict is NO TRADE — the answer a model that always answers will never give you.', 'Alpha Hunter sustenta la idea, Red Team intenta romperla, el CIO decide. Si nada sobrevive, el veredicto es NO TRADE: la respuesta que un modelo que siempre responde nunca te va a dar.'), image: '/app/shot-notrade.webp', alt: t('A real NO TRADE verdict on BTC with the live chart', 'Un NO TRADE real en BTC con la gráfica en vivo'), accent: '#7ea6ff' },
    { step: '03', eyebrow: t('Your tone, same data', 'Tu tono, los mismos datos'), title: t('The tone changes. The data never does.', 'El tono cambia. Los datos nunca.'), text: t('Chill, direct or trading-desk technical — you choose how the verdict is delivered. What gets said is decided by the procedure, not by the voice saying it.', 'Relajado, directo o técnico de mesa de trading: tú eliges cómo se te entrega el veredicto. Lo que se dice lo decide el procedimiento, no la voz que lo dice.'), image: '/app/shot-vibe.webp', alt: t('Choosing how Byte speaks: the tone changes, the data never does', 'Eligiendo cómo habla Byte: el tono cambia, los datos nunca'), accent: GOLD },
  ];

  const auraRules = [
    { icon: Check, title: t('Counts', 'Cuenta'), lines: [t('Reading the full analysis', 'Leer el análisis completo'), t('Accepting a NO TRADE', 'Aceptar un NO TRADE'), t('Coming back tomorrow (streak)', 'Volver mañana (racha)')] , tone: GREEN },
    { icon: X, title: t('Never counts', 'Nunca cuenta'), lines: [t('How much you trade', 'Cuánto operas'), t('How often you trade', 'Qué tan seguido operas'), t('Your P&L', 'Tu P&L')], tone: '#ff8f83' },
    { icon: Lock, title: t('Capped', 'Con tope'), lines: [t('3 awards a day, for everyone', '3 premios al día, para todos'), t('One grace day on the streak', 'Un día de gracia en la racha'), t('No pay-to-win, ever', 'Sin pay-to-win, nunca')], tone: '#8dc9ff' },
  ];

  const boundaries = [
    { icon: ShieldCheck, title: t('No custody', 'Sin custodia'), text: t('Bobby never holds funds or asks for exchange credentials.', 'Bobby nunca guarda fondos ni pide credenciales de un exchange.') },
    { icon: Zap, title: t('You sign', 'Tú firmas'), text: t('Where enabled, Base swaps require your external wallet and your confirmation. Availability is restricted; Bobby never signs for you.', 'Donde estén habilitados, los swaps en Base requieren tu wallet externa y tu confirmación. La disponibilidad está restringida; Bobby nunca firma por ti.') },
    { icon: Volume2, title: t('No fake certainty', 'Sin certezas falsas'), text: t('A favorable verdict is analysis, not a promise or advice.', 'Un veredicto favorable es análisis, no una promesa ni asesoría.') },
    { icon: Trophy, title: t('No pay-to-win', 'Sin pay-to-win'), text: t('Aura comes from better process, never from spending more.', 'El aura viene de un mejor proceso, nunca de gastar más.') },
  ];

  const submitEarlyAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setSignupState('error');
      setSignupMessage(t('Enter a valid email so we know where to find you.', 'Escribe un correo válido para saber dónde encontrarte.'));
      return;
    }
    setSignupState('loading');
    setSignupMessage('');
    const website = new FormData(form).get('website');
    try {
      const response = await fetch('/api/bobby-early-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, website, language: isSpanish() ? 'es' : 'en', page: '/app', referrer: document.referrer ? document.referrer.slice(0, 300) : undefined }) });
      if (!response.ok) throw new Error('Signup failed');
      setSignupState('success');
      setSignupMessage(t("You're on the list. We only email when Bobby is ready for you.", 'Estás en la lista. Solo escribimos cuando Bobby esté listo para ti.'));
      setEmail('');
    } catch {
      setSignupState('error');
      setSignupMessage(t("We couldn't save your spot right now. Try again in a moment.", 'No pudimos guardar tu lugar ahora. Intenta en un momento.'));
    }
  };

  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.18 } };

  return (
    <div className="min-h-screen overflow-x-clip [&_section[id]]:scroll-mt-24 [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-[#b7e89c] [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-[#b7e89c] bg-[#050706] font-sans text-white antialiased selection:bg-[#5cff91] selection:text-[#041009]">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={t('Pick the Bobby companion that feels like you. Behind every voice, three market agents challenge the idea, a risk gate can say wait, and every call goes on the record.', 'Elige al companion de Bobby que va contigo. Detrás de cada voz, tres agentes de mercado cuestionan la idea, el risk gate puede decir espera y cada decisión queda registrada.')} />
        <link rel="canonical" href="https://bobbyprotocol.xyz/app" />
        <meta property="og:url" content="https://bobbyprotocol.xyz/app" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={t('Three perspectives. One Bobby. A real debate before the market call.', 'Tres perspectivas. Un Bobby. Un debate real antes de la lectura del mercado.')} />
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
        {/* HERO — the approved Three Voices artwork, with the real iOS capture overlaid. */}
        <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#090a0d]">
          <h1 className="sr-only">{t('The market has a take. Bobby has three.', 'El mercado tiene su versión. Bobby tiene tres.')}</h1>
          <div className="mx-auto max-w-[1672px]">
            <div className="relative hidden aspect-[1672/941] w-full overflow-hidden sm:block">
              <img src="/app/three-voices-hero-base.png" alt={t('Bobby’s three companion characters — Byte, Kora, and Zip — around the real Bobby iPhone app.', 'Los tres companions de Bobby —Byte, Kora y Zip— junto a la app real de Bobby para iPhone.')} className="absolute inset-0 h-full w-full object-contain" fetchPriority="high" />
              <div className="absolute overflow-hidden bg-[#05070b]" style={{ left: '56.34%', top: '38.68%', width: '14.84%', height: '51.75%', borderRadius: '2.25% / 2.3%' }}>
                <img src="/app/shot-desk.webp" alt={t('Exact Live Desk screenshot from the Bobby iOS app.', 'Captura exacta del Live Desk de la app iOS de Bobby.')} className="h-full w-full object-contain" fetchPriority="high" />
              </div>
            </div>

            <div className="px-4 pb-8 pt-12 sm:hidden">
              <div className="text-center">
                <div className="mx-auto mb-4 flex w-fit items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[.22em] text-white/60"><img src="/favicon-bobby-v3.png" alt="" className="h-5 w-5 rounded" /> BOBBY</div>
                <p className="text-[clamp(2.25rem,11vw,3.6rem)] font-black leading-[.9] tracking-[-.07em]">{t('The market has a take.', 'El mercado tiene su versión.')}<br /><span className="text-white/45">{t('Bobby has three.', 'Bobby tiene tres.')}</span></p>
                <p className="mt-4 text-sm leading-6 text-white/60">{t('Hear the case. Hear the pushback. Make your call.', 'Escucha la idea. Escucha lo que la cuestiona. Decide tú.')}</p>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-2">
                {[
                  { id: 'byte', name: 'BYTE', color: '#38d875' },
                  { id: 'kora', name: 'KORA', color: '#2084ff' },
                  { id: 'zip', name: 'ZIP', color: '#ff6045' },
                ].map((voice) => (
                  <div key={voice.id} className="relative flex min-h-[155px] items-end justify-center overflow-hidden rounded-2xl border border-white/10 p-2" style={{ background: 'linear-gradient(160deg, ' + voice.color + ' 0%, ' + voice.color + 'aa 55%, #101116 100%)' }}>
                    <img src={'/mascots/' + voice.id + '.webp'} alt={voice.name} className="h-[145px] max-w-full object-contain object-bottom" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/40 px-2 py-1 font-mono text-[8px] font-bold tracking-[.12em] text-white">{voice.name}</span>
                  </div>
                ))}
              </div>
              <div className="mx-auto mt-6 w-[48%] max-w-[220px]">
                <PhoneFrame src="/app/shot-desk.webp" alt={t('Real Bobby iOS Live Desk screen', 'Pantalla real del Live Desk de Bobby para iOS')} priority />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-[#0b0d11] px-4 py-4 sm:py-5">
            <a href={TRY_IT_URL} className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#baff42] px-6 font-mono text-[9px] font-black uppercase tracking-[.16em] text-[#10150b] transition hover:bg-white">{t('Meet Bobby', 'Conoce a Bobby')}<ArrowRight size={15} className="transition group-hover:translate-x-1" /></a>
            <a href="#how" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 font-mono text-[9px] font-bold uppercase tracking-[.16em] text-white/70 transition hover:border-white/35 hover:text-white">{t('See how it works', 'Así funciona')}</a>
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

        {/* 01 — the Bobby difference: a bright editorial pause after the dark hero. */}
        <section id="verify" className="scroll-mt-20 overflow-hidden bg-[#e8f4d1] px-4 py-20 text-[#111610] sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <motion.div {...reveal}>
              <div className="mb-5 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#285b34]">01 / {t('The Bobby difference', 'Lo que hace distinto a Bobby')}</div>
              <h2 className="text-4xl font-black leading-[0.93] tracking-[-0.07em] sm:text-5xl lg:text-6xl">{t('Anyone can get an AI take.', 'Cualquiera puede pedirle una opinión a la IA.')}<br /><span className="text-[#547057]">{t('Bobby makes it earn your trust.', 'Bobby hace que se la gane.')}</span></h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#27342a]/75">{t('A confident answer is easy. Bobby puts the idea in front of three market agents, lets them challenge each other, then records what they decided before the market moves.', 'Una respuesta segura es fácil. Bobby pone la idea frente a tres agentes de mercado, deja que la cuestionen y registra qué decidieron antes de que se mueva el mercado.')}</p>
              <a href="#record" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#101710] px-5 font-mono text-[9px] font-bold uppercase tracking-[.14em] text-[#c8ff70] transition hover:bg-[#25452d]">{t('See every call, wins and misses', 'Mira cada decisión, aciertos y fallos')}<ArrowRight size={15} /></a>
            </motion.div>
            <motion.div {...reveal} className="relative overflow-hidden rounded-[2rem] bg-[#101710] p-5 text-white shadow-[0_30px_80px_rgba(25,55,33,.2)] sm:p-8">
              <div className="absolute -right-14 -top-14 h-48 w-48 rounded-full bg-[#baff42]/15 blur-3xl" />
              <div className="relative mb-6 flex items-center justify-between border-b border-white/10 pb-4 font-mono text-[9px] font-bold uppercase tracking-[.18em]"><span className="text-white/55">{t('Inside every Bobby call', 'Dentro de cada decisión de Bobby')}</span><span className="text-[#baff42]">01 → 02 → 03</span></div>
              <div className="relative grid gap-3 sm:grid-cols-3">
                {[
                  { n: '01', title: t('Make the case', 'Presenta la idea'), who: 'ALPHA HUNTER', color: '#baff42', text: t('What could go right?', '¿Qué podría salir bien?') },
                  { n: '02', title: t('Push back', 'Busca el otro lado'), who: 'RED TEAM', color: '#70a5ff', text: t('What are we missing?', '¿Qué se nos puede estar escapando?') },
                  { n: '03', title: t('Call it', 'Toma una decisión'), who: 'THE CIO', color: '#ff826b', text: t('Is the idea worth the risk?', '¿La idea compensa el riesgo?') },
                ].map((step) => (
                  <div key={step.n} className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
                    <div className="font-mono text-[8px] font-bold tracking-[.15em]" style={{ color: step.color }}>{step.n} / {step.who}</div>
                    <h3 className="mt-5 text-lg font-black tracking-[-.04em] sm:text-xl">{step.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-white/55">{step.text}</p>
                  </div>
                ))}
              </div>
              <div className="relative mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#70a5ff]/20 bg-[#70a5ff]/[0.08] px-4 py-4">
                <div><div className="font-mono text-[8px] font-bold uppercase tracking-[.16em] text-[#9dc0ff]">{t('Then the risk gate weighs in', 'Después entra el risk gate')}</div><div className="mt-1 text-sm font-semibold">{t('Sometimes the answer is “wait.”', 'A veces la respuesta es «espera».')}</div></div>
                <img src="/mascots/halo.webp" alt="Halo, Bobby risk guardian" className="h-14 w-14 object-contain" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* 02 — HOW A CALL IS MADE: the procedure, made visible. */}
        <section id="how" className="scroll-mt-20 bg-[#090b13] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal} className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">02 / {t('The real app', 'La app real')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-5xl lg:text-7xl">{t('You bring the question.', 'Tú traes la pregunta.')}<br /><span className="text-white/38">{t('Bobby does the homework.', 'Bobby hace la tarea.')}</span></h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/48">{t('Not a chat box. A desk where three agents disagree in front of you, a risk gate that can veto them, and a verdict with the price that invalidates it.', 'No es un chat. Es un desk donde tres agentes discrepan frente a ti, una puerta de riesgo que puede vetarlos, y un veredicto con el precio que lo invalida.')}</p>
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
                    <div className="mb-5 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-[0.18em]"><span style={{ color: moment.accent }}>{moment.step} / {moment.eyebrow}</span><span className="h-px w-12 bg-white/15" /></div>
                    <h3 className="text-2xl font-bold leading-[1.02] tracking-[-0.045em]">{moment.title}</h3>
                    <p className="mt-4 text-sm leading-6 text-white/48">{moment.text}</p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* THE PUBLIC RECORD — live numbers */}
        <section id="record" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_22%,rgba(92,255,145,.11),transparent_42%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">03 / {t('The public record', 'El historial público')}</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Bobby remembers', 'Bobby recuerda')}<br /><span className="text-white/38">{t('the misses too.', 'también los fallos.')}</span></h2>
                <p className="mt-6 max-w-lg text-base leading-7 text-white/50">{t('Every call is recorded before the outcome in a public resolution ledger; the on-chain layer on Base is just getting started. Confirmed swaps use a chain-ordered receipt ledger; wins, losses and flat results stay visible, so confidence has consequences.', 'Cada llamada queda registrada antes del resultado en un ledger público de resolución; la capa on-chain en Base apenas empieza. Los swaps confirmados usan un ledger ordenado por cadena; aciertos, fallos y empates siguen visibles, para que la confianza tenga consecuencias.')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[[t('Recorded', 'Registradas'), formatNumber(record?.commitmentsCreated)], [t('Resolved', 'Resueltas'), formatNumber(record?.decisionsResolved)], [t('Wrong', 'Fallidas'), formatNumber(record?.losses)], [t('Record', 'Récord'), hitRate]].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.17em] text-white/35">{label}</div>
                    <div className="mt-3 font-mono text-2xl font-black tracking-[-0.05em] sm:text-3xl">{value}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <a href="/protocol" className="group mt-9 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/55 transition hover:text-white">{t('Inspect the full track record', 'Revisa el historial completo')} <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></a>
          </div>
        </section>

        <section id="aura" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(245,197,66,.12),transparent_40%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#F5C542]">04 / {t('Discipline', 'Disciplina')}</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('A verdict only helps', 'Un veredicto solo sirve')}<br /><span className="text-white/38">{t('if you respect it.', 'si lo respetas.')}</span></h2>
                <p className="mt-6 max-w-lg text-base leading-7 text-white/52">{t('So that is the only thing Bobby rewards. Reading the full analysis, accepting a NO TRADE and coming back tomorrow earn aura. Trading volume, frequency and P&L earn nothing. The reward is tied to the procedure, not to activity.', 'Así que eso es lo único que Bobby premia. Leer el análisis completo, aceptar un NO TRADE y volver mañana dan aura. El volumen, la frecuencia y el P&L no dan nada. El premio está atado al procedimiento, no a la actividad.')}</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {auraRules.map(({ icon: Icon, title, lines, tone }) => (
                    <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: tone }}><Icon className="h-3.5 w-3.5" />{title}</div>
                      <ul className="mt-3 space-y-1.5 text-xs leading-5 text-white/60">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[1.75rem] border border-white/10 bg-[#0d100e] p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-[0.18em]"><span className="text-[#5cff91]">{t('Levels', 'Niveles')}</span><span className="text-white/35">{t('discipline XP', 'XP de disciplina')}</span></div>
                  <ol className="space-y-2">
                    {LEVELS.map((level) => {
                      const golden = level.number === maxLevel.number;
                      return (
                        <li key={level.number} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: golden ? `${GOLD}66` : 'rgba(255,255,255,0.06)', background: golden ? `${GOLD}12` : 'rgba(255,255,255,0.02)' }}>
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-black" style={{ background: golden ? GOLD : 'rgba(255,255,255,0.08)', color: golden ? '#000' : '#fff' }}>{level.number}</span>
                          <span className="flex-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: golden ? GOLD : 'rgba(255,255,255,0.85)' }}>{level.name}</span>
                          <span className="font-mono text-[10px] text-white/45">{level.minXP} XP</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="rounded-[1.75rem] border border-white/10 bg-[#0d100e] p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-[0.18em]"><span className="text-[#F5C542]">{t('What aura unlocks', 'Qué desbloquea el aura')}</span><span className="text-white/35">BYTE</span></div>
                  <div className="grid grid-cols-4 gap-2">
                    {showcaseTools.map((tool) => (
                      <div key={tool.tier} className="rounded-2xl border border-white/10 bg-black/40 p-2 text-center" style={tool.tier === 3 ? { borderColor: `${GOLD}66`, boxShadow: `0 0 18px ${GOLD}33` } : undefined}>
                        {toolHasArt(tool) ? <img src={toolArt(tool)} alt={pick(tool.name)} className="mx-auto h-14 w-14 object-contain" /> : <div className="mx-auto grid h-14 w-14 place-items-center text-2xl">{tool.glyph}</div>}
                        <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-white/70">{pick(tool.name)}</div>
                        <div className="font-mono text-[8px] text-white/40">{toolUnlockXP(tool.tier)} XP</div>
                      </div>
                    ))}
                    {showcasePet && (
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-2 text-center">
                        {petArt('byte') ? <img src={petArt('byte')!} alt={pick(showcasePet.name)} className="mx-auto h-14 w-14 object-contain" /> : <div className="mx-auto grid h-14 w-14 place-items-center text-2xl">{showcasePet.emoji}</div>}
                        <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-white/70">{pick(showcasePet.name)}</div>
                        <div className="font-mono text-[8px] text-white/40">{PET_UNLOCK_XP} XP</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: `${GOLD}55`, background: `${GOLD}0d` }}>
                    <img src="/favicon-bobby-v3.png" alt="" className="h-12 w-12 rounded-xl object-cover" />
                    <div>
                      <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: GOLD }}>{maxLevel.name} · {maxLevel.minXP} XP</div>
                      <div className="mt-1 text-xs text-white/60">{t('The golden skin. The level everyone is farming for.', 'La skin dorada. El nivel por el que todos farmean.')}</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Trader Land lives here, as where aura ends up — never as a second headline. */}
            <motion.div {...reveal} className="mt-5 grid gap-5 rounded-[1.75rem] border border-[#b4deb5]/20 bg-[#101b15] p-5 sm:p-7 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cde9b4]/25 bg-[#cde9b4]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#d1edb8]"><MapIcon size={14} />{t('Where the aura goes', 'A dónde va el aura')}</div>
                <h3 className="text-3xl font-black leading-[.98] tracking-[-.05em] text-[#edf3e5] sm:text-4xl">{t('Trader Land', 'Trader Land')}</h3>
                <p className="mt-4 max-w-lg text-sm leading-6 text-[#c3d0bd]">{t('Gear and pieces earned through discipline get a place to stand: a floating island you arrange piece by piece. It is the scoreboard for the process, not a reason to trade more.', 'El equipo y las piezas que ganas con disciplina tienen dónde vivir: una isla flotante que acomodas pieza por pieza. Es el marcador del proceso, no un motivo para operar más.')}</p>
                <a href={TRADER_LAND_URL} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#cde9b4]/30 bg-[#cde9b4]/10 px-5 text-sm font-semibold text-[#d1edb8] transition hover:bg-[#cde9b4]/20">{t('Try the practice island', 'Prueba la isla de práctica')}<ArrowRight size={16} /></a>
                <p className="mt-3 max-w-lg text-xs leading-5 text-[#a2b29c]">{t('No account needed to practice. Practice pieces stay separate from earned inventory.', 'Practica sin cuenta. Las piezas de prueba están separadas de tu inventario ganado.')}</p>
              </div>
              <TraderLandPreview />
            </motion.div>
          </div>
        </section>

        {/* SQUAD — every companion, locked ones included */}
        <section id="squad" className="relative overflow-hidden border-y border-white/10 bg-[#050706]">
          <img src="/app/lifestyle-squad.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center opacity-20" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#050706_0%,rgba(5,7,6,.9)_48%,rgba(5,7,6,.78)_100%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:py-28">
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#b488ff]">05 / {t('Your squad', 'Tu squad')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Pick the voice.', 'Elige la voz.')}<br /><span className="text-white/38">{t('Not the verdict.', 'No el veredicto.')}</span></h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/52">{t(`${COMPANIONS.length} companions, one set of risk rules. ${starters.length} are yours from day one and the rest unlock with levels — but every one of them reads the same data and is bound by the same gate. You choose who tells you, never what gets decided.`, `${COMPANIONS.length} companions, un solo reglamento de riesgo. ${starters.length} son tuyos desde el día uno y el resto se desbloquea con niveles, pero todos leen los mismos datos y obedecen la misma puerta. Eliges quién te lo dice, nunca lo que se decide.`)}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {VIBES.map((vibe) => (
                  <div key={vibe.id} className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
                    <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white">{pick(vibe.label)}</div>
                    <div className="mt-2 text-xs leading-5 text-white/55">{pick(vibe.desc)}</div>
                    <div className="mt-3 text-xs italic text-white/70">“{pick(vibe.sample)}”</div>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <img src={`/mascots/${companion.id}.webp`} alt="" className="h-16 w-16 rounded-2xl border border-white/10 bg-black/40 object-cover" style={{ filter: companion.requiredLevel > 1 ? 'grayscale(1)' : 'none' }} />
                  <div>
                    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: tintFor(companion) }}>{companion.label} · {pick(companion.role)}</div>
                    <p className="mt-2 text-sm text-white/70">“{pick(companion.selectLine)}”</p>
                    <p className="mt-1 text-xs text-white/45">{companion.requiredLevel > 1 ? t(`Unlocks at level ${companion.requiredLevel}`, `Se desbloquea en nivel ${companion.requiredLevel}`) : t('Available from day one', 'Disponible desde el día uno')}</p>
                  </div>
                </div>
              </div>
            </motion.div>
            <motion.div {...reveal} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {COMPANIONS.map((item, index) => {
                const active = index === activeCompanion;
                const locked = item.requiredLevel > 1;
                return (
                  <button key={item.id} type="button" onClick={() => setActiveCompanion(index)} aria-pressed={active} className={`group relative overflow-hidden rounded-3xl border p-3 text-left transition ${active ? 'border-white/35 bg-white/[0.1]' : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.06]'}`} style={active ? { boxShadow: `0 20px 60px rgba(0,0,0,.35), 0 0 36px ${tintFor(item, 0.15)}` } : undefined}>
                    <div className="relative">
                      <img src={`/mascots/${item.id}.webp`} alt={`${item.label}, ${pick(item.role)}`} loading="lazy" className="mx-auto h-24 w-24 rounded-2xl object-cover transition duration-300 group-hover:scale-105" style={{ filter: locked ? 'grayscale(1) brightness(0.75)' : 'none' }} />
                      {locked && <span className="absolute inset-0 grid place-items-center"><span className="grid h-8 w-8 place-items-center rounded-full bg-black/80 text-white/90"><Lock className="h-3.5 w-3.5" /></span></span>}
                    </div>
                    <div className="mt-3">
                      <div className="text-xs font-black uppercase">{item.label}</div>
                      <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/38">{locked ? t(`Level ${item.requiredLevel}`, `Nivel ${item.requiredLevel}`) : pick(item.role)}</div>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* BOUNDARIES */}
        <section className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#8dc9ff]">{t('Clear boundaries', 'Límites claros')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Your companion.', 'Tu companion.')}<br /><span className="text-white/38">{t('Not your broker.', 'No tu bróker.')}</span></h2>
              <p className="mt-6 max-w-lg text-sm leading-6 text-white/45">{t('Analysis, not advice. You decide and you own the risk. Markets move against you and you can lose money.', 'Análisis, no asesoría. Tú decides y asumes el riesgo. Los mercados se mueven en tu contra y puedes perder dinero.')}</p>
            </motion.div>
            <div className="grid gap-3 sm:grid-cols-2">
              {boundaries.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-[#0d100e] p-6">
                  <Icon className="h-5 w-5 text-[#8dc9ff]" />
                  <h3 className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.16em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/45">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING — one CTA, on the same message as the hero */}
        <section id="early-access" className="relative overflow-hidden border-t border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(245,197,66,.16),transparent_50%),radial-gradient(circle_at_82%_24%,rgba(92,255,145,.12),transparent_38%)]" />
          <motion.div {...reveal} className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.045] p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-10 lg:p-14">
            <div className="mx-auto mb-7 flex w-fit"><ComingSoonBadge /></div>
            <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Stop asking.', 'Deja de preguntar.')}<br /><span className="text-[#F5C542]">{t('Start checking.', 'Empieza a comprobar.')}</span></h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-white/52 sm:text-base sm:leading-7">{t('The latest Bobby build has been sent to TestFlight. Join the list for future invitations and launch updates. While you wait, the Live Desk is open on the web.', 'El último build de Bobby fue enviado a TestFlight. Únete a la lista para futuras invitaciones y novedades del lanzamiento. Mientras esperas, el Live Desk ya está en la web.')}</p>
            {signupState === 'success' ? (
              <div className="mx-auto mt-9 flex max-w-xl items-center justify-center gap-3 rounded-2xl border border-[#5cff91]/25 bg-[#5cff91]/10 px-5 py-5 text-left text-sm text-[#baffcc]" role="status">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#5cff91] text-[#041009]"><Check className="h-4 w-4" /></span>
                {signupMessage}
              </div>
            ) : (
              <form onSubmit={submitEarlyAccess} className="mx-auto mt-9 max-w-xl" noValidate>
                <label className="sr-only" aria-hidden="true">Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label htmlFor="early-access-email" className="sr-only">{t('Email address', 'Correo electrónico')}</label>
                  <input id="early-access-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); if (signupState === 'error') setSignupState('idle'); }} placeholder={t('you@email.com', 'tu@correo.com')} disabled={signupState === 'loading'} aria-describedby="signup-note signup-message" aria-invalid={signupState === 'error'} className="min-h-14 flex-1 rounded-xl border border-white/15 bg-black/35 px-5 text-base text-white outline-none transition placeholder:text-white/25 focus:border-[#5cff91]/65 focus:ring-4 focus:ring-[#5cff91]/10 disabled:opacity-60" />
                  <button type="submit" disabled={signupState === 'loading'} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#5cff91] px-7 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white disabled:cursor-wait disabled:opacity-70">
                    {signupState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('Saving', 'Guardando')}</> : <>{t('Save my spot', 'Aparta mi lugar')} <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
                <p id="signup-message" className={`mt-3 min-h-5 text-left text-xs ${signupState === 'error' ? 'text-[#ff8f83]' : 'text-transparent'}`} role={signupState === 'error' ? 'alert' : undefined}>{signupMessage || ' '}</p>
                <p id="signup-note" className="mt-1 text-center font-mono text-[8px] uppercase tracking-[0.13em] text-white/28">{t('Early-access updates only · Unsubscribe anytime · No spam', 'Solo avisos de acceso anticipado · Cancela cuando quieras · Sin spam')}</p>
              </form>
            )}
            {/* What the beta actually contains — kept here as small print instead of its own section. */}
            <dl className="mx-auto mt-10 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
              {[
                { icon: Smartphone, term: t('In the iPhone beta', 'En la beta de iPhone'), desc: t('The Live Desk, your companion and the Trader Land island editor.', 'El Live Desk, tu companion y el editor de islas de Trader Land.') },
                { icon: UserRound, term: t('Account & privacy', 'Cuenta y privacidad'), desc: t('Sign in with Apple, and delete your account from inside the app.', 'Inicia sesión con Apple y borra tu cuenta desde la app.') },
                { icon: ArrowLeftRight, term: t('Base swaps', 'Swaps en Base'), desc: t('Self-custodial and you confirm every one. Eligibility applies; not open to everyone.', 'Sin custodia y tú confirmas cada uno. Sujeto a elegibilidad; no está abierto para todos.') },
              ].map(({ icon: Icon, term, desc }) => (
                <div key={term} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <Icon size={18} className="mb-3 text-[#b8d6eb]" />
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#92ac9b]">{term}</dt>
                  <dd className="mt-2 text-xs leading-5 text-white/55">{desc}</dd>
                </div>
              ))}
            </dl>
            <p className="mx-auto mt-4 max-w-2xl text-xs leading-5 text-white/40">{t('iPhone access is by invitation, not a public App Store release. Joining the list does not guarantee a TestFlight place.', 'El acceso a iPhone es por invitación, no un lanzamiento público en el App Store. Unirte a la lista no garantiza un cupo en TestFlight.')}</p>
            <a href={TRY_IT_URL} className="mt-8 inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-white/42 transition hover:text-white">{t("Can't wait? Open the desk on the web", '¿No aguantas? Abre el desk en la web')} <ChevronRight className="h-3.5 w-3.5" /></a>
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
