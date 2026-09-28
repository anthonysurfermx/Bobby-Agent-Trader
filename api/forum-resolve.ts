// ============================================================
// GET /api/forum-resolve
// Resolution Engine — checks if Bobby's trades hit target or stop
// Runs daily via cron. Resolves each call against the 1H candle path between
// its commitment and its expiry: pending → win | loss | break_even
// The metric that makes Bobby honest.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRecordAuth, recordAuthHeaders } from './_lib/record-auth.js';
import { bobbyDbUrl, bobbyServiceKeyOptional } from './_lib/bobby-db.js';
import { requireWritesOpen } from './_lib/control.js';
import { isInternalRequest } from './_lib/request-security.js';
import { getHourlyBars, resolveByPath } from './_lib/path-resolution.js';

const SB_URL = bobbyDbUrl();
// Writers never fall back to the anon key (Codex review): with RLS on, an
// anon write fails silently. Missing service role → explicit 503 below.
const SB_KEY = bobbyServiceKeyOptional();

interface PendingThread {
  scope?: string | null;
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  stop_price: number;
  target_price: number;
  conviction_score: number | null;
  expires_at: string;
  created_at: string;
  status?: string;
}

const ONCHAIN_V2_SINCE_MS = Date.parse('2026-08-18T00:00:00Z');

export const config = { maxDuration: 60 };

async function updateThread(id: string, update: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ ...update, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SB_KEY) return res.status(503).json({ error: 'Service-role key not configured (BOBBY_SUPABASE_SERVICE_ROLE_KEY)' });
  if (!(await requireWritesOpen(res))) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail-closed: this handler mutates Supabase threads and triggers on-chain
  // resolutions with backend credentials — GET included, so both are guarded.
  // Vercel cron presents CRON_SECRET as Bearer; operators use x-record-secret.
  if (!isInternalRequest(req) && !requireRecordAuth(req, res)) return;

  try {
    // Fetch all pending threads with trading params
    const threadsRes = await fetch(
      `${SB_URL}/rest/v1/forum_threads?resolution=eq.pending&entry_price=not.is.null&order=created_at.desc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!threadsRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch threads' });
    }

    const threads: PendingThread[] = await threadsRes.json();
    const results: Array<{ id: string; symbol: string; resolution: string; pnl: number | null; onchain: boolean }> = [];

    const now = Date.now();

    for (const thread of threads) {
      if (!thread.symbol || !thread.entry_price || !thread.expires_at) continue;
      const createdMs = new Date(thread.created_at).getTime();
      const expiresMs = new Date(thread.expires_at).getTime();
      const bars = await getHourlyBars(thread.symbol, createdMs, Math.min(expiresMs, now));
      if (!bars) continue;
      const outcome = resolveByPath(thread, bars, expiresMs, now);
      if (!outcome) continue;

      const pnlPct = parseFloat(outcome.pnlPct.toFixed(2));
      const ok = await updateThread(thread.id, {
        resolution: outcome.resolution,
        resolution_price: outcome.exitPrice,
        resolution_pnl_pct: pnlPct,
        // When the market settled it, not when this job happened to run.
        resolved_at: new Date(outcome.exitAt).toISOString(),
        status: 'resolved',
      });
      if (!ok) continue;

      // Resolve on-chain (chain follows the deployment's DEFAULT_CHAIN). Only
      // public calls committed after the TrackRecord V2 cut-over: older calls
      // were never committed on Base and would only burn recorder gas.
      let onchainOk = false;
      if (thread.scope === 'public' && createdMs >= ONCHAIN_V2_SINCE_MS) {
        try {
          const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bobbyprotocol.xyz';
          const onchainRes = await fetch(`${host}/api/protocol-record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...recordAuthHeaders() },
            body: JSON.stringify({
              action: 'resolve',
              threadId: thread.id,
              symbol: thread.symbol,
              result: outcome.resolution,
              exitPrice: outcome.exitPrice,
              exitAt: Math.floor(outcome.exitAt / 1000),
              pnlBps: pnlPct,
            }),
          });
          onchainOk = onchainRes.ok;
        } catch (e) { console.error('[Resolve] on-chain resolve failed', e); }
      }

      results.push({ id: thread.id, symbol: thread.symbol, resolution: outcome.resolution, pnl: pnlPct, onchain: onchainOk });
    }

    // Calculate Bobby's track record
    const allResolvedRes = await fetch(
      `${SB_URL}/rest/v1/forum_threads?scope=eq.public&resolution=neq.pending&resolution=not.is.null&select=resolution,resolution_pnl_pct`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    let trackRecord = { total: 0, wins: 0, losses: 0, winRate: 0, avgPnl: 0 };
    if (allResolvedRes.ok) {
      const resolved = await allResolvedRes.json() as Array<{ resolution: string; resolution_pnl_pct: number | null }>;
      const wins = resolved.filter(r => r.resolution === 'win').length;
      const losses = resolved.filter(r => r.resolution === 'loss').length;
      const total = resolved.length;
      const pnls = resolved.map(r => r.resolution_pnl_pct || 0);
      const avgPnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
      trackRecord = {
        total,
        wins,
        losses,
        winRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
        avgPnl: parseFloat(avgPnl.toFixed(2)),
      };
    }

    return res.status(200).json({
      ok: true,
      checked: threads.length,
      resolved: results.length,
      results,
      trackRecord,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Resolver] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
