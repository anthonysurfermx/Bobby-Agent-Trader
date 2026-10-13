// /protocol/audits — the adversarial audit trail, published in full.
// Summaries in English for CT; every card links the complete (Spanish) report
// in the public repo. The chain is the point: every round tried to break the
// previous fix, verdicts were NO-GO until fixed, and each fix was re-audited.
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';
import { ArrowUpRight, ShieldAlert } from 'lucide-react';

const GH = 'https://github.com/anthonysurfermx/Bobby-Agent-Trader/blob';

interface Round {
  name: string;
  date: string;
  verdict: string;
  finding: string;
  fix: string;
  href: string;
}

const ROUNDS: Round[] = [
  {
    name: 'Round 1',
    date: '2026-08-17',
    verdict: 'NO-GO → fixed',
    finding: 'A1-1 (P1): the Hermes fetch pattern could not satisfy parsePriceFeedUpdatesUnique against ~1 Hz feeds — VERIFIED commits and resolves reverted against the real Pyth. Mocks had hidden it by modeling an impossible feed cadence (A1-3).',
    fix: 'Fetch pattern rebuilt against real Hermes cadence; mocks corrected so they can no longer hide it. A1-2 (TTL-boundary breach race) closed; a bounded residual documented.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round1.md`,
  },
  {
    name: 'Round 2 — Codex',
    date: '2026-08-17',
    verdict: 'NO-GO → fixed',
    finding: 'A2-1 (P1): the round-1 fix reintroduced cherry-picking — a non-Unique parse over [now−600s, now] let the recorder retroactively pick the most favorable signed tick as the oracle entry.',
    fix: 'Entry re-anchored to a declared entryAt under Unique semantics: given the anchor, the evidence tick is deterministic.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round2.md`,
  },
  {
    name: 'Round 3 — Codex',
    date: '2026-08-18',
    verdict: 'NO-GO → fixed',
    finding: 'A3-1 (P1): the round-2 residual was still bounded backdating — with the market already observed, the recorder could choose WHICH past instant to anchor (up to 600s back). Unique makes the evidence deterministic, not the timing honest.',
    fix: 'Two-step announce → commit: the announcement fixes the anchor on-chain BEFORE the evidence can be known.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round3.md`,
  },
  {
    name: 'Round 4 — Codex',
    date: '2026-08-18',
    verdict: 'NO-GO → fixed',
    finding: 'A4-1 (P1): same-block announce+commit — the contract only required entryAt == announcedAt, so a malicious recorder holding the current second’s Pyth update could bundle both in one block. “Announcement precedes evidence” was not enforced by code.',
    fix: 'Derived FUTURE anchor: entryAt = announcedAt + 10s, strictly in the announce block’s future — its tick cannot exist when the anchor is fixed. Codex also ratified the round-1 residual (A1-2) as acceptable: the exact TTL boundary favors the challenger and expiries are public.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round4.md`,
  },
  {
    name: 'Round 5 — Freeze & live PoC',
    date: '2026-08-18',
    verdict: 'GO (frozen)',
    finding: 'Final pass over the round-4 commit: storage-layout snapshot pinned in CI, artifact hashes recorded, and a proof-of-concept exercising the full VERIFIED path (announce → commit → resolve → challenge) against the REAL Pyth contract with signed Hermes updates.',
    fix: 'Release frozen at 11532f4 · 216/216 tests (forge test, 0 skipped) · viaIR 24,094 bytes runtime (482 B under EIP-170). The Sepolia canary you can inspect on the calls page runs this exact build.',
    href: `${GH}/feat/trackrecord-v2/docs/audit/trackrecord-v2-freeze.md`,
  },
];

