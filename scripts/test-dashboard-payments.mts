// Offline HTTP regressions for the dashboard package's integration with production payments.
import assert from 'node:assert/strict';
process.env.BOBBY_SUPABASE_URL = 'https://dashboard-payments.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
process.env.REVENUECAT_SECRET_KEY = 'offline-revenuecat';
const { upsertSubscription } = await import('../api/_lib/access.ts');
const { liveSubscription, syncRevenueCat, RevenueCatError } = await import('../api/_lib/revenuecat.ts');
const OWNER = '00000000-0000-4000-8000-000000000001';
const AUTH = '00000000-0000-4000-8000-000000000002';
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
let checks = 0;
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const originalFetch = globalThis.fetch;
const base = { identity_id: OWNER, provider: 'apple' as const, status: 'active', current_period_end: future,
  environment: 'unknown' as const, period_type: 'unknown', store_checked_at: new Date().toISOString() };
try {
  for (const [code, message] of [
    ['PGRST204', "Could not find the 'store_checked_at' column of 'bobby_subscriptions'"],
    ['23514', 'new row violates check constraint bobby_subscriptions_environment_check'],
    ['23514', 'new row violates check constraint bobby_subscriptions_period_type_check'],
  ]) {
    const writes: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1 ? Response.json({ code, message }, { status: 400 }) : new Response(null, { status: 204 });
    }) as typeof fetch;
    await upsertSubscription(base);
    eq(writes.length, 2, `${code} evidence mismatch retries once`);
    eq([writes[1].environment, writes[1].period_type, writes[1].store_checked_at], [undefined, undefined, undefined], 'old schema gets no unsupported evidence');
    eq([writes[1].identity_id, writes[1].provider, writes[1].status], [OWNER, 'apple', 'active'], 'compatibility retry preserves access and ownership');
  }
  let writes: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => { writes.push(JSON.parse(String(init.body))); return new Response(null, { status: 204 }); }) as typeof fetch;
  await upsertSubscription({ ...base, environment: null, period_type: null });
  eq([writes[0].environment, writes[0].period_type], ['unknown', 'unknown'], 'new schema never receives explicit null primary evidence');
  writes = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => { writes.push(JSON.parse(String(init.body))); return Response.json({ code: '23503', message: 'account deleted' }, { status: 409 }); }) as typeof fetch;
  await assert.rejects(upsertSubscription(base), /23503/); checks++;
  eq(writes.length, 1, 'foreign-key errors are never treated as old evidence schema');
  const card = { ...base, provider: 'stripe', status: 'canceled', current_period_end: past,
    stripe_subscription_id: 'sub_card', apple_status: 'active', apple_current_period_end: future };
  eq(liveSubscription(card as never), true, 'live Apple mirror grants membership despite canceled card');
  eq(liveSubscription({ ...card, apple_current_period_end: past } as never), false, 'expired Apple mirror cannot create live membership');
  eq(liveSubscription({ ...card, apple_status: 'refunded' } as never), false, 'refunded Apple mirror cannot create live membership');
  let subscriber: Record<string, unknown> = {}, current: Record<string, unknown> = { ...base }, providerStatus = 200;
  const patches: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url: unknown, init: RequestInit = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.startsWith('/v1/subscribers/')) return Response.json({ subscriber }, { status: providerStatus });
    if (path.endsWith('/bobby_subscriptions')) {
      if (init.method === 'POST') { current = { ...current, ...JSON.parse(String(init.body)) }; writes.push(current); return new Response(null, { status: 204 }); }
      if (init.method === 'PATCH') { const patch = JSON.parse(String(init.body)); patches.push(patch); current = { ...current, ...patch }; return Response.json([{ identity_id: OWNER }]); }
      return Response.json([current]);
    }
    if (path.endsWith('/bobby_brief_paid_periods')) return Response.json([]);
    throw new Error(`Unexpected offline payment request ${path}`);
  }) as typeof fetch;
  for (const store of ['test_store', 'promotional', 'unknown']) {
    current = { ...base }; writes = [];
    subscriber = { entitlements: { pro: { product_identifier: 'product', expires_date: future } },
      subscriptions: { product: { store, expires_date: future, is_sandbox: false } } };
    eq(await syncRevenueCat(AUTH, OWNER, { keepAccess: true }), false, `${store} cannot keep old Pro alive`);
    eq(current.status, 'expired', `${store} prior grant is revoked`);
  }
  current = { ...base }; writes = [];
  providerStatus = 503;
  await assert.rejects(syncRevenueCat(AUTH, OWNER, { keepAccess: true }), (error: unknown) => error instanceof RevenueCatError && error.kind === 'unavailable'); checks++;
  eq([writes.length, current.status], [0, 'active'], 'provider outage leaves membership untouched');
  providerStatus = 200;
  current = { ...card }; writes = [];
  subscriber = { entitlements: { pro: { product_identifier: 'product', expires_date: future } },
    subscriptions: { product: { store: 'app_store', expires_date: future } } };
  eq(await syncRevenueCat(AUTH, OWNER), true, 'recognized App Store subscription refreshes independent mirror');
  eq([current.status, current.stripe_subscription_id, current.apple_environment, current.apple_period_type], ['canceled', 'sub_card', null, null], 'unknown store evidence fits nullable mirror checks without changing card');
  eq(writes.length, 0, 'mirror update never replays card status');
} finally { globalThis.fetch = originalFetch; }
console.log(`dashboard-payments: ${checks} checks passed (offline HTTP; no transactions)`);
