// ============================================================
// POST /api/judge-mode
// Bobby Judge Mode — Adversarial audit of the 3-agent debate
// Evaluates: data integrity, adversarial quality, decision logic,
// risk management, calibration alignment, novelty
// Returns structured verdict with bias detection
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60, memory: 512 };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const SB_URL = process.env.SB_URL || process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Dimension weights from ai-judge-manifest.json
const DIMENSIONS = {
  data_integrity: 0.20,
  adversarial_quality: 0.25,
  decision_logic: 0.20,
  risk_management: 0.15,
  calibration_alignment: 0.10,
  novelty: 0.10,
} as const;

interface JudgeVerdict {
  thread_id: string;
  overall_score: number;
  dimensions: Record<string, number>;
  biases_detected: string[];
  conviction_assessment: string;
  recommendation: string;
  rationale: string;
  red_flags: string[];
}

async function fetchThread(threadId: string) {
  const res = await fetch(
    `${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}&select=*`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchPosts(threadId: string) {
  const res = await fetch(
    `${SB_URL}/rest/v1/forum_posts?thread_id=eq.${threadId}&select=*&order=created_at.asc`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchLatestThread() {
  const res = await fetch(
    `${SB_URL}/rest/v1/forum_threads?select=*&order=created_at.desc&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchCalibration(): Promise<{ winRate: number; recentLosses: number; mood: string } | null> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/forum_threads?resolution=neq.pending&select=resolution,conviction_score&order=created_at.desc&limit=20`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    if (!res.ok) return null;
    const resolved = await res.json() as Array<{ resolution: string; conviction_score: number }>;
    if (!resolved.length) return null;

    const wins = resolved.filter((r: any) => r.resolution === 'win').length;
    const winRate = wins / resolved.length;
    const recentLosses = resolved.slice(0, 5).filter((r: any) => r.resolution === 'loss').length;
    const mood = winRate >= 0.7 ? 'confident' : winRate >= 0.5 ? 'cautious' : 'tilted';

    return { winRate, recentLosses, mood };
  } catch { return null; }
}

function buildJudgePrompt(
  thread: any,
  posts: any[],
  calibration: { winRate: number; recentLosses: number; mood: string } | null,
): string {
  const alphaPost = posts.find((p: any) => p.agent === 'alpha')?.content || '[No Alpha Hunter post]';
  const redPost = posts.find((p: any) => p.agent === 'redteam')?.content || '[No Red Team post]';
  const cioPost = posts.find((p: any) => p.agent === 'cio')?.content || '[No CIO post]';

  const calBlock = calibration
    ? `CALIBRATION: Win rate ${(calibration.winRate * 100).toFixed(0)}% (last 20), recent losses ${calibration.recentLosses}/5, mood: ${calibration.mood}`
    : 'CALIBRATION: No historical data available';

  return `You are the INDEPENDENT JUDGE auditing Bobby Protocol's 3-agent debate system.
Your job: evaluate whether this debate was rigorous enough to risk real capital.

DEBATE TOPIC: ${thread.topic}
SYMBOL: ${thread.symbol || 'N/A'}
DIRECTION: ${thread.direction || 'N/A'}
CIO CONVICTION: ${thread.conviction_score != null ? (thread.conviction_score * 10).toFixed(1) + '/10' : 'N/A'}
ENTRY: ${thread.entry_price || 'N/A'} | STOP: ${thread.stop_price || 'N/A'} | TARGET: ${thread.target_price || 'N/A'}
${calBlock}

--- ALPHA HUNTER ---
${alphaPost}

--- RED TEAM ---
${redPost}

--- BOBBY CIO VERDICT ---
${cioPost}

Evaluate this debate on these 6 dimensions (score 1-5 each):

1. DATA_INTEGRITY: Did agents cite real numbers from the briefing? Are claims verifiable?
2. ADVERSARIAL_QUALITY: Did Red Team genuinely challenge Alpha with specific counter-evidence? Or was it superficial?
3. DECISION_LOGIC: Does CIO's verdict logically follow from the debate? Is the conviction level justified?
4. RISK_MANAGEMENT: Are stops defined? Is risk/reward proportional to conviction?
5. CALIBRATION_ALIGNMENT: Given the track record (${calBlock}), is this conviction level appropriate?
6. NOVELTY: Did the debate surface non-obvious insights, or just repeat common narratives?

Also detect any cognitive biases from this list:
- recency_bias: Over-weighting last 24h
- confirmation_bias: Cherry-picking supporting indicators
- anchoring: Fixating on price level without reason
- herd_mentality: Following consensus blindly
- overconfidence: High conviction without evidence
- loss_aversion: Avoiding valid trades due to recent losses

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "dimensions": {
    "data_integrity": <1-5>,
    "adversarial_quality": <1-5>,
    "decision_logic": <1-5>,
    "risk_management": <1-5>,
    "calibration_alignment": <1-5>,
    "novelty": <1-5>
  },
  "biases_detected": ["bias_name", ...],
  "conviction_assessment": "well-calibrated" | "overconfident" | "underconfident",
  "recommendation": "execute" | "reduce_size" | "pass" | "reverse",
  "rationale": "2-3 sentences explaining your verdict",
  "red_flags": ["critical issue 1", ...]
}`;
}

function computeOverallScore(dimensions: Record<string, number>): number {
  let score = 0;
  for (const [dim, weight] of Object.entries(DIMENSIONS)) {
    const val = dimensions[dim] || 1;
    score += (val / 5) * weight * 100;
  }
  return Math.round(score);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const { thread_id, language = 'en' } = req.body as { thread_id?: string; language?: string };

  if (thread_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(thread_id)) {
    return res.status(400).json({ error: 'thread_id must be a valid UUID' });
  }
  if (language !== 'en' && language !== 'es') {
    return res.status(400).json({ error: 'language must be "en" or "es"' });
  }

  try {
    // Fetch thread — by ID or latest
    const thread = thread_id ? await fetchThread(thread_id) : await fetchLatestThread();
    if (!thread) {
      return res.status(404).json({ error: 'No debate thread found' });
    }

    // Fetch posts and calibration in parallel
    const [posts, calibration] = await Promise.all([
      fetchPosts(thread.id),
      fetchCalibration(),
    ]);

    if (posts.length < 2) {
      return res.status(422).json({ error: 'Debate incomplete — need at least Alpha + Red Team posts' });
    }

    // Build prompt and call OpenAI
    const prompt = buildJudgePrompt(thread, posts, calibration);
    const langNote = language === 'es'
      ? ' Write the rationale and red_flags in Spanish.'
      : '';
    const systemMsg = `You are an independent AI judge auditing trading debates for Bobby Protocol. You are RUTHLESSLY honest. You evaluate debate quality, not market predictions. Output valid JSON only.${langNote}`;

    let raw = '';

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!openaiRes.ok) {
      const err = await openaiRes.text().catch(() => '');
      console.error('[JudgeMode] OpenAI error:', openaiRes.status, err);
      return res.status(502).json({ error: `OpenAI ${openaiRes.status}`, detail: err.slice(0, 300) });
    }
    const data = await openaiRes.json() as { choices: Array<{ message: { content: string } }> };
    raw = data.choices[0]?.message?.content || '';
    console.log('[JudgeMode] Used OpenAI gpt-4o');

    if (!raw) {
      return res.status(503).json({ error: 'OpenAI returned empty response' });
    }

    // Parse JSON from response (strip markdown fences if any)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('[JudgeMode] Failed to parse:', raw);
      return res.status(502).json({ error: 'Judge returned invalid JSON', raw });
    }

    const overallScore = computeOverallScore(parsed.dimensions || {});

    const verdict: JudgeVerdict = {
      thread_id: thread.id,
      overall_score: overallScore,
      dimensions: parsed.dimensions,
      biases_detected: parsed.biases_detected || [],
      conviction_assessment: parsed.conviction_assessment || 'unknown',
      recommendation: parsed.recommendation || 'pass',
      rationale: parsed.rationale || '',
      red_flags: parsed.red_flags || [],
    };

    // Store verdict in thread's debate_quality column
    await fetch(
      `${SB_URL}/rest/v1/forum_threads?id=eq.${thread.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({
          debate_quality: {
            judge_version: '1.0.0',
            overall_score: verdict.overall_score,
            dimensions: verdict.dimensions,
            biases: verdict.biases_detected,
            conviction_assessment: verdict.conviction_assessment,
            recommendation: verdict.recommendation,
            red_flags: verdict.red_flags,
            judged_at: new Date().toISOString(),
          },
        }),
      },
    ).catch((err) => console.error('[JudgeMode] Failed to store verdict:', err));

    return res.status(200).json({
      ok: true,
      verdict,
      thread: {
        id: thread.id,
        topic: thread.topic,
        symbol: thread.symbol,
        direction: thread.direction,
        conviction_score: thread.conviction_score,
      },
      manifest: {
        version: '1.0.0',
        thresholds: {
          min_score_to_execute: 60,
          min_adversarial_quality: 3,
          max_biases_to_execute: 2,
          auto_pass_below: 40,
        },
      },
    });
  } catch (err: any) {
    console.error('[JudgeMode] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
