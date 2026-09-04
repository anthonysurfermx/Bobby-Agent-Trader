// /desk — the iPhone experience on the web: risk notice → meet your squad →
// the live desk. Progress lives in this browser, the same way it lives on
// the phone, until accounts sync it.
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@/lib/companions/i18n';
import KineticShell from '@/components/kinetic/KineticShell';
import RiskNotice from '@/components/companion/RiskNotice';
import CompanionOnboarding from '@/components/companion/CompanionOnboarding';
import CompanionDesk from '@/components/companion/CompanionDesk';
import { RISK_NOTICE_VERSION, useProgress } from '@/lib/companions/progress';

export default function CompanionDeskPage() {
  const progress = useProgress();
  return (
    <KineticShell minimalNav>
      <Helmet><title>Live Desk | Bobby Agent Trader</title></Helmet>
      <Link
        to="/agentic-world/bobby/trader-land"
        className="group mx-auto mb-5 flex w-full max-w-7xl items-center gap-3 overflow-hidden rounded-2xl border border-emerald-200/15 bg-gradient-to-r from-[#152b27] via-[#10201e] to-[#0c1517] p-3 text-[#ecf5e9] transition hover:border-emerald-200/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 sm:gap-5 sm:px-5"
      >
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-200/[0.05] sm:h-20 sm:w-20">
          <img src="/land/v1/gate-A/aura_core/ne/stage1_thumb_256.png" alt="" className="h-full w-full object-contain" width="80" height="80" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-200/65">BOBBY WORLD</span>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Trader Land</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-emerald-50/60 sm:text-sm">{t('A little world. All yours. Build, rotate and explore.', 'Un pequeño mundo. Muy tuyo. Construye, gira y explora.')}</p>
        </div>
        <span className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-emerald-200/10 px-3 text-xs font-medium text-emerald-100 transition group-hover:bg-emerald-200/20 sm:px-4">
          <span className="hidden sm:inline">{t('Open island', 'Abrir isla')}</span><ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </Link>
      {progress.riskNoticeVersion < RISK_NOTICE_VERSION ? (
        <RiskNotice />
      ) : !progress.onboarded ? (
        <CompanionOnboarding onDone={() => { /* progress flips onboarded; the desk mounts */ }} />
      ) : (
        <CompanionDesk />
      )}
    </KineticShell>
  );
}