export default function BobbyAuditsPage() {
  const { t } = useProtocolLanguage();
  return (
    <ProtocolLayout active="audits">
      <Helmet>
        <title>{t("Audit Trail — Bobby Protocol", "Auditorías — Bobby Protocol", "Auditorias — Bobby Protocol")}</title>
        <meta name="description" content="Five adversarial audit rounds on BobbyTrackRecordV2 — findings, severities and fixes, published in full." />
      </Helmet>


      <div className="protocol-content">


        <header className="protocol-hero">
          <p className="protocol-eyebrow">{t("Security / Audit trail", "Seguridad / Auditorías", "Segurança / Auditorias")}</p>
          <h1 className="protocol-title">{t("Test the claim.", "Pon a prueba la promesa.", "Teste a promessa.")}<br /><span className="text-[#A39C91]">{t("Publish the findings.", "Publica los hallazgos.", "Publique os resultados.")}</span></h1>
          <p className="protocol-lead">{t(" Five adversarial rounds on the track-record contract. Every round attacked the previous round's fix, verdicts stayed ", " Cinco rondas adversariales sobre el contrato de historial. Cada ronda atacó la corrección de la anterior; los veredictos siguieron siendo ", " Cinco rodadas adversariais sobre o contrato de histórico. Cada rodada atacou a correção da anterior; os veredictos permaneceram ")}<b className="font-medium text-[#F2EDE4]">{t("NO-GO until fixed", "NO-GO hasta corregirse", "NO-GO até a correção")}</b>{t(", and every fix was re-audited. Four P1s found and killed — being wrong in public is part of the design. ", ", y cada corrección volvió a auditarse. Cuatro P1 encontrados y resueltos: equivocarse en público es parte del diseño. ", ", e cada correção foi auditada novamente. Quatro P1 encontrados e resolvidos: errar em público faz parte do projeto. ")}</p>
        </header>

        <div className="protocol-panel flex flex-col gap-5 p-6 md:flex-row md:items-start md:gap-12 md:p-8">
          <div className="protocol-eyebrow shrink-0 pt-1">{t("Release status · Base mainnet", "Estado de la versión · Base mainnet", "Estado da versão · Base mainnet")}</div>
          <p className="max-w-2xl text-sm leading-7 text-[#A39C91]">{t("The audited seven-contract release is deployed on chain 8453. Ownership acceptance, runtime verification, mainnet canary and soak remain mandatory before public writes.", "La versión auditada de siete contratos está desplegada en la red 8453. La aceptación de propiedad, verificación en ejecución, canario y observación en mainnet siguen siendo obligatorios antes de habilitar escrituras públicas.", "A versão auditada de sete contratos está implantada na rede 8453. A aceitação de propriedade, verificação em execução, canário e observação na mainnet continuam obrigatórios antes de habilitar escritas públicas.")}</p>
        </div>

        <section className="protocol-section">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="protocol-section-title">{t("An open record of review.", "Un registro abierto de revisión.", "Um registro aberto de revisão.")}</h2>
            <span className="protocol-eyebrow">{t("05 rounds / 04 P1 findings", "05 rondas / 04 hallazgos P1", "05 rodadas / 04 achados P1")}</span>
          </div>
          <div className="space-y-5">
          {ROUNDS.map((r, index) => (
            <article key={r.name} className="protocol-panel grid gap-5 p-6 md:grid-cols-[56px_1fr] md:gap-8 md:p-8">
              <span className="font-mono text-sm text-[#8A8378]">0{index + 1}</span>
              <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-lg font-normal tracking-tight text-[#F2EDE4]">
                  <ShieldAlert className="h-4 w-4 text-[#d6c6ed]" /> {r.name}
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em]">
                  <span className="text-[#A39C91]">{r.date}</span>
                  <span className={`rounded-full border px-2.5 py-1 font-bold ${r.verdict.startsWith('GO') ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}>
                    {r.verdict}
                  </span>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-[#A39C91]">{r.finding}</p>
              <p className="mt-4 border-t border-[#F2EDE4]/[0.08] pt-4 text-sm leading-7 text-[#A39C91]"><b className="font-mono text-[11px] uppercase tracking-[0.12em] text-emerald-300/80">{t("Fix · ", "Corrección · ", "Correção · ")}</b>{r.fix}</p>
              <a href={r.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#d6c6ed] transition hover:text-white">{t(" Full report ", " Informe completo ", " Relatório completo ")}<ArrowUpRight className="h-3 w-3" />
              </a>
              </div>
            </article>
          ))}
          </div>
        </section>

        <p className="mt-10 font-mono text-[11px] leading-5 text-[#A39C91]">{t(" Reports are the working documents, unedited (Spanish). See also:", " Los informes son los documentos de trabajo originales, en español. Consulta también:", " Os relatórios são os documentos de trabalho originais, em espanhol. Veja também:")}{' '}
          <a href="/protocol/calls" className="text-[#A39C91] underline-offset-2 hover:underline">{t("verifiable calls", "señales verificables", "sinais verificáveis")}</a> ·{' '}
          <a href="/protocol/risk" className="text-[#A39C91] underline-offset-2 hover:underline">{t("risk & claims", "riesgos y afirmaciones", "riscos e afirmações")}</a>
        </p>
      </div>
    </ProtocolLayout>
  );
}
