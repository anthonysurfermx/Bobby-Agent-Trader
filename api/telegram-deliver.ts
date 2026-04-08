// ============================================================
// POST /api/telegram-deliver — Deliver debates to Telegram
// Called by user-cycle after generating a debate
// Handles both B2C (DM) and B2B (Group) delivery
// Includes voice note generation via Edge TTS
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CYCLE_SECRET = process.env.BOBBY_CYCLE_SECRET || '';
const BASE_URL = 'https://defimexico.org';

// B2C: 100 free messages, then $1 USDT
const FREE_MESSAGE_LIMIT = 100;

async function sendTelegramMessage(chatId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return res.ok;
}

async function sendVoiceNote(chatId: number, text: string, caption?: string) {
  try {
    const ttsRes = await fetch(`${BASE_URL}/api/bobby-voice-free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1500), voice: 'cio', lang: 'en' }),
    });
    if (!ttsRes.ok) return false;
    const audioBuffer = await ttsRes.arrayBuffer();

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'analysis.ogg');
    if (caption) formData.append('caption', caption);

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
      method: 'POST',
      body: formData,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// B2C DM format — personal, direct
function renderDMMessage(agentName: string, posts: any, conviction: number, symbol: string | null, threadId: string): string {
  const alpha = posts.find((p: any) => p.agent === 'alpha')?.content?.slice(0, 250) || '';
  const redteam = posts.find((p: any) => p.agent === 'redteam')?.content?.slice(0, 250) || '';
  const cio = posts.find((p: any) => p.agent === 'cio')?.content?.slice(0, 300) || '';
  const conv = Math.round(conviction * 10);

  return `📡 <b>${agentName} CYCLE REPORT</b>\n\n` +
    `🟢 <b>Alpha:</b> "${alpha}"\n\n` +
    `🔴 <b>Red Team:</b> "${redteam}"\n\n` +
    `🟡 <b>${agentName} CIO:</b> "${cio}"\n\n` +
    `⚡ CONVICTION: ${conv}/10 ${conv >= 6 ? '— SIGNAL ACTIVE' : '— NO TRADE'}\n` +
    (symbol ? `🎯 FOCUS: ${symbol}\n` : '') +
    `\n🖥 <a href="${BASE_URL}/agentic-world/forum">Open Full Terminal</a>`;
}

// B2B Group format — institutional, with viral CTA
function renderGroupMessage(posts: any, conviction: number, symbol: string | null, threadId: string): string {
  const alpha = posts.find((p: any) => p.agent === 'alpha')?.content?.slice(0, 200) || '';
  const redteam = posts.find((p: any) => p.agent === 'redteam')?.content?.slice(0, 200) || '';
  const cio = posts.find((p: any) => p.agent === 'cio')?.content?.slice(0, 250) || '';
  const conv = Math.round(conviction * 10);

  return `🚨 <b>BOBBY AGENT TRADER: Market Intelligence</b>\n\n` +
    `🟢 <b>ALPHA HUNTER:</b> "${alpha}"\n\n` +
    `🔴 <b>RED TEAM:</b> "${redteam}"\n\n` +
    `⚖️ <b>BOBBY CIO:</b> "${cio}"\n\n` +
    `📊 CONVICTION: ${conv}/10` +
    (symbol ? ` | 🎯 ${symbol}` : '') + `\n\n` +
    `💬 <a href="${BASE_URL}/agentic-world/forum">Discuss on Forum</a>` +
    ` | 🤖 <a href="${BASE_URL}/agentic-world/bobby/b2b">Add Bobby to your group</a>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth
  if (CYCLE_SECRET) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${CYCLE_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SB_SERVICE_KEY || !BOT_TOKEN) return res.status(500).json({ error: 'Server misconfigured' });

  const supabase = createClient(SB_URL, SB_SERVICE_KEY);
  const { thread_id, agent_profile_id, conviction, symbol } = req.body || {};

  if (!thread_id) return res.status(400).json({ error: 'thread_id required' });

  // Load posts for this thread
  const { data: posts } = await supabase
    .from('forum_posts')
    .select('agent, content')
    .eq('thread_id', thread_id)
    .order('created_at', { ascending: true });

  if (!posts || posts.length === 0) return res.status(404).json({ error: 'No posts found' });

  const cioPost = posts.find(p => p.agent === 'cio')?.content || '';
  const results: any[] = [];

  // === B2C: Deliver to DM connections ===
  if (agent_profile_id) {
    const { data: connections } = await supabase
      .from('telegram_connections')
      .select('*')
      .eq('agent_profile_id', agent_profile_id)
      .eq('status', 'active');

    if (connections) {
      for (const conn of connections) {
        // Check message limit (B2C monetization)
        if (!conn.is_premium && conn.message_count >= FREE_MESSAGE_LIMIT) {
          // Send paywall message
          await sendTelegramMessage(conn.telegram_chat_id,
            `⚠️ <b>Free limit reached</b>\n\n` +
            `You've received ${FREE_MESSAGE_LIMIT} free intelligence reports.\n\n` +
            `To continue receiving ${conn.wallet_address ? 'your agent\'s' : ''} debates:\n` +
            `💰 <b>$1 USDT/month</b> on X Layer\n\n` +
            `👉 <a href="${BASE_URL}/agentic-world/bobby/telegram">Upgrade to Premium</a>\n\n` +
            `<i>Type /pause to stop messages.</i>`
          );
          results.push({ type: 'dm', chat_id: conn.telegram_chat_id, status: 'paywall' });
          continue;
        }

        // Get agent name
        const agentName = (() => {
          if (!agent_profile_id) return 'BOBBY';
          // We'd need to fetch this, but for now use a default
          return 'YOUR AGENT';
        })();

        const msg = renderDMMessage(agentName, posts, conviction || 0, symbol, thread_id);
        const sent = await sendTelegramMessage(conn.telegram_chat_id, msg);

        if (sent) {
          // Send voice note
          await sendVoiceNote(conn.telegram_chat_id, cioPost.slice(0, 500),
            `🎙 ${agentName} CIO — Voice Analysis`
          );

          // Increment message count
          await supabase.from('telegram_connections')
            .update({ message_count: conn.message_count + 1 })
            .eq('id', conn.id);
        }

        results.push({ type: 'dm', chat_id: conn.telegram_chat_id, status: sent ? 'sent' : 'failed' });

        // Throttle: 1 sec between deliveries
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // === B2B: Deliver to active groups ===
  const { data: activeGroups } = await supabase
    .from('telegram_subscriptions')
    .select('telegram_group_id')
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString());

  if (activeGroups) {
    for (const group of activeGroups) {
      const msg = renderGroupMessage(posts, conviction || 0, symbol, thread_id);
      const sent = await sendTelegramMessage(group.telegram_group_id, msg);

      if (sent) {
        // Send voice note to group
        await sendVoiceNote(group.telegram_group_id, cioPost.slice(0, 500),
          `🎙 Bobby CIO — Market Briefing`
        );
      }

      results.push({ type: 'group', group_id: group.telegram_group_id, status: sent ? 'sent' : 'failed' });
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return res.status(200).json({
    ok: true,
    delivered: results.filter(r => r.status === 'sent').length,
    total: results.length,
    results,
  });
}
