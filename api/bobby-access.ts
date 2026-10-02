// ============================================================
// /api/bobby-access — the reader's access to the desk, and Bobby Pro.
//   GET                                   → { access, signedIn, subscription, payments, levels, referral }
//        levels: the Profundo / Máximo meters; referral: your invite link and friends (signed in only);
//        plans: the allowances per plan and the invite terms
//   POST { action: 'referral-claim', code } → { result, access, levels }  accept a friend's invitation
//   POST { action: 'redeem-coupon', code }  → { result, granted, bonus, access, levels }  redeem a coupon that
//        gifts extra reads / Profundo / Máximo (api/_lib/coupons.ts); 10 attempts per hour per account, 30 per network
//   POST { action: 'checkout' }           → { url }  Stripe Checkout, US$4.90/month (web)
//   POST { action: 'portal' }             → { url }  Stripe billing portal (manage / cancel)
//   POST { action: 'revenuecat-sync' }   → { ok, access, subscription }  re-read the `pro` entitlement
//        from RevenueCat for this account (after a purchase or restore in the app).
//   POST { action: 'apple', signedTransaction } → { ok, access, subscription }
//        a StoreKit 2 transaction (JWS) verified against Apple Root CA G3, then stored.
// Headers: x-bobby-device, x-bobby-platform, and the account credential (see user-identity.ts).
// Stripe runs only when STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set; otherwise 503, never a fake success.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { X509Certificate, createHash, verify as verifySignature } from 'node:crypto';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { requireIdentity, resolveIdentity } from './_lib/user-identity.js';
import { getSubscription, paywallOn, publicSubscription, readAccess, readLevels, touchDevice, upsertSubscription } from './_lib/access.js';
import { waitUntil } from '@vercel/functions';
import { claimReferral, isReferralCode, referralStatus } from './_lib/referrals.js';
import { isCouponCode, normalizeCoupon, redeemCoupon } from './_lib/coupons.js';
import { checkPersistentLimit } from './_lib/rate-limit-persistent.js';
import { getClientQuotaKeys, saltedKey } from './_lib/rate-limit.js';
import { LEVEL_LIMITS, REFERRAL } from './_lib/desk-levels.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { revenueCatReady, syncRevenueCat } from './_lib/revenuecat.js';
import { customerFor, expireCheckoutSession, STRIPE_TERMINAL, stripeApi } from './_lib/stripe-api.js';
import { claimCheckout, completeCheckout } from './_lib/checkout-attempt.js';

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
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization, x-bobby-device, x-bobby-platform');
  if (!await enforcePublicRateLimit(req, res, 'bobby-access', 60, 60)) return;

  if (req.method === 'GET') {
    let identity = null;
    try { identity = await resolveIdentity(req); } catch { identity = null; }
    // The app or the desk opened: count the install (and link it to the account) after answering.
    waitUntil(touchDevice(req, identity));
    let subscription = null;
    let subscriptionAvailable = true;
    try { subscription = identity ? await getSubscription(identity.id) : null; } catch { subscription = null; subscriptionAvailable = false; }
    const [access, levels, referral] = await Promise.all([
      readAccess(req, identity),
      readLevels(req, identity),
      identity ? referralStatus(identity.id, siteOrigin(req)).catch((e) => { console.error('[bobby-access] referral', e instanceof Error ? e.message : e); return null; }) : Promise.resolve(null),
    ]);
    return res.status(200).json({
      access, levels, referral,
      // The terms the app shows (single source: api/_lib/desk-levels.ts).
      // freeReadsPerWeek mirrors bobby_consume_read (20260927120000): null while the free weekly cap is off.
      plans: { limits: LEVEL_LIMITS, referral: { maxFriends: REFERRAL.maxFriends, rewardDays: REFERRAL.rewardDays }, freeReadsPerWeek: paywallOn() ? 10 : null },
      signedIn: Boolean(identity),
      subscription: publicSubscription(subscription),
      payments: { stripe: stripeReady(), apple: revenueCatReady() && Boolean(identity) && subscriptionAvailable && !(
        subscription?.stripe_subscription_id && !STRIPE_TERMINAL.has(subscription.status)
      ), revenuecat: revenueCatReady() },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, signedTransaction, code } = (req.body ?? {}) as { action?: string; signedTransaction?: string; code?: string };
  const identity = await requireIdentity(req, res);
  if (!identity) return;

  try {
    if (action === 'referral-claim') {
      const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
      if (!isReferralCode(normalized)) return res.status(400).json({ error: 'That invite link is not valid.', result: 'invalid_code' });
      const result = await claimReferral(identity.id, normalized);
      const [access, levels] = await Promise.all([readAccess(req, identity), readLevels(req, identity)]);
      return res.status(200).json({ result, access, levels });
    }

    if (action === 'redeem-coupon') {
      // Codes can be short words: bound guessing per account (fails closed) and per network (/24, /48).
      const network = (() => { try { return getClientQuotaKeys(req)?.network ?? null; } catch { return null; } })();
      const [byAccount, byNetwork] = await Promise.all([
        checkPersistentLimit('bobby-coupon-account', saltedKey(`coupon:${identity.id}`), 10, 3600, { failClosed: true }),
        network ? checkPersistentLimit('bobby-coupon-network', network, 30, 3600, { failClosed: true }) : Promise.resolve({ limited: false }),
      ]);
      if (byAccount.limited || byNetwork.limited) return res.status(429).json({ error: 'Too many attempts. Try again later.', result: 'rate_limited' });
      const normalized = normalizeCoupon(code);
      if (!isCouponCode(normalized)) return res.status(400).json({ error: 'That coupon code is not valid.', result: 'invalid_code' });
      const redemption = await redeemCoupon(identity.id, normalized);
      const [access, levels] = await Promise.all([readAccess(req, identity), readLevels(req, identity)]);
      return res.status(200).json({ ...redemption, access, levels });
    }

    if (action === 'checkout') {
      if (!stripeReady()) return res.status(503).json({ error: 'Card payments are not switched on yet.' });
      // Fail closed: without knowing the account's current plan, never open a second one.
      let existing: Awaited<ReturnType<typeof getSubscription>>;
      try { existing = await getSubscription(identity.id); } catch { return res.status(503).json({ error: 'Payments are temporarily unavailable. Try again in a moment.' }); }
      // One plan per account: never sell a second subscription to someone who already has Bobby Pro (double billing,
      // and cancelling either one would drop Pro while the other keeps charging). Audit 2026-10-02, STRIPE-04.
      const live = existing && ((existing.stripe_subscription_id && !STRIPE_TERMINAL.has(existing.status))
        || (existing.provider === 'apple' && ['active', 'trialing'].includes(existing.status)
          && (!existing.current_period_end || Date.parse(existing.current_period_end) > Date.now()))
        || (['active', 'trialing'].includes(existing.apple_status ?? '')
          && (!existing.apple_current_period_end || Date.parse(existing.apple_current_period_end) > Date.now())));
      if (live) {
        const provider = ['active', 'trialing'].includes(existing.apple_status ?? '') ? 'apple' : existing.provider;
        return res.status(409).json({ code: 'already_pro', provider,
          error: provider === 'stripe' ? 'You already have Bobby Pro. Manage it from your account.' : 'You already have Bobby Pro through the App Store.' });
      }
      // Stripe is the source of truth for "already paying": one customer per identity, refuse while any of its
      // subscriptions can still charge, and reuse a checkout that is still open instead of opening a second one
      // (two tabs or a double click would otherwise create two paid plans). Audit 2026-10-02, STRIPE-04.
      let customer: string;
      let openSession: { id?: string; url?: string } | undefined;
      try {
        customer = await customerFor(identity.id, existing?.stripe_customer_id);
        const subsAtStripe = await stripeApi<{ data?: Array<{ status: string }> }>('GET', `subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`);
        if ((subsAtStripe.data ?? []).some((s) => !STRIPE_TERMINAL.has(s.status))) {
          return res.status(409).json({ code: 'already_pro', provider: 'stripe', error: 'You already have Bobby Pro. Manage it from your account.' });
        }
        const open = await stripeApi<{ data?: Array<{ id?: string; url?: string }> }>('GET', `checkout/sessions?customer=${encodeURIComponent(customer)}&status=open&limit=1`);
        openSession = open.data?.[0];
      } catch (error) {
        console.error('[bobby-access] checkout preflight', error instanceof Error ? error.message : error);
        return res.status(503).json({ error: 'Payments are temporarily unavailable. Try again in a moment.' });
      }
      let claim: Awaited<ReturnType<typeof claimCheckout>>;
      try { claim = await claimCheckout(identity.id, customer, String(process.env.STRIPE_PRICE_ID), siteOrigin(req)); }
      catch (error) {
        console.error('[bobby-access] checkout reservation', error instanceof Error ? error.message : error);
        return res.status(503).json({ error: 'Payments are temporarily unavailable. Try again in a moment.' });
      }
      if (claim.state === 'blocked') return res.status(409).json({ code: 'already_pro', error: 'You already have Bobby Pro.' });
      if (claim.state === 'deleting') return res.status(409).json({ code: 'account_deleting', error: 'Account deletion is in progress.' });
      if (claim.state === 'pending') { res.setHeader('Retry-After', '2'); return res.status(503).json({ error: 'Checkout is being prepared. Try again in a moment.' }); }
      if (claim.state === 'ready') {
        const session = await stripeApi<{ status?: string; url?: string }>('GET', `checkout/sessions/${encodeURIComponent(claim.sessionId)}`);
        if (session.status !== 'open' || session.url !== claim.url) {
          // Stripe may cache a failed idempotent response or a session may expire
          // before our reservation. Wait for its safe rotation, never reuse a dead URL.
          res.setHeader('Retry-After', String(Math.max(2, claim.expiresAt + 60 - Math.floor(Date.now() / 1000))));
          return res.status(503).json({ error: 'Checkout is no longer available. Try again later.' });
        }
        return res.status(200).json({ url: claim.url });
      }
      if (openSession?.id && openSession.url) {
        try { await completeCheckout(identity.id, claim.attemptId, openSession.url, openSession.id); }
        catch (error) { await expireCheckoutSession(openSession.id); throw error; }
        return res.status(200).json({ url: openSession.url });
      }
      const form: Record<string, string> = {
        mode: 'subscription',
        customer: claim.customer,
        expires_at: String(claim.expiresAt),
        'line_items[0][price]': claim.price,
        'line_items[0][quantity]': '1',
        success_url: `${claim.origin}/desk?pro=welcome`,
        cancel_url: `${claim.origin}/desk?pro=cancelled`,
        client_reference_id: identity.id,
        'metadata[identity_id]': identity.id,
        'subscription_data[metadata][identity_id]': identity.id,
        allow_promotion_codes: 'true',
      };
      const session = await stripeApi<{ id?: string; url?: string }>('POST', 'checkout/sessions', form, `bobby-checkout-${claim.attemptId}`);
      if (typeof session.id !== 'string' || typeof session.url !== 'string') throw new Error('Stripe checkout has no id or URL');
      try { await completeCheckout(identity.id, claim.attemptId, session.url, session.id); }
      catch (error) {
        // Account deletion may have removed the reservation while Stripe was creating the session.
        // Do not leave a payable orphan Checkout behind.
        await expireCheckoutSession(session.id);
        throw error;
      }
      return res.status(200).json({ url: session.url });
    }

    if (action === 'portal') {
      if (!stripeReady()) return res.status(503).json({ error: 'Card payments are not switched on yet.' });
      const existing = await getSubscription(identity.id);
      if (!existing?.stripe_customer_id) return res.status(404).json({ error: 'No card subscription on this account.' });
      const portal = await stripe('billing_portal/sessions', { customer: existing.stripe_customer_id, return_url: `${siteOrigin(req)}/desk` });
      return res.status(200).json({ url: portal.url });
    }

    if (action === 'revenuecat-sync') {
      if (!revenueCatReady()) return res.status(503).json({ error: 'Subscriptions are not switched on yet.' });
      if (!identity.authUserId) return res.status(400).json({ error: 'Sign in with Apple or Google to use Bobby Pro.' });
      await syncRevenueCat(identity.authUserId, identity.id);
      const subscription = await getSubscription(identity.id);
      return res.status(200).json({ ok: true, access: await readAccess(req, identity), subscription: publicSubscription(subscription) });
    }

    if (action === 'apple') {
      // Retired: the iPhone app confirms purchases through RevenueCat (action 'revenuecat-sync'), which checks the
      // receipt with Apple server-side. This raw-JWS path lacks Apple's receipt OIDs, environment and
      // appAccountToken checks, so it stays off unless explicitly re-enabled after those checks exist.
      if (process.env.BOBBY_APPLE_JWS_SYNC !== 'on') return res.status(410).json({ error: 'Use the in-app restore.', code: 'apple_sync_retired' });
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
    const busy = action === 'referral-claim' ? 'Invitations are temporarily unavailable. Try again.'
      : action === 'redeem-coupon' ? 'Coupons are temporarily unavailable. Try again.'
      : 'Payments are temporarily unavailable. Try again.';
    return res.status(502).json({ error: busy });
  }
}
