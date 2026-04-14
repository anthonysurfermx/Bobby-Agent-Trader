// ============================================================
// POST /api/telegram-webhook — Telegram Bot Webhook
// Handles: bot added to group, messages, commands
// When bot is added to a group:
//   1. Creates telegram_groups record
//   2. Sends DM to admin with activation link
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 10 };

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = 'https://bobbyprotocol.xyz';

async function sendTelegramMessage(chatId: number, text: string, parseMode = 'HTML') {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
}

async function sendVoiceNote(chatId: number, text: string, caption?: string) {
  try {
    // Generate TTS audio via Edge TTS server on Digital Ocean
    const ttsRes = await fetch('https://bobbyprotocol.xyz/api/bobby-voice-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 2000), voice: 'cio', lang: 'en' }),
    });

    if (!ttsRes.ok) return;
    const audioBuffer = await ttsRes.arrayBuffer();

    // Send voice note to Telegram
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'bobby_analysis.ogg');
    if (caption) formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    console.error('[telegram-webhook] Voice note failed:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // P1 FIX: Validate webhook comes from Telegram (fail closed)
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not set — rejecting all webhooks');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  const update = req.body;
  if (!update) return res.status(200).json({ ok: true });

  const supabase = SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY) : null;

  try {
    // Handle: Bot added to a group
    if (update.my_chat_member) {
      const chat = update.my_chat_member.chat;
      const from = update.my_chat_member.from;
      const newStatus = update.my_chat_member.new_chat_member?.status;

      if (chat.type === 'group' || chat.type === 'supergroup') {
        if (newStatus === 'member' || newStatus === 'administrator') {
          // Bot was added to a group
          const groupId = chat.id;
          const groupName = chat.title || 'Unknown Group';
          const groupUsername = chat.username || null;
          const addedByUserId = from.id;
          const addedByUsername = from.username || from.first_name || 'Unknown';

          // Save to Supabase
          if (supabase) {
            await supabase.from('telegram_groups').upsert({
              telegram_group_id: groupId,
              telegram_group_name: groupName,
              telegram_group_username: groupUsername,
              added_by_telegram_user_id: addedByUserId,
              added_by_telegram_username: addedByUsername,
              bot_status: 'pending_payment',
            }, { onConflict: 'telegram_group_id' });
          }

          const activationUrl = `${BASE_URL}/agentic-world/bobby/telegram?activate=${groupId}`;

          // Try DM to admin (may fail if they haven't /start the bot)
          try {
            await sendTelegramMessage(addedByUserId,
              `🎯 <b>Bobby Agent Trader</b>\n\n` +
              `You added me to <b>${groupName}</b>.\n\n` +
              `To activate, complete the x402 payment:\n\n` +
              `👉 <a href="${activationUrl}">Activate Bobby for ${groupName}</a>\n\n` +
              `Cost: <b>0.01 USDT</b> on X Layer\nAccess: <b>30 days</b>`
            );
          } catch { /* DM failed — user hasn't started bot yet */ }

          // Always send activation link in the group too
          await sendTelegramMessage(groupId,
            `🎯 <b>Bobby Agent Trader</b> has joined!\n\n` +
            `⏳ Activation pending.\n\n` +
            `To activate multi-agent trading intelligence:\n` +
            `👉 <a href="${activationUrl}">Activate Bobby — 0.01 USDT on X Layer</a>\n\n` +
            `Once activated:\n` +
            `• Multi-agent market debates (Alpha/Red/CIO)\n` +
            `• Real-time trading signals with voice notes\n` +
            `• On-chain verified via x402 protocol\n\n` +
            `<i>Powered by OKX X Layer · x402 Payment Protocol</i>`
          );
        }

        if (newStatus === 'left' || newStatus === 'kicked') {
          // Bot was removed from group
          if (supabase) {
            await supabase.from('telegram_groups')
              .update({ bot_status: 'removed' })
              .eq('telegram_group_id', chat.id);
          }
        }
      }
    }

    // Handle: Regular messages in groups (only respond if group is active)
    if (update.message && (update.message.chat.type === 'group' || update.message.chat.type === 'supergroup')) {
      const groupId = update.message.chat.id;
      const text = update.message.text || '';

      // P1 FIX: Check active SUBSCRIPTION, not just bot_status
      if (supabase) {
        const { data: activeSub } = await supabase
          .from('telegram_subscriptions')
          .select('status, expires_at')
          .eq('telegram_group_id', groupId)
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString())
          .maybeSingle();

        if (!activeSub) {
          // Group not activated — only respond to /start or /activate
          if (text.startsWith('/start') || text.startsWith('/activate')) {
            await sendTelegramMessage(groupId,
              `⏳ Bobby is not yet activated in this group.\n\n` +
              `The admin needs to complete the x402 payment to activate.\n` +
              `👉 ${BASE_URL}/agentic-world/bobby/telegram?activate=${groupId}`
            );
          }
          return res.status(200).json({ ok: true });
        }
      }

      // Group is active — handle commands
      if (text.startsWith('/analyze') || text.startsWith('/bobby')) {
        const query = text.replace(/^\/(analyze|bobby)\s*/i, '').trim() || 'BTC';

        // Send "analyzing" message
        await sendTelegramMessage(groupId,
          `🎯 <b>Bobby Agent Trader</b>\n\n` +
          `Analyzing: <b>${query.toUpperCase()}</b>\n\n` +
          `🟢 Alpha Hunter scanning...\n` +
          `🔴 Red Team evaluating risks...\n` +
          `🟡 CIO preparing verdict...`
        );

        // Generate quick analysis with gpt-4o-mini
        try {
          const OPENAI_KEY = process.env.OPENAI_API_KEY;
          if (OPENAI_KEY) {
            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: 500,
                messages: [
                  { role: 'system', content: `You are Bobby CIO, a trading intelligence agent. Give a brief 3-sentence market analysis of ${query}. Be concise, data-driven. Mention a direction (bullish/bearish/neutral) and a conviction level (1-10). End with one actionable insight.` },
                  { role: 'user', content: `Quick analysis of ${query} right now.` },
                ],
              }),
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json() as any;
              const analysis = aiData.choices?.[0]?.message?.content || '';

              if (analysis) {
                // Send text analysis
                await sendTelegramMessage(groupId,
                  `🟡 <b>Bobby CIO — ${query.toUpperCase()} Analysis</b>\n\n` +
                  `${analysis}\n\n` +
                  `👉 <a href="${BASE_URL}/agentic-world/forum">Full debate in Forum</a>\n` +
                  `<i>Powered by Bobby Agent Trader · OKX X Layer</i>`
                );

                // Send voice note with the analysis
                await sendVoiceNote(groupId, analysis,
                  `🎙 Bobby CIO voice analysis — ${query.toUpperCase()}`
                );
              }
            }
          }
        } catch (err) {
          console.error('[telegram-webhook] Analysis generation failed:', err);
        }
      }

      if (text.startsWith('/status')) {
        await sendTelegramMessage(groupId,
          `🎯 <b>Bobby Agent Trader — Status</b>\n\n` +
          `✅ Bot: ACTIVE\n` +
          `🔗 Network: X Layer (196)\n` +
          `💳 Payment: x402 Protocol\n` +
          `🤖 Agents: Alpha Hunter · Red Team · CIO\n\n` +
          `Commands:\n` +
          `<code>/analyze BTC</code> — Market analysis\n` +
          `<code>/status</code> — Bot status\n` +
          `<code>/help</code> — All commands`
        );
      }
    }

    // Handle: DM messages
    if (update.message && update.message.chat.type === 'private') {
      const chatId = update.message.chat.id;
      const userId = update.message.from?.id;
      const username = update.message.from?.username || '';
      const text = update.message.text || '';

      // B2C Connect Flow: /start connect_TOKEN
      if (text.startsWith('/start connect_') && supabase) {
        const token = text.replace('/start connect_', '').trim();
        if (token) {
          // Validate token and create connection
          const { data: pending } = await supabase
            .from('telegram_connections')
            .select('*')
            .eq('connect_token', token)
            .eq('status', 'pending')
            .single();

          if (pending) {
            await supabase.from('telegram_connections').update({
              telegram_user_id: userId,
              telegram_chat_id: chatId,
              telegram_username: username,
              status: 'active',
              connected_at: new Date().toISOString(),
            }).eq('id', pending.id);

            // Get agent name
            let agentName = 'YOUR AGENT';
            if (pending.agent_profile_id) {
              const { data: profile } = await supabase.from('agent_profiles').select('agent_name').eq('id', pending.agent_profile_id).single();
              if (profile) agentName = profile.agent_name;
            }

            await sendTelegramMessage(chatId,
              `🟢 <b>CONNECTED</b>\n\n` +
              `I'm now routing all <b>${agentName}</b> intelligence reports to this chat.\n\n` +
              `Expect your first briefing within the next cycle.\n\n` +
              `📊 First 100 reports are <b>free</b>\n` +
              `💬 Type <code>/pause</code> to mute\n` +
              `💬 Type <code>/status</code> to check your connection`
            );
            return res.status(200).json({ ok: true });
          } else {
            await sendTelegramMessage(chatId,
              `⚠️ Invalid or expired connection token.\n\n` +
              `Please generate a new one from the terminal:\n` +
              `👉 <a href="${BASE_URL}/agentic-world/bobby">Open Terminal</a>`
            );
            return res.status(200).json({ ok: true });
          }
        }
      }

      // Handle /pause and /mute for B2C
      if ((text === '/pause' || text === '/mute') && supabase) {
        await supabase.from('telegram_connections')
          .update({ status: 'disconnected' })
          .eq('telegram_chat_id', chatId)
          .eq('status', 'active');
        await sendTelegramMessage(chatId, '⏸ Notifications paused. Type /resume to reactivate.');
        return res.status(200).json({ ok: true });
      }

      if ((text === '/resume' || text === '/unmute') && supabase) {
        await supabase.from('telegram_connections')
          .update({ status: 'active' })
          .eq('telegram_chat_id', chatId)
          .eq('status', 'disconnected');
        await sendTelegramMessage(chatId, '▶️ Notifications resumed. Your agent will send reports again.');
        return res.status(200).json({ ok: true });
      }

      if (text.startsWith('/start')) {
        await sendTelegramMessage(chatId,
          `🎯 <b>Bobby Agent Trader</b>\n\n` +
          `I'm an autonomous AI trading intelligence powered by 3 agents:\n\n` +
          `🟢 <b>Alpha Hunter</b> — finds opportunities\n` +
          `🔴 <b>Red Team</b> — challenges every thesis\n` +
          `🟡 <b>CIO</b> — makes the final decision\n\n` +
          `<b>For individuals:</b> Create your agent at the terminal and connect me for DM reports.\n` +
          `<b>For groups:</b> Add me to your Telegram group for multi-agent market analysis.\n\n` +
          `👉 <a href="${BASE_URL}/agentic-world/bobby/telegram">Learn more</a>\n\n` +
          `<i>Built on OKX X Layer · x402 Payment Protocol</i>`
        );
      }
    }
  } catch (err) {
    console.error('[telegram-webhook] Error:', err);
  }

  return res.status(200).json({ ok: true });
}
