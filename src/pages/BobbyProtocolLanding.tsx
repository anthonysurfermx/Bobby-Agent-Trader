import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Check,
  ArrowUpRight,
  CircleDollarSign,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';

type Price = { symbol: string; price: number; change24h: number };

interface ProtocolStats {
  fetchedAt?: string;
  chain?: {
    id?: number;
    name?: string;
    nativeSymbol?: string;
    explorerUrl?: string;
    blockNumber?: number;
  };
  treasury?: { balanceNative?: string };
  contracts?: {
    agentEconomy?: {
      address?: string;
      stats?: {
        totalDebates?: string;
        totalMcpCalls?: string;
        totalVolumeNative?: string;
      };
    };
    convictionOracle?: { address?: string; stats?: { symbolCount?: string } };
    trackRecord?: {
      address?: string;
      stats?: {
        totalTrades?: string;
        totalCommitments?: string;
        winRateBps?: string;
      };
    };
    adversarialBounties?: {
      address?: string;
      totalPosted?: number;
      verified?: boolean;
      minBounty?: { minBountyNative?: string };
    };
    hardnessRegistry?: { address?: string; agentRegistered?: boolean };
    agentRegistry?: { address?: string; type?: string; agents?: number };
  };
  protocolTotals?: { totalInteractions?: number; mcpPayments?: number };
  onchainRecord?: {
    available?: boolean;
    commitmentsCreated?: number;
    decisionsResolved?: number;
    pending?: number;
    winRate?: number | null;
  };
  debateActivity?: {
    totalDebates?: number;
    commitmentsCreated?: number;
    decisionsResolved?: number;
    expired?: number;
    pending?: number;
    wins?: number;
    losses?: number;
    winRate?: number;
    resolutionRate?: number;
  };
  market?: { prices?: Price[] };
}

const formatLocaleNumber = (
  value: unknown,
  fallback = '—',
  locale = 'en-US',
) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(locale) : fallback;
};

