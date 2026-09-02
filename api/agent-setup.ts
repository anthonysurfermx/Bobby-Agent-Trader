// ============================================================
// POST /api/agent-setup — Create/update personal agent profile
// Upserts agent_profiles, triggers first cycle async
// Returns 202 with profile in 'deploying' state
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyAgentRequest } from './_lib/agent-auth.js';
import { enforcePublicRateLimit, internalAuthHeaders } from './_lib/request-security.js';
import { BOBBY_PROTOCOL_BASE_URL } from './_lib/protocol-constants.js';

export const config = { maxDuration: 15 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Legacy male/female + voice personas (OpenAI TTS ids) from the wizard
const VALID_VOICES = ['male', 'female', 'coral', 'ballad', 'sage', 'ash'];
const VALID_PERSONALITIES = ['direct', 'analytical', 'wise'];
// Mirror of src/lib/mascot.ts — the mascot's look, validated server-side
const VALID_MASCOT_BODIES = ['matrix', 'plasma', 'lava', 'ice', 'gold', 'ghost'];
const VALID_MASCOT_EYES = ['round', 'happy', 'focused', 'pixel'];
const VALID_MASCOT_ACCESSORIES = ['none', 'visor', 'antenna', 'cap', 'headphones'];
const VALID_MASCOT_AVATARS = ['bobby', 'byte', 'kora', 'zip', 'glitch', 'momo', 'flux', 'rook', 'axiom', 'halo'];

function sanitizeMascot(m: unknown): { body: string; eyes: string; accessory: string; avatar?: string } | null {
  if (!m || typeof m !== 'object') return null;
  const c = m as Record<string, unknown>;
  if (
    typeof c.body === 'string' && VALID_MASCOT_BODIES.includes(c.body) &&
    typeof c.eyes === 'string' && VALID_MASCOT_EYES.includes(c.eyes) &&
    typeof c.accessory === 'string' && VALID_MASCOT_ACCESSORIES.includes(c.accessory)
  ) {
    const clean: { body: string; eyes: string; accessory: string; avatar?: string } = {
      body: c.body, eyes: c.eyes, accessory: c.accessory,
    };
    // Premade 3D avatar id — strict allowlist so an invalid signed value
    // can't persist and silently degrade to the procedural fallback
    if (typeof c.avatar === 'string' && VALID_MASCOT_AVATARS.includes(c.avatar)) clean.avatar = c.avatar;
    return clean;
  }
  return null;
}
const VALID_CADENCES = [4, 6, 12, 24];
const VALID_MARKETS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'NVDA', 'TSLA', 'AAPL', 'SPY', 'MSFT', 'XAUT', 'XAG'];
const VALID_DELIVERY = ['web', 'telegram', 'email'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!await enforcePublicRateLimit(req, res, 'agent-setup', 10, 3600)) return;

  if (!SB_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured — missing service key' });
  }

  const supabase = createClient(SB_URL, SB_SERVICE_KEY);

  const { wallet_address, agent_name, voice, personality, cadence_hours, markets, delivery, mascot } = req.body || {};

  // Validate wallet
  if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    return res.status(400).json({ error: 'Invalid wallet_address' });
  }

  const authPayload: Record<string, unknown> = {
    wallet_address,
    agent_name,
    voice,
    personality,
    cadence_hours,
    markets,
    delivery,
  };
  if (mascot !== undefined) authPayload.mascot = mascot;
  const auth = await verifyAgentRequest(req, 'setup-agent', authPayload, wallet_address);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
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

  // A provided-but-invalid mascot is a client bug or tampering — reject
  // loudly instead of silently persisting a profile without companion
  const cleanMascot = mascot !== undefined ? sanitizeMascot(mascot) : null;
  if (mascot !== undefined && !cleanMascot) {
    return res.status(400).json({ error: 'Invalid mascot' });
  }

  try {
    const wallet = wallet_address.toLowerCase();

    const baseRow = {
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
    };

    let mascotPersisted = !!cleanMascot;
    let { data: profile, error } = await supabase
      .from('agent_profiles')
      // The deployed database may already have the additive mascot column
      // while the generated client types lag behind that migration.
      .upsert((cleanMascot ? { ...baseRow, mascot: cleanMascot } : baseRow) as any, { onConflict: 'wallet_address' })
      .select()
      .single();

    // Migration guard: if the mascot column doesn't exist yet, retry without
    // it but SAY SO in the response — the client keeps its local copy.
    if (error && cleanMascot && /mascot/i.test(error.message || '')) {
      console.error('[agent-setup] MIGRATION PENDING — mascot column missing. Run: ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS mascot jsonb;');
      mascotPersisted = false;
      ({ data: profile, error } = await supabase
        .from('agent_profiles')
        .upsert(baseRow, { onConflict: 'wallet_address' })
        .select()
        .single());
    }

    if (error) {
      console.error('[agent-setup] Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Fire first personal cycle async (don't await — return immediately)
    // The scheduler will pick it up since next_run_at = now()
    // For instant gratification, we also try to trigger it directly
    const authHeaders = internalAuthHeaders();
    if (Object.keys(authHeaders).length > 0) {
      fetch(`${BOBBY_PROTOCOL_BASE_URL}/api/user-cycle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
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
      mascot_persisted: mascotPersisted,
      poll_after_ms: 3000,
    });
  } catch (err) {
    console.error('[agent-setup] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
