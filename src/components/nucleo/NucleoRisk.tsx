// Four explicit browser acknowledgements, including AI processing and external dictation services.
import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { t } from '@/lib/companions/i18n';
import { clientLanguagePath } from '@/lib/client-language';
import { progressStore } from '@/lib/companions/progress';
import { sfxSuccess, sfxTock } from '@/lib/companions/sfx';
import NucleoSphere from '@/components/companion/NucleoSphere';
import LangMenu from './LangMenu';

interface Props { readOnly?: boolean; onClose?: () => void }

export default function NucleoRisk({ readOnly = false, onClose }: Props) {
  const [checks, setChecks] = useState([false, false, false, false]);
  const [full, setFull] = useState(readOnly);
  const done = readOnly ? 4 : checks.filter(Boolean).length;
  const all = done === 4;
  const statements = [
    { title: t("Allow AI processing of my questions.", "Permito que la IA procese mis preguntas.", "Permito que a IA processe as minhas perguntas.", "J’autorise le traitement de mes questions par l’IA.", "Consento il trattamento delle mie domande da parte dell’IA.", "Ich erlaube die KI-Verarbeitung meiner Fragen."), short: t("My questions and public market context go to AI providers. Browser dictation may use an external service.", "Mis preguntas y contexto público de mercado van a proveedores de IA. El dictado del navegador puede usar un servicio externo.", "As minhas perguntas e contexto público de mercado vão para fornecedores de IA. O ditado do navegador pode usar um serviço externo.", "Mes questions et le contexte public des marchés sont transmis à des fournisseurs d’IA. La dictée du navigateur peut utiliser un service externe.", "Le mie domande e il contesto pubblico di mercato vengono inviati a fornitori di IA. La dettatura del browser può usare un servizio esterno.", "Meine Fragen und öffentliche Marktdaten gehen an KI-Anbieter. Browser-Diktieren kann einen externen Dienst nutzen."), body: t("Bobby sends your question and public market context to OpenAI or Anthropic for analysis. Live voice sends microphone audio to OpenAI to generate the conversation. Browser dictation may send audio to your browser’s speech service; it is not guaranteed to stay on this device. If narration is enabled, reply text may go to OpenAI or Microsoft for speech. Avoid personal or account details. You can withdraw AI consent from this notice.", "Bobby envía tu pregunta y contexto público de mercado a OpenAI o Anthropic para analizarlos. La voz en vivo envía audio del micrófono a OpenAI para generar la conversación. El dictado del navegador puede enviar audio a su servicio de voz; no se garantiza que permanezca en este dispositivo. Si activas la narración, el texto de respuesta puede ir a OpenAI o Microsoft para narrarlo. Evita datos personales o de cuentas. Puedes retirar el consentimiento de IA desde este aviso.", "O Bobby envia a sua pergunta e contexto público de mercado à OpenAI ou Anthropic para análise. A voz ao vivo envia áudio do microfone à OpenAI para gerar a conversa. O ditado do navegador pode enviar áudio ao seu serviço de voz; não há garantia de que permaneça neste dispositivo. Com narração ativa, o texto da resposta pode ir à OpenAI ou Microsoft para voz. Evite dados pessoais ou de contas. Pode retirar o consentimento de IA neste aviso.", "Bobby transmet ta question et le contexte public des marchés à OpenAI ou Anthropic pour analyse. La voix en direct transmet l’audio du microphone à OpenAI pour générer la conversation. La dictée du navigateur peut transmettre l’audio à son service vocal ; il n’est pas garanti qu’il reste sur cet appareil. Si la narration est activée, le texte de réponse peut être transmis à OpenAI ou Microsoft pour la voix. Évite les données personnelles ou de compte. Tu peux retirer ton consentement à l’IA dans cet avis.", "Bobby invia la domanda e il contesto pubblico di mercato a OpenAI o Anthropic per l’analisi. La voce dal vivo invia l’audio del microfono a OpenAI per generare la conversazione. La dettatura del browser può inviare audio al suo servizio vocale; non è garantito che resti su questo dispositivo. Con narrazione attiva, il testo della risposta può essere inviato a OpenAI o Microsoft per la voce. Evita dati personali o di account. Puoi revocare il consenso all’IA da questo avviso.", "Bobby sendet deine Frage und öffentliche Marktdaten zur Analyse an OpenAI oder Anthropic. Live-Sprache sendet Mikrofon-Audio an OpenAI, um die Unterhaltung zu erzeugen. Browser-Diktieren kann Audio an den Sprachdienst des Browsers senden; es bleibt nicht garantiert auf diesem Gerät. Bei aktivierter Sprachausgabe kann Antworttext an OpenAI oder Microsoft gehen. Vermeide persönliche oder Kontodaten. Du kannst die KI-Einwilligung in diesem Hinweis widerrufen.") },
    { title: t('Not investment advice.', 'No es asesoría de inversión.', 'Não é recomendação de investimento.'), short: t('Educational analysis made by software, not tailored to you.', 'Análisis educativo hecho por software, no a tu medida.', 'Análise educativa feita por software, não personalizada para você.'), body: t('Everything Bobby says — verdicts, levels, entries, stops, XP — is educational market analysis produced by software. It is not a recommendation to buy, sell or hold anything, and it is not tailored to you.', 'Todo lo que dice Bobby (veredictos, niveles, entradas, stops, XP) es análisis educativo generado por software. No es una recomendación de comprar, vender o mantener nada, y no está hecho a tu medida.', 'Tudo o que o Bobby diz — veredictos, níveis, entradas, stops, XP — é análise educativa de mercado gerada por software. Não é recomendação para comprar, vender ou manter nada, e não é personalizada para você.') },
    { title: t('Bobby never takes custody or signs for you.', 'Bobby nunca toma custodia ni firma por ti.', 'O Bobby nunca fica com a custódia nem assina por você.'), short: t('Your wallet reviews and signs every swap. Never Bobby.', 'Tu wallet revisa y firma cada swap. Nunca Bobby.', 'Sua carteira revisa e assina cada swap. Nunca o Bobby.'), body: t('This desk can prepare Base swap transaction data for your connected wallet. You review and sign from your wallet; Bobby never holds your funds or keys.', 'Este desk puede preparar datos de transacción para swaps en Base con tu wallet conectada. Tú revisas y firmas desde tu wallet; Bobby nunca guarda tus fondos ni llaves.', 'Este desk pode preparar os dados de transação de swaps na Base para a sua carteira conectada. Você revisa e assina na sua carteira; o Bobby nunca guarda seus fundos nem suas chaves.') },
    { title: t('Markets involve risk. You decide.', 'Los mercados implican riesgo. Tú decides.', 'Mercados envolvem risco. Você decide.'), short: t('You can lose money. Your decisions are yours.', 'Puedes perder dinero. Tus decisiones son tuyas.', 'Você pode perder dinheiro. As decisões são suas.'), body: t('Prices move against you, data can be delayed or wrong, and you can lose money. Only you own your decisions and their results. If you need advice, talk to a licensed professional.', 'Los precios se mueven en tu contra, los datos pueden llegar tarde o mal, y puedes perder dinero. Solo tú eres dueño de tus decisiones y de sus resultados. Si necesitas asesoría, acude a un profesional autorizado.', 'Os preços podem se mover contra você, os dados podem atrasar ou vir errados, e você pode perder dinheiro. Só você responde pelas suas decisões e pelos resultados delas. Se precisar de orientação, procure um profissional habilitado.') },
  ];
  const size = 104;
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
        <a href={clientLanguagePath('/')} className="n-wordmark">Bobby</a>
        <div className="flex items-center gap-2">
          <LangMenu />
          {readOnly && <button type="button" onClick={onClose} className="n-iconbtn" aria-label={t('Close', 'Cerrar', 'Fechar')}><X size={16} /></button>}
        </div>
      </header>
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[520px] flex-col items-center justify-center px-5 pb-16 pt-0">
        <div className="relative grid place-items-center" style={{ width: ring * 2 + 8, height: ring * 2 + 8 }}>
          <NucleoSphere size={size} mode={all ? 'verdict' : 'idle'} verdict="ready" />
          <svg className="absolute inset-0" viewBox={`0 0 ${ring * 2 + 8} ${ring * 2 + 8}`} aria-hidden="true">
            <circle cx={ring + 4} cy={ring + 4} r={ring} fill="none" stroke="rgba(242,237,228,.1)" strokeWidth=".75" />
            <circle cx={ring + 4} cy={ring + 4} r={ring} fill="none" stroke="#3FE0B5" strokeWidth="1.5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - done / 4)} transform={`rotate(-90 ${ring + 4} ${ring + 4})`}
              style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 0 6px rgba(63,224,181,.6))' }} />
          </svg>
        </div>
        <h1 className="n-display mt-3 text-center text-[30px] leading-[1.1] sm:text-[36px]">{t('One thing before we start.', 'Una cosa antes de empezar.', 'Uma coisa antes de começar.')}</h1>
        <div className="mt-6 w-full">
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
                  <span className="mt-1 block text-[14px] leading-relaxed" style={{ color: '#A39C91' }}>{full || i === 0 ? s.body : s.short}</span>
                </span>
              </button>
            );
          })}
        </div>

        {full ? (
          <p className="mt-4 text-center text-[12px] leading-relaxed" style={{ color: '#8A8378' }}>
            {t("Data comes from public market sources and can be delayed. Bobby's public calls are recorded on-chain so anyone can check them; that is a track record, not a promise.", 'Los datos vienen de fuentes públicas de mercado y pueden llegar con retraso. Las llamadas públicas de Bobby se registran on-chain para que cualquiera las revise; eso es historial, no promesa.', 'Os dados vêm de fontes públicas de mercado e podem atrasar. As chamadas públicas do Bobby ficam registradas on-chain para que qualquer pessoa possa conferir; isso é histórico, não promessa.')}{' '}
            <a className="underline" href={clientLanguagePath('/privacy')} target="_blank" rel="noreferrer">{t('Privacy Policy', 'Aviso de privacidad', 'Política de Privacidade')}</a>
          </p>
        ) : (
          <button type="button" onClick={() => setFull(true)} className="mt-4 text-[13px] underline underline-offset-4" style={{ color: '#A39C91' }}>{t('Read the full notice', 'Leer el aviso completo', 'Ler o aviso completo')}</button>
        )}

        {readOnly && <button type="button" onClick={() => { progressStore.withdrawAIConsent(); onClose?.(); }} className="mt-5 text-sm underline underline-offset-4">{t("Withdraw AI consent", "Retirar consentimiento de IA", "Retirar consentimento de IA", "Retirer le consentement à l’IA", "Revoca il consenso all’IA", "KI-Einwilligung widerrufen")}</button>}

        {!readOnly && (
          <button type="button" disabled={!all} onClick={accept} className={`n-cta mt-5 ${all ? 'on' : ''}`}>
            {all ? t('I understand. Let me in', 'Entiendo. Déjame entrar', 'Entendi. Quero entrar') : t(`Accept all four · ${done}/4`, `Acepta los cuatro · ${done}/4`, `Aceite os quatro · ${done}/4`)}
            {all && <ArrowRight size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
