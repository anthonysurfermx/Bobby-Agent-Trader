// PROPOSAL A — "Ask out loud": the lifestyle/cinema direction for /app.
//
// One idea per screen, full-bleed photography from the App Store plates, a
// single humanist typeface, no mono labels, no comparison tables, no 01/02/03
// section numbering. The record still shows up, but as a sentence a person
// would say out loud — not as a dashboard. Green stops being the wallpaper and
// becomes a signal: it appears only on the live dot and the record link.
//
// Preview route: /app-a
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'framer-motion';
import { isSpanish, t } from '@/lib/companions/i18n';
import { APP_STORE_URL } from '@/lib/app-store';

const DESK_URL = '/desk';
const GREEN = '#5CFF91';

interface DebateActivity { commitmentsCreated?: number; decisionsResolved?: number; wins?: number; losses?: number }
interface ProtocolStats { debateActivity?: DebateActivity }

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/bobby-protocol-stats', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (active && payload) setStats(payload as ProtocolStats); })
      .catch(() => { /* the page is complete without the live line */ });
    return () => { active = false; controller.abort(); };
  }, []);
  return stats;
}

function setLang(next: 'en' | 'es') {
  try { localStorage.setItem('bobby_lang', next); } catch { /* private mode */ }
  window.location.reload();
}

function AppleGlyph({ className = 'h-5 w-[17px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function StoreButton({ light = true }: { light?: boolean }) {
  return (
    <a
      href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
      className={`inline-flex min-h-[54px] items-center justify-center gap-3 whitespace-nowrap rounded-2xl px-7 text-base font-semibold transition ${light ? 'bg-[#F6F3EC] text-[#07090A] hover:bg-white' : 'bg-[#07090A] text-[#F6F3EC] hover:bg-black'}`}
    >
      <AppleGlyph />
      {t('Download on the App Store', 'Descárgala en el App Store')}
    </a>
  );
}

/** One chapter: a photograph and one sentence. Stacked on phones, split on desktop. */
function Chapter({ image, alt, title, body, focus = '50% 50%', reverse = false, children }: {
  image: string; alt: string; title: React.ReactNode; body: string; focus?: string; reverse?: boolean; children?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.6 } };
  return (
    <section className="relative isolate w-full lg:grid lg:min-h-[86vh] lg:grid-cols-2">
      <div className={`relative min-h-[82svh] overflow-hidden lg:min-h-0 ${reverse ? 'lg:order-2' : ''}`}>
        <img src={image} alt={alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: focus }} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#07090A_0%,rgba(7,9,10,.45)_20%,rgba(7,9,10,.25)_48%,rgba(7,9,10,.92)_86%,#07090A_100%)] lg:hidden" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(7,9,10,.35)_0%,transparent_45%)] lg:block" />
        {/* phone inset, when the chapter has one */}
        {children}
        {/* mobile copy sits over the photograph, exactly like the store plates */}
        <div className="absolute inset-x-0 top-14 px-6 lg:hidden">
          <motion.h2 {...reveal} className="max-w-[340px] text-[36px] font-bold leading-[1.02] tracking-[-0.04em]">{title}</motion.h2>
        </div>
        <div className="absolute inset-x-0 bottom-9 px-6 lg:hidden">
          <motion.p {...reveal} className="max-w-[320px] text-[17px] leading-[1.5] text-[#F6F3EC]/80">{body}</motion.p>
        </div>
      </div>
      <div className="hidden items-center bg-[#07090A] px-16 py-24 lg:flex xl:px-24">
        <motion.div {...reveal} className="max-w-xl">
          <h2 className="text-[clamp(2.75rem,3.6vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.045em]">{title}</h2>
          <p className="mt-7 max-w-lg text-xl leading-[1.5] text-[#F6F3EC]/75">{body}</p>
        </motion.div>
      </div>
    </section>
  );
}

