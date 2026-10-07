// Local PostgreSQL verification of the iOS news-push schema and its transactional delivery guards.
// Synthetic fixtures only. This script refuses a remote DATABASE_URL and never calls APNs.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import * as briefDb from '../api/_lib/briefings/db.js';
import * as newsDb from '../api/_lib/push-news/db.js';
import { LANGUAGE_CAMPAIGN_ID, NEWS_LANGUAGES, type NewsFilters } from '../api/_lib/push-news/config.js';
import { campaignCohortId, campaignDigest } from '../api/_lib/push-news/worker.js';
import { assertLocalUrl, bootstrapBriefingsDb, makeIdentity, pgRpcTransport } from './briefings-pg-harness.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('push-news-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
assertLocalUrl(url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = join(root, 'supabase/bobby-protocol/supabase/migrations/20261007171622_ios_news_push.sql');
const pool: pg.Pool = await bootstrapBriefingsDb(url);
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const one = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let checks = 0;
const eq = (got: unknown, want: unknown, label: string) => { assert.deepEqual(got, want, label); checks++; };
const ok = (got: unknown, label: string) => { assert.ok(got, label); checks++; };
const rejects = async (p: Promise<unknown>, label: string, match?: RegExp) => { await assert.rejects(p, match ?? (() => true), label); checks++; };

// Supabase's table/function defaults are deliberately permissive during migration: the migration must revoke
// them itself. A signature-aware local RPC transport preserves PostgREST named-argument semantics.
interface Signature { args: Array<{ name: string; type: string }> }
let signatures = new Map<string, Signature>();
async function refreshSignatures() {
  const rows = await q(`select p.proname as name, p.proargnames as names,
    array(select format_type(t.oid, null) from unnest(p.proargtypes::oid[]) with ordinality t(oid, i) order by i) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'bobby\\_news\\_%'`);
  signatures = new Map();
  for (const r of rows) {
    assert.ok(!signatures.has(r.name), `unambiguous function signature: ${r.name}`);
    signatures.set(r.name, { args: r.types.map((type: string, i: number) => ({ name: r.names[i], type })) });
  }
}
async function rpc(name: string, body: Record<string, unknown>): Promise<any> {
  const sig = signatures.get(name);
  assert.ok(sig, `function exists: ${name}`);
  const known = new Set(sig.args.map((a) => a.name));
  for (const key of Object.keys(body)) assert.ok(known.has(key), `${name} rejects unknown argument ${key}`);
  const values: unknown[] = [], parts: string[] = [];
  for (const a of sig.args) {
    if (!(a.name in body)) continue;
    const value = body[a.name];
    values.push(a.type === 'jsonb' || a.type === 'json' ? value == null ? null : JSON.stringify(value) : value ?? null);
    parts.push(`${a.name} => $${values.length}::${a.type}`);
  }
  return (await one(`select public.${name}(${parts.join(', ')}) as r`, values))?.r ?? null;
}

async function applyMigration() {
  await q(`alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;`);
  try {
    await pool.query(readFileSync(migration, 'utf8'));
    await pool.query(readFileSync(migration, 'utf8'));
    checks += 2;
  } finally {
    await q(`alter default privileges in schema public revoke all on tables from anon, authenticated;
      alter default privileges in schema public revoke all on functions from anon, authenticated;
      alter default privileges in schema public revoke all on sequences from anon, authenticated;`);
  }
  await refreshSignatures();
}

try {
  await applyMigration();
  briefDb.setBriefingRpc(pgRpcTransport(pool));
  newsDb.setPushNewsRpc(rpc);
  const tables = ['bobby_news_settings', 'bobby_news_campaigns', 'bobby_news_deliveries'];
  await q(`truncate ${tables.map((table) => `public.${table}`).join(', ')} cascade`);
  await q('truncate public.bobby_push_devices cascade');
  await q('delete from public.bobby_identities');

  for (const table of tables) {
    for (const role of ['anon', 'authenticated']) for (const privilege of ['select', 'insert', 'update', 'delete']) {
      eq((await one('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, privilege])).r, false, `${role} cannot ${privilege} ${table}`);
    }
    for (const privilege of ['select', 'insert', 'update', 'delete']) {
      eq((await one('select has_table_privilege($1, $2, $3) as r', ['service_role', `public.${table}`, privilege])).r, true, `service role can ${privilege} ${table}`);
    }
    eq((await one('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).r, true, `${table} RLS enabled`);
  }
  const functions = await q(`select p.oid::regprocedure::text as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'bobby\\_news\\_%'`);
  eq(functions.length, 8, 'all eight news RPCs exist');
  for (const fn of functions) {
    for (const role of ['anon', 'authenticated']) {
      eq((await one('select has_function_privilege($1, $2, $3) as r', [role, fn.signature, 'execute'])).r, false, `${role} cannot execute ${fn.signature}`);
    }
    eq((await one('select has_function_privilege($1, $2, $3) as r', ['service_role', fn.signature, 'execute'])).r, true, `service role executes ${fn.signature}`);
    eq((await one(`select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = $1::regprocedure and a.grantee = 0) as r`, [fn.signature])).r, false, `PUBLIC cannot execute ${fn.signature}`);
  }
  for (const role of ['anon', 'authenticated']) {
    const connection = await pool.connect();
    try {
      await connection.query(`begin; set local role ${role}`);
      await rejects(connection.query('select * from public.bobby_news_settings'), `${role} actual table read denied`, /permission denied/);
    } finally { await connection.query('rollback'); connection.release(); }
    const second = await pool.connect();
    try {
      await second.query(`begin; set local role ${role}`);
      await rejects(second.query('select public.bobby_news_settings_get($1)', [randomUUID()]), `${role} actual RPC denied`, /permission denied/);
    } finally { await second.query('rollback'); second.release(); }
  }

  const defaults = { revision: 0, newsEnabled: false, language: 'en', consentVersion: null };
  const id = await makeIdentity(pool);
  eq(await newsDb.getSettings(id), defaults, 'new free account starts with product news off');
  eq(await newsDb.patchSettings(id, 99, { language: 'de' }, null), { ok: false, revision: 0 }, 'settings compare-and-swap rejects a stale revision');
  eq((await one('select count(*)::int as n from bobby_news_settings where identity_id=$1', [id])).n, 0, 'failed CAS does not create a settings row');
  for (const patch of [
    {}, { newsEnabled: true }, { newsEnabled: true, consentVersion: 0 }, { newsEnabled: true, consentVersion: 2 },
    { newsEnabled: true, consentVersion: null }, { newsEnabled: true, consentVersion: '1' },
    { newsEnabled: null }, { newsEnabled: 'true' }, { newsEnabled: 1 },
    { consentVersion: 1 }, { newsEnabled: false, consentVersion: 1 },
    { language: null }, { language: 'ja' }, { language: 7 }, { country: 'DE' }, { identityId: randomUUID() },
  ]) await rejects(newsDb.patchSettings(id, 0, patch, null), `direct RPC rejects invalid settings ${JSON.stringify(patch)}`);
  eq(await newsDb.getSettings(id), defaults, 'rejected consent payloads leave defaults intact');
  await rejects(newsDb.patchSettings(id, 0, { language: 'de' }, 'Germany'), 'country must be an observed ISO code');
  const enabled = await newsDb.patchSettings(id, 0, { newsEnabled: true, consentVersion: 1, language: 'de' }, 'DE');
  eq(enabled, { ok: true, settings: { revision: 1, newsEnabled: true, language: 'de', consentVersion: 1 } }, 'free account accepts current explicit consent');
  await rejects(q('update bobby_news_settings set consent_version=null where identity_id=$1', [id]), 'table constraints reject enabled news with NULL consent version');
  const country = await one('select country, country_source, country_observed_at, consent_at from bobby_news_settings where identity_id=$1', [id]);
  eq([country.country, country.country_source], ['DE', 'vercel-ip'], 'observed country retains its provenance');
  ok(country.country_observed_at && country.consent_at, 'consent and country have timestamps');
  await newsDb.patchSettings(id, 1, { newsEnabled: false }, null);
  eq(await newsDb.getSettings(id), { revision: 2, newsEnabled: false, language: 'de', consentVersion: null }, 'withdrawal clears current consent version');
  ok((await one('select withdrawn_at from bobby_news_settings where identity_id=$1', [id])).withdrawn_at, 'withdrawal is timestamped');
  const concurrent = await makeIdentity(pool);
  const saves = await Promise.all(Array.from({ length: 12 }, () => newsDb.patchSettings(concurrent, 0, { language: 'fr' }, 'FR')));
  eq(saves.filter((result) => result.ok).length, 1, 'concurrent settings updates admit exactly one revision');
  eq((await newsDb.getSettings(concurrent)).revision, 1, 'concurrent settings do not overwrite revisions');

  const allFilters = (identityId: string | null = null): NewsFilters => ({ languages: [...NEWS_LANGUAGES], countries: [], minAppBuild: 66, identityId });
  async function subscribe(language = 'de', country: string | null = 'DE') {
    const identity = await makeIdentity(pool);
    const saved = await newsDb.patchSettings(identity, 0, { newsEnabled: true, consentVersion: 1, language }, country);
    assert.ok(saved.ok);
    return identity;
  }
  async function device(identity: string, over: Partial<briefDb.DeviceWrite> = {}) {
    const proof = sha(randomBytes(32).toString('hex'));
    const installation = randomUUID();
    const write: briefDb.DeviceWrite = {
      tokenCiphertext: 'v1:' + randomBytes(48).toString('base64url'), tokenFingerprint: sha(randomUUID()),
      environment: 'production', topic: 'xyz.bobbyprotocol.bobby', permission: 'authorized', appBuild: 66, ...over,
    };
    const binding = await briefDb.registerDevice(identity, installation, write, proof, 10);
    assert.ok(binding.ok);
    return { id: (binding as { registrationId: string }).registrationId, revision: (binding as { bindingRevision: number }).bindingRevision, proof, installation, write };
  }
  async function campaign(identity: string, over: Partial<NewsFilters> = {}) {
    const campaignId = `test-${randomUUID()}`;
    const selected = { ...allFilters(identity), ...over };
    const prepared = await newsDb.prepare(campaignId, campaignDigest(selected), selected, id);
    assert.ok(prepared.ok && !prepared.empty, 'fixture campaign has an eligible recipient');
    return { campaignId, selected };
  }
  async function claimed(identity: string) {
    const setup = await campaign(identity);
    const row = await newsDb.claim(setup.campaignId);
    assert.equal(row.state, 'claimed');
    return { ...setup, row: row as newsDb.NewsClaim };
  }
  const delivery = (deliveryId: string) => one('select * from bobby_news_deliveries where id=$1', [deliveryId]);

  // OS permission, subscriptions and briefing preferences are separate from product-news consent.
  const noOptIn = await makeIdentity(pool);
  await device(noOptIn);
  await briefDb.patchSettings(noOptIn, 0, { weeklyEnabled: true });
  eq((await newsDb.audience(allFilters(noOptIn))).eligible, 0, 'weekly briefing and OS permission do not imply product-news consent');
  const eligible = await subscribe();
  await device(eligible);
  eq((await newsDb.audience(allFilters(eligible))).eligible, 1, 'a free opted-in account is eligible without paid Pro');
  for (const over of [
    { appBuild: 65 }, { environment: 'sandbox' as const }, { permission: 'denied' as const }, { permission: 'notDetermined' as const },
  ]) {
    const account = await subscribe();
    await device(account, over);
    eq((await newsDb.audience(allFilters(account))).eligible, 0, `audience excludes ${JSON.stringify(over)}`);
  }
  const provisional = await subscribe();
  await device(provisional, { permission: 'provisional' });
  eq((await newsDb.audience(allFilters(provisional))).eligible, 1, 'explicit consent plus provisional OS permission is eligible');
  const pt = await subscribe('pt-BR', 'BR');
  await device(pt);
  eq((await newsDb.audience({ ...allFilters(pt), languages: ['pt'] })).eligible, 0, 'Portugal filter does not collapse Brazilian Portuguese');
  eq((await newsDb.audience({ ...allFilters(pt), languages: ['pt-BR'], countries: ['BR'] })).eligible, 1, 'regional language and country filters both match');
  eq((await newsDb.audience({ ...allFilters(pt), countries: ['DE'] })).eligible, 0, 'country mismatch blocks a language match');
  const preview = await newsDb.audience(allFilters(pt));
  eq([preview.byLanguage, preview.byCountry], [{ 'pt-BR': 1 }, { BR: 1 }], 'preview aggregates only the selected audience');
  ok(!JSON.stringify(preview).includes('token'), 'preview contains no device tokens or ciphertext');

  // An empty preparation leaves the real id available; a nonempty preparation freezes recipients.
  const emptyCampaign = `test-${randomUUID()}`;
  const emptyFilters = allFilters(noOptIn);
  eq(await newsDb.prepare(emptyCampaign, campaignDigest(emptyFilters), emptyFilters, id), { ok: true, created: false, empty: true }, 'empty campaign does not consume its id');
  eq((await one('select count(*)::int as n from bobby_news_campaigns where id=$1', [emptyCampaign])).n, 0, 'empty preparation leaves no campaign row');
  const frozenIdentity = await subscribe();
  await device(frozenIdentity);
  const frozen = await campaign(frozenIdentity);
  await device(frozenIdentity);
  const repeated = await Promise.all(Array.from({ length: 12 }, () => newsDb.prepare(frozen.campaignId, campaignDigest(frozen.selected), frozen.selected, id)));
  ok(repeated.every((result) => result.ok && result.created === false), 'preparation replay is idempotent under concurrency');
  eq((await one('select count(*)::int as n from bobby_news_deliveries where campaign_id=$1', [frozen.campaignId])).n, 1, 'new devices do not enlarge frozen campaign recipients');
  eq((await newsDb.audience(frozen.selected, frozen.campaignId)).eligible, 1, 'existing frozen campaign preview excludes installations added later');
  const otherFilters = { ...frozen.selected, countries: ['FR'] };
  eq((await newsDb.prepare(frozen.campaignId, campaignDigest(otherFilters), otherFilters, id)).ok, false, 'same campaign id refuses changed filters');
  eq((await newsDb.prepare(frozen.campaignId, campaignDigest({ ...frozen.selected, identityId: pt }), { ...frozen.selected, identityId: pt }, id)).ok, false, 'same test UUID cannot retarget another account');
  const claims = await Promise.all(Array.from({ length: 16 }, () => newsDb.claim(frozen.campaignId)));
  eq(claims.filter((row) => row.state === 'claimed').length, 1, 'concurrent claimers reserve each installation once');
  const reserved = claims.find((row) => row.state === 'claimed') as newsDb.NewsClaim;
  eq((await delivery(reserved.id)).state, 'sending', 'claim durably marks sending before transport');
  eq(await rpc('bobby_news_delivery_authorize', { p_id: reserved.id, p_fence: null }), { ok: false }, 'NULL fence cannot bypass delivery authorization');
  eq(await rpc('bobby_news_delivery_result', { p_id: reserved.id, p_fence: null, p_outcome: 'accepted', p_apns_status: 200, p_reason: null, p_retry_seconds: 1 }), { ok: false }, 'NULL fence cannot forge acceptance');
  eq(await newsDb.authorize(reserved.id, reserved.fence + 1), { ok: false }, 'stale fence cannot authorize');
  ok((await newsDb.authorize(reserved.id, reserved.fence)).ok, 'current unchanged opted-in binding authorizes');
  await newsDb.result(reserved.id, reserved.fence, 'accepted', 200, null);
  eq(await newsDb.claim(frozen.campaignId), { state: 'empty' }, 'accepted delivery is never resent');
  eq(await newsDb.result(reserved.id, reserved.fence, 'retry', 500, 'late'), { ok: false }, 'late result cannot reopen accepted delivery');
  const changedPreviewAccount = await subscribe(); await device(changedPreviewAccount);
  const changedPreview = await campaign(changedPreviewAccount);
  await newsDb.patchSettings(changedPreviewAccount, 1, { language: 'de' }, null);
  eq((await newsDb.audience(changedPreview.selected)).eligible, 1, 'raw eligible count may remain after a settings revision changes');
  eq((await newsDb.audience(changedPreview.selected, changedPreview.campaignId)).eligible, 0, 'frozen preview excludes stale settings revision before claim');
  const reboundPreviewAccount = await subscribe(); const previewBinding = await device(reboundPreviewAccount);
  const reboundPreview = await campaign(reboundPreviewAccount);
  const reboundPreviewResult = await briefDb.rebindDevice(reboundPreviewAccount, previewBinding.id, previewBinding.revision, previewBinding.proof, sha(randomUUID()), previewBinding.write, 10);
  assert.ok(reboundPreviewResult.ok);
  eq((await newsDb.audience(reboundPreview.selected)).eligible, 1, 'raw eligible count may remain after device binding rotation');
  eq((await newsDb.audience(reboundPreview.selected, reboundPreview.campaignId)).eligible, 0, 'frozen preview excludes stale device binding before claim');

  for (const mutation of ['withdraw', 'language', 'revision', 'permission', 'build', 'environment', 'country', 'rebind', 'revoke'] as const) {
    const account = await subscribe();
    const binding = await device(account);
    const setup = await campaign(account, mutation === 'country' ? { countries: ['DE'] } : {});
    const row = await newsDb.claim(setup.campaignId) as newsDb.NewsClaim;
    if (mutation === 'withdraw') await newsDb.patchSettings(account, 1, { newsEnabled: false }, null);
    if (mutation === 'language') await newsDb.patchSettings(account, 1, { language: 'fr' }, null);
    if (mutation === 'revision') await newsDb.patchSettings(account, 1, { language: 'de' }, null);
    if (mutation === 'country') await q("update bobby_news_settings set country='FR' where identity_id=$1", [account]);
    if (mutation === 'permission') await q("update bobby_push_devices set permission='denied' where id=$1", [binding.id]);
    if (mutation === 'build') await q('update bobby_push_devices set app_build=65 where id=$1', [binding.id]);
    if (mutation === 'environment') await q("update bobby_push_devices set environment='sandbox' where id=$1", [binding.id]);
    if (mutation === 'revoke') await briefDb.revokeDevice(account, binding.id, binding.revision, binding.proof);
    if (mutation === 'rebind') {
      const other = await subscribe();
      const rebound = await briefDb.rebindDevice(other, binding.id, binding.revision, binding.proof, sha(randomUUID()), binding.write, 10);
      assert.ok(rebound.ok);
    }
    eq(await newsDb.authorize(row.id, row.fence), { ok: false }, `${mutation} after claim blocks authorization`);
    eq((await delivery(row.id)).state, 'cancelled', `${mutation} ends old delivery without transmitting`);
  }
  for (const outcome of ['ambiguous', 'crash'] as const) {
    const account = await subscribe(); await device(account);
    const { row, campaignId } = await claimed(account);
    if (outcome === 'ambiguous') await newsDb.result(row.id, row.fence, 'ambiguous', null, 'timeout');
    else await q("update bobby_news_deliveries set started_at=now()-interval '6 minutes' where id=$1", [row.id]);
    eq(await newsDb.claim(campaignId), { state: 'empty' }, `${outcome} is never reclaimed`);
    eq((await delivery(row.id)).state, 'unknown', `${outcome} records delivery uncertainty`);
  }
  const expiring = await subscribe(); await device(expiring);
  const expired = await campaign(expiring);
  await q("update bobby_news_campaigns set expires_at=now()-interval '1 minute' where id=$1", [expired.campaignId]);
  eq(await newsDb.claim(expired.campaignId), { state: 'empty' }, 'expired campaigns do not claim a device');
  eq((await newsDb.status(expired.campaignId)).expired, 1, 'expired recipients retain explicit state');
  const expireAfterClaim = await subscribe(); await device(expireAfterClaim);
  const expires = await claimed(expireAfterClaim);
  await q("update bobby_news_campaigns set expires_at=now()-interval '1 minute' where id=$1", [expires.campaignId]);
  eq(await newsDb.authorize(expires.row.id, expires.row.fence), { ok: false }, 'expiry immediately before transport blocks authorization');
  eq((await delivery(expires.row.id)).state, 'expired', 'expiry after reservation has its own terminal state');
  const retryAccount = await subscribe(); await device(retryAccount);
  const retryCampaign = await campaign(retryAccount);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const retry = await newsDb.claim(retryCampaign.campaignId) as newsDb.NewsClaim;
    assert.equal(retry.state, 'claimed');
    await newsDb.result(retry.id, retry.fence, 'retry', 503, 'ServiceUnavailable', 1);
    eq((await delivery(retry.id)).state, attempt < 3 ? 'pending' : 'failed', `safe transport retry ${attempt} is bounded`);
    await q('update bobby_news_deliveries set due_at=now() where id=$1', [retry.id]);
  }
  eq(await newsDb.claim(retryCampaign.campaignId), { state: 'empty' }, 'three failed safe attempts exhaust delivery');
  const invalid = await subscribe(); const invalidBinding = await device(invalid);
  const invalidClaim = await claimed(invalid);
  await newsDb.result(invalidClaim.row.id, invalidClaim.row.fence, 'invalid_token', 410, 'Unregistered');
  eq((await one('select status from bobby_push_devices where id=$1', [invalidBinding.id])).status, 'invalid', 'invalid token deactivates only the claimed binding');
  const rotated = await subscribe(); const rotatedDevice = await device(rotated);
  const oldAttempt = await claimed(rotated);
  ok((await newsDb.authorize(oldAttempt.row.id, oldAttempt.row.fence)).ok, 'old binding authorizes before a rotation');
  const rotation = await briefDb.rebindDevice(rotated, rotatedDevice.id, rotatedDevice.revision, rotatedDevice.proof, sha(randomUUID()), rotatedDevice.write, 10);
  assert.ok(rotation.ok);
  await newsDb.result(oldAttempt.row.id, oldAttempt.row.fence, 'invalid_token', 410, 'Unregistered');
  eq((await one('select status from bobby_push_devices where id=$1', [rotatedDevice.id])).status, 'active', 'late token failure cannot invalidate a newer binding');

  // Germany and France may be launched as independent groups; overlapping later/all groups cannot send the
  // announcement a second time to the same installation. Test UUIDs remain independent of the live family.
  const german = await subscribe('de', 'DE'); const germanDevice = await device(german);
  const french = await subscribe('fr', 'FR'); const frenchDevice = await device(french);
  const germanFilters = { ...allFilters(), countries: ['DE'] };
  const frenchFilters = { ...allFilters(), countries: ['FR'] };
  const germanCohort = campaignCohortId(LANGUAGE_CAMPAIGN_ID, germanFilters);
  const frenchCohort = campaignCohortId(LANGUAGE_CAMPAIGN_ID, frenchFilters);
  ok(germanCohort !== frenchCohort, 'different country groups get distinct stable cohort ids');
  const laterOptIn = await makeIdentity(pool); await device(laterOptIn);
  eq((await newsDb.prepare(germanCohort, campaignDigest(germanFilters), germanFilters, id)).ok, true, 'Germany group prepares successfully');
  eq((await newsDb.audience(germanFilters, germanCohort)).eligible, (await newsDb.audience(germanFilters)).eligible, 'Germany preview includes its own currently eligible pending recipients');
  const germanyFrozenCount = (await newsDb.audience(germanFilters, germanCohort)).eligible;
  await newsDb.patchSettings(laterOptIn, 0, { newsEnabled: true, consentVersion: 1, language: 'de' }, 'DE');
  eq((await newsDb.audience(germanFilters)).eligible, germanyFrozenCount + 1, 'new opt-in expands the raw eligible audience');
  eq((await newsDb.audience(germanFilters, germanCohort)).eligible, germanyFrozenCount, 'new opt-in cannot enlarge an existing frozen cohort preview');
  eq((await newsDb.audience(frenchFilters, frenchCohort)).eligible, (await newsDb.audience(frenchFilters)).eligible, 'France preview remains available after preparing Germany');
  eq((await newsDb.prepare(frenchCohort, campaignDigest(frenchFilters), frenchFilters, id)).ok, true, 'France group follows Germany without immutable-filter conflict');
  eq((await one('select count(*)::int as n from bobby_news_deliveries where campaign_id=$1 and installation_id=$2', [germanCohort, germanDevice.installation])).n, 1, 'German installation belongs to Germany group');
  eq((await one('select count(*)::int as n from bobby_news_deliveries where campaign_id=$1 and installation_id=$2', [frenchCohort, frenchDevice.installation])).n, 1, 'French installation belongs to France group');
  const entireAudience = allFilters();
  const allCohort = campaignCohortId(LANGUAGE_CAMPAIGN_ID, entireAudience);
  eq((await newsDb.prepare(allCohort, campaignDigest(entireAudience), entireAudience, id)).ok, true, 'overlapping all-countries group prepares remaining installations');
  eq((await one('select count(*)::int as n from bobby_news_deliveries where campaign_id=$1 and installation_id=any($2::uuid[])', [allCohort, [germanDevice.installation, frenchDevice.installation]])).n, 0, 'all group skips Germany/France installations already reserved');
  eq((await one('select count(*)::int as n from (select installation_id from bobby_news_deliveries where family_id=$1 group by installation_id having count(*)>1) x', [LANGUAGE_CAMPAIGN_ID])).n, 0, 'announcement family has one row per installation across every group');
  eq((await one('select count(*)::int as n from bobby_news_deliveries where family_id=$1', [LANGUAGE_CAMPAIGN_ID])).n, (await newsDb.audience(entireAudience)).eligible, 'union of independent groups covers each eligible installation exactly once');
  const overlappingGerman = { ...germanFilters, languages: ['de' as const] };
  const overlappingGermanCohort = campaignCohortId(LANGUAGE_CAMPAIGN_ID, overlappingGerman);
  eq((await newsDb.audience(overlappingGerman, overlappingGermanCohort)).eligible, 0, 'new overlapping Germany cohort reports zero remaining after the family reserved all installations');
  eq((await newsDb.audience(entireAudience, allCohort)).eligible, (await one("select count(*)::int as n from bobby_news_deliveries where campaign_id=$1 and state='pending'", [allCohort])).n, 'all preview shows only its own remaining pending recipients');
  await q("update bobby_news_deliveries set state='sent' where campaign_id=$1 and installation_id=$2", [germanCohort, germanDevice.installation]);
  await q("update bobby_news_deliveries set state='unknown' where campaign_id=$1 and installation_id=$2", [frenchCohort, frenchDevice.installation]);
  eq((await newsDb.audience(germanFilters, germanCohort)).eligible, (await one("select count(*)::int as n from bobby_news_deliveries where campaign_id=$1 and state='pending'", [germanCohort])).n, 'accepted recipients are excluded from their own remaining preview');
  eq((await newsDb.audience(frenchFilters, frenchCohort)).eligible, (await one("select count(*)::int as n from bobby_news_deliveries where campaign_id=$1 and state='pending'", [frenchCohort])).n, 'uncertain recipients are excluded from their own remaining preview');
  eq((await newsDb.audience(overlappingGerman, overlappingGermanCohort)).eligible, 0, 'accepted and uncertain family outcomes cannot reappear in another cohort preview');
  eq((await newsDb.prepare(germanCohort, campaignDigest(germanFilters), germanFilters, id)).created, false, 'same country group replays its stable frozen recipients');
  const testOne = await campaign(german), testTwo = await campaign(german);
  eq((await one('select count(*)::int as n from bobby_news_deliveries where campaign_id=any($1::text[]) and installation_id=$2', [[testOne.campaignId, testTwo.campaignId], germanDevice.installation])).n, 2, 'different authorized test UUIDs remain independent from each other and launch dedupe');

  const deleted = await subscribe(); await device(deleted); await campaign(deleted);
  await q('delete from bobby_identities where id=$1', [deleted]);
  eq((await one('select count(*)::int as n from bobby_news_settings where identity_id=$1', [deleted])).n, 0, 'account deletion clears private preferences');
  eq((await one('select count(*)::int as n from bobby_news_deliveries where identity_id=$1', [deleted])).n, 0, 'account deletion clears pending delivery records');
  console.log(`push-news-pg: ${checks} checks passed (local synthetic fixtures; no APNs calls)`);
} finally {
  briefDb.setBriefingRpc(null);
  newsDb.setPushNewsRpc(null);
  await pool.end();
}
