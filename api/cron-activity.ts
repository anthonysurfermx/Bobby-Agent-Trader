// ============================================================
// GET /api/cron-activity — Vercel cron trigger for on-chain activity
// Runs every 2 hours, generates ~11 txs across 5 contracts
// Auth: Vercel cron sets Authorization header automatically
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://bobbyprotocol.xyz';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel crons use GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only (Vercel cron)' });
  }

  // Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET || process.env.BOBBY_CYCLE_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Call the main generate-activity endpoint
    const response = await fetch(`${BASE_URL}/api/generate-activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret || ''}`,
      },
      body: JSON.stringify({
        signals: 3,
        bounties: 2,
        commits: 2,
        economy: true,
        oracle: true,
      }),
    });

    const data = await response.json();

    console.log(`[CronActivity] Generated ${data.generated || 0} txs, cost: ${data.cost?.spent || '?'} OKB`);

    // ── Post consolidated checkpoint to Moltbook ──
    // Replaces per-cycle spam with 4h checkpoint summaries
    let moltbookResult: string | null = null;
    const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY;
    if (MOLTBOOK_KEY) {
      try {
        const cpRes = await fetch(`${BASE_URL}/api/checkpoint?hours=4`);
        if (cpRes.ok) {
          const cp = await cpRes.json() as Record<string, unknown>;
          const rd = cp.risk_decisions as Record<string, unknown> || {};
          const oc = cp.on_chain as Record<string, unknown> || {};
          const guardrails = cp.guardrails as Record<string, unknown> || {};
          const latest = cp.latest_debate as Record<string, unknown> | null;

          const title = `Bobby checkpoint: ${rd.total_debates || 0} debates | ${rd.executed || 0} executed | ${rd.block_rate_pct || 0}% blocked`;

          const latestStr = latest
            ? `\n**Latest**: ${latest.symbol} ${(latest.direction as string || '').toUpperCase()} — conviction ${latest.conviction}/10 → ${latest.decision}\n${latest.reason ? `> ${latest.reason}` : ''}`
            : '';

          const content = `Bobby Protocol — 4h Checkpoint

**Risk Decisions** (last 4 hours)
Debates: ${rd.total_debates} | Executed: ${rd.executed} | Blocked: ${rd.blocked} (${rd.block_rate_pct}%)
Avg conviction: ${rd.avg_conviction}/10 | Max: ${rd.max_conviction}/10
Resolved: ${rd.resolved_in_window} (W: ${rd.wins_in_window} / L: ${rd.losses_in_window})
${latestStr}

**On-Chain Proof**
Commitments: ${oc.total_commitments || '—'} | Win rate: ${oc.win_rate_pct || '—'}%
Bounties: ${oc.total_bounties || '—'} | Treasury: ${oc.treasury_okb || '—'} OKB
Protocol volume: ${oc.protocol_volume_okb || '—'} OKB

**Guardrails**: ${guardrails.circuit_breaker || 'ARMED'} | Yield parking: ${guardrails.yield_parking || 'STANDBY'}
Philosophy: **fail-closed** — no consensus → no trade

On-chain activity: ${data.generated || 0} txs this window
Checkpoint: ${BASE_URL}/api/checkpoint
MCP: ${BASE_URL}/api/mcp-http
Heartbeat: ${BASE_URL}/protocol/heartbeat`;

          const postRes = await fetch('https://www.moltbook.com/api/v1/posts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${MOLTBOOK_KEY}`,
            },
            body: JSON.stringify({ submolt_name: 'buildx', title, content }),
          });

          if (postRes.ok) {
            const postData = await postRes.json() as Record<string, unknown>;
            const post = postData.post as Record<string, unknown> | undefined;
            const verification = post?.verification as Record<string, unknown> | undefined;

            // Auto-solve verification challenge
            if (verification?.challenge_text && verification?.verification_code) {
              const challengeText = String(verification.challenge_text);
              const cleaned = challengeText.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').toLowerCase();
              const numberWords: Record<string, number> = {
                zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
                six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
                eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
                sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
                thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
                hundred: 100, thousand: 1000,
              };
              const words = cleaned.split(' ');
              const numbers: number[] = [];
              let currentNum = 0;
              let hasNum = false;
              for (const word of words) {
                if (numberWords[word] !== undefined) {
                  const val = numberWords[word];
                  if (val === 100) { currentNum = (currentNum || 1) * 100; }
                  else if (val === 1000) { currentNum = (currentNum || 1) * 1000; }
                  else if (val >= 20 && val <= 90) { currentNum += val; }
                  else {
                    if (hasNum && currentNum > 0 && val < 10) { currentNum += val; }
                    else if (currentNum > 0 && val >= 10) { numbers.push(currentNum); currentNum = val; }
                    else { currentNum += val; }
                  }
                  hasNum = true;
                } else if (hasNum && ['and', 'adds', 'plus', 'with', 'accelerates', 'increases'].includes(word)) {
                  if (currentNum > 0) { numbers.push(currentNum); currentNum = 0; }
                } else if (hasNum && ['minus', 'subtract', 'less', 'slows', 'decreases'].includes(word)) {
                  if (currentNum > 0) { numbers.push(currentNum); currentNum = 0; }
                  numbers.push(-1);
                } else if (/^\d+$/.test(word)) {
                  currentNum += parseInt(word);
                  hasNum = true;
                }
              }
              if (currentNum > 0) numbers.push(currentNum);
              let result = 0;
              let subtract = false;
              for (const n of numbers) {
                if (n === -1) { subtract = true; continue; }
                if (subtract) { result -= n; subtract = false; }
                else { result += n; }
              }
              if (numbers.length > 0 && numbers.some(n => n > 0)) {
                await fetch('https://www.moltbook.com/api/v1/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MOLTBOOK_KEY}` },
                  body: JSON.stringify({ verification_code: String(verification.verification_code), answer: result.toFixed(2) }),
                });
              }
            }
            moltbookResult = 'posted';
            console.log('[CronActivity] Moltbook checkpoint posted to m/buildx');
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'unknown';
        console.warn('[CronActivity] Moltbook checkpoint failed (non-critical):', msg);
        moltbookResult = `failed: ${msg}`;
      }
    }

    return res.status(200).json({
      ok: true,
      source: 'cron',
      schedule: 'every 4 hours',
      result: data,
      moltbook: moltbookResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CronActivity] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