const price = (stats: ProtocolStats | null, symbol: string) =>
  stats?.market?.prices?.find((item) => item.symbol === symbol);

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/bobby-protocol-stats', {
        cache: 'no-store',
      });
      if (response.ok) setStats((await response.json()) as ProtocolStats);
    } catch {
      // The page remains useful as a product overview when live RPC data is unavailable.
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return stats;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 border-t border-[#F2EDE4]/10 pt-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#A39C91]">
        {label}
      </div>
      <div className="mt-4 break-words text-3xl font-light tracking-[-0.04em] text-[#F2EDE4]">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-[#A39C91]">{detail}</div>
    </div>
  );
}

export default function BobbyProtocolLanding() {
  const { t, locale } = useProtocolLanguage();
  const formatNumber = (value: unknown, fallback = '—') =>
    formatLocaleNumber(value, fallback, locale);
  const stats = useProtocolStats();
  const btc = price(stats, 'BTC');
  // Debates, decisions and win rate come from the public resolution ledger.
  // MCP calls and interactions come from AgentEconomy on Base mainnet. Each
  // row states its provenance so historical outcomes are not mixed with live
  // contract counters.
  const publicRecord = stats?.debateActivity;
  const totalDebates =
    publicRecord?.totalDebates ??
    stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const liveChainDebates = stats?.contracts?.agentEconomy?.stats?.totalDebates;
  const totalMcpCalls = stats?.contracts?.agentEconomy?.stats?.totalMcpCalls;
  const onchainRecord = stats?.onchainRecord;
  const totalTrades =
    publicRecord?.commitmentsCreated ??
    stats?.contracts?.trackRecord?.stats?.totalTrades;
  const totalInteractions = stats?.protocolTotals?.totalInteractions;
  const winRate = publicRecord?.decisionsResolved ? publicRecord.winRate : null;

  // Audit Base r4: a percentage over a tiny sample reads as skill when it is
  // noise. Below this many decided outcomes we show raw counts, never a rate.
  const WIN_RATE_MIN_SAMPLE = 20;
  const formatWinRate = (
    rate: number | null | undefined,
    resolved: number | null | undefined,
    wins?: number | null,
    losses?: number | null,
  ) => {
    if (rate === null || rate === undefined || !resolved) return '—';
    if (resolved < WIN_RATE_MIN_SAMPLE) {
      return wins !== undefined &&
        wins !== null &&
        losses !== undefined &&
        losses !== null
        ? `${wins}${t('W', 'A', 'A')} / ${losses}${t('L', 'F', 'E')}`
        : `n=${resolved}`;
    }
    return `${Number(rate).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% (n=${resolved})`;
  };
  const chainLabel = stats?.chain?.name || 'Base';
  const provenanceNote =
    t(
      `Debates, decisions and win rate: public resolution ledger. MCP calls and interactions: AgentEconomy on ${chainLabel}.`,
      `Debates, decisiones y tasa de acierto: registro público de resultados. Llamadas MCP e interacciones: AgentEconomy en ${chainLabel}.`,
      `Debates, decisões e taxa de acerto: registro público de resultados. Chamadas MCP e interações: AgentEconomy na ${chainLabel}.`,
    ) +
    (liveChainDebates !== undefined
      ? ' ' +
        t(
          `${formatNumber(liveChainDebates, '0')} debates settled there so far.`,
          `${formatNumber(liveChainDebates, '0')} debates resueltos allí hasta ahora.`,
          `${formatNumber(liveChainDebates, '0')} debates resolvidos lá até agora.`,
        )
      : '');
  const nativeSymbol = stats?.chain?.nativeSymbol || 'ETH';
  const telemetryUpdatedAt = stats?.fetchedAt
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(stats.fetchedAt))
    : null;

  const explorerAddressUrl = `${stats?.chain?.explorerUrl || 'https://basescan.org'}/address`;
  const c = stats?.contracts;
  const proofPoints = [
    {
      label: t(
        'On-chain record (since the Base cut-over)',
        'Registro on-chain (desde la migración a Base)',
        'Registro on-chain (desde a migração para Base)',
      ),
      value: formatWinRate(
        onchainRecord?.winRate,
        onchainRecord?.decisionsResolved,
      ),
      detail:
        onchainRecord && onchainRecord.available !== false
          ? `${formatNumber(onchainRecord.decisionsResolved, '0')} ${t('resolved', 'resueltos', 'resolvidos')} · ${formatNumber(onchainRecord.pending, '0')} ${t('pending', 'pendientes', 'pendentes')} · ${formatNumber(onchainRecord.commitmentsCreated, '0')} ${t('commitments', 'compromisos', 'compromissos')}`
          : onchainRecord
            ? t(
                'TrackRecord unavailable right now.',
                'TrackRecord no está disponible ahora.',
                'TrackRecord indisponível no momento.',
              )
            : t(
                'Waiting for the TrackRecord contract.',
                'Esperando los datos del contrato TrackRecord.',
                'Aguardando os dados do contrato TrackRecord.',
              ),
      proof: t(
        'TrackRecord contract',
        'Contrato TrackRecord',
        'Contrato TrackRecord',
      ),
      href: `${explorerAddressUrl}/${c?.trackRecord?.address ?? ''}`,
    },
    {
      label: t(
        'Public debate ledger',
        'Registro público de debates',
        'Registro público de debates',
      ),
      value: publicRecord
        ? `${formatNumber(publicRecord.decisionsResolved, '0')} ${t('resolved', 'resueltos', 'resolvidos')}`
        : '—',
      detail: publicRecord
        ? `${formatNumber(publicRecord.pending, '0')} ${t('pending', 'pendientes', 'pendentes')} · ${formatNumber(publicRecord.expired, '0')} ${t('expired', 'vencidos', 'expirados')} · ${formatWinRate(publicRecord.winRate, publicRecord.decisionsResolved, publicRecord.wins, publicRecord.losses)}`
        : t(
            'Waiting for the public resolution ledger.',
            'Esperando el registro público de resultados.',
            'Aguardando o registro público de resultados.',
          ),
      proof: t(
        'Resolution ledger',
        'Registro de resultados',
        'Registro de resultados',
      ),
      href: '#protocol-metrics',
    },
    {
      label: t(
        'Adversarial bounties',
        'Recompensas por refutación',
        'Recompensas por refutação',
      ),
      value: formatNumber(c?.adversarialBounties?.totalPosted),
      detail: t(
        'Open bounties paid for breaking Bobby’s own reasoning. Being wrong in public is part of the design.',
        'Recompensas abiertas por refutar el razonamiento de Bobby. Equivocarse en público forma parte del diseño.',
        'Recompensas abertas por refutar o raciocínio do Bobby. Errar em público faz parte do projeto.',
      ),
      proof: t(
        'AdversarialBounties contract',
        'Contrato AdversarialBounties',
        'Contrato AdversarialBounties',
      ),
      href: `${explorerAddressUrl}/${c?.adversarialBounties?.address ?? ''}`,
    },
    {
      label: t('Contracts live', 'Contratos activos', 'Contratos ativos'),
      value: '6',
      detail: t(
        'Registry, economy, oracle, track record, bounties and identity — all deployed and explorer-verified.',
        'Registro, economía, oráculo, historial, recompensas e identidad: todos desplegados y verificados en el explorador.',
        'Registro, economia, oráculo, histórico, recompensas e identidade: todos implantados e verificados no explorador.',
      ),
      proof: t(
        'AgentEconomy V2 contract',
        'Contrato AgentEconomy V2',
        'Contrato AgentEconomy V2',
      ),
      href: `${explorerAddressUrl}/${c?.agentEconomy?.address ?? ''}`,
    },
  ];

  const procedure = [
    {
      icon: Bot,
      title: t('Find the idea', 'Encuentra la idea', 'Encontre a ideia'),
      label: t('Thesis', 'Tesis', 'Tese'),
      text: t(
        'A clear market setup with a clear invalidation.',
        'Una tesis de mercado clara y una condición que la invalide.',
        'Uma tese de mercado clara e uma condição que a invalide.',
      ),
      state: t('Proposed', 'Propuesta', 'Proposta'),
    },
    {
      icon: ShieldCheck,
      title: t('Attack the idea', 'Cuestiona la idea', 'Questione a ideia'),
      label: t('Debate', 'Debate', 'Debate'),
      text: t(
        'An independent Red Team looks for what can break it.',
        'Un Red Team independiente busca qué podría refutarla.',
        'Um Red Team independente busca o que poderia refutá-la.',
      ),
      state: t('Challenged', 'Cuestionada', 'Questionada'),
    },
    {
      icon: CircleDollarSign,
      title: t(
        'Protect the capital',
        'Protege el capital',
        'Proteja o capital',
      ),
      label: t('Risk veto', 'Veto de riesgo', 'Veto de risco'),
      text: t(
        'Size, downside and invalidation are checked. Risk can pass, pause or block.',
        'Se revisan el tamaño, la pérdida potencial y la invalidación. El control de riesgo puede aprobar, pausar o bloquear.',
        'Tamanho, perda potencial e invalidação são verificados. O controle de risco pode aprovar, pausar ou bloquear.',
      ),
      state: t('Gated', 'Evaluada', 'Avaliada'),
    },
    {
      icon: Check,
      title: t('Leave the record', 'Deja constancia', 'Deixe um registro'),
      label: t('Public proof', 'Prueba pública', 'Prova pública'),
      text: t(
        'The decision is visible before the market delivers its outcome.',
        'La decisión es visible antes de que el mercado dé su resultado.',
        'A decisão fica visível antes de o mercado entregar seu resultado.',
      ),
      state: t('Recorded', 'Registrada', 'Registrada'),
    },
  ];

  const resources = [
    [
      t('Architecture', 'Arquitectura', 'Arquitetura'),
      '/protocol/architecture',
    ],
    [t('Console', 'Consola', 'Console'), '/protocol/console'],
    [
      t('Sandbox', 'Entorno de pruebas', 'Ambiente de testes'),
      '/protocol/sandbox',
    ],
    [
      t('Heartbeat', 'Estado de contratos', 'Estado dos contratos'),
      '/protocol/heartbeat',
    ],
    [t('Network', 'Red', 'Rede'), '/protocol/network'],
    [
      t('Docs & MCP', 'Documentación y MCP', 'Documentação e MCP'),
      '/protocol/docs',
    ],
    [
      t('Playbooks', 'Guías operativas', 'Guias operacionais'),
      '/protocol/playbooks',
    ],
    [
      t('Harness', 'Banco de pruebas', 'Estrutura de testes'),
      '/protocol/harness',
    ],
    [t('War Room', 'Sala de análisis', 'Sala de análise'), '/desk'],
    [t('Track record', 'Historial', 'Histórico'), '/record'],
    [
      t('Analytics', 'Analítica', 'Análise de dados'),
      '/agentic-world/bobby/analytics',
    ],
    [t('Agents', 'Agentes', 'Agentes'), '/agentic-world/bobby/agents'],
  ];

  return (
    <ProtocolLayout active="protocol">
      <Helmet>
        <title>
          {t(
            'Bobby Protocol — Refuted before execution',
            'Bobby Protocol — Refutado antes de ejecutar',
            'Bobby Protocol — Refutado antes de executar',
          )}
        </title>
        <meta
          name="description"
          content={t(
            'The rules behind every answer Bobby gives about a market. Before you see an answer, a second system tries to break it, a risk check can block it, and the call is written down before the outcome.',
            'Las reglas detrás de cada respuesta de Bobby sobre un mercado. Antes de verla, otro sistema intenta refutarla, un control de riesgo puede bloquearla y la decisión se registra antes del resultado.',
            'As regras por trás de cada resposta do Bobby sobre um mercado. Antes de vê-la, outro sistema tenta refutá-la, um controle de risco pode bloqueá-la e a decisão é registrada antes do resultado.',
          )}
        />
      </Helmet>

      <section className="relative grid gap-12 pb-16 pt-12 md:pb-24 md:pt-20 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="protocol-eyebrow">
            {t(
              'Bobby Protocol / The procedure',
              'Bobby Protocol / El procedimiento',
              'Bobby Protocol / O procedimento',
            )}
          </p>
          <h1
            className="mt-6 text-[clamp(3.2rem,6.6vw,6.8rem)] font-light leading-[1.04] tracking-[-0.065em]"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {t('The rules', 'Las reglas', 'As regras')}
            <br />

            {t(
              'behind the read.',
              'detrás del análisis.',
              'por trás da análise.',
            )}
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-[#A39C91]">
            {t(
              'No decision is approved without being refuted. A second system challenges the answer, a risk check can block it, and the call is written down before the outcome.',
              'Ninguna decisión se aprueba sin ser refutada. Otro sistema cuestiona la respuesta, un control de riesgo puede bloquearla y la decisión se registra antes del resultado.',
              'Nenhuma decisão é aprovada sem ser refutada. Outro sistema questiona a resposta, um controle de risco pode bloqueá-la e a decisão é registrada antes do resultado.',
            )}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#rules" className="protocol-button">
              {t('Read the rules', 'Lee las reglas', 'Leia as regras')}{' '}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/protocol/calls" className="protocol-button-secondary">
              {t(
                'Inspect a verdict',
                'Examina un veredicto',
                'Examine um veredicto',
              )}{' '}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-7 max-w-lg text-sm leading-6 text-[#A39C91]">
            {t(
              'The same models everyone else uses. A different procedure around them.',
              'Los mismos modelos que usan todos. Un procedimiento distinto a su alrededor.',
              'Os mesmos modelos que todos usam. Um procedimento diferente ao redor deles.',
            )}
          </p>
        </motion.div>

        <div
          className="protocol-panel relative isolate flex min-h-[380px] flex-col justify-between overflow-hidden p-8 sm:min-h-[440px] sm:p-10"
          aria-label={t(
            'The two principles of Bobby Protocol',
            'Los dos principios de Bobby Protocol',
            'Os dois princípios do Bobby Protocol',
          )}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-[230px] top-1/2 -z-10 h-[620px] w-[620px] -translate-y-1/2 rounded-full border border-[#bca8eb]/20 bg-[#0b0a09] shadow-[-32px_0_80px_-26px_rgba(133,103,194,0.35)]"
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A39C91]">
            {t(
              'Independent challenge. Public proof.',
              'Refutación independiente. Prueba pública.',
              'Refutação independente. Prova pública.',
            )}
          </p>
          <div className="space-y-8 py-10">
            <div>
              <span className="font-mono text-xs text-[#bca8eb]">I</span>
              <p className="mt-3 max-w-[240px] text-3xl font-light leading-tight tracking-[-0.035em]">
                {t('Refuted before', 'Refutado antes', 'Refutado antes')}
                <br />

                {t('execution.', 'de ejecutar.', 'de executar.')}
              </p>
            </div>
            <div>
              <span className="font-mono text-xs text-[#bca8eb]">II</span>
              <p className="mt-3 max-w-[260px] text-3xl font-light leading-tight tracking-[-0.035em]">
                {t('Published before', 'Publicado antes', 'Publicado antes')}
                <br />

                {t('the outcome.', 'del resultado.', 'do resultado.')}
              </p>
            </div>
          </div>
          <a
            href="/protocol/calls"
            className="flex w-fit items-center gap-3 text-sm text-[#A39C91] transition hover:text-[#F2EDE4]"
          >
            {t(
              'See verified calls',
              'Ver decisiones verificadas',
              'Ver decisões verificadas',
            )}{' '}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-y border-[#F2EDE4]/10 py-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#A39C91]">
        <span className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${stats ? 'bg-[#bca8eb]' : 'bg-[#A39C91]'}`}
          />
          {telemetryUpdatedAt
            ? `${t('Updated', 'Actualizado', 'Atualizado')} ${telemetryUpdatedAt}`
            : t(
                'Awaiting live protocol data',
                'Esperando datos del protocolo',
                'Aguardando dados do protocolo',
              )}
        </span>
        <span>
          {stats?.chain?.blockNumber
            ? `${chainLabel} · ${t('block', 'bloque', 'bloco')} ${formatNumber(stats.chain.blockNumber)}`
            : `${chainLabel} · ${t('on-chain verification', 'verificación on-chain', 'verificação on-chain')}`}
        </span>
        <span>
          {btc ? `BTC $${btc.price.toLocaleString(locale)}` : 'BTC —'}
        </span>
        <a
          href="/record"
          className="flex items-center gap-2 transition hover:text-[#F2EDE4]"
        >
          {formatNumber(totalTrades)}{' '}
          {t(
            'decisions committed',
            'decisiones registradas',
            'decisões registradas',
          )}{' '}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      <section id="rules" className="protocol-section scroll-mt-28">
        <div className="mb-10 grid gap-6 md:grid-cols-[1fr_2fr] md:gap-16">
          <p className="protocol-eyebrow">
            {t(
              '01 / The two rules',
              '01 / Las dos reglas',
              '01 / As duas regras',
            )}
          </p>
          <h2 className="protocol-section-title">
            {t(
              'A good answer should',
              'Una buena respuesta debe',
              'Uma boa resposta deve',
            )}
            <br />

            {t(
              'survive a challenge.',
              'resistir una refutación.',
              'resistir a uma refutação.',
            )}
          </h2>
        </div>
        {[
          [
            'I',
            t(
              'No idea is approved without an independent system working against it.',
              'Ninguna idea se aprueba sin un sistema independiente que la cuestione.',
              'Nenhuma ideia é aprovada sem um sistema independente que a questione.',
            ),
            t(
              'An opposing agent tests the thesis, its assumptions and its downside before a verdict is reached.',
              'Un agente opositor examina la tesis, sus supuestos y sus riesgos antes de llegar a un veredicto.',
              'Um agente opositor examina a tese, suas premissas e seus riscos antes de chegar a um veredicto.',
            ),
          ],
          [
            'II',
            t(
              'No verdict is published after its outcome is known.',
              'Ningún veredicto se publica después de conocer su resultado.',
              'Nenhum veredicto é publicado depois de seu resultado ser conhecido.',
            ),
            t(
              'The call is committed first. The outcome comes later. Both stay in the public record.',
              'Primero se registra la decisión. El resultado viene después. Ambos permanecen en el registro público.',
              'Primeiro, a decisão é registrada. O resultado vem depois. Ambos permanecem no registro público.',
            ),
          ],
        ].map(([number, title, detail]) => (
          <div
            key={number}
            className="grid gap-5 border-t border-[#F2EDE4]/10 py-9 md:grid-cols-[1fr_2fr] md:gap-16"
          >
            <span className="font-mono text-sm text-[#bca8eb]">{number}</span>
            <div>
              <h3 className="max-w-3xl text-2xl font-normal leading-relaxed tracking-[-0.025em] md:text-3xl">
                {title}
              </h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#A39C91]">
                {detail}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section
        id="what-it-does"
        className="protocol-section scroll-mt-28 border-t border-[#F2EDE4]/10"
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-24">
          <div>
            <p className="protocol-eyebrow">
              {t(
                '02 / From idea to decision',
                '02 / De la idea a la decisión',
                '02 / Da ideia à decisão',
              )}
            </p>
            <h2 className="protocol-section-title mt-5">
              {t('Bring a thesis.', 'Propón una tesis.', 'Proponha uma tese.')}
              <br />

              {t(
                'Test the downside.',
                'Examina el riesgo.',
                'Examine o risco.',
              )}
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-[#A39C91]">
              {t(
                'Bobby checks the market first. Opposing agents challenge the idea and give you one clear decision before the result.',
                'Bobby revisa el mercado primero. Agentes opositores cuestionan la idea y te dan una decisión clara antes del resultado.',
                'Bobby analisa o mercado primeiro. Agentes opositores questionam a ideia e entregam uma decisão clara antes do resultado.',
              )}
            </p>
          </div>
          <div>
            {[
              [
                '01',
                t('Bring the idea', 'Propón la idea', 'Proponha a ideia'),
                t(
                  'Start with a market thesis and the conditions that would invalidate it.',
                  'Empieza con una tesis de mercado y las condiciones que la invalidarían.',
                  'Comece com uma tese de mercado e as condições que a invalidariam.',
                ),
              ],
              [
                '02',
                t('Test the downside', 'Examina el riesgo', 'Examine o risco'),
                t(
                  'Opposing agents look for the evidence and assumptions that could break it.',
                  'Agentes opositores buscan las pruebas y los supuestos que podrían refutarla.',
                  'Agentes opositores buscam as evidências e premissas que poderiam refutá-la.',
                ),
              ],
              [
                '03',
                t('Get the call', 'Obtén la decisión', 'Receba a decisão'),
                t(
                  'Pass, pause or block, with a public record you can inspect.',
                  'Aprobar, pausar o bloquear, con un registro público que puedes consultar.',
                  'Aprovar, pausar ou bloquear, com um registro público que você pode consultar.',
                ),
              ],
            ].map(([number, title, detail]) => (
              <div
                key={number}
                className="flex gap-6 border-t border-[#F2EDE4]/10 py-7"
              >
                <span className="pt-1 font-mono text-xs text-[#A39C91]">
                  {number}
                </span>
                <div>
                  <h3 className="text-xl font-normal tracking-[-0.02em]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#A39C91]">
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="architecture"
        className="protocol-section scroll-mt-28 border-t border-[#F2EDE4]/10"
      >
        <div
          id="how-it-works"
          className="mb-10 flex scroll-mt-28 flex-col justify-between gap-6 md:flex-row md:items-end"
        >
          <div>
            <p className="protocol-eyebrow">
              {t(
                '03 / Before capital moves',
                '03 / Antes de mover capital',
                '03 / Antes de mover capital',
              )}
            </p>
            <h2 className="protocol-section-title mt-5">
              {t('One procedure.', 'Un procedimiento.', 'Um procedimento.')}
              <br />

              {t('Four checks.', 'Cuatro controles.', 'Quatro controles.')}
            </h2>
          </div>
          <a
            href="/protocol/architecture"
            className="flex items-center gap-3 text-sm text-[#A39C91] transition hover:text-[#F2EDE4]"
          >
            {t(
              'Explore the architecture',
              'Explora la arquitectura',
              'Explore a arquitetura',
            )}{' '}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {procedure.map(({ icon: Icon, title, label, text, state }, index) => (
            <motion.article
              key={label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay: index * 0.05 }}
              className="protocol-panel flex min-h-[320px] flex-col p-7"
            >
              <div className="flex items-center justify-between text-[#A39C91]">
                <Icon className="h-5 w-5" strokeWidth={1.3} />
                <span className="font-mono text-[10px]">
                  0{index + 1} / {label}
                </span>
              </div>
              <h3 className="mt-12 text-2xl font-normal tracking-[-0.035em]">
                {title}
              </h3>
              <p className="mb-8 mt-4 text-sm leading-6 text-[#A39C91]">
                {text}
              </p>
              <div className="mt-auto border-t border-[#F2EDE4]/10 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#bca8eb]">
                {state}
              </div>
            </motion.article>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[#A39C91]">
          {t(
            'Every idea must survive its own refutation before it moves capital. Alpha proposes the thesis, Red Team attacks the assumptions, and CIO resolves both into one decision.',
            'Toda idea debe resistir su propia refutación antes de mover capital. Alpha propone la tesis, Red Team cuestiona los supuestos y CIO resuelve ambos argumentos en una decisión.',
            'Toda ideia deve resistir à própria refutação antes de mover capital. Alpha propõe a tese, Red Team questiona as premissas e CIO resolve ambos os argumentos em uma decisão.',
          )}
        </p>
      </section>

      <section
        id="capabilities"
        className="protocol-section scroll-mt-28 border-t border-[#F2EDE4]/10"
      >
        <div className="mb-10">
          <p className="protocol-eyebrow">
            {t(
              '04 / What follows every decision',
              '04 / Lo que acompaña cada decisión',
              '04 / O que acompanha cada decisão',
            )}
          </p>
          <h2 className="protocol-section-title mt-5">
            {t(
              'A name. A challenge.',
              'Un nombre. Un desafío.',
              'Um nome. Um desafio.',
            )}
            <br />
            {t(
              'A boundary. A record.',
              'Un límite. Un registro.',
              'Um limite. Um registro.',
            )}
          </h2>
        </div>
        <div className="grid gap-x-12 md:grid-cols-2">
          {[
            [
              t('Identity', 'Identidad', 'Identidade'),
              t(
                'Every decision has a named agent, signer and context. The record follows the agent, making its reputation portable.',
                'Cada decisión tiene un agente identificado, un firmante y un contexto. El registro acompaña al agente y permite llevar su reputación consigo.',
                'Cada decisão tem um agente identificado, um signatário e um contexto. O registro acompanha o agente, tornando sua reputação portátil.',
              ),
            ],
            [
              t(
                'Adversarial debate',
                'Debate adversarial',
                'Debate adversarial',
              ),
              t(
                'Alpha proposes the thesis. Red Team attacks the assumptions. CIO resolves both into one decision.',
                'Alpha propone la tesis. Red Team cuestiona los supuestos. CIO resuelve ambos argumentos en una decisión.',
                'Alpha propõe a tese. Red Team questiona as premissas. CIO resolve ambos os argumentos em uma decisão.',
              ),
            ],
            [
              t('Risk gate', 'Control de riesgo', 'Controle de risco'),
              t(
                'Bobby checks size, downside and invalidation before capital moves. Risk can pass, pause or block.',
                'Bobby revisa el tamaño, la pérdida potencial y la invalidación antes de mover capital. El control de riesgo puede aprobar, pausar o bloquear.',
                'Bobby verifica tamanho, perda potencial e invalidação antes de mover capital. O controle de risco pode aprovar, pausar ou bloquear.',
              ),
            ],
            [
              t('Proof', 'Prueba', 'Prova'),
              t(
                'The thesis and decision are committed on Base before the outcome. Confirmed swaps enter a chain-ordered receipt ledger with FIFO lots and wallet-scoped PnL.',
                'La tesis y la decisión se registran en Base antes del resultado. Los swaps confirmados entran en un registro de comprobantes ordenado por la cadena, con lotes FIFO y PnL por wallet.',
                'A tese e a decisão são registradas na Base antes do resultado. Os swaps confirmados entram em um registro de comprovantes ordenado pela cadeia, com lotes FIFO e PnL por carteira.',
              ),
            ],
          ].map(([title, text], index) => (
            <article key={title} className="border-t border-[#F2EDE4]/10 py-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#A39C91]">
                0{index + 1} {t('/ Capability', '/ Capacidad', '/ Capacidade')}
              </p>
              <h3 className="mt-4 text-2xl font-normal tracking-[-0.025em]">
                {title}
              </h3>
              <p className="mt-4 max-w-lg text-sm leading-7 text-[#A39C91]">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="for-agents"
        className="protocol-section scroll-mt-28 border-t border-[#F2EDE4]/10"
      >
        <div className="mb-10">
          <p className="protocol-eyebrow">
            {t(
              '05 / For agents and people',
              '05 / Para agentes y personas',
              '05 / Para agentes e pessoas',
            )}
          </p>
          <h2 className="protocol-section-title mt-5">
            {t(
              'The same procedure.',
              'El mismo procedimiento.',
              'O mesmo procedimento.',
            )}
            <br />

            {t('Your way in.', 'Tu forma de acceder.', 'Sua forma de acessar.')}
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
          <article className="protocol-panel relative overflow-hidden p-8 md:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[#8b6cbc]/[0.07] blur-3xl"
            />
            <Sparkles className="h-6 w-6 text-[#bca8eb]" strokeWidth={1.3} />
            <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.18em] text-[#A39C91]">
              {t(
                'Agent interface / MCP',
                'Interfaz para agentes / MCP',
                'Interface para agentes / MCP',
              )}
            </p>
            <h3 className="mt-4 text-3xl font-normal tracking-[-0.035em]">
              {t(
                'Give any agent a second layer.',
                'Dale a cualquier agente una segunda capa.',
                'Dê a qualquer agente uma segunda camada.',
              )}
            </h3>
            <p className="mt-5 max-w-lg text-sm leading-7 text-[#A39C91]">
              {t(
                'Connect over MCP. Request conviction, inspect proof, and build Bobby into your execution workflow.',
                'Conecta por MCP. Consulta la convicción, examina las pruebas e integra Bobby en tu flujo de ejecución.',
                'Conecte via MCP. Consulte a convicção, examine as provas e integre Bobby ao seu fluxo de execução.',
              )}
            </p>

            <a
              href="/protocol/docs"
              className="mt-8 inline-flex items-center gap-3 text-sm transition hover:text-[#bca8eb]"
            >
              {t(
                'Read the docs',
                'Lee la documentación',
                'Leia a documentação',
              )}{' '}
              <ArrowRight className="h-4 w-4" />
            </a>
          </article>
          <article className="protocol-panel flex flex-col p-8 md:p-10">
            <Bot className="h-6 w-6 text-[#A39C91]" strokeWidth={1.3} />
            <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.18em] text-[#A39C91]">
              {t('The app / iPhone', 'La app / iPhone', 'O app / iPhone')}
            </p>
            <h3 className="mt-4 text-3xl font-normal tracking-[-0.035em]">
              {t(
                'Bobby, wherever you are.',
                'Bobby, estés donde estés.',
                'Bobby, onde você estiver.',
              )}
            </h3>
            <p className="mb-8 mt-5 text-sm leading-7 text-[#A39C91]">
              {t(
                'The same record, in a voice you can talk to.',
                'El mismo registro, con una voz con la que puedes conversar.',
                'O mesmo registro, com uma voz com a qual você pode conversar.',
              )}
            </p>
            <a
              href="/app"
              className="mt-auto inline-flex w-fit items-center gap-3 text-sm transition hover:text-[#bca8eb]"
            >
              {t('See the app', 'Conoce la app', 'Conheça o app')}{' '}
              <ArrowRight className="h-4 w-4" />
            </a>
          </article>
        </div>
      </section>

      <section
        id="contracts"
        className="protocol-section scroll-mt-28 border-t border-[#F2EDE4]/10"
      >
        <div className="mb-10 grid gap-6 md:grid-cols-2 md:items-end">
          <div>
            <p className="protocol-eyebrow">
              {t(
                '06 / Open to inspection',
                '06 / Abierto a revisión',
                '06 / Aberto à revisão',
              )}
            </p>
            <h2 className="protocol-section-title mt-5">
              {t(
                'The record is public.',
                'El registro es público.',
                'O registro é público.',
              )}
              <br />

              {t(
                'The protocol is Base.',
                'El protocolo está en Base.',
                'O protocolo está na Base.',
              )}
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-7 text-[#A39C91]">
            {t(
              'Identity, debates, risk proofs and the execution receipt ledger share one Base-only architecture. Wallets stay self-custodial: Bobby prepares bounded calldata, records confirmed receipts and never holds funds or exchange credentials.',
              'Identidad, debates, pruebas de riesgo y comprobantes de ejecución comparten una arquitectura exclusiva de Base. Mantienes la custodia de tu wallet: Bobby prepara datos de transacción acotados, registra comprobantes confirmados y nunca guarda fondos ni credenciales de exchanges.',
              'Identidade, debates, provas de risco e comprovantes de execução compartilham uma arquitetura exclusiva da Base. Você mantém a custódia da carteira: Bobby prepara dados de transação limitados, registra comprovantes confirmados e nunca guarda fundos ou credenciais de exchanges.',
            )}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {proofPoints.map((point) => (
            <a
              key={point.label}
              href={point.href}
              target={point.href.startsWith('#') ? undefined : '_blank'}
              rel={point.href.startsWith('#') ? undefined : 'noreferrer'}
              className="protocol-panel group flex flex-col p-7 transition hover:border-[#bca8eb]/30 md:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-[#A39C91]">
                  {point.label}
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[#A39C91] transition group-hover:text-[#F2EDE4]" />
              </div>
              <div className="mt-7 text-4xl font-light tracking-[-0.05em]">
                {point.value}
              </div>
              <p className="mb-7 mt-4 text-sm leading-6 text-[#A39C91]">
                {point.detail}
              </p>
              <span className="mt-auto border-t border-[#F2EDE4]/10 pt-4 text-xs text-[#bca8eb]">
                {point.proof}
              </span>
            </a>
          ))}
        </div>
        <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-xs text-[#A39C91]">
          <span>Base · 8453 · {nativeSymbol}</span>
          <a
            href={`${explorerAddressUrl}/${stats?.contracts?.trackRecord?.address ?? ''}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#F2EDE4]"
          >
            {t(
              'TrackRecord on Basescan ↗',
              'TrackRecord en Basescan ↗',
              'TrackRecord no Basescan ↗',
            )}
          </a>
          <a
            href={`${explorerAddressUrl}/${stats?.contracts?.agentEconomy?.address ?? ''}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#F2EDE4]"
          >
            {t(
              'AgentEconomy on Basescan ↗',
              'AgentEconomy en Basescan ↗',
              'AgentEconomy no Basescan ↗',
            )}
          </a>
          <a href="/protocol/heartbeat" className="hover:text-[#F2EDE4]">
            {t(
              'Full contract heartbeat →',
              'Estado completo de los contratos →',
              'Estado completo dos contratos →',
            )}
          </a>
        </div>
        <div
          id="protocol-metrics"
          className="mt-14 grid scroll-mt-28 grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4"
        >
          <Metric
            label={t('Debates', 'Debates', 'Debates')}
            value={formatNumber(totalDebates)}
            detail={t(
              'public debate ledger',
              'registro público de debates',
              'registro público de debates',
            )}
          />
          <Metric
            label={t('Commitments', 'Compromisos', 'Compromissos')}
            value={formatNumber(
              publicRecord?.commitmentsCreated ?? totalTrades,
            )}
            detail={t(
              'created before the outcome',
              'creados antes del resultado',
              'criados antes do resultado',
            )}
          />
          <Metric
            label={t('Resolved', 'Resueltos', 'Resolvidos')}
            value={formatNumber(publicRecord?.decisionsResolved)}
            detail={t(
              'decisions with an outcome',
              'decisiones con resultado',
              'decisões com resultado',
            )}
          />
          <Metric
            label={t('Pending', 'Pendientes', 'Pendentes')}
            value={formatNumber(publicRecord?.pending)}
            detail={t(
              'no outcome yet',
              'sin resultado todavía',
              'sem resultado ainda',
            )}
          />
          <Metric
            label={t('Expired', 'Vencidos', 'Expirados')}
            value={formatNumber(publicRecord?.expired)}
            detail={t('never settled', 'nunca resueltos', 'nunca resolvidos')}
          />
          <Metric
            label={t('Wins / losses', 'Aciertos / fallos', 'Acertos / erros')}
            value={
              publicRecord
                ? `${formatNumber(publicRecord.wins)} / ${formatNumber(publicRecord.losses)}`
                : '—'
            }
            detail={t(
              'decisive outcomes',
              'resultados concluyentes',
              'resultados conclusivos',
            )}
          />
          <Metric
            label={t('Win rate', 'Tasa de acierto', 'Taxa de acerto')}
            value={formatWinRate(
              winRate,
              publicRecord?.decisionsResolved,
              publicRecord?.wins,
              publicRecord?.losses,
            )}
            detail={
              publicRecord?.decisionsResolved &&
              publicRecord.decisionsResolved < WIN_RATE_MIN_SAMPLE
                ? `${t('small sample', 'muestra pequeña', 'amostra pequena')} (n=${publicRecord.decisionsResolved})`
                : t(
                    'over resolved outcomes',
                    'sobre resultados resueltos',
                    'sobre resultados resolvidos',
                  )
            }
          />
          <Metric
            label={t('Resolution', 'Resolución', 'Resolução')}
            value={
              publicRecord?.resolutionRate !== undefined
                ? `${Number(publicRecord.resolutionRate).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                : '—'
            }
            detail={t(
              'commitments with an outcome',
              'compromisos con resultado',
              'compromissos com resultado',
            )}
          />
          <Metric
            label={t(
              'Agent calls',
              'Llamadas de agentes',
              'Chamadas de agentes',
            )}
            value={formatNumber(totalMcpCalls)}
            detail={t(
              'AgentEconomy contract',
              'Contrato AgentEconomy',
              'Contrato AgentEconomy',
            )}
          />
          <Metric
            label={t('Interactions', 'Interacciones', 'Interações')}
            value={formatNumber(totalInteractions)}
            detail={t('network', 'red', 'rede')}
          />
        </div>
        <p className="mt-7 max-w-4xl text-xs leading-6 text-[#A39C91]">
          {provenanceNote}
        </p>
      </section>

      <section
        id="limits"
        className="protocol-section scroll-mt-28 border-t border-[#F2EDE4]/10"
      >
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-20">
          <div>
            <p className="protocol-eyebrow">
              {t(
                '07 / Scope and limits',
                '07 / Alcance y límites',
                '07 / Escopo e limites',
              )}
            </p>
            <h2 className="protocol-section-title mt-5">
              {t('Know the', 'Conoce los', 'Conheça os')}
              <br />

              {t('boundaries.', 'límites.', 'limites.')}
            </h2>
          </div>
          <ul>
            {[
              t(
                'It holds no funds and accesses no third-party accounts.',
                'No custodia fondos ni accede a cuentas de terceros.',
                'Não guarda fundos nem acessa contas de terceiros.',
              ),
              t(
                'It places no orders. Execution belongs to whoever trades.',
                'No coloca órdenes. La ejecución corresponde a quien opera.',
                'Não envia ordens. A execução cabe a quem opera.',
              ),
              t(
                'It is not investment advice and promises no returns.',
                'No es asesoría de inversión ni promete rendimientos.',
                'Não é aconselhamento de investimento nem promete retornos.',
              ),
              t(
                'A favorable verdict is not a buy recommendation. It is the record of an idea that survived its own refutation.',
                'Un veredicto favorable no es una recomendación de compra. Es el registro de una idea que resistió su propia refutación.',
                'Um veredicto favorável não é uma recomendação de compra. É o registro de uma ideia que resistiu à própria refutação.',
              ),
            ].map((limit, index) => (
              <li
                key={limit}
                className="flex gap-5 border-t border-[#F2EDE4]/10 py-6"
              >
                <span className="pt-0.5 font-mono text-[10px] text-[#A39C91]">
                  0{index + 1}
                </span>
                <span className="text-sm leading-7 text-[#A39C91]">
                  {limit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="protocol-section border-t border-[#F2EDE4]/10"
        aria-labelledby="resources-title"
      >
        <p className="protocol-eyebrow">
          {t(
            'For builders, agents and the curious',
            'Para desarrolladores, agentes y curiosos',
            'Para desenvolvedores, agentes e curiosos',
          )}
        </p>
        <h2 id="resources-title" className="protocol-section-title mt-5">
          {t(
            'Go a little deeper.',
            'Ve un poco más allá.',
            'Vá um pouco além.',
          )}
        </h2>
        <div className="mt-10 grid gap-x-8 md:grid-cols-3">
          {resources.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="group flex items-center justify-between border-t border-[#F2EDE4]/10 py-5 text-sm text-[#A39C91] transition hover:text-[#F2EDE4]"
            >
              {label}
              <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          ))}
        </div>
      </section>
    </ProtocolLayout>
  );
}
