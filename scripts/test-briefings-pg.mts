// Actual PostgreSQL regressions for 20261002180000_pro_briefings.sql, driven through the typed client
// (api/_lib/briefings/db.ts) over a PostgREST-like transport: service-only privileges with Supabase's default ACLs
// simulated, settings CAS and its side effects, seeding replays, SKIP LOCKED claims across connections, leases and
// fencing, publish re-validation, outbox fill/claim/result with binding revisions, device register/rebind/revoke
// (D7, A→B, late revoke), budget atomicity under concurrency (D8), audio, reads with A/B isolation, privacy hooks,
// reconciliation, bounded purge and idempotency receipts.
// Local scratch Postgres only:
//   psql postgres://postgres@127.0.0.1:55491/postgres -c 'create database briefings_pg'
//   DATABASE_URL=postgres://postgres@127.0.0.1:55491/briefings_pg npx tsx scripts/test-briefings-pg.mts
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import * as db from '../api/_lib/briefings/db.js';
import { COMPANION_VOICES, voiceForCompanion } from '../api/_lib/briefings/config.js';
import type { BriefSettings, Cadence } from '../api/_lib/briefings/types.js';
import { BRIEFINGS_MIGRATION, BRIEFINGS_SOURCE_GUARD_MIGRATION, assertLocalUrl, bootstrapBriefingsDb, makeIdentity, pgRpcTransport, setPro } from './briefings-pg-harness.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('briefings-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
assertLocalUrl(url);

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const rejects = async (p: Promise<unknown>, what: string, match?: RegExp | ((e: unknown) => boolean)) => { await assert.rejects(p, match ?? (() => true), what); checks++; };

const pool: pg.Pool = await bootstrapBriefingsDb(url);
const rpc = pgRpcTransport(pool);
db.setBriefingRpc(rpc);
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const one = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];

const TABLES = ['bobby_brief_paid_periods', 'bobby_brief_settings', 'bobby_brief_shared', 'bobby_briefs', 'bobby_push_devices', 'bobby_brief_outbox',
  'bobby_brief_provider_attempts', 'bobby_brief_audio', 'bobby_brief_audio_links', 'bobby_brief_idempotency'];
const hex = (n = 32) => randomBytes(n).toString('hex');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const iso = (ms: number) => new Date(ms).toISOString();
const W = 'worker-test';

// ---------- fixtures ----------
let periodSeq = 0;
function period(cadence: Cadence = 'weekly', scheduledOffsetMin = -1, expiresAfterMin = 30) {
  periodSeq++;
  const day = new Date(Date.UTC(2030, 0, 1) + periodSeq * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(2030, 0, 1) + (periodSeq + 7) * 86_400_000).toISOString().slice(0, 10);
  const sched = Date.now() + scheduledOffsetMin * 60_000;
  return {
    cadence, periodKey: cadence === 'weekly' ? `${day}_${end}` : day, periodStart: iso(sched - (cadence === 'weekly' ? 7 : 1) * 86_400_000), periodEnd: iso(sched),
    scheduledAt: iso(sched), pushExpiresAt: iso(sched + expiresAfterMin * 60_000), calendarVersion: 'nyse-2026-2027-v1', policyVersion: 'proposed-v1',
  };
}
type Period = ReturnType<typeof period>;

async function settings(identity: string, patch: Record<string, unknown>): Promise<BriefSettings> {
  const cur = await db.getSettings(identity);
  const r = await db.patchSettings(identity, cur.revision, patch);
  assert.equal(r.ok, true, 'fixture settings patch');
  return (r as { settings: BriefSettings }).settings;
}
/** A synthetic paid Pro account with the weekly switch on. */
async function subscriber(patch: Record<string, unknown> = {}): Promise<string> {
  const id = await makeIdentity(pool, { pro: true });
  await settings(id, { weeklyEnabled: true, ...patch });
  return id;
}
async function insertBrief(identity: string, p: Period): Promise<string> {
  return (await one(`insert into bobby_briefs (identity_id, cadence, period_key, period_start, period_end, scheduled_at, push_expires_at, calendar_version, policy_version)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`, [identity, p.cadence, p.periodKey, p.periodStart, p.periodEnd, p.scheduledAt, p.pushExpiresAt, p.calendarVersion, p.policyVersion])).id;
}
async function readyShared(p: Period, language: string): Promise<string> {
  const c = await db.claimShared(p.cadence as Cadence, p.periodKey, language, W, 60, 3);
  if (c.state === 'ready') return c.id;
  assert.equal(c.state, 'claimed', 'fixture shared claim');
  const id = (c as { id: string }).id;
  const r = await db.commitShared(id, (c as { fence: number }).fence, 'ready', { cadence: p.cadence, quotes: [] }, { version: 1, language }, iso(Date.now()), null);
  assert.equal(r.ok, true, 'fixture shared commit');
  return id;
}
const CONTENT = { version: 1, title: 'fixture', narrationSegments: ['segment one', 'segment two'] };
/** A published report of `identity` for a fresh period (scheduled `offsetMin` from now). */
async function readyBrief(identity: string, o: { offsetMin?: number; cadence?: Cadence; usesMemory?: boolean; memoryAssets?: string[] } = {}) {
  const offset = o.offsetMin ?? -1;
  const p = period(o.cadence ?? 'weekly', offset, Math.max(30, 60 - offset)); // still inside its push window
  const id = await insertBrief(identity, p);
  const [item] = await db.claimBriefs(p.cadence as Cadence, p.periodKey, W, 60, 10);
  assert.equal(item?.id, id, 'fixture claim');
  const sharedId = await readyShared(p, item.frozen.language);
  const r = await db.publishBrief({ id, fence: item.fence, sharedId, content: CONTENT, quality: 'full', dataAsOf: iso(Date.now() - 60_000),
    usesMemory: o.usesMemory ?? false, memoryAssets: o.memoryAssets ?? [], settingsRevision: item.frozen.settingsRevision, privacyEpoch: item.frozen.privacyEpoch });
  assert.deepEqual(r, { ok: true }, 'fixture publish');
  return { id, period: p, sharedId };
}
const device = (permission = 'authorized') => ({
  tokenCiphertext: 'v1:' + randomBytes(48).toString('base64'), tokenFingerprint: hex(), environment: 'production' as const,
  topic: 'xyz.bobbyprotocol.bobby', permission: permission as 'authorized', appBuild: 53,
});
async function register(identity: string, max = 5, w = device()) {
  const proof = hex();
  const installation = randomUUID();
  const r = await db.registerDevice(identity, installation, w, sha(proof), max);
  return { r, proof, installation, w };
}
const briefState = async (id: string) => (await one('select state from bobby_briefs where id = $1', [id])).state as string;
const outboxRows = async (briefId: string) => q('select * from bobby_brief_outbox where brief_id = $1 order by created_at', [briefId]);

