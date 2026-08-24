import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Apple,
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
  Menu,
  Mic,
  ShieldCheck,
  Sparkles,
  Trophy,
  Volume2,
  X,
  Zap,
} from 'lucide-react';

interface DebateActivity {
  commitmentsCreated?: number;
  decisionsResolved?: number;
  wins?: number;
  losses?: number;
  breakEven?: number;
  pending?: number;
  winRate?: number;
}

interface ProtocolStats {
  debateActivity?: DebateActivity;
}

type SignupState = 'idle' | 'loading' | 'success' | 'error';

const PAGE_TITLE = 'Bobby — Your financial AI companion';
const TRY_IT_URL = '/agentic-world/bobby';
const WIN_RATE_MIN_SAMPLE = 20;

const COMPANIONS = [
  {
    id: 'byte',
    name: 'Byte',
    role: 'The straight-talker',
    image: '/mascots/byte.webp',
    color: '#5cff91',
    line: 'I keep the market simple, never watered down.',
  },
  {
    id: 'kora',
    name: 'Kora',
    role: 'The calm strategist',
    image: '/mascots/kora.webp',
    color: '#66e8ff',
    line: 'We slow down, read the setup and protect the plan.',
  },
  {
    id: 'glitch',
    name: 'Glitch',
    role: 'The challenger',
    image: '/mascots/glitch.webp',
    color: '#b488ff',
    line: 'I question the trade before the market gets the chance.',
  },
  {
    id: 'halo',
    name: 'Halo',
    role: 'The risk guardian',
    image: '/mascots/halo.webp',
    color: '#8dc9ff',
    line: 'No setup yet. Capital protected.',
  },
] as const;

const PRODUCT_MOMENTS = [
  {
    step: '01',
    eyebrow: 'Ask naturally',
    title: 'Name a market. Bobby gets to work.',
    text: 'Speak or type BTC, NVDA, gold and hundreds more. Live market context replaces generic explanations.',
    image: '/app/live-desk-byte.webp',
    alt: 'Bobby Live Desk with Byte ready for a spoken or typed market question',
    accent: '#5cff91',
  },
  {
    step: '02',
    eyebrow: 'Watch it think',
    title: 'Your idea gets challenged, not validated.',
    text: 'Specialized agents test the thesis, attack its weak spots and pass it through a fixed risk gate.',
    image: '/app/live-desk-glitch.webp',
    alt: 'Bobby Live Desk with Glitch, the companion that challenges a market thesis',
    accent: '#b488ff',
  },
  {
    step: '03',
    eyebrow: 'Make the call',
    title: 'When there is no edge, Bobby says so.',
    text: 'A clear NO TRADE explains why waiting can protect your capital — and rewards the discipline to do it.',
    image: '/app/no-trade-halo.webp',
    alt: 'Bobby NO TRADE verdict with Halo and a Discipline XP reward',
    accent: '#8dc9ff',
  },
] as const;

const LIFESTYLE_CARDS = [
  {
    title: 'Build a better streak.',
    text: 'Opening the app earns nothing. Reviewing the debate and respecting the risk does.',
    image: '/app/lifestyle-subway.webp',
    label: 'Discipline XP',
  },
  {
    title: 'Your companion evolves as you do.',
    text: 'New names, emotes and forms unlock through useful behavior — never by spending more.',
    image: '/app/lifestyle-evolve.webp',
    label: 'Companion evolution',
  },
  {
    title: 'Serious finance. Zero banking vibe.',
    text: 'Live data, clear risk and a companion you actually want to come back to.',
    image: '/app/lifestyle-rooftop.webp',
    label: 'Built for your world',
  },
] as const;

const BOUNDARIES = [
  { icon: ShieldCheck, title: 'No custody', text: 'Bobby never holds funds or connects to your accounts.' },
  { icon: Zap, title: 'No execution', text: 'It places no orders. The final decision always stays with you.' },
  { icon: Volume2, title: 'No fake certainty', text: 'A favorable verdict is not a promise or a buy recommendation.' },
  { icon: Trophy, title: 'No pay-to-win', text: 'Companion progress comes from better process, not spending more.' },
] as const;

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
      } catch {
        // The product story remains complete when live protocol stats are unavailable.
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return stats;
}

