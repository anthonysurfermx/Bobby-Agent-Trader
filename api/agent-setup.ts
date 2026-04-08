// ============================================================
// POST /api/agent-setup — Create/update personal agent profile
// Upserts agent_profiles, triggers first cycle async
// Returns 202 with profile in 'deploying' state
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 15 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const VALID_VOICES = ['male', 'female'];
const VALID_PERSONALITIES = ['direct', 'analytical', 'wise'];
const VALID_CADENCES = [4, 6, 12, 24];
const VALID_MARKETS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'NVDA', 'TSLA', 'AAPL', 'SPY', 'MSFT', 'XAUT', 'XAG'];
const VALID_DELIVERY = ['web', 'telegram', 'email'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  if (!SB_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured — missing service key' });
  }

  const supabase = createClient(SB_URL, SB_SERVICE_KEY);

  const { wallet_address, agent_name, voice, personality, cadence_hours, markets, delivery } = req.body || {};

  // Validate wallet
  if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    return res.status(400).json({ error: 'Invalid wallet_address' });
  }

  // Validate agent_name
  if (!agent_name || typeof agent_name !== 'string' || agent_name.length < 1 || agent_name.length > 20) {
    return res.status(400).json({ error: 'agent_name required (1-20 chars)' });
  }

  // Validate voice
  if (!VALID_VOICES.includes(voice)) {
    return res.status(400).json({ error: `voice must be one of: ${VALID_VOICES.join(', ')}` });
  }

  // Validate personality
  if (!VALID_PERSONALITIES.includes(personality)) {
    return res.status(400).json({ error: `personality must be one of: ${VALID_PERSONALITIES.join(', ')}` });
  }

  // Validate cadence
  if (!VALID_CADENCES.includes(cadence_hours)) {
    return res.status(400).json({ error: `cadence_hours must be one of: ${VALID_CADENCES.join(', ')}` });
  }

  // Validate markets
  if (!Array.isArray(markets) || markets.length < 1 || markets.length > 8) {
    return res.status(400).json({ error: 'markets must be array of 1-8 items' });
  }
  const invalidMarkets = markets.filter((m: string) => !VALID_MARKETS.includes(m));
  if (invalidMarkets.length > 0) {
    return res.status(400).json({ error: `Invalid markets: ${invalidMarkets.join(', ')}` });
  }

  // Validate delivery
  if (!Array.isArray(delivery) || delivery.length < 1) {
    return res.status(400).json({ error: 'delivery must be non-empty array' });
  }
  const invalidDelivery = delivery.filter((d: string) => !VALID_DELIVERY.includes(d));
  if (invalidDelivery.length > 0) {
    return res.status(400).json({ error: `Invalid delivery channels: ${invalidDelivery.join(', ')}` });
  }

  try {
    const wallet = wallet_address.toLowerCase();

    const { data: profile, error } = await supabase
      .from('agent_profiles')
      .upsert({
        wallet_address: wallet,
        agent_name: agent_name.toUpperCase(),
        voice,
        personality,
        cadence_hours,
        markets,
        delivery: delivery.includes('web') ? delivery : ['web', ...delivery],
        status: 'deploying',
        next_run_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: 'wallet_address' })
      .select()
      .single();

    if (error) {
      console.error('[agent-setup] Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Fire first personal cycle async (don't await — return immediately)
    // The scheduler will pick it up since next_run_at = now()
    // For instant gratification, we also try to trigger it directly
    const cycleSecret = process.env.BOBBY_CYCLE_SECRET;
    if (cycleSecret) {
      const baseUrl = req.headers.host?.includes('localhost')
        ? `http://${req.headers.host}`
        : 'https://defimexico.org';

      fetch(`${baseUrl}/api/user-cycle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cycleSecret}`,
        },
        body: JSON.stringify({
          agent_profile_id: profile.id,
        }),
      }).catch(err => {
        console.error('[agent-setup] Failed to trigger first cycle:', err);
      });
    }

    return res.status(202).json({
      ok: true,
      state: 'deploying',
      agent_profile: profile,
      poll_after_ms: 3000,
    });
  } catch (err) {
    console.error('[agent-setup] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
