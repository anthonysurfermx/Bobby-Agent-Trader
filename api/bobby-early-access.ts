import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { bobbyDbUrl, bobbyServiceKey } from './_lib/bobby-db.js';

export const config = { maxDuration: 15 };

const SB_URL = bobbyDbUrl();
const SB_SERVICE_KEY = bobbyServiceKey();
const EARLY_ACCESS_INTEREST = 'bobby-ios-early-access';

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!await enforcePublicRateLimit(req, res, 'bobby-early-access', 8, 3600)) return;

  // Honeypot submissions get a generic success so bots receive no useful signal.
  if (typeof req.body?.website === 'string' && req.body.website.trim()) {
    return res.status(200).json({ ok: true });
  }

  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!SB_SERVICE_KEY) return res.status(503).json({ error: 'Early access is temporarily unavailable' });

  const supabase = createClient(SB_URL, SB_SERVICE_KEY);
  const { data: existing, error: readError } = await supabase
    .from('newsletter_subscribers')
    .select('id, interests, metadata')
    .eq('email', email)
    .maybeSingle();

  if (readError) {
    console.error('[EarlyAccess] subscriber lookup failed:', readError.code);
    return res.status(503).json({ error: 'Early access is temporarily unavailable' });
  }

  if (existing) {
    const interests = Array.isArray(existing.interests) ? existing.interests.filter((item): item is string => typeof item === 'string') : [];
    const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({
        interests: Array.from(new Set([...interests, EARLY_ACCESS_INTEREST])),
        metadata: { ...metadata, campaign: EARLY_ACCESS_INTEREST, early_access_joined_at: new Date().toISOString() },
        status: 'active',
      })
      .eq('id', existing.id);

    if (error) {
      console.error('[EarlyAccess] subscriber update failed:', error.code);
      return res.status(503).json({ error: 'Early access is temporarily unavailable' });
    }
  } else {
    const { error } = await supabase.from('newsletter_subscribers').insert({
      email,
      source: 'website',
      status: 'active',
      interests: [EARLY_ACCESS_INTEREST],
      metadata: { campaign: EARLY_ACCESS_INTEREST, page: '/app', early_access_joined_at: new Date().toISOString() },
    });

    if (error) {
      console.error('[EarlyAccess] subscriber insert failed:', error.code);
      return res.status(503).json({ error: 'Early access is temporarily unavailable' });
    }
  }

  return res.status(200).json({ ok: true });
}
