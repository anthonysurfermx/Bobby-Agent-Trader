// First-visit risk notice — same three statements as the iOS app, each
// acknowledged by hand before the button enables. No "skip".
import { useState } from 'react';
import { CheckCircle2, Circle, Hand, ArrowRight, X } from 'lucide-react';
import { t } from '@/lib/companions/i18n';
import { progressStore } from '@/lib/companions/progress';
import { sfxTock, sfxSuccess } from '@/lib/companions/sfx';

interface Props { readOnly?: boolean; onClose?: () => void }

export default function RiskNotice({ readOnly = false, onClose }: Props) {
  const [checks, setChecks] = useState([false, false, false]);
  const all = checks.every(Boolean);
  const statements = [
    { title: t('Not investment advice.', 'No es asesoría de inversión.'), body: t('Everything Bobby says — verdicts, levels, entries, stops, XP — is educational market analysis produced by software. It is not a recommendation to buy, sell or hold anything, and it is not tailored to you.', 'Todo lo que dice Bobby (veredictos, niveles, entradas, stops, XP) es análisis educativo generado por software. No es una recomendación de comprar, vender o mantener nada, y no está hecho a tu medida.') },
    { title: t('Bobby never touches your money.', 'Bobby nunca toca tu dinero.'), body: t('This desk does not execute trades, does not hold funds or keys, and does not connect to your exchange. Anything you do with a broker or a wallet is your own action.', 'Este desk no ejecuta operaciones, no guarda fondos ni llaves y no se conecta a tu exchange. Lo que hagas en un bróker o una wallet es tu propia acción.') },
    { title: t('Markets involve risk. You decide.', 'Los mercados implican riesgo. Tú decides.'), body: t('Prices move against you, data can be delayed or wrong, and you can lose money. Only you own your decisions and their results. If you need advice, talk to a licensed professional.', 'Los precios se mueven en tu contra, los datos pueden llegar tarde o mal, y puedes perder dinero. Solo tú eres dueño de tus decisiones y de sus resultados. Si necesitas asesoría, acude a un profesional autorizado.') },
  ];

  return (
    <div className="mx-auto max-w-xl px-5 py-8 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.2em] text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_8px_#34D399]" />
          {t('BOBBY // BEFORE WE START', 'BOBBY // ANTES DE EMPEZAR')}
        </div>
        {readOnly && (
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/[0.04] flex items-center justify-center text-white/70" aria-label="close"><X size={14} /></button>
        )}
      </div>
      <h1 className="text-3xl font-semibold text-white">{t('Read this once. It matters.', 'Léelo una vez. Importa.')}</h1>
      <p className="text-white/70">{t('Bobby is a market-analysis companion built to make you think, not to tell you what to do with your money.', 'Bobby es un compañero de análisis de mercado hecho para hacerte pensar, no para decirte qué hacer con tu dinero.')}</p>
      <div className="space-y-3">
        {statements.map((s, i) => {
          const on = readOnly || checks[i];
          return (
            <button
              key={s.title}
              disabled={readOnly}
              onClick={() => { sfxTock(); setChecks((c) => c.map((v, j) => (j === i ? !v : v))); }}
              className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition ${on ? 'bg-green-400/[0.06] border-green-400/40' : 'bg-white/[0.02] border-white/[0.06]'}`}
            >
              {on ? <CheckCircle2 className="text-green-400 shrink-0 mt-0.5" size={22} /> : <Circle className="text-white/40 shrink-0 mt-0.5" size={22} />}
              <span>
                <span className="block text-white font-semibold">{s.title}</span>
                <span className="block text-sm text-white/65 mt-1">{s.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] font-mono text-white/40 leading-relaxed">
        {t('Data comes from public market sources and can be delayed. Bobby\'s public calls are recorded on-chain so anyone can check them; that is a track record, not a promise.', 'Los datos vienen de fuentes públicas de mercado y pueden llegar con retraso. Las llamadas públicas de Bobby se registran on-chain para que cualquiera las revise; eso es historial, no promesa.')}{' '}
        <a className="underline" href="/privacy" target="_blank" rel="noreferrer">{t('Privacy Policy', 'Aviso de privacidad')}</a>
      </p>
      {!readOnly && (
        <button
          disabled={!all}
          onClick={() => { sfxSuccess(); progressStore.acceptRiskNotice(); }}
          className={`w-full h-13 py-4 px-5 rounded-xl flex items-center justify-between font-mono text-xs tracking-[0.15em] transition ${all ? 'bg-green-400 text-black shadow-[0_6px_24px_rgba(52,211,153,0.3)]' : 'bg-white/[0.03] border border-white/[0.06] text-white/50'}`}
        >
          {all ? t('I UNDERSTAND. LET ME IN', 'ENTIENDO. DÉJAME ENTRAR') : t('ACKNOWLEDGE ALL THREE', 'ACEPTA LOS TRES PUNTOS')}
          {all ? <ArrowRight size={14} /> : <Hand size={14} />}
        </button>
      )}
    </div>
  );
}
