// ============================================================
// Bobby Agent Trader — Terminal Page
// Uses unified KineticShell for consistent nav across all pages
// The chat (AdamsChat) is the main content
// ============================================================

import { Component, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { AdamsChat } from '@/components/adams/AdamsChat';
import { VoiceRoom } from '@/components/adams/VoiceRoom';
import { ProactiveNotification } from '@/components/adams/ProactiveNotification';

import { useProgress, RISK_NOTICE_VERSION } from '@/lib/companions/progress';
import { t } from '@/lib/companions/i18n';
import NucleoRisk from '@/components/nucleo/NucleoRisk';
import '@/styles/nucleo-desk.css';

class BobbyErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: '#050505' }}>
          <span className="text-4xl">⚠️</span>
          <h2 className="text-[14px] font-mono font-bold text-white/50">{t('Bobby encountered an error', 'Bobby encontró un error', 'O Bobby encontrou um erro', 'Bobby a rencontré une erreur', 'Bobby ha riscontrato un errore', 'Bei Bobby ist ein Fehler aufgetreten')}</h2>
          <p className="text-[10px] font-mono text-white/25 text-center max-w-md">{t('Reload Bobby to continue.', 'Recarga Bobby para continuar.', 'Recarregue o Bobby para continuar.', 'Rechargez Bobby pour continuer.', 'Ricarica Bobby per continuare.', 'Lade Bobby neu, um fortzufahren.')}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
            className="px-4 py-2 text-[11px] font-mono border border-[#0052ff]/40 text-[#7da6ff] bg-[#0052ff]/10 hover:bg-[#0052ff]/15 transition-all rounded"
          >
            {t('Reload Bobby', 'Recargar Bobby', 'Recarregar Bobby', 'Recharger Bobby', 'Ricarica Bobby', 'Bobby neu laden')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function BobbyAgentTraderPage() {
  const { address } = useAccount();
  const location = useLocation();
  const progress = useProgress();
  const riskDue = !progress.aiConsentGranted || progress.riskNoticeVersion < RISK_NOTICE_VERSION;
  useEffect(() => {
    if (!riskDue) return;
    document.body.classList.add('nucleo-ui');
    return () => document.body.classList.remove('nucleo-ui');
  }, [riskDue]);
  // Voice is the primary way in; text is a first-class fallback for noisy
  // rooms, unsupported browsers and people who prefer to type.
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');

  if (riskDue) return <NucleoRisk />;

  return (
    <BobbyErrorBoundary>
      <main className="fixed inset-0 bg-[#050505]">
        {mode === 'voice' ? (
          <VoiceRoom
            autoStart={new URLSearchParams(location.search).get('start') === '1'}
            onSwitchToChat={() => setMode('chat')}
          />
        ) : (
          // One voice room only: the LIVE DESK (VoiceRoom). "CHAT" is a pure
          // TEXT surface — AdamsChat in textOnly hides its own voice orb so it
          // no longer reads as a second (weaker) voice room.
          <AdamsChat onSwitchToVoice={() => setMode('voice')} textOnly />
        )}
      </main>
      {mode === 'chat' && <ProactiveNotification walletAddress={address} />}
    </BobbyErrorBoundary>
  );
}
