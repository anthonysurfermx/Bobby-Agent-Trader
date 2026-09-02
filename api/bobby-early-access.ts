// POST /api/bobby-early-access — join the iPhone early-access list.
//
// Phase 0: Bobby keeps its own record (bobby_early_access) with the exact
// consent wording, the page, the language and a hashed IP. While the
// product decision on the shared newsletter is open, the legacy mirror into
// newsletter_subscribers stays on and can be switched off with
// BOBBY_EARLY_ACCESS_MIRROR_NEWSLETTER=false — no redeploy of the landing.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { bobbyDbUrl, bobbyServiceKey } from './_lib/bobby-db.js';
import { guardWrite } from './_lib/write-guard.js';
import { getClientIp } from './_lib/rate-limit.js';

export const config = { maxDuration: 15 };

const EARLY_ACCESS_INTEREST = 'bobby-ios-early-access';
const CONSENT_TEXT: Record<'en' | 'es', string> = {
  en: 'Early-access updates only · Unsubscribe anytime · No spam',
  es: 'Solo avisos de acceso anticipado · Cancela cuando quieras · Sin spam',
};

const Body = z.object({
  email: z.string().trim().toLowerCase().min(5).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  website: z.string().max(200).optional(),          // honeypot
  language: z.enum(['en', 'es']).default('en'),
  page: z.string().max(80).default('/app'),
  referrer: z.string().max(300).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'bobby-early-access',
    schema: Body,
    perIp: { limit: 8, windowSec: 3600 },
    perSubject: { key: (b) => b.email, limit: 3, windowSec: 86400 },
  });
  if (!guarded) return;
  const b = guarded.body;

  // Honeypot submissions get a generic success so bots receive no useful signal.
  if (typeof b.website === 'string' && b.website.trim()) return res.status(200).json({ ok: true });

  let SB_URL: string;
  let SB_SERVICE_KEY: string;
  try { SB_URL = bobbyDbUrl(); SB_SERVICE_KEY = bobbyServiceKey(); } catch {
    return res.status(503).json({ error: 'Early access is temporarily unavailable' });
  }
  const supabase = createClient(SB_URL, SB_SERVICE_KEY);
  const now = new Date().toISOString();
  const salt = process.env.RATE_LIMIT_SALT || 'bobby-rl-v1';
  const ipHash = createHash('sha256').update(`${salt}:${getClientIp(req)}`).digest('hex').slice(0, 32);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 200) || null;

  // 1) Bobby's own record (upsert on the normalized email).
  const { error: ownError } = await supabase.from('bobby_early_access').upsert({
    email: b.email,
    consent: true,
    consent_text: CONSENT_TEXT[b.language],
    consent_at: now,
    source_page: b.page,
    language: b.language,
    campaign: EARLY_ACCESS_INTEREST,
    referrer: b.referrer ?? null,
    user_agent: userAgent,
    ip_hash: ipHash,
    unsubscribed_at: null,
    updated_at: now,
  }, { onConflict: 'email_normalized', ignoreDuplicates: false });
  if (ownError) {
    console.error('[EarlyAccess] bobby_early_access write failed:', ownError.code, ownError.message);
    // Table missing until the migration is applied: fall through to the mirror so no signup is lost.
    if (process.env.BOBBY_EARLY_ACCESS_MIRROR_NEWSLETTER === 'false') {
      return res.status(503).json({ error: 'Early access is temporarily unavailable' });
    }
  }

  // 2) Legacy mirror (DeFi México newsletter) while the product decision is open.
  if (process.env.BOBBY_EARLY_ACCESS_MIRROR_NEWSLETTER !== 'false') {
    const { data: existing, error: readError } = await supabase
      .from('newsletter_subscribers')
      .select('id, interests, metadata')
      .eq('email', b.email)
      .maybeSingle();
    if (readError) {
      console.error('[EarlyAccess] newsletter lookup failed:', readError.code);
      if (ownError) return res.status(503).json({ error: 'Early access is temporarily unavailable' });
    } else if (existing) {
      const interests = Array.isArray(existing.interests) ? existing.interests.filter((item): item is string => typeof item === 'string') : [];
      const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? (existing.metadata as Record<string, unknown>) : {};
      const { error } = await supabase.from('newsletter_subscribers').update({
        interests: Array.from(new Set([...interests, EARLY_ACCESS_INTEREST])),
        metadata: { ...metadata, campaign: EARLY_ACCESS_INTEREST, early_access_joined_at: now, consent_text: CONSENT_TEXT[b.language] },
        status: 'active',
      }).eq('id', existing.id);
      if (error && ownError) return res.status(503).json({ error: 'Early access is temporarily unavailable' });
    } else {
      const { error } = await supabase.from('newsletter_subscribers').insert({
        email: b.email,
        source: 'website',
        status: 'active',
        interests: [EARLY_ACCESS_INTEREST],
        metadata: { campaign: EARLY_ACCESS_INTEREST, page: b.page, early_access_joined_at: now, consent_text: CONSENT_TEXT[b.language] },
      });
      if (error && ownError) return res.status(503).json({ error: 'Early access is temporarily unavailable' });
    }
  }

  return res.status(200).json({ ok: true });
}
