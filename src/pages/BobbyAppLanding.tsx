import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Menu, Mic, Sparkles, ShieldCheck, X } from 'lucide-react';

/**
 * Bobby (the app) landing.
 *
 * Companion to BobbyProtocolLanding: this page speaks to a person who already
 * asks an AI about their assets. The protocol page speaks to developers and
 * agents — institutional register, no color. This one carries the aura: violet
 * next to the Base blue, phones, motion. They never share a screen, which is
 * what made the original single page unreadable.
 * Copy spec: docs/messaging/landing-copy-en.md
 */

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
  fetchedAt?: string;
  debateActivity?: DebateActivity;
}

const formatNumber = (value: unknown, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : fallback;
};

// Audit Base r4: a percentage over a tiny sample reads as skill when it is
// noise. Below this many resolved calls we show raw counts, never a rate.
const WIN_RATE_MIN_SAMPLE = 20;

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);

  useEffect(() => {
    let isActive = true;
    const controllers = new Set<AbortController>();

    const refresh = async () => {
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch('/api/bobby-protocol-stats', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as ProtocolStats;
        if (isActive) setStats(payload);
      } catch {
        // The page stays readable as a product overview when the API is unreachable.
      } finally {
        controllers.delete(controller);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      isActive = false;
      window.clearInterval(interval);
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  return stats;
}

function BrandMark() {
  return (
    <a href="/app" className="flex items-center gap-3 text-white" aria-label="Bobby home">
      <span className="relative grid h-10 w-10 place-items-center rounded-[14px] border border-[#8fb6ff]/45 bg-[radial-gradient(circle_at_30%_20%,#c9a8ff_0%,#7c52ff_26%,#2670ff_62%,#0035b8_100%)] text-white shadow-[0_0_30px_rgba(124,82,255,.45)]">
        <span className="pointer-events-none absolute -inset-1 rounded-[17px] border border-[#7c52ff]/30 rotate-[-18deg]" />
        <span className="pointer-events-none absolute -right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#e6dbff] shadow-[0_0_8px_#e6dbff]" />
        <span className="relative text-[21px] font-black leading-none tracking-[-0.12em]">B</span>
      </span>
      <span className="text-[15px] font-extrabold tracking-[-0.045em]">Bobby</span>
    </a>
  );
}

function PhoneFrame({ src, alt, glow = false, eager = false }: { src: string; alt: string; glow?: boolean; eager?: boolean }) {
  return (
    <div
      className={`relative rounded-[2.6rem] border border-white/15 bg-[#0a0a0f] p-[7px] ${
        glow ? 'shadow-[0_40px_120px_rgba(124,82,255,0.45)]' : 'shadow-[0_30px_80px_rgba(0,0,0,0.6)]'
      }`}
    >
      <div className="pointer-events-none absolute left-1/2 top-[14px] z-10 h-[18px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        className="w-full rounded-[2.2rem]"
      />
    </div>
  );
}

const MARQUEE = [
  'Ask out loud',
  'Get refuted',
  'Then decide',
  'Every call on the record',
  'Wins and misses, same page',
  'It can tell you no',
];

// Aura presets shipped in the iOS build — the app's own vocabulary.
const AURAS: Array<[string, string]> = [
  ['azul voltaje', '#2f6bff'],
  ['violeta after midnight', '#7c52ff'],
  ['verde hacker', '#22c67a'],
  ['dorado golden hour', '#e0a828'],
  ['rojo sin miedo', '#e0503c'],
];

const ERAS: Array<[string, string, string]> = [
  ['Who answers', 'A model', 'A procedure'],
  ['When it is recorded', 'Never', 'Before the outcome'],
  ['If it is wrong', 'Nothing happens', 'It stays on the record'],
  ['What you get', 'An opinion', 'A verdict with an invalidation price'],
  ['Can it be audited', 'No', 'Yes'],
];

const CAPABILITIES = [
  {
    icon: Mic,
    title: 'A voice, not a chatbot',
    text: 'Say the ticker out loud. BTC, NVDA, gold. Bobby answers in the voice you gave it.',
    tint: 'rgba(47,107,255,.22)',
    ring: 'rgba(47,107,255,.55)',
  },
  {
    icon: Check,
    title: 'Every call on the record',
    text: 'Written down before anyone knows how it went. The wins and the misses land on the same page.',
    tint: 'rgba(124,82,255,.22)',
    ring: 'rgba(124,82,255,.55)',
  },
  {
    icon: ShieldCheck,
    title: 'It can tell you no',
    text: 'Most days the honest answer is that there is no trade here. Bobby will actually say it.',
    tint: 'rgba(34,198,122,.2)',
    ring: 'rgba(34,198,122,.5)',
  },
];

const STAGES: Array<[string, string, string]> = [
  ['01', 'Case', 'The idea gets stated properly: what is expected, why, over what horizon.'],
  ['02', 'Refutation', 'A second system goes at it — the data that breaks it, the time it already failed, the scenario nobody thought about.'],
  ['03', 'Risk gate', 'Fixed rules can kill the trade even when the analysis looks great. No appeal.'],
  ['04', 'Verdict', 'What to do, the price where you were wrong, and the condition that cancels the whole thing.'],
];

const LIMITS = [
  'It holds no funds and connects to no accounts.',
  'It places no orders. Execution is yours.',
  'It is not investment advice and promises no returns.',
  'A favorable verdict is not a buy recommendation. It is the record of an idea that survived its own refutation.',
];

const PAGE_TITLE = 'Bobby — Every call on the record';
const TRY_IT_URL = '/agentic-world/bobby';

export default function BobbyAppLanding() {
  const stats = useProtocolStats();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAura, setActiveAura] = useState(1);

  // Helmet does not reliably win over the static <title> in index.html on a cold
  // load of this route, so the title is also set imperatively. Both are kept:
  // Helmet for SSR/meta, this for the browser tab.
  useEffect(() => {
    document.title = PAGE_TITLE;
  }, []);

  const record = stats?.debateActivity;
  const resolved = record?.decisionsResolved;
  const published = record?.commitmentsCreated;
  const numericResolved = Number(resolved);
  const numericWinRate = Number(record?.winRate);
  const hasResolvedCalls = Number.isFinite(numericResolved) && numericResolved > 0;
  const hasOutcomeCounts =
    record?.wins !== undefined && record?.wins !== null &&
    record?.losses !== undefined && record?.losses !== null &&
    Number.isFinite(Number(record.wins)) && Number.isFinite(Number(record.losses));
  const hitRate = !hasResolvedCalls
    ? '—'
    : numericResolved < WIN_RATE_MIN_SAMPLE
      ? hasOutcomeCounts
        ? `${formatNumber(record?.wins)}W / ${formatNumber(record?.losses)}L`
        : `n=${formatNumber(numericResolved)}`
      : Number.isFinite(numericWinRate)
        ? `${numericWinRate.toFixed(1)}%`
        : '—';

  const auraColor = AURAS[activeAura][1];

  const navItems: Array<[string, string]> = [
    ['The two eras', '#eras'],
    ['Your aura', '#aura'],
    ['The record', '#record'],
    ['Protocol', '/protocol'],
  ];

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-white antialiased">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta
          name="description"
          content="Asking an AI about your asset is no longer an edge. Bobby challenges the answer and puts the call on the record before the market settles it."
        />
      </Helmet>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="font-mono text-xs uppercase tracking-[0.15em] text-white/55 transition hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden md:flex">
            <a
              href={TRY_IT_URL}
              className="rounded-lg bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#7c52ff] hover:text-white"
            >
              Try it now
            </a>
          </div>
          <button onClick={() => setMenuOpen((open) => !open)} className="rounded-full p-2 md:hidden" aria-label="Toggle navigation">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-white/10 bg-[#0a0a0a] px-5 py-4 md:hidden">
            {navItems.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block py-3 font-mono text-xs uppercase tracking-[0.15em] text-white/70"
              >
                {label}
              </a>
            ))}
            <a
              href={TRY_IT_URL}
              className="mt-2 block rounded-lg bg-white px-5 py-3 text-center font-mono text-xs font-bold uppercase tracking-[0.15em] text-black"
            >
              Try it now
            </a>
          </nav>
        )}
      </header>

      <main className="relative">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden bg-[#050505]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,rgba(124,82,255,.34),transparent_46%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_78%,rgba(0,82,255,.22),transparent_44%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#050505]" />

          <div className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-20">
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
                <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#7c52ff]/45 bg-[#7c52ff]/10 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#c3aaff]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7c52ff]" />
                  Coming soon to iPhone
                </span>
                <h1 className="text-[clamp(2.1rem,4.4vw,4rem)] font-extrabold leading-[.98] tracking-[-0.075em]">
                  Asking an AI about your asset<br />
                  <span className="text-white/45">is no longer an</span>{' '}
                  <span className="bg-[linear-gradient(92deg,#7c52ff_0%,#2f6bff_100%)] bg-clip-text text-transparent">edge.</span>
                </h1>
                <p className="mt-7 max-w-xl text-lg leading-8 text-white/60">
                  Everyone has that answer now, from the same models, in the same confident voice. Bobby gives you what
                  comes after it: the answer gets challenged, and the call goes on the record before the market settles it.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={TRY_IT_URL}
                    className="group inline-flex items-center justify-center gap-3 rounded-lg bg-white px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#7c52ff] hover:text-white"
                  >
                    Try it on the web <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </a>
                  <span className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white/45">
                    TestFlight soon
                  </span>
                </div>
                <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
                  Say the ticker out loud. BTC, NVDA, gold. It answers back.
                </p>
              </motion.div>

              <div className="relative mx-auto flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 26, rotate: -7 }}
                  animate={{ opacity: 1, y: 0, rotate: -7 }}
                  transition={{ delay: 0.15, duration: 0.6 }}
                  className="hidden -mr-10 mt-16 w-[180px] shrink-0 md:block"
                >
                  <PhoneFrame src="/app/iphone-forge.png" alt="Describe your agent's aura — Bobby iOS onboarding" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="z-10 w-[230px] shrink-0 md:w-[250px]"
                >
                  <PhoneFrame src="/app/iphone-desk.png" alt="Bobby Live Desk with a forged violet aura" glow eager />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 26, rotate: 7 }}
                  animate={{ opacity: 1, y: 0, rotate: 7 }}
                  transition={{ delay: 0.25, duration: 0.6 }}
                  className="hidden -ml-10 mt-20 w-[180px] shrink-0 md:block"
                >
                  <PhoneFrame src="/app/iphone-aura.png" alt="Aura forged — the interface takes your energy" />
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Marquee ─────────────────────────────────────────────── */}
        <div className="overflow-hidden border-y border-white/10 bg-[#0a0a14] py-4">
          <div className="flex gap-10 whitespace-nowrap animate-marquee font-mono text-xs uppercase tracking-[0.18em] text-white/45">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 gap-10">
                {MARQUEE.map((label, index) => (
                  <span key={`${dup}-${index}`} className={index % 3 === 1 ? 'text-[#c3aaff]' : undefined}>
                    {label} <span className="text-white/20">/</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── 01 The two eras ─────────────────────────────────────── */}
        <section id="eras" className="relative overflow-hidden bg-[#08080a]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,82,255,.14),transparent_46%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#c3aaff]">01 / The two eras</div>
                <h2 className="max-w-2xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">
                  The first era was asking.<br />
                  <span className="text-white/45">The second is verifying.</span>
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">
                Two years ago, a real read on an asset in thirty seconds was a privilege. Today it is free, on any phone.
                Analysis stopped being scarce. What is scarce now is knowing whether the answer was any good.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0b0b12]/85 backdrop-blur-xl"
            >
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th scope="col" className="w-[28%] px-6 py-5" />
                    <th scope="col" className="w-[30%] px-6 py-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/30">
                      Asking
                    </th>
                    <th scope="col" className="px-6 py-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#c3aaff]">
                      Verifying
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ERAS.map(([key, asking, verifying]) => (
                    <tr key={key} className="border-b border-white/5 last:border-b-0">
                      <td className="px-6 py-5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{key}</td>
                      <td className="px-6 py-5 text-sm text-white/35">{asking}</td>
                      <td className="px-6 py-5 text-sm font-medium text-white">{verifying}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>

            <p className="mt-8 max-w-2xl border-l-2 border-[#7c52ff]/60 pl-5 text-sm leading-6 text-white/50">
              Bobby runs on the same models everyone else uses. The difference is not the model — it is the procedure
              around it.
            </p>
          </div>
        </section>

        {/* ── 02 Your aura ────────────────────────────────────────── */}
        <section id="aura" className="relative overflow-hidden border-y border-white/10 bg-[#050505]">
          <div
            className="pointer-events-none absolute inset-0 transition-colors duration-700"
            style={{ background: `radial-gradient(circle at 22% 42%, ${auraColor}38, transparent 45%)` }}
          />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="grid items-center gap-14 lg:grid-cols-2">
              <div>
                <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#c3aaff]">02 / Your aura</div>
                <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">
                  It looks like you,<br />
                  <span className="text-white/45">not like a bank app.</span>
                </h2>
                <p className="mt-6 max-w-md text-base leading-7 text-white/55">
                  Describe your agent in your own words and the orb absorbs the color live. Hold to forge, and the whole
                  interface takes your energy. The verdicts stay serious — the skin is yours.
                </p>

                <div className="mt-8 flex flex-wrap gap-2">
                  {AURAS.map(([name, color], index) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setActiveAura(index)}
                      aria-pressed={index === activeAura}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                        index === activeAura
                          ? 'border-white/40 bg-white/10 text-white'
                          : 'border-white/10 bg-white/[0.03] text-white/45 hover:border-white/25 hover:text-white/80'
                      }`}
                      style={index === activeAura ? { boxShadow: `0 0 24px ${color}55` } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                      {name}
                    </button>
                  ))}
                </div>
                <p className="mt-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/30">
                  <Sparkles className="h-3.5 w-3.5" /> Tap one — the section takes the color
                </p>
              </div>

              <div className="relative flex min-h-[260px] items-center justify-center">
                <div
                  className="absolute h-56 w-56 rounded-full blur-[70px] transition-colors duration-700 md:h-72 md:w-72"
                  style={{ background: auraColor, opacity: 0.55 }}
                />
                <motion.div
                  key={activeAura}
                  initial={{ scale: 0.92, opacity: 0.7 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="relative h-40 w-40 rounded-full md:h-52 md:w-52"
                  style={{
                    background: `radial-gradient(circle at 34% 28%, #ffffff 0%, ${auraColor} 42%, #05050a 100%)`,
                    boxShadow: `0 0 90px ${auraColor}80, inset 0 0 40px rgba(255,255,255,.25)`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── 03 What you get ─────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#08080a]">
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#c3aaff]">03 / What you get</div>
              <h2 className="max-w-2xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">
                Three things a chat window<br />
                <span className="text-white/45">will never give you.</span>
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, text, tint, ring }, index) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.07 }}
                  className="group relative flex min-h-[250px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f16]/85 p-7 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/20"
                >
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-60 blur-[50px] transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: tint }}
                  />
                  <span
                    className="relative mb-8 grid h-10 w-10 place-items-center rounded-xl text-white"
                    style={{ background: tint, border: `1px solid ${ring}` }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="relative text-xl font-bold leading-tight tracking-[-0.04em] text-white/95">{title}</h3>
                  <p className="relative mt-4 text-sm leading-6 text-white/45">{text}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 04 How a call is made ───────────────────────────────── */}
        <section id="procedure" className="relative overflow-hidden border-y border-white/10 bg-[#050505]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(47,107,255,.18),transparent_44%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#c3aaff]">04 / How a call is made</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">
                Four stages.<br />
                <span className="text-white/45">The order is the guarantee.</span>
              </h2>
            </div>
            <div className="border-t border-white/10">
              {STAGES.map(([num, title, text], index) => (
                <motion.div
                  key={num}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.06 }}
                  className="grid gap-4 border-b border-white/10 py-7 transition-colors hover:bg-white/[0.02] md:grid-cols-[5rem_16rem_1fr] md:gap-8"
                >
                  <span className="font-mono text-sm text-[#c3aaff]">{num}</span>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-white">{title}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-white/45">{text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 05 The record ───────────────────────────────────────── */}
        <section id="record" className="relative overflow-hidden bg-[#08080a]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(124,82,255,.16),transparent_42%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-12">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#c3aaff]">05 / The record</div>
              <h2 className="max-w-3xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">
                {formatNumber(published)} calls published<br />
                <span className="text-white/45">before anyone knew the outcome.</span>
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Resolved', formatNumber(resolved), 'Calls with a known outcome', 'rgba(255,255,255,.08)'],
                ['Right', formatNumber(record?.wins), 'Published the same way', 'rgba(34,198,122,.18)'],
                ['Wrong', formatNumber(record?.losses), 'Published the same way', 'rgba(224,80,60,.18)'],
                ['Hit rate', hitRate, 'Flat outcomes counted in', 'rgba(124,82,255,.2)'],
              ].map(([label, value, detail, tint]) => (
                <div key={label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f16]/80 p-6 backdrop-blur-xl">
                  <div
                    className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full blur-[40px]"
                    style={{ background: tint }}
                  />
                  <div className="relative mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
                  <div className="relative font-mono text-4xl font-bold tracking-[-0.05em] text-white">{value}</div>
                  <div className="relative mt-2 text-xs text-white/35">{detail}</div>
                </div>
              ))}
            </div>

            <p className="mt-8 max-w-3xl border-l-2 border-white/15 pl-5 text-sm leading-6 text-white/45">
              Hit rate is computed over the {formatNumber(resolved)} resolved calls and counts flat outcomes
              ({formatNumber(record?.breakEven)}) in the denominator. The {formatNumber(record?.pending)} pending calls
              are not dropped from the count. Misses are published exactly like the wins — that is the whole point.
            </p>

            <a
              href="/agentic-world/bobby/history"
              className="group mt-10 inline-flex items-center gap-3 rounded-lg border border-white/15 bg-white/[0.06] px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:bg-white/15"
            >
              See the record <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </div>
        </section>

        {/* ── 06 What it doesn't do ───────────────────────────────── */}
        <section className="relative overflow-hidden border-y border-white/10 bg-[#050505]">
          <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="mb-10">
              <div className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#c3aaff]">06 / What it does not do</div>
              <h2 className="text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-6xl">
                Bobby never touches<br />
                <span className="text-white/45">your money.</span>
              </h2>
            </div>
            <ul className="border-t border-white/10">
              {LIMITS.map((limit) => (
                <li key={limit} className="grid grid-cols-[3rem_1fr] gap-4 border-b border-white/10 py-5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e0503c]">No</span>
                  <span className="max-w-3xl text-sm leading-6 text-white/60">{limit}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Closing ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#050505]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(124,82,255,.24),transparent_52%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-24 text-center lg:px-8 lg:py-32">
            <p className="mx-auto max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-[-0.06em] md:text-5xl">
              Refuted before execution.<br />
              <span className="text-white/45">Published before the outcome.</span>
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={TRY_IT_URL}
                className="group inline-flex items-center justify-center gap-3 rounded-lg bg-white px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#7c52ff] hover:text-white"
              >
                Try it on the web <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <a
                href="/agentic-world/bobby/history"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-8 py-4 font-mono text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:bg-white/15"
              >
                See the record
              </a>
            </div>
            <a
              href="/protocol"
              className="mt-12 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-white/40 transition hover:text-white"
            >
              Every call Bobby makes is recorded by Bobby Protocol <span aria-hidden>›</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#050505]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 font-mono text-[11px] uppercase tracking-[0.15em] text-white/35 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <span>© 2026 Bobby Protocol</span>
          <span>Refuted before execution. Published before the outcome.</span>
        </div>
      </footer>
    </div>
  );
}
