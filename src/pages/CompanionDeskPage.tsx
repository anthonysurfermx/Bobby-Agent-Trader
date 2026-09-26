// /desk — the iPhone's Núcleo experience on the web: the risk notice once, then the desk with
// the glass at the centre. No character or vibe picker on the way in: the avatars live in the
// profile. Progress lives in this browser, the same way it lives on the phone, until accounts
// sync it. The page sets body.nucleo-ui while mounted so sheets that portal to <body> wear it too.
import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import NucleoRisk from '@/components/nucleo/NucleoRisk';
import NucleoDesk from '@/components/nucleo/NucleoDesk';
import { RISK_NOTICE_VERSION, progressStore, useProgress } from '@/lib/companions/progress';
import '@/styles/nucleo-desk.css';

export default function CompanionDeskPage() {
  const progress = useProgress();
  useEffect(() => {
    document.body.classList.add('nucleo-ui');
    return () => document.body.classList.remove('nucleo-ui');
  }, []);
  const riskDue = progress.riskNoticeVersion < RISK_NOTICE_VERSION;
  // Visitors who accepted the notice under the old flow but never finished the picker go straight in.
  useEffect(() => { if (!riskDue && !progress.onboarded) progressStore.finishOnboarding(); }, [riskDue, progress.onboarded]);
  return (
    <div className="min-h-screen" style={{ background: '#0B0A09', color: '#F2EDE4' }}>
      <Helmet><title>Desk | Bobby</title></Helmet>
      {riskDue ? <NucleoRisk /> : <NucleoDesk />}
    </div>
  );
}
