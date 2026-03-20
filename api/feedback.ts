// ============================================================
// POST /api/feedback — User feedback & bug reports
// Saves to Supabase + sends Telegram notification
// No auth required — anyone can report
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1026323121';

async function sendTelegramNotification(feedback: Record<string, unknown>): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  const type = String(feedback.type || 'bug').toUpperCase();
  const emoji = type === 'BUG' ? '🐛' : type === 'FEATURE' ? '💡' : '💬';
  const text = `${emoji} *Bobby Feedback*\n\n*Type:* ${type}\n*From:* ${feedback.user_email || feedback.wallet_address || 'Anonymous'}\n*Page:* ${feedback.page || 'unknown'}\n\n${feedback.message}\n\n_${new Date().toLocaleString('es-MX')}_`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch { /* non-critical */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { type, message, page, context, user_email, wallet_address } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length < 3) {
    return res.status(400).json({ error: 'message is required (min 3 chars)' });
  }

  const feedback = {
    type: ['bug', 'feature', 'general'].includes(type) ? type : 'general',
    message: message.trim().slice(0, 2000),
    page: page?.slice(0, 100) || null,
    context: context ? JSON.stringify(context).slice(0, 5000) : null,
    user_email: user_email?.slice(0, 200) || null,
    wallet_address: wallet_address?.slice(0, 100) || null,
    status: 'new',
  };

  // Save to Supabase
  let saved = false;
  try {
    const sbRes = await fetch(`${SB_URL}/rest/v1/user_feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(feedback),
    });
    saved = sbRes.ok;
    if (!saved) {
      console.error('[Feedback] Supabase insert failed:', sbRes.status, await sbRes.text().catch(() => ''));
    }
  } catch (e) {
    console.error('[Feedback] Supabase error:', e);
  }

  // Send Telegram notification (fire and forget)
  sendTelegramNotification(feedback);

  return res.status(200).json({ ok: true, saved, message: 'Thanks for your feedback!' });
}
