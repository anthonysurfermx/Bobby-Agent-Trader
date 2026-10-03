// Independent SQL regression review. Only synthetic rows in a new loopback scratch database.
// Does not invoke providers, acquire real purchases, read credentials, or edit implementation files.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { Pool, Client } = require('pg');
const root = fileURLToPath(new URL('../', import.meta.url));
const migrations = join(root, 'supabase/bobby-protocol/supabase/migrations');
const database = `bobby_purchase_review_${Date.now()}`;
const out = `/private/tmp/${database}`;
mkdirSync(out);
const fixtureUrl = new URL(process.env.BOBBY_TEST_PG_URL ?? 'postgres://mrrobot@127.0.0.1:55617/postgres');
if (!['127.0.0.1','localhost','[::1]'].includes(fixtureUrl.hostname) || !['postgres:','postgresql:'].includes(fixtureUrl.protocol)) throw new Error('Disposable loopback PostgreSQL only');
const config = { host: fixtureUrl.hostname, port: Number(fixtureUrl.port || 5432), user: decodeURIComponent(fixtureUrl.username), password: decodeURIComponent(fixtureUrl.password), ssl: false,
  application_name: 'independent_synthetic_purchase_review', options: '-c timezone=UTC' };
const admin = new Client({ ...config, database: 'postgres' });
await admin.connect();
await admin.query(`CREATE DATABASE ${database}`);
await admin.end();
const pool = new Pool({ ...config, database, max: 16 });
const results = [];
let assertions = 0;
const check = (condition, message) => { assertions++; if (!condition) throw new Error(message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const newId = () => randomUUID();
const accountHash = (auth) => createHash('sha256').update(auth).digest('base64');
const source = readFileSync(join(migrations, '20261003140000_purchase_reservations.sql'), 'utf8');
const sourceSha = digest(source);
writeFileSync(join(out, 'purchase-reservations-source.sql'), source);
const q = (sql, values = []) => pool.query(sql, values);
const rpc = async (name, args, client = pool) => {
  if (!/^bobby_purchase_[a-z_]+$/.test(name)) throw new Error('Unexpected RPC');
  const entries = Object.entries(args);
  const names = entries.map(([key], i) => {
    if (!/^p_[a-z_]+$/.test(key)) throw new Error('Unexpected argument');
    return `${key} => $${i + 1}`;
  });
  const { rows } = await client.query(`select public.${name}(${names.join(',')}) as r`, entries.map(([, value]) => value));
  return rows[0].r;
};
const identity = async (auth = newId()) => {
  const { rows } = await q('insert into bobby_identities(auth_user_id) values($1) returning id', [auth]);
  return { id: rows[0].id, auth };
};
const acquire = (owner, provider = 'google', operation = newId()) => rpc('bobby_purchase_acquire', {
  p_identity: owner.id, p_operation: operation, p_provider: provider,
  p_product: provider === 'google' ? 'qa.synthetic.pro' : 'price_synthetic',
  p_base_plan: provider === 'google' ? 'monthly' : null, p_offer: null,
  p_google_account: provider === 'google' ? accountHash(owner.auth) : null,
});
const dispatch = (owner, attempt, payload = null) => rpc('bobby_purchase_dispatch', {
  p_identity: owner.id, p_attempt: attempt.id, p_operation: newId(), p_payload: payload,
});
const observe = (attempt, state, phase, extra = {}) => rpc('bobby_purchase_observe', {
  p_identity: attempt.identity_id, p_owner_key: attempt.owner_key, p_attempt: attempt.id,
  p_revision: Number(attempt.revision), p_provider: attempt.provider,
  p_reference: null, p_token_fingerprint: null, p_token_ciphertext: null,
  p_state: state, p_phase: phase, p_evidence: digest(`synthetic:${newId()}`),
  p_resolution: null, ...extra,
});
const adopt = (owner, fingerprint, phase = 'confirmed') => rpc('bobby_purchase_adopt_google', {
  p_identity: owner.id, p_product: 'qa.synthetic.pro', p_base_plan: 'monthly', p_offer: null,
  p_google_account: accountHash(owner.auth), p_reference: `google:${fingerprint}`,
  p_fingerprint: fingerprint, p_ciphertext: 'synthetic-ciphertext-not-a-real-token',
  p_state: phase === 'confirmed' ? 'SUBSCRIPTION_STATE_ACTIVE' : 'SUBSCRIPTION_STATE_ON_HOLD',
  p_phase: phase, p_evidence: digest('synthetic-provider-proof'),
});
const scenario = async (name, work) => {
  const before = assertions;
  try { await work(); results.push({ name, status: 'PASS', assertions: assertions - before }); }
  catch (error) { results.push({ name, status: 'FAIL', assertions: assertions - before,
    error: error.message, sqlState: error.code ?? null }); }
};

try {
  await q(`create extension if not exists pgcrypto;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';
    create table public.api_cache(cache_key text primary key,payload jsonb,expires_at timestamptz,updated_at timestamptz default now());`);
  for (const file of ['20260903000005_bobby_progress.sql', '20260927120000_access_reads_subscriptions.sql',
    '20260929150000_levels_referrals_usage.sql', '20261002140000_subscription_environment.sql',
    '20261002150000_checkout_reservation_apple_mirror.sql']) {
    await q(readFileSync(join(migrations, file), 'utf8'));
  }
  await q('grant usage on schema public to service_role; grant all on all tables in schema public to service_role');
  // Exact69 owner normalizer and evidence CHECKs coexist with the Google lock trigger.
  const truth = readFileSync(join(migrations, '20261002231124_admin_truth_live_snapshot.sql'), 'utf8');
  const ownerFirst = truth.indexOf('create or replace function public.bobby_preserve_subscription_owners()');
  const ownerLast = truth.indexOf('\n-- ', truth.indexOf('alter table public.bobby_subscriptions alter column period_type set default', ownerFirst));
  check(ownerFirst >= 0 && ownerLast > ownerFirst, 'Exact69 owner/evidence source extraction anchors');
  await q('alter table public.bobby_subscriptions add column if not exists store_checked_at timestamptz');
  await q(truth.slice(ownerFirst, ownerLast));
  const ownerBefore = (await q("select pg_get_functiondef('public.bobby_preserve_subscription_owners()'::regprocedure) body")).rows[0].body;
  // Exact current subscription parent-lock trigger; wider Android migration needs unrelated feature fixtures.
  const compatibility = readFileSync(join(migrations, '20261003090000_android_google_compatibility.sql'), 'utf8');
  const first = compatibility.indexOf('create or replace function public.bobby_guard_subscription_provider()');
  const last = compatibility.indexOf('-- Positive production proof', first);
  check(first >= 0 && last > first, 'Exact compatibility parent-lock source anchors');
  await q(compatibility.slice(first, last));
  // Minimal fixture for the new paid-proof fingerprint column; this does not prove briefing entitlement rules.
  await q('create table public.bobby_brief_paid_periods(identity_id uuid, provider text)');
  await q(source);
  await q(source);
  check((await q("select pg_get_functiondef('public.bobby_preserve_subscription_owners()'::regprocedure) body")).rows[0].body === ownerBefore, 'Android and reservation migrations preserve exact69 owner function');
  check((await q("select count(*)::int n from pg_trigger where tgrelid='public.bobby_subscriptions'::regclass and not tgisinternal and tgname in ('bobby_preserve_subscription_owners','bobby_subscriptions_provider_guard')")).rows[0].n === 2, 'Canonical owner and Google guard triggers coexist');

  await scenario('Canonical Checkout keeps exact retry/key/form before sticky activation', async () => {
    const owner = await identity();
    const claim = await q('select bobby_checkout_claim($1,$2,$3,$4) r', [owner.id,'cus_Legacy','price_Legacy','https://bobbyprotocol.xyz']);
    const first = claim.rows[0].r;
    check(first.state === 'create' && first.customer === 'cus_Legacy' && first.price === 'price_Legacy', 'Unactivated canonical create preserved');
    check(first.expiresAt * 1000 > Date.now() + 34 * 60_000, 'Canonical 35 minute expiry preserved');
    check((await q('select bobby_checkout_claim($1,$2,$3,$4) r', [owner.id,'cus_Changed','price_Changed','https://bobbyprotocol.xyz'])).rows[0].r.state === 'pending', 'Canonical 12 second lease preserved');
    check((await q('select bobby_checkout_complete($1,$2,$3,$4) r', [owner.id,first.attemptId,'https://checkout.stripe.com/c/local','cs_Legacy'])).rows[0].r === true, 'Canonical completion stores exact attempt');
    const ready = (await q('select bobby_checkout_claim($1,$2,$3,$4) r', [owner.id,'cus_Changed','price_Changed','https://bobbyprotocol.xyz'])).rows[0].r;
    check(ready.state === 'ready' && ready.sessionId === 'cs_Legacy', 'Unactivated canonical ready semantics preserved');
    await q("update bobby_checkout_attempts set expires_at=now()-interval '2 minutes' where identity_id=$1", [owner.id]);
    const rotated = (await q('select bobby_checkout_claim($1,$2,$3,$4) r', [owner.id,'cus_Changed','price_Changed','https://bobbyprotocol.xyz'])).rows[0].r;
    check(rotated.state === 'create' && rotated.attemptId !== first.attemptId && rotated.customer === 'cus_Changed', 'Canonical expired rotation preserved before activation');
  });

  await scenario('Legacy claim before activation cannot race a new Google dispatch or late public URL', async () => {
    const owner=await identity();
    const claimed=(await q('select bobby_checkout_claim($1,$2,$3,$4) r',[owner.id,'cus_InFlight','price_InFlight','https://bobbyprotocol.xyz'])).rows[0].r;
    check(claimed.state==='create','Real canonical legacy create permission precedes activation');
    const reserved=await acquire(owner);
    check(reserved.code==='purchase_legacy_reconciliation_required'&&!reserved.attempt,'Legacy unresolved create excludes Google attempt under same parent lock');
    check((await rpc('bobby_purchase_capability',{})).activated===true,'Attempted participating transition installs sticky fence despite legacy pending');
    check((await q('select bobby_checkout_complete($1,$2,$3,$4) r',[owner.id,claimed.attemptId,'https://checkout.stripe.com/c/late','cs_Late'])).rows[0].r===false,'Late old handler cannot expose newly created Stripe URL');
    await q("update bobby_checkout_attempts set expires_at=now()-interval '3 days' where identity_id=$1",[owner.id]);
    check((await acquire(owner)).code==='purchase_legacy_reconciliation_required','Expiry alone never proves old create did not charge');
    check((await q('select count(*)::int n from bobby_purchase_attempts where identity_id=$1',[owner.id])).rows[0].n===0,'No new Google/Stripe dispatch row created during unknown legacy outcome');
  });

  await scenario('Service-only table/RPC privileges and idempotent migration', async () => {
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await q("select has_table_privilege($1,'public.bobby_purchase_attempts','SELECT') as read, has_function_privilege($1,'public.bobby_purchase_acquire(uuid,uuid,text,text,text,text,text)','EXECUTE') as execute", [role]);
      check(rows[0].read === false && rows[0].execute === false, `${role} cannot read attempts or acquire`);
    }
    const { rows } = await q("select has_table_privilege('service_role','public.bobby_purchase_attempts','SELECT') as read, has_function_privilege('service_role','public.bobby_purchase_acquire(uuid,uuid,text,text,text,text,text)','EXECUTE') as execute");
    check(rows[0].read && rows[0].execute, 'Service role retains intended transport permissions');
  });

  await scenario('Cross-provider first-insert acquisition race permits one owner attempt', async () => {
    const owner = await identity();
    const attempts = await Promise.all(Array.from({ length: 12 }, (_, i) => acquire(owner, i % 2 ? 'stripe' : 'google')));
    check(attempts.filter(a => a.state === 'new').length === 1, 'Exactly one new Google/Stripe attempt');
    check(attempts.filter(a => a.code === 'purchase_pending').length === 11, 'Other starts receive durable pending state');
    const { rows } = await q('select count(*)::int as n from bobby_purchase_attempts where identity_id=$1', [owner.id]);
    check(rows[0].n === 1, 'Exactly one durable attempt row');
  });

  await scenario('Operation replay recovers original and rejects changed product', async () => {
    const owner = await identity(), operation = newId();
    const first = await acquire(owner, 'google', operation);
    const replay = await acquire(owner, 'google', operation);
    check(replay.state === 'replay' && replay.attempt.id === first.attempt.id, 'Replay returns same attempt');
    const altered = await rpc('bobby_purchase_acquire', { p_identity: owner.id, p_operation: operation,
      p_provider: 'google', p_product: 'qa.synthetic.other', p_base_plan: 'monthly', p_offer: null,
      p_google_account: accountHash(owner.auth) });
    check(altered.code === 'operation_mismatch', 'Immutable operation/product binding');
  });

  await scenario('Google dispatch CAS issues one permit including concurrent replay', async () => {
    const owner = await identity(), attempt = (await acquire(owner)).attempt;
    const permits = await Promise.all(Array.from({ length: 10 }, () => dispatch(owner, attempt)));
    check(permits.filter(p => p.dispatchAllowed === true).length === 1, 'Exactly one SDK launch permit');
    check(permits.filter(p => p.dispatchAllowed === false).length === 9, 'Replays never relaunch SDK');
  });

  await scenario('Confirmed-before-membership and recoverable provider states retain owner exclusion', async () => {
    const owner = await identity();
    let attempt = (await dispatch(owner, (await acquire(owner)).attempt)).attempt;
    const fp = digest(`synthetic-token:${newId()}`);
    attempt = (await observe(attempt, 'SUBSCRIPTION_STATE_ACTIVE', 'confirmed', {
      p_reference: `google:${fp}`, p_token_fingerprint: fp, p_token_ciphertext: 'synthetic-ciphertext-not-a-real-token' })).attempt;
    check((await acquire(owner, 'stripe')).code === 'purchase_pending', 'Confirmation cannot open a membership commit gap');
    for (const [state, phase] of [['SUBSCRIPTION_STATE_ON_HOLD', 'pending'], ['SUBSCRIPTION_STATE_PAUSED', 'pending'], ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'confirmed']]) {
      attempt = (await observe(attempt, state, phase)).attempt;
      check((await acquire(owner, 'stripe')).code === 'purchase_pending', `${state} remains potentially chargeable`);
    }
    check((await q('select count(*)::int as n from bobby_subscriptions where identity_id=$1', [owner.id])).rows[0].n === 0,
      'Test actually covers absent membership mirror');
  });

  await scenario('Stale observations and changed provider reference cannot rewrite proof', async () => {
    const owner = await identity();
    const original = (await dispatch(owner, (await acquire(owner)).attempt)).attempt;
    const newer = (await observe(original, 'SUBSCRIPTION_STATE_PENDING', 'pending', { p_reference: 'google:synthetic-original' })).attempt;
    check((await observe(original, 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'terminal_no_charge',
      { p_resolution: 'synthetic-stale-cancel' })).code === 'stale_revision', 'Stale cancellation cannot release');
    check((await observe(newer, 'SUBSCRIPTION_STATE_PENDING', 'pending', { p_reference: 'google:synthetic-other' })).code === 'reference_conflict', 'Reference immutable');
  });

  await scenario('Deletion tombstone preserves token owner and same-auth partial-delete recovery', async () => {
    const owner = await identity(), stranger = await identity(), fp = digest(`synthetic-token:${newId()}`);
    const original = (await adopt(owner, fp)).attempt;
    await q('delete from bobby_identities where id=$1', [owner.id]);
    const retained = (await q('select * from bobby_purchase_attempts where id=$1', [original.id])).rows[0];
    check(retained.identity_id === null && retained.owner_key === original.owner_key && retained.token_fingerprint === fp,
      'SET NULL preserves private obligation and global token fingerprint');
    check((await adopt(stranger, fp)).code === 'token_owner_conflict', 'Different auth cannot adopt retained token');
    const recreated = await identity(owner.auth);
    const recovered = await rpc('bobby_purchase_attempt_get', { p_identity: recreated.id, p_attempt: original.id });
    check(recovered.attempt?.id === original.id, 'Same auth recovers original tombstone');
    check((await acquire(recreated, 'stripe')).code === 'purchase_pending', 'Recreated identity cannot bypass unresolved obligation');
    check((await rpc('bobby_purchase_attempt_get', { p_identity: stranger.id, p_attempt: original.id })).attempt === null,
      'Stranger cannot query private attempt');
    const closed = await observe(retained, 'SUBSCRIPTION_STATE_EXPIRED', 'closed', { p_resolution: 'synthetic-authoritative-expired' });
    check(closed.attempt?.phase === 'closed', 'Verified closure remains possible after identity deletion');
    check((await acquire(recreated, 'stripe')).state === 'new', 'Same auth can start again only after closure');
  });

  await scenario('Adopted old Google subscription has no new-purchase timestamp fence', async () => {
    const owner = await identity(), fp = digest(`synthetic-token:${newId()}`);
    const adopted = (await adopt(owner, fp)).attempt;
    check(adopted.origin === 'adopted' && adopted.dispatch_at === null, 'Adopted obligation cannot invent a fresh launch time');
    check((await dispatch(owner, adopted)).dispatchAllowed === false, 'Restore adoption never launches purchase UI');
    const closed = (await observe(adopted, 'SUBSCRIPTION_STATE_EXPIRED', 'closed', { p_resolution: 'synthetic-authoritative-expired' })).attempt;
    check(closed.phase === 'closed', 'Adopted obligation reaches verified expiration');
    check((await acquire(owner, 'stripe')).state === 'new', 'Expiration permits separate new attempt');
  });

  await scenario('Stripe payload freeze, dispatch lease and strict23h window never expire owner', async () => {
    const owner = await identity(), reserved = (await acquire(owner, 'stripe')).attempt;
    const payload = { mode: 'subscription', 'line_items[0][price]': 'price_synthetic', client_reference_id: owner.id };
    let started = (await dispatch(owner, reserved, payload)).attempt;
    check((await dispatch(owner, started, { mode: 'tampered' })).dispatchAllowed === false, 'In-flight Stripe dispatch lease blocks replay');
    await q("update bobby_purchase_attempts set dispatch_lease_until=now()-interval '1 second', dispatch_at=now()-interval '2 hours' where id=$1", [started.id]);
    const retried = await dispatch(owner, started, { mode: 'tampered' });
    check(retried.dispatchAllowed === true && Object.keys(retried.attempt.dispatch_payload).length === Object.keys(payload).length &&
      Object.entries(payload).every(([key, value]) => retried.attempt.dispatch_payload[key] === value), 'Retry uses exact durable provider payload');
    started = retried.attempt;
    for (const duration of ['23 hours', '24 hours', '100 hours']) {
      await q(`update bobby_purchase_attempts set dispatch_lease_until=now()-interval '1 second', dispatch_at=now()-$2::interval where id=$1`, [started.id, duration]);
      check((await dispatch(owner, started, payload)).dispatchAllowed === false, `${duration} cannot recreate provider operation`);
      check((await acquire(owner, 'google')).code === 'purchase_pending', `${duration} cannot expire owner lock`);
    }
    await q("update bobby_purchase_attempts set dispatch_lease_until=now()-interval '1 second', dispatch_at=now()+interval '1 minute' where id=$1", [started.id]);
    check((await dispatch(owner, started, payload)).dispatchAllowed === false, 'Future dispatch timestamp fails closed');
  });

  await scenario('Sticky activation persists independently of whether any obligation remains open', async () => {
    check((await rpc('bobby_purchase_capability', {})).activated === true, 'Any participating acquisition activates durable gate');
    const { rows } = await q("select count(*)::int as n from bobby_purchase_gate where activated=true");
    check(rows[0].n === 1, 'Exactly one durable activated gate');
  });

  await scenario('Membership committed before reservation prevents new charge', async () => {
    const owner = await identity();
    await q("insert into bobby_subscriptions(identity_id,provider,status,current_period_end) values($1,'stripe','active',now()+interval '30 days')", [owner.id]);
    check((await acquire(owner, 'google')).code === 'already_subscribed', 'Active membership refuses reservation');
  });

  await scenario('Pending Google candidate survives deletion and terminal proof removes only sensitive payload', async () => {
    const owner = await identity();
    const started = (await dispatch(owner, (await acquire(owner, 'google')).attempt)).attempt;
    const received = await rpc('bobby_purchase_receive_token', { p_identity: owner.id, p_attempt: started.id,
      p_revision: Number(started.revision), p_ciphertext: 'synthetic-encrypted-candidate-not-a-real-token' });
    check(received.attempt.phase === 'pending' && received.attempt.candidate_ciphertext !== null, 'Candidate stored durably without access grant');
    check(received.attempt.token_fingerprint === null && received.attempt.token_ciphertext === null, 'Candidate is not verified ownership evidence');
    const stale = await rpc('bobby_purchase_receive_token', { p_identity: owner.id, p_attempt: started.id,
      p_revision: Number(started.revision), p_ciphertext: 'synthetic-new-candidate-not-a-real-token' });
    check(stale.code === 'stale_revision', 'Candidate reception uses current revision');
    await q('delete from bobby_identities where id=$1', [owner.id]);
    const retained = (await q('select * from bobby_purchase_attempts where id=$1', [started.id])).rows[0];
    check(retained.identity_id === null && retained.owner_key === started.owner_key && retained.candidate_ciphertext !== null,
      'Deletion de-links identity and retains unresolved private owner/candidate');
    const closed = await observe(retained, 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'terminal_no_charge', {
      p_resolution: 'google-authoritative:synthetic-terminal-cancellation' });
    check(closed.attempt.phase === 'terminal_no_charge' && closed.attempt.candidate_ciphertext === null,
      'Authoritative terminal observation clears unverified candidate');
    check(closed.attempt.owner_key === retained.owner_key && closed.attempt.evidence_sha256 !== null,
      'Limited owner/verification evidence remains private after terminal proof');
    const { rows } = await q("select has_function_privilege('authenticated','public.bobby_purchase_receive_token(uuid,uuid,bigint,text)','EXECUTE') as allowed");
    check(rows[0].allowed === false, 'Authenticated users cannot invoke private candidate RPC directly');
  });

  await scenario('Closed verified Google tombstone scrubs encrypted token while preserving replay prevention', async () => {
    const owner = await identity(), fingerprint = digest(`synthetic-retention-${newId()}`);
    const started = (await dispatch(owner, (await acquire(owner, 'google')).attempt)).attempt;
    const confirmed = (await observe(started, 'SUBSCRIPTION_STATE_ACTIVE', 'confirmed', {
      p_reference: `google:${fingerprint}`, p_token_fingerprint: fingerprint,
      p_token_ciphertext: 'synthetic-encrypted-confirmed-token' })).attempt;
    await q('delete from bobby_identities where id=$1', [owner.id]);
    const tombstone = (await q('select * from bobby_purchase_attempts where id=$1', [confirmed.id])).rows[0];
    const ended = (await observe(tombstone, 'SUBSCRIPTION_STATE_EXPIRED', 'closed', {
      p_resolution: 'google-authoritative:synthetic-expiry' })).attempt;
    check(ended.token_ciphertext === null && ended.candidate_ciphertext === null, 'Closed Google token/candidate are removed');
    check(ended.token_fingerprint === fingerprint && ended.provider_reference === `google:${fingerprint}`,
      'Fingerprint/reference remains to prevent token replay under another owner');
    check(ended.identity_id === null && ended.owner_key === confirmed.owner_key, 'Terminal evidence does not reattach deleted identity');
    const other = await identity();
    check((await adopt(other, fingerprint)).code === 'token_owner_conflict', 'Terminal token cannot be adopted by another account');
  });

  await scenario('Closed Stripe obligation scrubs full Checkout request while retaining evidence', async () => {
    const owner = await identity();
    const started = (await dispatch(owner, (await acquire(owner, 'stripe')).attempt,
      { client_reference_id: owner.id, 'metadata[identity_id]': owner.id, 'line_items[0][price]': 'price_synthetic' })).attempt;
    await q('delete from bobby_identities where id=$1', [owner.id]);
    const tombstone = (await q('select * from bobby_purchase_attempts where id=$1', [started.id])).rows[0];
    const ended = (await observe(tombstone, 'stripe_subscription_terminal', 'closed', {
      p_reference: `cs_retention_${newId().replaceAll('-', '')}`, p_resolution: 'stripe-authoritative:synthetic-terminal' })).attempt;
    check(ended.dispatch_payload === null, 'Full Checkout request is removed only after terminal proof');
    check(ended.provider_reference !== null && ended.owner_key === started.owner_key && ended.evidence_sha256 !== null,
      'Limited correlated owner/provider proof remains for audit/replay prevention');
  });

  await scenario('Sticky activation prevents the old Checkout RPC from bypassing durable obligations', async () => {
    const owner = await identity();
    check((await q('select bobby_checkout_claim($1,$2,$3,$4) r', [owner.id,'cus_Sticky','price_Sticky','https://bobbyprotocol.xyz'])).rows[0].r.state === 'pending', 'Legacy create denied even without this owner ledger row');
    check((await q('select count(*)::int n from bobby_checkout_attempts where identity_id=$1',[owner.id])).rows[0].n === 0, 'No new legacy key or payload created');
    const { rows } = await q("select has_function_privilege('authenticated','public.bobby_checkout_claim(uuid,text,text,text)','EXECUTE') allowed");
    check(rows[0].allowed === false, 'Canonical claim remains service-only after extension');
  });

  await scenario('Committed deletion block serializes concurrent Google and Stripe acquire', async () => {
    const owner = await identity(), client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select bobby_checkout_block_for_deletion($1)', [owner.id]);
      const starts = Array.from({length:8},(_,i)=>acquire(owner,i%2?'google':'stripe'));
      await client.query("select pg_sleep(0.02)");
      await client.query('commit');
      const outcomes = await Promise.all(starts);
      check(outcomes.every(r=>r.code==='account_deleting'), 'All queued acquisitions see canonical deletion fence');
      check((await q('select count(*)::int n from bobby_purchase_attempts where identity_id=$1',[owner.id])).rows[0].n===0, 'Blocked acquisitions create zero durable attempts');
      check((await q('select bobby_checkout_claim($1,$2,$3,$4) r',[owner.id,'cus_Deleting','price_Deleting','https://bobbyprotocol.xyz'])).rows[0].r.state==='deleting','Old Checkout route shares deletion fence');
    } finally { await client.query('rollback').catch(()=>{});client.release(); }
  });

  await scenario('Deletion vetoes both SDK and Stripe dispatch without releasing reserved attempt', async () => {
    for(const provider of ['google','stripe']) {
      const owner=await identity(), attempt=(await acquire(owner,provider)).attempt;
      await q('select bobby_checkout_block_for_deletion($1)',[owner.id]);
      check((await dispatch(owner,attempt,provider==='stripe'?{customer:'cus_DelDispatch'}:null)).code==='account_deleting', `${provider} dispatch denied before provider launch`);
      const retained=(await q('select * from bobby_purchase_attempts where id=$1',[attempt.id])).rows[0];
      check(retained.phase==='reserved'&&retained.dispatch_at===null, `${provider} attempt stays reserved, with no fabricated terminal evidence`);
    }
  });

  await scenario('Deletion captures legacy and durable Stripe references including lost create response', async () => {
    const owner=await identity(), legacyId=newId();
    let a=(await dispatch(owner,(await acquire(owner,'stripe')).attempt,{customer:'cus_DurableSnap',client_reference_id:owner.id})).attempt;
    // Historical coexistence is a deletion snapshot fixture, not permission to create through either route.
    await q("insert into bobby_checkout_attempts(identity_id,attempt_id,customer_id,price_id,origin,expires_at,retry_after,checkout_session_id) values($1,$2,'cus_LegacySnap','price_Snapshot','https://bobbyprotocol.xyz',now()+interval '35 minutes',now(),'cs_LegacySnap')",[owner.id,legacyId]);
    let snap=(await q('select bobby_checkout_block_for_deletion($1) r',[owner.id])).rows[0].r;
    check(snap.pendingStripe===true&&snap.customers.length===2&&snap.customers.includes('cus_LegacySnap')&&snap.customers.includes('cus_DurableSnap'), 'Snapshot retains both exact customers after lost create response');
    check(snap.sessionId==='cs_LegacySnap'&&snap.sessionIds.length===1&&snap.sessionIds[0]==='cs_LegacySnap','Legacy scalar and bounded session array preserved');
    a=(await observe(a,'checkout_open','external_started',{p_reference:'cs_DurableSnap'})).attempt;
    snap=(await q('select bobby_checkout_block_for_deletion($1) r',[owner.id])).rows[0].r;
    check(snap.sessionIds.length===2&&snap.sessionIds.includes('cs_DurableSnap'),'Late provider reference enters next snapshot without clearing block');
    check((await dispatch(owner,a,{customer:'cus_Changed'})).code==='account_deleting','No new create can escape provider cleanup snapshot');
  });

  await scenario('Public Checkout return gate checks current parent, attempt revision and deletion', async () => {
    const owner=await identity(), foreign=await identity();
    let a=(await dispatch(owner,(await acquire(owner,'stripe')).attempt,{customer:'cus_Return'})).attempt;
    const allowed=(id,attempt,revision)=>rpc('bobby_purchase_return_allowed',{p_identity:id,p_attempt:attempt,p_revision:Number(revision)});
    check(await allowed(owner.id,a.id,a.revision)===false,'No URL permission before provider reference');
    a=(await observe(a,'checkout_open','external_started',{p_reference:'cs_Return'})).attempt;
    check(await allowed(owner.id,a.id,a.revision)===true,'Current correlated open provider session permitted');
    check(await allowed(owner.id,a.id,a.revision-1)===false,'Stale response revision rejected');
    check(await allowed(foreign.id,a.id,a.revision)===false,'Foreign owner cannot return another session');
    await q('select bobby_checkout_block_for_deletion($1)',[owner.id]);
    check(await allowed(owner.id,a.id,a.revision)===false,'Canonical deletion vetoes current open URL');
    await q('delete from bobby_identities where id=$1',[owner.id]);
    check(await allowed(owner.id,a.id,a.revision)===false,'Missing account cannot expose tombstone session');
    check((await q('select phase from bobby_purchase_attempts where id=$1',[a.id])).rows[0].phase==='external_started','Return denial never fabricates terminal/no-charge proof');
    for(const role of ['anon','authenticated'])check((await q("select has_function_privilege($1,'public.bobby_purchase_return_allowed(uuid,uuid,bigint)','EXECUTE') allowed",[role])).rows[0].allowed===false,`${role} cannot call egress gate`);
  });

  await scenario('Current Apple sidecar and recoverable card status remain independent charge exclusions', async () => {
    for(const status of ['past_due','paused','unpaid']) {
      const owner=await identity();
      await q("insert into bobby_subscriptions(identity_id,provider,status,current_period_end,stripe_subscription_id,apple_status,apple_current_period_end) values($1,'stripe',$2,now()-interval '2 days',$3,'active',now()+interval '20 days')",[owner.id,status,`sub_${newId().replaceAll('-','')}`]);
      check((await acquire(owner)).code==='already_subscribed',`${status} card with past expiry cannot open Google charge`);
      check((await q('select bobby_is_pro($1) r',[owner.id])).rows[0].r===true,'Actual canonical Apple sidecar grants independently of card status');
    }
    const owner=await identity();
    await q("insert into bobby_subscriptions(identity_id,provider,status,current_period_end,apple_status,apple_current_period_end) values($1,'stripe','canceled',now()-interval '1 day','active',now()+interval '20 days')",[owner.id]);
    check((await acquire(owner)).code==='already_subscribed','Active Apple sidecar blocks after card ended');
    await q("update bobby_subscriptions set apple_status='expired',apple_current_period_end=now()-interval '1 day' where identity_id=$1",[owner.id]);
    check((await acquire(owner)).state==='new','Verified local terminal card and ended Apple sidecar can reserve');
  });

  await scenario('Authoritative known legacy cleanup is CAS-bound and retains private terminal evidence', async () => {
    const owner=await identity(), legacyId=newId(), evidence=digest('synthetic-actual-provider-terminal');
    await q("insert into bobby_checkout_attempts(identity_id,attempt_id,customer_id,price_id,origin,expires_at,retry_after,checkout_session_id) values($1,$2,'cus_CloseLegacy','price_CloseLegacy','https://bobbyprotocol.xyz',now()-interval '3 days',now(),'cs_CloseLegacy')",[owner.id,legacyId]);
    const close=(id,session,proof=evidence)=>rpc('bobby_purchase_close_legacy_checkout',{p_identity:owner.id,p_legacy_attempt:id,p_session:session,p_evidence:proof});
    check((await acquire(owner)).code==='purchase_legacy_reconciliation_required','Even old known session must be independently reconciled');
    check(await close(newId(),'cs_CloseLegacy')===false,'Foreign/stale legacy attempt UUID rejected');
    check(await close(legacyId,'cs_Other')===false,'Different provider session rejected');
    check(await close(legacyId,null)===false,'Missing session cannot clear obligation');
    check(await close(null,'cs_CloseLegacy')===false,'Missing original attempt cannot clear obligation');
    check(await close(legacyId,'cs_CloseLegacy','not-evidence')===false,'No terminal verification digest rejected');
    check(await close(legacyId,'cs_CloseLegacy')===true,'Trusted verified terminal observation clears only exact legacy row');
    check((await q('select count(*)::int n from bobby_checkout_attempts where identity_id=$1',[owner.id])).rows[0].n===0,'Legacy row removed atomically');
    const audit=(await q('select * from bobby_purchase_attempts where identity_id=$1',[owner.id])).rows[0];
    check(audit.phase==='closed'&&audit.origin==='adopted'&&audit.provider_reference==='cs_CloseLegacy'&&audit.evidence_sha256===evidence,'Minimal correlated terminal evidence retained in private ledger');
    check(audit.dispatch_payload===null&&audit.token_ciphertext===null,'No raw Checkout/customer payload retained after terminal legacy cleanup');
    check((await acquire(owner)).state==='new','Next provider requires terminal proof before new reservation');
    const other=await identity(), missingId=newId();
    await q("insert into bobby_checkout_attempts(identity_id,attempt_id,customer_id,price_id,origin,expires_at,retry_after) values($1,$2,'cus_Unknown','price_Unknown','https://bobbyprotocol.xyz',now()-interval '3 days',now())",[other.id,missingId]);
    check(await rpc('bobby_purchase_close_legacy_checkout',{p_identity:other.id,p_legacy_attempt:missingId,p_session:'cs_Hint',p_evidence:evidence})===false,'Unknown session never treated as known by privileged cleanup');
    for(const role of ['anon','authenticated'])check((await q("select has_function_privilege($1,'public.bobby_purchase_close_legacy_checkout(uuid,uuid,text,text)','EXECUTE') allowed",[role])).rows[0].allowed===false,`${role} cannot submit terminal assertions`);
  });

  const summary = { database, loopback: fixtureUrl.host, syntheticOnly: true, sourceSha,
    createdAt: new Date().toISOString(), assertions, passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length, scenarios: results,
    scope: 'Exact reservation SQL applied twice over canonical identity/access/referral/environment/Checkout/Apple migrations plus exact69c owner/evidence normalization; real parent-lock and deletion/egress/concurrency tests. Exact Android membership trigger only, no provider or complete Android migration/lifecycle proof.' };
  writeFileSync(join(out, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, evidence: out }, null, 2));
  if (summary.failed) process.exitCode = 1;
} finally { await pool.end(); }
