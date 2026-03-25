// ============================================================
// Deploy Agent Page — wrapper for the AgentWizard
// Route: /agentic-world/deploy
// Always saves to localStorage. If wallet connected, also Supabase.
// ============================================================

import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import AgentWizard from '@/components/kinetic/AgentWizard';

export default function DeployAgentPage() {
  const navigate = useNavigate();
  const { address } = useAccount();

  const handleComplete = async (config: {
    agent_name: string;
    voice: 'male' | 'female';
    personality: 'direct' | 'analytical' | 'wise';
    cadence_hours: number;
    markets: string[];
    delivery: string[];
  }) => {
    // Always save to localStorage (works without wallet)
    const agentConfig = {
      ...config,
      wallet_address: address || null,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem('agent_profile', JSON.stringify(agentConfig));
    localStorage.setItem('bobby_trading_mode', 'paper');
    localStorage.setItem('bobby_agent_name', config.agent_name);

    // If wallet connected, also save to Supabase for persistence
    if (address) {
      try {
        const res = await fetch('/api/agent-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: address,
            ...config,
          }),
        });
        const data = await res.json();
        if (data.ok && data.agent_profile) {
          localStorage.setItem('agent_profile', JSON.stringify(data.agent_profile));
        }
      } catch (err) {
        console.error('[DeployAgent] Supabase save failed, localStorage still works:', err);
      }
    }

    navigate('/agentic-world/bobby');
  };

  const handleSkip = () => {
    navigate('/agentic-world/bobby');
  };

  return <AgentWizard onComplete={handleComplete} onSkip={handleSkip} />;
}