function BrandMark() {
  return (
    <a href="/app" className="flex items-center gap-2.5 text-white" aria-label="Bobby home">
      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-[13px] border border-[#5cff91]/30 bg-[#0b1511] shadow-[0_0_28px_rgba(92,255,145,.16)]">
        <img src="/mascots/byte.webp" alt="" className="h-11 w-11 object-cover" />
      </span>
      <span className="text-[15px] font-black tracking-[-0.04em]">BOBBY</span>
    </a>
  );
}

function ComingSoonBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] text-left shadow-[inset_0_1px_rgba(255,255,255,.08)] ${compact ? 'px-4 py-2.5' : 'px-5 py-3.5'}`}
      role="img"
      aria-label="Coming soon on the App Store"
    >
      <Apple className={compact ? 'h-6 w-6' : 'h-8 w-8'} strokeWidth={1.7} aria-hidden="true" />
      <span className="leading-none">
        <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/45">Coming soon on the</span>
        <span className={`${compact ? 'text-sm' : 'text-lg'} mt-1 block font-semibold tracking-[-0.03em]`}>App Store</span>
      </span>
    </div>
  );
}

function PhoneFrame({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-[#080a0d] p-[6px] shadow-[0_32px_90px_rgba(0,0,0,.65)]">
      <div className="pointer-events-none absolute left-1/2 top-[12px] z-10 h-[17px] w-[82px] -translate-x-1/2 rounded-full bg-black" />
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        className="h-auto w-full rounded-[1.95rem]"
      />
    </div>
  );
}

export default function BobbyAppLandingExperience() {
  const stats = useProtocolStats();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCompanion, setActiveCompanion] = useState(0);
  const [email, setEmail] = useState('');
  const [signupState, setSignupState] = useState<SignupState>('idle');
  const [signupMessage, setSignupMessage] = useState('');

  useEffect(() => {
    document.title = PAGE_TITLE;
  }, []);

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

  const companion = COMPANIONS[activeCompanion];
  const navItems = [
    ['How it feels', '#product'],
    ['Companions', '#companions'],
    ['The record', '#record'],
    ['Early access', '#early-access'],
  ];

  const submitEarlyAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setSignupState('error');
      setSignupMessage('Enter a valid email so we know where to find you.');
      return;
    }

    setSignupState('loading');
    setSignupMessage('');
    const website = new FormData(form).get('website');

    try {
      const response = await fetch('/api/bobby-early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, website }),
      });
      if (!response.ok) throw new Error('Signup failed');
      setSignupState('success');
      setSignupMessage("You're on the list. We'll only email when Bobby is ready for you.");
      setEmail('');
    } catch {
      setSignupState('error');
      setSignupMessage("We couldn't save your spot right now. Please try again in a moment.");
    }
  };

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.18 },
      };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050706] font-sans text-white antialiased selection:bg-[#5cff91] selection:text-[#041009]">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content="Meet Bobby: live market intelligence, three-agent debate, clear risk and a 3D financial companion that evolves with your discipline. Coming soon to iPhone." />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content="Serious finance without the banking vibe. Join Bobby's iPhone early access." />
        <meta property="og:image" content="https://defimexico.org/bobby-hero.png" />
      </Helmet>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050706]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            {navItems.map(([label, href]) => (
              <a key={href} href={href} className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/48 transition hover:text-white">{label}</a>
            ))}
          </nav>
          <a href="#early-access" className="hidden rounded-full bg-[#5cff91] px-5 py-2.5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white md:inline-flex">Get early access</a>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] md:hidden"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-white/10 bg-[#080a09] px-5 py-4 md:hidden" aria-label="Mobile navigation">
            {navItems.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block border-b border-white/[0.06] py-4 font-mono text-xs uppercase tracking-[0.14em] text-white/70">{label}</a>
            ))}
          </nav>
        )}
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_38%,rgba(92,255,145,.17),transparent_34%),radial-gradient(circle_at_87%_25%,rgba(52,121,255,.23),transparent_40%),radial-gradient(circle_at_18%_70%,rgba(180,136,255,.13),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative mx-auto grid min-h-[calc(100svh-69px)] max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-20">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.55 }} className="relative z-10">
              <div className="mb-7 flex flex-wrap items-center gap-3">
                <ComingSoonBadge compact />
                <span className="rounded-full border border-[#5cff91]/25 bg-[#5cff91]/[0.08] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#8dffad]">iPhone early access</span>
              </div>
              <h1 className="max-w-3xl text-[clamp(2.85rem,7vw,6.4rem)] font-black leading-[0.88] tracking-[-0.078em]">
                Your financial AI should do more than{' '}
                <span className="bg-[linear-gradient(100deg,#5cff91_0%,#76d6ff_55%,#b488ff_100%)] bg-clip-text text-transparent">agree with you.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/58 sm:text-lg sm:leading-8">
                Bobby reads live markets, puts every idea through a three-agent debate and shows you the risk before you make the call — with a companion that grows alongside your discipline.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href="#early-access" className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#5cff91] px-7 font-mono text-xs font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white">Join early access <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></a>
                <a href={TRY_IT_URL} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-7 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.12]">Try the live desk</a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] uppercase tracking-[0.12em] text-white/38">
                <span className="inline-flex items-center gap-2"><Mic className="h-3.5 w-3.5 text-[#5cff91]" /> Voice or text</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#8dc9ff]" /> No custody</span>
                <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#b488ff]" /> Companion evolution</span>
              </div>
            </motion.div>

            <div className="relative mx-auto flex w-full max-w-[440px] items-center justify-center lg:max-w-[500px]">
              <div className="absolute h-[72%] w-[72%] rounded-full bg-[#5cff91]/15 blur-[85px]" />
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 28, rotate: 2 }}
                animate={{ opacity: 1, y: 0, rotate: 2 }}
                transition={{ duration: reduceMotion ? 0 : 0.7, delay: 0.1 }}
                className="relative z-10 w-[72%] max-w-[310px]"
              >
                <PhoneFrame src="/app/live-desk-byte.webp" alt="Bobby iOS Live Desk with Byte" priority />
              </motion.div>
              {COMPANIONS.slice(1).map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -7, 0] }}
                  transition={{ opacity: { delay: 0.35 + index * 0.1 }, scale: { delay: 0.35 + index * 0.1 }, y: { duration: 3.6 + index, repeat: Infinity, ease: 'easeInOut' } }}
                  className={`absolute z-20 grid h-20 w-20 place-items-center rounded-3xl border border-white/15 bg-[#0a0d0b]/90 p-1 shadow-2xl backdrop-blur-xl sm:h-24 sm:w-24 ${index === 0 ? '-left-1 top-[15%] -rotate-6' : index === 1 ? '-right-1 top-[34%] rotate-6' : 'bottom-[8%] left-[2%] rotate-3'}`}
                  style={{ boxShadow: `0 18px 50px rgba(0,0,0,.5), 0 0 30px ${item.color}18` }}
                >
                  <img src={item.image} alt={`${item.name} companion`} className="h-full w-full rounded-[1.2rem] object-cover" />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <div className="overflow-hidden border-b border-white/10 bg-[#090c0a] py-3.5">
          <div className="flex min-w-max animate-marquee items-center gap-9 font-mono text-[10px] font-bold uppercase tracking-[0.17em] text-white/55 motion-reduce:animate-none">
            {[0, 1].map((duplicate) => (
              <div key={duplicate} className="flex shrink-0 items-center gap-9">
                {['Ask out loud', 'Live market context', 'Three-agent debate', 'Risk can veto', 'No trade is a win', 'Your companion evolves'].map((label) => (
                  <span key={`${duplicate}-${label}`} className="flex items-center gap-9"><span>{label}</span><span className="text-[#5cff91]">✦</span></span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section id="product" className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal} className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">The Bobby moment</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-5xl lg:text-7xl">Ask. Watch the debate.<br /><span className="text-white/38">Decide with your eyes open.</span></h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/48">Not another empty chat box. Bobby turns a market question into a visible process you can understand, challenge and remember.</p>
            </motion.div>

            <div className="grid gap-5 lg:grid-cols-3">
              {PRODUCT_MOMENTS.map((moment, index) => (
                <motion.article key={moment.step} {...reveal} transition={{ delay: reduceMotion ? 0 : index * 0.07 }} className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d100e]">
                  <div className="relative h-[420px] overflow-hidden border-b border-white/10 sm:h-[480px] lg:h-[430px]">
                    <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 50% 50%, ${moment.accent}45, transparent 55%)` }} />
                    <img src={moment.image} alt={moment.alt} loading="lazy" className="relative mx-auto w-[72%] transition duration-500 group-hover:scale-[1.025]" />
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

        <section id="companions" className="relative overflow-hidden border-y border-white/10 bg-[#050706]">
          <img src="/app/lifestyle-squad.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center opacity-20" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#050706_0%,rgba(5,7,6,.88)_48%,rgba(5,7,6,.72)_100%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[.88fr_1.12fr] lg:px-8 lg:py-28">
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#b488ff]">Meet your companion</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Same intelligence.<br /><span className="text-white/38">Your kind of aura.</span></h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/52">Pick the face, voice and personality that make you want to come back. Every companion sees the same data and follows the same risk rules — only the way it reaches you changes.</p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <img src={companion.image} alt="" className="h-16 w-16 rounded-2xl border border-white/10 bg-black/40 object-cover" />
                  <div>
                    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: companion.color }}>{companion.name} · {companion.role}</div>
                    <p className="mt-2 text-sm text-white/70">“{companion.line}”</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div {...reveal} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
              {COMPANIONS.map((item, index) => {
                const active = index === activeCompanion;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveCompanion(index)}
                    aria-pressed={active}
                    className={`group relative min-h-[190px] overflow-hidden rounded-3xl border p-3 text-left transition sm:min-h-[220px] ${active ? 'border-white/35 bg-white/[0.1]' : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.06]'}`}
                    style={active ? { boxShadow: `0 20px 60px rgba(0,0,0,.35), 0 0 36px ${item.color}22` } : undefined}
                  >
                    <img src={item.image} alt={`${item.name}, ${item.role}`} loading="lazy" className="mx-auto h-28 w-28 rounded-2xl object-cover transition duration-300 group-hover:scale-105 sm:h-36 sm:w-36" />
                    <div className="mt-3 flex items-end justify-between">
                      <div><div className="text-sm font-black uppercase">{item.name}</div><div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/38">{item.role}</div></div>
                      {active && <Check className="h-4 w-4" style={{ color: item.color }} />}
                    </div>
                  </button>
                );
              })}
            </motion.div>
          </div>
        </section>

        <section className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal} className="mb-12 max-w-3xl">
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">Finance you want to return to</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">It feels alive because<br /><span className="text-white/38">your progress is real.</span></h2>
            </motion.div>
            <div className="grid gap-4 md:grid-cols-3">
              {LIFESTYLE_CARDS.map((card, index) => (
                <motion.article key={card.title} {...reveal} transition={{ delay: reduceMotion ? 0 : index * 0.07 }} className="group relative min-h-[560px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090b0a] sm:min-h-[620px] md:min-h-[680px]">
                  <img src={card.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#030504]" />
                  <div className="absolute inset-x-0 bottom-0 p-7">
                    <div className="mb-4 font-mono text-[9px] font-bold uppercase tracking-[0.19em] text-[#8dffad]">{card.label}</div>
                    <h3 className="text-3xl font-black leading-[0.98] tracking-[-0.05em]">{card.title}</h3>
                    <p className="mt-4 text-sm leading-6 text-white/62">{card.text}</p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="record" className="relative overflow-hidden border-y border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_22%,rgba(92,255,145,.11),transparent_42%)]" />
          <div className="relative mx-auto max-w-7xl">
            <motion.div {...reveal} className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
              <div>
                <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#5cff91]">The public record</div>
                <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Bobby remembers<br /><span className="text-white/38">the misses too.</span></h2>
                <p className="mt-6 max-w-lg text-base leading-7 text-white/50">Calls are published before the outcome. Wins, losses and flat results live on the same page, so confidence has consequences.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Published', formatNumber(record?.commitmentsCreated)],
                  ['Resolved', formatNumber(record?.decisionsResolved)],
                  ['Wrong', formatNumber(record?.losses)],
                  ['Record', hitRate],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.17em] text-white/35">{label}</div>
                    <div className="mt-3 font-mono text-2xl font-black tracking-[-0.05em] sm:text-3xl">{value}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <a href="/agentic-world/bobby/history" className="group mt-9 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/55 transition hover:text-white">Inspect the full track record <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></a>
          </div>
        </section>

        <section className="bg-[#080a09] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <motion.div {...reveal}>
              <div className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#8dc9ff]">Clear boundaries</div>
              <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Your companion.<br /><span className="text-white/38">Not your broker.</span></h2>
            </motion.div>
            <div className="grid gap-3 sm:grid-cols-2">
              {BOUNDARIES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-[#0d100e] p-6">
                  <Icon className="h-5 w-5 text-[#8dc9ff]" />
                  <h3 className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.16em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/45">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="early-access" className="relative overflow-hidden border-t border-white/10 bg-[#050706] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(92,255,145,.2),transparent_50%),radial-gradient(circle_at_82%_24%,rgba(180,136,255,.14),transparent_38%)]" />
          <motion.div {...reveal} className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.045] p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-10 lg:p-14">
            <div className="mx-auto mb-7 flex w-fit"><ComingSoonBadge /></div>
            <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Be there when<br /><span className="text-[#5cff91]">Bobby lands on iPhone.</span></h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-white/52 sm:text-base sm:leading-7">Join the early-access list for TestFlight openings, launch news and your first chance to choose a companion.</p>

            {signupState === 'success' ? (
              <div className="mx-auto mt-9 flex max-w-xl items-center justify-center gap-3 rounded-2xl border border-[#5cff91]/25 bg-[#5cff91]/10 px-5 py-5 text-left text-sm text-[#baffcc]" role="status">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#5cff91] text-[#041009]"><Check className="h-4 w-4" /></span>
                {signupMessage}
              </div>
            ) : (
              <form onSubmit={submitEarlyAccess} className="mx-auto mt-9 max-w-xl" noValidate>
                <label className="sr-only" aria-hidden="true">
                  Website
                  <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label htmlFor="early-access-email" className="sr-only">Email address</label>
                  <input
                    id="early-access-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); if (signupState === 'error') setSignupState('idle'); }}
                    placeholder="you@email.com"
                    disabled={signupState === 'loading'}
                    aria-describedby="signup-note signup-message"
                    aria-invalid={signupState === 'error'}
                    className="min-h-14 flex-1 rounded-xl border border-white/15 bg-black/35 px-5 text-base text-white outline-none transition placeholder:text-white/25 focus:border-[#5cff91]/65 focus:ring-4 focus:ring-[#5cff91]/10 disabled:opacity-60"
                  />
                  <button type="submit" disabled={signupState === 'loading'} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#5cff91] px-7 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#041009] transition hover:bg-white disabled:cursor-wait disabled:opacity-70">
                    {signupState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving</> : <>Save my spot <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
                <p id="signup-message" className={`mt-3 min-h-5 text-left text-xs ${signupState === 'error' ? 'text-[#ff8f83]' : 'text-transparent'}`} role={signupState === 'error' ? 'alert' : undefined}>{signupMessage || ' '}</p>
                <p id="signup-note" className="mt-1 text-center font-mono text-[8px] uppercase tracking-[0.13em] text-white/28">Early-access updates only · Unsubscribe anytime · No spam</p>
              </form>
            )}

            <a href={TRY_IT_URL} className="mt-8 inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-white/42 transition hover:text-white">Can’t wait? Try Bobby on the web <ChevronRight className="h-3.5 w-3.5" /></a>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#050706]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <BrandMark />
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-white/55">
            <a href="/privacy" className="transition hover:text-white">Privacy</a>
            <a href="/protocol" className="transition hover:text-white">Bobby Protocol</a>
            <a href="/agentic-world/bobby/history" className="transition hover:text-white">Track record</a>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-white/55">© 2026 Bobby · Refuted before execution</span>
        </div>
      </footer>
    </div>
  );
}