export default function BobbyAppLandingA() {
  const stats = useProtocolStats();
  const reduceMotion = useReducedMotion();
  const record = stats?.debateActivity;

  const recordLine = useMemo(() => {
    const written = Number(record?.commitmentsCreated);
    const wrong = Number(record?.losses);
    if (!Number.isFinite(written) || written <= 0) return null;
    const writtenLabel = written.toLocaleString(isSpanish() ? 'es-MX' : 'en-US');
    if (!Number.isFinite(wrong)) return t(`${writtenLabel} calls written down.`, `${writtenLabel} llamadas escritas.`);
    const wrongLabel = wrong.toLocaleString(isSpanish() ? 'es-MX' : 'en-US');
    return t(
      `${writtenLabel} calls written down. ${wrongLabel} of them wrong.`,
      `${writtenLabel} llamadas escritas. ${wrongLabel} de ellas falladas.`,
    );
  }, [record?.commitmentsCreated, record?.losses]);

  const pageTitle = t('Bobby — Ask out loud.', 'Bobby — Dilo en voz alta.');
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);

  const heroReveal = reduceMotion ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7 } };

  return (
    <div className="min-h-screen bg-[#07090A] text-[#F6F3EC] antialiased [font-family:'Schibsted_Grotesk',system-ui,sans-serif] selection:bg-[#5CFF91] selection:text-[#07090A]">
      <Helmet>
        <title>{pageTitle}</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ============ HERO ============ */}
      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <img
          src="/app/ls/ls-voice.webp"
          alt={t('A young woman in a dark bedroom talking to her phone', 'Una chica en un cuarto a oscuras hablándole a su teléfono')}
          className="absolute inset-0 h-full w-full object-cover object-[38%_50%] lg:object-[30%_57%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,10,.86)_0%,rgba(7,9,10,.40)_26%,rgba(7,9,10,.10)_44%,rgba(7,9,10,.80)_80%,#07090A_100%)] lg:hidden" />
        <div className="absolute inset-0 hidden lg:block lg:bg-[linear-gradient(90deg,rgba(7,9,10,.30)_0%,rgba(7,9,10,.08)_22%,rgba(7,9,10,.72)_48%,rgba(7,9,10,.94)_70%,#07090A_100%)]" />
        <div className="absolute inset-0 hidden lg:block lg:bg-[linear-gradient(180deg,rgba(7,9,10,.65)_0%,transparent_24%,transparent_72%,rgba(7,9,10,.55)_100%)]" />

        {/* nav */}
        <header className="absolute inset-x-0 top-0 z-20 flex h-[62px] items-center justify-between px-5 lg:h-[88px] lg:px-14">
          <a href="/app-a" className="flex items-center gap-2.5">
            <img src="/favicon-bobby-v3.png" alt="" className="h-7 w-7 rounded-[9px] object-cover lg:h-8 lg:w-8" />
            <span className="text-[15px] font-bold tracking-[-0.02em] lg:text-[17px]">Bobby</span>
          </a>
          <nav className="hidden items-center gap-8 lg:flex">
            <a href="/protocol" className="text-[15px] font-medium text-[#F6F3EC]/70 transition hover:text-white">Bobby Protocol</a>
            <a href={DESK_URL} className="text-[15px] font-medium text-[#F6F3EC]/70 transition hover:text-white">{t('Web app', 'Web app')}</a>
          </nav>
          <div className="flex items-center gap-3 lg:gap-6">
            <button type="button" onClick={() => setLang(isSpanish() ? 'en' : 'es')} className="min-h-11 px-1 text-[13px] font-semibold text-[#F6F3EC]/60 transition hover:text-white lg:text-[15px]">
              {isSpanish() ? 'EN' : 'ES'}
            </button>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-full bg-[#F6F3EC] px-4 text-[13px] font-semibold text-[#07090A] transition hover:bg-white lg:h-11 lg:px-6 lg:text-[15px]">
              {t('Get the app', 'Descárgala')}
            </a>
          </div>
        </header>

        {/* headline sits at the top, subject at the bottom — the store-plate composition */}
        <motion.div {...heroReveal} className="absolute inset-x-0 top-[96px] z-10 px-6 lg:left-[52%] lg:right-auto lg:top-[210px] lg:w-[470px] lg:px-0">
          <div className="mb-3.5 text-[13px] font-semibold text-[#F6F3EC]/70 lg:mb-5 lg:text-[14px]">{t('Bobby for iPhone', 'Bobby para iPhone')}</div>
          <h1 className="text-[clamp(3.25rem,13vw,3.5rem)] font-bold leading-[0.94] tracking-[-0.045em] lg:text-[96px] lg:leading-[0.90] lg:tracking-[-0.05em]">
            {t('Ask out', 'Dilo en')}<br />{t('loud.', 'voz alta.')}
          </h1>
          <p className="mt-[18px] max-w-[300px] text-[17px] leading-[1.45] text-[#F6F3EC]/80 lg:mt-7 lg:max-w-none lg:text-xl">
            {t(
              "Bitcoin, Nvidia, gold, 600 more. Talk to Bobby the way you'd talk to the one friend who actually reads the charts — and who is allowed to tell you no.",
              'Bitcoin, Nvidia, oro y 600 más. Háblale a Bobby como le hablarías al único amigo que sí lee las gráficas — y que tiene permiso de decirte que no.',
            )}
          </p>
          <div className="mt-8 hidden items-center gap-4 lg:flex">
            <StoreButton />
            <a href={DESK_URL} className="inline-flex min-h-[54px] items-center px-2 text-[17px] font-medium text-[#F6F3EC]/78 transition hover:text-white">
              {t('Or try it in your browser', 'O pruébala en tu navegador')}
            </a>
          </div>
        </motion.div>

        {/* mobile CTA, pinned low */}
        <div className="absolute inset-x-0 bottom-8 z-10 flex flex-col gap-3 px-6 lg:hidden">
          <StoreButton />
          <a href={DESK_URL} className="flex min-h-11 items-center justify-center text-[15px] font-medium text-[#F6F3EC]/78">
            {t('Or try it in your browser', 'O pruébala en tu navegador')}
          </a>
        </div>

        {recordLine && (
          <div className="absolute inset-x-14 bottom-8 z-10 hidden items-center justify-between text-sm text-[#F6F3EC]/50 lg:flex">
            <span className="flex items-center gap-2.5 font-medium text-[#F6F3EC]/78">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: GREEN }} />
              {recordLine}
            </span>
            <span>{t('Analysis, never advice.', 'Análisis, nunca asesoría.')}</span>
          </div>
        )}
      </section>

      {/* ============ CHAPTERS ============ */}
      <Chapter
        image="/app/ls/ls-street.webp"
        alt={t('Two friends on a street at night', 'Dos amigos en la calle de noche')}
        focus="42% 45%"
        title={<>{t('Your group chat', 'Tu grupo de chat')}<br />{t('is not a strategy.', 'no es estrategia.')}</>}
        body={t(
          'Everyone is suddenly an analyst. Bobby is the one who argues back — out loud, in front of you, before your money is in.',
          'De repente todos son analistas. Bobby es el que discute de vuelta — en voz alta, frente a ti, antes de que entre tu dinero.',
        )}
      />

      <Chapter
        image="/app/ls/ls-night.webp"
        alt={t('A wet city street at night', 'Una calle mojada de noche')}
        focus="50% 40%"
        reverse
        title={<>{t('Not today', 'Hoy no')}<br />{t('is a real answer.', 'es una respuesta.')}</>}
        body={t(
          'Three agents pull the idea apart. If nothing survives, Bobby says so and you keep your money.',
          'Tres agentes destrozan la idea. Si nada sobrevive, Bobby te lo dice y te quedas con tu dinero.',
        )}
      >
        <div className="absolute bottom-7 right-6 w-[46%] max-w-[200px] overflow-hidden rounded-[26px] border border-white/15 shadow-[0_26px_60px_rgba(0,0,0,.6)] lg:bottom-14 lg:right-12 lg:w-[240px] lg:max-w-none">
          <img src="/app/shot-notrade.webp" alt={t('A real NO TRADE verdict on Bitcoin', 'Un NO TRADE real sobre Bitcoin')} loading="lazy" className="block w-full" />
        </div>
      </Chapter>

      <Chapter
        image="/app/ls/ls-hall.webp"
        alt={t('A person walking down a long dim corridor', 'Una persona caminando por un pasillo en penumbra')}
        focus="35% 50%"
        title={<>{t('It writes it down', 'Lo escribe antes')}<br />{t('before it happens.', 'de que pase.')}</>}
        body={t(
          'Every call is saved the moment it is made — then the market decides who was right. The misses stay on the page too.',
          'Cada llamada se guarda en el momento en que se hace — después el mercado decide quién tenía razón. Los fallos también se quedan ahí.',
        )}
      />

      {/* the record, as a sentence */}
      {recordLine && (
        <section id="record" className="scroll-mt-16 border-y border-white/10 bg-[#0B0E0F] px-6 py-16 lg:px-14 lg:py-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <p className="flex items-start gap-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.035em] lg:text-[40px]">
              <span className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full lg:mt-5" style={{ background: GREEN }} />
              {recordLine}
            </p>
            <a href="/protocol" className="shrink-0 text-[17px] font-semibold text-[#5CFF91] underline decoration-[#5CFF91]/40 underline-offset-[6px] transition hover:decoration-[#5CFF91]">
              {t('Read them all', 'Léelas todas')}
            </a>
          </div>
        </section>
      )}

      <Chapter
        image="/app/ls/ls-floor.webp"
        alt={t('A young man sitting on the floor smiling at his phone', 'Un chico sentado en el piso sonriéndole a su teléfono')}
        focus="22% 45%"
        reverse
        title={<>{t('Discipline builds', 'La disciplina crea')}<br />{t('something you see.', 'algo que se ve.')}</>}
        body={t(
          'Read the whole thing. Take a no for an answer. Come back tomorrow. That is what grows your island — never how much you trade.',
          'Lee el análisis completo. Acepta un no. Vuelve mañana. Eso es lo que hace crecer tu isla — nunca cuánto operas.',
        )}
      >
        <div className="absolute bottom-24 right-6 w-[42%] max-w-[180px] overflow-hidden rounded-[24px] border border-white/15 shadow-[0_24px_56px_rgba(0,0,0,.6)] lg:bottom-14 lg:right-12 lg:w-[220px] lg:max-w-none">
          <img src="/app/shot-world.webp" alt={t('Trader Land, the island that grows with each good decision', 'Trader Land, la isla que crece con cada buena decisión')} loading="lazy" className="block w-full" />
        </div>
      </Chapter>

      {/* ============ SQUAD ============ */}
      <section id="squad" className="scroll-mt-16 bg-[#0B0E0F] px-6 py-16 lg:px-14 lg:py-28">
        <div className="mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[38px] font-bold leading-[1.02] tracking-[-0.04em] lg:text-[56px]">
              {t('Pick who', 'Elige quién')}<br />{t('talks to you.', 'te habla.')}
            </h2>
            <p className="mt-4 max-w-md text-[17px] leading-[1.5] text-[#F6F3EC]/70 lg:text-xl">
              {t('Calm, blunt or full trading-desk. Same numbers underneath, your kind of voice on top.',
                'Tranquilo, directo o técnico de mesa. Los mismos números abajo, tu tipo de voz arriba.')}
            </p>
          </div>
          <div className="flex gap-3">
            {['byte', 'kora', 'zip'].map((id) => (
              <div key={id} className="grid h-[92px] flex-1 place-items-center rounded-[20px] border border-white/10 bg-white/[0.05] lg:h-28 lg:w-28 lg:flex-none">
                <img src={`/mascots/${id}.webp`} alt={id} loading="lazy" className="h-[66px] w-[66px] object-contain lg:h-20 lg:w-20" />
              </div>
            ))}
            <div className="grid h-[92px] w-[58px] place-items-center rounded-[20px] border border-white/10 bg-white/[0.03] text-[15px] font-semibold text-[#F6F3EC]/60 lg:h-28 lg:w-28">+14</div>
          </div>
        </div>
      </section>

      {/* ============ CLOSE ============ */}
      <section className="bg-[#07090A] px-6 py-16 lg:px-14 lg:py-28">
        <div className="mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[46px] font-bold leading-[0.98] tracking-[-0.045em] lg:text-[76px]">
              {t("Don't guess.", 'No adivines.')}<br />{t('Ask Bobby.', 'Abre Bobby.')}
            </h2>
            <p className="mt-4 max-w-sm text-[17px] leading-[1.5] text-[#F6F3EC]/70 lg:text-xl">
              {t('Free on iPhone. The desk is open on the web too.', 'Gratis en iPhone. El desk también está abierto en la web.')}
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:w-[360px]">
            <StoreButton />
            {/* the nav is deliberately bare, so the footer is where Protocol stays reachable on phones */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-[13px] text-[#F6F3EC]/45">
              <a href={DESK_URL} className="font-medium text-[#F6F3EC]/65 transition hover:text-white">{t('Open the desk on the web', 'Abre el desk en la web')}</a>
              <a href="/protocol" className="font-medium text-[#F6F3EC]/65 transition hover:text-white">Bobby Protocol</a>
              <span className="ml-auto">{t('Analysis, never advice.', 'Análisis, nunca asesoría.')}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
