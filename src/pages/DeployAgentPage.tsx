// ============================================================
// Deploy Agent Page — wrapper for the AgentWizard
// Route: /agentic-world/deploy
// Always saves to localStorage. If wallet connected, also Supabase.
// The wizard's final "awake" state waits for the REAL result of
// this handler — signature rejected or server error is reported
// back as savedRemote: false, never silently swallowed.
// ============================================================

import { useNavigate } from 'react-router-dom';
import { useAccount, useSignMessage } from 'wagmi';
import AgentWizard, { type AgentConfig } from '@/components/kinetic/AgentWizard';
import { buildAgentAuthChallenge } from '@/lib/agent-request-auth';

export default function DeployAgentPage() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const handleComplete = async (config: AgentConfig): Promise<{ savedRemote: boolean }> => {
    // Always save to localStorage (works without wallet)
    const agentConfig = {
      ...config,
      wallet_address: address || null,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem('agent_profile', JSON.stringify(agentConfig));
    localStorage.setItem('bobby_trading_mode', 'paper');
    localStorage.setItem('bobby_agent_name', config.agent_name);

    // No wallet: local-only is the designed outcome, not a failure
    if (!address) return { savedRemote: true };

    try {
      const payload = {
        wallet_address: address,
        agent_name: config.agent_name,
        voice: config.voice,
        personality: config.personality,
        cadence_hours: config.cadence_hours,
        markets: config.markets,
        delivery: config.delivery,
        mascot: config.mascot,
      };
      const timestamp = new Date().toISOString();
      const signature = await signMessageAsync({
        message: buildAgentAuthChallenge('setup-agent', payload, timestamp),
      });
      const res = await fetch('/api/agent-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-address': address,
          'x-agent-timestamp': timestamp,
          'x-agent-signature': signature,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        console.error('[DeployAgent] Server rejected setup:', res.status, data?.error);
        return { savedRemote: false };
      }
      if (data.agent_profile) {
        // Keep the mascot even if the server column isn't migrated yet
        localStorage.setItem('agent_profile', JSON.stringify({
          ...data.agent_profile,
          mascot: data.agent_profile.mascot ?? config.mascot,
        }));
      }
      return { savedRemote: true };
    } catch (err) {
      // Signature rejected or network failure — localStorage still works
      console.error('[DeployAgent] Remote save failed, localStorage still works:', err);
      return { savedRemote: false };
    }
  };

  const handleDone = () => {
    navigate('/agentic-world/bobby');
  };

  const handleSkip = () => {
    navigate('/agentic-world/bobby');
  };

  return <AgentWizard onComplete={handleComplete} onDone={handleDone} onSkip={handleSkip} />;
}
