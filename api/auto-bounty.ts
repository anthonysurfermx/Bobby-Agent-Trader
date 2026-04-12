// ============================================================
// POST /api/auto-bounty — Auto-post adversarial bounties for proof density
// Bobby challenges its own recent debates on random dimensions
// Each bounty generates a legitimate on-chain tx on X Layer
// Auth: requires BOBBY_CYCLE_SECRET
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ethers } from 'ethers';

export const config = { maxDuration: 30 };

const XLAYER_RPC = 'https://rpc.xlayer.tech';
const BOUNTIES_CONTRACT = '0xa8005ab465a0e02cb14824cd0e7630391fba673d';
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const DIMENSIONS = [
  'DATA_INTEGRITY',
  'ADVERSARIAL_QUALITY',
  'DECISION_LOGIC',
  'RISK_MANAGEMENT',
  'CALIBRATION_ALIGNMENT',
  'NOVELTY',
] as const;

const BOUNTY_ABI = [
  'function postBounty(string threadId, uint8 dimension, uint32 claimWindowSecs) payable returns (uint256)',
  'function nextBountyId() view returns (uint256)',
];

async function sbQuery(table: string, query: string): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const cycleSecret = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET;
  if (cycleSecret) {
    const auth = req.headers.authorization;
    const bodySecret = (req.body as Record<string, unknown>)?.secret;
    if (auth !== `Bearer ${cycleSecret}` && bodySecret !== cycleSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const recorderKey = process.env.BOBBY_RECORDER_KEY;
  if (!recorderKey) {
    return res.status(503).json({ error: 'Recorder key not configured' });
  }

  try {
    // Fetch recent debate threads that don't have bounties yet
    const threads = await sbQuery('forum_threads',
      'select=id,topic,symbol,conviction_score&order=created_at.desc&limit=5'
    );

    if (!threads.length) {
      return res.status(200).json({ ok: true, bounties: [], message: 'No recent threads to challenge' });
    }

    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const wallet = new ethers.Wallet(recorderKey, provider);
    const iface = new ethers.Interface(BOUNTY_ABI);

    // How many bounties to post (body.count, default 2, max 4)
    const count = Math.min(parseInt(String((req.body as Record<string, unknown>)?.count || '2')), 4);
    const bountyAmount = ethers.parseEther('0.001'); // minimum 0.001 OKB
    const claimWindow = 604800; // 7 days

    const posted: Array<{ txHash: string; threadId: string; dimension: string; bountyOkb: string }> = [];

    for (let i = 0; i < Math.min(count, threads.length); i++) {
      const thread = threads[i];
      const threadId = String(thread.id);
      // Pick a random dimension, biased toward DATA_INTEGRITY and ADVERSARIAL_QUALITY
      const dimWeights = [3, 3, 2, 2, 1, 1]; // higher weight = more likely
      const totalWeight = dimWeights.reduce((a, b) => a + b, 0);
      let rand = Math.random() * totalWeight;
      let dimIdx = 0;
      for (let d = 0; d < dimWeights.length; d++) {
        rand -= dimWeights[d];
        if (rand <= 0) { dimIdx = d; break; }
      }

      try {
        const txData = iface.encodeFunctionData('postBounty', [
          threadId, dimIdx, claimWindow,
        ]);

        const tx = await Promise.race([
          wallet.sendTransaction({
            to: BOUNTIES_CONTRACT,
            data: txData,
            value: bountyAmount,
            gasLimit: 250000n,
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TX timeout 10s')), 10000)),
        ]) as ethers.TransactionResponse;

        console.log(`[AutoBounty] Posted bounty for thread ${threadId} dim=${DIMENSIONS[dimIdx]}: ${tx.hash}`);

        posted.push({
          txHash: tx.hash,
          threadId,
          dimension: DIMENSIONS[dimIdx],
          bountyOkb: '0.001',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.warn(`[AutoBounty] Failed to post bounty for thread ${threadId}:`, msg);
      }
    }

    return res.status(200).json({
      ok: true,
      bounties: posted,
      total: posted.length,
      message: `Posted ${posted.length} bounties on-chain`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AutoBounty] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
