// /protocol/bounty — real money for breaking Bobby (mainnet blocker #3).
// Amounts approved 2026-08-19. Funding goes live after the mainnet Safe handoff;
// the terms are published now so hunters can start reading the code today.
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';
import { ArrowUpRight, Bug, Swords, Trophy } from 'lucide-react';

const GH = 'https://github.com/anthonysurfermx/Bobby-Agent-Trader';

const TIERS: Array<[string, string, string]> = [
  [
    '$2,500 · Critical',
    'Falsify the VERIFIED track record, steal escrowed funds, or bypass the oracle gate (commit/resolve/challenge accepting evidence it must reject).',
    'The claims on the risk page are the spec — break one and this tier is yours.',
  ],
  [
    '$500 · High',
    'Degrade a core guarantee without direct falsification: challenge window bypass, ledger mixing (VERIFIED/ATTESTED), pause bypass, ownership escalation.',
    'Anything that makes the scoreboard lie by omission.',
  ],
  [
    '$150 · Medium',
    'Griefing or DoS at the contract level (blocking legitimate commits/resolves/challenges), state corruption without record falsification.',
    'Public RPC outages and gas-price griefing are out of scope.',
  ],
  [
    '$100 · Valid challenge',
    'First successful stop-breach challenge on any mainnet call the protocol missed — the reclassification tx is the proof.',
    'Paid per call, first challenger wins. The breach scanner on the calls page does the scouting for you.',
  ],
];

