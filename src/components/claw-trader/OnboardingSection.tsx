import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'claw_onboarding_dismissed';

interface OnboardingSectionProps {
  onGetStarted?: () => void;
}

const STEPS = [
  {
    num: '1',
    title: 'SCAN',
    lines: ['We scan 200 top', 'traders on Poly-', 'market by PnL'],
  },
  {
    num: '2',
    title: 'DETECT',
    lines: ['AI finds which', 'are BOTS with', '7 behavioral', 'signals'],
  },
  {
    num: '3',
    title: 'PROFIT',
    lines: ['You see what', 'smart money is', 'buying BEFORE', 'the market moves'],
  },
];

export const OnboardingSection: React.FC<OnboardingSectionProps> = ({ onGetStarted }) => {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleGetStarted = () => {
    handleDismiss();
    onGetStarted?.();
  };

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="w-full text-left px-3 py-1.5 text-[10px] text-green-400/30 hover:text-green-400/60 font-mono transition-colors border border-green-500/10 hover:border-green-500/20 bg-black/30"
      >
        {'>'} How does Claw Trader work? (click to expand)
      </button>
    );
  }

  return (
    <div className="border border-green-500/20 bg-black/60 overflow-hidden font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
            <div className="w-2 h-2 rounded-full bg-green-500/60" />
          </div>
          <span className="text-green-400 text-[10px]">
            claw-trader --explain
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-green-400/30 hover:text-green-400/60 text-xs transition-colors"
        >
          [x]
        </button>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        <h2 className="text-green-300 text-sm font-bold tracking-wide">
          HOW CLAW TRADER MAKES YOU MONEY
        </h2>

        {/* 3 Steps */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          {STEPS.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div className="border border-green-500/20 bg-green-500/5 p-3">
                <div className="text-green-400/40 text-[9px] mb-1">{step.num}.</div>
                <div className="text-green-400 text-xs font-bold mb-1.5">{step.title}</div>
                {step.lines.map((line, i) => (
                  <div key={i} className="text-green-400/50 text-[10px] leading-relaxed">{line}</div>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Arrow indicators */}
        <div className="hidden md:flex justify-center items-center gap-0 -mt-2 -mb-2">
          <div className="w-1/3 text-center text-green-400/20 text-xs">{'→'}</div>
          <div className="w-1/3 text-center text-green-400/20 text-xs">{'→'}</div>
          <div className="w-1/3" />
        </div>

        {/* Analogy */}
        <div className="border-l-2 border-green-500/30 pl-3 py-1">
          <p className="text-green-400/60 text-[11px] italic">
            "It's like seeing every whale's poker hand before they bet."
          </p>
        </div>

        {/* Assets */}
        <div className="text-green-400/40 text-[10px] space-y-1">
          <div>
            We track{' '}
            {['BTC', 'ETH', 'SOL', 'XRP'].map((a) => (
              <span key={a} className="text-green-400 font-bold mx-0.5 px-1 border border-green-500/20">
                {a}
              </span>
            ))}
            {' '}on Polymarket prediction markets.
          </div>
          <div>
            5-min, 15-min, daily, weekly and monthly timeframes.
          </div>
          <div>
            When smart money bots pile into one side, that's your signal.
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleGetStarted}
          className="px-6 py-2 text-[11px] font-bold border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors"
        >
          GET STARTED
        </button>
      </div>
    </div>
  );
};
