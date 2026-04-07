import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import KineticShell from '@/components/kinetic/KineticShell';
import BobbyInvestorWidget from '@/components/kinetic/BobbyInvestorWidget';

export default function BobbyInvestorDemoPage() {
  const [isPTSDemo, setIsPTSDemo] = useState(false);

  return (
    <KineticShell activeTab="none">
      <Helmet><title>Investor UX Demo | Bobby Agent Trader</title></Helmet>
      
      <div className="min-h-screen bg-[#131313] py-8 px-4 flex flex-col items-center">
        
        {/* Demo Controls */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="font-mono text-xs text-white/50 tracking-widest text-center">
            BOBBY INVESTOR COMPONENT DEMO
          </div>
          <div className="flex items-center gap-4 bg-[#201f1f] p-2 rounded-lg border border-white/10">
            <button
               onClick={() => setIsPTSDemo(false)}
               className={`font-mono text-[10px] px-4 py-2 rounded transition-colors ${!isPTSDemo ? 'bg-[#4be277]/20 text-[#4be277] border border-[#4be277]/50' : 'text-white/40 hover:bg-white/5 border border-transparent'}`}
            >
              STANDARD THEME
            </button>
            <button
               onClick={() => setIsPTSDemo(true)}
               className={`font-mono text-[10px] px-4 py-2 rounded transition-colors ${isPTSDemo ? 'bg-[#F5A623]/20 text-[#F5A623] border border-[#F5A623]/50' : 'text-white/40 hover:bg-white/5 border border-transparent'}`}
            >
              PTS DEMO THEME (GOLD/SPANISH)
            </button>
          </div>
          <div className="font-mono text-[9px] text-white/30 max-w-lg text-center mt-2">
            This widget is designed to be embedded directly inside the Bobby Chat interface or displayed as a modal inside the main Terminal.
          </div>
        </div>

        {/* Widget Container simulating a chat window width */}
        <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 min-h-[600px] flex justify-center shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
           <BobbyInvestorWidget isPTSDemo={isPTSDemo} />
        </div>

      </div>
    </KineticShell>
  );
}
