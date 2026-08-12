// ============================================================
// Bobby Agent Trader — Terminal Page
// Uses unified KineticShell for consistent nav across all pages
// The chat (AdamsChat) is the main content
// ============================================================

import { Component, useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { AdamsChat } from '@/components/adams/AdamsChat';
import { VoiceRoom } from '@/components/adams/VoiceRoom';
import { ProactiveNotification } from '@/components/adams/ProactiveNotification';

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
          <h2 className="text-[14px] font-mono font-bold text-white/50">Bobby encountered an error</h2>
          <p className="text-[10px] font-mono text-white/25 text-center max-w-md">{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
            className="px-4 py-2 text-[11px] font-mono border border-[#0052ff]/40 text-[#7da6ff] bg-[#0052ff]/10 hover:bg-[#0052ff]/15 transition-all rounded"
          >
            Reload Bobby
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function BobbyAgentTraderPage() {
  const { address } = useAccount();
  // Voice is the primary way in; the classic chat stays one click away as a
  // fallback for muted rooms, unsupported browsers and typing-only users.
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');

  return (
    <BobbyErrorBoundary>
      <main className="fixed inset-0 bg-[#050505]">
        {mode === 'voice' ? (
          <VoiceRoom onSwitchToChat={() => setMode('chat')} />
        ) : (
          <>
            <AdamsChat />
            <button
              onClick={() => setMode('voice')}
              className="absolute bottom-24 right-4 z-50 rounded-lg border border-[#0052ff]/40 bg-[#0052ff]/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#7da6ff] backdrop-blur transition hover:bg-[#0052ff]/25"
            >
              Volver a voz
            </button>
          </>
        )}
      </main>
      <ProactiveNotification walletAddress={address} />
    </BobbyErrorBoundary>
  );
}
