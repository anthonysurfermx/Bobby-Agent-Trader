// /protocol/risk — honest claims, trust assumptions and the disclaimer.
// Content red-teamed by Kimi K3 (2026-08-19); mechanism numbers match the
// frozen BobbyTrackRecordV2. Scoped claims only — see "What we will never claim".
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';

const TRUST_ROWS: Array<[string, string, string]> = [
  [
    'Recorder key is compromised',
    'Attacker could issue bad commits within the announce window; cannot rewrite past records.',
    'Key monitoring and rotation runbook; ownership handoff is pending to the published 2-of-3 Safe; writes stay frozen until acceptance.',
  ],
  [
    'Hermes / Pyth is down',
    'VERIFIED commits and resolves halt.',
    'ATTESTED path remains functional; a fallback Pyth contract is pre-approved; feed staleness is public.',
  ],
  [
    'Safe 2-of-3 is misused',
    'Owners could change parameters or pause the system.',
    '3 independent owners, threshold 2, no modules, addresses published for monitoring. History stays immutable.',
  ],
  [
    'Smart contract bug',
    'Records or protocol fees could be at risk.',
    '5 adversarial audit rounds, bug bounty, emergency pause via Safe, immutable on-chain history.',
  ],
  [
    'Pyth oracle is corrupted',
    'A bad price could pass the verification gate.',
    'Hermes-signed proofs, 50 bps confidence cap, 100 bps tolerance, 7-day permissionless challenge window.',
  ],
];

const NEVER_CLAIM = [
  '“Tamper-proof”, unqualified.',
  '“Guaranteed returns.”',
  '“Personalized investment advice.”',
  '“All symbols are oracle-verified.”',
  '“Bobby trades real capital.”',
  '“Unhackable.”',
  '“The win rate proves future performance.”',
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="protocol-section-title">{children}</h2>;
}

