import { Component, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { AdamsChat } from '@/components/adams/AdamsChat';
import { ProactiveNotification } from '@/components/adams/ProactiveNotification';

// Error Boundary — prevents full page crash if Bobby encounters a runtime error
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
            className="px-4 py-2 text-[11px] font-mono border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/15 transition-all rounded"
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
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden" style={{ background: '#050505' }}>
      <BobbyErrorBoundary>
        <div className="flex-1 min-h-0 overflow-hidden">
          <AdamsChat />
        </div>
        <ProactiveNotification walletAddress={address} />
      </BobbyErrorBoundary>
    </div>
  );
}
