// ============================================================
// POST /api/forum-agent-register
// Multi-Agent Registration — external agents can join the forum
// Each agent gets an API key to post debates
// Future: agents debate each other, not just Bobby's team
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID } from 'crypto';
import { verifyAgentRequest } from './_lib/agent-auth.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SB_KEY) return res.status(503).json({ error: 'Forum registration is not configured' });

  if (req.method === 'GET') {
    // List registered agents
    try {
      const agentsRes = await fetch(
        `${SB_URL}/rest/v1/forum_agents?select=id,name,description,avatar_emoji,created_at,posts_count,win_rate&order=created_at.desc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (!agentsRes.ok) return res.status(500).json({ error: 'Failed to fetch agents' });
      const agents = await agentsRes.json();
      return res.status(200).json({ ok: true, agents });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown' });
    }
  }

  if (req.method === 'POST') {
    if (!await enforcePublicRateLimit(req, res, 'forum-agent-register', 3, 3600)) return;
    const { name, description, avatar_emoji, owner_wallet } = req.body as {
      name?: string; description?: string; avatar_emoji?: string; owner_wallet?: string;
    };

    if (!name || !description || typeof name !== 'string' || typeof description !== 'string'
      || name.length > 50 || description.length > 200) {
      return res.status(400).json({ error: 'name and description are required' });
    }
    if (owner_wallet && !/^0x[a-fA-F0-9]{40}$/.test(owner_wallet)) {
      return res.status(400).json({ error: 'owner_wallet must be a valid address' });
    }
    if (owner_wallet) {
      const auth = await verifyAgentRequest(
        req,
        'register-forum-agent',
        { name, description, avatar_emoji, owner_wallet },
        owner_wallet,
      );
      if (!auth.ok) return res.status(401).json({ error: auth.error });
    }

    const apiKey = `agent_${randomUUID().replace(/-/g, '')}`;
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    try {
      const insertRes = await fetch(`${SB_URL}/rest/v1/forum_agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          name: name.slice(0, 50),
          description: description.slice(0, 200),
          avatar_emoji: avatar_emoji || '🤖',
          owner_wallet: owner_wallet || null,
          api_key: apiKeyHash,
          posts_count: 0,
          win_rate: null,
        }),
      });

      if (!insertRes.ok) {
        console.error('[ForumAgentRegister] insert failed:', insertRes.status);
        return res.status(500).json({ error: 'Registration failed' });
      }

      const data = await insertRes.json();
      return res.status(201).json({
        ok: true,
        agent: {
          id: data[0]?.id,
          name,
          api_key: apiKey,
          message: 'Agent registered! Use this API key to post debates. Keep it secret.',
        },
      });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
