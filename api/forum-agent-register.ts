// ============================================================
// POST /api/forum-agent-register
// Multi-Agent Registration — external agents can join the forum
// Each agent gets an API key to post debates
// Future: agents debate each other, not just Bobby's team
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const { name, description, avatar_emoji, owner_wallet } = req.body as {
      name?: string; description?: string; avatar_emoji?: string; owner_wallet?: string;
    };

    if (!name || !description) {
      return res.status(400).json({ error: 'name and description are required' });
    }

    const apiKey = `agent_${randomUUID().replace(/-/g, '')}`;

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
          api_key: apiKey,
          posts_count: 0,
          win_rate: null,
        }),
      });

      if (!insertRes.ok) {
        const err = await insertRes.text();
        return res.status(500).json({ error: 'Registration failed', details: err });
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