export default function BobbyBountyPage() {
  const { t } = useProtocolLanguage();
  return (
    <ProtocolLayout active="bounty">
      <Helmet>
        <title>{t("Bug Bounty — Bobby Protocol", "Recompensas por errores — Bobby Protocol", "Recompensas por falhas — Bobby Protocol")}</title>
        <meta name="description" content="Real rewards for breaking Bobby's track record, contracts or challenge mechanism. $5,000 initial pool." />
      </Helmet>


      <div className="protocol-content">


        <header className="protocol-hero">
          <p className="protocol-eyebrow">{t("Security / Bug bounty", "Seguridad / Recompensas", "Segurança / Recompensas")}</p>
          <h1 className="protocol-title">{t("Break Bobby.", "Rompe a Bobby.", "Quebre o Bobby.")}<br /><span className="text-[#A39C91]">{t("Make it stronger.", "Hazlo más fuerte.", "Deixe-o mais forte.")}</span></h1>
          <p className="protocol-lead">{t(" Being wrong in public is part of the design — paying you to prove it is too. ", " Equivocarse en público es parte del diseño. Pagarte por demostrarlo, también. ", " Errar em público faz parte do projeto. Pagar você para provar isso, também. ")}<b className="font-medium text-[#F2EDE4]">{t(" $5,000 USDC initial pool", " Fondo inicial de $5,000 USDC", " Fundo inicial de $5.000 USDC")}</b>{t(". The contracts are deployed on Base; funding activates after the 2-of-3 Safe handoff and post-deploy gates. Terms are live now; start reading the code. ", ". Los contratos están desplegados en Base; el fondo se activa tras el traspaso al Safe 2 de 3 y las comprobaciones posteriores. Los términos ya están publicados; puedes revisar el código. ", ". Os contratos estão implantados na Base; o fundo é ativado após a transferência ao Safe 2 de 3 e as verificações posteriores. Os termos já estão publicados; comece a revisar o código. ")}</p>
          <a href={`${GH}/tree/main/contracts/src`} target="_blank" rel="noreferrer" className="protocol-button-secondary mt-7 inline-flex items-center gap-2">{t(" Explore the contracts ", " Explora los contratos ", " Explore os contratos ")}<ArrowUpRight className="h-4 w-4" />
          </a>
        </header>

        <section className="grid gap-5 md:grid-cols-2" aria-label="Reward tiers">
          {TIERS.map(([amount, scope, note]) => (
            <article key={amount} className="protocol-panel flex flex-col p-6 md:p-8">
              <div className="mb-6 flex items-center justify-between">
                <span className="protocol-eyebrow">{amount.split(' · ')[1]}</span>
                {amount.includes('challenge') ? <Swords className="h-4 w-4 text-[#d6c6ed]" /> : <Bug className="h-4 w-4 text-[#d6c6ed]" />}
              </div>
              <div className="text-4xl font-light tracking-[-0.05em] text-[#F2EDE4]">
                {amount.split(' · ')[0]} <span className="font-mono text-xs tracking-normal text-[#8A8378]">USDC</span>
              </div>
              <p className="mt-6 text-sm leading-7 text-[#A39C91]">{scope}</p>
              <p className="mt-6 border-t border-[#F2EDE4]/[0.08] pt-4 text-xs leading-6 text-[#8A8378]">{note}</p>
            </article>
          ))}
        </section>

        <h2 className="protocol-section-title mt-16">{t("Scope", "Alcance", "Escopo")}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-[#A39C91]">
          <li><b className="text-[#F2EDE4]">{t("In:", "Incluido:", "Incluído:")}</b>{t(" the frozen contracts (", " los contratos congelados (", " os contratos congelados (")}<code className="rounded bg-white/10 px-1.5 text-xs">contracts/src</code>{t(", release 11532f4), the recorder pipeline, the verifiable-calls ledger and challenge scanner (spoofing counts).", ", versión 11532f4), el proceso de registro, el historial de señales verificables y el escáner de desafíos (incluida la suplantación).", ", versão 11532f4), o processo de registro, o histórico de sinais verificáveis e o scanner de desafios (incluindo falsificação).")}</li>
          <li><b className="text-[#F2EDE4]">{t("Out:", "Excluido:", "Excluído:")}</b>{t(" public RPC outages, social engineering, findings already documented on the ", " caídas de RPC públicos, ingeniería social, hallazgos ya documentados en la ", " quedas de RPCs públicos, engenharia social, achados já documentados na ")}<a href="/protocol/risk" className="text-[#d6c6ed] hover:text-white">{t("risk page", "página de riesgos", "página de riscos")}</a>{t(" as accepted trust assumptions, and testnet-only issues with no mainnet equivalent.", " como supuestos de confianza aceptados y problemas exclusivos de testnet sin equivalente en mainnet.", " como premissas de confiança aceitas e problemas exclusivos da testnet sem equivalente na mainnet.")}</li>
          <li>{t("First valid report per finding wins. Duplicates split nothing — check the ", "Gana el primer informe válido de cada hallazgo. Los duplicados no comparten recompensa. Revisa las ", "O primeiro relatório válido de cada achado vence. Duplicatas não dividem recompensa. Revise as ")}<a href="/protocol/audits" className="text-[#d6c6ed] hover:text-white">{t("audit trail", "auditorías", "auditorias")}</a>{t(" first: four P1s are already dead.", " primero: cuatro P1 ya están resueltos.", " primeiro: quatro P1 já foram resolvidos.")}</li>
        </ul>

        <h2 className="protocol-section-title mt-16">{t("How to report", "Cómo reportar", "Como reportar")}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-[#A39C91]">
          <li><b className="text-[#F2EDE4]">{t("Vulnerabilities:", "Vulnerabilidades:", "Vulnerabilidades:")}</b>{t(" private disclosure via ", " divulgación privada mediante ", " divulgação privada via ")}<a href={`${GH}/security/advisories/new`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#d6c6ed] hover:text-white">GitHub Security Advisories <ArrowUpRight className="h-3 w-3" /></a>{t(" — include a reproduction. 90-day coordinated disclosure.", " — incluye una reproducción. Divulgación coordinada de 90 días.", " — inclua uma reprodução. Divulgação coordenada em 90 dias.")}</li>
          <li><b className="text-[#F2EDE4]">{t("Challenges:", "Desafíos:", "Desafios:")}</b>{t(" no report needed — the reclassification tx IS the claim. Drop the tx hash in a ", " no hace falta informe: la transacción de reclasificación ES la prueba. Publica su hash en un ", " não é necessário relatório: a transação de reclassificação É a prova. Publique seu hash em uma ")}<a href={`${GH}/issues/new`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#d6c6ed] hover:text-white">{t("GitHub issue ", "issue de GitHub ", "issue do GitHub ")}<ArrowUpRight className="h-3 w-3" /></a>{t(" with your payout address.", " con tu dirección de pago.", " com seu endereço de pagamento.")}</li>
          <li>{t("Payouts in USDC on Base within 14 days of validation, from the treasury Safe. Public hall of fame — or stay anon, your call.", "Pagos en USDC en Base dentro de los 14 días tras la validación, desde el Safe de tesorería. Reconocimiento público o anonimato: tú eliges.", "Pagamentos em USDC na Base em até 14 dias após a validação, pelo Safe da tesouraria. Reconhecimento público ou anonimato: você escolhe.")}</li>
        </ul>

        <div className="mt-12 flex items-start gap-4 rounded-[24px] border border-amber-400/20 bg-amber-400/[0.04] p-6 md:p-8">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-sm leading-6 text-[#A39C91]">
            <b className="text-amber-200">{t("Program status:", "Estado del programa:", "Estado do programa:")}</b>{t(" contracts deployed; pool activation is staged behind Safe acceptance, verification and soak. Reports are accepted now — anything valid found before funding still pays when the pool activates. ", " contratos desplegados; el fondo se activa tras la aceptación del Safe, la verificación y la observación. Ya aceptamos informes: los hallazgos válidos previos a la financiación se pagarán cuando se active el fondo. ", " contratos implantados; o fundo é ativado após a aceitação do Safe, verificação e observação. Já aceitamos relatórios: achados válidos anteriores ao financiamento serão pagos quando o fundo for ativado. ")}</p>
        </div>

        <p className="mt-10 font-mono text-[11px] leading-5 text-[#A39C91]">{t(" See also: ", " Consulta también: ", " Veja também: ")}<a href="/protocol/calls" className="text-[#A39C91] underline-offset-2 hover:underline">{t("verifiable calls", "señales verificables", "sinais verificáveis")}</a> ·{' '}
          <a href="/protocol/audits" className="text-[#A39C91] underline-offset-2 hover:underline">{t("audit trail", "auditorías", "auditorias")}</a> ·{' '}
          <a href="/protocol/risk" className="text-[#A39C91] underline-offset-2 hover:underline">{t("risk & claims", "riesgos y afirmaciones", "riscos e afirmações")}</a>
        </p>
      </div>
    </ProtocolLayout>
  );
}
