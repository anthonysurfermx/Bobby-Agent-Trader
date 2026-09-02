// ============================================================
// POST /api/feedback — User feedback & bug reports
// Saves to Supabase + sends Telegram notification
// No auth required — anyone can report
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { bobbyDbUrl, bobbyServiceKeyOptional } from './_lib/bobby-db.js';
import { requireWritesOpen } from './_lib/control.js';

const SB_URL = bobbyDbUrl();
// Writers never fall back to the anon key (Codex review): with RLS on, an
// anon write fails silently. Missing service role → explicit 503 below.
const SB_KEY = bobbyServiceKeyOptional();
const NOTIFY_EMAIL = 'anthochavez.ra@gmail.com';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

async function sendEmailNotification(feedback: Record<string, unknown>): Promise<void> {
  const type = escapeHtml(String(feedback.type || 'bug').toUpperCase());
  const emoji = type === 'BUG' ? '🐛' : type === 'FEATURE' ? '💡' : '💬';
  const from = escapeHtml(feedback.user_email || feedback.wallet_address || 'Anonymous');
  const subject = `${emoji} Bobby Feedback: ${type} — ${from}`;
  const body = `<h2>${emoji} Bobby Feedback</h2>
<p><strong>Type:</strong> ${type}</p>
<p><strong>From:</strong> ${from}</p>
<p><strong>Page:</strong> ${escapeHtml(feedback.page || 'unknown')}</p>
<p><strong>Message:</strong></p>
<blockquote style="border-left:3px solid #10b981;padding-left:12px;color:#333">${escapeHtml(feedback.message)}</blockquote>
<p style="color:#999;font-size:12px">${new Date().toLocaleString('es-MX')}</p>`;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'Bobby Feedback', email: 'anthochavez.ra@gmail.com' },
        to: [{ email: NOTIFY_EMAIL, name: 'Anthony' }],
        subject,
        htmlContent: body,
      }),
    });
    if (!res.ok) {
      console.error('[Feedback] Brevo error:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.error('[Feedback] Email send failed:', e);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SB_KEY) return res.status(503).json({ error: 'Service-role key not configured (BOBBY_SUPABASE_SERVICE_ROLE_KEY)' });
  if (!(await requireWritesOpen(res))) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!await enforcePublicRateLimit(req, res, 'feedback', 5, 3600)) return;

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

  // Send email notification (fire and forget)
  sendEmailNotification(feedback);

  return res.status(200).json({ ok: true, saved, message: 'Thanks for your feedback!' });
}
