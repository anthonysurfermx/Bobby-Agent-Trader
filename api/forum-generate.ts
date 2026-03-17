// ============================================================
// POST /api/forum-generate
// Generates a new debate thread: Alpha Hunter → Red Team → Bobby CIO
// Triggered by cron (every 4h) or manually
// Uses Haiku for Alpha, Sonnet for Red Team + Bobby CIO
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

interface ForumThread {
  topic: string;
  trigger_reason: string;
  trigger_data: Record<string, unknown>;
  language: string;
  conviction_score: number | null;
  price_at_creation: Record<string, unknown>;
}

async function callClaude(model: string, system: string, userMsg: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${model}: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text || '';
}

async function fetchBriefing(): Promise<{ briefing: string; prices: any[]; fearGreed: any; dxy: any; regime: string } | null> {
  try {
    // Fetch directly from production URL — always works
    const urls = [
      'https://defimexico.org/api/bobby-intel',
      'https://defi-mexico-hub.vercel.app/api/bobby-intel',
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) return await res.json();
      } catch { continue; }
    }
    return null;
  } catch { return null; }
}

async function insertThread(thread: ForumThread): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/forum_threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(thread),
    });
    if (!res.ok) { console.error('[Forum] Thread insert failed:', res.status); return null; }
    const data = await res.json();
    return data[0]?.id || null;
  } catch (e) { console.error('[Forum] Thread insert error:', e); return null; }
}

async function insertPost(threadId: string, agent: string, content: string, dataSnapshot: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/forum_posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
      },
      body: JSON.stringify({ thread_id: threadId, agent, content, data_snapshot: dataSnapshot }),
    });
    return res.ok;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Anthropic API key not configured' });
  }

  const { language = 'en' } = req.body as { language?: string };
  const lang = language === 'es' ? 'es' : 'en';

  try {
    // 1. Fetch current market data
    const intel = await fetchBriefing();
    if (!intel?.briefing) {
      return res.status(503).json({ error: 'Could not fetch market data' });
    }

    const briefing = intel.briefing;
    const langInstruction = lang === 'es'
      ? 'Responde en español mexicano. Términos de trading en inglés están bien.'
      : 'Respond in English.';

    // 2. Detect what's interesting for the topic
    const topicPrompt = `Based on this market data, identify the SINGLE most interesting trading debate topic right now. Reply with ONLY the topic as a short headline (max 10 words) and a one-sentence trigger reason. Format: TOPIC: ... | REASON: ...

${briefing}`;

    const topicRaw = await callClaude('claude-haiku-4-5-20251001', 'You identify trading debate topics from market data. Be specific — reference actual numbers.', topicPrompt, 100);
    const topicMatch = topicRaw.match(/TOPIC:\s*(.+?)\s*\|\s*REASON:\s*(.+)/i);
    const topic = topicMatch?.[1]?.trim() || 'Market Analysis';
    const triggerReason = topicMatch?.[2]?.trim() || 'Scheduled market scan';

    // 3. Alpha Hunter (Haiku — cheap, aggressive)
    const alphaSystem = `You are Alpha Hunter — a young, hungry female trader. Your bonus depends on finding alpha. You speak fast, use data aggressively, and have zero patience for hesitation. You reference specific numbers from the data. ${langInstruction} Keep it to 2-3 short paragraphs. Be SPECIFIC with entries, targets, stops.`;
    const alphaPost = await callClaude('claude-haiku-4-5-20251001', alphaSystem, `Here's the market data. Find the BEST trade opportunity right now and pitch it like your career depends on it:\n\n${briefing}`, 300);

    // 4. Red Team (Sonnet — needs nuance for adversarial thinking)
    const redSystem = `You are Red Team — a 15-year risk veteran who lost $30M in 2022 because he trusted a thesis that "looked obvious". Your career depends on finding why Alpha Hunter is wrong. If you fail and the trade blows up, YOU take the blame. Be RUTHLESS. Attack selection bias, missing data, historical precedents where this failed. ${langInstruction} Keep it to 2-3 short paragraphs. Every paragraph is a kill shot.`;
    const redPost = await callClaude('claude-sonnet-4-20250514', redSystem, `Here's the market data and Alpha Hunter's thesis. DESTROY it:\n\nMARKET DATA:\n${briefing}\n\nALPHA HUNTER'S THESIS:\n${alphaPost}`, 350);

    // 5. Bobby CIO (Sonnet — needs judgment for verdict)
    const cioSystem = `You are Bobby — named after Bobby Axelrod. You're the CIO. You just heard Alpha Hunter's bull case and Red Team's attack. You MUST pick a side — no fence-sitting. Give a conviction score X/10, a specific trade or "sitting out", and what would change your mind. ${langInstruction} Keep it to 2 short paragraphs. End with conviction score.`;
    const cioPost = await callClaude('claude-sonnet-4-20250514', cioSystem, `MARKET DATA:\n${briefing}\n\nALPHA HUNTER:\n${alphaPost}\n\nRED TEAM:\n${redPost}\n\nMake your decision.`, 300);

    // Extract conviction score
    const convMatch = cioPost.match(/(\d+)\s*\/\s*10/);
    const conviction = convMatch ? parseInt(convMatch[1]) / 10 : null;

    // 6. Store in Supabase
    const threadId = await insertThread({
      topic,
      trigger_reason: triggerReason,
      trigger_data: { regime: intel.regime, fgi: intel.fearGreed, dxy: intel.dxy },
      language: lang,
      conviction_score: conviction,
      price_at_creation: Object.fromEntries((intel.prices || []).map((p: any) => [p.symbol, p.price])),
    });

    if (!threadId) {
      return res.status(500).json({ error: 'Failed to create thread' });
    }

    const dataSnapshot = { regime: intel.regime, fgi: intel.fearGreed, dxy: intel.dxy };

    // Insert posts sequentially (order matters)
    await insertPost(threadId, 'alpha', alphaPost, dataSnapshot);
    await insertPost(threadId, 'redteam', redPost, dataSnapshot);
    await insertPost(threadId, 'cio', cioPost, dataSnapshot);

    return res.status(200).json({
      ok: true,
      threadId,
      topic,
      triggerReason,
      conviction,
      language: lang,
      posts: { alpha: alphaPost.length, redteam: redPost.length, cio: cioPost.length },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Forum] Generate error:', msg);
    return res.status(500).json({ error: msg });
  }
}
