// /desk — the iPhone's Núcleo experience on the web: the desk with the glass at the centre, on screen at once.
// The risk notice comes when the visitor first asks, in place of the answer (NucleoDesk holds the question and
// sends it once they agree), the way the iPhone does it. No character or vibe picker on the way in: the avatars
// live in the profile. Progress lives in this browser, the same way it lives on the phone, until accounts
// sync it. The page sets body.nucleo-ui while mounted so sheets that portal to <body> wear it too.
import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import NucleoDesk from '@/components/nucleo/NucleoDesk';
import { RISK_NOTICE_VERSION, progressStore, useProgress } from '@/lib/companions/progress';
import { consentCurrent } from '@/lib/desk-entry';
import { htmlLang } from '@/lib/companions/i18n';
import '@/styles/nucleo-desk.css';

export default function CompanionDeskPage() {
  const progress = useProgress();
  useEffect(() => {
    document.body.classList.add('nucleo-ui');
    return () => document.body.classList.remove('nucleo-ui');
  }, []);
  const consented = consentCurrent(progress, RISK_NOTICE_VERSION);
  // Visitors who accepted the notice under the old flow but never finished the picker go straight in.
  useEffect(() => { if (consented && !progress.onboarded) progressStore.finishOnboarding(); }, [consented, progress.onboarded]);
  return (
    <div className="min-h-screen" style={{ background: '#0B0A09', color: '#F2EDE4' }}>
      <Helmet><html lang={htmlLang()} /><title>Desk | Bobby</title></Helmet>
      <NucleoDesk />
    </div>
  );
}
