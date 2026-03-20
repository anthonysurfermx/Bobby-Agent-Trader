// ============================================================
// GET /api/bobby-digest — Fetch latest digest for morning greeting
// "Mientras dormías..." — Bobby's overnight analysis summary
// Works for ALL users — with or without positions/wallet
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.query.wallet as string | undefined;
  const lang = (req.query.lang as string) || 'en';
  // Only show digests from the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Try wallet-specific digest first, then fall back to global
    let digests: any[] = [];

    if (wallet) {
      const walletRes = await fetch(
        `${SB_URL}/rest/v1/user_digests?wallet_address=eq.${encodeURIComponent(wallet)}&created_at=gte.${since}&order=created_at.desc&limit=3`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (walletRes.ok) digests = await walletRes.json();
    }

    // If no wallet-specific digests, get global ones
    if (digests.length === 0) {
      const globalRes = await fetch(
        `${SB_URL}/rest/v1/user_digests?wallet_address=is.null&language=eq.${lang}&created_at=gte.${since}&order=created_at.desc&limit=3`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (globalRes.ok) digests = await globalRes.json();
    }

    if (digests.length === 0) {
      return res.status(200).json({ ok: true, hasDigest: false, digests: [] });
    }

    // Mark as delivered
    const latestId = digests[0].id;
    if (!digests[0].delivered_at) {
      await fetch(`${SB_URL}/rest/v1/user_digests?id=eq.${latestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({ delivered_at: new Date().toISOString() }),
      });
    }

    // Parse JSON fields
    const parsed = digests.map((d: any) => ({
      ...d,
      highlights: typeof d.highlights === 'string' ? JSON.parse(d.highlights) : d.highlights,
      positions_snapshot: typeof d.positions_snapshot === 'string' ? JSON.parse(d.positions_snapshot) : d.positions_snapshot,
      market_snapshot: typeof d.market_snapshot === 'string' ? JSON.parse(d.market_snapshot) : d.market_snapshot,
    }));

    // Check if any digest has unviewed content
    const unviewed = parsed.filter((d: any) => !d.viewed_at);

    return res.status(200).json({
      ok: true,
      hasDigest: true,
      unviewedCount: unviewed.length,
      latest: parsed[0],
      digests: parsed,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Digest] Error:', msg);
    return res.status(200).json({ ok: true, hasDigest: false, digests: [], error: msg });
  }
}
