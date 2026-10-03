// Real PostgreSQL proof for the checkout lock and independent Apple access.
// Runs after test:levels-referrals-pg has installed the access/grant schema.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('payments-guards-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must be local scratch PostgreSQL');
const pool = new pg.Pool({ connectionString: url, max: 12 });
let checks = 0;
const eq = (got: unknown, want: unknown, why: string) => { assert.deepEqual(got, want, why); checks++; };
const person = async () => (await pool.query('insert into public.bobby_identities(auth_user_id) values (gen_random_uuid()) returning id')).rows[0].id as string;
const claim = async (id: string) => (await pool.query('select public.bobby_checkout_claim($1, $2, $3, $4) as r',
  [id, 'cus_test', 'price_test', 'https://bobbyprotocol.xyz'])).rows[0].r as Record<string, unknown>;
const pro = async (id: string) => (await pool.query('select public.bobby_is_pro($1) as r', [id])).rows[0].r as boolean;
const tier = async (id: string) => (await pool.query('select public.bobby_read_access($1, null, true) as r', [id])).rows[0].r.tier as string;

try {
  await pool.query(readFileSync('supabase/bobby-protocol/supabase/migrations/20261002140000_subscription_environment.sql', 'utf8'));
  await pool.query(readFileSync('supabase/bobby-protocol/supabase/migrations/20261002150000_checkout_reservation_apple_mirror.sql', 'utf8'));
  const id = await person();
  const simultaneous = await Promise.all(Array.from({ length: 12 }, () => claim(id)));
  eq(simultaneous.filter((r) => r.state === 'create').length, 1, 'exactly one concurrent Checkout creator');
  eq(simultaneous.filter((r) => r.state === 'pending').length, 11, 'all other requests wait');
  const first = simultaneous.find((r) => r.state === 'create')!;
  const row = (await pool.query('select * from public.bobby_checkout_attempts where identity_id = $1', [id])).rows[0];
  eq(row.attempt_id, first.attemptId, 'claim id was durably persisted');
  eq(Math.round((row.expires_at.getTime() - Date.now()) / 60_000), 35, 'saved expiry leaves a five-minute idempotent retry window');
  await pool.query('update public.bobby_checkout_attempts set retry_after = now() - interval \'1 second\' where identity_id = $1', [id]);
  const retry = await claim(id);
  eq([retry.state, retry.attemptId, retry.customer, retry.price, retry.origin, retry.expiresAt],
    [first.state, first.attemptId, first.customer, first.price, first.origin, first.expiresAt], 'retry retains exact Stripe attempt parameters');
  eq((await pool.query('select public.bobby_checkout_complete($1, $2, $3, $4) as r', [id, first.attemptId, 'https://checkout.stripe.com/test', 'cs_test_one'])).rows[0].r,
    true, 'completion stored');
  eq([(await claim(id)).url, (await claim(id)).sessionId], ['https://checkout.stripe.com/test', 'cs_test_one'],
    'the stored URL and session id are reused for a live-state check');
  eq((await pool.query('select public.bobby_checkout_complete($1, $2, $3, $4) as r', [id, first.attemptId, 'https://checkout.stripe.com/other', 'cs_test_two'])).rows[0].r,
    false, 'a different URL cannot replace the first');
  await pool.query('update public.bobby_checkout_attempts set expires_at = now() - interval \'2 minutes\' where identity_id = $1', [id]);
  const next = await claim(id);
  eq([next.state, next.attemptId === first.attemptId], ['create', false], 'expired attempt rotates to a new idempotency key');

  const both = await person();
  const bothSub = `sub_${randomUUID().replace(/-/g, '')}`;
  await pool.query(`insert into public.bobby_subscriptions(identity_id, provider, status, product_id, stripe_customer_id,
    stripe_subscription_id, apple_status, apple_current_period_end)
    values ($1, 'stripe', 'past_due', 'price_test', 'cus_both', $2, 'active', now() + interval '30 days')`, [both, bothSub]);
  eq([await pro(both), await tier(both)], [true, 'pro'], 'a paid Apple mirror grants persisted access beside past_due Stripe');
  eq((await claim(both)).state, 'blocked', 'paid Apple prevents a second card checkout');
  await pool.query(`update public.bobby_subscriptions set apple_status = 'refunded' where identity_id = $1`, [both]);
  eq([await pro(both), await tier(both)], [false, 'free'], 'Apple refund removes access when Stripe is past_due');

  const apple = await person();
  const appleSub = `sub_${randomUUID().replace(/-/g, '')}`;
  await pool.query(`insert into public.bobby_subscriptions(identity_id, provider, status, product_id, current_period_end)
    values ($1, 'apple', 'active', 'apple_sku', now() + interval '30 days')`, [apple]);
  await pool.query(`update public.bobby_subscriptions set provider = 'stripe', status = 'past_due', product_id = 'price_test',
    current_period_end = null, stripe_customer_id = 'cus_new', stripe_subscription_id = $2 where identity_id = $1`, [apple, appleSub]);
  let saved = (await pool.query('select * from public.bobby_subscriptions where identity_id = $1', [apple])).rows[0];
  eq([saved.provider, saved.apple_status, saved.apple_product_id, await pro(apple)], ['stripe', 'active', 'apple_sku', true],
    'Stripe takeover transfers existing Apple purchase into mirror');
  await pool.query(`update public.bobby_subscriptions set provider = 'apple', status = 'expired', current_period_end = null,
    product_id = 'apple_sku' where identity_id = $1`, [apple]);
  saved = (await pool.query('select * from public.bobby_subscriptions where identity_id = $1', [apple])).rows[0];
  eq([saved.provider, saved.status, saved.stripe_subscription_id, saved.apple_status, await pro(apple)],
    ['stripe', 'past_due', appleSub, 'expired', false], 'Apple expiry preserves card references and revokes access');
  const deleting = await person();
  const inFlight = await claim(deleting);
  const block = (await pool.query('select public.bobby_checkout_block_for_deletion($1) as r', [deleting])).rows[0].r;
  eq([block.customer, block.sessionId], ['cus_test', null], 'deletion captures a reserved customer before its session is saved');
  eq((await claim(deleting)).state, 'deleting', 'deletion marker refuses a late checkout claim');
  eq((await pool.query('select public.bobby_checkout_complete($1, $2, $3, $4) as r',
    [deleting, inFlight.attemptId, 'https://checkout.stripe.com/new', 'cs_test_late'])).rows[0].r,
    false, 'deletion marker refuses completion of an in-flight checkout');
  for (const role of ['anon', 'authenticated']) {
    eq((await pool.query('select has_table_privilege($1, $2, $3) as r', [role, 'public.bobby_checkout_attempts', 'select'])).rows[0].r,
      false, `${role} cannot read reservations`);
    eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, 'public.bobby_checkout_claim(uuid,text,text,text)', 'execute'])).rows[0].r,
      false, `${role} cannot claim`);
    eq((await pool.query('select has_table_privilege($1, $2, $3) as r', [role, 'public.bobby_checkout_deletion_blocks', 'select'])).rows[0].r,
      false, `${role} cannot inspect deletion markers`);
  }
  console.log(`payments-guards-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
