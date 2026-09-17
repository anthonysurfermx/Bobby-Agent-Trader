// PROPOSAL B — "Don't do this alone": the colour-and-character direction for /app.
//
// Breaks the all-dark monolith into cream / deep green / gold blocks, puts the
// companion on stage instead of a glowing orb, and answers the "day to day"
// brief literally with "A week with Bobby". Screens sit in thick black frames
// with a solid drop shadow — poster, not terminal.
//
// Preview route: /app-b
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'framer-motion';
import { isSpanish, t } from '@/lib/companions/i18n';
import { APP_STORE_URL } from '@/lib/app-store';

const DESK_URL = '/desk';

const CREAM = '#F4EDE1';
const INK = '#14120F';
const FOREST = '#0D3325';
const GOLD = '#F5C542';

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
      .catch(() => { /* the page is complete without the live numbers */ });
    return () => { active = false; controller.abort(); };
  }, []);
  return stats;
}

function setLang(next: 'en' | 'es') {
  try { localStorage.setItem('bobby_lang', next); } catch { /* private mode */ }
  window.location.reload();
}

function AppleGlyph({ className = 'h-5 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

/** A screen in a thick frame with a hard offset shadow — the poster treatment. */
function FramedShot({ src, alt, className = '', shadow = '14px 16px 0 rgba(20,18,15,.18)' }: { src: string; alt: string; className?: string; shadow?: string }) {
  return (
    <div className={`overflow-hidden rounded-[28px] border-[3px] lg:rounded-[34px] lg:border-4 ${className}`} style={{ borderColor: INK, boxShadow: shadow }}>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  );
}

const headingFont = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;

export default function BobbyAppLandingB() {
  const stats = useProtocolStats();
  const reduceMotion = useReducedMotion();
  const record = stats?.debateActivity;
  const locale = isSpanish() ? 'es-MX' : 'en-US';

  const numbers = useMemo(() => {
    const written = Number(record?.commitmentsCreated);
    if (!Number.isFinite(written) || written <= 0) return null;
    const settled = Number(record?.decisionsResolved);
    const wrong = Number(record?.losses);
    return {
      written: written.toLocaleString(locale),
      settled: Number.isFinite(settled) ? settled.toLocaleString(locale) : null,
      wrong: Number.isFinite(wrong) ? wrong.toLocaleString(locale) : null,
    };
  }, [locale, record?.commitmentsCreated, record?.decisionsResolved, record?.losses]);

  const pageTitle = t("Bobby — Don't do this alone.", 'Bobby — No lo hagas solo.');
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);

  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 22 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.25 }, transition: { duration: 0.55 } };

  const week: Array<[string, string]> = [
    [t('MON', 'LUN'), t('You ask about Nvidia on the bus', 'Preguntas por Nvidia en el camión')],
    [t('TUE', 'MAR'), t('Bobby says no. You keep the money', 'Bobby dice que no. Te quedas con el dinero')],
    [t('WED', 'MIÉ'), t('You read the whole thing. Level up', 'Lees el análisis completo. Subes de nivel')],
    [t('THU', 'JUE'), t('Nothing happens. That is also fine', 'No pasa nada. Eso también está bien')],
    [t('FRI', 'VIE'), t("Tuesday's call resolves. On the record", 'La llamada del martes se resuelve. Queda en el registro')],
  ];

  return (
    <div className="min-h-screen antialiased" style={{ background: CREAM, color: INK, fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
      <Helmet>
        <title>{pageTitle}</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ============ 1 · HERO ============ */}
      <section className="relative overflow-hidden">
        <header className="flex h-[62px] items-center justify-between px-5 lg:h-[88px] lg:px-16">
          <a href="/app-b" className="flex items-center gap-2.5">
            <img src="/favicon-bobby-v3.png" alt="" className="h-7 w-7 rounded-[9px] object-cover lg:h-8 lg:w-8" />
            <span className="text-[17px] font-extrabold tracking-[-0.02em] lg:text-[19px]" style={headingFont}>Bobby</span>
          </a>
          <nav className="hidden items-center gap-8 lg:flex">
            <a href="#week" className="text-[15px] font-medium text-[#14120F]/70 transition hover:text-[#0D3325]">{t('A week with Bobby', 'Una semana con Bobby')}</a>
            <a href="#record" className="text-[15px] font-medium text-[#14120F]/70 transition hover:text-[#0D3325]">{t('The record', 'El historial')}</a>
          </nav>
          <div className="flex items-center gap-3 lg:gap-6">
            <button type="button" onClick={() => setLang(isSpanish() ? 'en' : 'es')} className="min-h-11 px-1 text-[13px] font-semibold text-[#14120F]/60 transition hover:text-[#14120F] lg:text-[15px]">
              {isSpanish() ? 'EN' : 'ES'}
            </button>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition hover:opacity-85 lg:h-11 lg:px-6 lg:text-[15px]" style={{ background: INK, color: CREAM }}>
              {t('Get the app', 'Descárgala')}
            </a>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-8 px-6 pb-0 pt-5 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-6 lg:px-16 lg:pb-16 lg:pt-10">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-[clamp(3.25rem,13.5vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.035em] lg:text-[clamp(4.5rem,6.8vw,6.75rem)] lg:leading-[0.88] lg:tracking-[-0.045em]" style={headingFont}>
              {t("Don't do", 'No lo')}<br />{t('this alone.', 'hagas solo.')}
            </h1>
            <p className="mt-[18px] max-w-[330px] text-[17px] leading-[1.5] text-[#14120F]/72 lg:mt-7 lg:max-w-[480px] lg:text-[21px]">
              {t('Bobby is a tiny trading desk in your pocket. Three agents argue about your asset — you get the one answer that survived the fight. Even when that answer is ',
                'Bobby es una mesa de trading diminuta en tu bolsillo. Tres agentes discuten sobre tu activo — tú recibes la única respuesta que sobrevivió. Incluso cuando esa respuesta es ')}
              <span className="rounded-md px-1.5 py-0.5 font-semibold" style={{ background: GOLD, color: INK }}>{t("don't.", 'no.')}</span>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-10">
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-full px-8 text-base font-semibold transition hover:opacity-90 lg:min-h-[60px] lg:text-[17px]" style={{ background: INK, color: CREAM }}>
                <AppleGlyph />
                {t('Free on iPhone', 'Gratis en iPhone')}
              </a>
              <a href={DESK_URL} className="inline-flex min-h-[54px] items-center justify-center rounded-full border-[1.5px] px-7 text-base font-semibold transition hover:bg-[#14120F]/5 lg:min-h-[60px] lg:text-[17px]" style={{ borderColor: 'rgba(20,18,15,.24)', color: INK }}>
                {t('Try it in the browser', 'Pruébala en el navegador')}
              </a>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-2 lg:mt-9">
              {['BTC', 'NVDA', t('Gold', 'Oro'), 'SOL'].map((chip) => (
                <span key={chip} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: 'rgba(20,18,15,.06)' }}>{chip}</span>
              ))}
              <span className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: FOREST, color: CREAM }}>{t('+600 more', '+600 más')}</span>
            </div>
          </motion.div>

          {/* the companion on stage */}
          <div className="relative mt-4 h-[360px] lg:mt-0 lg:h-[620px]">
            <div className="absolute bottom-[-14%] left-[-12%] h-[min(78vw,300px)] w-[min(78vw,300px)] rounded-full lg:hidden" style={{ background: GOLD }} />
            <div className="absolute right-10 top-8 hidden h-[560px] w-[560px] rounded-full lg:block" style={{ background: GOLD }} />
            <div
              className="absolute bottom-10 left-[6%] h-[172px] w-[172px] -rotate-3 overflow-hidden rounded-[30px] border-[3px] lg:bottom-auto lg:left-auto lg:right-[250px] lg:top-[140px] lg:h-[288px] lg:w-[288px] lg:rounded-[40px] lg:border-4"
              style={{ borderColor: INK, boxShadow: '-10px 12px 0 rgba(20,18,15,.18)' }}
            >
              <img src="/mascots/byte.webp" alt={t('Byte, one of Bobby’s companions', 'Byte, uno de los acompañantes de Bobby')} className="h-full w-full object-cover" />
            </div>
            <FramedShot
              src="/app/shot-desk.webp"
              alt={t('The Bobby desk on iPhone', 'El desk de Bobby en iPhone')}
              className="absolute bottom-8 right-2 w-[46%] max-w-[190px] lg:bottom-auto lg:right-14 lg:top-10 lg:w-[268px] lg:max-w-none"
            />
          </div>
        </div>
      </section>

      {/* ============ 2 · ASK ============ */}
      <section className="relative overflow-hidden px-6 pb-0 pt-14 lg:px-16 lg:pt-24" style={{ background: FOREST, color: CREAM }}>
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-2 lg:items-end">
          <motion.div {...reveal} className="lg:pb-24">
            <h2 className="text-[44px] font-extrabold leading-[0.94] tracking-[-0.035em] lg:text-[72px]" style={headingFont}>
              {t('Ask out loud.', 'Dilo en voz alta.')}<br />{t('Any market.', 'Cualquier mercado.')}
            </h2>
            <p className="mt-4 max-w-[330px] text-[17px] leading-[1.5] text-[#F4EDE1]/76 lg:max-w-lg lg:text-xl">
              {t('Say it in the elevator, type it in bed. Bitcoin, Nvidia, gold, 600 more — in Spanish or English, whichever comes out first.',
                'Dilo en el elevador, escríbelo en la cama. Bitcoin, Nvidia, oro y 600 más — en español o en inglés, el que te salga primero.')}
            </p>
          </motion.div>
          <div className="relative mx-auto -mb-10 w-[62%] max-w-[240px] lg:mx-0 lg:-mb-16 lg:w-[300px] lg:max-w-none lg:justify-self-center">
            <FramedShot src="/app/shot-desk.webp" alt={t('Byte on the Bobby desk, ready for a spoken question', 'Byte en el desk de Bobby, listo para una pregunta hablada')} className="!border-[#F4EDE1]" shadow="none" />
          </div>
        </div>
      </section>

      {/* ============ 3 · NO ============ */}
      <section className="relative overflow-hidden px-6 pb-0 pt-14 lg:px-16 lg:pt-24" style={{ background: GOLD, color: INK }}>
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-2 lg:items-end">
          <motion.div {...reveal} className="lg:pb-24">
            <h2 className="text-[44px] font-extrabold leading-[0.94] tracking-[-0.035em] lg:text-[72px]" style={headingFont}>
              {t('Bobby is', 'Bobby sí')}<br />{t('allowed to', 'puede decir')}<br />{t('say no.', 'que no.')}
            </h2>
            <p className="mt-4 max-w-[280px] text-[17px] leading-[1.5] text-[#14120F]/78 lg:max-w-lg lg:text-xl">
              {t('Your other AI always finds you a reason to buy. Bobby’s job is to find the reason not to — and to say it before you press anything.',
                'Tu otra IA siempre te encuentra una razón para comprar. El trabajo de Bobby es encontrar la razón para no hacerlo — y decírtela antes de que le piques a nada.')}
            </p>
          </motion.div>
          <div className="relative mx-auto -mb-10 w-[58%] max-w-[220px] lg:mx-0 lg:-mb-16 lg:w-[280px] lg:max-w-none lg:justify-self-center">
            <FramedShot src="/app/shot-notrade.webp" alt={t('A real NO TRADE verdict on Bitcoin', 'Un NO TRADE real sobre Bitcoin')} shadow="-12px 14px 0 rgba(20,18,15,.18)" />
          </div>
        </div>
      </section>

      {/* ============ 4 · A WEEK WITH BOBBY ============ */}
      <section id="week" className="scroll-mt-16 px-6 py-16 lg:px-16 lg:py-28" style={{ background: CREAM }}>
        <div className="mx-auto max-w-[1400px] lg:grid lg:grid-cols-[.9fr_1.1fr] lg:gap-16">
          <motion.div {...reveal}>
            <h2 className="text-[44px] font-extrabold leading-[0.94] tracking-[-0.035em] lg:text-[68px]" style={headingFont}>
              {t('A week with', 'Una semana')}<br />{t('Bobby.', 'con Bobby.')}
            </h2>
            <p className="mt-4 max-w-[320px] text-[17px] leading-[1.5] text-[#14120F]/68 lg:text-xl">
              {t('Two minutes a day. That is the whole thing.', 'Dos minutos al día. Eso es todo.')}
            </p>
          </motion.div>
          <motion.div {...reveal} className="mt-7 flex flex-col gap-2 lg:mt-0">
            {week.map(([day, line]) => (
              <div key={day} className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 lg:px-6 lg:py-5" style={{ borderColor: 'rgba(20,18,15,.10)' }}>
                <span className="w-11 shrink-0 text-xs font-semibold text-[#14120F]/50 lg:w-14 lg:text-sm">{day}</span>
                <span className="text-[15px] font-medium lg:text-[17px]">{line}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 lg:px-6 lg:py-5" style={{ background: FOREST, color: CREAM }}>
              <span className="w-11 shrink-0 text-xs font-semibold text-[#F4EDE1]/60 lg:w-14 lg:text-sm">{t('SUN', 'DOM')}</span>
              <span className="text-[15px] font-semibold lg:text-[17px]">{t('Seven days straight. Your island grows', 'Siete días seguidos. Tu isla crece')}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============ 5 · MEMORY ============ */}
      <section id="record" className="scroll-mt-16 px-6 py-16 lg:px-16 lg:py-28" style={{ background: INK, color: CREAM }}>
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-2 lg:items-end">
          <motion.div {...reveal}>
            <h2 className="text-[44px] font-extrabold leading-[0.94] tracking-[-0.035em] lg:text-[68px]" style={headingFont}>
              {t('It remembers.', 'Se acuerda.')}<br />{t("Even when it's wrong.", 'Hasta cuando falla.')}
            </h2>
            <p className="mt-4 max-w-[330px] text-[17px] leading-[1.5] text-[#F4EDE1]/70 lg:max-w-lg lg:text-xl">
              {t('Every call is written down the second it is made, then the market decides. Bobby never quietly deletes the bad ones.',
                'Cada llamada se escribe en el segundo en que se hace, después el mercado decide. Bobby nunca borra en silencio las malas.')}
            </p>
          </motion.div>
          {numbers && (
            <motion.div {...reveal}>
              <div className="flex gap-2.5">
                <div className="flex-1 rounded-[18px] border px-4 py-4 lg:px-6 lg:py-6" style={{ borderColor: 'rgba(244,237,225,.12)', background: 'rgba(244,237,225,.06)' }}>
                  <div className="text-[30px] font-extrabold tracking-[-0.03em] lg:text-[44px]" style={headingFont}>{numbers.written}</div>
                  <div className="mt-1 text-[13px] text-[#F4EDE1]/62 lg:text-[15px]">{t('written down', 'escritas')}</div>
                </div>
                {numbers.settled && (
                  <div className="flex-1 rounded-[18px] border px-4 py-4 lg:px-6 lg:py-6" style={{ borderColor: 'rgba(244,237,225,.12)', background: 'rgba(244,237,225,.06)' }}>
                    <div className="text-[30px] font-extrabold tracking-[-0.03em] lg:text-[44px]" style={headingFont}>{numbers.settled}</div>
                    <div className="mt-1 text-[13px] text-[#F4EDE1]/62 lg:text-[15px]">{t('already settled', 'ya resueltas')}</div>
                  </div>
                )}
                {numbers.wrong && (
                  <div className="flex-1 rounded-[18px] border px-4 py-4 lg:px-6 lg:py-6" style={{ borderColor: 'rgba(245,197,66,.34)', background: 'rgba(245,197,66,.14)' }}>
                    <div className="text-[30px] font-extrabold tracking-[-0.03em] lg:text-[44px]" style={{ ...headingFont, color: GOLD }}>{numbers.wrong}</div>
                    <div className="mt-1 text-[13px] lg:text-[15px]" style={{ color: 'rgba(245,197,66,.85)' }}>{t('Bobby got wrong', 'las falló Bobby')}</div>
                  </div>
                )}
              </div>
              <a href="/protocol" className="mt-5 inline-block text-base font-semibold text-[#5CFF91] underline decoration-[#5CFF91]/45 underline-offset-[6px] transition hover:decoration-[#5CFF91] lg:text-[17px]">
                {t('Go read the misses', 'Ve a leer los fallos')}
              </a>
            </motion.div>
          )}
        </div>
      </section>

      {/* ============ 6 · ISLAND + SQUAD ============ */}
      <section className="px-6 py-16 lg:px-16 lg:py-28" style={{ background: CREAM }}>
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-2 lg:items-center">
          <motion.div {...reveal}>
            <h2 className="max-w-[300px] text-[42px] font-extrabold leading-[0.94] tracking-[-0.035em] lg:max-w-none lg:text-[68px]" style={headingFont}>
              {t('Your island grows when you behave.', 'Tu isla crece cuando te portas bien.')}
            </h2>
            <p className="mt-4 max-w-[300px] text-[17px] leading-[1.5] text-[#14120F]/68 lg:max-w-lg lg:text-xl">
              {t('Patience earns pieces. Trading more earns nothing at all.', 'La paciencia gana piezas. Operar más no gana absolutamente nada.')}
            </p>
            <div className="mt-8">
              <div className="mb-3 text-[13px] font-semibold text-[#14120F]/50 lg:text-sm">{t('AND PICK WHO TALKS TO YOU', 'Y ELIGE QUIÉN TE HABLA')}</div>
              <div className="flex items-center gap-2.5">
                {[['byte', GOLD], ['kora', FOREST], ['zip', INK]].map(([id, bg]) => (
                  <div key={id} className="grid h-[68px] w-[68px] place-items-center rounded-[22px] lg:h-20 lg:w-20" style={{ background: bg }}>
                    <img src={`/mascots/${id}.webp`} alt={id} loading="lazy" className="h-[52px] w-[52px] object-contain lg:h-[60px] lg:w-[60px]" />
                  </div>
                ))}
                <div className="grid h-[68px] w-[68px] place-items-center rounded-[22px] border-2 border-dashed text-[15px] font-semibold text-[#14120F]/55 lg:h-20 lg:w-20" style={{ borderColor: 'rgba(20,18,15,.28)' }}>+14</div>
              </div>
            </div>
          </motion.div>
          <div className="mx-auto w-[52%] max-w-[200px] lg:mx-0 lg:w-[280px] lg:max-w-none lg:justify-self-center">
            <FramedShot src="/app/shot-world.webp" alt={t('Trader Land, the island that grows with each good decision', 'Trader Land, la isla que crece con cada buena decisión')} shadow="-10px 14px 0 rgba(20,18,15,.14)" />
          </div>
        </div>
      </section>

      {/* ============ 7 · CLOSE ============ */}
      <section className="px-6 py-16 lg:px-16 lg:py-28" style={{ background: FOREST, color: CREAM }}>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[52px] font-extrabold leading-[0.92] tracking-[-0.035em] lg:text-[88px]" style={headingFont}>{t('Get Bobby.', 'Ten a Bobby.')}</h2>
            <p className="mt-4 max-w-[320px] text-[17px] leading-[1.5] text-[#F4EDE1]/74 lg:max-w-md lg:text-xl">
              {t('Free on iPhone. Or open the desk right now in your browser — no download, no wallet.',
                'Gratis en iPhone. O abre el desk ahora mismo en tu navegador — sin descargar nada, sin wallet.')}
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:w-[380px]">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-full px-8 text-base font-semibold transition hover:opacity-90 lg:min-h-[60px] lg:text-[17px]" style={{ background: CREAM, color: INK }}>
              <AppleGlyph />
              {t('Download on the App Store', 'Descárgala en el App Store')}
            </a>
            <div className="flex items-center justify-between text-[13px] text-[#F4EDE1]/48">
              <a href={DESK_URL} className="font-medium text-[#F4EDE1]/72 transition hover:text-white">{t('Open the desk on the web', 'Abre el desk en la web')}</a>
              <span>{t('Analysis, never advice.', 'Análisis, nunca asesoría.')}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
