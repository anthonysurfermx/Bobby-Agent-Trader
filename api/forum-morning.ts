// ============================================================
// POST /api/forum-morning
// Morning Meeting — Bobby's daily autonomous market briefing
// Generates 1 debate per day with the most interesting market setup
// Uses Haiku for detection, Sonnet only if something extreme found
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

async function callClaude(model: string, system: string, userMsg: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  if (!res.ok) throw new Error(`Claude ${model}: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text || '';
}

async function getTrackRecord(): Promise<{ wins: number; losses: number; winRate: number; lastCalls: string }> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/forum_threads?resolution=neq.pending&resolution=not.is.null&select=resolution,symbol,conviction_score,resolution_pnl_pct&order=resolved_at.desc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) return { wins: 0, losses: 0, winRate: 50, lastCalls: 'No history' };
    const data = await res.json() as Array<{ resolution: string; symbol: string; conviction_score: number; resolution_pnl_pct: number }>;
    const wins = data.filter(d => d.resolution === 'win').length;
    const losses = data.filter(d => d.resolution === 'loss').length;
    const total = data.length || 1;
    const lastCalls = data.slice(0, 5).map(d =>
      `${d.symbol}: ${d.resolution.toUpperCase()} (${d.resolution_pnl_pct > 0 ? '+' : ''}${d.resolution_pnl_pct}%)`
    ).join(', ') || 'No history';
    return { wins, losses, winRate: Math.round((wins / total) * 100), lastCalls };
  } catch { return { wins: 0, losses: 0, winRate: 50, lastCalls: 'No history' }; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'No API key' });

  const { language = 'en' } = req.body as { language?: string };
  const lang = language === 'es' ? 'es' : 'en';

  try {
    // Fetch market data
    const intelRes = await fetch('https://defi-mexico-hub.vercel.app/api/bobby-intel');
    if (!intelRes.ok) return res.status(503).json({ error: 'No market data' });
    const intel = await intelRes.json();

    // Get Bobby's track record for memory injection
    const track = await getTrackRecord();

    const langRule = lang === 'es'
      ? 'Responde en español mexicano. Términos de trading en inglés están bien.'
      : 'Respond in English.';

    const memoryBlock = `\n\nBOBBY'S TRACK RECORD:\nWin Rate: ${track.winRate}%\nLast 5 calls: ${track.lastCalls}\n${track.winRate < 60 ? 'WARNING: Your accuracy is below 60%. Red Team should be more aggressive. Be humble about your recent performance.' : track.winRate > 80 ? 'You are on fire. But overconfidence kills — remember that.' : ''}`;

    // Alpha Hunter
    const alphaPost = await callClaude('claude-haiku-4-5-20251001',
      `You are Alpha Hunter — a young hungry female trader. Your bonus depends on finding alpha. Speak fast, cite specific numbers. ${langRule} 2-3 short paragraphs. Be SPECIFIC with entry/target/stop prices.`,
      `MORNING MARKET SCAN. Find the BEST trade for today:\n\n${intel.briefing}${memoryBlock}`, 350);

    // Red Team
    const redPost = await callClaude('claude-sonnet-4-20250514',
      `You are Red Team — a 15-year risk veteran who lost $30M in 2022. Your career depends on finding why Alpha is wrong. Be RUTHLESS. ${langRule} 2-3 short paragraphs.${track.winRate < 60 ? ' Bobby has been WRONG recently. Be extra aggressive.' : ''}`,
      `MARKET DATA:\n${intel.briefing}\n\nALPHA HUNTER'S THESIS:\n${alphaPost}${memoryBlock}`, 350);

    // Bobby CIO with memory
    const cioPost = await callClaude('claude-sonnet-4-20250514',
      `You are Bobby CIO. Pick a side, give conviction X/10, specific play with entry/stop/target. ${langRule} 2 short paragraphs.${track.winRate < 60 ? ' Your recent calls have been poor. Acknowledge it and adjust.' : ''}`,
      `MARKET DATA:\n${intel.briefing}\n\nALPHA:\n${alphaPost}\n\nRED TEAM:\n${redPost}${memoryBlock}`, 300);

    // Extract conviction
    const convMatch = cioPost.match(/(\d+)\s*\/\s*10/);
    const conviction = convMatch ? parseInt(convMatch[1]) / 10 : null;

    // Extract trade params
    const entryMatch = cioPost.match(/(?:entry|buy(?:ing)?)\s*(?:at|en)?\s*\$?([\d,]+(?:\.\d+)?)/i);
    const stopMatch = cioPost.match(/(?:stop(?:\s*loss)?|sl)\s*(?:at|en)?\s*\$?([\d,]+(?:\.\d+)?)/i);
    const targetMatch = cioPost.match(/(?:target|tp|take\s*profit)\s*(?:at|en)?\s*\$?([\d,]+(?:\.\d+)?)/i);
    const dirMatch = cioPost.match(/\b(long|short)\b/i);
    const symMatch = (alphaPost + cioPost).match(/\b(BTC|ETH|SOL|HYPE|XRP)\b/i);

    const topic = lang === 'es' ? `Morning Meeting — ${new Date().toLocaleDateString('es')}` : `Morning Meeting — ${new Date().toLocaleDateString('en')}`;

    // Insert thread
    const threadRes = await fetch(`${SB_URL}/rest/v1/forum_threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=representation' },
      body: JSON.stringify({
        topic,
        trigger_reason: 'Autonomous Morning Meeting — daily market scan',
        language: lang,
        conviction_score: conviction,
        price_at_creation: Object.fromEntries((intel.prices || []).map((p: any) => [p.symbol, p.price])),
        symbol: symMatch ? symMatch[1].toUpperCase() : 'BTC',
        direction: dirMatch ? dirMatch[1].toLowerCase() : 'long',
        entry_price: entryMatch ? parseFloat(entryMatch[1].replace(/,/g, '')) : null,
        stop_price: stopMatch ? parseFloat(stopMatch[1].replace(/,/g, '')) : null,
        target_price: targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : null,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (!threadRes.ok) return res.status(500).json({ error: 'Failed to create thread' });
    const threadData = await threadRes.json();
    const threadId = threadData[0]?.id;

    if (threadId) {
      const snapshot = { regime: intel.regime, fgi: intel.fearGreed, dxy: intel.dxy, trackRecord: track };
      for (const post of [{ agent: 'alpha', content: alphaPost }, { agent: 'redteam', content: redPost }, { agent: 'cio', content: cioPost }]) {
        await fetch(`${SB_URL}/rest/v1/forum_posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          body: JSON.stringify({ thread_id: threadId, agent: post.agent, content: post.content, data_snapshot: snapshot }),
        });
      }
    }

    return res.status(200).json({ ok: true, threadId, topic, conviction, trackRecord: track });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Morning] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
