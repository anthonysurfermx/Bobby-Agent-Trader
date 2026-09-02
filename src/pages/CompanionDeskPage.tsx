// /desk — the iPhone experience on the web: risk notice → meet your squad →
// the live desk. Progress lives in this browser, the same way it lives on
// the phone, until accounts sync it.
import { Helmet } from 'react-helmet-async';
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
