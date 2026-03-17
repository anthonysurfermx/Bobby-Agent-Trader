import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ClawTraderChat } from '@/components/claw-trader/ClawTraderChat';

export default function ClawTraderChatPage() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Claw Trader Chat | DeFi Hub M\u00e9xico</title>
        <meta name="description" content="Intelligence chat — scan markets, detect bots, follow smart money. Tell us your budget and risk level." />
      </Helmet>

      <div className="container mx-auto px-4 py-6 space-y-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <Link to="/agentic-world/claw-trader" className="text-green-400/40 hover:text-green-400/60 transition-colors">
            Claw Trader PRO
          </Link>
          <span className="text-green-400/20">/</span>
          <span className="text-green-400/60">Chat Mode</span>
        </div>

        <ClawTraderChat />
      </div>
    </div>
  );
}
