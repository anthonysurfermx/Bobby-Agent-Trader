// /app — the landing for the Bobby app. Core message: VIBE TRADING and AURA.
// You talk to the market, three agents fight over your idea, NO TRADE is a
// win, and your aura (discipline XP) unlocks gear, pets and a world. Every
// number and name on this page comes from the companion data pack or the
// live protocol stats — nothing is invented for the pitch.
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

const TRY_IT_URL = '/agentic-world/bobby';
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
    <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-[#080a0d] p-[6px] shadow-[0_32px_90px_rgba(0,0,0,.65)]">
      <div className="pointer-events-none absolute left-1/2 top-[12px] z-10 h-[17px] w-[82px] -translate-x-1/2 rounded-full bg-black" />
      <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className="h-auto w-full rounded-[1.95rem]" />
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

  const pageTitle = t('Bobby — Farm aura. Build your world.', 'Bobby — Farmea aura. Crea tu mundo.');
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

  const navItems: Array<[string, string]> = [
    [t('The vibe', 'La vibra'), '#vibe'],
    ['Aura', '#aura'],
    ['Squad', '#squad'],
    ['Trader Land', '#trader-land'],
    [t('New in the app', 'En la app'), '#app-features'],
  ];

  const moments = [
    { step: '01', eyebrow: t('Ask out loud', 'Pregunta en voz alta'), title: t('Say the ticker. The desk wakes up.', 'Di el ticker. El desk despierta.'), text: t('BTC, NVDA, gold and 600+ more, by voice or text. Live market context and public reference feeds, not recycled takes. Your companion answers in its own voice, wearing the gear you earned.', 'BTC, NVDA, oro y más de 600 activos, por voz o texto. Contexto de mercado en vivo y referencias públicas, no opiniones recicladas. Tu companion contesta con su propia voz, con el equipo que te ganaste.'), image: '/app/shot-desk.webp', alt: t('The Live Desk with Byte wearing his gear and Bit the dog', 'El Live Desk con Byte usando su equipo y Bit el perro'), accent: GREEN },
    { step: '02', eyebrow: t('NO TRADE is a win', 'NO TRADE es una victoria'), title: t('Three agents fight. When there is no edge, the gate closes.', 'Tres agentes se pelean. Si no hay ventaja, la puerta se cierra.'), text: t('Alpha Hunter finds the setup, Red Team tears it apart, the CIO decides. No clean signal? Halo\'s risk gate says NO TRADE and pays you +20 discipline XP for listening.', 'Alpha Hunter busca el setup, Red Team lo destroza, el CIO decide. ¿Sin señal limpia? La puerta de riesgo de Halo dice NO TRADE y te paga +20 XP de disciplina por escuchar.'), image: '/app/shot-notrade.webp', alt: t('A real NO TRADE verdict on BTC with +20 discipline XP and the live chart', 'Un NO TRADE real en BTC con +20 XP de disciplina y la gráfica en vivo'), accent: '#7ea6ff' },
    { step: '03', eyebrow: t('Farm market aura', 'Farmea aura del mercado'), title: t('Aura becomes gear your companion actually wears.', 'El aura se vuelve equipo que tu companion sí se pone.'), text: t('Goggles on the face, a radio on the hip, a golden codex in the hand, a pet at the feet. Hold any item to preview it on its owner. Discipline only, never volume.', 'Gafas en la cara, radio en la cadera, un códice dorado en la mano, una mascota a los pies. Mantén presionado cualquier item para verlo puesto. Solo disciplina, nunca volumen.'), image: '/app/shot-preview.webp', alt: t('Gear preview: Bobby wearing a piece earned with discipline', 'Preview de equipo: Bobby usando una pieza ganada con disciplina'), accent: GOLD },
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
        <meta name="description" content={t('Meet Bobby: voice-led market analysis, a three-agent debate, companions and Trader Land. Build your practice island on the web and discover what is new in the iPhone beta.', 'Conoce Bobby: análisis por voz, debate de tres agentes, companions y Trader Land. Construye tu isla de práctica en la web y descubre las novedades de la beta de iPhone.')} />
        <link rel="canonical" href="https://bobbyprotocol.xyz/app" />
        <meta property="og:url" content="https://bobbyprotocol.xyz/app" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={t('A desk to think. An island to make your own. Explore Bobby and Trader Land.', 'Un desk para pensar. Una isla para hacerla tuya. Explora Bobby y Trader Land.')} />
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
              <div className="mb-7 flex flex-wrap items-center gap-3">
                <ComingSoonBadge compact />
                <span className="rounded-full border border-[#F5C542]/30 bg-[#F5C542]/[0.08] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#F5C542]">{t('iPhone beta · Web playground live', 'Beta iPhone · Isla web disponible')}</span>
              </div>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#5cff91]">Vibe trading</div>
              <h1 className="max-w-3xl text-[clamp(2.85rem,7vw,6.4rem)] font-black leading-[0.88] tracking-[-0.078em]">
                {t('Farm aura.', 'Farmea aura.')}<br />
                <span className="bg-[linear-gradient(100deg,#F5C542_0%,#5cff91_55%,#76d6ff_100%)] bg-clip-text text-transparent">{t('Build your world.', 'Crea tu mundo.')}</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/58 sm:text-lg sm:leading-8">
                {t('Talk through an idea with your companion. Let three agents challenge it. Then make space for something of your own: a little island you can build, rearrange and explore in Trader Land. Better habits, not more trades.', 'Piensa una idea en voz alta con tu companion. Deja que tres agentes la cuestionen. Después dale espacio a algo tuyo: una pequeña isla para construir, reorganizar y explorar en Trader Land. Mejores hábitos, no más operaciones.')}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href={TRADER_LAND_URL} className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#5cff91] px-7 font-mono text-xs font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white">{t('Play Trader Land', 'Jugar Trader Land')} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href={TRY_IT_URL} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-7 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.12]">{t('Try the live desk', 'Prueba el live desk')}</a>
              </div>
              <a href="#early-access" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-white/60 underline decoration-white/20 underline-offset-4 hover:text-white">{t('Prefer iPhone? Join the early-access list', '¿Prefieres iPhone? Únete al acceso anticipado')}<ChevronRight size={15} /></a>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] uppercase tracking-[0.12em] text-white/38">
                <span className="inline-flex items-center gap-2"><Mic className="h-3.5 w-3.5 text-[#5cff91]" /> {t('Voice or text', 'Voz o texto')}</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#8dc9ff]" /> {t('Your decisions, always', 'Tú decides, siempre')}</span>
                <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#F5C542]" /> {t('Build · rotate · explore', 'Construye · gira · explora')}</span>
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
                {['Vibe trading', t('Farm market aura', 'Farmea aura del mercado'), t('Three-agent debate', 'Debate de tres agentes'), t('NO TRADE is a win', 'NO TRADE es una victoria'), t('Base-only proofs', 'Pruebas solo en Base'), t('Self-custody', 'Autocustodia')].map((label) => (
                  <span key={`${duplicate}-${label}`} className="flex items-center gap-9"><span>{label}</span><span className="text-[#F5C542]">✦</span></span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* TRADER LAND — the shipped pieces, not a future-world concept. */}
        <section id="trader-land" className="relative overflow-hidden border-b border-[#b4deb5]/15 bg-[#101b15] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <motion.div {...reveal}>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cde9b4]/25 bg-[#cde9b4]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#d1edb8]"><MapIcon size={14} />{t('Trader Land · Play on the web', 'Trader Land · Juega en la web')}</div>
              <h2 className="text-4xl font-black leading-[.98] tracking-[-.055em] text-[#edf3e5] sm:text-6xl">{t('A little world.', 'Un pequeño mundo.')}<br /><span className="text-[#b9d69b]">{t('Entirely your own.', 'Completamente tuyo.')}</span></h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-[#c3d0bd]">{t('A floating island, a living Aura Core and a collection waiting to find its place. Start small. Move a tower, turn a path, make a quiet corner. There is no perfect layout. There is yours.', 'Una isla flotante, un Aura Core y una colección esperando su lugar. Empieza pequeño. Mueve una torre, gira un camino, crea un rincón tranquilo. No hay un diseño perfecto. Está el tuyo.')}</p>
              <ul className="mt-7 space-y-3 text-sm leading-6 text-[#c3d0bd]">
                {[t('Preview a piece. Rotate it. Confirm when it fits.', 'Previsualiza una pieza. Gírala. Confirma cuando encaje.'), t('Move, store or undo. Your practice layout stays in this browser.', 'Mueve, guarda o deshaz. Tu diseño de práctica queda en este navegador.'), t('Drag to explore. Pinch or scroll to zoom. Keyboard controls included.', 'Arrastra para explorar. Pellizca o usa la rueda para acercar. También con teclado.')].map((line) => <li key={line} className="flex gap-3"><Check size={17} className="mt-1 shrink-0 text-[#b9d69b]" />{line}</li>)}
              </ul>
              <a href={TRADER_LAND_URL} className="mt-8 inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#d1edb8] px-6 text-sm font-bold text-[#17251a] transition hover:bg-[#e7f6d8]">{t('Build my practice island', 'Construir mi isla de práctica')}<ArrowRight size={17} /></a>
              <p className="mt-4 max-w-lg text-xs leading-5 text-[#a2b29c]">{t('No account needed to practice. Practice pieces are separate from earned inventory. Moving synced pieces between web and iPhone is not enabled yet.', 'Practica sin cuenta. Las piezas de prueba están separadas de tu inventario ganado. Mover piezas sincronizadas entre web y iPhone todavía no está habilitado.')}</p>
            </motion.div>
            <motion.div {...reveal}><TraderLandPreview /></motion.div>
          </div>
          <div className="mx-auto mt-10 flex max-w-7xl flex-wrap gap-2" aria-label={t('Five districts', 'Cinco distritos')}>
            {['Crypto Bay', 'Evidence Mines', 'Thesis Citadel', 'Risk Reef', 'Axiom Archive'].map((name, index) => <span key={name} className="rounded-full border border-[#cde9b4]/15 px-4 py-2.5 text-xs text-[#c3d0bd]"><span className="mr-2 font-mono text-[#91a784]">0{index + 1}</span>{name}</span>)}
          </div>
        </section>

        <section id="app-features" className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal} className="mb-9 max-w-3xl">
              <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8dc9ff]">{t('New in the iPhone beta', 'Novedades de la beta de iPhone')}</p>
              <h2 className="text-4xl font-black leading-[.98] tracking-[-.055em] sm:text-5xl">{t('More to make yours.', 'Más cosas para hacer tuyas.')}<br /><span className="text-white/45">{t('Still your call.', 'Las decisiones siguen siendo tuyas.')}</span></h2>
            </motion.div>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                { icon: Smartphone, tag: t('Native island editor', 'Editor nativo de islas'), title: t('Your island, in your pocket.', 'Tu isla, en el bolsillo.'), text: t('Trader Land comes to iPhone with a piece collection, placement previews, rotation, move controls, undo and camera gestures. The latest build has been sent to TestFlight.', 'Trader Land llega a iPhone con colección, vistas previas, rotación, controles de movimiento, deshacer y gestos de cámara. El último build fue enviado a TestFlight.') },
                { icon: UserRound, tag: t('Account & privacy', 'Cuenta y privacidad'), title: t('Sign in as yourself.', 'Entra con tu cuenta.'), text: t('Sign in with Apple and manage your Bobby account from the app, including account deletion. Your Bobby identity and optional external wallet are separate.', 'Inicia sesión con Apple y gestiona tu cuenta de Bobby desde la app, incluido su borrado. Tu identidad de Bobby y tu wallet externa opcional son independientes.') },
                { icon: ArrowLeftRight, tag: t('Controlled rollout', 'Lanzamiento controlado'), title: t('Base swaps. You confirm.', 'Swaps en Base. Tú confirmas.'), text: t('The beta includes a self-custodial swap flow with quote review, exact approvals, receipts and allowance revocation. Access depends on service availability and eligibility; it is not open to everyone.', 'La beta incluye un flujo de swaps sin custodia con revisión de cotización, permisos exactos, recibos y revocación de permisos. El acceso depende de disponibilidad y elegibilidad; no está abierto para todos.') },
              ].map(({ icon: Icon, tag, title, text }) => <motion.article key={tag} {...reveal} className="rounded-3xl border border-white/10 bg-[#101510] p-6 sm:p-7"><Icon size={24} className="mb-7 text-[#b8d6eb]" /><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#92ac9b]">{tag}</p><h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">{title}</h3><p className="mt-4 text-sm leading-6 text-white/60">{text}</p></motion.article>)}
            </div>
            <p className="mt-6 text-sm leading-6 text-white/45">{t('Web playground: available now. iPhone: beta access by invitation, not a public App Store release. Joining the list does not guarantee a TestFlight place.', 'Isla de práctica web: disponible ahora. iPhone: beta por invitación, no un lanzamiento público en el App Store. Unirte a la lista no garantiza un cupo en TestFlight.')}</p>
            <a href="#early-access" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#b8d6eb]">{t('Get iPhone beta updates', 'Recibir novedades de la beta iPhone')}<ChevronRight size={16} /></a>
          </div>
        </section>

        {/* THE VIBE — three moments */}
        <section id="vibe" className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal} className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">{t('The vibe', 'La vibra')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-5xl lg:text-7xl">{t('Talk to the market.', 'Háblale al mercado.')}<br /><span className="text-white/38">{t('Watch it argue back.', 'Míralo discutir contigo.')}</span></h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/48">{t('Not a chat box. A desk with a face, a voice and three agents that disagree in front of you, so you decide with your eyes open.', 'No es un chat. Es un desk con cara, voz y tres agentes que discrepan frente a ti, para que decidas con los ojos abiertos.')}</p>
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

        {/* AURA — the economy, straight from the data pack */}
        <section id="aura" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(245,197,66,.12),transparent_40%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#F5C542]">Aura</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Aura is discipline', 'El aura es disciplina')}<br /><span className="text-white/38">{t('you can wear.', 'que se lleva puesta.')}</span></h2>
                <p className="mt-6 max-w-lg text-base leading-7 text-white/52">{t('Read, reflect and return. Discipline XP unlocks gear and companions; your discovery route grows an earned collection. In Trader Land, you can also try every piece in a separate practice island. Trading volume, frequency and P&L do not earn XP.', 'Lee, reflexiona y vuelve. El XP de disciplina desbloquea equipo y companions; tu ruta de descubrimiento hace crecer una colección ganada. En Trader Land también puedes probar todas las piezas en una isla de práctica separada. El volumen, la frecuencia y el P&L no dan XP.')}</p>
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
          </div>
        </section>

        {/* PREPPING AURA — the forge */}
        <section className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <motion.div {...reveal} className="relative mx-auto flex w-full max-w-[520px] items-end justify-center gap-4">
              <div className="absolute inset-0 rounded-full bg-[#5cff91]/15 blur-[80px]" />
              <div className="relative w-[44%] -rotate-3 opacity-90"><PhoneFrame src="/app/shot-vibe.webp" alt={t('Pick the vibe: chill, direct or pro, and hear it live', 'Elige la vibra: chill, directo o pro, y escúchala en vivo')} /></div>
              <div className="relative w-[56%]"><PhoneFrame src="/app/shot-forge.webp" alt={t('Prepping aura: Byte inside the aura forge', 'Preparando aura: Byte dentro de la máquina de aura')} /></div>
            </motion.div>
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">{t('Prepping aura', 'Preparando aura')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Build the avatar', 'Crea el avatar')}<br /><span className="text-white/38">{t('with the best aura in the market.', 'con la mejor aura del mercado.')}</span></h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/52">{t('Pick your companion. Pick its vibe and hear it live. Then step into the forge: four pieces of kit lock in one by one, with sound, haptics and a machine that charges as you go. Sixty seconds and your aura is ready to farm.', 'Elige tu companion. Elige su vibra y escúchala en vivo. Luego entra a la máquina: cuatro piezas de equipo se fijan una por una, con sonido, vibración y una máquina que se carga contigo. Sesenta segundos y tu aura está lista para farmear.')}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {VIBES.map((vibe) => (
                  <div key={vibe.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white">{pick(vibe.label)}</div>
                    <div className="mt-2 text-xs leading-5 text-white/55">{pick(vibe.desc)}</div>
                    <div className="mt-3 text-xs italic text-white/70">“{pick(vibe.sample)}”</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* SQUAD — every companion, locked ones included */}
        <section id="squad" className="relative overflow-hidden border-y border-white/10 bg-[#050706]">
          <img src="/app/lifestyle-squad.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center opacity-20" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#050706_0%,rgba(5,7,6,.9)_48%,rgba(5,7,6,.78)_100%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:py-28">
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#b488ff]">{t('Your squad', 'Tu squad')}</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Same desk.', 'Mismo desk.')}<br /><span className="text-white/38">{t('Your kind of aura.', 'Tu tipo de aura.')}</span></h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/52">{t(`${COMPANIONS.length} companions, one set of risk rules. ${starters.length} are yours from day one; the rest unlock with levels, and you can preview every one of them, locked or not.`, `${COMPANIONS.length} companions, un solo reglamento de riesgo. ${starters.length} son tuyos desde el día uno; el resto se desbloquea con niveles, y puedes ver a todos en 3D, bloqueados o no.`)}</p>
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

        {/* THE PUBLIC RECORD — live numbers */}
        <section id="record" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_22%,rgba(92,255,145,.11),transparent_42%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">{t('The public record', 'El historial público')}</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Bobby remembers', 'Bobby recuerda')}<br /><span className="text-white/38">{t('the misses too.', 'también los fallos.')}</span></h2>
                <p className="mt-6 max-w-lg text-base leading-7 text-white/50">{t('Calls are published before the outcome on Base. Confirmed swaps use a chain-ordered receipt ledger; wins, losses and flat results stay visible, so confidence has consequences.', 'Las llamadas se publican antes del resultado en Base. Los swaps confirmados usan un ledger ordenado por cadena; aciertos, fallos y empates siguen visibles, para que la confianza tenga consecuencias.')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[[t('Published', 'Publicadas'), formatNumber(record?.commitmentsCreated)], [t('Resolved', 'Resueltas'), formatNumber(record?.decisionsResolved)], [t('Wrong', 'Fallidas'), formatNumber(record?.losses)], [t('Record', 'Récord'), hitRate]].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.17em] text-white/35">{label}</div>
                    <div className="mt-3 font-mono text-2xl font-black tracking-[-0.05em] sm:text-3xl">{value}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <a href="/agentic-world/bobby/history" className="group mt-9 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/55 transition hover:text-white">{t('Inspect the full track record', 'Revisa el historial completo')} <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></a>
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

        {/* EARLY ACCESS */}
        <section id="early-access" className="relative overflow-hidden border-t border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(245,197,66,.16),transparent_50%),radial-gradient(circle_at_82%_24%,rgba(92,255,145,.12),transparent_38%)]" />
          <motion.div {...reveal} className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.045] p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-10 lg:p-14">
            <div className="mx-auto mb-7 flex w-fit"><ComingSoonBadge /></div>
            <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{t('Your next little world.', 'Tu próximo pequeño mundo.')}<br /><span className="text-[#F5C542]">{t('Coming along on iPhone.', 'También en iPhone.')}</span></h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-white/52 sm:text-base sm:leading-7">{t('The latest Bobby build has been sent to TestFlight. Join the list for future invitations and launch updates. While you wait, the Live Desk and Trader Land playground are open on the web.', 'El último build de Bobby fue enviado a TestFlight. Únete a la lista para futuras invitaciones y novedades del lanzamiento. Mientras esperas, el Live Desk y la isla de práctica de Trader Land ya están en la web.')}</p>
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
            <a href="/agentic-world/bobby/history" className="transition hover:text-white">{t('Track record', 'Historial')}</a>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-white/55"><Flame className="h-3 w-3 text-[#F5C542]" /><PawPrint className="h-3 w-3 text-[#5cff91]" /> © 2026 Bobby · {t('Refuted before execution', 'Refutado antes de ejecutar')}</span>
        </div>
      </footer>
    </div>
  );
}
