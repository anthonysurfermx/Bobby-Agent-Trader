// The one thing we ask before the first read, in the Núcleo design: the glass, three statements
// acknowledged by hand, and a ring around the glass that closes as each one is accepted (the
// iPhone's agree ring). Same three statements and the same store as before; no characters, no
// vibe, no loadout — the glass leads and the avatars live in the profile.
import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { isSpanish, t } from '@/lib/companions/i18n';
import { progressStore } from '@/lib/companions/progress';
import { sfxSuccess, sfxTock } from '@/lib/companions/sfx';
import NucleoSphere from '@/components/companion/NucleoSphere';

interface Props { readOnly?: boolean; onClose?: () => void }

export function LangToggle() {
  const es = isSpanish();
  const set = (lang: 'en' | 'es') => { if ((lang === 'es') === es) return; try { localStorage.setItem('bobby_lang', lang); } catch { /* private mode */ } window.location.reload(); };
  return (
    <div className="n-seg" role="group" aria-label="Language">
      <button type="button" aria-pressed={!es} onClick={() => set('en')}>EN</button>
      <button type="button" aria-pressed={es} onClick={() => set('es')}>ES</button>
    </div>
  );
}

export default function NucleoRisk({ readOnly = false, onClose }: Props) {
  const [checks, setChecks] = useState([false, false, false]);
  const done = readOnly ? 3 : checks.filter(Boolean).length;
  const all = done === 3;
  const statements = [
    { title: t('Not investment advice.', 'No es asesoría de inversión.'), body: t('Everything Bobby says — verdicts, levels, entries, stops, XP — is educational market analysis produced by software. It is not a recommendation to buy, sell or hold anything, and it is not tailored to you.', 'Todo lo que dice Bobby (veredictos, niveles, entradas, stops, XP) es análisis educativo generado por software. No es una recomendación de comprar, vender o mantener nada, y no está hecho a tu medida.') },
    { title: t('Bobby never takes custody or signs for you.', 'Bobby nunca toma custodia ni firma por ti.'), body: t('This desk can prepare Base swap transaction data for your connected wallet. You review and sign from your wallet; Bobby never holds your funds or keys.', 'Este desk puede preparar datos de transacción para swaps en Base con tu wallet conectada. Tú revisas y firmas desde tu wallet; Bobby nunca guarda tus fondos ni llaves.') },
    { title: t('Markets involve risk. You decide.', 'Los mercados implican riesgo. Tú decides.'), body: t('Prices move against you, data can be delayed or wrong, and you can lose money. Only you own your decisions and their results. If you need advice, talk to a licensed professional.', 'Los precios se mueven en tu contra, los datos pueden llegar tarde o mal, y puedes perder dinero. Solo tú eres dueño de tus decisiones y de sus resultados. Si necesitas asesoría, acude a un profesional autorizado.') },
  ];
  const size = 132;
  const ring = size / 2 + 16;
  const circ = 2 * Math.PI * ring;

  const accept = () => {
    if (!all) return;
    sfxSuccess();
    progressStore.acceptRiskNotice();
    // The characters left first run: whoever reaches the desk is onboarded, with the default avatar.
    progressStore.finishOnboarding();
  };

  return (
    <div className="n-risk">
      <header className="n-topbar">
        <a href="/" className="n-wordmark">Bobby</a>
        <div className="flex items-center gap-2">
          <LangToggle />
          {readOnly && <button type="button" onClick={onClose} className="n-iconbtn" aria-label={t('Close', 'Cerrar')}><X size={16} /></button>}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-5 pb-12 pt-2">
        <div className="relative grid place-items-center" style={{ width: ring * 2 + 8, height: ring * 2 + 8 }}>
          <NucleoSphere size={size} mode={all ? 'verdict' : 'idle'} verdict="ready" />
          <svg className="absolute inset-0" viewBox={`0 0 ${ring * 2 + 8} ${ring * 2 + 8}`} aria-hidden="true">
            <circle cx={ring + 4} cy={ring + 4} r={ring} fill="none" stroke="rgba(242,237,228,.1)" strokeWidth=".75" />
            <circle cx={ring + 4} cy={ring + 4} r={ring} fill="none" stroke="#3FE0B5" strokeWidth="1.5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - done / 3)} transform={`rotate(-90 ${ring + 4} ${ring + 4})`}
              style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 0 6px rgba(63,224,181,.6))' }} />
          </svg>
        </div>
        <div className="n-label mt-2">{t('Before we start', 'Antes de empezar')}</div>
        <h1 className="n-display mt-3 text-center text-[32px] leading-[1.1] sm:text-[38px]">{t('Read this once. It matters.', 'Léelo una vez. Importa.')}</h1>
        <p className="mt-3 max-w-[40ch] text-center text-[15px] leading-relaxed" style={{ color: '#A39C91' }}>
          {t('Bobby is a market-analysis companion built to make you think, not to tell you what to do with your money.', 'Bobby es un compañero de análisis de mercado hecho para hacerte pensar, no para decirte qué hacer con tu dinero.')}
        </p>

        <div className="mt-7 w-full">
          {statements.map((s, i) => {
            const on = readOnly || checks[i];
            return (
              <button
                key={s.title}
                type="button"
                disabled={readOnly}
                aria-pressed={on}
                onClick={() => { sfxTock(); setChecks((c) => c.map((v, j) => (j === i ? !v : v))); }}
                className={`n-ack ${on ? 'on' : ''}`}
              >
                <span className="n-ack-box">{on && <Check size={13} strokeWidth={2.5} />}</span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium" style={{ color: '#F2EDE4' }}>{s.title}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed" style={{ color: '#A39C91' }}>{s.body}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-center text-[12px] leading-relaxed" style={{ color: '#8A8378' }}>
          {t("Data comes from public market sources and can be delayed. Bobby's public calls are recorded on-chain so anyone can check them; that is a track record, not a promise.", 'Los datos vienen de fuentes públicas de mercado y pueden llegar con retraso. Las llamadas públicas de Bobby se registran on-chain para que cualquiera las revise; eso es historial, no promesa.')}{' '}
          <a className="underline" href="/privacy" target="_blank" rel="noreferrer">{t('Privacy Policy', 'Aviso de privacidad')}</a>
        </p>

        {!readOnly && (
          <button type="button" disabled={!all} onClick={accept} className={`n-cta mt-6 ${all ? 'on' : ''}`}>
            {all ? t('I understand. Let me in', 'Entiendo. Déjame entrar') : t(`Accept all three · ${done}/3`, `Acepta los tres · ${done}/3`)}
            {all && <ArrowRight size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
