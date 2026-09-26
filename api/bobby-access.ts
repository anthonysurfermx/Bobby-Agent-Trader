// ============================================================
// /api/bobby-access — the reader's access to the desk, and Bobby Pro.
//   GET                                   → { access, signedIn, subscription, payments }
//   POST { action: 'checkout' }           → { url }  Stripe Checkout, $5/month (web)
//   POST { action: 'portal' }             → { url }  Stripe billing portal (manage / cancel)
//   POST { action: 'apple', signedTransaction } → { ok, access, subscription }
//        a StoreKit 2 transaction (JWS) verified against Apple Root CA G3, then stored.
// Headers: x-bobby-device, x-bobby-platform, and the account credential (see user-identity.ts).
// Stripe runs only when STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set; otherwise 503, never a fake success.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { X509Certificate, createHash, verify as verifySignature } from 'node:crypto';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { requireIdentity, resolveIdentity } from './_lib/user-identity.js';
import { getSubscription, publicSubscription, readAccess, upsertSubscription } from './_lib/access.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 20 };

const APPLE_BUNDLE_ID = 'xyz.bobbyprotocol.bobby';
const APPLE_PRODUCT_IDS = new Set(['xyz.bobbyprotocol.bobby.pro.monthly']);
/** SHA-256 of Apple Root CA - G3 (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer). */
const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

const stripeReady = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);

function siteOrigin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
  if (/^(www\.)?bobbyprotocol\.xyz$/.test(host) || /\.vercel\.app$/.test(host)) return `https://${host}`;
  if (/^localhost:\d+$/.test(host)) return `http://${host}`;
  return 'https://bobbyprotocol.xyz';
}

async function stripe(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`stripe ${path} ${r.status} ${JSON.stringify((body as { error?: { message?: string } }).error?.message ?? '')}`);
  return body;
}

// ---- Apple: StoreKit 2 signed transactions ----
function b64urlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Verify a StoreKit 2 JWS: the x5c chain must end in Apple Root CA G3 and sign the payload (ES256). */
export function verifyAppleJws(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('malformed JWS');
  const header = b64urlJson(parts[0]) as { alg?: string; x5c?: string[] };
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 3) throw new Error('unexpected JWS header');
  const [leaf, intermediate, root] = header.x5c.slice(0, 3).map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  if (createHash('sha256').update(root.raw).digest('hex') !== APPLE_ROOT_G3_SHA256) throw new Error('not signed by Apple');
  if (!intermediate.verify(root.publicKey) || !leaf.verify(intermediate.publicKey)) throw new Error('broken certificate chain');
  const now = Date.now();
  for (const cert of [leaf, intermediate]) {
    if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) throw new Error('certificate outside its validity');
  }
  const ok = verifySignature('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  return b64urlJson(parts[1]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!await enforcePublicRateLimit(req, res, 'bobby-access', 60, 60)) return;

  if (req.method === 'GET') {
    let identity = null;
    try { identity = await resolveIdentity(req); } catch { identity = null; }
    let subscription = null;
    try { subscription = identity ? await getSubscription(identity.id) : null; } catch { subscription = null; }
    return res.status(200).json({
      access: await readAccess(req, identity),
      signedIn: Boolean(identity),
      subscription: publicSubscription(subscription),
      payments: { stripe: stripeReady(), apple: true },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, signedTransaction } = (req.body ?? {}) as { action?: string; signedTransaction?: string };
  const identity = await requireIdentity(req, res);
  if (!identity) return;

  try {
    if (action === 'checkout') {
      if (!stripeReady()) return res.status(503).json({ error: 'Card payments are not switched on yet.' });
      const existing = await getSubscription(identity.id).catch(() => null);
      const origin = siteOrigin(req);
      const form: Record<string, string> = {
        mode: 'subscription',
        'line_items[0][price]': String(process.env.STRIPE_PRICE_ID),
        'line_items[0][quantity]': '1',
        success_url: `${origin}/desk?pro=welcome`,
        cancel_url: `${origin}/desk?pro=cancelled`,
        client_reference_id: identity.id,
        'metadata[identity_id]': identity.id,
        'subscription_data[metadata][identity_id]': identity.id,
        allow_promotion_codes: 'true',
      };
      if (existing?.stripe_customer_id) form.customer = existing.stripe_customer_id;
      const session = await stripe('checkout/sessions', form);
      return res.status(200).json({ url: session.url });
    }

    if (action === 'portal') {
      if (!stripeReady()) return res.status(503).json({ error: 'Card payments are not switched on yet.' });
      const existing = await getSubscription(identity.id);
      if (!existing?.stripe_customer_id) return res.status(404).json({ error: 'No card subscription on this account.' });
      const portal = await stripe('billing_portal/sessions', { customer: existing.stripe_customer_id, return_url: `${siteOrigin(req)}/desk` });
      return res.status(200).json({ url: portal.url });
    }

    if (action === 'apple') {
      if (typeof signedTransaction !== 'string' || signedTransaction.length > 20000) return res.status(400).json({ error: 'signedTransaction required' });
      let tx: Record<string, unknown>;
      try { tx = verifyAppleJws(signedTransaction); }
      catch (e) { console.error('[bobby-access] apple verify', e instanceof Error ? e.message : e); return res.status(400).json({ error: 'That purchase could not be verified.' }); }
      if (tx.bundleId !== APPLE_BUNDLE_ID || !APPLE_PRODUCT_IDS.has(String(tx.productId))) return res.status(400).json({ error: 'Unknown product.' });
      const original = String(tx.originalTransactionId ?? '');
      if (!/^\d{1,32}$/.test(original)) return res.status(400).json({ error: 'Missing transaction id.' });
      const expires = typeof tx.expiresDate === 'number' ? tx.expiresDate : null;
      const revoked = tx.revocationDate != null;
      const active = !revoked && expires !== null && expires > Date.now();
      // The same Apple subscription restored on another account moves with the purchase (one owner at a time).
      await fetch(bobbyRest(`bobby_subscriptions?apple_original_transaction_id=eq.${original}&identity_id=neq.${identity.id}`), { method: 'DELETE', headers: bobbyServiceHeaders() });
      const current = await getSubscription(identity.id).catch(() => null);
      // Never let an Apple sync overwrite a live card subscription.
      if (!(current?.provider === 'stripe' && ['active', 'trialing'].includes(current.status) && !active)) {
        await upsertSubscription({
          identity_id: identity.id, provider: 'apple', status: revoked ? 'revoked' : active ? 'active' : 'expired',
          product_id: String(tx.productId), current_period_end: expires !== null ? new Date(expires).toISOString() : null,
          apple_original_transaction_id: original, stripe_customer_id: current?.stripe_customer_id ?? null, stripe_subscription_id: current?.provider === 'apple' ? null : current?.stripe_subscription_id ?? null,
        });
      }
      const subscription = await getSubscription(identity.id);
      return res.status(200).json({ ok: true, access: await readAccess(req, identity), subscription: publicSubscription(subscription) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[bobby-access]', action, e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Payments are temporarily unavailable. Try again.' });
  }
}
