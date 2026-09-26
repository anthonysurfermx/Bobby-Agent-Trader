// /desk — the iPhone experience on the web: risk notice → meet your squad →
// the live desk. Progress lives in this browser, the same way it lives on
// the phone, until accounts sync it.
// Dressed in the Núcleo design of the iOS app (glass, Sora, the warm charcoal): the page sets
// body.nucleo-ui while it is mounted so sheets that portal to <body> wear it too.
import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import RiskNotice from '@/components/companion/RiskNotice';
import CompanionOnboarding from '@/components/companion/CompanionOnboarding';
import CompanionDesk from '@/components/companion/CompanionDesk';
import { RISK_NOTICE_VERSION, useProgress } from '@/lib/companions/progress';
import '@/styles/nucleo-desk.css';

export default function CompanionDeskPage() {
  const progress = useProgress();
  useEffect(() => {
    document.body.classList.add('nucleo-ui');
    return () => document.body.classList.remove('nucleo-ui');
  }, []);
  const gate = progress.riskNoticeVersion < RISK_NOTICE_VERSION ? 'risk' : !progress.onboarded ? 'squad' : 'desk';
  return (
    <div className="min-h-screen" style={{ background: '#0B0A09', color: '#F2EDE4' }}>
      <Helmet><title>Desk | Bobby</title></Helmet>
      {gate !== 'desk' && (
        <header className="n-topbar"><a href="/" className="n-wordmark">Bobby</a></header>
      )}
      {gate === 'risk' ? (
        <RiskNotice />
      ) : gate === 'squad' ? (
        <CompanionOnboarding onDone={() => { /* progress flips onboarded; the desk mounts */ }} />
      ) : (
        <CompanionDesk />
      )}
    </div>
  );
}