try {
  // A clean slate in the scratch database (the harness re-applied the migration twice).
  await q(`truncate ${TABLES.map((t) => `public.${t}`).join(', ')} cascade`);
  await q('delete from public.bobby_identities');

  // ================================================================ privileges
  for (const table of TABLES) {
    for (const role of ['anon', 'authenticated']) for (const priv of ['select', 'insert', 'update', 'delete']) {
      eq((await one('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, priv])).r, false, `${role} has no ${priv} on ${table}`);
    }
    for (const priv of ['select', 'insert', 'update', 'delete']) eq((await one('select has_table_privilege($1, $2, $3) as r', ['service_role', `public.${table}`, priv])).r, true, `service_role ${priv} on ${table}`);
    eq((await one('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).r, true, `RLS on ${table}`);
  }
  const fns = (await q(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'bobby\\_brief\\_%' or p.proname like 'bobby\\_push\\_device\\_%')`)).map((r) => r.sig as string);
  ok(fns.length >= 40, `every RPC exists (${fns.length})`);
  for (const fn of fns) {
    for (const role of ['anon', 'authenticated', 'public']) {
      if (role === 'public') {
        eq((await one(`select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where p.oid = $1::regprocedure and a.grantee = 0) as r`, [fn])).r, false, `PUBLIC cannot execute ${fn}`);
      } else {
        eq((await one('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).r, false, `${role} cannot execute ${fn}`);
      }
    }
    eq((await one('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).r, true, `service_role executes ${fn}`);
  }
  for (const fn of ['bobby_brief_settings_get', 'bobby_brief_inbox', 'bobby_brief_get', 'bobby_brief_claim', 'bobby_brief_budget_reserve',
    'bobby_brief_purge', 'bobby_push_device_register', 'bobby_push_device_write_once', 'bobby_brief_outbox_claim', 'bobby_brief_audio_authorize', 'bobby_brief_privacy_bump']) {
    ok(fns.some((s) => s.startsWith(`${fn}(`)), `${fn} exists`);
  }
  // …and real attempts as anon/authenticated fail, while service_role works.
  for (const role of ['anon', 'authenticated']) {
    for (const attempt of ['select * from public.bobby_briefs', 'select * from public.bobby_push_devices', `select public.bobby_brief_settings_get('${randomUUID()}')`,
      `select public.bobby_brief_get('${randomUUID()}', '${randomUUID()}')`]) {
      const c = await pool.connect();
      try {
        await c.query(`begin; set local role ${role};`);
        await rejects(c.query(attempt), `${role}: ${attempt}`, /permission denied/);
      } finally { await c.query('rollback').catch(() => {}); c.release(); }
    }
  }
  {
    const c = await pool.connect();
    try {
      await c.query('begin; set local role service_role;');
      const id = (await c.query('insert into public.bobby_identities (auth_user_id) values (gen_random_uuid()) returning id')).rows[0].id;
      eq((await c.query('select public.bobby_brief_settings_get($1) as r', [id])).rows[0].r.revision, 0, 'service_role reads settings');
      eq((await c.query("select (public.bobby_brief_settings_patch($1, 0, '{\"weeklyEnabled\": true}'::jsonb) ->> 'ok') as r", [id])).rows[0].r, 'true', 'service_role patches settings');
    } finally { await c.query('rollback').catch(() => {}); c.release(); }
  }
  // A third application changes nothing and fails nothing; the storage bucket block is skipped without a storage schema.
  await pool.query(readFileSync(BRIEFINGS_MIGRATION, 'utf8')); checks++;
  await pool.query(readFileSync(BRIEFINGS_SOURCE_GUARD_MIGRATION, 'utf8')); checks++;
  // With a storage schema (as on Supabase) the private bucket is created once, never public.
  await q(`create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false)`);
  await pool.query(readFileSync(BRIEFINGS_MIGRATION, 'utf8'));
  await pool.query(readFileSync(BRIEFINGS_MIGRATION, 'utf8'));
  await pool.query(readFileSync(BRIEFINGS_SOURCE_GUARD_MIGRATION, 'utf8'));
  await pool.query(readFileSync(BRIEFINGS_SOURCE_GUARD_MIGRATION, 'utf8'));
  eq(await q('select id, name, public from storage.buckets'), [{ id: 'briefing-audio', name: 'briefing-audio', public: false }], 'private briefing-audio bucket, once');
  await q('drop schema storage cascade');
  eq((await one("select count(*)::int as n from pg_trigger where tgname in ('bobby_brief_prefs_update', 'bobby_brief_prefs_delete', 'bobby_brief_assets_delete')")).n, 3, 'three memory triggers, once each');

  // ================================================================ transport
  await rejects(rpc('bobby_brief_nope', {}), 'unknown RPC throws', (e: unknown) => e instanceof db.BriefingStorageError);
  await rejects(rpc('bobby_brief_settings_get', { p_identity: randomUUID(), p_other: 1 }), 'unknown argument throws');
  {
    const id = await makeIdentity(pool, { pro: true });
    eq(await db.isPro(id), true, 'feature paid-Pro RPC returns a scalar boolean (synthetic verified paid period)');
    await setPro(pool, id, false);
    eq(await db.isPro(id), false, '…false without verified paid subscription');
  }

  // Feature entitlement is stricter than global Pro. Local evidence here is synthetic, never real billing proof.
  {
    const id = await makeIdentity(pool);
    await q("insert into bobby_pro_grants (identity_id, pro_until) values ($1, now() + interval '30 days')", [id]);
    eq(await rpc('bobby_is_pro', { p_identity: id }), true, 'global referral/admin grant remains Pro');
    eq(await db.isPro(id), false, 'grant-only account has no paid briefing entitlement');
    await setPro(pool, id, true);
    eq(await db.isPro(id), true, 'active confirmed paid production period qualifies');
    for (const [sql, label] of [
      ["update bobby_subscriptions set status = 'trialing' where identity_id = $1", 'trialing subscription'],
      ["update bobby_subscriptions set status = 'expired' where identity_id = $1", 'expired subscription status'],
      ["update bobby_subscriptions set status = 'past_due' where identity_id = $1", 'billing issue status'],
      ["update bobby_subscriptions set current_period_end = null where identity_id = $1", 'unknown expiry'],
      ["delete from bobby_brief_paid_periods where identity_id = $1", 'missing paid evidence despite active mirror'],
      ["update bobby_brief_paid_periods set period_type = 'trial' where identity_id = $1", 'RevenueCat trial mirrored as active'],
      ["update bobby_brief_paid_periods set environment = 'sandbox' where identity_id = $1", 'Sandbox proof'],
      ["update bobby_brief_paid_periods set environment = 'unknown' where identity_id = $1", 'unknown billing environment'],
      ["update bobby_brief_paid_periods set paid_amount = 0 where identity_id = $1", 'zero paid amount'],
      ["update bobby_brief_paid_periods set verification_state = 'unverified' where identity_id = $1", 'unverified evidence'],
      ["update bobby_brief_paid_periods set product_id = 'other.product' where identity_id = $1", 'mismatched product'],
      ["update bobby_brief_paid_periods set provider = 'stripe' where identity_id = $1", 'mismatched provider'],
      ["update bobby_brief_paid_periods set period_end = period_end + interval '1 day' where identity_id = $1", 'mismatched paid period'],
      ["update bobby_brief_paid_periods set verified_at = now() + interval '1 hour' where identity_id = $1", 'future proof verification'],
      ["update bobby_brief_paid_periods set period_start = now() + interval '1 hour' where identity_id = $1", 'future paid period'],
    ]) {
      await setPro(pool, id, true);
      await q(sql, [id]);
      eq(await db.isPro(id), false, `${label} fails closed for briefings`);
    }
    await setPro(pool, id, true);
    await q("update bobby_subscriptions set current_period_end = now() - interval '1 minute' where identity_id = $1", [id]);
    await q('update bobby_brief_paid_periods p set period_end = s.current_period_end from bobby_subscriptions s where p.identity_id = s.identity_id and p.identity_id = $1', [id]);
    eq(await db.isPro(id), false, 'expired matching paid period fails closed');
    await setPro(pool, id, true);
    eq(await db.isPro(id), true, 'cancelled auto-renewal retains an active already-paid period until expiry (mirror stays active)');
    await q("update bobby_brief_paid_periods set period_type = 'intro' where identity_id = $1", [id]);
    eq(await db.isPro(id), true, 'positive paid intro period remains paid (free trial excluded)');
    await q("update bobby_identities set auth_user_id = null, wallet_address = '0x' || repeat('a', 40) where id = $1", [id]);
    eq(await db.isPro(id), false, 'wallet-only identity cannot qualify as signed-in briefing account');
    await q('delete from bobby_identities where id = $1', [id]);
    eq((await one('select count(*)::int as n from bobby_brief_paid_periods where identity_id = $1', [id])).n, 0, 'account deletion cascades private paid evidence');
  }
  // The two Stripe payment sources must not borrow each other's positive-paid evidence.
  {
    const id = await makeIdentity(pool, { pro: true });
    await q("update bobby_subscriptions set provider = 'stripe', stripe_subscription_id = 'sub_direct_test' where identity_id = $1", [id]);
    await q("update bobby_brief_paid_periods set provider = 'stripe' where identity_id = $1", [id]);
    eq(await db.isPro(id), false, 'RevenueCat Web Billing proof cannot authorize a direct Stripe subscription');
    await q("update bobby_brief_paid_periods set proof_source = 'stripe' where identity_id = $1", [id]);
    eq(await db.isPro(id), true, 'positive direct Stripe proof authorizes its current period');
    await q('update bobby_subscriptions set stripe_subscription_id = null where identity_id = $1', [id]);
    eq(await db.isPro(id), false, 'direct Stripe proof cannot authorize RevenueCat Web Billing');
    await q("update bobby_brief_paid_periods set proof_source = 'revenuecat' where identity_id = $1", [id]);
    eq(await db.isPro(id), true, 'positive RevenueCat Web Billing proof authorizes its current period');
  }

  // ================================================================ settings
  {
    const a = await makeIdentity(pool);
    const s0 = await db.getSettings(a);
    eq(s0, { revision: 0, openingEnabled: false, closeEnabled: false, weeklyEnabled: false, language: 'en', companionId: null, assets: [],
      analysisConsentEnabled: false, analysisConsentVersion: null, audioConsentEnabled: false, audioConsentVersion: null, privacyEpoch: 0 }, 'defaults at revision 0');
    eq(await db.patchSettings(a, 3, { weeklyEnabled: true }), { ok: false, code: 'revision_conflict', revision: 0 }, 'absent row: only revision 0 applies');
    const r1 = await db.patchSettings(a, 0, { weeklyEnabled: true, language: 'es', companionId: 'kora', assets: ['BTC', 'NVDA'] });
    eq(r1, { ok: true, settings: { ...s0, revision: 1, weeklyEnabled: true, language: 'es', companionId: 'kora', assets: ['BTC', 'NVDA'] } }, 'first save inserts at revision 1, same shape as GET');
    eq(await db.getSettings(a), (r1 as { settings: BriefSettings }).settings, 'GET returns what PATCH returned');
    eq(await db.patchSettings(a, 0, { weeklyEnabled: true }), { ok: false, code: 'revision_conflict', revision: 1 }, 'stale revision → conflict with current revision');
    // Defense in depth: invalid values throw (the API validates first).
    for (const [bad, what] of [
      [{ assets: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }, '7 assets'], [{ assets: ['btc'] }, 'lowercase symbol'], [{ assets: ['BTC', 'BTC'] }, 'duplicate asset'],
      [{ assets: ['BTC; drop'] }, 'symbol pattern'], [{ language: 'ja' }, 'language'], [{ companionId: 'Kora!' }, 'companion pattern'],
      [{ weeklyEnabled: 'yes' }, 'non-boolean switch'], [{ owner: 'x' }, 'unknown key'], [{ analysisConsentEnabled: true }, 'consent without version'],
      [{ analysisConsentEnabled: true, analysisConsentVersion: 0 }, 'consent version 0'],
    ] as Array<[Record<string, unknown>, string]>) {
      await rejects(db.patchSettings(a, 1, bad), `rejects ${what}`, (e: unknown) => e instanceof db.BriefingStorageError && e.status === 400);
    }
    eq((await db.getSettings(a)).revision, 1, 'rejected patches change nothing');
    const r2 = await db.patchSettings(a, 1, { analysisConsentEnabled: true, analysisConsentVersion: 1, audioConsentEnabled: true, audioConsentVersion: 1 });
    eq([r2.ok, (r2 as { settings: BriefSettings }).settings.analysisConsentVersion, (r2 as { settings: BriefSettings }).settings.audioConsentEnabled], [true, 1, true], 'consents enabled at a version');
    const at = await one('select analysis_consent_at, audio_consent_at, privacy_epoch from bobby_brief_settings where identity_id = $1', [a]);
    ok(at.analysis_consent_at && at.audio_consent_at, 'enabling a consent records its acceptance time');
    const r3 = await db.patchSettings(a, 2, { analysisConsentEnabled: false });
    eq([(r3 as { settings: BriefSettings }).settings.analysisConsentEnabled, (r3 as { settings: BriefSettings }).settings.analysisConsentVersion,
      (r3 as { settings: BriefSettings }).settings.privacyEpoch], [false, null, at.privacy_epoch + 1], 'withdrawing analysis consent clears its version and bumps the privacy epoch');

    // CAS under concurrency: 8 racing saves at the same revision → exactly one wins.
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => db.patchSettings(a, 3, { assets: [['BTC', 'ETH', 'SOL', 'NVDA', 'SPY', 'QQQ', 'AAPL', 'TSLA'][i]] })));
    eq(results.filter((r) => r.ok).length, 1, 'one of 8 concurrent saves wins');
    ok(results.filter((r) => !r.ok).every((r) => (r as { revision: number }).revision === 4), 'the others see the new revision');
    const fresh = await makeIdentity(pool);
    const firsts = await Promise.all(Array.from({ length: 8 }, () => db.patchSettings(fresh, 0, { weeklyEnabled: true })));
    eq(firsts.filter((r) => r.ok).length, 1, 'one of 8 concurrent FIRST saves wins (no duplicate row)');
    eq((await one('select count(*)::int as n, max(revision) as rev from bobby_brief_settings where identity_id = $1', [fresh])), { n: 1, rev: 1 }, 'one row at revision 1');
  }

  // ================================================================ seed
  {
    const p = period('close');
    const yes = await subscriber({ closeEnabled: true });
    const notPro = await makeIdentity(pool); await settings(notPro, { closeEnabled: true });
    const off = await subscriber(); // opening on, close off
    const n1 = await db.seedPeriod(p as Parameters<typeof db.seedPeriod>[0]);
    const n2 = await db.seedPeriod(p as Parameters<typeof db.seedPeriod>[0]);
    eq([n1, n2], [1, 0], 'seed: one Pro account with the switch on; a replayed cron seeds nothing');
    eq((await q('select identity_id from bobby_briefs where cadence = $1 and period_key = $2', [p.cadence, p.periodKey])).map((r) => r.identity_id), [yes], 'only the Pro, switched-on account');
    ok(!(await q('select 1 from bobby_briefs where identity_id = any($1)', [[notPro, off]])).length, 'nobody else');
    eq(await db.openLanguages('close', p.periodKey), ['en'], 'shared generation is available for an eligible open report');
    await setPro(pool, yes, false);
    eq(await db.openLanguages('close', p.periodKey), [], 'payment lapse after seed removes the shared-generation language');
    await setPro(pool, yes, true);
    await settings(yes, { closeEnabled: false });
    eq(await db.openLanguages('close', p.periodKey), [], 'opt-out after seed removes the shared-generation language');
    await rejects(db.seedPeriod({ ...p, periodKey: '2030-01-01_2030-01-07' } as Parameters<typeof db.seedPeriod>[0]), 'a malformed period key is refused');
  }

  // ================================================================ shared narrative
  {
    const p = period();
    const c1 = await db.claimShared('weekly', p.periodKey, 'es', W, 60, 3);
    eq([c1.state, (c1 as { fence: number }).fence, (c1 as { attempts: number }).attempts], ['claimed', 1, 0], 'first claim: fence 1');
    eq(await db.claimShared('weekly', p.periodKey, 'es', 'other', 60, 3), { state: 'busy' }, 'a live lease → busy');
    const id = (c1 as { id: string }).id;
    eq(await db.commitShared(id, 99, 'ready', {}, {}, null, null), { ok: false, code: 'stale_fence' }, 'wrong fence rejected');
    await q("update bobby_brief_shared set lease_expires_at = now() - interval '1 second' where id = $1", [id]);
    eq(await db.commitShared(id, 1, 'ready', {}, {}, null, null), { ok: false, code: 'stale_fence' }, 'expired lease rejected even with the right fence');
    const c2 = await db.claimShared('weekly', p.periodKey, 'es', W, 60, 3);
    eq([c2.state, (c2 as { fence: number }).fence, (c2 as { attempts: number }).attempts], ['claimed', 2, 1], 'reclaim after an expired lease: fence 2, the lost lease counted');
    eq(await db.commitShared(id, 1, 'ready', {}, {}, null, null), { ok: false, code: 'stale_fence' }, 'the first worker can never commit');
    eq(await db.commitShared(id, 2, 'ready', { quotes: [1] }, { version: 1 }, iso(Date.now()), null), { ok: true }, 'current fence commits');
    const c3 = await db.claimShared('weekly', p.periodKey, 'es', W, 60, 3);
    eq([c3.state, (c3 as { narrative: unknown }).narrative, (c3 as { evidence: unknown }).evidence], ['ready', { version: 1 }, { quotes: [1] }], 'ready returns narrative + evidence');
    const pr = period();
    for (let i = 0; i < 3; i++) {
      const c = await db.claimShared('weekly', pr.periodKey, 'en', W, 60, 3);
      if (i < 3 && c.state === 'claimed') await db.commitShared((c as { id: string }).id, (c as { fence: number }).fence, 'retry', null, null, null, 'provider');
    }
    eq((await db.claimShared('weekly', pr.periodKey, 'en', W, 60, 3)).state, 'failed', 'retries are capped by p_max_attempts');
    eq(await db.claimShared('weekly', p.periodKey, 'en', W, 60, 3).then((c) => c.state), 'claimed', 'languages are separate rows');
    const pc = period();
    const racers = await Promise.all(Array.from({ length: 8 }, (_, i) => db.claimShared('weekly', pc.periodKey, 'en', `r${i}`, 60, 3)));
    eq(racers.filter((c) => c.state === 'claimed').length, 1, '8 concurrent shared claims → exactly one holder');
    ok(racers.filter((c) => c.state !== 'claimed').every((c) => c.state === 'busy'), '…the others busy');
    eq((await one('select count(*)::int as n from bobby_brief_shared where period_key = $1', [pc.periodKey])).n, 1, '…one row');
  }

  // ================================================================ personal claim
  {
    // Concurrency: 30 due reports, 4 workers on separate connections, never a double claim.
    const p = period();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push(await subscriber({ assets: ['BTC'] }));
    eq(await db.seedPeriod(p as Parameters<typeof db.seedPeriod>[0]) >= 30, true, 'seeded the 30');
    const batches = await Promise.all(Array.from({ length: 4 }, (_, i) => db.claimBriefs('weekly', p.periodKey, `w${i}`, 60, 10)));
    const claimed = batches.flat().filter((b) => ids.includes(b.identityId));
    eq(new Set(claimed.map((b) => b.id)).size, claimed.length, 'no report claimed twice by concurrent workers');
    const rest = await db.claimBriefs('weekly', p.periodKey, 'w9', 60, 100);
    eq(new Set([...claimed, ...rest.filter((b) => ids.includes(b.identityId))].map((b) => b.id)).size, 30, 'every report claimed exactly once');
    ok([...claimed, ...rest].every((b) => b.fence === 1), 'every first claim has fence 1');

    // SKIP LOCKED across an open transaction: rows locked by worker 1 are invisible to worker 2.
    const p2 = period();
    const ids2: string[] = [];
    for (let i = 0; i < 6; i++) { const id = await subscriber(); ids2.push(id); await insertBrief(id, p2); }
    const c1 = await pool.connect();
    try {
      await c1.query('begin');
      const held = (await c1.query(`select public.bobby_brief_claim(p_cadence => 'weekly', p_period_key => $1, p_worker => 'held', p_lease_seconds => 60,
        p_limit => 2, p_voices => $2::jsonb, p_default_voice => $3) as r`, [p2.periodKey, JSON.stringify(COMPANION_VOICES), voiceForCompanion(null)])).rows[0].r.items;
      eq(held.length, 2, 'worker 1 holds 2 (uncommitted)');
      const other = await db.claimBriefs('weekly', p2.periodKey, 'free', 60, 100);
      eq(other.length, 4, 'worker 2 skips the locked rows and takes the other 4');
      ok(!other.some((o) => held.some((h: { id: string }) => h.id === o.id)), '…no overlap');
      await c1.query('commit');
    } finally { c1.release(); }

    // Frozen settings, voice, memory.
    const m = await subscriber({ language: 'es', companionId: 'kora', assets: ['NVDA', 'BTC'], analysisConsentEnabled: true, analysisConsentVersion: 1, audioConsentEnabled: true, audioConsentVersion: 1 });
    await q("insert into bobby_user_prefs (identity_id, experience, risk) values ($1, 'new', 'high')", [m]);
    await q(`insert into bobby_user_assets (identity_id, symbol, asks, first_asked_at, last_asked_at) values
      ($1, 'NVDA', 1, now() - interval '20 days', now() - interval '1 day'), ($1, 'ETH', 2, now() - interval '20 days', now() - interval '3 days'),
      ($1, 'SOL', 1, now() - interval '5 days', now() - interval '2 hours'), ($1, 'XAG', 9, now() - interval '200 days', now() - interval '100 days')`, [m]);
    const plain = await subscriber();
    const paused = await subscriber({ analysisConsentEnabled: true, analysisConsentVersion: 1 });
    await q("insert into bobby_user_prefs (identity_id, memory_enabled) values ($1, false)", [paused]);
    await q("insert into bobby_user_assets (identity_id, symbol, asks) values ($1, 'NVDA', 5)", [paused]);
    const pm = period();
    for (const id of [m, plain, paused]) await insertBrief(id, pm);
    eq((await db.neededAssets('weekly', pm.periodKey, 'es')).sort(), ['BTC', 'ETH', 'NVDA', 'SOL'], 'needed assets (es): followed + consented asked assets, including one NVDA question');
    eq(await db.neededAssets('weekly', pm.periodKey, 'en'), [], 'needed assets (en): nobody follows anything; paused memory adds nothing');
    const items = await db.claimBriefs('weekly', pm.periodKey, W, 60, 10);
    const byId = Object.fromEntries(items.map((i) => [i.identityId, i]));
    const mi = byId[m];
    const ms = await db.getSettings(m);
    eq(mi.frozen, { settingsRevision: ms.revision, privacyEpoch: ms.privacyEpoch, language: 'es', companionId: 'kora', voice: COMPANION_VOICES.kora,
      assets: ['NVDA', 'BTC'], analysisConsent: true, analysisConsentVersion: 1, audioConsent: true }, 'FrozenSettings shape, voice from the companion map');
    eq(mi.memory, { experience: 'new', explainRiskDepth: 'high', frequentAssets: ['SOL', 'NVDA', 'ETH'] }, 'memory: prefs + one or more asks within 90 days, most recent first');
    eq([byId[plain].memory, byId[plain].frozen.voice, byId[plain].frozen.companionId], [null, voiceForCompanion(null), null], 'no consent → no memory; default voice');
    eq(byId[paused].memory, null, 'memory paused → no memory despite consent');
    const fr = await one('select voice, language, settings_revision, privacy_epoch, lease_owner, state from bobby_briefs where id = $1', [mi.id]);
    eq([fr.voice, fr.language, fr.state, fr.lease_owner], [COMPANION_VOICES.kora, 'es', 'preparing', W], 'voice/language/lease frozen on the row');

    // Non-Pro → skipped, opted out → cancelled, deadline → failed.
    const pz = period();
    const lapsed = await subscriber(); const optedOut = await subscriber(); const late = await subscriber();
    const bl = await insertBrief(lapsed, pz); const bo = await insertBrief(optedOut, pz);
    await setPro(pool, lapsed, false);
    await q('update bobby_brief_settings set weekly_enabled = false where identity_id = $1', [optedOut]);
    eq((await db.claimBriefs('weekly', pz.periodKey, W, 60, 10)).length, 0, 'neither is claimed');
    eq([await briefState(bl), await briefState(bo)], ['skipped', 'cancelled'], 'non-Pro → skipped, opted out → cancelled');
    const pl = period('weekly', -60, 10);
    const bd = await insertBrief(late, pl);
    eq((await db.claimBriefs('weekly', pl.periodKey, W, 60, 10)).length, 0, 'past its push deadline: not claimed');
    eq(await briefState(bd), 'failed', '…failed (deadline)');
  }

  // ================================================================ publish / fail
  {
    const a = await subscriber();
    const p = period();
    const id = await insertBrief(a, p);
    const [it] = await db.claimBriefs('weekly', p.periodKey, W, 60, 10);
    const sharedId = await readyShared(p, 'en');
    const base = { id, fence: it.fence, sharedId, content: CONTENT, quality: 'full', dataAsOf: iso(Date.now()), usesMemory: false, memoryAssets: [], settingsRevision: it.frozen.settingsRevision, privacyEpoch: it.frozen.privacyEpoch };
    eq(await db.publishBrief({ ...base, fence: it.fence + 1 }), { ok: false, code: 'stale_fence' }, 'publish: wrong fence');
    await q("update bobby_briefs set lease_expires_at = now() - interval '1 second' where id = $1", [id]);
    eq(await db.publishBrief(base), { ok: false, code: 'stale_fence' }, 'publish: expired lease');
    const [again] = await db.claimBriefs('weekly', p.periodKey, 'w2', 60, 10);
    eq([again.id, again.fence], [id, 2], 'reclaimed with fence 2');
    eq(await db.publishBrief(base), { ok: false, code: 'stale_fence' }, 'the stale worker cannot publish');
    const cur = { ...base, fence: 2 };
    await rejects(db.publishBrief({ ...cur, quality: 'great' }), 'invalid quality throws');
    await rejects(db.publishBrief({ ...cur, sharedId: randomUUID() }), 'a missing shared row throws');
    eq(await db.publishBrief(cur), { ok: true }, 'publish with the current fence');
    const row = await one('select state, content_version, content, quality, uses_memory, memory_assets, lease_owner from bobby_briefs where id = $1', [id]);
    eq([row.state, row.content_version, row.content, row.quality, row.lease_owner], ['ready', 1, CONTENT, 'full', null], 'ready, content_version 1, lease cleared');
    eq(await db.publishBrief(cur), { ok: false, code: 'stale_fence' }, 'publishing twice is refused');

    const claimOne = async (who: string) => {
      const pp = period(); const bid = await insertBrief(who, pp);
      const [x] = await db.claimBriefs('weekly', pp.periodKey, W, 60, 10);
      return { pp, bid, x, sharedId: await readyShared(pp, x.frozen.language) };
    };
    const pub = (c: Awaited<ReturnType<typeof claimOne>>, extra: Record<string, unknown> = {}) => db.publishBrief({ id: c.bid, fence: c.x.fence, sharedId: c.sharedId, content: CONTENT,
      quality: 'partial', dataAsOf: iso(Date.now()), usesMemory: false, memoryAssets: [], settingsRevision: c.x.frozen.settingsRevision, privacyEpoch: c.x.frozen.privacyEpoch, ...extra });
    let c = await claimOne(a); await setPro(pool, a, false);
    eq(await pub(c), { ok: false, code: 'not_pro' }, 'owner lost Pro → not_pro'); eq(await briefState(c.bid), 'skipped', '…skipped');
    await setPro(pool, a, true);
    c = await claimOne(a); await q('update bobby_brief_settings set weekly_enabled = false where identity_id = $1', [a]);
    eq(await pub(c), { ok: false, code: 'opted_out' }, 'switch off meanwhile → opted_out'); eq(await briefState(c.bid), 'cancelled', '…cancelled');
    await q('update bobby_brief_settings set weekly_enabled = true where identity_id = $1', [a]);
    c = await claimOne(a); await q('update bobby_brief_settings set privacy_epoch = privacy_epoch + 1 where identity_id = $1', [a]);
    eq(await pub(c), { ok: false, code: 'privacy_changed' }, 'privacy epoch moved → privacy_changed');
    const back = await one('select state, content, frozen, lease_owner from bobby_briefs where id = $1', [c.bid]);
    eq([back.state, back.content, back.frozen, back.lease_owner], ['pending', null, null, null], '…back to pending with nothing kept');

    c = await claimOne(a);
    eq(await db.failBrief(c.bid, c.x.fence + 5, 'x', false).then(() => briefState(c.bid)), 'preparing', 'fail with a stale fence does nothing');
    await db.failBrief(c.bid, c.x.fence, 'provider_timeout', false);
    eq([await briefState(c.bid), (await one('select attempts from bobby_briefs where id = $1', [c.bid])).attempts], ['pending', 1], 'non-final fail → pending, attempts 1');
    for (let i = 0; i < 2; i++) { const [x] = await db.claimBriefs('weekly', c.pp.periodKey, W, 60, 10); await db.failBrief(c.bid, x.fence, 'again', false); }
    eq(await briefState(c.bid), 'failed', 'the third failure is final');
    const c4 = await claimOne(a); await db.failBrief(c4.bid, c4.x.fence, 'invalid_content', true);
    eq(await briefState(c4.bid), 'failed', 'final fail → failed at once');
  }

  // ================================================================ reads, A/B isolation
  {
    const A = await subscriber({ language: 'es', companionId: 'zuri' });
    const B = await subscriber();
    const r1 = await readyBrief(A, { offsetMin: -300 });
    const r2 = await readyBrief(A, { offsetMin: -200 });
    const r3 = await readyBrief(A, { offsetMin: -100 });
    const r4 = await readyBrief(A, { offsetMin: -100 }); // same scheduled_at as r3: the id breaks the tie
    await q('update bobby_briefs set scheduled_at = (select scheduled_at from bobby_briefs where id = $1) where id = $2', [r3.id, r4.id]);
    const future = await readyBrief(A, { offsetMin: 20 });
    const got = await db.getReport(A, r1.id) as { report: Record<string, unknown> };
    eq(Object.keys(got.report).sort(), ['cadence', 'calendarVersion', 'content', 'contentVersion', 'dataAsOf', 'id', 'language', 'periodEnd', 'periodStart', 'quality', 'scheduledAt', 'voice'], 'report shape');
    eq([got.report.id, got.report.voice, got.report.language, got.report.contentVersion, got.report.content], [r1.id, COMPANION_VOICES.zuri, 'es', 1, CONTENT], 'voice/language frozen at claim');
    eq(new Date(got.report.periodStart as string).toISOString(), r1.period.periodStart, 'periodStart round-trips');
    eq(await db.getReport(B, r1.id), { code: 'not_found' }, "B cannot open A's report (same answer as missing)");
    eq(await db.getReport(A, randomUUID()), { code: 'not_found' }, 'missing → not_found');
    eq(await db.getReport(A, future.id), { code: 'not_found' }, 'a report scheduled in the future is not served yet');
    const inboxB = await db.inbox(B, null, null, 20);
    eq(inboxB.items, [], "A's reports never appear in B's inbox");
    const page1 = await db.inbox(A, null, null, 2);
    const order = [r4, r3].map((r) => r.id).sort().reverse(); // equal scheduled_at → id desc
    eq(page1.items.map((i) => i.id), order, 'page 1: newest first, ties by id desc');
    eq(Object.keys(page1.items[0]).sort(), ['audioState', 'cadence', 'calendarVersion', 'contentVersion', 'dataAsOf', 'id', 'periodEnd', 'periodStart', 'quality', 'scheduledAt'], 'InboxItem shape');
    eq(page1.items[0].audioState, 'none', 'no audio yet');
    const last = page1.items[1];
    const page2 = await db.inbox(A, null, { scheduledAt: last.scheduledAt, id: last.id }, 2);
    eq(page2.items.map((i) => i.id), [r2.id, r1.id], 'page 2 continues the keyset');
    eq((await db.inbox(A, null, { scheduledAt: page2.items[1].scheduledAt, id: page2.items[1].id }, 2)).items, [], 'page 3 empty');
    eq((await db.inbox(A, 'morning', null, 20)).items, [], 'cadence filter excludes another cadence');
    eq(page1.latest.map((l) => [l.cadence, l.periodKey, l.state]), [['weekly', future.period.periodKey, 'preparing']], 'latest: the newest weekly period is not due yet → preparing');
    // B asks with A's ids as a cursor: still only B's (none).
    eq((await db.inbox(B, null, { scheduledAt: last.scheduledAt, id: last.id }, 20)).items, [], "a cursor never reveals another account's items");
    await setPro(pool, A, false);
    eq(await db.getReport(A, r1.id), { code: 'subscription_required' }, 'owner without Pro → subscription_required');
    eq(await db.getReport(B, r1.id), { code: 'not_found' }, '…but a stranger still gets not_found');
    await setPro(pool, A, true);
    // latest: unavailable after a failed period; disabled cadences are omitted.
    const C = await subscriber();
    const pf = period('weekly', -10); const bf = await insertBrief(C, pf);
    await q("update bobby_briefs set state = 'failed' where id = $1", [bf]);
    eq((await db.inbox(C, null, null, 20)).latest.map((l) => l.state), ['unavailable'], 'latest: failed → unavailable');
    await settings(C, { weeklyEnabled: false });
    eq((await db.inbox(C, null, null, 20)).latest, [], 'latest omits switched-off cadences');
  }

  // ================================================================ settings side effects on work
  {
    const a = await subscriber({ closeEnabled: true });
    const pPending = period(); const pPrep = period(); const pClose = period('close');
    const bPending = await insertBrief(a, pPending);
    const bPrep = await insertBrief(a, pPrep);
    const bClose = await insertBrief(a, pClose);
    await db.claimBriefs('weekly', pPrep.periodKey, W, 60, 10);
    const ready = await readyBrief(a);
    const dev = await register(a);
    await db.fillOutbox(100);
    const [ob] = await outboxRows(ready.id);
    eq(ob?.state, 'pending', 'an unsent push exists for the ready report');
    await settings(a, { weeklyEnabled: false });
    eq([await briefState(bPending), await briefState(bPrep), await briefState(bClose), await briefState(ready.id)], ['cancelled', 'cancelled', 'pending', 'ready'],
      'disabling weekly cancels its pending/preparing reports only; legacy close and ready reports untouched');
    eq((await outboxRows(ready.id))[0].state, 'cancelled', '…and its unsent push');
    eq((await db.getReport(a, ready.id) as { report: unknown }).report !== undefined, true, 'the ready report stays readable');
    await settings(a, { weeklyEnabled: true });
    eq([await briefState(bPending), await briefState(bPrep)], ['pending', 'pending'], 're-enabling revives never-prepared reports of an open window');
    await db.revokeDevice(a, (dev.r as { registrationId: string }).registrationId, 1, sha(dev.proof));
  }

  // ================================================================ devices
  {
    const A = await makeIdentity(pool); const B = await makeIdentity(pool);
    const d1 = await register(A);
    eq(d1.r, { ok: true, registrationId: (d1.r as { registrationId: string }).registrationId, bindingRevision: 1 }, 'first registration: revision 1');
    const reg = (d1.r as { registrationId: string }).registrationId;
    eq(await db.rebindDevice(B, reg, 1, sha(hex()), sha(hex()), device(), 5), { ok: false, code: 'not_found' }, "B cannot rebind A's registration without its proof");
    eq(await db.rebindDevice(B, randomUUID(), 1, sha(hex()), sha(hex()), device(), 5), { ok: false, code: 'not_found' }, 'a missing registration → same not_found');
    eq(await db.revokeDevice(B, reg, 1, sha(d1.proof)), { ok: true, state: 'already' }, "B cannot revoke A's registration even with its proof");
    eq((await one('select identity_id, status from bobby_push_devices where id = $1', [reg])), { identity_id: A, status: 'active' }, "A's registration intact");
    const dupInst = await db.registerDevice(B, d1.installation, device(), sha(hex()), 5);
    eq(dupInst, { ok: false, code: 'conflict' }, "another account registering A's installation → generic conflict (no owner)");
    eq(await db.registerDevice(A, randomUUID(), { ...device(), tokenFingerprint: d1.w.tokenFingerprint }, sha(hex()), 5), { ok: false, code: 'conflict' }, 'same token fingerprint → conflict, even for the owner');
    ok(!JSON.stringify(dupInst).includes(A), 'the conflict never carries an identity');
    // Device cap under concurrency (advisory lock per identity).
    const capped = await makeIdentity(pool);
    const regs = await Promise.all(Array.from({ length: 8 }, () => register(capped, 3)));
    eq(regs.filter((x) => x.r.ok).length, 3, '8 concurrent registrations, cap 3 → exactly 3');
    ok(regs.filter((x) => !x.r.ok).every((x) => (x.r as { code: string }).code === 'device_limit'), '…the rest device_limit');
    // Rebind (same owner): proof, CAS, verifier rotation, re-fenced intents (D7).
    const ra = await readyBrief(await subscriber());
    void ra;
    const owner = await subscriber();
    const od = await register(owner);
    const oreg = (od.r as { registrationId: string }).registrationId;
    const rb = await readyBrief(owner);
    await db.fillOutbox(100);
    eq((await outboxRows(rb.id)).map((o) => [o.state, Number(o.binding_revision)]), [['pending', 1]], 'intent at binding revision 1');
    const newProof = hex();
    eq(await db.rebindDevice(owner, oreg, 1, sha(hex()), sha(newProof), device(), 5), { ok: false, code: 'not_found' }, 'rebind with a wrong proof → not_found');
    eq(await db.rebindDevice(owner, oreg, 7, sha(od.proof), sha(newProof), device(), 5), { ok: false, code: 'revision_conflict', bindingRevision: 1 }, 'stale expected revision → revision_conflict');
    const w2 = device();
    eq(await db.rebindDevice(owner, oreg, 1, sha(od.proof), sha(newProof), w2, 5), { ok: true, registrationId: oreg, bindingRevision: 2 }, 'rotation → revision 2');
    eq((await outboxRows(rb.id)).map((o) => [o.state, Number(o.binding_revision)]), [['pending', 2]], 'D7: the pending intent is re-fenced to revision 2 (not cancelled)');
    eq(await db.rebindDevice(owner, oreg, 2, sha(od.proof), sha(hex()), device(), 5), { ok: false, code: 'not_found' }, 'the old proof is dead after rotation');
    const [claimedNew] = (await db.claimOutbox(W, 60, 50)).filter((i) => i.briefId === rb.id);
    eq([claimedNew.bindingRevision, claimedNew.tokenCiphertext], [2, w2.tokenCiphertext], 'claimed under the new binding with the new token (old token never used)');
    // A rotation while an intent is in flight: an invalid_token answer for the OLD binding must not kill the new one.
    const p3 = hex();
    eq((await db.rebindDevice(owner, oreg, 2, sha(newProof), sha(p3), device(), 5)).ok, true, 'rotation while claimed → revision 3');
    await db.outboxResult(claimedNew.id, claimedNew.fence, 'invalid_token', 410, 'Unregistered', null);
    eq((await one('select status, binding_revision from bobby_push_devices where id = $1', [oreg])), { status: 'active', binding_revision: '3' }, 'invalid_token for revision 2 leaves revision 3 active');
    eq((await outboxRows(rb.id)).map((o) => [o.state, Number(o.binding_revision)]), [['pending', 3]], '…and the intent goes back to pending for the new token');
    // Owner change A→B with the installation proof (B signs in on the same phone).
    const p4 = hex();
    const moved = await db.rebindDevice(B, oreg, 3, sha(p3), sha(p4), device(), 5);
    eq(moved, { ok: true, registrationId: oreg, bindingRevision: 4 }, 'owner change → revision 4, bound to B');
    eq((await outboxRows(rb.id)).map((o) => o.state), ['cancelled'], "the previous owner's unsent intents are cancelled");
    eq(await db.revokeDevice(owner, oreg, 3, sha(p3)), { ok: true, state: 'already' }, "a late logout from the previous owner → 'already'");
    eq(await db.revokeDevice(owner, oreg, 4, sha(p4)), { ok: true, state: 'already' }, '…even with the current proof and revision: not its device');
    eq((await one('select identity_id, status from bobby_push_devices where id = $1', [oreg])), { identity_id: B, status: 'active' }, "B's binding is intact");
    eq(await db.revokeDevice(B, oreg, 3, sha(p4)), { ok: false, code: 'revision_conflict', bindingRevision: 4 }, 'B revoke at a stale revision → conflict');
    eq(await db.revokeDevice(B, oreg, 4, sha(hex())), { ok: true, state: 'already' }, 'B revoke without the proof → already (nothing revealed)');
    eq(await db.revokeDevice(B, oreg, 4, sha(p4)), { ok: true, state: 'revoked' }, 'B revokes');
    eq(await db.revokeDevice(B, oreg, 4, sha(p4)), { ok: true, state: 'already' }, 'idempotent');
    eq(await db.rebindDevice(B, oreg, 4, sha(p4), sha(hex()), device(), 5), { ok: false, code: 'not_found' }, 'a revoked registration cannot be rebound');
    ok((await db.registerDevice(A, randomUUID(), { ...device(), tokenFingerprint: (await one('select token_fingerprint from bobby_push_devices where id = $1', [oreg])).token_fingerprint }, sha(hex()), 5)).ok,
      'a revoked token can be registered again');
    // Owner change respects the new owner's cap.
    const full = await makeIdentity(pool);
    await register(full, 1);
    const other = await register(A);
    eq(await db.rebindDevice(full, (other.r as { registrationId: string }).registrationId, 1, sha(other.proof), sha(hex()), device(), 1), { ok: false, code: 'device_limit' }, 'owner change into a full account → device_limit');
    // Invalidate only for a matching revision.
    const inv = await register(A);
    const ireg = (inv.r as { registrationId: string }).registrationId;
    await db.invalidateDevice(ireg, 5, 'BadDeviceToken');
    eq((await one('select status from bobby_push_devices where id = $1', [ireg])).status, 'active', 'invalidate at a stale revision does nothing');
    await db.invalidateDevice(ireg, 1, 'BadDeviceToken');
    eq((await one('select status, invalid_reason from bobby_push_devices where id = $1', [ireg])), { status: 'invalid', invalid_reason: 'BadDeviceToken' }, 'invalidate at the current revision');
    const revived = await db.rebindDevice(A, ireg, 1, sha(inv.proof), sha(hex()), device(), 5);
    eq(revived, { ok: true, registrationId: ireg, bindingRevision: 2 }, 'an invalidated installation rebinds with a fresh token');
  }

  // Legacy reports stay readable, but daily/close delivery intents cannot be created or claimed.
  {
    const owner = await subscriber();
    await settings(owner, { openingEnabled: true, closeEnabled: true });
    const registered = await register(owner);
    const registration = (registered.r as { registrationId: string }).registrationId;
    for (const cadence of ['morning', 'close'] as const) {
      const legacy = await readyBrief(owner, { cadence });
      await db.fillOutbox(1000);
      eq((await outboxRows(legacy.id)).length, 0, `${cadence}: no new delivery intent`);
      const [old] = await q(`insert into bobby_brief_outbox (brief_id, identity_id, device_id, installation_id, binding_revision, collapse_id, language, due_at, expires_at)
        select $1::uuid, identity_id, id, installation_id, binding_revision, 'legacy-' || ($1::uuid)::text, 'en', now() - interval '1 minute', now() + interval '30 minutes'
        from bobby_push_devices where id = $2 returning id`, [legacy.id, registration]);
      const claimed = await db.claimOutbox(W, 60, 200);
      ok(!claimed.some(item => item.briefId === legacy.id), `${cadence}: old queued intent not sent to APNs`);
      eq((await one('select state from bobby_brief_outbox where id = $1', [old.id])).state, 'cancelled', `${cadence}: old queued intent cancelled`);
    }
  }

  // ================================================================ outbox
  {
    const A = await subscriber();
    const d = await register(A);
    const reg = (d.r as { registrationId: string }).registrationId;
    const denied = await register(A, 5, device('denied'));
    const r = await readyBrief(A);
    const notDue = await readyBrief(A, { offsetMin: 10 });
    const n1 = await db.fillOutbox(100);
    const n2 = await db.fillOutbox(100);
    ok(n1 >= 1 && n2 === 0, `fill inserts once (${n1}, then ${n2})`);
    const rows = await outboxRows(r.id);
    eq(rows.map((o) => [o.device_id, o.state, o.collapse_id, o.language]), [[reg, 'pending', `brief-${r.id}`, 'en']], 'one intent per (report, authorized device); denied permission skipped');
    eq((await outboxRows(notDue.id)).length, 0, 'a report not yet due gets no intent');
    void denied;
    const items = (await db.claimOutbox(W, 60, 50)).filter((i) => i.briefId === r.id);
    eq(items.length, 1, 'claimed');
    const it = items[0];
    eq(Object.keys(it).sort(), ['apnsId', 'attempts', 'bindingRevision', 'briefId', 'collapseId', 'deviceId', 'environment', 'expiresAt', 'fence', 'id', 'language', 'tokenCiphertext', 'topic'], 'OutboxItem shape');
    eq([it.deviceId, it.bindingRevision, it.environment, it.topic, it.apnsId, it.attempts, it.fence], [reg, 1, 'production', 'xyz.bobbyprotocol.bobby', rows[0].apns_id, 0, 1], 'OutboxItem values');
    eq((await db.claimOutbox(W, 60, 50)).filter((i) => i.briefId === r.id).length, 0, 'a claimed intent is not claimed again while leased');
    await db.outboxResult(it.id, it.fence + 1, 'accepted', 200, null, null);
    eq((await one('select state from bobby_brief_outbox where id = $1', [it.id])).state, 'claimed', 'result with a stale fence is ignored');
    await db.outboxResult(it.id, it.fence, 'retry', 503, 'ServiceUnavailable', 5);
    let row = await one('select state, attempts, due_at > now() as later, apns_id from bobby_brief_outbox where id = $1', [it.id]);
    eq([row.state, row.attempts, row.later, row.apns_id], ['pending', 1, true, it.apnsId], 'retry → pending later, attempts 1, same apns_id');
    await q('update bobby_brief_outbox set due_at = now() where id = $1', [it.id]);
    let [again] = (await db.claimOutbox(W, 60, 50)).filter((i) => i.id === it.id);
    await db.outboxResult(again.id, again.fence, 'config', 403, 'InvalidProviderToken', null);
    row = await one('select state, attempts from bobby_brief_outbox where id = $1', [it.id]);
    eq([row.state, row.attempts], ['pending', 1], 'config → pending, attempts unchanged');
    await q('update bobby_brief_outbox set due_at = now() where id = $1', [it.id]);
    [again] = (await db.claimOutbox(W, 60, 50)).filter((i) => i.id === it.id);
    await q("update bobby_brief_outbox set lease_expires_at = now() - interval '1 second' where id = $1", [it.id]);
    await db.outboxResult(again.id, again.fence, 'accepted', 200, null, null);
    eq((await one('select state from bobby_brief_outbox where id = $1', [it.id])).state, 'claimed', 'result after the lease expired is ignored');
    [again] = (await db.claimOutbox(W, 60, 50)).filter((i) => i.id === it.id);
    eq([again.attempts, again.fence], [2, again.fence], 'reclaiming an expired lease counts an (ambiguous) attempt');
    await db.outboxResult(again.id, again.fence, 'ambiguous', null, 'timeout', 5);
    eq((await one('select state, attempts from bobby_brief_outbox where id = $1', [it.id])), { state: 'failed', attempts: 3 }, 'the third attempt is final');
    // accepted → sent; never a second intent for the same installation.
    const r2 = await readyBrief(A);
    await db.fillOutbox(100);
    const [i2] = (await db.claimOutbox(W, 60, 50)).filter((i) => i.briefId === r2.id);
    await db.outboxResult(i2.id, i2.fence, 'accepted', 200, null, null);
    eq((await one('select state, sent_at is not null as s from bobby_brief_outbox where id = $1', [i2.id])), { state: 'sent', s: true }, 'accepted → sent');
    eq(await db.fillOutbox(100), 0, 'no second intent for a sent report');
    // invalid_token at the current binding → device invalid, intent failed.
    const B = await subscriber(); const bd = await register(B);
    const r3 = await readyBrief(B); await db.fillOutbox(100);
    const [i3] = (await db.claimOutbox(W, 60, 50)).filter((i) => i.briefId === r3.id);
    await db.outboxResult(i3.id, i3.fence, 'invalid_token', 410, 'Unregistered', null);
    eq([(await one('select state from bobby_brief_outbox where id = $1', [i3.id])).state, (await one('select status from bobby_push_devices where id = $1', [(bd.r as { registrationId: string }).registrationId])).status],
      ['failed', 'invalid'], 'invalid_token → failed + device invalidated');
    // The binding revision is a precondition: an intent for a revision the device no longer has is never sent.
    const E = await subscriber(); const ed = await register(E);
    const r7 = await readyBrief(E); await db.fillOutbox(100);
    await q('update bobby_push_devices set binding_revision = binding_revision + 1 where id = $1', [(ed.r as { registrationId: string }).registrationId]);
    eq((await db.claimOutbox(W, 60, 50)).filter((i) => i.briefId === r7.id).length, 0, 'stale binding revision → not claimed');
    eq((await outboxRows(r7.id))[0].state, 'cancelled', '…cancelled');
    // Re-validation at claim: Pro lapsed / cadence off → cancelled; expiry → expired.
    const C = await subscriber(); await register(C);
    const r4 = await readyBrief(C); const r5 = await readyBrief(C);
    await db.fillOutbox(100);
    await setPro(pool, C, false);
    eq((await db.claimOutbox(W, 60, 50)).filter((i) => [r4.id, r5.id].includes(i.briefId)).length, 0, 'owner lost Pro → nothing claimed');
    eq((await outboxRows(r4.id))[0].state, 'cancelled', '…intent cancelled');
    await setPro(pool, C, true);
    const r6 = await readyBrief(C); await db.fillOutbox(100);
    await q("update bobby_brief_outbox set expires_at = now() - interval '1 second' where brief_id = $1", [r6.id]);
    await db.claimOutbox(W, 60, 50);
    eq((await outboxRows(r6.id))[0].state, 'expired', 'past its expiry → expired, never sent');
    // Concurrency: 40 intents, 4 claimers on separate connections → each claimed once.
    const many: string[] = [];
    for (let i = 0; i < 10; i++) { const who = await subscriber(); for (let k = 0; k < 2; k++) await register(who); for (let k = 0; k < 2; k++) many.push((await readyBrief(who)).id); }
    await db.fillOutbox(1000);
    const got = (await Promise.all(Array.from({ length: 4 }, (_, i) => db.claimOutbox(`c${i}`, 60, 15)))).flat().filter((i) => many.includes(i.briefId));
    const rest = (await db.claimOutbox('c9', 60, 200)).filter((i) => many.includes(i.briefId));
    eq(new Set([...got, ...rest].map((i) => i.id)).size, got.length + rest.length, 'no intent claimed twice');
    eq(got.length + rest.length, 40, 'all 40 intents claimed exactly once');
  }

  // ================================================================ budget
  {
    const reset = () => q('truncate bobby_brief_provider_attempts');
    await reset();
    const base = { kind: 'llm' as const, provider: 'anthropic', model: 'claude-sonnet-5-5', reserveUsd: 0.3, dayCap: 1, monthCap: 10, maxSlots: 100, maxAttemptsPerWork: 2, worker: W };
    eq(await db.reserveAttempt({ ...base, workRef: 'w:x', dayCap: 0 }), { ok: false, code: 'not_configured' }, 'no cap → not_configured');
    // 12 concurrent reservations against a 1.00 cap at 0.30 each: never above the cap.
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => db.reserveAttempt({ ...base, workRef: `w:cap:${i}` })));
    eq(res.filter((r) => r.ok).length, 3, '12 concurrent → 3 accepted (0.90 < 1.00)');
    ok(res.filter((r) => !r.ok).every((r) => (r as { code: string }).code === 'budget_exhausted'), '…the rest budget_exhausted');
    const total = Number((await one("select coalesce(sum(reserve_usd), 0) as t from bobby_brief_provider_attempts where state = 'reserved'")).t);
    ok(total <= 1, `reserved total ${total} never exceeds the cap`);
    await reset();
    const slots = await Promise.all(Array.from({ length: 12 }, (_, i) => db.reserveAttempt({ ...base, workRef: `w:slot:${i}`, dayCap: 100, monthCap: 100, maxSlots: 2 })));
    eq(slots.filter((r) => r.ok).length, 2, '12 concurrent → 2 slots');
    ok(slots.filter((r) => !r.ok).every((r) => (r as { code: string }).code === 'slots_full'), '…the rest slots_full');
    await reset();
    // Lifecycle: reserve → dispatch → unknown blocks the work item; reconcile assumes the charge (D8); cap of 2 per work.
    const big = { ...base, dayCap: 100, monthCap: 100 };
    const a1 = await db.reserveAttempt({ ...big, workRef: 'shared:1' });
    eq(a1.ok, true, 'reserved');
    eq(await db.reserveAttempt({ ...big, workRef: 'shared:1' }), { ok: false, code: 'work_unresolved' }, 'an open attempt blocks its work item');
    const id1 = (a1 as { attemptId: string }).attemptId;
    await db.dispatchAttempt(id1);
    await db.settleAttempt(id1, 'unknown', null, { latencyMs: 40000 });
    eq((await one('select state from bobby_brief_provider_attempts where id = $1', [id1])).state, 'unknown', 'timed out → unknown');
    eq(await db.reserveAttempt({ ...big, workRef: 'shared:1' }), { ok: false, code: 'work_unresolved' }, 'unknown → work_unresolved (no blind retry)');
    await db.reconcile(300);
    eq((await one('select state from bobby_brief_provider_attempts where id = $1', [id1])).state, 'unknown', 'reconcile waits for the settle delay');
    await q("update bobby_brief_provider_attempts set updated_at = now() - interval '301 seconds' where id = $1", [id1]);
    const rec = await db.reconcile(300);
    eq(rec.assumed, 1, 'reconcile reports the assumption');
    const assumed = await one('select state, actual_usd from bobby_brief_provider_attempts where id = $1', [id1]);
    eq([assumed.state, Number(assumed.actual_usd)], ['settled_assumed', 0.3], 'unknown older than settle → settled_assumed at the reservation');
    const a2 = await db.reserveAttempt({ ...big, workRef: 'shared:1' });
    eq(a2.ok, true, 'the work item may retry once resolved');
    await db.dispatchAttempt((a2 as { attemptId: string }).attemptId);
    await db.settleAttempt((a2 as { attemptId: string }).attemptId, 'no_charge', null, { latencyMs: 10 });
    eq(await db.reserveAttempt({ ...big, workRef: 'shared:1' }), { ok: false, code: 'attempts_exhausted' }, 'two attempts (including a no_charge one) exhaust the work item');
    const a3 = await db.reserveAttempt({ ...big, workRef: 'shared:2' });
    await db.dispatchAttempt((a3 as { attemptId: string }).attemptId);
    await db.settleAttempt((a3 as { attemptId: string }).attemptId, 'settled', 0.012345, { tokensIn: 1000, tokensOut: 500, latencyMs: 900 });
    const a4 = await db.reserveAttempt({ ...big, workRef: 'shared:3' });
    await q("update bobby_brief_provider_attempts set updated_at = now() - interval '301 seconds' where id = $1", [(a4 as { attemptId: string }).attemptId]);
    await db.reconcile(300);
    eq((await one('select state from bobby_brief_provider_attempts where id = $1', [(a4 as { attemptId: string }).attemptId])).state, 'released', 'reserved but never dispatched → released (costs nothing)');
    const a5 = await db.reserveAttempt({ ...big, workRef: 'shared:4', kind: 'tts' });
    void a5;
    const st = await db.budgetStatus() as { day: { reserved: number; settled: number }; month: { reserved: number; settled: number }; slots: { llm: number; tts: number }; unknown: number };
    eq([Number(st.day.settled).toFixed(6), Number(st.day.reserved).toFixed(6), st.slots, st.unknown], ['0.312345', '0.300000', { llm: 0, tts: 1 }, 0], 'status: settled actual + assumed, open reservations, slots');
    ok(Number(st.month.settled) >= Number(st.day.settled), 'month ≥ day');
    // The day total counts settled actual + assumed + open; a reservation that would reach the cap is refused.
    eq(await db.reserveAttempt({ ...base, workRef: 'shared:5', dayCap: 0.9, monthCap: 100, reserveUsd: 0.3 }), { ok: false, code: 'budget_exhausted' }, '0.612345 + 0.30 ≥ 0.90 → exhausted');
    eq((await db.reserveAttempt({ ...base, workRef: 'shared:5', dayCap: 0.95, monthCap: 100, reserveUsd: 0.3 })).ok, true, '0.612345 + 0.30 < 0.95 → ok');
    await reset();
  }

  // ================================================================ audio
  {
    const A = await subscriber({ audioConsentEnabled: true, audioConsentVersion: 1 });
    const B = await subscriber();
    const ra = await readyBrief(A);
    const rb = await readyBrief(B);
    const key = sha('segment one|ash|en');
    const voice = voiceForCompanion(null);
    const q1 = await db.requestAudio(A, ra.id, 1, 0, key, voice, 'en');
    eq((q1 as { state: string }).state, 'queued', 'first request queues');
    const audioId = (q1 as { audioId: string }).audioId;
    eq(await db.requestAudio(A, ra.id, 1, 0, key, voice, 'en'), { audioId, state: 'queued' }, 'a duplicate joins the same work');
    eq(await db.requestAudio(B, rb.id, 1, 0, key, voice, 'en'), { audioId, state: 'queued' }, 'the same text/voice for another reader shares the audio');
    eq(await db.requestAudio(B, ra.id, 1, 0, key, voice, 'en'), { code: 'not_found' }, "B cannot attach to A's report");
    eq(await db.requestAudio(A, ra.id, 1, 2, sha('x'), voice, 'en'), { code: 'not_found' }, 'segment out of range');
    eq(await db.requestAudio(A, ra.id, 2, 0, key, voice, 'en'), { code: 'content_version_conflict' }, 'stale content version');
    eq(await db.requestAudio(A, ra.id, 1, 0, key, 'onyx', 'en'), { code: 'content_version_conflict' }, 'voice not the frozen one');
    eq(await db.requestAudio(A, ra.id, 1, 0, key, voice, 'es'), { code: 'content_version_conflict' }, 'language not the frozen one');
    eq(await db.authorizeAudio(A, audioId), { state: 'queued', storagePath: null, mime: 'audio/mpeg' }, 'authorize while queued');
    const c1 = await db.claimAudio(audioId, W, 60);
    eq(c1, { state: 'claimed', fence: 1, attempts: 0 }, 'claim');
    eq(await db.claimAudio(audioId, 'other', 60), { state: 'busy' }, 'single synthesis per cache key');
    eq(await db.commitAudio(audioId, 2, 'ready', 'v1/ab/x.mp3', 10, null), { ok: false, code: 'stale_fence' }, 'stale fence');
    eq(await db.commitAudio(audioId, 1, 'ready', `v1/${key.slice(0, 2)}/${key}.mp3`, 12345, null), { ok: true }, 'commit ready');
    eq(await db.claimAudio(audioId, W, 60), { state: 'ready' }, 'already ready');
    eq(await db.authorizeAudio(A, audioId), { state: 'ready', storagePath: `v1/${key.slice(0, 2)}/${key}.mp3`, mime: 'audio/mpeg' }, 'owner gets the path');
    eq(await db.authorizeAudio(B, audioId), { state: 'ready', storagePath: `v1/${key.slice(0, 2)}/${key}.mp3`, mime: 'audio/mpeg' }, 'B is authorized through its own linked report');
    const C = await subscriber();
    eq(await db.authorizeAudio(C, audioId), { code: 'not_found' }, 'a stranger → not_found');
    eq(await db.authorizeAudio(C, randomUUID()), { code: 'not_found' }, 'missing → not_found');
    await setPro(pool, A, false);
    eq(await db.authorizeAudio(A, audioId), { code: 'subscription_required' }, 'owner without Pro → subscription_required');
    eq(await db.requestAudio(A, ra.id, 1, 1, sha('lapsed request'), voice, 'en'), { code: 'subscription_required' }, 'owner without paid Pro cannot queue synthesis');
    eq(await db.authorizeAudio(C, audioId), { code: 'not_found' }, '…a stranger still not_found');
    await setPro(pool, A, true);
    eq((await db.inbox(A, null, null, 20)).items.find((i) => i.id === ra.id)?.audioState, 'ready', 'inbox audioState ready');
    await q("update bobby_briefs set state = 'withdrawn' where id = $1", [rb.id]);
    eq(await db.authorizeAudio(B, audioId), { code: 'not_found' }, 'a withdrawn report no longer authorizes its audio');
    // retry / lease expiry / attempt cap
    const k2 = sha('segment two');
    const q2 = await db.requestAudio(A, ra.id, 1, 1, k2, voice, 'en') as { audioId: string };
    await setPro(pool, A, false);
    eq(await db.claimAudio(q2.audioId, W, 60), { state: 'failed' }, 'no paid linked reader → no synthesis lease');
    eq((await one('select state, fence from bobby_brief_audio where id = $1', [q2.audioId])).state, 'queued', 'denied synthesis preserves a reusable queued cache key');
    await setPro(pool, A, true);
    let c = await db.claimAudio(q2.audioId, W, 60) as { fence: number };
    await db.commitAudio(q2.audioId, c.fence, 'retry', null, null, 'tts_503');
    eq((await one('select state, attempts from bobby_brief_audio where id = $1', [q2.audioId])), { state: 'queued', attempts: 1 }, 'retry → queued, attempts 1');
    eq((await db.inbox(A, null, null, 20)).items.find((i) => i.id === ra.id)?.audioState, 'processing', 'inbox audioState processing while a segment is pending');
    c = await db.claimAudio(q2.audioId, W, 60) as { fence: number };
    await q("update bobby_brief_audio set lease_expires_at = now() - interval '1 second' where id = $1", [q2.audioId]);
    eq(await db.commitAudio(q2.audioId, c.fence, 'ready', 'v1/aa/y.mp3', 1, null), { ok: false, code: 'stale_fence' }, 'expired lease rejected');
    eq(await db.claimAudio(q2.audioId, W, 60), { state: 'claimed', fence: 3, attempts: 2 }, 'a lost lease counts as an attempt');
    await q("update bobby_brief_audio set lease_expires_at = now() - interval '1 second' where id = $1", [q2.audioId]);
    eq(await db.claimAudio(q2.audioId, W, 60), { state: 'failed' }, 'the third attempt is refused → failed');
  }

  // ================================================================ privacy hooks
  {
    const consent = { analysisConsentEnabled: true, analysisConsentVersion: 1 };
    const A = await subscriber(consent);
    await q("insert into bobby_user_prefs (identity_id, experience, risk) values ($1, 'some', 'low')", [A]);
    await q("insert into bobby_user_assets (identity_id, symbol, asks) values ($1, 'NVDA', 3), ($1, 'TSLA', 2)", [A]);
    await register(A);
    const past = await readyBrief(A, { usesMemory: true, memoryAssets: ['NVDA'] });
    const pastTsla = await readyBrief(A, { usesMemory: true, memoryAssets: ['TSLA'] });
    const generic = await readyBrief(A);
    const futureMem = await readyBrief(A, { offsetMin: 15, usesMemory: true, memoryAssets: ['NVDA'] });
    const pp = period(); const prep = await insertBrief(A, pp);
    const [pi] = await db.claimBriefs('weekly', pp.periodKey, W, 60, 10);
    await db.fillOutbox(100);
    eq((await outboxRows(past.id))[0]?.state, 'pending', 'a memory-based report has an unsent push');
    const epoch0 = (await db.getSettings(A)).privacyEpoch;
    // Pause memory.
    await q('update bobby_user_prefs set memory_enabled = false where identity_id = $1', [A]);
    eq((await db.getSettings(A)).privacyEpoch, epoch0 + 1, 'pause → privacy epoch + 1');
    eq([await briefState(prep), await briefState(futureMem.id), await briefState(past.id), await briefState(generic.id)], ['pending', 'withdrawn', 'ready', 'ready'],
      'pause: in-flight → pending, memory report not yet due → withdrawn, delivered ones stay');
    eq((await outboxRows(past.id))[0].state, 'cancelled', "pause: a memory-based report's unsent push is cancelled");
    eq((await outboxRows(generic.id))[0].state, 'pending', "…a generic report's push is not");
    eq(await db.publishBrief({ id: prep, fence: pi.fence, sharedId: (await readyShared(pp, 'en')), content: CONTENT, quality: 'full', dataAsOf: iso(Date.now()),
      usesMemory: true, memoryAssets: ['NVDA'], settingsRevision: pi.frozen.settingsRevision, privacyEpoch: pi.frozen.privacyEpoch }), { ok: false, code: 'stale_fence' }, 'the in-flight personal publish is fenced off');
    eq((await one('select content from bobby_briefs where id = $1', [futureMem.id])).content, null, 'withdrawn content is nulled');
    // Forget one asset (explicit, recent) → reports it shaped are withdrawn and purged.
    const e1 = (await db.getSettings(A)).privacyEpoch;
    await q("delete from bobby_user_assets where identity_id = $1 and symbol = 'TSLA'", [A]);
    eq((await db.getSettings(A)).privacyEpoch, e1 + 1, 'forget an asset → epoch + 1');
    eq([await briefState(pastTsla.id), (await one('select content, memory_assets from bobby_briefs where id = $1', [pastTsla.id]))], ['withdrawn', { content: null, memory_assets: [] }], 'the TSLA report is withdrawn and purged');
    eq(await briefState(past.id), 'ready', 'the NVDA report is untouched by forgetting TSLA');
    eq(await db.getReport(A, pastTsla.id), { code: 'not_found' }, 'a withdrawn report is not served');
    // Retention sweep (older than 90 days) is not a forget.
    await q("insert into bobby_user_assets (identity_id, symbol, asks, first_asked_at, last_asked_at) values ($1, 'OLD', 2, now() - interval '200 days', now() - interval '100 days')", [A]);
    const e2 = (await db.getSettings(A)).privacyEpoch;
    await q("delete from bobby_user_assets where identity_id = $1 and symbol = 'OLD'", [A]);
    eq((await db.getSettings(A)).privacyEpoch, e2, 'a retention delete (>90 days) bumps nothing');
    // Clearing all three prefs → delete with purge.
    await q('update bobby_user_prefs set experience = null, risk = null, horizon = null where identity_id = $1', [A]);
    eq((await db.getSettings(A)).privacyEpoch, e2 + 1, 'clearing every pref → epoch + 1');
    eq([await briefState(past.id), (await one('select content from bobby_briefs where id = $1', [past.id])).content], ['withdrawn', null], 'purge: delivered memory reports withdrawn, content nulled');
    eq(await briefState(generic.id), 'ready', 'generic reports survive a memory purge');
    // The real "forget everything" RPC drives the triggers (prefs delete when enabled).
    const B = await subscriber(consent);
    await q("insert into bobby_user_prefs (identity_id, experience) values ($1, 'new')", [B]);
    await q("insert into bobby_user_assets (identity_id, symbol, asks) values ($1, 'BTC', 4)", [B]);
    const rB = await readyBrief(B, { usesMemory: true, memoryAssets: ['BTC'] });
    const eB = (await db.getSettings(B)).privacyEpoch;
    eq((await one('select public.bobby_memory_forget($1) as n', [B])).n, 1, 'bobby_memory_forget removes the asset');
    eq((await db.getSettings(B)).privacyEpoch, eB + 2, 'one bump for the asset, one for the prefs delete');
    eq(await briefState(rB.id), 'withdrawn', '…and the report it shaped is withdrawn');
    // Analysis consent withdrawal through settings.
    const Cc = await subscriber(consent);
    const rC = await readyBrief(Cc, { offsetMin: 20, usesMemory: true, memoryAssets: [] });
    const eC = (await db.getSettings(Cc)).privacyEpoch;
    await settings(Cc, { analysisConsentEnabled: false });
    eq([(await db.getSettings(Cc)).privacyEpoch, await briefState(rC.id)], [eC + 1, 'withdrawn'], 'consent withdrawn → bump + not-yet-due memory report withdrawn');
    // A memory hook for an account without briefing settings is a no-op; deleting an identity cascades cleanly.
    const N = await makeIdentity(pool);
    await q("insert into bobby_user_prefs (identity_id, experience) values ($1, 'new')", [N]);
    await q('update bobby_user_prefs set memory_enabled = false where identity_id = $1', [N]); checks++;
    eq(await one('select public.bobby_brief_privacy_bump($1, $2, false) as r', [N, 'memory_paused']), { r: { bumped: false } }, 'no settings row → nothing bumped');
    const D = await subscriber(consent);
    await q("insert into bobby_user_prefs (identity_id, experience) values ($1, 'new')", [D]);
    await q("insert into bobby_user_assets (identity_id, symbol, asks) values ($1, 'ETH', 2)", [D]);
    await register(D); await readyBrief(D, { usesMemory: true, memoryAssets: ['ETH'] });
    await q('delete from bobby_identities where id = $1', [D]);
    for (const t of ['bobby_brief_settings', 'bobby_briefs', 'bobby_push_devices', 'bobby_brief_outbox', 'bobby_user_prefs', 'bobby_user_assets']) {
      eq((await one(`select count(*)::int as n from ${t} where identity_id = $1`, [D])).n, 0, `identity delete cascades ${t}`);
    }
    await rejects(q("select public.bobby_brief_privacy_bump($1, 'whatever', false)", [A]), 'unknown privacy reason refused');
  }

  // ================================================================ reconcile
  {
    const A = await subscriber();
    const p = period(); const b = await insertBrief(A, p);
    await db.claimBriefs('weekly', p.periodKey, W, 60, 10);
    await q("update bobby_briefs set lease_expires_at = now() - interval '1 second' where id = $1", [b]);
    const pd = period('weekly', -60, 10); const bd = await insertBrief(A, pd);
    const ps = period(); const sc = await db.claimShared('weekly', ps.periodKey, 'en', W, 60, 3) as { id: string };
    await q("update bobby_brief_shared set lease_expires_at = now() - interval '1 second' where id = $1", [sc.id]);
    const ra = await readyBrief(A);
    const aq = await db.requestAudio(A, ra.id, 1, 0, sha(randomUUID()), voiceForCompanion(null), 'en') as { audioId: string };
    await db.claimAudio(aq.audioId, W, 60);
    await q("update bobby_brief_audio set lease_expires_at = now() - interval '1 second' where id = $1", [aq.audioId]);
    await register(A); await db.fillOutbox(100);
    await q("update bobby_brief_outbox set expires_at = now() - interval '1 second' where brief_id = $1", [ra.id]);
    const r = await db.reconcile(300);
    ok((r.briefLeases as number) >= 1 && (r.deadline as number) >= 1 && (r.sharedLeases as number) >= 1 && (r.audioLeases as number) >= 1 && (r.outboxExpired as number) >= 1, `reconcile counts ${JSON.stringify(r)}`);
    eq((await one('select state, attempts, last_error from bobby_briefs where id = $1', [b])), { state: 'pending', attempts: 1, last_error: 'lease_expired' }, 'expired brief lease → pending, attempt counted');
    eq((await one('select state, last_error from bobby_briefs where id = $1', [bd])), { state: 'failed', last_error: 'deadline' }, 'pending past push expiry → failed(deadline)');
    eq((await one('select state, attempts from bobby_brief_shared where id = $1', [sc.id])), { state: 'pending', attempts: 1 }, 'expired shared lease → claimable');
    eq((await one('select state, attempts from bobby_brief_audio where id = $1', [aq.audioId])), { state: 'queued', attempts: 1 }, 'expired audio lease → queued');
    eq((await outboxRows(ra.id))[0].state, 'expired', 'overdue outbox → expired');
  }

  // ================================================================ idempotency
  {
    const A = await makeIdentity(pool); const B = await makeIdentity(pool);
    const key = randomUUID(); const dg = sha('body'); const dg2 = sha('other body');
    eq(await db.idemBegin(A, 'device', key, dg, 86400), { state: 'new' }, 'first use → new');
    eq(await db.idemBegin(A, 'device', key, dg, 86400), { state: 'in_progress' }, 'concurrent duplicate → in_progress');
    eq(await db.idemBegin(A, 'device', key, dg2, 86400), { state: 'mismatch' }, 'same key, other payload → mismatch');
    eq(await db.idemBegin(B, 'device', key, dg2, 86400), { state: 'new' }, "B's key space is separate");
    await db.idemFinish(A, 'device', key, 201, 'sealed-receipt');
    eq(await db.idemBegin(A, 'device', key, dg, 86400), { state: 'replay', status: 201, response: 'sealed-receipt' }, 'replay returns the stored receipt');
    eq(await db.idemBegin(A, 'device', key, dg2, 86400), { state: 'mismatch' }, 'a finished key still refuses another payload');
    await q("update bobby_brief_idempotency set expires_at = now() - interval '1 second' where identity_id = $1 and idem_key = $2", [A, key]);
    eq(await db.idemBegin(A, 'device', key, dg2, 86400), { state: 'new' }, 'after the TTL the key is fresh');
    const k2 = randomUUID();
    await db.idemBegin(A, 'voice', k2, dg, 86400);
    await q("update bobby_brief_idempotency set updated_at = now() - interval '61 seconds' where identity_id = $1 and idem_key = $2", [A, k2]);
    eq(await db.idemBegin(A, 'voice', k2, dg, 86400), { state: 'new' }, 'an abandoned in-progress request is taken over');
  }

  // ================================================================ purge
  {
    const A = await subscriber();
    const oldIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const p = period('weekly', -60 * 24 * 100 - i * 60 * 24, 30); // ~100+ days ago
      oldIds.push(await insertBrief(A, p));
    }
    const recent = await readyBrief(A);
    // Audio: one unlinked (old), one stale (unused 20 days, linked to a recent report), one fresh and linked.
    const unlinked = (await one(`insert into bobby_brief_audio (cache_key, voice, language, state, storage_path, bytes, created_at)
      values ($1, 'ash', 'en', 'ready', 'v1/aa/unlinked.mp3', 1, now() - interval '2 hours') returning id`, [sha(randomUUID())])).id;
    const staleKey = sha(randomUUID());
    const stale = (await db.requestAudio(A, recent.id, 1, 0, staleKey, voiceForCompanion(null), 'en') as { audioId: string }).audioId;
    await q("update bobby_brief_audio set state = 'ready', storage_path = 'v1/bb/stale.mp3', last_used_at = now() - interval '20 days' where id = $1", [stale]);
    const fresh = (await db.requestAudio(A, recent.id, 1, 1, sha(randomUUID()), voiceForCompanion(null), 'en') as { audioId: string }).audioId;
    // Old terminal and open rows elsewhere.
    await q(`insert into bobby_brief_provider_attempts (kind, work_ref, provider, model, worker, reserve_usd, state, created_at) values
      ('llm', 'old:1', 'openai', 'gpt-4o-mini', 'w', 0.01, 'settled', now() - interval '500 days'),
      ('llm', 'old:2', 'openai', 'gpt-4o-mini', 'w', 0.01, 'unknown', now() - interval '500 days')`);
    await q(`insert into bobby_brief_idempotency (identity_id, scope, idem_key, digest, expires_at, created_at) values
      ($1, 'device', 'old-key', $2, now() - interval '1 hour', now() - interval '30 hours')`, [A, sha('x')]);
    const retention = { reportDays: 90, audioDays: 14, outboxDays: 30, attemptDays: 400, deviceDays: 30, idempotencyHours: 24, sharedDays: 120, purgeBatch: 3 };
    const before = (await one('select count(*)::int as n from bobby_briefs where id = any($1)', [oldIds])).n;
    const r1 = await db.purge(retention);
    const after1 = (await one('select count(*)::int as n from bobby_briefs where id = any($1)', [oldIds])).n;
    eq([before, after1], [7, 4], 'purge is bounded: 3 of 7 old reports per call');
    eq(r1.storagePaths.sort(), ['v1/aa/unlinked.mp3', 'v1/bb/stale.mp3'], 'storage paths of the unlinked and the stale audio');
    eq((await one('select count(*)::int as n from bobby_brief_audio where id = any($1)', [[unlinked, stale]])).n, 0, '…those audio rows are gone');
    eq((await one('select count(*)::int as n from bobby_brief_audio where id = $1', [fresh])).n, 1, 'fresh, linked audio stays');
    await db.purge(retention); await db.purge(retention);
    eq((await one('select count(*)::int as n from bobby_briefs where id = any($1)', [oldIds])).n, 0, 'repeated calls finish the job');
    eq(await briefState(recent.id), 'ready', 'a recent report is never purged');
    eq((await q("select work_ref from bobby_brief_provider_attempts where work_ref like 'old:%' order by work_ref")).map((r) => r.work_ref), ['old:2'], 'old settled attempt purged; an unresolved one never');
    eq((await one("select count(*)::int as n from bobby_brief_idempotency where idem_key = 'old-key'")).n, 0, 'expired receipts purged');
    await rejects(db.purge({ ...retention, reportDays: 0 }), 'a zero retention is refused');
  }

  console.log(`briefings-pg: ${checks} checks passed`);
} finally {
  db.setBriefingRpc(null);
  await pool.end();
}