export default function BobbyRiskPage() {
  const { t } = useProtocolLanguage();
  return (
    <ProtocolLayout active="risk">
      <Helmet>
        <title>{t("Risk & Claims — Bobby Protocol", "Riesgos y afirmaciones — Bobby Protocol", "Riscos e afirmações — Bobby Protocol")}</title>
        <meta name="description" content="Exactly what VERIFIED proves, what ATTESTED is, our trust assumptions, and what we will never claim." />
      </Helmet>


      <div className="protocol-content">


        <header className="protocol-hero">
          <p className="protocol-eyebrow">{t("Protocol / Risk & claims", "Protocolo / Riesgos y afirmaciones", "Protocolo / Riscos e afirmações")}</p>
          <h1 className="protocol-title">{t("Know the proof.", "Conoce la evidencia.", "Conheça a evidência.")}<br /><span className="text-[#A39C91]">{t("Know its limits.", "Conoce sus límites.", "Conheça seus limites.")}</span></h1>
          <p className="protocol-lead">{t(" Don't trust — verify. This page says exactly what the mechanism proves, what it does not, and where you still have to trust someone. ", " No confíes: verifica. Esta página explica exactamente qué demuestra el mecanismo, qué no demuestra y dónde todavía hay que confiar en alguien. ", " Não confie: verifique. Esta página explica exatamente o que o mecanismo comprova, o que não comprova e onde você ainda precisa confiar em alguém. ")}</p>
        </header>

        <section className="protocol-panel p-6 md:p-9">
          <p className="protocol-eyebrow mb-5">{t("01 / Oracle-backed evidence", "01 / Evidencia respaldada por oráculo", "01 / Evidência respaldada por oráculo")}</p>
        <H2>{t("What VERIFIED proves", "Qué demuestra VERIFIED", "O que VERIFIED comprova")}</H2>
        <p className="mt-4 leading-7 text-[#A39C91]">{t(" VERIFIED applies only to ", " VERIFIED se aplica únicamente a ", " VERIFIED se aplica apenas a ")}<b className="text-[#F2EDE4]">{t("BTC, ETH and SOL", "BTC, ETH y SOL", "BTC, ETH e SOL")}</b>{t(". Every commit, resolve and challenge is backed by a signed Pyth price update from Hermes: ", ". Cada registro, resolución y desafío se respalda con una actualización de precio de Pyth firmada, obtenida de Hermes: ", ". Cada registro, resolução e desafio é respaldado por uma atualização de preço da Pyth assinada, obtida da Hermes: ")}</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-[#A39C91]">
          <li>{t("The entry anchor derives from an on-chain announcement: ", "El ancla de entrada se deriva de un anuncio on-chain: ", "A âncora de entrada deriva de um anúncio on-chain: ")}<code className="rounded bg-white/10 px-1.5 text-sm">entryAt = announcedAt + 10s</code>{t(". The recorder cannot know the Pyth tick when the anchor is fixed — no tick-shopping, no same-block games.", ". El registrador no puede conocer el tick de Pyth cuando se fija el ancla: no puede elegir un tick favorable ni aprovechar el mismo bloque.", ". O registrador não pode conhecer o tick da Pyth quando a âncora é fixada: não pode escolher um tick favorável nem explorar o mesmo bloco.")}</li>
          <li>{t("The reported entry must sit within ", "La entrada declarada debe estar a no más de ", "A entrada declarada deve estar a no máximo ")}<b className="text-[#F2EDE4]">100 bps</b>{t(" of the signed oracle price; confidence is capped at 50 bps.", " del precio firmado del oráculo; la confianza tiene un límite de 50 bps.", " do preço assinado do oráculo; a confiança é limitada a 50 bps.")}</li>
          <li>{t("The stop is forced onto the loss side of the ", "El stop se fuerza al lado de pérdida de la entrada del ", "O stop é forçado ao lado de perda da entrada do ")}<i>{t("oracle", "oráculo", "oráculo")}</i>{t(" entry at commit time.", " al registrar el compromiso.", " ao registrar o compromisso.")}</li>
          <li>{t("Resolve verifies a signed Pyth benchmark at the declared exit instant (max lag 600s).", "La resolución verifica una referencia de Pyth firmada en el instante de salida declarado (retraso máximo de 600 s).", "A resolução verifica uma referência da Pyth assinada no instante de saída declarado (atraso máximo de 600 s).")}</li>
          <li>{t("Any pending commitment — or any resolved WIN/BREAK_EVEN for ", "Cualquier compromiso pendiente, o cualquier WIN/BREAK_EVEN resuelto durante ", "Qualquer compromisso pendente, ou qualquer WIN/BREAK_EVEN resolvido durante ")}<b className="text-[#F2EDE4]">{t("7 days", "7 días", "7 dias")}</b>{t(" — can be challenged permissionlessly with a signed tick that crossed the stop. A real breach reclassifies to LOSS, with the loss derived from the oracle entry.", " — puede desafiarse sin permiso con un tick firmado que haya cruzado el stop. Un cruce real reclasifica a LOSS, con la pérdida calculada desde la entrada del oráculo.", " — pode ser desafiado sem permissão com um tick assinado que tenha cruzado o stop. Um cruzamento real reclassifica para LOSS, com a perda calculada a partir da entrada do oráculo.")}</li>
        </ul>
        <p className="mt-4 leading-7 text-[#A39C91]">{t(" What it does ", " Lo que ", " O que ")}<b className="text-[#F2EDE4]">{t("not", "no", "não")}</b>{t(" guarantee: future prices or returns; the quality of the strategy; immunity if the recorder key is compromised going forward. It proves the recorded outcome was checked against an oracle — nothing more, nothing less. ", " garantiza: precios o retornos futuros, la calidad de la estrategia o inmunidad si se compromete la clave del registrador en el futuro. Demuestra que el resultado registrado se contrastó con un oráculo: ni más ni menos. ", " garante: preços ou retornos futuros, a qualidade da estratégia ou imunidade caso a chave do registrador seja comprometida no futuro. Comprova que o resultado registrado foi verificado contra um oráculo: nada mais, nada menos. ")}</p>

        </section>

        <section className="protocol-panel mt-5 p-6 md:p-9">
          <p className="protocol-eyebrow mb-5">{t("02 / Self-reported evidence", "02 / Evidencia autodeclarada", "02 / Evidência autodeclarada")}</p>
        <H2>{t("What ATTESTED is", "Qué significa ATTESTED", "O que significa ATTESTED")}</H2>
        <p className="mt-4 leading-7 text-[#A39C91]">{t(" Everything outside BTC/ETH/SOL is ", " Todo lo que no sea BTC/ETH/SOL es ", " Tudo fora de BTC/ETH/SOL é ")}<b className="text-[#F2EDE4]">ATTESTED</b>{t(": prices are self-reported. The contract enforces internal consistency between pnl and result, but no oracle checks the numbers. ATTESTED and VERIFIED are separate ledgers — ", ": los precios son autodeclarados. El contrato exige coherencia entre el PnL y el resultado, pero ningún oráculo verifica los números. ATTESTED y VERIFIED son registros separados: ", ": os preços são autodeclarados. O contrato exige consistência entre o PnL e o resultado, mas nenhum oráculo verifica os números. ATTESTED e VERIFIED são registros separados: ")}<b className="text-[#F2EDE4]">{t(" they are never added together", " nunca se suman", " nunca são somados")}</b>.
        </p>

        </section>

        <section className="protocol-section">
          <p className="protocol-eyebrow mb-5">{t("03 / The remaining trust", "03 / La confianza que permanece", "03 / A confiança que permanece")}</p>
        <H2>{t("Trust assumptions", "Supuestos de confianza", "Premissas de confiança")}</H2>
        <div className="protocol-panel mt-7 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#F2EDE4]/10 bg-white/[0.03] font-mono text-[10px] uppercase tracking-[0.16em] text-[#A39C91]">
                <th className="px-5 py-5">{t("Assumption", "Supuesto", "Premissa")}</th>
                <th className="px-5 py-5">{t("If it fails", "Si falla", "Se falhar")}</th>
                <th className="px-5 py-5">{t("Mitigation today", "Mitigación actual", "Mitigação atual")}</th>
              </tr>
            </thead>
            <tbody>
              {TRUST_ROWS.map(([a, f, m]) => (
                <tr key={a} className="border-b border-[#F2EDE4]/[0.06] align-top leading-6 text-[#A39C91]">
                  <td className="px-5 py-5 font-semibold text-[#F2EDE4]">{a}</td>
                  <td className="px-5 py-5">{f}</td>
                  <td className="px-5 py-5">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        </section>

        <section className="protocol-section grid gap-10 md:grid-cols-[1fr_1.25fr]">
          <div>
            <p className="protocol-eyebrow mb-5">{t("04 / Clear boundaries", "04 / Límites claros", "04 / Limites claros")}</p>
            <H2>{t("What we will", "Lo que", "O que")}<br />{t("never claim", "nunca afirmaremos", "nunca afirmaremos")}</H2>
          </div>
          <ul className="divide-y divide-[#F2EDE4]/[0.08] text-[#A39C91]">
            {NEVER_CLAIM.map((c) => <li className="py-4 first:pt-0" key={c}>{c}</li>)}
          </ul>
        </section>

        <section className="protocol-panel mt-12 p-6 md:p-9">
        <H2>{t("Disclaimer", "Aviso", "Aviso")}</H2>
        <p className="mt-4 leading-7 text-[#A39C91]">{t(" Bobby provides market analysis and simulated trading signals, not personalized investment advice. All of Bobby's own trading is paper/simulated. Past performance — including any verified win rate — does not predict future results. Smart contracts carry risk. Verify everything yourself before acting; if you need financial advice, talk to a licensed professional. ", " Bobby ofrece análisis de mercado y señales de trading simulado, no asesoría de inversión personalizada. Todas las operaciones propias de Bobby son simuladas. El rendimiento pasado, incluida cualquier tasa de acierto verificada, no predice resultados futuros. Los contratos inteligentes conllevan riesgos. Verifica todo por tu cuenta antes de actuar; si necesitas asesoría financiera, consulta a un profesional autorizado. ", " O Bobby oferece análises de mercado e sinais de negociação simulada, não aconselhamento de investimento personalizado. Todas as operações próprias do Bobby são simuladas. O desempenho passado, incluindo qualquer taxa de acerto verificada, não prevê resultados futuros. Contratos inteligentes envolvem riscos. Verifique tudo por conta própria antes de agir; se precisar de orientação financeira, consulte um profissional habilitado. ")}</p>

        </section>

        <p className="mt-12 font-mono text-[11px] text-[#A39C91]">{t(" See the proofs: ", " Consulta las pruebas: ", " Veja as provas: ")}<a href="/protocol/calls" className="text-[#A39C91] underline-offset-2 hover:underline">{t("verifiable calls ledger", "registro de señales verificables", "registro de sinais verificáveis")}</a>
        </p>
      </div>
    </ProtocolLayout>
  );
}
