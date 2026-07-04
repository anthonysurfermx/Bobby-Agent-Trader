// ============================================================
// POST /api/telegram-webhook — Telegram Bot Webhook
// Handles: bot added to group, messages, commands
// When bot is added to a group:
//   1. Creates telegram_groups record
//   2. Sends DM to admin with activation link
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { tgSendMessage, tgSendVoiceAnalysis, tgSendPhoto } from './_lib/telegram.js';
import { runDmAnalysis } from './_lib/dm-analysis.js';
import { resolveBot } from './_lib/telegram-bots.js';
import { getChartImage } from './_lib/chart.js';
import { okxButtonText } from './_lib/okx-link.js';

// Higher budget: DM voice analysis (OKX fetch + LLM + TTS) runs in waitUntil
// after we ack Telegram, so the function must stay warm long enough.
export const config = { maxDuration: 30 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = 'https://bobbyprotocol.xyz';

// Voice delivery is handled by the unified TTS layer (api/_lib/tts.ts +
// telegram.ts): free in-process Edge TTS by default, OpenAI opus optional.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Multi-bot: ?bot=<key> selects which bot (token + secret + language).
  const bot = resolveBot(req.query.bot);
  if (!bot) {
    console.error('[telegram-webhook] No token configured for bot', req.query.bot || 'default');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  const BOT_TOKEN = bot.token;

  // Validate webhook comes from Telegram for THIS bot (fail closed).
  if (!bot.webhookSecret) {
    console.error('[telegram-webhook] webhook secret not set for bot', bot.key, '— rejecting');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== bot.webhookSecret) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  // Bot-scoped message sender (uses this bot's token).
  const sendTelegramMessage = (chatId: number, text: string, parseMode = 'HTML') =>
    tgSendMessage(BOT_TOKEN, chatId, text, { parseMode });

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

        // Generate quick analysis with Gemini
        try {
          const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
          if (GEMINI_KEY) {
            const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const aiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
              {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: `You are Bobby CIO, a trading intelligence agent. Give a brief 3-sentence market analysis of ${query}. Be concise, data-driven. Mention a direction (bullish/bearish/neutral) and a conviction level (1-10). End with one actionable insight.` }] },
                contents: [{ role: 'user', parts: [{ text: `Quick analysis of ${query} right now.` }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
              }),
            },
            );

            if (aiRes.ok) {
              const aiData = await aiRes.json() as any;
              const analysis = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

              if (analysis) {
                // Send text analysis
                await sendTelegramMessage(groupId,
                  `🟡 <b>Bobby CIO — ${query.toUpperCase()} Analysis</b>\n\n` +
                  `${analysis}\n\n` +
                  `👉 <a href="${BASE_URL}/agentic-world/forum">Full debate in Forum</a>\n` +
                  `<i>Powered by Bobby Agent Trader · OKX X Layer</i>`
                );

                // Send voice note with the analysis (unified TTS layer)
                await tgSendVoiceAnalysis(BOT_TOKEN, groupId, analysis,
                  `🎙 Bobby CIO — ${query.toUpperCase()}`, 'en'
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

      const isEs = bot.lang === 'es';

      if (text.startsWith('/start') && !text.startsWith('/start connect_')) {
        await sendTelegramMessage(chatId, isEs
          ? `🎯 <b>${bot.label}</b>\n\n` +
            `Soy una inteligencia de trading autónoma con 3 agentes:\n\n` +
            `🟢 <b>Alpha Hunter</b> — caza oportunidades\n` +
            `🔴 <b>Red Team</b> — destroza cada tesis\n` +
            `🟡 <b>CIO</b> — toma la decisión final\n\n` +
            `🎙 <b>Mándame una moneda</b> (ej. <code>BTC</code>, <code>ETH</code>, <code>SOL</code>) ` +
            `y te devuelvo todo el análisis de la terminal en un <b>mensaje de voz</b>.\n\n` +
            `<i>Datos en vivo de OKX · X Layer</i>`
          : `🎯 <b>${bot.label}</b>\n\n` +
            `I'm an autonomous trading intelligence powered by 3 agents:\n\n` +
            `🟢 <b>Alpha Hunter</b> — hunts opportunities\n` +
            `🔴 <b>Red Team</b> — destroys every thesis\n` +
            `🟡 <b>CIO</b> — makes the final call\n\n` +
            `🎙 <b>Send me a coin</b> (e.g. <code>BTC</code>, <code>ETH</code>, <code>SOL</code>) ` +
            `and I'll send the full terminal analysis back as a <b>voice message</b>.\n\n` +
            `<i>Live OKX data · X Layer</i>`
        );
        return res.status(200).json({ ok: true });
      }

      // ── Free-form DM or /analyze /bobby → full terminal analysis as voice ──
      const isAnalysisCmd = text.startsWith('/analyze') || text.startsWith('/bobby');
      const isFreeForm = text.length > 0 && !text.startsWith('/');
      if (isAnalysisCmd || isFreeForm) {
        const query = text.replace(/^\/(analyze|bobby)\s*/i, '').trim() || 'BTC';

        // Ack immediately so Telegram doesn't retry; heavy work runs in waitUntil.
        await sendTelegramMessage(chatId, isEs
          ? `🎙 <b>Bobby</b> está leyendo la terminal…\n` +
            `<i>🟢 Alpha · 🔴 Red Team · 🟡 CIO</i>`
          : `🎙 <b>Bobby</b> is reading the terminal…\n` +
            `<i>🟢 Alpha · 🔴 Red Team · 🟡 CIO</i>`
        );

        waitUntil((async () => {
          try {
            const result = await runDmAnalysis(query, bot.lang === 'es' ? 'es' : 'en');
            if (!result.ok || !result.verdict || !result.symbol) {
              await sendTelegramMessage(chatId, `⚠️ ${result.error || (isEs ? 'No pude generar el análisis.' : 'Could not generate the analysis.')}`);
              return;
            }
            // One-tap "Trade on OKX" button (the funnel) under the verdict.
            const okxButton = result.okxUrl
              ? { inline_keyboard: [[{ text: okxButtonText(result.symbol, bot.lang), url: result.okxUrl }]] }
              : undefined;

            // TradingView chart (additive) carrying the verdict as caption;
            // fall back to a plain text verdict if no chart / send fails.
            const chart = await getChartImage(result.instId || result.symbol, result.symbol);
            let verdictDelivered = false;
            if (chart) {
              verdictDelivered = await tgSendPhoto(BOT_TOKEN, chatId, chart.image, result.verdict.captionHtml, okxButton);
            }
            if (!verdictDelivered) {
              await tgSendMessage(BOT_TOKEN, chatId, result.verdict.captionHtml, { replyMarkup: okxButton });
            }
            // Then the star: the voice message.
            const shortCaption = `🎙 Bobby CIO — ${result.symbol} · ${result.verdict.conviction}/10`;
            const voiceOk = await tgSendVoiceAnalysis(
              BOT_TOKEN, chatId, result.verdict.voiceScript, shortCaption, bot.lang,
            );
            if (!voiceOk) {
              await sendTelegramMessage(chatId, isEs
                ? `🔇 <i>(La nota de voz no salió esta vez — arriba tienes el análisis completo en texto.)</i>`
                : `🔇 <i>(The voice note didn't go through this time — the full analysis is in text above.)</i>`,
              );
            }
          } catch (err) {
            console.error('[telegram-webhook] DM analysis job failed:', err);
            await sendTelegramMessage(chatId, isEs
              ? `⚠️ Algo falló generando tu análisis. Intenta de nuevo en un momento.`
              : `⚠️ Something failed generating your analysis. Try again in a moment.`,
            );
          }
        })());

        return res.status(200).json({ ok: true });
      }
    }
  } catch (err) {
    console.error('[telegram-webhook] Error:', err);
  }

  return res.status(200).json({ ok: true });
}
